/**
 * syncAll.ts — Master Daily Sync Script
 *
 * Dynamically reads ALL companies from Supabase, routes each to the correct
 * ATS fetcher based on ats_provider, filters for UK and Ireland jobs, and
 * upserts to the jobs and jobs_IR tables.
 *
 * Adding a new company to the DB is all that's needed — this script picks it up
 * automatically on the next run. No code changes required.
 *
 * Supported ATS providers:
 *   greenhouse, ashby, lever, workable, teamtailor, bamboohr,
 *   smartrecruiters, pinpoint, breezy, recruitee, workday,
 *   personio, hibob, custom_scraper
 *
 * Special scrapers (run separately after ATS sync):
 *   Amazon, Goldman Sachs, Google, JPMC (handled via their scripts)
 *
 * Run: npx tsx src/scripts/syncAll.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { fetchCustom } from './customScrapers';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { inferJobLevel } from '../lib/inferJobLevel';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';
import { ensureSectorEmbeddingRuntime, resolveSectorEmbedding } from '../lib/sectorEmbeddingRuntime';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { isUKJob } from '../lib/ukFilter';
import { sanitizeJobTitle } from '../lib/sanitizeJobTitle';
import { getIngestRejectReason, isForeignEmployerJobUrl, isRelocateAbroadTitle } from '../lib/jobIngestGuards';
import { isLicenceTruthy, resolveSyncMarket } from '../lib/syncMarket';
import { isForeignLocationLeak } from '../lib/foreignLocationLeak';
import * as Adapters from '../lib/ukFilterAdapters';
import { isIrelandJob } from '../lib/irelandFilter';
import { refineVagueLocation, pickMostSpecificLocation, sanitizeJobLocation } from '../lib/refineLocation';
import { inferJobTypeFromListing, parseJobType, resolveJobType } from '../lib/parseJobType';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL.');
}
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Sync writes require the service role key when RLS is enabled.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SERPER_API_KEY = process.env.SERPER_API_KEY?.trim() || '';
let serperCallCount = 0;
let serperHitCount = 0;
let serperDisabled = false;
const SERPER_DISCOVERY_SITE_HINTS = [
    'site:boards.greenhouse.io',
    'site:job-boards.eu.greenhouse.io',
    'site:jobs.lever.co',
    'site:jobs.ashbyhq.com',
    'site:apply.workable.com',
    'site:jobs.smartrecruiters.com',
    'site:jobs.personio.de',
    'site:jobs.personio.com',
    'site:pinpointhq.com',
    'site:breezy.hr',
    'site:recruitee.com',
    'site:myworkdayjobs.com',
    'site:jobs.jobvite.com',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Job {
    title: string;
    location: string;
    url: string;
    department?: string;
    salary?: string;
    job_type?: string;
    verified?: boolean;
    needs_review?: boolean;
    rejection_reason?: string;
    atsProvider?: string;
    source?: string;
}

interface SyncResult {
    company: string;
    provider: string;
    fetched: number;
    ukJobs: number;
    irelandJobs: number;
    saved: number;
    savedIreland: number;
    rejected: number;
    needsReview: number;
    error?: string;
}

interface JobRow {
    company_id: number;
    title: string;
    location: string;
    url: string;
    department: string | null;
    level: string | null;
    sector: string | null;
    /** MiniLM + title memory; compare with sector. Never replaces sector. */
    sector_embedding: string | null;
    job_type: string;
    updated_at: string;
    last_seen_at: string;
    source?: 'ats' | 'linkedin';
}

/** Soft-delete grace: jobs not refreshed within this window are purged. */
const STALE_JOB_RETENTION_HOURS = 48;

// Rejection log array to track dropped jobs
interface RejectionLogEntry {
    company: string;
    provider: string;
    title: string;
    location: string;
    url: string;
    reason: string;
}
const globalRejectionLog: RejectionLogEntry[] = [];

export interface CompanyRow {
    id: number;
    trading_name: string;
    ats_provider: string;
    ats_board_token: string;
    careers_url?: string | null;
    url?: string | null;
    company_sector?: string | null;
    /** uk = default UK pipeline; ireland = write jobs_IR only; both = dual-write */
    sync_market?: 'uk' | 'ireland' | 'both' | null;
    /** From validate:ats — dead / needs_manual_review are skipped unless --include-dead-ats */
    ats_status?: string | null;
    /** UK Home Office licensed sponsor — required to write to `jobs` */
    licensed_sponsor?: boolean | null;
    /** Ireland employment-permit employer — required to write to `jobs_IR` */
    ireland_permit_employer?: boolean | null;
}

export { inferDefaultSyncMarket, resolveSyncMarket, isLicenceTruthy } from '../lib/syncMarket';

interface FilterLogEntry {
    company_id: string;
    job_url: string | null;
    raw_location: string | null;
    source: string;
    decision: string;
    reason: string | null;
    title: string | null;
    market: string | null;
    sync_run_id: string;
}

const filterLogBuffer: FilterLogEntry[] = [];

function stampAtsProvider(jobs: Job[], provider: string): Job[] {
    const p = String(provider || '').toLowerCase().trim();
    if (!p) return jobs;
    return jobs.map((j) => ({
        ...j,
        atsProvider: j.atsProvider || j.source || p,
    }));
}

function isAmbiguousRemoteLocation(loc: string | null | undefined): boolean {
    const l = String(loc || '').trim().toLowerCase();
    return !l || l === 'remote' || l === '(remote)';
}

async function flushFilterLogs(): Promise<number> {
    if (!filterLogBuffer.length) return 0;
    const rows = filterLogBuffer.splice(0, filterLogBuffer.length);
    let written = 0;
    for (const chunk of chunkArray(rows, 500)) {
        const { error } = await supabase.from('location_filter_log').insert(chunk);
        if (error) {
            // Older schema without reason/title/market — fold reason into decision
            if (/reason|title|market|schema cache|column/i.test(error.message)) {
                const slimFixed = chunk.map((r) => ({
                    company_id: r.company_id,
                    job_url: r.job_url,
                    raw_location: r.raw_location,
                    source: r.source,
                    decision: r.reason ? `${r.decision}:${r.reason}` : r.decision,
                    sync_run_id: r.sync_run_id,
                }));
                const { error: slimErr } = await supabase.from('location_filter_log').insert(slimFixed);
                if (slimErr) {
                    console.warn(`location_filter_log insert failed: ${slimErr.message}`);
                    continue;
                }
                written += slimFixed.length;
                continue;
            }
            console.warn(`location_filter_log insert failed: ${error.message}`);
            continue;
        }
        written += chunk.length;
    }
    return written;
}

interface AtsOverrideRow {
    company_id: number;
    sync_provider?: string | null;
    provider_raw?: string | null;
    board_token_raw?: string | null;
    careers_url_raw?: string | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Shared Playwright browser ────────────────────────────────────────────────
// All Playwright-based fetchers used to call chromium.launch()/browser.close()
// individually, paying full browser-process startup cost every single call.
// One browser is now launched lazily for the whole sync run; each fetcher gets
// its own isolated browser.newContext() (separate cookies/storage) and closes
// only that context, never the shared browser itself.
let sharedBrowserPromise: Promise<Browser> | null = null;

function getSharedBrowser(): Promise<Browser> {
    if (!sharedBrowserPromise) {
        sharedBrowserPromise = chromium.launch({
            headless: true,
            // Safe for every fetcher (not just Jacobs, which originally needed
            // these): reduces automation fingerprinting broadly, and --no-sandbox
            // avoids container/CI sandbox failures on AWS.
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        }).catch((err) => {
            sharedBrowserPromise = null; // allow a retry on the next call
            throw err;
        });
    }
    return sharedBrowserPromise;
}

async function closeSharedBrowser(): Promise<void> {
    if (!sharedBrowserPromise) return;
    try {
        const browser = await sharedBrowserPromise;
        await browser.close();
    } catch {
        // already closed / never started — nothing to do
    } finally {
        sharedBrowserPromise = null;
    }
}

export async function fetchWithTimeout(url: string, options: any = {}, timeout = 15000) {
    const controller = new AbortController();
    // Keep the abort timer running through the body read, not just headers
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        // Wrap body methods to clear timer after body is fully read
        const originalText = response.text.bind(response);
        const originalJson = response.json.bind(response);
        const originalBuffer = response.arrayBuffer.bind(response);
        (response as any).text = async () => { const r = await originalText(); clearTimeout(id); return r; };
        (response as any).json = async () => { const r = await originalJson(); clearTimeout(id); return r; };
        (response as any).arrayBuffer = async () => { const r = await originalBuffer(); clearTimeout(id); return r; };
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

const UK_COUNTRIES = ["UK", "United Kingdom", "GB", "GBR", "GBI", "GBRE", "Great Britain", "Rest of UK", "Remote", "Multi-location", "Multilocation", "UK-wide"];
const UK_NATIONS = ["scotland", "wales", "northern ireland", "england"];
const UK_CITIES = [
    // Major cities
    "london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh",
    "bristol", "liverpool", "nottingham", "sheffield", "cardiff", "belfast",
    "newcastle", "cambridge", "oxford", "reading", "brighton", "southampton",
    "coventry", "leicester", "york", "bath", "milton keynes", "derby",
    "portsmouth", "exeter", "plymouth", "aberdeen", "dundee", "stoke",
    "luton", "swindon", "warrington", "bolton", "rochdale", "sunderland",
    // Additional UK cities / towns
    "guildford", "woking", "slough", "watford", "harlow", "basildon",
    "chelmsford", "ipswich", "peterborough", "northampton", "worcester",
    "gloucester", "hereford", "shrewsbury", "telford", "chester", "carlisle",
    "durham", "middlesbrough", "hull", "lincoln", "swansea", "newport",
    "inverness", "stirling", "perth", "derry", "lisburn", "truro",
    "salisbury", "winchester", "chichester", "crawley", "horsham",
    "guildford", "richmond", "twickenham", "wimbledon", "croydon",
    "canary wharf", "city of london", "knutsford", "radbroke",
    "wokingham", "bracknell", "basingstoke", "aldershot", "farnborough",
    "bournemouth", "poole", "dorchester", "weymouth", "yeovil",
    "taunton", "barnstaple", "torquay", "paignton", "newquay",
    // Regions
    "midlands", "yorkshire", "lancashire", "cornwall", "devon", "east anglia",
    "home counties", "south east", "south west", "north east", "north west",
    "cotswolds", "chilterns", "pennines", "highlands", "lowlands",
    // Channel Islands / Crown dependencies (genuinely UK-adjacent for jobs purposes)
    "jersey", "guernsey", "isle of man",
    // Finance hubs
    "london ec", "london wc", "london e1", "london e14", "london se1",
    "st. albans", "st albans", "stratford-upon-avon", "stratford upon avon"
];

// Workday-specific UK country facet IDs (they vary by tenant)
const WORKDAY_UK_FACETS: Record<string, string> = {
    'default': '29247e57dbaf46fb855b224e03170bc7'
};

// Irish cities/towns that must be blocked (not UK)
const IRELAND_LOCATIONS = [
    "cork", "galway", "limerick", "waterford", "wexford", "kilkenny",
    "drogheda", "swords", "bray", "ennis", "tralee", "carlow", "clonmel",
    "mullingar", "sligo", "athlone", "republic of ireland", "eire"
];

function normalizeLocation(str: string): string {
    return String(str || '')
        .toLowerCase()
        .replace(/[()\[\]]/g, '')
        .replace(/[\/\-_|,;]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

export function buildLocationInput(job: Job) {
    const raw = job.location ?? '';
    const parts = raw.split(/\s*[|·•]\s*/).map((s: string) => s.trim()).filter(Boolean);
    const locs = parts.length > 0 ? parts : (raw ? [raw] : []);
    // Scrapers sometimes stamp a fake "London" while the true geography
    // only appears in the title ("… Barcelona, Spain added … View job").
    const title = String(job.title || '').trim();
    if (title) locs.push(title);
    return {
        locations: locs,
        isRemote: /\bremote\b/i.test(raw) || /\bremote\b/i.test(title),
        // Workday UK-facet results set verified=true when the country facet is trusted.
        isTrustedSource: !!job.verified,
    };
}

async function buildRowsForJobs(company: CompanyRow, companyId: number, jobs: Job[], market: 'uk' | 'ireland' = 'uk'): Promise<JobRow[]> {
    if (!jobs.length) return [];

    const dedupedJobs = new Map<string, Job>();
    for (const j of jobs) {
        if (!j.url || !j.title) continue;
        const dedupKey = `${companyId}_${j.title.toLowerCase().trim()}_${(j.location || '').toLowerCase().trim()}`;
        if (!dedupedJobs.has(dedupKey) && !Array.from(dedupedJobs.values()).some(existing => existing.url === j.url)) {
            dedupedJobs.set(dedupKey, j);
        }
    }

    const uniqueJobs = Array.from(dedupedJobs.values());
    if (!uniqueJobs.length) return [];

    const rawLocations = uniqueJobs.map(j => j.location ?? '');
    const normalizedLocs = await normalizeLocationsViaPython(rawLocations, market);
    const normalizedMap = new Map<string, NormalizedLocation>();
    for (let i = 0; i < uniqueJobs.length; i++) {
        const n = normalizedLocs[i];
        if (n) normalizedMap.set(uniqueJobs[i].url, n);
    }

    // Re-validate the *stored* location string. Dual-office posts can pass the
    // pre-filter (e.g. "London | Amsterdam") then normalize down to a foreign
    // city — that is exactly how Amsterdam/US rows reappeared after cleanup.
    const rows: JobRow[] = [];
    for (const j of uniqueJobs) {
        const n = normalizedMap.get(j.url);
        const raw = safeStr(j.location, 255);
        const targetCountry = market === 'ireland' ? 'Ireland' : 'United Kingdom';
        // Python resolved a foreign country (Durham NC → United States). Never
        // persist the UK/Ireland namesake city.
        if (n?.country && n.country !== targetCountry) {
            continue;
        }
        let cleanedLocation = n
            ? (formatNormalizedLocation(n) ?? raw)
            : raw;

        const locationPasses = (loc: string) =>
            market === 'uk'
                ? isUKJob(buildLocationInput({ location: loc, title: j.title } as Job))
                : isIrelandJob(loc);

        // Prefer a city-bearing fragment when ATS emitted a multi-part / country-only string.
        const rawParts = raw.split(/\s*[|;/]\s*/).map((s) => s.trim()).filter(Boolean);
        if (rawParts.length > 1) {
            const specific = pickMostSpecificLocation(rawParts, market);
            if (specific && locationPasses(specific)) {
                cleanedLocation = specific;
            }
        }

        cleanedLocation = refineVagueLocation(cleanedLocation, j.title, j.url, market);
        cleanedLocation = sanitizeJobLocation(cleanedLocation, market, j.title, j.url);

        if (!locationPasses(cleanedLocation)) {
            if (!locationPasses(raw)) continue;
            // Keep the row with the original text when normalization dropped UK offices
            // to a foreign city — never persist the vague "Multiple Locations" placeholder.
            cleanedLocation = raw;
            if (!locationPasses(cleanedLocation)) continue;
        }

        if (
            isForeignLocationLeak(
                { location: cleanedLocation, title: j.title, url: j.url },
                market,
            ) ||
            isForeignLocationLeak({ location: raw, title: j.title, url: j.url }, market)
        ) {
            continue;
        }

        // Some ATS providers (Workday, Oracle Cloud, several custom scrapers)
        // structurally don't expose a department field in their feed at all.
        // Classify from the raw ATS department (so GTM → Sales), then persist
        // only allowlisted sector terms. Unknown/junk departments fall back
        // to the inferred sector so the UI never shows blank/null.
        const rawDept = j.department ? safeStr(j.department, 255) : '';
        const cleanTitle = sanitizeJobTitle(safeStr(j.title));
        const sector_embedding = await resolveSectorEmbedding(cleanTitle);
        const { sector, department } = classifyJobTaxonomy(
            cleanTitle,
            rawDept || null,
            company.company_sector,
            sector_embedding,
        );
        const nowIso = new Date().toISOString();
        const level = inferJobLevel(safeStr(j.title));

        rows.push({
            company_id: companyId,
            title: safeStr(cleanTitle, 255),
            location: safeStr(cleanedLocation, 255),
            url: j.url,
            department,
            level,
            sector,
            sector_embedding,
            job_type: resolveJobType({
                employment: j.job_type,
                title: cleanTitle,
                level,
            }),
            updated_at: nowIso,
            last_seen_at: nowIso,
        });
    }
    return rows;
}

function isUKLocation(loc: any): boolean {
    if (!loc) return false;
    const normalized = normalizeLocation(loc);
    if (!normalized) return false;

    // console.log(`      [isUKLocation] Normalized: "${normalized}"`);

    // Hard block: bare "remote" with no explicit UK signal → not UK
    // e.g. "Remote", "Anywhere", "Remote - Worldwide" all fail
    if (/^remote$/.test(normalized) || normalized === 'anywhere' || normalized === 'worldwide') {
        return false;
    }

    // Gap 5: Ireland Hybrid Roles
    // Hard block: Irish locations (Republic of Ireland, NOT Northern Ireland)
    // Only block if there is NO UK signal
    for (const irish of IRELAND_LOCATIONS) {
        if (normalized.includes(irish) && !normalized.includes('northern ireland')) {
            const hasUkSignal = UK_COUNTRIES.some(uk => normalized.includes(uk.toLowerCase())) ||
                UK_NATIONS.some(n => normalized.includes(n.toLowerCase())) ||
                UK_CITIES.some(c => normalized.includes(c.toLowerCase()));
            if (!hasUkSignal) {
                return false;
            }
        }
    }

    // Hard block: well-known non-UK phrases
    const blockList = [
        "ukraine", "new york", "new jersey", "new south wales", "new england",
        "united states", "usa", "u.s.a", "u.s.", "u.s", "india", "canada", "australia", "germany",
        "france", "netherlands", "singapore", "hong kong", "dubai",
        "massachusetts", "california", "texas", "florida", "washington state"
    ];
    for (const blocked of blockList) {
        // Special carve-out: "northern ireland" must not be blocked by "ireland"
        if (blocked === 'ireland' && normalized.includes('northern ireland')) continue;
        if (normalized.includes(blocked)) return false;
    }

    // Hard block: US state/country 2-letter codes as isolated tokens
    if (/\b(usa?|ny|nj|ca|tx|ma|il|wa|fl|ga|nc|va|pa|oh|mi|mn|co|az|or|nv|md|va|pa|oh|mi|mn|co|az|or|nv|vt|nh|me|ct|ri|ky|tn|nc|sc|ga|fl|al|ms|la|ar|ok|ks|ne|sd|nd|mt|wy|id|ut|nm)\b/.test(normalized)) {
        // But allow "wa" only if surrounded by full UK context (e.g., "wa1" postcodes)
        // Postcode pattern: letters+digits — if it looks like a UK postcode don't block
        if (!/\b[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b/.test(normalized)) {
            return false;
        }
    }

    // ✅ UK Remote — explicit UK remote signal
    if (normalized.includes('remote') && (
        normalized.includes('uk') || normalized.includes('united kingdom') ||
        normalized.includes('england') || normalized.includes('britain')
    )) {
        return true;
    }

    // ✅ Token-level match against known UK countries/nations/cities
    const tokens = normalized.split(/\s+/);
    for (const token of tokens) {
        if (UK_COUNTRIES.includes(token)) return true;
        if (UK_NATIONS.includes(token)) return true;
        if (UK_CITIES.includes(token)) return true;
    }

    // ✅ Word-boundary match for England specifically
    if (/\bengland\b/.test(normalized)) return true;

    // ✅ UK postcode pattern (e.g., "EC2V 8RF", "W1A 1AA", "SW1A 2AA")
    if (/\b[a-z]{1,2}\d[a-z\d]?\s?\d[a-z]{2}\b/.test(normalized)) return true;

    // ✅ Multi-word phrase match for city names with spaces
    const multiWordUK = [
        ...UK_COUNTRIES, ...UK_NATIONS, ...UK_CITIES
    ].filter(w => w.includes(' '));
    for (const phrase of multiWordUK) {
        if (normalized.includes(phrase)) return true;
    }

    return false;
}

function safeStr(s: any, maxLen = 500): string {
    return String(s || '').slice(0, maxLen);
}

const LOW_PROFILE_TITLE_PATTERN = /\b(customer (assistant|team member|colleague|care advi[cs]or)|sales assistant|store assistant|shop assistant|checkout (operator|assistant|colleague)|night fill|shelf (stacker|filler|colleague)|replenishment (assistant|colleague|operator)|van driver|delivery driver|picker|packer|warehouse (operative|assistant|colleague)|stock (replenishment|assistant|colleague)|counter assistant|retail (assistant|adviser|advisor|store manager|sales advi[cs]or|advi[cs]or)|store manager|assistant store manager|visual merchandis|till operator|shop floor|consumer sales advi[cs]or|webchat sales advi[cs]or|barista|bar staff|waiter|waitress|food runner|kitchen (porter|assistant|crew)|dishwasher|clean(er|ers|ing)\b|cleaning (operative|supervisor|team leader|manager|coordinator|assistant|technician|controller|inspector)|hgv driver|security (guard|officer|operative|supervisor|team leader|warden|patrol)|(relief|mobile|static|door|night|site) security (officer|guard|operative)|cctv (operator|officer|monitor)|door supervisor|crowd steward|event steward|match day steward|housekeeper|housekeeping|waste (operative|collector|handler|driver|technician)|janitor|caretaker|groundsman|groundswoman|grounds maintenance|groundskeeper|window clean|pest control|laundry (operative|assistant)|room attendant|maintenance operative|car park (attendant|operative|marshal)|parking (attendant|warden|marshal)|domestic (operative|assistant|services team)|porter(?! manage))\b/i;

/** Returns a reject reason code, or null if the title is acceptable. */
export function getJobTitleRejectReason(title: string): string | null {
    if (!title || title.length < 3) return 'title_too_short';
    const lower = title.toLowerCase().trim();
    const junk = [
        'see all jobs', 'view all jobs', 'all jobs', 'all openings', 'join our team',
        'back to search', 'back to job list', 'search for jobs', 'explore opportunities',
        'show more', 'filter by', 'sort by', 'cookie policy', 'privacy policy',
        'terms of use', 'contact us', 'about us', 'careers home', 'learn more',
        'get started', 'apply now', 'view details', 'view job', 'read more',
        'open positions', 'current openings', 'our roles', 'work with us',
        'explore careers', 'early careers', 'experienced hires', 'alumni',
        'jobs and careers', 'careers', 'our vacancies', 'view vacancies', 'vacancies', 'details', 'view details & apply',
        'view role ↗', 'more detail'
    ];
    if (junk.includes(lower)) return 'title_junk';
    if (lower.length < 40 && junk.some(j => lower.startsWith(j))) return 'title_junk';
    // AECOM/Canva/Airwallex etc. post "Relocate to Australia/Singapore" with a UK interview city
    if (isRelocateAbroadTitle(title)) {
        return 'title_relocate_abroad';
    }
    if (LOW_PROFILE_TITLE_PATTERN.test(title)) return 'title_low_profile';
    return null;
}

export function isValidJobTitle(title: string): boolean {
    return getJobTitleRejectReason(title) === null;
}

// ─── Provider Alias Map ──────────────────────────────────────────────────────
// Maps raw provider names (from DB/Excel) to canonical FETCHERS keys
const PROVIDER_ALIAS: Record<string, string> = {
    'ashbyhq': 'ashby',
    'pinpointhq': 'pinpoint',
    'breezyhr': 'breezy',
    'smart_recruiters': 'smartrecruiters',
    'smart recruiters': 'smartrecruiters',
    'team_tailor': 'teamtailor',
    'workday_enterprise': 'workday',
    'oracle_cloud': 'oracle_cloud',
    'ultipro': 'ultipro_html',
    'successfactors': 'successfactors',
};

// Custom company token → fetcher routing
const CUSTOM_TOKEN_ROUTES: Array<{ pattern: RegExp; fetcher: string }> = [
    { pattern: /jpmc\.fa\.oraclecloud|jpmorgan|jpmorganchase/i, fetcher: 'jpmc' },
    { pattern: /higher\.gs\.com|goldman.?sachs/i, fetcher: 'goldmansachs' },
    { pattern: /amazon\.jobs/i, fetcher: 'amazon' },
    { pattern: /google\.com\/about\/careers/i, fetcher: 'google' },
    { pattern: /jobs\.apple\.com/i, fetcher: 'apple' },
    { pattern: /metacareers\.com/i, fetcher: 'meta' },
    { pattern: /jobs\.nhs\.uk|nhs/i, fetcher: 'nhs' },
    { pattern: /publicisgroupe\.com/i, fetcher: 'publicis' },
    { pattern: /linkedin\.com/i, fetcher: 'linkedin' },
    { pattern: /jobs\.arup\.com|arup\.com/i, fetcher: 'arup' },
    { pattern: /jobs\.bt\.com|careers\.bt\.com/i, fetcher: 'btgroup' },
    { pattern: /jobs\.siemens\.com|siemens\.avature/i, fetcher: 'siemens' },
    { pattern: /vorboss\.com/i, fetcher: 'vorboss' },
    { pattern: /jobs\.gxo\.com|gxo\.com/i, fetcher: 'gxo' },
    { pattern: /royalmailgroup\.com|royal.?mail/i, fetcher: 'royalmail' },
    { pattern: /astrazeneca\.com|astrazeneca/i, fetcher: 'astrazeneca' },
    { pattern: /careers\.lilly\.com/i, fetcher: 'phenom' },
];

function normalizeProviderName(value: string | null | undefined): string | null {
    if (!value) return null;
    const raw = String(value).trim().toLowerCase().replace(/\s+/g, '_');
    return PROVIDER_ALIAS[raw] ?? raw;
}

// Resolve which fetcher key + token to use, accounting for aliases and custom routing
export function resolveProviderAndToken(
    ats_provider: string | null,
    ats_board_token: string | null,
    careers_url: string | null
): { provider: string; token: string } | null {
    const rawProvider = String(ats_provider || '').trim();
    const rawToken = String(ats_board_token || '').trim();
    const rawUrl = String(careers_url || '').trim();

    // Handle 'custom' provider — route by token / URL content
    if (rawProvider.toLowerCase() === 'custom' || rawProvider.toLowerCase() === 'custom_site') {
        const lookupStr = rawToken || rawUrl;
        for (const route of CUSTOM_TOKEN_ROUTES) {
            if (route.pattern.test(lookupStr)) {
                return { provider: route.fetcher, token: lookupStr };
            }
        }
        // Route everything else marked as custom to our generic custom fetcher
        return { provider: 'custom', token: lookupStr };
    }

    // Normalize provider and apply alias
    const provider = normalizeProviderName(rawProvider) || '';

    if (
        (provider === 'pinpoint' || provider === 'custom') &&
        /astrazeneca/i.test(`${rawToken} ${rawUrl}`)
    ) {
        return { provider: 'astrazeneca', token: rawToken || rawUrl || 'astrazeneca' };
    }

    // Workday: if token is just a subdomain (no '/'), build token from URL
    if (provider === 'workday' && rawToken && !rawToken.includes('/')) {
        const urlForParsing = normalizeCareersUrl(rawUrl || rawToken);
        if (urlForParsing) {
            try {
                const parsed = new URL(urlForParsing);
                const pathParts = parsed.pathname.split('/').filter(Boolean).filter(p => !/^[a-z]{2}-[a-z]{2}$/i.test(p));
                // URL format: subdomain.wdN.myworkdayjobs.com/BoardName/...
                let boardName = '';
                let subdomain = '';

                const hostParts = parsed.hostname.split('.');
                if (hostParts[0] && !hostParts[0].startsWith('wd')) {
                    subdomain = hostParts[0];
                    boardName = pathParts[0] || '';
                } else if (pathParts.length >= 2) {
                    subdomain = pathParts[0];
                    boardName = pathParts[1];
                }

                if (subdomain && boardName) {
                    return { provider: 'workday', token: `${subdomain}/${boardName}` };
                }
            } catch { /* ignore parse errors */ }
        }
        return { provider: 'workday', token: rawToken };
    }

    // Oracle Cloud: if token doesn't specify site, but URL does, use URL so fetcher can extract the correct site
    if (provider === 'oracle_cloud' && !rawToken.includes('/') && !rawToken.includes('|') && rawUrl) {
        return { provider, token: rawUrl };
    }

    const result = (provider && rawToken) ? { provider, token: rawToken } : null;
    // console.log(`[RESOLVE] ${ats_provider} -> ${result?.provider || 'none'}`);
    return result;
}

function normalizeCareersUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

type FetchAttempt = {
    provider: string;
    token: string;
    source: 'primary' | 'fallback' | 'serper';
};

function inferAtsFromCareersUrl(url: string | null | undefined): { provider: string; token: string } | null {
    const normalizedUrl = normalizeCareersUrl(url);
    if (!normalizedUrl) return null;

    try {
        const parsed = new URL(normalizedUrl);
        const host = parsed.hostname.toLowerCase();
        const parts = parsed.pathname.split('/').filter(Boolean);

        if (host === 'boards.greenhouse.io' || host === 'job-boards.eu.greenhouse.io') {
            const token = parts[0] || parsed.searchParams.get('for') || '';
            return token ? { provider: 'greenhouse', token } : null;
        }
        if (host.includes('ashbyhq.com')) {
            const token = parts[0] || '';
            return token ? { provider: 'ashby', token } : null;
        }
        if (host.includes('lever.co')) {
            const token = parts[0] || '';
            return token ? { provider: 'lever', token } : null;
        }
        if (host.includes('workable.com')) {
            const token = host.split('.')[0] || '';
            return token ? { provider: 'workable', token } : null;
        }
        if (host.includes('teamtailor.com')) {
            const token = host.split('.')[0] || '';
            return token ? { provider: 'teamtailor', token } : null;
        }
        if (host.includes('bamboohr.com')) {
            const token = host.split('.')[0] || '';
            return token ? { provider: 'bamboohr', token } : null;
        }
        if (host.includes('smartrecruiters.com')) {
            const token = parts[0] || host.split('.')[0] || '';
            return token ? { provider: 'smartrecruiters', token } : null;
        }
        if (host.includes('pinpointhq.com')) {
            const token = host.split('.')[0] || '';
            return token ? { provider: 'pinpoint', token } : null;
        }
        if (host.includes('breezy.hr')) {
            const token = host.split('.')[0] || '';
            return token ? { provider: 'breezy', token } : null;
        }
        if (host.includes('recruitee.com')) {
            const token = host.split('.')[0] || '';
            return token ? { provider: 'recruitee', token } : null;
        }
        if (host.includes('jobs.personio.de') || host.includes('jobs.personio.com')) {
            const token = host.split('.')[0] || '';
            return token ? { provider: 'personio', token } : null;
        }
        if (host.includes('icims.com')) {
            const token = host.split('.')[0] || '';
            return token ? { provider: 'icims', token } : null;
        }
        if (host.includes('eightfold.ai')) {
            const domainParam = parsed.searchParams.get('domain');
            if (domainParam) {
                return { provider: 'eightfold', token: `${host}|${domainParam}` };
            } else {
                const tenant = host.split('.')[0];
                return { provider: 'eightfold', token: `${host}|${tenant}.com` };
            }
        }
        if (host.includes('myworkdayjobs.com')) {
            // company.wdN.myworkdayjobs.com/BoardName
            // or wdN.myworkdayjobs.com/company/BoardName
            const cleanParts = parts.filter(p => !/^[a-z]{2}-[a-z]{2}$/i.test(p));
            const hostParts = host.split('.');
            let subdomain = '';
            let boardName = '';
            if (hostParts[0] && !hostParts[0].startsWith('wd')) {
                subdomain = hostParts[0];
                boardName = cleanParts[0] || '';
            } else if (cleanParts.length >= 2) {
                subdomain = cleanParts[0];
                boardName = cleanParts[1];
            }
            if (subdomain && boardName) {
                return { provider: 'workday', token: `${subdomain}/${boardName}` };
            }
            return { provider: 'workday', token: normalizedUrl };
        }
    } catch {
        return null;
    }

    return { provider: 'generic_careers', token: normalizedUrl };
}

async function serperSearchLinks(query: string, num = 8): Promise<string[]> {
    if (!SERPER_API_KEY || serperDisabled) return [];
    serperCallCount++;

    try {
        const res = await fetchWithTimeout('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': SERPER_API_KEY,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            },
            body: JSON.stringify({ q: query, num, gl: 'gb' }),
        }, 12000);

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                serperDisabled = true;
                console.warn(`[SERPER] disabled after auth failure (${res.status})`);
            }
            return [];
        }

        const data: any = await res.json();
        const links: string[] = [];
        const seen = new Set<string>();

        const pushLink = (value: any): void => {
            const normalized = String(value || '').trim();
            if (!/^https?:\/\//i.test(normalized)) return;
            if (seen.has(normalized)) return;
            seen.add(normalized);
            links.push(normalized);
        };

        for (const item of data?.organic || []) {
            pushLink(item?.link);
        }

        pushLink(data?.answerBox?.link);
        pushLink(data?.answerBox?.website);
        pushLink(data?.knowledgeGraph?.website);
        pushLink(data?.knowledgeGraph?.descriptionLink);

        if (links.length > 0) serperHitCount++;
        return links;
    } catch {
        return [];
    }
}

function buildSerperDiscoveryQueries(company: CompanyRow): string[] {
    const name = company.trading_name.trim();
    const escapedName = name.replace(/\"/g, '');
    const queries = [
        `"${escapedName}" careers`,
        `"${escapedName}" jobs`,
        `"${escapedName}" apply`,
        `"${escapedName}" hiring careers`,
        `"${escapedName}" work with us`,
        `"${escapedName}" careers UK`,
        `"${escapedName}" jobs UK`,
    ];

    try {
        if (company.url) {
            const host = new URL(company.url).hostname.toLowerCase().replace(/^www\./, '');
            if (host) {
                queries.unshift(`site:${host} careers`);
                queries.unshift(`"${escapedName}" site:${host}`);
            }
        }
    } catch {
        // Ignore malformed company URLs.
    }

    for (const siteHint of SERPER_DISCOVERY_SITE_HINTS) {
        queries.push(`"${escapedName}" ${siteHint}`);
    }

    return Array.from(new Set(queries)).slice(0, 16);
}

function isLikelyCareersDiscoveryUrl(url: string, company: CompanyRow): boolean {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        const path = `${parsed.pathname} ${parsed.search}`.toLowerCase();

        if (
            host.includes('greenhouse.io') ||
            host.includes('lever.co') ||
            host.includes('ashbyhq.com') ||
            host.includes('workable.com') ||
            host.includes('smartrecruiters.com') ||
            host.includes('teamtailor.com') ||
            host.includes('personio.') ||
            host.includes('pinpointhq.com') ||
            host.includes('breezy.hr') ||
            host.includes('recruitee.com') ||
            host.includes('myworkdayjobs.com') ||
            host.includes('jobvite.com')
        ) {
            // Any Greenhouse/Lever/etc. URL is not automatically this company.
            // Serper once attached Pulse Healthcare's entire board to Digital Autopsy UK.
            return !isForeignEmployerJobUrl(url, company);
        }

        if (company.url) {
            const companyHost = new URL(company.url).hostname.toLowerCase().replace(/^www\./, '');
            if (companyHost && host === companyHost) {
                return true;
            }
        }

        return /careers?|jobs?|vacanc|opportunit|apply|join|talent|work-with-us|open-roles/.test(path);
    } catch {
        return false;
    }
}

async function discoverCareersUrlsWithSerper(company: CompanyRow): Promise<string[]> {
    if (!SERPER_API_KEY || serperDisabled) return [];

    const queries = buildSerperDiscoveryQueries(company);

    const found = new Set<string>();
    for (const query of queries) {
        const links = await serperSearchLinks(query, 10);
        for (const link of links) {
            const normalized = normalizeCareersUrl(link);
            if (!normalized) continue;
            if (!isLikelyCareersDiscoveryUrl(normalized, company)) continue;
            found.add(normalized);
        }
        if (found.size >= 8) break;
    }

    return Array.from(found).slice(0, 8);
}

function absoluteUrlFromBase(base: string, href: string): string {
    try {
        return new URL(href, base).toString();
    } catch {
        return href;
    }
}

async function fetchGenericCareersPage(url: string): Promise<Job[]> {
    const target = normalizeCareersUrl(url);
    if (!target) return [];

    try {
        const res = await fetchWithTimeout(target, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0',
            },
        }, 15000);

        if (!res.ok) return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const jobs: Job[] = [];

        $('script[type="application/ld+json"]').each((_, el) => {
            const text = $(el).text().trim();
            if (!text) return;
            try {
                const parsed = JSON.parse(text);
                const entries = Array.isArray(parsed) ? parsed : [parsed];
                for (const entry of entries) {
                    if (!entry || entry['@type'] !== 'JobPosting') continue;
                    const locationObj = entry.jobLocation?.address || {};
                    const location = [
                        locationObj.addressLocality,
                        locationObj.addressRegion,
                        locationObj.addressCountry,
                    ].filter(Boolean).join(', ');

                    jobs.push({
                        title: String(entry.title || '').trim(),
                        location: String(location || '').trim(),
                        url: String(entry.url || target).trim(),
                        department: '',
                        salary: undefined,
                        job_type: parseJobType(entry.employmentType || entry.jobLocationType)
                    });
                }
            } catch {
                // ignore invalid JSON-LD blocks
            }
        });

        const selectors = ['a[href*="/jobs/"]', 'a[href*="/job/"]', 'a[href*="/careers/"]'];
        const seen = new Set<string>();

        for (const selector of selectors) {
            $(selector).each((_, el) => {
                const anchor = $(el);
                const href = String(anchor.attr('href') || '').trim();
                const title = anchor.text().replace(/\s+/g, ' ').trim();
                if (!href || !isValidJobTitle(title)) return;

                const jobUrl = absoluteUrlFromBase(target, href);
                if (seen.has(jobUrl)) return;
                seen.add(jobUrl);

                const cardText = anchor.closest('li,article,div,tr').text().replace(/\s+/g, ' ').trim();
                // Do NOT invent "London" just because the page mentions UK somewhere
                // (Molten portfolio pages did this and poisoned location).
                let location = '';
                const locMatch = cardText.match(
                    /\b((?:Remote[, ]*)?(?:United Kingdom|UK)|London(?:[, ]+(?:UK|United Kingdom))?|Manchester|Birmingham|Leeds|Edinburgh|Glasgow|Bristol|Cambridge|Oxford)\b/i,
                );
                // Only keep location if it appears as a short trailing geo cue, not anywhere in a long card.
                if (locMatch && cardText.length < 220) {
                    location = locMatch[0];
                }

                jobs.push({
                    title: sanitizeJobTitle(title),
                    location,
                    url: jobUrl,
                    department: '',
                    salary: undefined,
                    job_type: parseJobType([title, cardText])
                });
            });
        }

        const dedupedMap = new Map<string, Job>();
        for (const j of jobs) {
            if (!j.title || !j.url) continue;
            if (!dedupedMap.has(j.url)) {
                dedupedMap.set(j.url, j);
            }
        }
        return Array.from(dedupedMap.values()).slice(0, 500);
    } catch {
        return [];
    }
}

async function fetchJobsWithFallback(company: CompanyRow, options?: { fallbackOnly?: boolean }): Promise<{
    jobs: Job[];
    provider: string;
    token: string;
    source: 'primary' | 'fallback' | 'serper';
    fallbackUsed: boolean;
}> {
    const fallbackOnly = !!options?.fallbackOnly;

    // 1. Resolve primary via alias + custom routing
    const resolved = resolveProviderAndToken(
        company.ats_provider,
        company.ats_board_token,
        company.careers_url ?? null
    );

    // 2. Infer from careers URL as fallback
    const fallbackPlan = inferAtsFromCareersUrl(company.careers_url);

    const attempts: FetchAttempt[] = [];

    const isCustom = resolved?.provider && !['workday', 'lever', 'ashby', 'greenhouse', 'workable', 'smartrecruiters', 'teamtailor'].includes(resolved.provider);

    if ((!fallbackOnly || isCustom) && resolved && FETCHERS[resolved.provider]) {
        attempts.push({ provider: resolved.provider, token: resolved.token, source: 'primary' });
    }

    if (fallbackPlan && FETCHERS[fallbackPlan.provider]) {
        const alreadyQueued = attempts.some(
            a => a.provider === fallbackPlan.provider && a.token === fallbackPlan.token
        );
        if (!alreadyQueued) {
            attempts.push({ provider: fallbackPlan.provider, token: fallbackPlan.token, source: 'fallback' });
        }
    }

    // 3. Last resort: Generic HTML scraper if we have a URL but no ATS detected
    if (attempts.length === 0 && company.careers_url) {
        attempts.push({ provider: 'generic_careers', token: company.careers_url, source: 'fallback' });
    }

    if (attempts.length === 0) {
        return {
            jobs: [],
            provider: resolved?.provider || company.ats_provider || '',
            token: resolved?.token || company.ats_board_token || '',
            source: 'primary',
            fallbackUsed: false,
        };
    }

    const errors: string[] = [];
    for (const attempt of attempts) {
        const fetcher = FETCHERS[attempt.provider];
        if (!fetcher) continue;

        try {
            console.log(`Trying fetcher: ${attempt.provider} (token: ${attempt.token})`);
            let jobs = await fetcher(attempt.token, company);
            jobs = jobs.filter(j => isValidJobTitle(j.title));
            console.log(`Fetcher ${attempt.provider} returned ${jobs.length} valid jobs`);
            if (jobs.length > 0) {
                return {
                    jobs,
                    provider: attempt.provider,
                    token: attempt.token,
                    source: attempt.source,
                    fallbackUsed: attempt.source === 'fallback',
                };
            }
            errors.push(`${attempt.provider}:${attempt.source}=0`);
        } catch (error: any) {
            errors.push(`${attempt.provider}:${attempt.source}=${error?.message || 'error'}`);
        }
    }

    const serperUrls = await discoverCareersUrlsWithSerper(company);
    for (const discoveredUrl of serperUrls) {
        const inferred = inferAtsFromCareersUrl(discoveredUrl);
        if (!inferred) continue;

        const fetcher = FETCHERS[inferred.provider];
        if (!fetcher) continue;

        try {
            let jobs = await fetcher(inferred.token);
            jobs = jobs.filter(j => isValidJobTitle(j.title));
            if (jobs.length > 0) {
                return {
                    jobs,
                    provider: inferred.provider,
                    token: inferred.token,
                    source: 'serper',
                    fallbackUsed: true,
                };
            }
            errors.push(`${inferred.provider}:serper=0`);
        } catch (error: any) {
            errors.push(`${inferred.provider}:serper=${error?.message || 'error'}`);
        }
    }

    if (errors.length > 0) {
        console.log(`  [FALLBACK] ${company.trading_name} — ${errors.join(' | ')}`);
    }

    const bestAttempt = attempts[attempts.length - 1];
    return {
        jobs: [],
        provider: bestAttempt.provider,
        token: bestAttempt.token,
        source: bestAttempt.source,
        fallbackUsed: bestAttempt.source === 'fallback',
    };
}

export async function loadAtsOverrides(companyIds: number[]): Promise<Map<number, AtsOverrideRow>> {
    const overrides = new Map<number, AtsOverrideRow>();
    const pageSize = 500;

    for (let i = 0; i < companyIds.length; i += pageSize) {
        const chunk = companyIds.slice(i, i + pageSize);

        let query = supabase
            .from('ats_import_audit')
            .select('company_id, sync_provider, provider_raw, board_token_raw, careers_url_raw')
            .in('company_id', chunk);

        let { data, error } = await query;

        if (error) {
            const legacy = await supabase
                .from('ats_import_audit')
                .select('company_id, provider_raw, board_token_raw, careers_url_raw')
                .in('company_id', chunk);

            data = (legacy.data || []) as any;
            error = legacy.error;
        }

        if (error) {
            console.warn(`Could not load ATS overrides for chunk ${i}-${i + chunk.length - 1}: ${error.message}`);
            continue;
        }

        for (const row of (data || []) as AtsOverrideRow[]) {
            overrides.set(row.company_id, row);
        }
    }

    return overrides;
}

export async function loadAllCompanies(specificIds: number[] | null): Promise<CompanyRow[]> {
    const EXCEL_PATH_NEW = path.resolve(process.cwd(), 'data/excel/Testing_jobs_data.xlsx');
    const EXCEL_PATH_OLD = path.resolve(process.cwd(), 'Testing_jobs_data.xlsx');

    const loadFromExcel = (excelPath: string): CompanyRow[] => {
        console.log(`[INPUT] Reading companies from ${excelPath}...`);
        const workbook = XLSX.readFile(excelPath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        const companies: CompanyRow[] = (data as any[]).map(row => ({
            id: Number(row['Company ID'] || 0),
            trading_name: String(row['Company Name'] || '').trim(),
            ats_provider: String(row['ATS Provider'] || '').trim(),
            ats_board_token: String(row['ATS Board Token'] || '').trim(),
            careers_url: String(row['URL'] || '').trim(),
        })).filter(c => c.trading_name);

        if (specificIds && specificIds.length > 0) {
            return companies.filter(c => specificIds.includes(c.id));
        }
        return companies;
    };

    if (specificIds && specificIds.length > 0) {
        try {
            let data: any[] | null = null;
            let error: { message: string } | null = null;

            const withMarket = await supabase
                .from('companies')
                .select('id, trading_name, ats_provider, ats_board_token, url, careers_url, company_sector, sync_market, ats_status, licensed_sponsor, ireland_permit_employer')
                .in('id', specificIds)
                .order('trading_name');

            if (withMarket.error && /sync_market|ats_status|careers_url|licensed_sponsor|ireland_permit/i.test(withMarket.error.message)) {
                const fallback = await supabase
                    .from('companies')
                    .select('id, trading_name, ats_provider, ats_board_token, url, careers_url, company_sector, licensed_sponsor')
                    .in('id', specificIds)
                    .order('trading_name');
                data = fallback.data;
                error = fallback.error;
            } else {
                data = withMarket.data;
                error = withMarket.error;
            }

            if (error) {
                throw new Error(error.message);
            }

            const companies = (data || []) as CompanyRow[];
            const overrides = await loadAtsOverrides(companies.map(c => c.id));

            return companies.map(company => {
                const override = overrides.get(company.id);
                const base = {
                    ...company,
                    careers_url: company.careers_url || company.url,
                    sync_market: resolveSyncMarket(company),
                };
                if (!override) return base;

                return {
                    ...base,
                    ats_provider: normalizeProviderName(override.sync_provider || override.provider_raw) || company.ats_provider,
                    ats_board_token: override.board_token_raw?.trim() || company.ats_board_token,
                    careers_url: normalizeCareersUrl(override.careers_url_raw) || base.careers_url,
                };
            });
        } catch (error: any) {
            console.warn(`Could not load filtered companies from Supabase, falling back to Excel: ${error.message}`);
            if (fs.existsSync(EXCEL_PATH_NEW)) return loadFromExcel(EXCEL_PATH_NEW);
            if (fs.existsSync(EXCEL_PATH_OLD)) return loadFromExcel(EXCEL_PATH_OLD);
            throw error;
        }
    }

    const pageSize = 1000;
    let from = 0;
    const all: CompanyRow[] = [];
    let selectWithMarket = true;

    try {
        while (true) {
            const to = from + pageSize - 1;
            const selectCols = selectWithMarket
                ? 'id, trading_name, ats_provider, ats_board_token, url, careers_url, company_sector, sync_market, ats_status, licensed_sponsor, ireland_permit_employer'
                : 'id, trading_name, ats_provider, ats_board_token, url, careers_url, company_sector, ats_status, licensed_sponsor, ireland_permit_employer';
            const { data, error } = await supabase
                .from('companies')
                .select(selectCols)
                .order('id', { ascending: true })
                .range(from, to);

            if (error) {
                if (selectWithMarket && /sync_market/i.test(error.message)) {
                    console.warn('companies.sync_market missing — run supabase/add_ireland_source_and_market.sql');
                    selectWithMarket = false;
                    continue;
                }
                if (/ats_status|careers_url|ireland_permit|licensed_sponsor/i.test(error.message)) {
                    // Retry without optional columns that may be missing from schema
                    const fallbackCols = selectWithMarket
                        ? 'id, trading_name, ats_provider, ats_board_token, url, company_sector, sync_market, licensed_sponsor'
                        : 'id, trading_name, ats_provider, ats_board_token, url, company_sector, licensed_sponsor';
                    const retry = await supabase
                        .from('companies')
                        .select(fallbackCols)
                        .order('id', { ascending: true })
                        .range(from, to);
                    if (retry.error) throw new Error(`Could not load companies page ${from}-${to}: ${retry.error.message}`);
                    const rows = (retry.data || []) as unknown as CompanyRow[];
                    if (rows.length === 0) break;
                    all.push(...rows);
                    if (rows.length < pageSize) break;
                    from += pageSize;
                    continue;
                }
                throw new Error(`Could not load companies page ${from}-${to}: ${error.message}`);
            }

            const rows = (data || []) as unknown as CompanyRow[];
            if (rows.length === 0) break;

            all.push(...rows);

            if (rows.length < pageSize) break;
            from += pageSize;
        }

        const overrides = await loadAtsOverrides(all.map(c => c.id));

        const merged = all.map(company => {
            const override = overrides.get(company.id);
            const base = {
                ...company,
                careers_url: company.careers_url || company.url,
                sync_market: resolveSyncMarket(company),
            };
            if (!override) return base;

            return {
                ...base,
                ats_provider: normalizeProviderName(override.sync_provider || override.provider_raw) || company.ats_provider,
                ats_board_token: override.board_token_raw?.trim() || company.ats_board_token,
                careers_url: normalizeCareersUrl(override.careers_url_raw) || base.careers_url,
            };
        });

        return merged.sort((a, b) => a.trading_name.localeCompare(b.trading_name));
    } catch (error: any) {
        console.warn(`Could not load companies from Supabase, falling back to Excel: ${error.message}`);
        if (fs.existsSync(EXCEL_PATH_NEW)) return loadFromExcel(EXCEL_PATH_NEW);
        if (fs.existsSync(EXCEL_PATH_OLD)) return loadFromExcel(EXCEL_PATH_OLD);
        throw error;
    }
}

function normalizeTeamtailorHtmlToken(token: string): string {
    const trimmed = String(token || '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed.replace(/\/$/, '');
    }
    if (trimmed.includes('.teamtailor.com')) {
        return `https://${trimmed.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
    }
    return `https://${trimmed}.teamtailor.com/jobs`;
}

// ─── ATS Fetchers — each accepts (token: string) and returns Job[] ─────────

async function fetchJibe(domain: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let page = 1;
    while (true) {
        try {
            const res = await fetchWithTimeout(`https://${domain}/api/jobs?page=${page}&limit=100`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            const data = await res.json();
            const jobs = data.jobs || [];
            if (jobs.length === 0) break;
            
            for (const j of jobs) {
                const title = j.title || j.data?.title || '';
                const location = j.full_location || j.location || j.city || j.data?.full_location || j.data?.location || j.data?.city || '';
                const slug = j.slug || j.req_id || j.id || j.data?.slug || j.data?.req_id || j.data?.id;
                
                if (title && slug) {
                    let dept = j.category || j.data?.category || '';
                    if (Array.isArray(dept)) dept = dept.join(', ');
                    
                    let jobTypeField = j.job_type || j.employment_type || j.type || j.data?.job_type || j.data?.employment_type || j.data?.type || '';
                    if (Array.isArray(jobTypeField)) jobTypeField = jobTypeField.join(' ');

                    allJobs.push({
                        title,
                        location,
                        url: `https://${domain}/jobs/${slug}`,
                        department: dept,
                        salary: undefined,
                        job_type: parseJobType([title, dept, jobTypeField]),
                        verified: false,
                        atsProvider: 'jibe'
                    });
                }
            }
            if (jobs.length < 100) break;
            page++;
            await sleep(300);
        } catch (e: any) {
            console.error(`[Jibe] ${domain} error: ${e.message}`);
            break;
        }
    }
    return allJobs;
}

async function fetchGreenhouse(token: string): Promise<Job[]> {
    // Support tokens like "gympass?office_id=4038159002"
    const [boardToken, query] = token.split('?');
    const officeId = query?.split('=')[1];

    // boards-api.greenhouse.io is the definitive JSON API.
    // Some boards (like Winton) require the .eu subdomain.
    const subdomains = ['boards-api', 'boards-api.eu'];

    for (const sub of subdomains) {
        const url = `https://${sub}.greenhouse.io/v1/boards/${boardToken}/jobs?content=true${officeId ? `&office_id=${officeId}` : ''}`;
        try {
            const r = await fetchWithTimeout(url, {
                headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
            });
            if (!r.ok) continue;
            const text = await r.text();
            if (!text || !text.startsWith('{')) continue; // skip HTML responses
            const d = JSON.parse(text);
            const jobs: Job[] = (d.jobs || []).map((j: any) => {
                const offices = j.offices || [];
                let location = j.location?.name || '';
                // Gap 2: fall back to the offices array only when the job has no
                // specific location.name. For remote roles these can disagree —
                // e.g. a "Remote - Ireland" posting can list offices: ["Amsterdam"]
                // (the hiring team's hub, not where the role is based) — so
                // overriding a real location.name with offices silently dropped
                // the correct location and made Ireland/UK jobs undetectable.
                if (!location && offices.length > 0) {
                    const allOffices = offices.map((o: any) => o.name || o.location).filter(Boolean);
                    if (allOffices.length > 0) {
                        location = allOffices.join(' | ');
                    }
                }
                const jobTypeMeta = j.metadata?.find((m: any) => m.name && /employment|job.*type/i.test(m.name))?.value || '';
                return {
                    title: j.title || '',
                    location: location,
                    url: j.absolute_url || j.url || '',
                    department: j.departments?.[0]?.name || '',
                    salary: undefined,
                    job_type: parseJobType(jobTypeMeta || j.employment_type || j.type || j.employmentType),
                    atsProvider: 'greenhouse',
                };
            });
            if (jobs.length > 0) return jobs;
        } catch { }
    }
    return [];
}

async function fetchAshby(token: string): Promise<Job[]> {
    try {
        // Try the JSON API first
        const r = await fetchWithTimeout(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
        if (r.ok) {
        const d = await r.json();
        return (d.jobs || []).map((j: any) => {
            const locRaw = typeof j.location === 'string' ? j.location : (j.location?.name || '');
            const secLocs = (j.secondaryLocations || [])
                .map((l: any) => typeof l === 'string' ? l : (l.location || l.name || ''))
                .join(' ');
            // Gap 4: Ashby Remote boolean check
            return {
                title: j.title || '',
                location: `${locRaw} ${secLocs} ${j.isRemote ? 'Remote' : ''}`.trim(),
                url: j.jobUrl || '',
                department: j.department || '',
                    salary: undefined,
                    atsProvider: 'ashby',
                    job_type: parseJobType(j.employmentType),
                };
            });
        }
    } catch { /* fall through to HTML */ }

    // Fallback: Parse Ashby's window.__appData payload when the JSON API is unavailable
    try {
        const htmlRes = await fetchWithTimeout(`https://jobs.ashbyhq.com/${token}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (htmlRes.ok) {
            const html = await htmlRes.text();
            if (html.includes('window.__appData = ')) {
                const jsonStr = html.split('window.__appData = ')[1].split('};\n')[0] + '}';
                const appData = JSON.parse(jsonStr);
                const postings = appData.jobBoard?.jobPostings || [];
                const teams = appData.jobBoard?.teams || [];
                const teamMap = new Map(teams.map((t: any) => [t.id, t.name]));

                return postings.map((j: any) => {
                    const locRaw = j.locationName || '';
                    const secLocs = (j.secondaryLocations || []).map((l: any) => l.locationName || '').join(' ');
                    const remoteStr = j.workplaceType === 'Remote' ? 'Remote' : '';

                    return {
                        title: j.title || '',
                        location: `${locRaw} ${secLocs} ${remoteStr}`.trim(),
                        url: `https://jobs.ashbyhq.com/${token}/${j.id}`,
                        department: teamMap.get(j.teamId) || '',
                        salary: undefined,
                        atsProvider: 'ashby',
                        job_type: parseJobType(j.employmentType),
                    };
                });
            }
        }
    } catch { /* ignore */ }

    return [];
}

async function fetchLever(token: string): Promise<Job[]> {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0';
    // Lever boards can be in US or EU regions
    const bases = ['https://api.eu.lever.co/v0/postings', 'https://api.lever.co/v0/postings'];

    for (const base of bases) {
        try {
            // 1. Try grouped by team (better department info)
            const r = await fetchWithTimeout(`${base}/${token}?group=team&mode=json`, { headers: { 'User-Agent': ua } });
            if (r.ok) {
                const d = await r.json();
                if (Array.isArray(d) && d.length > 0 && d[0].postings) {
                    const jobs: Job[] = [];
                    d.forEach((group: any) => {
                        (group.postings || []).forEach((p: any) => {
                            const loc = p.categories?.location || p.workplaceType || '';
                            const team = p.categories?.department || p.categories?.team || group.title || '';
                            jobs.push({
                                title: p.text || '',
                                location: loc,
                                url: p.hostedUrl || '',
                                department: team,
                                job_type: parseJobType([p.text, p.categories?.department, p.categories?.team, p.categories?.commitment, p.workplaceType]),
                                salary: undefined,
                                atsProvider: 'lever',
                            });
                        });
                    });
                    if (jobs.length > 0) return jobs;
                }
            }

            // 2. Try flat list fallback
            const r2 = await fetchWithTimeout(`${base}/${token}?mode=json`, { headers: { 'User-Agent': ua } });
            if (r2.ok) {
                const d2 = await r2.json();
                if (Array.isArray(d2) && d2.length > 0) {
                    return d2.map((p: any) => {
                        const loc = p.categories?.location || p.workplaceType || '';
                        const team = p.categories?.department || p.categories?.team || '';
                        return {
                            title: p.text || '',
                            location: loc,
                            url: p.hostedUrl || '',
                            department: team,
                            job_type: parseJobType([p.text, p.categories?.department, p.categories?.team, p.categories?.commitment, p.workplaceType]),
                            salary: undefined,
                            atsProvider: 'lever',
                        };
                    });
                }
            }
        } catch { continue; }
    }
    return [];
}

async function fetchWorkable(token: string): Promise<Job[]> {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0';

    const workableFetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response | null> => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const r = await fetchWithTimeout(url, options);
                if (r.status === 429) {
                    const rawRetry = parseInt(r.headers.get('retry-after') || '0') || (2 ** attempt) * 2;
                    const retryAfter = Math.min(rawRetry, 30); // cap at 30s so one company can't stall the whole run
                    await sleep(retryAfter * 1000);
                    continue;
                }
                return r;
            } catch { }
        }
        return null;
    };

    // 1. Try public detail API (most reliable/fastest)
    const r1 = await workableFetchWithRetry(`https://www.workable.com/api/accounts/${token}?detail=true`, {
        headers: { 'User-Agent': ua, 'Accept': 'application/json' }
    });
    if (r1?.ok) {
        const d = await r1.json();
        if (Array.isArray(d.jobs)) {
            return d.jobs.map((j: any) => ({
                title: j.title || '',
                location: [j.city, j.state, j.country].filter(Boolean).join(', ') || (j.telecommuting ? 'Remote' : ''),
                url: j.url || j.shortlink || `https://apply.workable.com/j/${j.shortcode}`,
                department: j.department || '',
                salary: undefined,
                job_type: parseJobType(j.employment_type)
            }));
        }
    }

    // 2. Try v3 API fallback
    const body = { query: '', location: [], department: [], worktype: [], remote: [] };
    const r2 = await workableFetchWithRetry(`https://apply.workable.com/api/v3/accounts/${token}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
        body: JSON.stringify(body)
    });
    if (r2?.ok) {
        const d = await r2.json();
        return (d.results || []).map((j: any) => ({
            title: j.title || '',
            location: [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(', ') || (j.remote ? 'Remote' : ''),
            url: `https://apply.workable.com/${token}/j/${j.shortcode}/`,
            department: j.department || '',
            salary: undefined,
            job_type: parseJobType(j.type)
        }));
    }

    return [];
}

async function fetchTeamtailor(token: string, company?: any): Promise<Job[]> {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0';
    
    const domainsToTry: string[] = [];
    if (token.includes('.')) domainsToTry.push(token);
    else domainsToTry.push(`${token}.teamtailor.com`);
    
    if (company?.careers_url) {
        try {
            const urlObj = new URL(company.careers_url);
            if (!domainsToTry.includes(urlObj.hostname)) {
                domainsToTry.push(urlObj.hostname);
            }
        } catch {}
    }

    for (const domain of domainsToTry) {
    // 1. Try JSON first
    try {
            const url = `https://${domain}/jobs.json`;
        const r = await fetchWithTimeout(url, {
            headers: {
                'User-Agent': ua,
                'Accept': 'application/vnd.api+json',
                    'Referer': `https://${domain}/`
                }
            });
            if (r.ok) {
                const d = await r.json();
                if (d.data?.length > 0) {
                    return d.data.map((j: any) => ({
                        title: j.attributes?.title || '',
                        location: j.attributes?.['human-location'] || '',
                        url: j.links?.['careersite-job-url'] || '',
                        department: '',
                        salary: undefined,
                        job_type: parseJobType(j.attributes?.['employment-type'] || j.attributes?.['pitch'] || j.attributes?.['body'])
                    }));
                }
                if (d.items?.length > 0) {
                    return d.items.map((j: any) => {
                        const city = j._jobposting?.jobLocation?.[0]?.address?.addressLocality || '';
                        const country = j._jobposting?.jobLocation?.[0]?.address?.addressCountry || '';
                        const loc = [city, country].filter(Boolean).join(', ');
                        return {
                            title: j.title || '',
                            location: loc,
                            url: j.url || '',
                            department: '',
                            salary: undefined,
                            job_type: parseJobType(j._jobposting?.employmentType || j.content_html)
                        };
                    });
                }
        }
    } catch { }

    // 2. Try RSS as fallback
    try {
            const rssUrl = `https://${domain}/jobs.rss`;
        const r = await fetchWithTimeout(rssUrl, { headers: { 'User-Agent': ua } });
            if (r.ok) {
        const xml = await r.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const jobs: Job[] = [];

        $('item').each((_, el) => {
            const item = $(el);
                    const city = item.find('tt\\:city').text().trim();
                    const country = item.find('tt\\:country').text().trim();
                    const ttLoc = [city, country].filter(Boolean).join(', ');
                    
            jobs.push({
                title: item.find('title').text().trim(),
                        location: ttLoc || item.find('description').text().split('·')[1]?.trim() || '',
                        url: item.find('link').text().trim(),
                        department: item.find('category').first().text().trim(),
                        salary: undefined,
                        job_type: parseJobType(item.find('tt\\:role').text() || item.find('description').text())
                    });
                });
                if (jobs.length > 0) return jobs;
            }
        } catch (e) { }
    }
    return [];
}

export async function fetchBambooHR(token: string): Promise<Job[]> {
    try {
        // Try the open /careers/list endpoint first
        const r = await fetchWithTimeout(`https://${token}.bamboohr.com/careers/list`);
        if (r.ok) {
            const d = await r.json();
            return (d.result || []).map((j: any) => ({
                title: j.jobOpeningName || '',
                location: [
                    j.location?.city,
                    j.location?.state,
                    j.location?.country
                ].filter(Boolean).join(', '),
                url: `https://${token}.bamboohr.com/careers/${j.id}`,
                // The /careers/list endpoint returns a flat departmentLabel field
                // (confirmed live) — this used to be hardcoded to '', which is
                // being right there in the response.
                department: j.departmentLabel || '',
                salary: undefined,
                job_type: parseJobType(j.employmentType || j.jobType || j.type || j.employmentStatusLabel)
            }));
        }
        // Fallback: applicant tracking API
        const r2 = await fetchWithTimeout(
            `https://api.bamboohr.com/api/gateway.php/${token}/v1/applicant_tracking/jobs?status=Open`,
            { headers: { 'Accept': 'application/json' } }
        );
        if (!r2.ok) return [];
        const d2 = await r2.json();
        return (d2 || []).map((j: any) => ({
            title: j.jobTitle?.label || j.title || '',
            location: j.location?.label || '',
            url: `https://${token}.bamboohr.com/jobs/${j.id}/`,
            department: j.department?.label || '',
            salary: undefined,
            job_type: parseJobType(j.jobType?.label || j.employmentStatus?.label)
        }));
    } catch { return []; }
}

async function fetchSmartRecruiters(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let offset = 0;
    while (true) {
        try {
            const r = await fetchWithTimeout(
                `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100&offset=${offset}&status=PUBLISHED`
            );
            if (!r.ok) break;
            const d = await r.json();
            const content = d.content || [];
            if (content.length === 0) break;

            allJobs.push(...content.map((j: any) => ({
                title: j.name || '',
                // fullLocation gives "London, England, United Kingdom" / "Saint Helier, Jersey"
                // which catches Channel Islands and avoids 2-letter country code ambiguity
                location: j.location?.fullLocation || `${j.location?.city || ''} ${j.location?.country || ''}`.trim(),
                url: `https://jobs.smartrecruiters.com/${token}/${j.id}`,
                department: j.department?.label || '',
                job_type: parseJobType([
                    j.name, 
                    j.department?.label, 
                    j.typeOfEmployment?.label, 
                    j.typeOfEmployment?.id,
                    j.employmentType,
                    j.type
                ]),
                salary: undefined,
                atsProvider: 'smartrecruiters'
            })));

            if (content.length < 100) break;
            offset += 100;
            await sleep(500);
        } catch { break; }
    }
    return allJobs;
}

async function fetchPinpoint(token: string): Promise<Job[]> {
    try {
        const r = await fetchWithTimeout(`https://${token}.pinpointhq.com/postings.json`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!r.ok) return [];
        const d = await r.json();
        return (d.data || []).map((j: any) => {
            const locRaw = j.location;
            let location = '';
            if (locRaw && typeof locRaw === 'object') {
                const parts = [locRaw.name || locRaw.city, locRaw.province].filter(Boolean);
                location = parts.join(', ');
            } else {
                location = String(locRaw || '');
            }
            return {
                title: j.title || '',
                location,
                url: j.url || `https://${token}.pinpointhq.com${j.path || ''}`,
                department: j.job_function || j.department || '',
                salary: undefined,
                job_type: parseJobType(j.employment_type || j.employment_type_text)
            };
        });
    } catch { return []; }
}

export async function fetchBreezy(token: string): Promise<Job[]> {
    try {
        const r = await fetchWithTimeout(`https://${token}.breezy.hr/json`);
        if (!r.ok) return [];
        const d = await r.json();
        return (d || []).map((j: any) => ({
            title: j.name || '',
            location: j.location?.name || '',
            url: j.url || '',
            // Breezy's /json feed returns department as a flat string for most
            // tenants (confirmed live, e.g. "Operations", "Technology") — the
            // `.name` accessor here only matched a nested-object shape that
            // doesn't actually occur, so every job silently fell through to ''.
            department: (typeof j.department === 'string' ? j.department : j.department?.name) || '',
            salary: undefined,
            job_type: parseJobType(j.type?.name || j.type || j.employmentType || j.jobType)
        }));
    } catch { return []; }
}

async function fetchRecruitee(token: string): Promise<Job[]> {
    try {
        const url = token.includes('.')
            ? `https://${token}/api/offers/?state=published`
            : `https://${token}.recruitee.com/api/offers/?state=published`;

        const r = await fetchWithTimeout(url);
        if (!r.ok) return [];
        const d = await r.json();
        return (d.offers || []).map((j: any) => ({
            title: j.title || '',
            location: [j.city, j.country].filter(Boolean).join(', ') || j.location || '',
            url: j.careers_url || '',
            department: j.department || '',
            job_type: parseJobType([j.title, j.department, j.employment_type_code]),
            salary: undefined,
            country: j.country || '',
        }));
    } catch { return []; }
}

async function fetchJobvite(token: string): Promise<Job[]> {
    try {
        const r = await fetchWithTimeout(`https://jobs.jobvite.com/api/company/${token}/jobs`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
        });
        if (r.ok) {
            const text = await r.text();
            try {
                const d = JSON.parse(text);
                const apiJobs = (d.jobs || []).map((j: any) => ({
                    title: j.title || j.jobTitle || '',
                    location: j.location || '',
                    url: j.applyUrl || j.url || `https://jobs.jobvite.com/${token}/job/${j.id || ''}`,
                    department: j.category || j.department || '',
                    job_type: parseJobType([j.title, j.jobTitle, j.category, j.department, j.jobType]),
                    salary: undefined
                }));
                if (apiJobs.length > 0) return apiJobs;
            } catch {
                // Some Jobvite tenants return HTML from this endpoint.
            }
        }

        const htmlRes = await fetchWithTimeout(`https://jobs.jobvite.com/${token}/jobs`, {
            headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0' }
        });
        if (!htmlRes.ok) return [];
        const html = await htmlRes.text();
        const $ = cheerio.load(html);
        const jobs: Job[] = [];

        $('a[href*="/job/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            if (!href || !isValidJobTitle(title)) return;

            const row = $(el).closest('li, tr, div');
            const location = row.find('[class*="location"], [data-qa*="location"]').first().text().trim();
            const rowText = row.text();
            jobs.push({
                title,
                location,
                url: href.startsWith('http') ? href : `https://jobs.jobvite.com${href}`,
                department: '',
                job_type: parseJobType([title, rowText]),
                salary: undefined,
            });
        });

        return Array.from(new Map(jobs.map((j) => [j.url, j])).values());
    } catch {
        return [];
    }
}

async function fetchAvature(token: string): Promise<Job[]> {
    try {
        const raw = String(token || '').trim();
        if (!raw) return [];

        // Prefer public careers-marketplace HTML (REST /api/rest/v1/jobs is often auth-walled).
        // Tokens may be subdomain ("virginmediao2") or a full careers URL.
        let portalBase = '';
        if (/^https?:\/\//i.test(raw)) {
            const u = new URL(raw);
            portalBase = `${u.protocol}//${u.host}`;
        } else {
            const subdomain = raw.replace(/\.avature\.net.*/i, '').split('/')[0];
            // Known custom hosts (Avature white-label)
            if (subdomain === 'virginmediao2') {
                portalBase = 'https://jobs.virginmediao2.co.uk';
            } else {
                portalBase = `https://${subdomain}.avature.net`;
            }
        }

        const htmlJobs = await fetchAvatureSearchJobsHtml(portalBase);
        if (htmlJobs.length) return htmlJobs;

        // Legacy REST fallback
        const subdomain = portalBase.replace(/^https?:\/\//, '').split('.')[0];
        const r = await fetchWithTimeout(`https://${subdomain}.avature.net/api/rest/v1/jobs`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
        });
        if (!r.ok) return [];
        const d = await r.json();
        return (d.items || []).map((j: any) => ({
            title: j.jobTitle || j.title || '',
            location: j.location || '',
            url: j.detailUrl || j.url || `https://${subdomain}.avature.net/`,
            department: j.category || j.department || '',
            salary: undefined,
            job_type: parseJobType([j.jobTitle, j.title, j.category, j.department]),
            atsProvider: 'avature',
        }));
    } catch {
        return [];
    }
}

/** Paginate Avature careersmarketplace SearchJobs HTML (public, no API key). */
async function fetchAvatureSearchJobsHtml(portalBase: string): Promise<Job[]> {
    const base = portalBase.replace(/\/$/, '');
    const searchPaths = [
        '/en_US/careersmarketplace/SearchJobs/',
        '/careersmarketplace/SearchJobs/',
        '/en_GB/careersmarketplace/SearchJobs/',
    ];

    let searchPath = '';
    for (const p of searchPaths) {
        const probe = await fetchWithTimeout(
            `${base}${p}?listFilterMode=1&jobRecordsPerPage=20&jobOffset=0`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (probe.ok) {
            const html = await probe.text();
            if (/JobDetail\//i.test(html)) {
                searchPath = p;
                break;
            }
        }
    }
    if (!searchPath) return [];

    const byUrl = new Map<string, Job>();
    const pageSize = 20;
    for (let offset = 0; offset < 2000; offset += pageSize) {
        const url = `${base}${searchPath}?listFilterMode=1&jobRecordsPerPage=${pageSize}&jobOffset=${offset}`;
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) break;
        const html = await res.text();
        const $ = cheerio.load(html);
        let pageCount = 0;

        $('a[href*="JobDetail/"]').each((_, el) => {
            const href = String($(el).attr('href') || '').trim();
            if (!href) return;
            const title = $(el).text().replace(/\s+/g, ' ').trim();
            if (!title || /^view job$/i.test(title)) return;
            const abs = href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`;
            // Location from JobDetail slug — titles alone often collide
            // ("Field Sales Representative" x many towns).
            // Examples:
            //   .../JobDetail/Retail-Advisor-16hrs-Poole/109860
            //   .../JobDetail/Birmingham-United-Kingdom-...-Field-Sales-Representative/12007
            const slug = decodeURIComponent((abs.split('/JobDetail/')[1] || '').split('/')[0] || '');
            let location = 'United Kingdom';
            const ukCountryMatch = slug.match(
                /^(.+?)-United-Kingdom(?:-of-Great-Britain-and-Northern-Ireland)?-/i
            );
            if (ukCountryMatch) {
                location = `${ukCountryMatch[1].replace(/-/g, ' ')}, United Kingdom`;
            } else {
                const titleParts = title.split(',').map((s) => s.trim()).filter(Boolean);
                if (titleParts.length >= 2) {
                    location = `${titleParts[titleParts.length - 1]}, United Kingdom`;
                } else {
                    // Fallback: last token of slug often is the town (Poole, Aylesbury…)
                    const tokens = slug.split('-').filter(Boolean);
                    const last = tokens[tokens.length - 1] || '';
                    if (last && !/^\d+$/.test(last) && last.length > 2) {
                        location = `${last}, United Kingdom`;
                    }
                }
            }
            if (!byUrl.has(abs)) {
                byUrl.set(abs, {
                    title,
                    location,
                    url: abs,
                    department: '',
                    salary: undefined,
                    job_type: parseJobType(title), // Default, will override later
                    atsProvider: 'avature',
                    verified: true,
                });
                pageCount++;
            }
        });

        if (pageCount === 0) break;
        await sleep(200);
    }

    const jobs = Array.from(byUrl.values());
    const limit = pLimit(10);
    await Promise.all(
        jobs.map((job) =>
            limit(async () => {
                try {
                    const detailRes = await fetchWithTimeout(job.url, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                    });
                    if (!detailRes.ok) return;
                    const detailHtml = await detailRes.text();
                    const $d = cheerio.load(detailHtml);

                    // Search for standard Avature labels
                    let foundType = '';
                    $d('.article__content__view__field__label').each((_, el) => {
                        const labelText = $d(el).text().toLowerCase().trim();
                        if (labelText.includes('job type') || labelText.includes('employment type') || labelText.includes('schedule')) {
                            foundType = $d(el).next('.article__content__view__field__value').text().trim();
                        }
                    });

                    // Update job type if found in metadata, else try parsing the full text
                    if (foundType) {
                        job.job_type = parseJobType(foundType);
                    } else {
                        // Fallback: parse the whole body text as a last resort
                        const bodyText = $d('body').text().replace(/\s+/g, ' ');
                        const bodyType = parseJobType(bodyText);
                        if (bodyType) {
                            job.job_type = bodyType;
                        }
                    }
                } catch (e) {
                    // Ignore and keep the default title-based job_type
                }
            })
        )
    );

    return jobs;
}

async function fetchTeamtailorHtml(token: string): Promise<Job[]> {
    const startUrl = normalizeTeamtailorHtmlToken(token);
    if (!startUrl) return [];

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0',
            viewport: { width: 1280, height: 1080 }
        });
        const page = await context.newPage();
        await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2500);

        const jobs = await page.evaluate(() => {
            const seen = new Set<string>();
            const output: Array<{ id: string; title: string; url: string; location: string }> = [];

            const structuredRows = Array.from(document.querySelectorAll('[data-job-id]'));
            for (const node of structuredRows) {
                const element = node as HTMLElement;
                const jobId = element.getAttribute('data-job-id') || '';
                const anchor = element.querySelector('a') as HTMLAnchorElement | null;
                const href = anchor?.href || '';
                if (!href || seen.has(href)) continue;
                const titleText = (anchor?.textContent || element.innerText || '').trim();
                const locationNode = element.querySelector('[data-testid*="location"], .location, .job-location') as HTMLElement | null;
                const locationText = (locationNode?.innerText || '').trim();
                output.push({ id: jobId, title: titleText, url: href, location: locationText });
                seen.add(href);
            }

            // Fallback pattern used by some Teamtailor pages: job links only.
            const jobAnchors = Array.from(document.querySelectorAll('a[href*="/jobs/"]')) as HTMLAnchorElement[];
            for (const anchor of jobAnchors) {
                const href = anchor.href || '';
                if (!href || seen.has(href)) continue;
                const titleText = (anchor.textContent || '').trim();
                if (!titleText) continue;
                const card = anchor.closest('li, article, div, section') as HTMLElement | null;
                const locationNode = card?.querySelector('[data-testid*="location"], .location, .job-location, [class*="location"]') as HTMLElement | null;
                const locationText = (locationNode?.innerText || '').trim();
                output.push({ id: '', title: titleText, url: href, location: locationText });
                seen.add(href);
            }

            return output;
        });

        await context.close();

        return jobs
            .filter((j: any) => j.title && j.url && isValidJobTitle(j.title))
            .map((j: any) => ({
                title: j.title,
                location: j.location || '',
                url: j.url,
                department: '',
                salary: undefined,
                job_type: parseJobType(undefined)
            }));
    } catch {
        if (context) await context.close().catch(() => {});
        return [];
    }
}

async function fetchPersonio(token: string): Promise<Job[]> {
    try {
        const r = await fetchWithTimeout(`https://${token}.jobs.personio.de/xml?language=en`);
        if (!r.ok) return [];
        const xml = await r.text();
        const posBlocks = xml.match(/<position>([\s\S]*?)<\/position>/g) || [];
        return posBlocks.map(block => {
            const get = (tag: string) => {
                const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
                return m ? m[1].trim() : '';
            };
            return {
                title: get('name') || get('title'),
                location: get('office') || get('location'),
                url: get('jobUrl') || `https://${token}.jobs.personio.de/job/${get('id')}?display=en`,
                department: get('department'),
                salary: undefined,
                job_type: parseJobType(get('schedule') || get('employmentType') || get('recruitingCategory'))
            };
        });
    } catch { return []; }
}

async function fetchWorkday(token: string, company?: CompanyRow): Promise<Job[]> {
    let slug = '';
    let board = '';
    let detectedWd = '';
    let dbAppliedFacets: any = null;

    if (token.startsWith('{')) {
        try {
            const config = JSON.parse(token);
            if (config.appliedFacets) dbAppliedFacets = config.appliedFacets;
            if (config.url) token = config.url;
            else if (config.token) token = config.token;
        } catch { /* ignore */ }
    }

    if (token.startsWith('http')) {
        try {
            const parsed = new URL(token);
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            const hostParts = parsed.hostname.split('.');

            // Extract wd subdomain if present (e.g., company.wd3.myworkdayjobs.com)
            const wdPart = hostParts.find(p => /^wd\d+$/.test(p));
            if (wdPart) detectedWd = wdPart;

            const filteredParts = pathParts.filter(p => !['wday', 'cxs', 'jobs'].includes(p.toLowerCase()) && !/^[a-z]{2}-[a-z]{2}$/i.test(p));

            if (pathParts[0]?.toLowerCase() === 'recruiting' && pathParts.length >= 2) {
                slug = pathParts[1];
                board = pathParts.slice(2).join('/') || 'External';
            } else if (hostParts[0] && !hostParts[0].startsWith('wd')) {
                slug = hostParts[0];
                board = filteredParts.find(p => p !== slug) || filteredParts[0] || '';
            } else if (pathParts.length >= 2) {
                slug = pathParts[0];
                board = filteredParts.find(p => p !== slug) || filteredParts[1] || '';
            }
        } catch { /* ignore */ }
    } else {
        const parts = token.split('/').filter(Boolean);
        if (parts[0]?.toLowerCase() === 'recruiting' && parts.length >= 2) {
            slug = parts[1];
            board = parts.slice(2).join('/') || 'External';
        } else {
        slug = parts[0];
        board = parts.slice(1).join('/');
        }
    }

    if (!slug || !board) return [];

    // Wells Fargo uses myworkdaysite.com.
    const isWorkdaySite = slug === 'wf' || slug.includes('hcahealthcare');

    // Subdomains to try. If we detected one from the URL, put it first.
    const wds = ['wd3', 'wd1', 'wd5', 'wd103', 'wd107', 'wd108', 'wd12', 'wd2', 'wd10', 'wd8', 'wd6', 'wd4', 'wd9', 'wd1001'];
    if (detectedWd && wds.includes(detectedWd)) {
        wds.splice(wds.indexOf(detectedWd), 1);
        wds.unshift(detectedWd);
    }

    for (const wd of wds) {
        const ukFacetId = WORKDAY_UK_FACETS[slug] || WORKDAY_UK_FACETS['default'];
        // Try both slug.wd.domain and wd.domain
        const domains = isWorkdaySite
            ? [`${slug}.${wd}.myworkdaysite.com`, `${wd}.myworkdaysite.com`]
            : [`${slug}.${wd}.myworkdayjobs.com`, `${wd}.myworkdayjobs.com`];

        for (const domain of domains) {
            const apiUrl = `https://${domain}/wday/cxs/${slug}/${board}/jobs`;
            const publicBase = `https://${domain}/en-US/${board}`;

            try {
                let currentFacets: any = { locationCountry: [ukFacetId] };
                if (dbAppliedFacets && Object.keys(dbAppliedFacets).length > 0) {
                    // Use whatever facet key the company config specifies (e.g. locationHierarchy1 for NVIDIA)
                    currentFacets = dbAppliedFacets;
                }

                let res = await fetchWithTimeout(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                    body: JSON.stringify({
                        appliedFacets: currentFacets,
                        limit: 20, offset: 0, searchText: ''
                    })
                });

                if (!res.ok && !dbAppliedFacets) {
                    // Try alternate location facet (only if no explicit DB config)
                    currentFacets = { Location_Country: [ukFacetId] };
                    res = await fetchWithTimeout(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                        body: JSON.stringify({
                            appliedFacets: currentFacets,
                            limit: 20, offset: 0, searchText: ''
                        })
                    });
                }

                if (!res.ok) {
                    // Fallback: no facets
                    currentFacets = {};
                    res = await fetchWithTimeout(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                        body: JSON.stringify({ appliedFacets: currentFacets, limit: 20, offset: 0, searchText: '' })
                    });
                }

                if (!res.ok) {
                    continue;
                }

                const data = await res.json();
                let posts = data?.jobPostings || [];
                let total = data.total || 0;
                const facetWasApplied = Object.keys(currentFacets).length > 0;

                // Always fetch the global (no-facet) count so we can judge whether the UK
                // facet is actually filtering, or just returning the full board.
                let globalTotal = 0;
                try {
                    const globalRes = await fetchWithTimeout(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' })
                    });
                    if (globalRes.ok) {
                        const gd = await globalRes.json();
                        globalTotal = gd.total || 0;
                        // If facet returned 0 jobs but the board has jobs, try alternate
                        // facet key names before falling back to the full global board.
                        // Different Workday tenants use different keys:
                        //   locationCountry — most boards (default)
                        //   Country         — e.g. RBC, Baxter
                        //   Location_Country — e.g. Pfizer
                        if (posts.length === 0 && (gd.jobPostings || []).length > 0 && !dbAppliedFacets) {
                            // Different Workday tenants use different country facet keys.
                            // Country___Territory — RELX/Elsevier; locationMainGroup — Iberdrola.
                            for (const altKey of ['Country', 'Location_Country', 'Country___Territory', 'locationMainGroup']) {
                                try {
                                    const altRes = await fetchWithTimeout(apiUrl, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                                        body: JSON.stringify({ appliedFacets: { [altKey]: [ukFacetId] }, limit: 20, offset: 0, searchText: '' })
                                    });
                                    if (altRes.ok) {
                                        const cd = await altRes.json();
                                        const cPosts = cd.jobPostings || [];
                                        const cTotal = cd.total || 0;
                                        if (cPosts.length > 0 && cTotal < globalTotal) {
                                            posts = cPosts;
                                            total = cTotal;
                                            currentFacets = { [altKey]: [ukFacetId] };
                                            break;
                                        }
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                        // Still 0 after all facet attempts — fall back to full global board
                        if (posts.length === 0 && (gd.jobPostings || []).length > 0) {
                            posts = gd.jobPostings;
                            total = globalTotal;
                            currentFacets = {};
                        }
                    }
                } catch { /* ignore — proceed with facet results */ }

                if (posts.length === 0) {
                    if (isWorkdaySite) break;
                    continue;
                }

                const allJobs: Job[] = [];
                let offset = 0;

                // ── Step 1: Is the UK facet genuinely filtering? ─────────────────────
                // If faceted count ≈ global count (ratio ≥ 0.75), the facet is not
                // filtering by country at all.
                const facetReducedCount = facetWasApplied && globalTotal > 0 && (total / globalTotal) < 0.75;
                let finalFacets: any = (facetWasApplied && facetReducedCount)
                    ? (data.appliedFacets || currentFacets)
                    : {};

                let facetIsTrusted = facetWasApplied && facetReducedCount;

                // ── Step 2: Sample the first page for explicit non-UK locations ───────
                // Even a working facet can mis-fire. Also used to detect UK-only boards.
                let explicitNonUKCount = 0;
                let explicitUKCount = 0;
                for (const p of posts.slice(0, 20)) {
                    const loc = normalizeLocation(p.locationsText || p.bulletFields?.[0] || '');
                    const isUK = isUKLocation(loc);
                    const isAmbiguous = !loc || /\d+\s+locations?/.test(loc)
                        || /^(remote|flexible|hybrid|anywhere|worldwide|global|distributed|not specified|location negotiable|negotiable|tbd|various|see description)$/.test(loc);
                    if (isUK) explicitUKCount++;
                    else if (!isAmbiguous) explicitNonUKCount++;
                }

                if (facetIsTrusted && explicitNonUKCount > explicitUKCount) {
                    // Majority of sample is non-UK → facet is not filtering usefully.
                    // Switch to global fetch and update total so we paginate all jobs.
                    facetIsTrusted = false;
                    finalFacets = {};
                    total = globalTotal;
                }

                // ── Step 3: UK-only board detection ──────────────────────────────────
                // If the facet isn't filtering BUT the first page shows zero explicit
                // non-UK locations, this is almost certainly a UK-only job board
                // (e.g. Lloyds, Harrods, Railpen). Trust all results directly.
                if (!facetIsTrusted && explicitNonUKCount === 0) {
                    facetIsTrusted = true;
                    finalFacets = {}; // paginate without facet to get all jobs
                }

                while (offset < total || (offset === 0 && posts.length > 0)) {
                    let currentPosts = posts;
                    if (offset > 0) {
                        const nextRes = await fetchWithTimeout(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                            body: JSON.stringify({ appliedFacets: finalFacets, limit: 20, offset, searchText: '' })
                        });
                        if (nextRes.ok) {
                            const nextData = await nextRes.json();
                            currentPosts = nextData.jobPostings || [];
                        } else break;
                    }

                    if (currentPosts.length === 0) break;
                    
                    const limitDetails = pLimit(10);
                    const enrichedPosts = await Promise.all(currentPosts.map((j: any) => limitDetails(async () => {
                        let job_type_val = j.timeType || j.bulletFields;
                        if (!job_type_val || !parseJobType(job_type_val)) {
                            try {
                                const detUrl = apiUrl.replace(/\/jobs$/, '') + j.externalPath;
                                const dRes = await fetchWithTimeout(detUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                                if (dRes.ok) {
                                    const dData = await dRes.json();
                                    if (dData.jobPostingInfo?.timeType) {
                                        job_type_val = dData.jobPostingInfo.timeType;
                                    }
                                }
                            } catch { /* ignore */ }
                        }
                        return { ...j, resolvedJobType: job_type_val };
                    })));

                    allJobs.push(...enrichedPosts.map((j: any) => ({
                        title: j.title || '',
                        location: j.locationsText || j.bulletFields?.[0] || '',
                        url: `${publicBase}${j.externalPath}`,
                        department: '',
                        salary: undefined,
                        job_type: parseJobType(j.resolvedJobType),
                        verified: facetIsTrusted,
                        atsProvider: 'workday',
                        locationsText: j.locationsText || j.bulletFields?.[0] || ''
                    })));

                    offset += 20;
                    await sleep(300);
                }

                // ── Ireland pass: always run for every company ───────────────────────
                // Workday's UK country facet filters out Ireland jobs server-side.
                // We do a fast targeted search for "ireland" to recover any Irish-city
                // postings without paginating the full global board. Deduplicates by URL.
                try {
                    const seenUrls = new Set(allJobs.map(j => j.url));
                    let irOffset = 0;
                    let irTotal = 20; // start small — update from first response
                    while (irOffset < irTotal) {
                        const irRes = await fetchWithTimeout(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                            body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: irOffset, searchText: 'ireland' })
                        });
                        if (!irRes.ok) break;
                        const irData = await irRes.json();
                        const irPosts: any[] = irData.jobPostings || [];
                        if (!irPosts.length) break;
                        irTotal = Math.min(irData.total || irTotal, 200); // cap at 200 safety limit
                        const limitDetails = pLimit(10);
                        const enrichedIrPosts = await Promise.all(irPosts.map((j: any) => limitDetails(async () => {
                            let job_type_val = j.timeType || j.bulletFields;
                            if (!job_type_val || !parseJobType(job_type_val)) {
                                try {
                                    const detUrl = apiUrl.replace(/\/jobs$/, '') + j.externalPath;
                                    const dRes = await fetchWithTimeout(detUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                                    if (dRes.ok) {
                                        const dData = await dRes.json();
                                        if (dData.jobPostingInfo?.timeType) {
                                            job_type_val = dData.jobPostingInfo.timeType;
                                        }
                                    }
                                } catch { /* ignore */ }
                            }
                            return { ...j, resolvedJobType: job_type_val };
                        })));

                        for (const j of enrichedIrPosts) {
                            const jobUrl = `${publicBase}${j.externalPath}`;
                            if (!seenUrls.has(jobUrl)) {
                                seenUrls.add(jobUrl);
                                allJobs.push({
                                    title: j.title || '',
                                    location: j.locationsText || j.bulletFields?.[0] || '',
                                    url: jobUrl,
                                    department: '',
                                    salary: undefined,
                                    job_type: parseJobType(j.resolvedJobType),
                                    verified: false,
                                    atsProvider: 'workday',
                                });
                            }
                        }
                        irOffset += 20;
                        if (irOffset < irTotal) await sleep(300);
                    }
                } catch { /* Ireland pass is best-effort — never block UK results */ }

                return allJobs;
            } catch (err: any) {
                // Silently ignore "fetch failed" as it's expected when brute-forcing subdomains
                if (!err.message?.includes('fetch failed')) {
                    console.log(`[WORKDAY] Error fetching ${domain}: ${err.message}`);
                }
                continue;
            }
        }
    }
    return [];
}

export async function fetchOracleCloud(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    try {
        let domain = '';
        let site = '';
        if (token.includes('|')) {
            [domain, site] = token.split('|');
        } else if (token.startsWith('http')) {
            try {
                const u = new URL(token);
                domain = u.hostname;
                const match = u.pathname.match(/\/sites\/([^\/]+)/);
                if (match) site = match[1];
            } catch (e) {
                domain = token;
            }
        } else {
            domain = token;
        }

        if (!site) site = 'CX_1'; // Default site for Oracle Cloud HCM
        
        domain = domain.trim().replace(/\/+$/, '');
        
        // Fix incomplete domains from legacy data (e.g., jpmc.fa or *.fa.ocs)
        if (!domain.includes('.com') && !domain.includes('.co.uk') && !domain.includes('.org') && domain.includes('.fa')) {
            domain += '.oraclecloud.com';
        }

        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const url = `https://${domain}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.workLocation,requisitionList.otherWorkLocations,requisitionList.secondaryLocations,flexFieldsFacet.values,requisitionList.requisitionFlexFields&finder=findReqs;siteNumber=${site},facetsList=LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS,limit=${limit},offset=${offset},sortBy=POSTING_DATES_DESC`;
            
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) break;

        const data: any = await res.json();
            const payload = data.items?.[0];
            if (!payload) break;

            const reqList = payload.requisitionList || [];
            for (const j of reqList) {
                let job_type_val = j.JobSchedule || j.JobType || j.WorkerType || j.employmentType;

                if (!parseJobType(job_type_val)) {
                    try {
                        const detUrl = `https://${domain}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?finder=ById;Id=%22${j.Id}%22,siteNumber=%22${site}%22`;
                        const dRes = await fetchWithTimeout(detUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                        if (dRes.ok) {
                            const dData = (await dRes.json()) as any;
                            job_type_val = dData.items?.[0]?.JobSchedule || dData.items?.[0]?.JobType || dData.items?.[0]?.WorkerType || job_type_val;
                        }
                    } catch { /* ignore */ }
                    await sleep(50);
                }

                // Next (and similar Oracle boards) often omit JobSchedule and only
                // publish hours in the short description, e.g. "36 hrs p/w".
                if (!parseJobType(job_type_val) && j.ShortDescriptionStr) {
                    const fromHours = inferJobTypeFromListing({ cardText: j.ShortDescriptionStr });
                    if (fromHours) job_type_val = fromHours;
                }

                allJobs.push({
                    title: j.Title || '',
                    location: j.PrimaryLocation || j.workLocation?.Region || '',
                    url: `https://${domain}/hcmUI/CandidateExperience/en/sites/${site}/job/${j.Id}`,
                    department: j.Organization || '',
                    salary: undefined,
                    job_type: parseJobType(job_type_val)
                });
            }

            const totalCount = payload.TotalJobsCount || 0;
            offset += limit;
            hasMore = offset < totalCount;
            
            // Safety bound: Oracle HCM usually maxes out or times out if >10000 jobs are listed in a single site
            if (offset > 10000) break;
        }

        return allJobs;
    } catch (e) {
        return allJobs; 
    }
}

async function fetchWipro(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let pageNumber = 0;
    while (true) {
        try {
            const r = await fetchWithTimeout("https://careers.wipro.com/services/recruiting/v1/jobs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0",
                },
                body: JSON.stringify({
                    locale: "en_US",
                    pageNumber: pageNumber,
                    sortBy: "",
                    keywords: "",
                    location: "United Kingdom",
                    facetFilters: {},
                    brand: "",
                    skills: [],
                    categoryId: 0,
                    alertId: "",
                    rcmCandidateId: ""
                })
            });
            if (!r.ok) break;
            const d = await r.json();
            const results = d.jobSearchResult || [];
            if (results.length === 0) break;

            allJobs.push(...results.map((item: any) => {
                const j = item.response;
                return {
                    title: j.unifiedStandardTitle || "",
                    location: (j.jobLocationShort && j.jobLocationShort[0]) || "",
                    url: `https://careers.wipro.com/job/${j.unifiedUrlTitle}/${j.id}-en_US`,
                    department: (j.custRMKMappingPicklist && j.custRMKMappingPicklist[0]) || "",
                    salary: undefined
                };
            }));

            if (results.length < 10) break; // Wipro seems to return 10 per page by default
            pageNumber++;
            await sleep(300);
        } catch { break; }
    }
    return allJobs;
}

async function fetchSuccessFactors(token: string): Promise<Job[]> {
    try {
        let domain = token;
        
        // If the token is just a company ID like 'bmwag', construct the default legacy URL to extract the real CSB domain
        if (!token.includes('.') && !token.includes('http')) {
            token = `https://career2.successfactors.eu/careers?company=${token}`;
        }
        
        if (token.includes('http')) {
            const redirectRes = await fetchWithTimeout(token, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
            const htmlText = await redirectRes.text();
            
            const csbMatch = htmlText.match(/https?:\/\/([^\/]+)\/services\/security\/logoutp/i) || 
                             htmlText.match(/https?:\/\/([^\/]+)\/search\/?\?/i) ||
                             htmlText.match(/https?:\/\/(jobdetails\.[^\/\"']+)/i) ||
                             htmlText.match(/https?:\/\/(careers\.[^\/\"']+)/i);
            if (csbMatch) {
                domain = csbMatch[1];
            } else {
                try {
                    domain = new URL(token).hostname;
                } catch {
                    return [];
                }
            }
        } else if (token.includes('.')) {
            domain = token.replace(/^https?:\/\//, '').split('/')[0];
        } else {
            return [];
        }

        const csbBaseUrl = `https://${domain}`;

        // Prefer JSON API; many Nestlé/GKN tenants return "Error retrieving jobs" — fall back to HTML.
        const apiJobs = await fetchSuccessFactorsJsonApi(csbBaseUrl);
        if (apiJobs.length) return apiJobs;

        return await fetchSuccessFactorsHtmlSearch(csbBaseUrl, { preferUk: true });
    } catch (e: any) {
        console.error(`[SuccessFactors] ${token} error: ${e.message}`);
        return [];
    }
}

async function fetchSuccessFactorsJsonApi(csbBaseUrl: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    try {
        const searchUrl = `${csbBaseUrl}/search/?q=`;
        const initRes = await fetchWithTimeout(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!initRes.ok) return [];

        const initHtml = await initRes.text();
        const headersAny = initRes.headers as Headers & { getSetCookie?: () => string[] };
        const setCookieList = typeof headersAny.getSetCookie === 'function'
            ? headersAny.getSetCookie()
            : [];
        const cookies = (setCookieList.length > 0
            ? setCookieList
            : [initRes.headers.get('set-cookie') || ''].filter(Boolean)
        )
            .map(c => c.split(';')[0].trim())
            .filter(pair => pair.includes('='))
            .join('; ');

        const csrfMatch = initHtml.match(/"X-CSRF-Token"\s*:\s*"([^"]+)"/i);
        if (!csrfMatch) return [];
        const csrf = csrfMatch[1];

        let offset = 0;
        const limit = 100;
        while (true) {
            const apiRes = await fetchWithTimeout(`${csbBaseUrl}/services/recruiting/v1/jobs`, {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrf,
                    ...(cookies ? { 'Cookie': cookies } : {}),
                },
                body: JSON.stringify({
                    searchFilters: { searchQuery: "" },
                    locale: "en_US",
                    limit,
                    offset
                })
            });

            if (!apiRes.ok) break;
            const data = await apiRes.json();
            if (data?.error) break;
            const jobReqs = data.jobSearchResult || [];
            if (jobReqs.length === 0) break;

            for (const j of jobReqs) {
                if (!j.response) continue;
                const title = j.response.unifiedStandardTitle || j.response.title || j.response.jobTitle || '';
                let location = j.response.location || j.response.city || j.response.country || j.response.department || '';
                if (!location && j.response.customField5) location = j.response.customField5;
                const urlTitle = j.response.urlTitle || j.response.unifiedUrlTitle || '';
                const jobId = j.response.id || '';
                const jobUrl = `${csbBaseUrl}/job/${urlTitle}/${jobId}-en_US`;
                if (title && jobId) {
                    allJobs.push({
                        title,
                        location,
                        url: jobUrl,
                        department: '',
                        job_type: parseJobType([title, j.response.department, j.response.jobType, j.response.employmentType]),
                        salary: undefined,
                        verified: false,
                        atsProvider: 'successfactors'
                    });
                }
            }

            offset += jobReqs.length;
            if (offset >= (data.totalJobs || 0)) break;
            await sleep(300);
        }
    } catch {
        return [];
    }
    return allJobs;
}

/** HTML list scrape for SuccessFactors CSB boards when the JSON API is blocked. */
async function fetchSuccessFactorsHtmlSearch(
    csbBaseUrl: string,
    opts?: { preferUk?: boolean }
): Promise<Job[]> {
    const byUrl = new Map<string, Job>();
    const pageSize = 10; // SF classic search pages typically show 10 rows
    // "GB" ranks UK rows more reliably than "United Kingdom" (which drifts to US after early pages).
    const queries = opts?.preferUk
        ? [
            `${csbBaseUrl}/search/?q=&locationsearch=${encodeURIComponent('GB')}`,
            `${csbBaseUrl}/search/?q=&locationsearch=${encodeURIComponent('United Kingdom')}`,
            `${csbBaseUrl}/search/?q=`,
          ]
        : [`${csbBaseUrl}/search/?q=`];

    for (const baseSearch of queries) {
        let emptyPages = 0;
        let nonUkStreak = 0;
        for (let startrow = 0; startrow < 5000; startrow += pageSize) {
            const pageUrl = `${baseSearch}&startrow=${startrow}`;
            const res = await fetchWithTimeout(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) break;
            const html = await res.text();
            const $ = cheerio.load(html);
            let pageNew = 0;
            let pageUk = 0;

            $('a.jobTitle-link, a[href*="/job/"]').each((_, el) => {
                const href = String($(el).attr('href') || '').trim();
                if (!href || !/\/job\//i.test(href)) return;
                const title = $(el).text().replace(/\s+/g, ' ').trim();
                if (!title) return;
                const abs = href.startsWith('http') ? href : `${csbBaseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
                const row = $(el).closest('tr.data-row, tr, li, article, div');
                let location = row.find('span.jobLocation').first().text().replace(/\s+/g, ' ').trim();
                location = location.replace(/\+\d+\s*more.*$/i, '').trim();
                if (!location) location = '';

                if (opts?.preferUk) {
                    const uk = isUKJob({
                        locations: location ? [location] : [],
                        isRemote: /\bremote\b/i.test(location),
                        isTrustedSource: false,
                    });
                    if (!uk) return;
                    pageUk++;
                }

                if (!byUrl.has(abs)) {
                    byUrl.set(abs, {
                        title,
                        location: location || (opts?.preferUk ? 'United Kingdom' : ''),
                        url: abs.split('?')[0],
                        department: row.find('span.jobDepartment, span.jobFacility').first().text().replace(/\s+/g, ' ').trim(),
                        job_type: inferJobTypeFromListing({
                            employmentField: row.find('.jobShifttype, .colShifttype, span.jobShifttype').first().text(),
                        }),
                        salary: undefined,
                        verified: false,
                        atsProvider: 'successfactors',
                    });
                    pageNew++;
                }
            });

            if (opts?.preferUk) {
                if (pageUk === 0) {
                    nonUkStreak++;
                    // Nestlé "United Kingdom" search pads later pages with US roles — stop early.
                    if (nonUkStreak >= 3 && byUrl.size > 0) break;
                } else {
                    nonUkStreak = 0;
                }
            }

            if (pageNew === 0) {
                emptyPages++;
                if (emptyPages >= 2) break;
            } else {
                emptyPages = 0;
            }

            const startrows = [...html.matchAll(/startrow=(\d+)/g)].map(m => Number(m[1]));
            const maxStart = startrows.length ? Math.max(...startrows) : startrow;
            if (startrow >= maxStart && pageNew < pageSize) break;

            await sleep(200);
        }
        if (byUrl.size > 0) break;
    }

    return Array.from(byUrl.values());
}

async function fetchHibob(token: string): Promise<Job[]> {
    try {
        // token is the company identifier, e.g. "ustwo"
        const domain = token.includes('.') ? token : `${token}.careers.hibob.com`;
        const companyId = token.split('.')[0];

        const r = await fetchWithTimeout(`https://${domain}/api/job-ad`, {
            headers: {
                'Accept': 'application/json',
                'companyidentifier': companyId,
                'referer': `https://${domain}/jobs`
            }
        });
        if (!r.ok) return [];
        const d = await r.json();
        return (d.jobAdDetails || []).map((j: any) => ({
            title: j.title || '',
            location: `${j.site || ''} ${j.country || ''}`.trim(),
            url: `https://${domain}/jobs/${j.id}`,
            department: typeof j.department === 'string' ? j.department : (j.department?.name || ''),
            salary: undefined,
            job_type: parseJobType(j.employmentType || j.type),
        }));
    } catch { return []; }
}

export async function fetchEightfold(token: string): Promise<Job[]> {
    let host = '';
    let apiDomain = '';
    let country = '';

    const parts = token.split('|');
    if (parts.length === 2 && (parts[1].includes('.com') || parts[1].includes('.ai'))) {
        host = parts[0];
        apiDomain = parts[1];
    } else {
        const domain = parts[0];
    if (!domain) return [];
        country = parts[1] || '';
        
        if (!domain.includes('.')) {
            host = domain + '.eightfold.ai';
            apiDomain = domain + '.com';
        } else if (domain === 'ukg.com' || domain === 'app.eightfold.ai') {
            host = 'app.eightfold.ai';
            apiDomain = domain === 'app.eightfold.ai' ? 'ukg.com' : domain;
        } else {
            host = 'jobs.' + domain;
            apiDomain = domain;
        }
    }

    const allJobs: Job[] = [];
    let start = 0;
    const PAGE_SIZE = 10;
    // Some boards (Vodafone) honour filter_country; others (Ericsson) need location=
    const countryQs = country
        ? `&filter_country=${encodeURIComponent(country)}&location=${encodeURIComponent(country)}`
        : '';

    while (true) {
        try {
            const url = `https://${host}/api/pcsx/search?domain=${apiDomain}&query=&start=${start}&sort_by=timestamp${countryQs}`;

            const res = await fetchWithTimeout(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0',
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) break;
            const d = await res.json();
            const positions = d.data?.positions || [];
            if (positions.length === 0) break;

            allJobs.push(...positions.map((p: any) => ({
                title: p.name || '',
                location: p.locations?.[0] || p.standardizedLocations?.[0] || '',
                url: `https://${host}${p.positionUrl}${apiDomain !== host.split('.')[0] + '.com' && apiDomain !== host ? '?domain=' + apiDomain : ''}`,
                department: p.department || '',
                job_type: parseJobType([p.name, p.department, p.employmentType, p.workType, p.type]),
                salary: (typeof p !== 'undefined' && (p as any)?.salary) ? String(typeof (p as any).salary === 'object' ? JSON.stringify((p as any).salary) : (p as any).salary) : undefined
            })));

            if (positions.length < PAGE_SIZE) break;
            start += positions.length;
            await sleep(500);
        } catch { break; }
    }
    return allJobs;
}

async function fetchICIMS(token: string): Promise<Job[]> {
    try {
        const allJobs: Job[] = [];
        let pr = 0;

        while (true) {
            const url = `https://${token}.icims.com/jobs/search?pr=${pr}&in_iframe=1`;
            const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) break;

            const html = await res.text();
            
            // Check for Jibe redirect (e.g., SiriusXM / Adswizz)
            const jibeMatch = html.match(/window\.top\.location\.href\s*=\s*['"]([^'"]+)['"]/i);
            if (jibeMatch) {
                const jibeUrl = jibeMatch[1].replace(/\\\//g, '/'); // Fix escaped slashes
                const domainMatch = jibeUrl.match(/^https?:\/\/([^\/]+)/i);
                if (domainMatch) {
                    console.log(`[iCIMS] Detected Jibe redirect to ${domainMatch[1]}`);
                    return fetchJibe(domainMatch[1]);
                }
            }

            const $ = cheerio.load(html);
            const cards = $('.iCIMS_JobsTable .iCIMS_JobCardItem');
            
            if (cards.length === 0) break;

            cards.each((_, el) => {
                const title = $(el).find('h3').text().trim();
                const jobUrl = $(el).find('a.iCIMS_Anchor').attr('href') || '';
                const location = $(el).find('.header span').not('.sr-only').text().replace(/\s+/g, ' ').trim();
                const department = $(el).find('dt:contains("Category")').next('dd').text().replace(/\s+/g, ' ').trim();
                const jobTypeRaw = $(el).find('dt:contains("Position Type"), dt:contains("Job Type"), dt:contains("Employment Type")').next('dd').text().replace(/\s+/g, ' ').trim();

                if (title && jobUrl) {
                    allJobs.push({
                        title,
                        location,
                        url: jobUrl.split('?')[0],
                        department,
                        salary: undefined,
                        job_type: parseJobType(jobTypeRaw)
                    });
                }
            });

            if (cards.length < 5) break;
            pr++;
        }
        return allJobs;
    } catch (e: any) {
        console.error(`[iCIMS] ${token} error: ${e.message}`);
        return [];
    }
}

async function fetchRippling(token: string): Promise<Job[]> {
    // Rippling uses Next.js - job data is embedded in __NEXT_DATA__ script tag
    try {
        const url = `https://ats.rippling.com/${token}/jobs`;
        const r = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
        });
        if (!r.ok) return [];
        const html = await r.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) return [];
        const data = JSON.parse(match[1]);
        
        const buildId = data.buildId;
        const allItems: any[] = [];
        
        // Extract page 0 jobs
        const queries = data?.props?.pageProps?.dehydratedState?.queries || [];
        const jobQuery = queries.find((q: any) => q?.queryKey?.includes('job-posts'));
        
        if (jobQuery?.state?.data) {
            allItems.push(...(jobQuery.state.data.items || []));
            
            const totalPages = jobQuery.state.data.totalPages || 1;
            for (let p = 1; p < totalPages; p++) {
                try {
                    const pageUrl = `https://ats.rippling.com/_next/data/${buildId}/${token}/jobs.json?page=${p}`;
                    const pageRes = await fetchWithTimeout(pageUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (pageRes.ok) {
                        const pageData = await pageRes.json();
                        const pageQueries = pageData?.pageProps?.dehydratedState?.queries || [];
                        const pageJobQuery = pageQueries.find((q: any) => q?.queryKey?.includes('job-posts'));
                        if (pageJobQuery?.state?.data?.items) {
                            allItems.push(...pageJobQuery.state.data.items);
                        }
                    }
                } catch (e) {
                    console.error(`[Rippling] ${token} error fetching page ${p}:`, e);
                }
            }
        }

        return allItems.map((j: any) => ({
            title: j.name || '',
            location: (j.locations || []).map((l: any) => l.name || l.city || '').join(', '),
            url: j.url || `https://ats.rippling.com/${token}/jobs/${j.id}`,
            department: j.department?.name || '',
            salary: undefined,
            job_type: parseJobType(j.workType || j.employmentType || j.type)
        }));
    } catch { return []; }
}

async function fetchAmazon(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    const batchSize = 100;
    let offset = 0;
    while (true) {
        const url = `https://www.amazon.jobs/en/search.json?offset=${offset}&result_limit=${batchSize}&sort=relevant&job_type%5B%5D=Full-Time&country%5B%5D=GBR`;
        try {
            const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) break;
            const data: any = await res.json();
            if (!data.jobs || data.jobs.length === 0) break;
            const ukJobs = data.jobs.filter((j: any) => j.country_code === 'UK' || j.country_code === 'GB' || j.country_code === 'GBR');
            for (const job of ukJobs) {
                const locParts = [job.normalized_location || job.city, job.state].filter(Boolean);
                allJobs.push({
                    title: job.title || '',
                    location: locParts.join(', ') || 'United Kingdom',
                    url: `https://www.amazon.jobs${job.job_path}`,
                    department: job.job_category || job.job_family_name || 'Various',
                    job_type: parseJobType([job.title, job.job_category, job.job_family_name, job.job_schedule_type]),
                    salary: undefined,
                    atsProvider: 'amazon'
                });
            }
            if (offset >= data.hits) break;
            offset += batchSize;
            await sleep(500);
        } catch { break; }
    }
    return allJobs;
}

async function fetchJPMorgan(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let offset = 0;
    let total = 1;

    // Default to CX_1001 and London/UK ID
    let siteNumber = 'CX_1001';
    let locationId = '300000000289276';

    // If token is a full URL, try to extract siteNumber and locationId
    if (token.startsWith('http')) {
        const siteMatch = token.match(/sites\/([^/?#]+)/);
        if (siteMatch) siteNumber = siteMatch[1];

        const locMatch = token.match(/locationId=([^&]+)/);
        if (locMatch) locationId = locMatch[1];
    }

    try {
        while (offset < total) {
            const url = `https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=all&finder=findReqs;siteNumber=${siteNumber},facetsList=LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS,limit=25,locationId=${locationId},offset=${offset},sortBy=POSTING_DATES_DESC`;
            const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) {
                console.log(`[JPMC] API returned status ${res.status} at offset ${offset}`);
                break;
            }
            const data: any = await res.json();
            if (!data.items || data.items.length === 0) {
                if (offset === 0) console.log(`[JPMC] No items returned from API`);
                break;
            }
            const pageData = data.items[0];
            total = pageData.TotalJobsCount || 0;
            if (pageData.requisitionList) {
                for (const job of pageData.requisitionList) {
                    allJobs.push({
                        title: job.Title || '',
                        location: job.PrimaryLocation || 'United Kingdom',
                        url: `https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/${siteNumber}/job/${job.Id}`,
                        department: '',
                        salary: undefined
                    });
                }
            } else { break; }
            offset += 25;
            await sleep(500);
        }
    } catch (e: any) {
        console.error(`[JPMC] Fetch error at offset ${offset}:`, e.message);
    }
    return allJobs;
}

async function fetchGoldmanSachs(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let page = 1;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0' });
        const pageSession = await context.newPage();

        while (true) {
            const url = `https://higher.gs.com/results?LOCATION=Birmingham%7CLondon&page=${page}&sort=RELEVANCE`;
            await pageSession.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            await pageSession.waitForTimeout(4000);
            const html = await pageSession.content();
            const $ = cheerio.load(html);
            let found = 0;
            $('a.text-decoration-none[href^="/roles/"]').each((i: number, el: any) => {
                const link = $(el).attr('href');
                const title = $(el).find('span.gs-text').first().text().trim();
                const location = $(el).find('[data-testid="location"]').first().text().replace(/·/g, ', ').replace(/\s+/g, ' ').trim();
                const department = $(el).parent().find('button.gs-tag__button').text().trim();
                if (isValidJobTitle(title) && link) {
                    allJobs.push({
                        title,
                        location: location || 'London, United Kingdom',
                        url: `https://higher.gs.com${link}`,
                        department: department || 'General',
                        salary: undefined
                    });
                    found++;
                }
            });
            if (found === 0) break;
            page++;
        }
    } catch (e) { console.error("Goldman Sachs Error:", e); } finally {
        if (context) await context.close().catch(() => {});
    }
    return allJobs;
}

async function fetchGoogle(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let page = 1;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0', viewport: { width: 1280, height: 1080 } });
        const pageSession = await context.newPage();

        while (true) {
            const url = `https://www.google.com/about/careers/applications/jobs/results?location=United%20Kingdom&page=${page}`;
            await pageSession.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            try { await pageSession.waitForSelector('.sMn82b', { timeout: 10000 }); } catch { break; }
            await pageSession.waitForTimeout(2000);
            const html = await pageSession.content();
            const $ = cheerio.load(html);
            let found = 0;
            $('div.sMn82b').each((i: number, el: any) => {
                const title = $(el).find('h3.Qk805e').text().trim() || $(el).find('h3').text().trim();
                let location = $(el).find('span.r0wTof').text().trim() || 'United Kingdom';
                if (location.length > 5) {
                    const half = Math.floor(location.length / 2);
                    if (location.substring(0, half) === location.substring(half)) location = location.substring(0, half);
                }
                const linkStr = $(el).html()?.match(/jobs\/results\/[a-zA-Z0-9-]+/);
                if (isValidJobTitle(title) && linkStr) {
                    allJobs.push({
                        title,
                        location,
                        url: `https://www.google.com/about/careers/applications/${linkStr[0]}`,
                        department: 'General',
                        salary: undefined
                    });
                    found++;
                }
            });
            if (found === 0) break;
            page++;
        }
    } catch (e) { console.error("Google Error:", e); } finally {
        if (context) await context.close().catch(() => {});
    }
    const uniqueMap = new Map();
    for (const j of allJobs) { uniqueMap.set(j.url, j); }
    return Array.from(uniqueMap.values());
}

// ─── Meta / Facebook Jobs Fetcher ─────────────────────────────────────────────
// Scrapes metacareers.com using Playwright since it is a heavy React SPA
async function fetchMeta(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0',
            viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();

        // Use provided token as search URL if it's a full URL
        const searchUrl = token.startsWith('http') ? token : 'https://www.metacareers.com/jobs?offices[0]=London%2C%20England';
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(8000);

        // Scroll and load all results
        let prevHeight = 0;
        for (let i = 0; i < 40; i++) {
            const currHeight: number = await page.evaluate(() => document.body.scrollHeight);
            if (currHeight === prevHeight) break;
            prevHeight = currHeight;
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);
        }

        const html = await page.content();
        const $ = cheerio.load(html);

        $('a').each((_, el) => {
            const anchor = $(el);
            const href = anchor.attr('href') || '';
            const card = anchor.closest('[class*="jobsearch"], [class*="job-"], article, li');
            const title = (
                anchor.find('[class*="title"], h2, h3, strong').first().text().trim() ||
                anchor.text().trim()
            );
            const locationText = card.find('[class*="location"], [class*="office"]').first().text().trim();

            if (!isValidJobTitle(title)) return;

            allJobs.push({
                title,
                location: locationText || 'London, United Kingdom',
                url: href.startsWith('http') ? href : `https://www.metacareers.com${href}`,
                department: card.find('[class*="department"], [class*="team"]').first().text().trim() || '',
                salary: undefined,
            });
        });

        await context.close();
    } catch (e) {
        console.error('Meta scraper error:', e);
        if (context) await context.close().catch(() => {});
    }

    // Deduplicate by URL
    return Array.from(new Map(allJobs.map(j => [j.url, j])).values());
}

// ─── LinkedIn Jobs Fetcher ────────────────────────────────────────────────────
// Scrapes public LinkedIn job search pages to bypass login walls
async function fetchLinkedin(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    
    // Normalize URL: convert /company/SLUG/jobs/ to /jobs/SLUG-jobs-worldwide/
    let targetUrl = token;
    if (token.includes('linkedin.com/company/')) {
        const slugMatch = token.match(/company\/([^/]+)/);
        if (slugMatch) {
            targetUrl = `https://www.linkedin.com/jobs/${slugMatch[1]}-jobs-worldwide/`;
        }
    }

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 1000 }
        });
        const page = await context.newPage();
        
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Try to dismiss any sign-in modals that appear
        try {
            await page.keyboard.press('Escape');
            const closeBtn = await page.$('button[aria-label="Dismiss"]');
            if (closeBtn) await closeBtn.click();
        } catch { /* ignore */ }

        // Scroll to load more jobs
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1500);
        }

        const jobs = await page.evaluate(() => {
            const results: any[] = [];
            // Selectors for public LinkedIn job search cards
            const cards = document.querySelectorAll('.jobs-search__results-list > li, .base-search-card');
            cards.forEach(card => {
                const titleEl = card.querySelector('.base-search-card__title, .job-search-card__title');
                const locEl = card.querySelector('.job-search-card__location');
                const linkEl = card.querySelector('a.base-card__full-link, a.base-search-card__title-link');
                const deptEl = card.querySelector('.base-search-card__subtitle');

                if (titleEl && linkEl) {
                    results.push({
                        title: titleEl.textContent?.trim() || '',
                        location: locEl?.textContent?.trim() || '',
                        url: (linkEl as HTMLAnchorElement).href.split('?')[0],
                        department: deptEl?.textContent?.trim() || ''
                    });
                }
            });
            return results;
        });

        allJobs.push(...jobs);
        await context.close();
    } catch (e) {
        console.error('LinkedIn scraper error:', e);
        if (context) await context.close().catch(() => {});
    }

    return allJobs;
}

// ─── Publicis Groupe Fetcher ──────────────────────────────────────────────────
// Scrapes Publicis using Playwright to handle its Angular SPA
async function fetchPublicis(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    const targetUrl = token.startsWith('http') ? token : 'https://careers.publicisgroupe.com/jobs';
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0',
        });
        const page = await context.newPage();
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000); // Wait for Angular to load jobs

        const jobs = await page.evaluate(() => {
            const results: any[] = [];
            // Target Publicis mat-expansion-panels
            const cards = document.querySelectorAll('mat-expansion-panel, .job-card, [class*="job-item"], tr.job-row');
            cards.forEach(card => {
                const titleEl = card.querySelector('.job-title-link, .job-title, [class*="title"], h3, h4, a');
                const locEl = card.querySelector('.job-card-column-value, .job-location, [class*="location"], .office');
                const linkEl = card.querySelector('a.job-title-link, a');
                
                if (titleEl && linkEl) {
                    const title = titleEl.textContent?.trim() || '';
                    if (title) {
                        results.push({
                            title,
                            location: locEl?.textContent?.trim() || 'United Kingdom',
                            url: (linkEl as HTMLAnchorElement).href,
                            department: ''
                        });
                    }
                }
            });
            return results;
        });

        for (const j of jobs) {
            if (isValidJobTitle(j.title)) {
                allJobs.push(j);
            }
        }

        await context.close();
    } catch (e) {
        console.error('Publicis scraper error:', e);
        if (context) await context.close().catch(() => {});
    }
    return allJobs;
}

async function fetchNHS(token: string): Promise<Job[]> {
    const startUrl = token.startsWith('http') ? token : `https://www.jobs.nhs.uk/candidate/search/results?keyword=${encodeURIComponent(token)}`;
    const allJobs: Job[] = [];
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/122.0.0.0',
            viewport: { width: 1280, height: 800 },
            extraHTTPHeaders: {
                'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Upgrade-Insecure-Requests': '1',
            }
        });
        const page = await context.newPage();
        await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 90000 });

        // Handle cookie banner if present
        try {
            const cookieButton = await page.$('button#nhsuk-cookie-banner__link_accept_analytics');
            if (cookieButton) {
                await cookieButton.click();
                await page.waitForTimeout(2000);
            }
        } catch { /* ignore */ }

        // Scroll down to ensure jobs are loaded/visible
        await page.evaluate(() => window.scrollTo(0, 1000));
        await page.waitForTimeout(3000);

        // Wait for at least one job link to appear
        try {
            await page.waitForSelector('a[href*="/candidate/jobadvert/"]', { timeout: 15000 });
        } catch { }

        // Extract all job links
        const jobLinks = await page.$$eval('a[href*="/candidate/jobadvert/"]', links => {
            return links.map(a => {
                const li = a.closest('li');
                return {
                    title: a.textContent?.trim() || '',
                    url: (a as HTMLAnchorElement).href,
                    containerText: li
                        ? (li as HTMLElement).innerText
                        : (a.parentElement?.parentElement?.innerText || ''),
                };
            });
        });

        const pushJobs = (links: any[]) => {
            for (const link of links) {
                if (!link.title || !link.url) continue;
                const lines = link.containerText.split('\n').map((l: string) => l.trim()).filter(Boolean);
                const agency = lines[1] || 'NHS';
                const locationLine =
                    lines.find((l: string) =>
                        /\b(united kingdom|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|bristol|glasgow|edinburgh|liverpool|sheffield|nottingham|newcastle|cardiff|belfast|cambridge|oxford|remote)\b/i.test(
                            l,
                        ),
                    ) ||
                    lines[2] ||
                    'United Kingdom';
                const jobType = inferJobTypeFromListing({ cardText: link.containerText });
                allJobs.push({
                    title: link.title,
                    url: link.url,
                    location: locationLine,
                    department: agency,
                    ...(jobType ? { job_type: jobType } : {}),
                    verified: true,
                });
            }
        };

        pushJobs(jobLinks);

        // Pagination loop
        let pageNum = 2;
        const baseSearchUrl = startUrl.replace(/#.*$/, ''); // Strip fragment so &page= works
        while (true) {
            const nextUrl = baseSearchUrl.includes('?') ? `${baseSearchUrl}&page=${pageNum}` : `${baseSearchUrl}?page=${pageNum}`;
            await page.goto(nextUrl, { waitUntil: 'networkidle', timeout: 60000 });
            await page.evaluate(() => window.scrollTo(0, 1000));
            await page.waitForTimeout(2000);

            const pageLinks = await page.$$eval('a[href*="/candidate/jobadvert/"]', links => {
                return links.map(a => {
                    const li = a.closest('li');
                    return {
                        title: a.textContent?.trim() || '',
                        url: (a as HTMLAnchorElement).href,
                        containerText: li
                            ? (li as HTMLElement).innerText
                            : (a.parentElement?.parentElement?.innerText || ''),
                    };
                });
            });

            if (pageLinks.length === 0) break;

            // Check if we are seeing the same jobs again (end of pagination)
            const firstNewJobUrl = pageLinks[0].url;
            if (allJobs.some(j => j.url === firstNewJobUrl)) break;

            pushJobs(pageLinks);
            pageNum++;

            // Optional: safety break at 500 pages (5000 jobs)
            if (pageNum > 500) break;
        }

        await context.close();
    } catch (e: any) {
        if (context) await context.close().catch(() => {});
    }
    return allJobs;
}

// ─── JazzHR ─────────────────────────────────────────────────────────────────
// Public job board at {token}.applytojob.com/apply — HTML scraped with Cheerio.
// Token is either a company slug ("vyne") or numeric ID ("558485").
async function fetchJazzHR(token: string): Promise<Job[]> {
    try {
        const url = `https://${token}.applytojob.com/apply`;
        const r = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'text/html' }
        });
        if (!r.ok) return [];
        const html = await r.text();
        const $ = cheerio.load(html);
        const jobs: Job[] = [];

        $('li.list-group-item').each((_, el) => {
            const anchor = $(el).find('h3.list-group-item-heading a, h2 a').first();
            const title = anchor.text().trim();
            const jobUrl = anchor.attr('href') || '';
            if (!title || !jobUrl) return;

            const listItems = $(el).find('ul.list-inline li');
            // First li = location (has map-marker icon), second = department/type
            const location = listItems.eq(0).text().replace(/^\s*\S+\s*/, '').trim(); // strip icon char
            const department = listItems.eq(1).text().trim();
            const rowText = $(el).text().replace(/\s+/g, ' ').trim();

            jobs.push({ 
                title, 
                location, 
                url: jobUrl, 
                department, 
                job_type: parseJobType([title, rowText]), // fallback from list
                salary: undefined,
                atsProvider: 'jazzhr'
            });
        });

        const limit = pLimit(10);
        await Promise.all(
            jobs.map(job =>
                limit(async () => {
                    if (!job.job_type) {
                        try {
                            const detailRes = await fetchWithTimeout(job.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                            if (detailRes.ok) {
                                const detailHtml = await detailRes.text();
                                const $d = cheerio.load(detailHtml);
                                const detailText = $d('body').text().replace(/\s+/g, ' ').trim();
                                job.job_type = parseJobType([job.title, detailText]);
                            }
                        } catch {}
                    }
                })
            )
        );

        return jobs;
    } catch { return []; }
}

// ─── Oracle Taleo ────────────────────────────────────────────────────────────
// Token is a full URL like https://arm.taleo.net/careersection/arm_external/joblist.ftl
// We extract tenant + section and hit the public REST API.
async function fetchOracleTaleo(token: string): Promise<Job[]> {
    try {
        let tenant = '';
        let section = '';

        if (token.startsWith('http')) {
            const parsed = new URL(token);
            tenant = parsed.hostname.split('.')[0];                         // "arm"
            const parts = parsed.pathname.split('/').filter(Boolean);       // ["careersection","arm_external","joblist.ftl"]
            section = parts[1] || '';                                        // "arm_external"
        } else {
            tenant = token;
            section = 'External';
        }

        if (!tenant) return [];

        // Taleo public REST API — no auth required for published jobs
        const apiUrl = `https://${tenant}.taleo.net/careersection/rest/jobboard/requisition?lang=en&start=0&end=100${section ? `&src=${section}` : ''}`;
        const r = await fetchWithTimeout(apiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (!r.ok) return [];
        const d = await r.json();
        const requisitions = d?.requisitionList || d?.requisitions || [];

        return requisitions.map((j: any) => ({
            title: j.title || j.jobTitle || '',
            location: j.location || j.locationDescr || j.primaryLocation || '',
            url: j.referenceNumber
                ? `https://${tenant}.taleo.net/careersection/${section}/jobdetail.ftl?job=${j.referenceNumber}&lang=en`
                : (j.jobDetailUrl || ''),
            department: j.department || '',
            salary: undefined,
            job_type: parseJobType(j.schedule || j.jobType || j.employmentType || j.employeeStatus)
        })).filter((j: Job) => j.title && j.url);
    } catch { return []; }
}

// ─── Eploy ────────────────────────────────────────────────────────────────────
// Token is either a company slug ("vanquisbankinggroup") or a full careers URL.
// Eploy exposes a public vacancy search JSON endpoint.
async function fetchEploy(token: string): Promise<Job[]> {
    try {
        let base = '';

        if (token.startsWith('http')) {
            // Full URL — extract the hostname-based eploy subdomain if present
            const parsed = new URL(token);
            if (parsed.hostname.includes('eploy.net')) {
                base = `https://${parsed.hostname}`;
            } else {
                // Custom domain with Eploy backend — try appending the known API path
                base = `https://${parsed.hostname}`;
            }
        } else {
            base = `https://${token}.eploy.net`;
        }

        // Primary: JSON vacancy search API
        const apiUrl = `${base}/careers/vacancy/search/json?rows=200`;
        const r = await fetchWithTimeout(apiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (!r.ok) return [];
        const d = await r.json();
        const vacancies = Array.isArray(d) ? d : (d.vacancies || d.results || []);

        return vacancies.map((j: any) => ({
            title: j.title || j.jobTitle || j.VacancyTitle || '',
            location: j.location || j.Location || j.town || j.region || '',
            url: j.url || j.applyUrl || `${base}/careers/vacancy/${j.id || j.VacancyId}`,
            department: j.department || j.category || '',
            salary: undefined,
        })).filter((j: Job) => j.title && j.url);
    } catch { return []; }
}

// ─── TalentTrack (World Careers Network) ─────────────────────────────────────
// Token: "oid|https://jobs.example.com|urlSlug"
// Example: "5|https://jobs.barchester.com|barchester"
// Public search: GET https://api.uk.talenttrack.co/v3b/search/oid/{oid}?orderBy=1&page=N&limitPerPage=50
async function fetchTalentTrack(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    try {
        const parts = String(token || '').split('|').map((p) => p.trim()).filter(Boolean);
        const oid = (parts[0] || '').replace(/^oid[=/]?/i, '');
        if (!oid || !/^\d+$/.test(oid)) return [];

        let siteBase = parts[1] || '';
        let urlSlug = parts[2] || '';
        if (siteBase && !/^https?:\/\//i.test(siteBase)) siteBase = `https://${siteBase}`;
        siteBase = siteBase.replace(/\/+$/, '');
        if (!urlSlug && siteBase) {
            try {
                const host = new URL(siteBase).hostname.replace(/^www\./, '');
                urlSlug = host.split('.')[0] || 'jobs';
            } catch {
                urlSlug = 'jobs';
            }
        }
        if (!siteBase) siteBase = 'https://jobs.barchester.com';
        if (!urlSlug) urlSlug = 'barchester';

        const limitPerPage = 50;
        let page = 1;
        let totalPage = 1;

        while (page <= totalPage && page <= 40) {
            const url =
                `https://api.uk.talenttrack.co/v3b/search/oid/${oid}` +
                `?orderBy=1&page=${page}&limitPerPage=${limitPerPage}&useTrueLocation=0`;
            const res = await fetchWithTimeout(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    Accept: 'application/json',
                    Origin: siteBase,
                    Referer: `${siteBase}/`,
                },
            });
            if (!res.ok) break;

            const data: any = await res.json();
            const rows: any[] = Array.isArray(data?.data) ? data.data : [];
            if (typeof data?.totalPage === 'number' && data.totalPage > 0) {
                totalPage = data.totalPage;
            } else if (!rows.length) {
                break;
            }

            for (const j of rows) {
                const title = String(j?.name || '').trim();
                const jobId = j?.jobId;
                if (!title || jobId == null) continue;

                const slug = title
                    .toLowerCase()
                    .replace(/&amp;/g, 'and')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                const jobUrl = `${siteBase}/job/${urlSlug}/${slug || 'role'}-${jobId}`;

                const location = [
                    j?.city,
                    j?.addressRegion,
                    j?.fullLocation,
                    j?.postcode,
                    j?.country,
                ]
                    .map((x: unknown) => String(x || '').trim())
                    .filter(Boolean)
                    // Prefer compact city/region; fall back to fullLocation if city empty
                    .filter((v: string, i: number, arr: string[]) => {
                        if (i === 2 && arr[0]) return false; // skip fullLocation when city present
                        if (i === 1 && arr[0] && v.toLowerCase().includes(arr[0].toLowerCase())) return false;
                        return true;
                    })
                    .slice(0, 3)
                    .join(', ');

                const payRaw = String(j?.pay || '')
                    .replace(/&pound;/gi, '£')
                    .replace(/&amp;/g, '&')
                    .replace(/<[^>]+>/g, '')
                    .trim();

                allJobs.push({
                    title,
                    location: location || 'United Kingdom',
                    url: jobUrl,
                    department: String(j?.type || j?.hours || '').trim(),
                    job_type: parseJobType([title, String(j?.type || ''), String(j?.hours || ''), String(j?.jobType || '')]),
                    salary: payRaw || undefined,
                    atsProvider: 'talenttrack'
                });
            }

            if (!rows.length) break;
            page += 1;
        }

        return Array.from(new Map(allJobs.filter((j) => j.title && j.url).map((j) => [j.url, j])).values());
    } catch {
        return allJobs;
    }
}

// ─── Softscape / Eploy map board (e.g. HC-One) ───────────────────────────────
// Token: careers base host, e.g. "https://apply.hc-one.co.uk"
// Map view embeds a JSON marker array with titles, postcodes, and vacancy URLs.
async function fetchSoftscape(token: string): Promise<Job[]> {
    try {
        let base = String(token || '').trim().replace(/\/+$/, '');
        if (!base) return [];
        if (!/^https?:\/\//i.test(base)) base = `https://${base}`;

        const mapUrl = `${base}/vacancies/vacancy-search-results.aspx?view=map`;
        const res = await fetchWithTimeout(mapUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'text/html',
            },
        }, 30000);
        if (!res.ok) return [];

        const html = await res.text();
        const start = html.indexOf('[{"ID":');
        if (start < 0) return [];

        let depth = 0;
        let end = -1;
        for (let p = start; p < html.length; p++) {
            const c = html[p];
            if (c === '[') depth++;
            else if (c === ']') {
                depth--;
                if (depth === 0) {
                    end = p + 1;
                    break;
                }
            }
        }
        if (end < 0) return [];

        const markers: any[] = JSON.parse(html.slice(start, end));
        const jobs: Job[] = [];

        for (const m of markers) {
            const title = String(m?.ToolTipText || '').trim();
            const id = m?.ID;
            if (!title || id == null) continue;

            const content = String(m?.ItemContent || m?.FormattedText || '');
            const hrefMatch = content.match(/href=['"]([^'"]*\/vacancies\/\d+\/[^'"]+\.html)['"]/i);
            let jobUrl = hrefMatch?.[1] || '';
            if (jobUrl && !/^https?:\/\//i.test(jobUrl)) {
                jobUrl = `${base}/${jobUrl.replace(/^\//, '')}`;
            }
            if (!jobUrl) {
                const slug = title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                jobUrl = `${base}/vacancies/${id}/${slug || 'role'}.html`;
            }

            const locFromHtml = content.match(/Location:<\/span><\/div><div class='content'>([^<]+)/i)?.[1]?.trim();
            const location = [locFromHtml, m?.Address || m?.ResolvedPinLocation]
                .map((x: unknown) => String(x || '').trim())
                .filter(Boolean)
                .join(', ');

            const salary = content.match(/£[\d,\.]+(?:\s*[-–]\s*£[\d,\.]+)?(?:\s*(?:per\s*(?:hour|annum|year)|p\.?h\.?|p\.?a\.?))?/i)?.[0];
            const dept = content.match(/Job Family:<\/span><\/div><div class='content'>([^<]+)/i)?.[1]?.trim() || '';
            const pattern = content.match(/Working Pattern:<\/span><\/div><div class='content'>([^<]+)/i)?.[1]?.trim() || '';
            const empType = content.match(/Employment Type:<\/span><\/div><div class='content'>([^<]+)/i)?.[1]?.trim() || '';

            jobs.push({
                title,
                location: location || 'United Kingdom',
                url: jobUrl,
                department: dept,
                job_type: parseJobType([title, dept, pattern, empType, content]),
                salary: salary || undefined,
                atsProvider: 'softscape'
            });
        }

        return Array.from(new Map(jobs.filter((j) => j.title && j.url).map((j) => [j.url, j])).values());
    } catch {
        return [];
    }
}

// ─── Teach First vacancies page (Salesforce PeoplePlatform apply links) ───────
// Token: vacancies page URL (default Teach First vacancies)
async function fetchTeachFirst(token: string): Promise<Job[]> {
    try {
        const url = String(token || '').trim() || 'https://www.teachfirst.org.uk/working-teach-first/vacancies';
        const res = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        });
        if (!res.ok) return [];
        const html = await res.text();
        const $ = cheerio.load(html);
        const jobs: Job[] = [];

        $('a[href*="vacancyNo="], a[href*="fRecruit__ApplyJob"]').each((_, el) => {
            const applyUrl = String($(el).attr('href') || '').trim();
            if (!applyUrl) return;

            // Walk up until we find a block that includes the vacancy heading.
            let card = $(el).parent();
            for (let i = 0; i < 8 && card.length; i++) {
                if (card.find('h2, h3').length) break;
                card = card.parent();
            }

            const title = card.find('h2, h3').first().text().replace(/\s+/g, ' ').trim();
            if (!title || /^apply now$/i.test(title)) return;

            const cardText = card.text().replace(/\s+/g, ' ').trim();
            const locationRaw =
                cardText.match(/Location:\s*([A-Za-z][A-Za-z0-9 ,\-]{0,40}?)(?=\s*(?:Salary|Type|Closing|$))/i)?.[1]?.trim() ||
                cardText.match(/\b(Nationwide|London|Manchester|Birmingham|Leeds|Bristol|Newcastle|Nottingham|Norwich|Chatham|Bournemouth)\b/i)?.[1] ||
                'United Kingdom';
            const location = /^nationwide$/i.test(locationRaw)
                ? 'United Kingdom'
                : locationRaw;
            const salary = cardText.match(/Salary:\s*([^|]+?)(?:\s+Type:|$)/i)?.[1]?.trim();

            jobs.push({
                title,
                location,
                url: applyUrl.startsWith('http') ? applyUrl : new URL(applyUrl, url).href,
                department: cardText.match(/Type:\s*([^|]+)/i)?.[1]?.trim() || '',
                salary: salary || undefined,
            });
        });

        // Fallback: heading + nearby apply link
        if (!jobs.length) {
            $('h3').each((_, el) => {
                const title = $(el).text().replace(/\s+/g, ' ').trim();
                if (!title || title.length < 4) return;
                const block = $(el).parent();
                const apply = block.find('a[href*="vacancyNo="], a[href*="Apply"]').first().attr('href');
                if (!apply) return;
                const text = block.text().replace(/\s+/g, ' ');
                jobs.push({
                    title,
                    location: text.match(/Location:\s*([A-Za-z0-9 ,\-]+)/i)?.[1]?.trim() || 'United Kingdom',
                    url: apply.startsWith('http') ? apply : new URL(apply, url).href,
                    department: '',
                    salary: undefined,
                });
            });
        }

        return Array.from(new Map(jobs.filter((j) => j.title && j.url).map((j) => [j.url, j])).values());
    } catch {
        return [];
    }
}

// ─── Network Rail (Oracle APEX recruitment portal) ───────────────────────────
// Token unused — scrapes Maintenance + Corporate Services category pages via
// Playwright + apex.model.fetchAll (progressive TemplateComponent reports).
// Portal: https://apxprodnwrl.opc.oracleoutsourcing.com/ords/r/xxapex/recruitment-external-candidate/
async function fetchNetworkRail(_token: string): Promise<Job[]> {
    const categoryUrls = [
        'https://apxprodnwrl.opc.oracleoutsourcing.com/ords/r/xxapex/recruitment-external-candidate/find-a-job-in-maintenance',
        'https://apxprodnwrl.opc.oracleoutsourcing.com/ords/r/xxapex/recruitment-external-candidate/find-a-job-in-corporate-services',
    ];
    const allJobs: Job[] = [];
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    const decode = (s: string) =>
        s
            .replace(/&amp;/g, '&')
            .replace(/&pound;/gi, '£')
            .replace(/&#x27;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();

    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 900 },
        });

        for (const categoryUrl of categoryUrls) {
            const page = await context.newPage();
            try {
                await page.goto(categoryUrl, { waitUntil: 'networkidle', timeout: 90000 });
                await page.waitForTimeout(1000);

                const rows: Array<[string, string]> = await page.evaluate(async () => {
                    const anyWin = window as any;
                    const modelName = (anyWin.apex?.model?.list?.() || [])[0];
                    if (!modelName || !anyWin.apex?.model) return [];
                    const model = anyWin.apex.model.get(modelName);
                    const regionId = String(modelName).replace(/^R/, '');
                    const dataKey = `gTemplateReport${regionId}data`;

                    if (typeof model.fetchAll === 'function') {
                        await new Promise<void>((resolve) => {
                            try {
                                const ret = model.fetchAll({
                                    success() {
                                        resolve();
                                    },
                                    error() {
                                        resolve();
                                    },
                                });
                                if (ret && typeof ret.then === 'function') {
                                    ret.then(() => resolve()).catch(() => resolve());
                                } else {
                                    setTimeout(() => resolve(), 10000);
                                }
                            } catch {
                                resolve();
                            }
                        });
                    }

                    // Extra progressive fetches if moreData remains
                    for (let i = 0; i < 20; i++) {
                        const data = anyWin[dataKey];
                        if (!data?.moreData) break;
                        const before = data.values?.length || 0;
                        await new Promise<void>((resolve) => {
                            try {
                                const ret = model.fetch({
                                    success() {
                                        resolve();
                                    },
                                    error() {
                                        resolve();
                                    },
                                });
                                if (ret && typeof ret.then === 'function') {
                                    ret.then(() => resolve()).catch(() => resolve());
                                } else {
                                    setTimeout(() => resolve(), 2000);
                                }
                            } catch {
                                resolve();
                            }
                        });
                        await new Promise((r) => setTimeout(r, 400));
                        const after = anyWin[dataKey]?.values?.length || 0;
                        if (after <= before) break;
                    }

                    return (anyWin[dataKey]?.values || []) as Array<[string, string]>;
                });

                for (const row of rows) {
                    const id = String(row?.[0] || '').trim();
                    const html = String(row?.[1] || '');
                    if (!id || !html) continue;

                    const titleMatch =
                        html.match(/t-ContentRow-title[^>]*>([\s\S]*?)<div class="department/i) ||
                        html.match(/t-ContentRow-title[^>]*>([\s\S]*?)<\//i);
                    const title = decode(titleMatch?.[1] || '');
                    if (!title) continue;

                    const locationRaw = decode(
                        html.match(/fa-map-marker-o[\s\S]*?<\/span>([^<]+)/i)?.[1] || ''
                    ) || 'United Kingdom';
                    // Depot/station names often aren't in the UK city list — keep a country hint.
                    const location = /united kingdom|\buk\b|england|scotland|wales|northern ireland/i.test(locationRaw)
                        ? locationRaw
                        : `${locationRaw}, United Kingdom`;
                    const salaryRaw = decode(
                        html.match(/fa-money[\s\S]*?<\/span>([^<]+)/i)?.[1] || ''
                    );
                    const department = decode(
                        html.match(/class="department[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || ''
                    );

                    allJobs.push({
                        title,
                        location,
                        url: `https://apxprodnwrl.opc.oracleoutsourcing.com/ords/r/xxapex/recruitment-external-candidate/vacancy-details?p402_vacancy_id=${id}`,
                        department,
                        salary: salaryRaw || undefined,
                    });
                }
            } finally {
                await page.close().catch(() => undefined);
            }
        }

        return Array.from(
            new Map(allJobs.filter((j) => j.title && j.url).map((j) => [j.url, j])).values()
        );
    } catch {
        return allJobs;
    } finally {
        if (context) await context.close().catch(() => undefined);
    }
}

/** Radancy/TalentBrew results HTML → jobs. Exported for tests. */
export function parseAstraZenecaResultsHtml(html: string): Job[] {
    const $ = cheerio.load(html);
    const jobs: Job[] = [];
    const seen = new Set<string>();
    $('a[href*="/job/"]').each((_, el) => {
        const href = String($(el).attr('href') || '').trim();
        if (!href || href.includes('#') || seen.has(href)) return;
        const title = $(el).find('h2, h3').first().text().replace(/\s+/g, ' ').trim()
            || $(el).text().replace(/\s+/g, ' ').trim();
        if (!title || title.length < 3) return;
        const loc = $(el).find('.job-location, [class*="location"]').first().text().replace(/\s+/g, ' ').trim()
            || $(el).parent().find('.job-location, [class*="location"]').first().text().replace(/\s+/g, ' ').trim();
        const url = href.startsWith('http') ? href : `https://careers.astrazeneca.com${href}`;
        seen.add(href);
        jobs.push({
            title,
            location: loc || '',
            url,
            department: '',
            salary: undefined,
            atsProvider: 'astrazeneca',
        });
    });
    return jobs;
}

// ─── AstraZeneca (Radancy / TalentBrew JSON results) ─────────────────────────
// Token: "astrazeneca". Do not use Playwright — the public results API is JSON+HTML.
// LocationPath 2635167 = GeoNames United Kingdom; 2963597 = Ireland.
async function fetchAstraZeneca(_token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    const seen = new Set<string>();
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://careers.astrazeneca.com/search-jobs',
    };
    const regions: Array<{ path: string; location: string }> = [
        { path: '2635167', location: 'United Kingdom' },
        { path: '2963597', location: 'Ireland' },
    ];

    for (const region of regions) {
        for (let page = 1; page <= 30; page++) {
            const params = new URLSearchParams({
                ActiveFacetID: '0',
                CurrentPage: String(page),
                RecordsPerPage: '50',
                Distance: '50',
                RadiusUnitType: '0',
                Keywords: '',
                Location: region.location,
                ShowRadius: 'False',
                CustomFacetName: '',
                FacetTerm: '',
                FacetType: '0',
                SearchResultsModuleName: 'Search Results',
                SearchFiltersModuleName: 'Search Filters',
                SortCriteria: '0',
                SortDirection: '1',
                SearchType: '5',
                LocationType: '2',
                LocationPath: region.path,
                OrganizationIds: '',
                PostalCode: '',
                fc: '',
                fl: '',
                fcf: '',
                afc: '',
                afl: '',
                afcf: '',
            });
            try {
                const res = await fetchWithTimeout(
                    `https://careers.astrazeneca.com/search-jobs/results?${params.toString()}`,
                    { headers },
                    30000,
                );
                if (!res.ok) break;
                const data = await res.json();
                if (data?.hasJobs === false) break;
                const html = String(data?.results || '');
                const pageJobs = parseAstraZenecaResultsHtml(html);
                let added = 0;
                for (const j of pageJobs) {
                    if (seen.has(j.url)) continue;
                    seen.add(j.url);
                    allJobs.push(j);
                    added++;
                }
                if (!pageJobs.length || added === 0) break;
            } catch (e: any) {
                console.error(`[AstraZeneca] page ${page} ${region.location}:`, e.message);
                break;
            }
        }
    }
    console.log(`[AstraZeneca] ${allJobs.length} jobs (UK+Ireland boards)`);
    return allJobs;
}



// ─── EasyJet (Playwright / easyjet.taleo.net) ────────────────────────────────
// Token: "easyjet"
async function fetchEasyJet(token: string): Promise<Job[]> {
    const tenant = token || 'easyjet';
    const allJobs: Job[] = [];
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 900 },
        });
        const page = await context.newPage();

        const apiJobs: Job[] = [];
        page.on('response', async (response) => {
            if (response.url().includes('requisition') && response.headers()['content-type']?.includes('json')) {
                try {
                    const d = await response.json();
                    const items = d?.requisitionList || d?.reqs || [];
                    for (const j of items) {
                        const title = j.title || j.jobTitle || '';
                        const refNum = j.referenceNumber || j.id || '';
                        const loc = j.location || j.locationDescr || '';
                        if (title && refNum) apiJobs.push({
                            title, location: loc,
                            url: `https://${tenant}.taleo.net/careersection/2/jobdetail.ftl?job=${refNum}&lang=en`,
                            department: '', salary: undefined
                        });
                    }
                } catch { /* ignore */ }
            }
        });

        await page.goto(`https://${tenant}.taleo.net/careersection/2/jobsearch.ftl?lang=en`, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);

        if (apiJobs.length > 0) { allJobs.push(...apiJobs); }
        else {
            // Parse Taleo rendered table
            const jobs = await page.$$eval('tr[id]', rows => rows.map(row => ({
                title: row.querySelector('a')?.textContent?.trim() || '',
                url:   row.querySelector('a')?.href || '',
                location: row.querySelector('td:nth-child(3), .location')?.textContent?.trim() || '',
                department: '', salary: undefined as any,
            })).filter(j => j.title && j.url));
            allJobs.push(...jobs);
        }

        await context.close();
    } catch (e: any) {
        console.error('[EasyJet] scraper error:', e.message);
        if (context) await context.close().catch(() => {});
    }
    return allJobs;
}

// ─── BT Group (jobs.bt.com SuccessFactors Google Base feed) ─────────────────
// careers.bt.com SPA is unreliable; sitemal.xml is a full RSS job feed (~200 items).
// Titles/locations use ISO country codes, e.g. "London, GB, E1 8EP".
async function fetchBTGroup(_token: string): Promise<Job[]> {
    const UA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    try {
        const res = await fetchWithTimeout('https://jobs.bt.com/sitemal.xml', {
            headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml,*/*' },
        });
        if (!res.ok) {
            console.error(`[BT Group] sitemal.xml HTTP ${res.status}`);
            return [];
        }
        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const jobs: Job[] = [];
        const seen = new Set<string>();

        $('item').each((_, el) => {
            const item = $(el);
            const title = item.find('title').first().text().replace(/\s+/g, ' ').trim();
            const link = item.find('link').first().text().trim();
            const location =
                item.find('g\\:location').first().text().trim() ||
                item.find('location').first().text().trim() ||
                '';
            if (!title || !link) return;

            // Prefer explicit GB / United Kingdom in location or title suffix "(City, GB, …)"
            const blob = `${location} ${title}`.toLowerCase();
            const isGb =
                /(^|[^a-z])gb([^a-z]|$)/i.test(location) ||
                /,\s*gb\b/i.test(title) ||
                /\bunited kingdom\b/i.test(blob);
            if (!isGb) return;

            // Drop non-UK titles that mention GB falsely (rare); keep IE/IN/HU out via GB check above
            const url = link.startsWith('http') ? link : `https://jobs.bt.com${link}`;
            if (seen.has(url)) return;
            seen.add(url);

            const cleanTitle = title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title;
            jobs.push({
                title: cleanTitle,
                location: location || 'United Kingdom',
                url,
                department: '',
                salary: undefined,
            });
        });

        console.log(`[BT Group] sitemal: ${jobs.length} GB jobs`);
        return jobs;
    } catch (e: any) {
        console.error('[BT Group] sitemal error:', e.message);
        return [];
    }
}

// ─── Siemens (jobs.siemens.com Avature marketplace) ──────────────────────────
// Country facet United Kingdom = field 42386 value 812127 (from SearchJobs UI).
// Paginate SSR <article> cards via folderOffset (6 per page).
async function fetchSiemens(_token: string): Promise<Job[]> {
    const UA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const PAGE = 6;
    const allJobs: Job[] = [];
    const seen = new Set<string>();

    for (let offset = 0; offset < 200; offset += PAGE) {
        const url =
            `https://jobs.siemens.com/en_US/externaljobs/SearchJobs/` +
            `?42386=%5B812127%5D&42386_format=17546&listFilterMode=1` +
            `&folderRecordsPerPage=${PAGE}&folderOffset=${offset}`;
        try {
            const res = await fetchWithTimeout(url, {
                headers: { 'User-Agent': UA, Accept: 'text/html' },
            });
            if (!res.ok) break;
            const html = await res.text();
            const $ = cheerio.load(html);
            const articles = $('article');
            if (articles.length === 0) break;

            let added = 0;
            articles.each((_, el) => {
                const card = $(el);
                const detail = card.find('a[href*="/JobDetail/"]').first();
                const href = String(detail.attr('href') || '').split('?')[0].trim();
                if (!href || seen.has(href)) return;

                const title =
                    String(card.find('a[data-jobname]').first().attr('data-jobname') || '')
                        .replace(/\s+/g, ' ')
                        .trim() ||
                    detail.text().replace(/\s+/g, ' ').trim();
                if (!title || /learn more/i.test(title)) return;

                const city = card.find('.list-item-jobCity').first().text().replace(/\s+/g, ' ').trim();
                const state = card.find('.list-item-jobState').first().text().replace(/\s+/g, ' ').trim();
                const country = card
                    .find('.list-item-jobCountry')
                    .first()
                    .text()
                    .replace(/\s+/g, ' ')
                    .trim();
                const parts = [city, state, country].filter(Boolean);
                // Country-filtered board — treat as UK even when city spans are empty
                const location = parts.length > 0 ? parts.join(', ') : 'United Kingdom';

                seen.add(href);
                allJobs.push({
                    title,
                    location,
                    url: href.startsWith('http') ? href : `https://jobs.siemens.com${href}`,
                    department: '',
                    salary: undefined,
                });
                added++;
            });

            if (added === 0) break;
            await sleep(300);
        } catch (e: any) {
            console.error(`[Siemens] page offset=${offset}:`, e.message);
            break;
        }
    }

    console.log(`[Siemens] UK board: ${allJobs.length} jobs`);
    return allJobs;
}

// ─── Vorboss (vorboss.com/careers — Cloudflare blocks plain fetch) ───────────
async function fetchVorboss(_token: string): Promise<Job[]> {
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();
        await page.goto('https://vorboss.com/careers', {
            waitUntil: 'domcontentloaded',
            timeout: 90000,
        });
        await page.waitForTimeout(3500);

        const jobs = await page.evaluate(() => {
            const out: { title: string; url: string; location: string }[] = [];
            const seen = new Set<string>();
            for (const a of Array.from(document.querySelectorAll('a[href*="/careers/"]')) as HTMLAnchorElement[]) {
                const href = a.href.split('#')[0].split('?')[0];
                if (!/\/careers\/[a-z0-9-]+$/i.test(href) || seen.has(href)) continue;
                const card = a.closest('article, li, section, div') || a;
                const heading = card.querySelector('h1, h2, h3, h4, h5');
                let title = ((heading?.textContent || a.textContent || '') as string).replace(/\s+/g, ' ').trim();
                title = title
                    .replace(/Permanent\s*\/\s*Full-?Time.*/i, '')
                    .replace(/View position.*/i, '')
                    .replace(/\b(London|Bristol|Manchester|Birmingham|Remote)(,?\s*UK)?\s*$/i, '')
                    .replace(/^(Build|IT|Networks|Commercial|Operations|Fibre,\s*Planning\s*&\s*Installation)/i, '')
                    .trim();
                if (!title || title.length < 3) continue;
                const blob = (card.textContent || '').replace(/\s+/g, ' ');
                const loc =
                    blob.match(/\b(London|Bristol|Manchester|Birmingham|United Kingdom)(?:,?\s*UK)?\b/i)?.[0] ||
                    'London, United Kingdom';
                out.push({ title, url: href, location: /uk|united kingdom|london|bristol/i.test(loc) ? loc : `${loc}, United Kingdom` });
                seen.add(href);
            }
            return out;
        });

        await context.close();
        console.log(`[Vorboss] scraped ${jobs.length} jobs`);
        return jobs.map((j) => ({
            title: j.title,
            location: j.location,
            url: j.url,
            department: '',
            salary: undefined,
        }));
    } catch (e: any) {
        console.error('[Vorboss] scraper error:', e.message);
        if (context) await context.close().catch(() => {});
        return [];
    }
}

// ─── GXO Logistics (jobs.gxo.com SuccessFactors Google Base feed) ───────────
async function fetchGXO(_token: string): Promise<Job[]> {
    const UA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    try {
        const res = await fetchWithTimeout('https://jobs.gxo.com/sitemal.xml', {
            headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml,*/*' },
        });
        if (!res.ok) {
            console.error(`[GXO] sitemal.xml HTTP ${res.status}`);
            return [];
        }
        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const jobs: Job[] = [];
        const seen = new Set<string>();

        $('item').each((_, el) => {
            const item = $(el);
            const title = item.find('title').first().text().replace(/\s+/g, ' ').trim();
            const link = item.find('link').first().text().trim();
            const location =
                item.find('g\\:location').first().text().trim() ||
                item.find('location').first().text().trim() ||
                '';
            if (!title || !link) return;

            const blob = `${location} ${title}`.toLowerCase();
            const isGb =
                /(^|[^a-z])gb([^a-z]|$)/i.test(location) ||
                /,\s*gb\b/i.test(title) ||
                /\bunited kingdom\b/i.test(blob);
            if (!isGb) return;

            const url = link.startsWith('http') ? link : `https://jobs.gxo.com${link}`;
            if (seen.has(url)) return;
            seen.add(url);

            const cleanTitle = title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title;
            jobs.push({
                title: cleanTitle,
                location: location || 'United Kingdom',
                url,
                department: '',
                salary: undefined,
            });
        });

        console.log(`[GXO] sitemal: ${jobs.length} GB jobs`);
        return jobs;
    } catch (e: any) {
        console.error('[GXO] sitemal error:', e.message);
        return [];
    }
}

// ─── Royal Mail (Phenom sitemap → job page JSON-LD) ──────────────────────────
// Phenom /widgets returns totalHits but an empty jobs array for this tenant.
// Sitemap lists every posting; each job page exposes JobPosting JSON-LD.
async function fetchRoyalMail(_token: string): Promise<Job[]> {
    const UA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const base = 'https://careers.royalmailgroup.com';

    try {
        const idxRes = await fetchWithTimeout(`${base}/gb/en/sitemap_index.xml`, {
            headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml,*/*' },
        });
        if (!idxRes.ok) {
            console.error(`[Royal Mail] sitemap_index HTTP ${idxRes.status}`);
            return [];
        }
        const idxXml = await idxRes.text();
        const sitemapUrls = [...idxXml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]);

        const jobUrls: string[] = [];
        const seenUrl = new Set<string>();
        for (const sm of sitemapUrls) {
            try {
                const smRes = await fetchWithTimeout(sm, {
                    headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml,*/*' },
                });
                if (!smRes.ok) continue;
                const smXml = await smRes.text();
                for (const m of smXml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
                    const loc = m[1];
                    if (!/\/job\//i.test(loc) || seenUrl.has(loc)) continue;
                    seenUrl.add(loc);
                    jobUrls.push(loc);
                }
            } catch {
                /* ignore one sitemap failure */
            }
        }

        if (!jobUrls.length) {
            console.error('[Royal Mail] no job URLs in sitemap');
            return [];
        }

        const parseJobPage = async (url: string): Promise<Job | null> => {
            try {
                const res = await fetchWithTimeout(url, {
                    headers: { 'User-Agent': UA, Accept: 'text/html' },
                });
                if (!res.ok) return null;
                const html = await res.text();
                const $ = cheerio.load(html);
                let title = '';
                let location = '';

                $('script[type="application/ld+json"]').each((_, el) => {
                    if (title && location) return;
                    try {
                        const raw = $(el).html() || '';
                        const parsed = JSON.parse(raw);
                        const nodes = Array.isArray(parsed) ? parsed : [parsed];
                        for (const n of nodes) {
                            if (n?.['@type'] === 'JobPosting') {
                                title = String(n.title || '').trim() || title;
                                const addr = n.jobLocation?.address;
                                location =
                                    [addr?.addressLocality, addr?.addressRegion, addr?.addressCountry]
                                        .filter(Boolean)
                                        .join(', ') ||
                                    String(n.jobLocation?.name || '').trim() ||
                                    location;
                            }
                        }
                    } catch {
                        /* ignore bad JSON-LD */
                    }
                });

                if (!title) {
                    const og = $('meta[property="og:title"]').attr('content') || $('h1').first().text() || '';
                    // "Role in City, United Kingdom | Category at Royal Mail"
                    const m = og.match(/^(.*?)\s+in\s+(.+?)\s*\|\s*/i);
                    if (m) {
                        title = m[1].trim();
                        location = location || m[2].trim();
                    } else {
                        title = og.split('|')[0].trim();
                    }
                }

                if (!title) return null;
                return {
                    title,
                    location: location || 'United Kingdom',
                    url,
                    department: '',
                    salary: undefined,
                    atsProvider: 'royalmail',
                };
            } catch {
                return null;
            }
        };

        const jobs: Job[] = [];
        const concurrency = 12;
        for (let i = 0; i < jobUrls.length; i += concurrency) {
            const chunk = jobUrls.slice(i, i + concurrency);
            const part = await Promise.all(chunk.map((u) => parseJobPage(u)));
            for (const j of part) if (j) jobs.push(j);
            if (i + concurrency < jobUrls.length) await sleep(200);
        }

        console.log(`[Royal Mail] sitemap: ${jobUrls.length} urls → ${jobs.length} jobs`);
        return jobs;
    } catch (e: any) {
        console.error('[Royal Mail] sitemap error:', e.message);
        return [];
    }
}

// ─── Standard Chartered (Playwright + Workday fallback) ──────────────────────
// Token: "standardchartered"
async function fetchStandardChartered(token: string): Promise<Job[]> {
    const slug = token || 'standardchartered';

    // First: try Workday API (fastest)
    for (const board of ['SCBExternalCareers', 'External', 'SC_External', 'StanChartExternal']) {
        try {
            const jobs = await fetchWorkday(`${slug}/${board}`);
            if (jobs.length > 0) return jobs;
        } catch { /* try next */ }
    }

    // Playwright fallback
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 900 },
        });
        const page = await context.newPage();
        const apiJobs: Job[] = [];

        page.on('response', async (response) => {
            const url = response.url();
            if ((url.includes('/jobs') || url.includes('/search') || url.includes('requisition')) &&
                response.headers()['content-type']?.includes('json')) {
                try {
                    const d = await response.json();
                    const items = d?.jobs || d?.results || d?.requisitionList || d?.postings || [];
                    if (Array.isArray(items)) {
                        for (const j of items) {
                            const title = j.title || j.jobTitle || j.Title || '';
                            const loc = j.location || j.primaryLocation || j.locationDescr || '';
                            const href = j.url || j.applyUrl || j.jobDetailUrl || '';
                            if (title && href) apiJobs.push({ title, location: typeof loc === 'string' ? loc : '', url: href, department: '', salary: undefined });
                        }
                    }
                } catch { /* ignore */ }
            }
        });

        await page.goto('https://scb.taleo.net/careersection/2/jobsearch.ftl?lang=en', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);
        await context.close();
        if (apiJobs.length > 0) return apiJobs;
    } catch (e: any) {
        console.error('[Standard Chartered] scraper error:', e.message);
        if (context) await context.close().catch(() => {});
    }
    return [];
}

// ─── Microsoft (Phenom pcsx API at apply.careers.microsoft.com) ──────────────
// Debug revealed the actual API: apply.careers.microsoft.com/api/pcsx/search
// No Playwright needed — direct REST call identical to fetchEightfold pattern.
async function fetchMicrosoft(_token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let start = 0;
    const PAGE_SIZE = 20;

    while (true) {
        try {
            // location= filters by country; filter_country= is ignored by the API
            const url = `https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=&location=United+Kingdom&start=${start}&sort_by=timestamp`;
            const res = await fetchWithTimeout(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://apply.careers.microsoft.com/',
                }
            }, 20000);
            if (!res.ok) break;
            const d = await res.json();
            const positions: any[] = d?.data?.positions || [];
            if (positions.length === 0) break;

            for (const p of positions) {
                const title = p.name || p.title || '';
                // positionUrl is the canonical path e.g. /careers/job/1970393556866457
                const positionUrl = p.positionUrl || '';
                const loc = (p.locations || [])[0] || p.location || '';
                if (title && positionUrl) {
                    allJobs.push({
                        title,
                        location: typeof loc === 'string' ? loc : (loc?.name || ''),
                        url: `https://apply.careers.microsoft.com${positionUrl}`,
                        department: p.category || p.department || '',
                        salary: undefined,
                    });
                }
            }

            if (positions.length < PAGE_SIZE) break;
            start += positions.length;
            await sleep(500);
        } catch { break; }
    }
    return allJobs;
}

// ─── Arup (jobs.arup.com — SSR HTML; Playwright gets 403) ───────────────────
// Parse UKIMEA / discipline landing pages for .job_list_row cards with locations.
async function fetchArup(_token: string): Promise<Job[]> {
    const UA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const seedUrls = [
        'https://jobs.arup.com/page/ukimea-region-6',
        'https://jobs.arup.com/landing-pages/6/jobs-matching-custom-search',
        'https://jobs.arup.com/landingpages/architecture-opportunities-at-arup-26',
        'https://jobs.arup.com/landingpages/civil-engineering-opportunities-at-arup-27',
        'https://jobs.arup.com/landingpages/structural-engineering-opportunities-at-arup-66',
        'https://jobs.arup.com/landingpages/electrical-engineering-opportunities-at-arup-105',
        'https://jobs.arup.com/landingpages/mechanical-engineering-opportunities-at-arup-101',
        'https://jobs.arup.com/landingpages/bridge-civil-structures-opportunities-at-arup-52',
        'https://jobs.arup.com/landingpages/building-services-electrical-opportunities-at-arup-43',
        'https://jobs.arup.com/landingpages/building-services-mechanical-opportunities-at-arup-18',
    ];

    const isUkLocation = (loc: string): boolean => {
        const l = (loc || '').toLowerCase();
        if (!l) return false;
        if (/\bnew south wales\b/.test(l)) return false;
        if (/\bunited kingdom\b/.test(l)) return true;
        if (/\b(england|scotland|northern ireland)\b/.test(l)) return true;
        if (/\bwales\b/.test(l) && !/\bsouth wales\b/.test(l)) return true;
        return /\b(london|manchester|birmingham|edinburgh|glasgow|bristol|leeds|cardiff|belfast|cambridge|oxford|nottingham|sheffield|liverpool|newcastle|reading|coventry|southampton|brighton|aberdeen|york|bath|leicester)\b/.test(l);
    };

    const parseJobsFromHtml = (html: string): Job[] => {
        const $ = cheerio.load(html);
        const jobs: Job[] = [];
        const seen = new Set<string>();

        $('.job_list_row').each((_, row) => {
            const el = $(row);
            const link = el.find('a.job_link').first();
            const href = String(link.attr('href') || '').trim();
            const title = link.text().replace(/\s+/g, ' ').trim();
            if (!href || !title || /learn more/i.test(title)) return;
            if (!/\/jobs\/[^/\s]+-\d+/i.test(href) && !/\/jobs\/\d+$/i.test(href)) return;

            const locAnchor = el.find('a.location, .jlr_location a').first();
            const location = (
                locAnchor.text() ||
                String(locAnchor.attr('data-title') || '') ||
                el.find('.jlr_location').text() ||
                ''
            )
                .replace(/See .+ jobs in /i, '')
                .replace(/\s+/g, ' ')
                .trim();

            const url = href.startsWith('http') ? href : `https://jobs.arup.com${href}`;
            if (seen.has(url)) return;
            seen.add(url);
            jobs.push({ title, location, url, department: '', salary: undefined });
        });

        return jobs;
    };

    const allJobs: Job[] = [];
    const seenUrls = new Set<string>();
    const relatedSeeds: string[] = [];

    for (const seed of seedUrls) {
        try {
            const res = await fetchWithTimeout(seed, { headers: { 'User-Agent': UA, Accept: 'text/html' } }, 20000);
            if (!res.ok) continue;
            for (const j of parseJobsFromHtml(await res.text())) {
                if (seenUrls.has(j.url)) continue;
                seenUrls.add(j.url);
                allJobs.push(j);
                if (isUkLocation(j.location)) {
                    const idMatch = j.url.match(/-(\d+)$/);
                    if (idMatch) relatedSeeds.push(`https://jobs.arup.com/jobs/${idMatch[1]}/other-jobs-matching/location-only`);
                }
            }
        } catch { /* ignore seed failures */ }
    }

    for (const related of [...new Set(relatedSeeds)].slice(0, 8)) {
        try {
            const res = await fetchWithTimeout(related, { headers: { 'User-Agent': UA, Accept: 'text/html' } }, 15000);
            if (!res.ok) continue;
            for (const j of parseJobsFromHtml(await res.text())) {
                if (seenUrls.has(j.url)) continue;
                seenUrls.add(j.url);
                allJobs.push(j);
            }
        } catch { /* ignore */ }
    }

    const ukJobs = allJobs.filter((j) => isUkLocation(j.location));
    console.log(`[Arup] scraped ${allJobs.length} jobs, UK-located ${ukJobs.length}`);
    return Array.from(new Map(ukJobs.map((j) => [j.url, j])).values());
}

// ─── Jacobs (careers.jacobs.com — Playwright with stealth) ───────────────────
// careers.jacobs.com uses AWS WAF. We disable automation flags and add
// realistic timing to avoid bot detection.
async function fetchJacobs(_token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1440, height: 900 },
            extraHTTPHeaders: { 'Accept-Language': 'en-GB,en;q=0.9' },
        });
        // Mask webdriver property
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        const page = await context.newPage();

        const apiJobs: Job[] = [];
        const pending: Promise<void>[] = [];

        page.on('response', (response: any) => {
            const url = response.url();
            if (!(url.includes('/jobs') || url.includes('/search') || url.includes('position') || url.includes('requisition'))) return;
            if (!response.headers()['content-type']?.includes('json')) return;
            const p = response.json().then((d: any) => {
                const items = d?.jobs || d?.results || d?.jobPostings || d?.requisitionList ||
                    d?.data?.positions || d?.positions || (Array.isArray(d) ? d : []);
                for (const j of items) {
                    const title = j.title || j.jobTitle || j.Title || j.name || '';
                    const loc = j.location || j.primaryLocation || j.city || j.locationDescr || (j.locations || [])[0] || '';
                    const href = j.url || j.applyUrl || j.jobDetailUrl || j.canonicalPositionUrl || '';
                    if (title) apiJobs.push({ title, location: typeof loc === 'string' ? loc : (loc?.name || ''), url: href, department: j.department || j.category || '', salary: undefined });
                }
            }).catch(() => {});
            pending.push(p);
        });

        await page.waitForTimeout(1000 + Math.random() * 1000);
        await page.goto('https://careers.jacobs.com/jobs/search?locations=United+Kingdom&keywords=', { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(5000);
        await Promise.all(pending);

        if (apiJobs.length > 0) {
            allJobs.push(...apiJobs);
        } else {
            // HTML fallback
            const jobs = await page.$$eval(
                'a[href*="/jobs/"], [class*="job-card"] a, [class*="position"] a',
                (els: Element[]) => els.map(el => ({
                    title: ((el.querySelector('h2, h3, [class*="title"]') as HTMLElement)?.innerText || (el as HTMLElement).innerText || '').trim(),
                    url: (el as HTMLAnchorElement).href || '',
                    location: ((el.closest('li,article,div,[class*="card"]')?.querySelector('[class*="location"]') as HTMLElement)?.innerText || 'United Kingdom').trim(),
                    department: ((el.closest('li,article,div,[class*="card"]')?.querySelector('[class*="department"]') as HTMLElement)?.innerText || '').trim(),
                })).filter((j: any) => j.title && j.url)
            );
            allJobs.push(...jobs as Job[]);
        }

        await context.close();
    } catch (e: any) {
        console.error('[Jacobs] scraper error:', e.message);
        if (context) await context.close().catch(() => {});
    }
    return Array.from(new Map(allJobs.map(j => [j.url, j])).values());
}

// ─── WSP UK (wsprecruit.mindmill.co.uk — Playwright, /Vacancies) ─────────────
// Debug: page URL is /Vacancies not /Jobs. Uses JS rendering. Playwright + scroll.
async function fetchWSP(_token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
        browser = await getSharedBrowser();
        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 900 },
        });
        const page = await context.newPage();

        const apiJobs: Job[] = [];
        const pending: Promise<void>[] = [];

        page.on('response', (response: any) => {
            const url = response.url();
            if (!response.headers()['content-type']?.includes('json')) return;
            if (!(url.includes('Vacanc') || url.includes('vacanc') || url.includes('search') || url.includes('job'))) return;
            const p = response.json().then((d: any) => {
                const items = d?.jobs || d?.vacancies || d?.Vacancies || d?.results || d?.data || (Array.isArray(d) ? d : []);
                for (const j of items) {
                    const title = j.title || j.jobTitle || j.name || j.Title || j.VacancyTitle || '';
                    const loc = j.location || j.Location || j.town || j.Town || j.city || 'United Kingdom';
                    const href = j.url || j.Url || j.applyUrl || j.VacancyUrl || '';
                    if (title) apiJobs.push({ title, location: typeof loc === 'string' ? loc : 'United Kingdom', url: href || 'https://wsprecruit.mindmill.co.uk/Vacancies', department: j.department || j.Category || '', salary: undefined });
                }
            }).catch(() => {});
            pending.push(p);
        });

        await page.goto('https://wsprecruit.mindmill.co.uk/Vacancies', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);
        await Promise.all(pending);

        if (apiJobs.length > 0) {
            allJobs.push(...apiJobs);
        } else {
            // Scroll and collect all job links from HTML
            let prevCount = 0;
            for (let i = 0; i < 10; i++) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.waitForTimeout(1500);
                const count: number = await page.$$eval('a[href*="Vacanc"], a[href*="vacanc"]', els => els.length);
                if (count === prevCount) break;
                prevCount = count;
            }

            const jobs = await page.$$eval(
                'a[href*="Vacanc"], a[href*="vacanc"], a[href*="/job"]',
                (els: Element[]) => els.map(el => {
                    const href = (el as HTMLAnchorElement).href || '';
                    const card = el.closest('li, article, div, tr') as HTMLElement | null;
                    return {
                        title: ((card?.querySelector('[class*="title"], [class*="name"], h2, h3, strong') as HTMLElement)?.innerText
                            || (el as HTMLElement).innerText || '').trim(),
                        url: href,
                        location: ((card?.querySelector('[class*="location"], [class*="town"]') as HTMLElement)?.innerText || 'United Kingdom').trim(),
                        department: ((card?.querySelector('[class*="department"], [class*="category"]') as HTMLElement)?.innerText || '').trim(),
                    };
                }).filter((j: any) => j.title && j.url && j.url.includes('mindmill'))
            );
            allJobs.push(...jobs as Job[]);
        }

        await context.close();
    } catch (e: any) {
        console.error('[WSP] scraper error:', e.message);
        if (context) await context.close().catch(() => {});
    }
    return Array.from(new Map(allJobs.map(j => [j.url, j])).values());
}

// --- Cornerstone ---
async function fetchCornerstone(token: string): Promise<Job[]> {
    try {
        const homeUrl = `https://${token}.csod.com/ux/ats/careersite/1/home?c=${token}`;
        const homeRes = await fetchWithTimeout(homeUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!homeRes.ok) return [];
        const html = await homeRes.text();
        
        const tokenMatch = html.match(/csod\.context\.token\s*=\s*['"]([^'"]+)['"]/i) || html.match(/"token"\s*:\s*"([^"]+)"/i);
        if (!tokenMatch) return [];
        const jwt = tokenMatch[1];
        
        const hostMatch = html.match(/https?:\/\/[a-z0-9-]+\.api\.csod\.com/i);
        const apiHost = hostMatch ? hostMatch[0] : 'https://na.api.csod.com';
        
        let allJobs: any[] = [];
        let page = 1;
        while (true) {
            const reqUrl = `${apiHost}/rec-job-search/external/jobs`;
            const payload = {
                careerSiteId: 1, careerSitePageId: 1, pageNumber: page, pageSize: 100, cultureId: 1, cultureName: "en-US"
            };
            const reqRes = await fetchWithTimeout(reqUrl, {
                method: 'POST',
                headers: { 'User-Agent': 'Mozilla/5.0', 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!reqRes.ok) break;
            const data = await reqRes.json();
            const reqs = data?.data?.requisitions || [];
            if (!reqs.length) break;
            
            allJobs.push(...reqs);
            if (data?.data?.totalCount && allJobs.length >= data.data.totalCount) break;
            page++;
        }
        
        return allJobs.map((j: any) => ({
            title: j.displayJobTitle || 'Untitled',
            url: `https://${token}.csod.com/ux/ats/careersite/1/job/${j.requisitionId}?c=${token}`,
            location: Array.isArray(j.locations) ? j.locations.map((loc: any) => loc.city || loc.name || '').join(', ') : '',
            department: j.department || j.category || '',
            job_type: parseJobType([j.displayJobTitle, j.externalDescription, j.schedule, j.workerType]),
            atsProvider: 'cornerstone'
        })).filter(j => j.title && j.url);
    } catch { return []; }
}

// --- Gem ---
async function fetchGem(token: string): Promise<Job[]> {
    try {
        const payload = [{
            operationName: "JobBoardList",
            variables: { boardId: token },
            query: "query JobBoardList($boardId: String!) { oatsExternalJobPostings(boardId: $boardId) { jobPostings { id extId title locations { name city isoCountry isRemote } job { employmentType department { name } } } } }"
        }];
        const res = await fetchWithTimeout('https://jobs.gem.com/api/public/graphql/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) return [];
        const batch = await res.json();
        if (!batch || !batch[0]) return [];
        
        const postings = batch[0]?.data?.oatsExternalJobPostings?.jobPostings || [];
        return postings.map((j: any) => ({
            title: j.title || '',
            url: `https://jobs.gem.com/${token}/${j.extId || j.id}`,
            location: Array.isArray(j.locations) && j.locations.length > 0 ? (j.locations[0].city || j.locations[0].name || '') : '',
            department: j.job?.department?.name || '',
            job_type: parseJobType([j.title, j.job?.department?.name, j.job?.employmentType]),
            atsProvider: 'gem'
        })).filter((j: any) => j.title && j.url);
    } catch { return []; }
}

// --- Join.com ---
async function fetchJoinCom(token: string): Promise<Job[]> {
    try {
        const homeRes = await fetchWithTimeout(`https://join.com/companies/${token}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!homeRes.ok) return [];
        const html = await homeRes.text();
        
        const idMatch = html.match(/"company"\s*:\s*\{\s*"id"\s*:\s*"?(\d+)"?/i) || html.match(/"companyId"\s*:\s*"?(\d+)"?/i);
        if (!idMatch) return [];
        const companyId = idMatch[1];
        
        let allJobs: any[] = [];
        let page = 1;
        while (true) {
            const apiRes = await fetchWithTimeout(`https://join.com/api/public/companies/${companyId}/jobs?locale=en-us&page=${page}&pageSize=100`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!apiRes.ok) break;
            const data = await apiRes.json();
            const items = data.items || [];
            if (!items.length) break;
            
            allJobs.push(...items);
            if (page >= (data.pagination?.totalPages || page)) break;
            page++;
        }
        
        return allJobs.map((j: any) => {
            let locParts: string[] = [];
            if (j.remoteType === 'ANYWHERE') {
                locParts = ['Remote'];
            } else {
                locParts = [j.location, j.city?.cityName || j.city?.city, j.city?.regionName || j.office?.regionName, j.city?.countryName || j.country?.name || j.office?.countryName].filter(Boolean);
                if (j.workplaceType === 'REMOTE') locParts.unshift('Remote');
            }
            
            return {
                title: j.title || '',
                url: j.url || `https://join.com/companies/${token}/jobs/${j.idParam || j.id}`,
                location: locParts.join(', ') || '',
                department: typeof j.department === 'string' ? j.department : (j.department?.name || ''),
                job_type: parseJobType([j.title, typeof j.department === 'string' ? j.department : j.department?.name, j.employmentType, j.workingTime, j.jobType, j.type]),
                atsProvider: 'join_com'
            };
        }).filter((j: any) => j.title && j.url);
    } catch { return []; }
}

// --- Mercor ---
async function fetchMercor(token: string): Promise<Job[]> {
    try {
        const res = await fetchWithTimeout('https://aws.api.mercor.com/work/listings-explore-page', {
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer',
                'Origin': 'https://work.mercor.com',
                'Referer': 'https://work.mercor.com/',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        if (!res.ok) return [];
        const data = await res.json();
        const listings = data.listings || [];
        
        return listings.map((j: any) => {
            const listingId = j.listingId || '';
            const title = j.title || '';
            const slugTitle = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '-').replace(/^-+|-+$/g, '');
            return {
                title,
                url: `https://work.mercor.com/jobs/${listingId}/${slugTitle}`,
                location: j.location || '',
                salary: (j.rateMin || j.rateMax) ? `${j.rateMin || ''}-${j.rateMax || ''}/${j.payRateFrequency || ''}` : undefined,
                atsProvider: 'mercor'
            };
        }).filter((j: any) => j.title && j.url);
    } catch { return []; }
}

// --- Phenom ---
export async function fetchPhenom(token: string): Promise<Job[]> {
    try {
        let baseUrl = token.replace(/\/$/, '');
        try {
            const parsed = new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`);
            if (/search-results/i.test(parsed.pathname)) {
                baseUrl = parsed.origin;
            } else {
                baseUrl = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
            }
        } catch { /* keep token as-is */ }
        // DHL and many global Phenom boards use /global/en, not /us/en.
        const localePaths = [
            '/global/en/search-results',
            '/us/en/search-results',
            '/gb/en/search-results',
            '/en/search-results',
            '/search-results',
        ];

        let searchPath = '';
        let seedHtml = '';
        let cookieHeader = '';
        let csrf = '';

        for (const path of localePaths) {
            const initRes = await fetchWithTimeout(`${baseUrl}${path}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!initRes.ok) continue;
        const html = await initRes.text();
            if (!/"jobs"\s*:\s*\[/.test(html) && !/csrfToken/i.test(html)) continue;
            searchPath = path;
            seedHtml = html;
            const headersAny = initRes.headers as Headers & { getSetCookie?: () => string[] };
            const setCookieList = typeof headersAny.getSetCookie === 'function'
                ? headersAny.getSetCookie()
                : [];
            cookieHeader = (setCookieList.length > 0
                ? setCookieList
                : [initRes.headers.get('set-cookie') || ''].filter(Boolean)
            )
                .map(c => c.split(';')[0].trim())
                .filter(pair => pair.includes('='))
                .join('; ');
        const csrfMatch = html.match(/"csrfToken"\s*:\s*"([^"]+)"/);
            csrf = csrfMatch ? csrfMatch[1] : '';
            break;
        }
        if (!searchPath) return [];

        // Prefer HTML pagination — DHL's /widgets endpoint often returns totalHits
        // without a jobs array (bot/session quirks). `?from=N&size=100` works.
        // For global boards, try a United Kingdom keyword filter first to avoid
        // pulling thousands of non-UK rows.
        const ukSeedUrl = `${baseUrl}${searchPath}?keywords=${encodeURIComponent('United Kingdom')}`;
        let ukSeedHtml = '';
        try {
            const ukRes = await fetchWithTimeout(ukSeedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (ukRes.ok) ukSeedHtml = await ukRes.text();
        } catch { /* ignore */ }

        const ukSeed = ukSeedHtml ? extractPhenomJobsFromHtml(ukSeedHtml) : { jobs: [], totalHits: 0 };
        if (ukSeed.jobs.length && ukSeed.totalHits > 0 && ukSeed.totalHits < 5000) {
            const ukJobs = await fetchPhenomHtmlPages(
                baseUrl,
                searchPath,
                ukSeedHtml,
                { keywords: 'United Kingdom', maxJobs: 2500 }
            );
            if (ukJobs.length) return ukJobs;
        }

        const htmlJobs = await fetchPhenomHtmlPages(baseUrl, searchPath, seedHtml, { maxJobs: 1500 });
        if (htmlJobs.length) return htmlJobs;

        // Widgets API fallback (works on some Phenom tenants)
        let allJobs: any[] = [];
        let from = 0;
        const locale = searchPath.includes('/global/') ? 'en_global'
            : searchPath.includes('/gb/') ? 'en_gb' : 'en_us';
        const country = searchPath.includes('/global/') ? 'global'
            : searchPath.includes('/gb/') ? 'gb' : 'us';
        
        while (true) {
            const payload = {
                lang: locale, country, deviceType: "desktop", pageName: "search-results",
                ddoKey: "refineSearch", from, size: 100, siteType: "external", global: true
            };
            const headers: any = {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0',
                'Referer': `${baseUrl}${searchPath}`,
                'Origin': baseUrl,
            };
            if (csrf) headers['x-csrf-token'] = csrf;
            if (cookieHeader) headers['Cookie'] = cookieHeader;
            
            const reqRes = await fetchWithTimeout(`${baseUrl}/widgets`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            if (!reqRes.ok) break;
            const data = await reqRes.json();
            
            const rs = data?.refineSearch || {};
            const hits = rs?.data?.jobs || rs?.jobs || rs?.hits || data?.jobs || [];
            if (!hits.length) break;
            
            allJobs.push(...hits);
            const total = rs?.totalHits || rs?.data?.totalHits || rs?.hitsCount || 0;
            from += hits.length;
            if (!total || from >= total) break;
        }
        
        return mapPhenomJobs(allJobs, baseUrl);
    } catch { return []; }
}

function extractPhenomJobsFromHtml(html: string): { jobs: any[]; totalHits: number } {
    const m = html.match(/"jobs"\s*:\s*(\[)/);
    if (!m || m.index == null) return { jobs: [], totalHits: 0 };
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < Math.min(html.length, start + 2_000_000); i++) {
        const ch = html[i];
        if (ch === '[') depth++;
        else if (ch === ']') {
            depth--;
            if (depth === 0) { end = i; break; }
        }
    }
    if (end < 0) return { jobs: [], totalHits: 0 };
    let jobs: any[] = [];
    try { jobs = JSON.parse(html.slice(start, end + 1)); } catch { return { jobs: [], totalHits: 0 }; }
    const th = html.match(/"totalHits"\s*:\s*(\d+)/);
    return { jobs, totalHits: th ? Number(th[1]) : jobs.length };
}

async function fetchPhenomHtmlPages(
    baseUrl: string,
    searchPath: string,
    seedHtml: string,
    opts?: { keywords?: string; maxJobs?: number }
): Promise<Job[]> {
    const pageSize = 100;
    const maxJobs = opts?.maxJobs ?? 2000;
    const first = extractPhenomJobsFromHtml(seedHtml);
    const all: any[] = [...(first.jobs || [])];
    const total = Math.min(first.totalHits || all.length, maxJobs);
    if (!all.length) return [];

    const qs = (from: number) => {
        const params = new URLSearchParams();
        params.set('from', String(from));
        params.set('size', String(pageSize));
        if (opts?.keywords) params.set('keywords', opts.keywords);
        return params.toString();
    };

    for (let from = all.length; from < total; from += pageSize) {
        const url = `${baseUrl}${searchPath}?${qs(from)}`;
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) break;
        const html = await res.text();
        const { jobs } = extractPhenomJobsFromHtml(html);
        if (!jobs.length) break;
        all.push(...jobs);
        if (all.length >= maxJobs) break;
        if (jobs.length < pageSize) break;
        await sleep(250);
    }

    return mapPhenomJobs(all.slice(0, maxJobs), baseUrl);
}

function mapPhenomJobs(allJobs: any[], baseUrl: string): Job[] {
        return allJobs.map((j: any) => {
        const atsId = j.jobId || j.id || j.reqId || '';
        let url = j.jobUrl || j.applyUrl || j.url || '';
        if (url && !url.startsWith('http')) {
                url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
            }
        if (!url && atsId) url = `${baseUrl}/job/${atsId}`;
        const location = [j.city, j.state, j.country].filter(Boolean).join(', ')
            || j.cityStateCountry
            || j.location
            || '';
            return {
                title: j.title || j.jobTitle || '',
            url,
            location,
                department: j.department || j.category || '',
                atsProvider: 'phenom'
            };
        }).filter((j: any) => j.title && j.url);
}

// --- Recruiterbox ---
async function fetchRecruiterbox(token: string): Promise<Job[]> {
    try {
        let allJobs: any[] = [];
        let offset = 0;
        while (true) {
            const res = await fetchWithTimeout(`https://jsapi.recruiterbox.com/v1/openings?client_name=${token}&offset=${offset}&limit=100`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) break;
            const data = await res.json();
            const objects = data.objects || [];
            if (!objects.length) break;
            
            allJobs.push(...objects);
            const total = data.meta?.total;
            offset += objects.length;
            if (total !== undefined && offset >= total) break;
            if (total === undefined && objects.length < 100) break;
        }
        
        return allJobs.map((j: any) => ({
            title: j.title || '',
            url: j.hosted_url || j.url || '',
            location: j.location ? [j.location.city, j.location.state, j.location.country].filter(Boolean).join(', ') : '',
            department: j.department || j.team || '',
            atsProvider: 'recruiterbox'
        })).filter((j: any) => j.title && j.url);
    } catch { return []; }
}


export const FETCHERS: Record<string, (token: string, company?: CompanyRow) => Promise<Job[]>> = {
    custom: fetchCustom,
    apple: fetchCustom,
    greenhouse: fetchGreenhouse,
    ashby: fetchAshby,
    lever: fetchLever,
    workable: fetchWorkable,
    teamtailor: fetchTeamtailor,
    teamtailor_html: fetchTeamtailorHtml,
    bamboohr: fetchBambooHR,
    smartrecruiters: fetchSmartRecruiters,
    pinpoint: fetchPinpoint,
    breezy: fetchBreezy,
    recruitee: fetchRecruitee,
    jobvite: fetchJobvite,
    avature: fetchAvature,
    personio: fetchPersonio,
    workday: fetchWorkday,
    oracle_cloud: fetchOracleCloud,
    wipro: fetchWipro,
    successfactors: fetchSuccessFactors,
    eightfold: fetchEightfold,
    hibob: fetchHibob,
    icims: fetchICIMS,
    rippling: fetchRippling,
    generic_careers: fetchGenericCareersPage,
    // UKG / UltiPro boards are HTML job boards — scrape via generic careers fetcher
    ultipro_html: fetchGenericCareersPage,
    ultipro: fetchGenericCareersPage,
    jazzhr: fetchJazzHR,
    oracle: fetchOracleTaleo,

    cornerstone: fetchCornerstone,
    gem: fetchGem,
    join_com: fetchJoinCom,
    mercor: fetchMercor,
    phenom: fetchPhenom,
    recruiterbox: fetchRecruiterbox,
    
    eploy: fetchEploy,
    talenttrack: fetchTalentTrack,
    softscape: fetchSoftscape,
    teachfirst: fetchTeachFirst,
    networkrail: fetchNetworkRail,

    // Company-specific scrapers
    astrazeneca: fetchAstraZeneca,
    easyjet: fetchEasyJet,
    btgroup: fetchBTGroup,
    siemens: fetchSiemens,
    vorboss: fetchVorboss,
    gxo: fetchGXO,
    royalmail: fetchRoyalMail,
    standardchartered: fetchStandardChartered,
    microsoft: fetchMicrosoft,
    arup: fetchArup,
    jacobs: fetchJacobs,
    wsp: fetchWSP,

    // Special / Custom Scrapers
    amazon: fetchAmazon,
    google: fetchGoogle,
    meta: fetchMeta,
    nhs: fetchNHS,
    goldmansachs: fetchGoldmanSachs,
    jpmc: fetchJPMorgan,
    publicis: fetchPublicis,
    linkedin: fetchLinkedin,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const ATS_FAILURE_THRESHOLD = 3;

async function markCompanyFailure(companyId: number): Promise<void> {
    const { data: current } = await supabase
        .from('companies')
        .select('ats_failure_count')
        .eq('id', companyId)
        .single();

    const nextCount = (current?.ats_failure_count || 0) + 1;
    const nextStatus = nextCount >= ATS_FAILURE_THRESHOLD ? 'needs_manual_review' : 'dead';

    await supabase
        .from('companies')
        .update({
            ats_status: nextStatus,
            ats_failure_count: nextCount,
            ats_last_validated: new Date().toISOString(),
        })
        .eq('id', companyId);
}

// ─── Python Location Normalizer ───────────────────────────────────────────────

export interface NormalizedLocation {
    raw_string: string;
    is_remote: boolean;
    is_hybrid: boolean;
    is_multi_location: boolean;
    city: string | null;
    state_province: string | null;
    country: string | null;
    is_uk_job: boolean;
}

/**
 * Persistent worker wrapping normalizeLocations.py. The old implementation
 * spawned a brand-new Python interpreter for every call (up to twice per
 * company — UK rows + Ireland rows — so thousands of times per sync run).
 * This keeps one interpreter alive for the whole run and talks to it over a
 * newline-delimited JSON request/response protocol, queueing concurrent
 * callers (the company loop now runs several companies in parallel) so
 * responses are matched to the request that produced them in order.
 */
class PythonLocationWorker {
    private proc: ReturnType<typeof spawn> | null = null;
    private pending: Array<{ resolve: (v: NormalizedLocation[]) => void }> = [];
    private stdoutBuffer = '';
    private startFailed = false;

    private ensureStarted(): boolean {
        if (this.proc) return true;
        if (this.startFailed) return false;

    const scriptPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'normalizeLocations.py',
    );
        const cmd = process.platform === 'win32' ? 'python' : 'python3';

        try {
        const proc = spawn(cmd, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
            this.proc = proc;

            proc.stdout.on('data', (d: Buffer) => this.onStdout(d.toString()));
            proc.stderr.on('data', (d: Buffer) => {
                console.warn('[normalizeLocations]', d.toString().slice(0, 300));
            });
            proc.on('error', () => this.onWorkerDown());
            proc.on('close', () => this.onWorkerDown());
            return true;
        } catch {
            this.startFailed = true;
            return false;
        }
    }

    private onStdout(chunk: string) {
        this.stdoutBuffer += chunk;
        let idx: number;
        // eslint-disable-next-line no-cond-assign
        while ((idx = this.stdoutBuffer.indexOf('\n')) !== -1) {
            const line = this.stdoutBuffer.slice(0, idx);
            this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
            const req = this.pending.shift();
            if (!req) continue; // stray output — nothing was waiting on it
            try {
                req.resolve(JSON.parse(line) as NormalizedLocation[]);
            } catch {
                req.resolve([]);
            }
        }
    }

    private onWorkerDown() {
        // Resolve every in-flight request as empty (matches the previous
        // non-fatal "on Python error, return []" contract) and allow a
        // fresh process to be spawned on the next call.
        const stale = this.pending;
        this.pending = [];
        this.proc = null;
        this.stdoutBuffer = '';
        for (const req of stale) req.resolve([]);
    }

    async normalize(locations: string[], market: 'uk' | 'ireland'): Promise<NormalizedLocation[]> {
        if (locations.length === 0) return [];
        if (!this.ensureStarted() || !this.proc?.stdin) return [];

        const payload = JSON.stringify(locations.map(l => ({ location: l, market })));
        return new Promise<NormalizedLocation[]>((resolve) => {
            // Push the resolver before writing so the response (arriving
            // asynchronously) is matched to the correct request in FIFO order,
            // even with several companies calling this concurrently.
            this.pending.push({ resolve });
            this.proc!.stdin!.write(payload + '\n', (err) => {
                if (err) this.onWorkerDown();
            });
        });
    }

    async shutdown(): Promise<void> {
        if (!this.proc) return;
        const proc = this.proc;
        this.proc = null;
        try {
            proc.stdin?.end();
            proc.kill();
            } catch {
            // already gone
        }
    }
}

const pythonLocationWorker = new PythonLocationWorker();

/**
 * Batch-normalise raw location strings via the persistent Python normalizer
 * worker. Returns results in the same order as the input array.
 * Non-fatal: on Python error or missing interpreter, returns [].
 */
export async function normalizeLocationsViaPython(
    locations: string[],
    market: 'uk' | 'ireland' = 'uk',
): Promise<NormalizedLocation[]> {
    return pythonLocationWorker.normalize(locations, market);
}

async function closePythonWorker(): Promise<void> {
    await pythonLocationWorker.shutdown();
}

/**
 * Given a NormalizedLocation result, produce a clean display string for storage.
 * e.g. { city: "London", country: "United Kingdom" } → "London"
 *      { city: "Dublin", country: "Ireland" } → "Dublin"
 *      { city: "New York", country: "United States", state_province: "NY" } → "New York, NY"
 *      { country: "Ireland" } → "Ireland"
 */
export function formatNormalizedLocation(n: NormalizedLocation): string | null {
    // Never emit the vague "Multiple Locations" placeholder — prefer country or null
    // so callers keep the raw multi-office string when it already passed the geo filter.
    if (n.is_multi_location) {
        if (n.country === 'United Kingdom') return n.city || 'United Kingdom';
        if (n.country === 'Ireland') return n.city || (n.is_remote ? 'Ireland (Remote)' : 'Ireland');
        return n.city || n.country || null;
    }

    const dropCountry = n.country === 'United Kingdom' || n.country === 'Ireland';

    const parts: string[] = [];
    if (n.city) parts.push(n.city);
    if (n.state_province && !dropCountry) parts.push(n.state_province);
    // UK postcodes are stored in state_province — keep them off the display string.
    // Ireland counties can stay when there is no city.
    if (n.state_province && n.country === 'Ireland' && !n.city) parts.push(n.state_province);
    if (n.country && !dropCountry) parts.push(n.country);

    if (parts.length === 0) {
        // A multi-office posting can be UK/Ireland-eligible with no single
        // office in that country resolving to a specific city (e.g. the
        // raw text just says "United Kingdom" as one of many offices) —
        // show the country name rather than falling through to a
        // different office's raw text.
        if (n.country === 'United Kingdom') return 'United Kingdom';
        if (n.country === 'Ireland') return n.is_remote ? 'Ireland (Remote)' : 'Ireland';
        if (n.is_remote) return 'Remote';
        return null;
    }

    if (n.is_remote && n.country === 'Ireland' && !n.city) return 'Ireland (Remote)';

    // Obscure UK towns aren't all in isUKJob's city list. Keep the country
    // suffix so later cleanup/re-validation still accepts them.
    if (n.city && n.country === 'United Kingdom') {
        const bare = n.city;
        if (isUKJob({ locations: [bare], isRemote: !!n.is_remote, isTrustedSource: false })) {
            return bare;
        }
        return `${bare}, United Kingdom`;
    }

    if (n.city && n.country === 'Ireland') {
        return n.city;
    }

    return parts.join(', ');
}

export async function syncAll() {
  // The whole run is wrapped so the shared Playwright browser and the
  // persistent Python normalizer worker always get torn down — on success,
  // on a thrown error, and whether this was invoked from the CLI or from
  // the /api/cron/sync-jobs route handler. Leaving either process running
  // would leak resources into the next cron invocation.
  try {
    const startTime = Date.now();
    const syncRunId = crypto.randomUUID();
    // Module-level logs/counters persist across cron warm starts — reset each run.
    globalRejectionLog.length = 0;
    filterLogBuffer.length = 0;
    serperCallCount = 0;
    serperHitCount = 0;
    console.log('\n════════════════════════════════════════════════════');
    console.log('  DAILY SYNC — ' + new Date().toISOString());
    console.log(`  sync_run_id=${syncRunId}`);
    console.log(`  stale_retention=${STALE_JOB_RETENTION_HOURS}h (soft-delete; no wipe-on-empty)`);
    console.log('════════════════════════════════════════════════════\n');

    try {
      await ensureSectorEmbeddingRuntime();
    } catch (e) {
      console.warn('[sector_embedding] Runtime init failed — sync continues; new rows may lack sector_embedding:', e);
    }

    const args = process.argv.slice(2);
    const idIndex = args.indexOf('--ids');
    const specificIds = idIndex !== -1 ? args[idIndex + 1].split(',').map(id => parseInt(id.trim())) : null;

    const providerIndex = args.indexOf('--provider');
    const targetProvider = providerIndex !== -1 ? args[providerIndex + 1].toLowerCase() : null;

    const startIndex = args.indexOf('--start-from-provider');
    const startFromProvider = startIndex !== -1 ? args[startIndex + 1].toLowerCase() : null;

    const startCompanyIndex = args.indexOf('--start-from-company');
    const startFromCompany = startCompanyIndex !== -1 ? args[startCompanyIndex + 1] : null;

    const startIdIndex = args.indexOf('--start-from-id');
    const startFromId = startIdIndex !== -1 ? parseInt(args[startIdIndex + 1]) : null;

    const fallbackOnlyDryRun = args.includes('--dry-run-custom-fallback');

    const includeLinkedin = !args.includes('--exclude-linkedin');
    const includeDeadAts = args.includes('--include-dead-ats');
    // Default OFF: location_filter_log filled the Free-tier disk (~3M rows).
    // Pass --enable-filter-log only when you explicitly need DQ audit rows.
    const skipFilterLog = !args.includes('--enable-filter-log');

    const marketIndex = args.indexOf('--market');
    const targetMarket = marketIndex !== -1
        ? String(args[marketIndex + 1] || '').toLowerCase()
        : null;

    if (fallbackOnlyDryRun) {
        console.log('Running in custom fallback DRY RUN mode (no DB writes)');
    }
    if (includeLinkedin) {
        console.log('LinkedIn companies are INCLUDED in this run (use --exclude-linkedin to skip)');
    } else {
        console.log('LinkedIn companies will be SKIPPED');
    }
    if (targetMarket) {
        console.log(`Filtering companies by sync_market=${targetMarket}`);
    }

    if (specificIds) {
        console.log(`Filtering for ${specificIds.length} specific IDs: ${specificIds.join(', ')}`);
    }

    let companies: CompanyRow[] = [];
    try {
        companies = await loadAllCompanies(specificIds);
    } catch (e: any) {
        console.error('❌ Could not load companies from DB:', e.message);
        return;
    }

    if (targetMarket === 'ireland') {
        companies = companies.filter((c) => {
            const market = resolveSyncMarket(c);
            const provider = String(c.ats_provider || '').toLowerCase();
            return market === 'ireland' || market === 'both' || provider === 'linkedin';
        });
        console.log(`Ireland-market companies: ${companies.length}`);
    } else if (targetMarket === 'uk') {
        companies = companies.filter((c) => {
            const market = resolveSyncMarket(c);
            return market === 'uk' || market === 'both';
        });
        console.log(`UK-market companies: ${companies.length}`);
    }

    const { count: statusCount, error: statusCountError } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true })
        .not('ats_status', 'is', null);

    if (statusCountError) {
        console.warn(`Could not determine health tracking state: ${statusCountError.message}`);
    }
    const healthTrackingEnabled = !!statusCount && statusCount > 0;
    if (!healthTrackingEnabled) {
        console.warn('Health tracking disabled - run validateAtsTokens.ts and repairBadTokens.ts first');
    }

    if (targetProvider) {
        companies = companies.filter(c => normalizeProviderName(c.ats_provider) === targetProvider || String(c.ats_provider).toLowerCase() === targetProvider);
        console.log(`Filtering for provider: ${targetProvider} (${companies.length} companies)`);
    }

    if (startFromProvider) {
        const index = companies.findIndex(c => normalizeProviderName(c.ats_provider) === startFromProvider || String(c.ats_provider).toLowerCase() === startFromProvider);
        if (index !== -1) {
            companies = companies.slice(index);
            console.log(`Starting from first ${startFromProvider} company: ${companies[0].trading_name} (${companies.length} remaining)`);
        } else {
            console.warn(`No company found with provider: ${startFromProvider}`);
        }
    }

    if (startFromCompany) {
        const index = companies.findIndex(c => String(c.trading_name || '').toLowerCase().includes(startFromCompany.toLowerCase()));
        if (index !== -1) {
            companies = companies.slice(index);
            console.log(`Resuming from company: ${companies[0].trading_name} (${companies.length} remaining)`);
        } else {
            console.warn(`No company found matching name: ${startFromCompany}`);
        }
    }

    if (startFromId) {
        const index = companies.findIndex(c => c.id === startFromId);
        if (index !== -1) {
            companies = companies.slice(index);
            console.log(`Resuming from company ID ${startFromId}: ${companies[0].trading_name} (${companies.length} remaining)`);
        } else {
            console.warn(`No company found with ID: ${startFromId}`);
        }
    }

    // Skip broken ATS boards on full runs (EC2 nightly). Explicit --ids always included.
    let skippedDeadAts = 0;
    if (!includeDeadAts && !(specificIds && specificIds.length > 0)) {
        const before = companies.length;
        companies = companies.filter((c) => {
            const status = String(c.ats_status || '').toLowerCase();
            return status !== 'dead' && status !== 'needs_manual_review';
        });
        skippedDeadAts = before - companies.length;
        if (skippedDeadAts > 0) {
            console.log(`Skipping ${skippedDeadAts} companies with ats_status dead/needs_manual_review (use --include-dead-ats to force)`);
        }
    } else if (includeDeadAts) {
        console.log('Including dead/needs_manual_review ATS companies (--include-dead-ats)');
    }

    console.log(`Found ${companies.length} companies with configured ATS\n`);

    if (fallbackOnlyDryRun && !specificIds) {
        companies = companies.filter((company) => {
            const provider = normalizeProviderName(company.ats_provider);
            return !provider || provider === 'custom' || !FETCHERS[provider];
        });
        console.log(`Filtered to ${companies.length} custom/no-ATS companies for fallback dry run\n`);
    } else if (fallbackOnlyDryRun) {
        console.log(`Using explicit IDs for fallback dry run (${companies.length} companies)\n`);
    }

    const results: SyncResult[] = [];
    let totalSaved = 0;
    let totalRejected = 0;
    let wipePreventedCount = 0;
    let stalePurgedCount = 0;

    // Each company's fetch/filter/persist pipeline is unchanged — only how
    // many run at once has changed. Companies used to run strictly one at a
    // time (fetch, then a flat 500ms sleep, then the next); with 2,500+
    // companies that serial wait was most of the run time. A bounded
    // concurrency pool now runs COMPANY_CONCURRENCY companies at once, each
    // still paced by its own 500ms politeness delay between its own
    // requests — no single ATS host sees more traffic per unit time than
    // before, there's just several independent companies' worth of it
    // in flight simultaneously instead of one.
    const COMPANY_CONCURRENCY = 8;
    const limit = pLimit(COMPANY_CONCURRENCY);

    async function processCompany(company: CompanyRow): Promise<void> {
        const { id, trading_name, ats_provider } = company;
        let logBuffer = '';

        if (String(ats_provider || '').toLowerCase() === 'linkedin' && !includeLinkedin) {
            return;
        }

        const resolved = resolveProviderAndToken(
            company.ats_provider,
            company.ats_board_token,
            company.careers_url ?? null
        );
        const displayProvider = (resolved?.provider || normalizeProviderName(ats_provider) || ats_provider || 'custom').toUpperCase();
        const isNHS = /\bnhs\b/i.test(trading_name);
        // Trusted UK-only companies where location may be missing from ATS data
        const isTrustedUKCompany = isNHS || /\baddison lee\b/i.test(trading_name);

        const result: SyncResult = {
            company: trading_name,
            provider: displayProvider.toLowerCase(),
            fetched: 0, ukJobs: 0, irelandJobs: 0, saved: 0, savedIreland: 0, rejected: 0, needsReview: 0
        };

        try {
            const fetchOutcome = await fetchJobsWithFallback(company, { fallbackOnly: fallbackOnlyDryRun });
            const providerKey = (resolved?.provider || normalizeProviderName(ats_provider) || ats_provider || 'custom').toLowerCase();
            const allJobs = stampAtsProvider(fetchOutcome.jobs, providerKey);
            result.fetched = allJobs.length;

            if (!allJobs.length) {
                console.log(`[${displayProvider.padEnd(12)}] ${trading_name.padEnd(30)} ⚪ Fetch: 0 | UK: 0 | Saved: 0`);
                results.push(result);
                return;
            }

            const ukJobs: Job[] = [];
            const irelandJobs: Job[] = [];
            let rejectedCount = 0;
            let needsReviewCount = 0;
            const syncMarket = resolveSyncMarket(company);
            const irelandOnlyMarket = syncMarket === 'ireland';

            const pushFilterLog = (
                decision: 'accept' | 'reject',
                reason: string,
                job: Job,
                market: string | null
            ) => {
                if (skipFilterLog || fallbackOnlyDryRun) return;
                filterLogBuffer.push({
                    company_id: String(id),
                    job_url: job.url || null,
                    raw_location: job.location || null,
                    source: displayProvider.toLowerCase(),
                    decision,
                    reason,
                    title: job.title || null,
                    market,
                    sync_run_id: syncRunId,
                });
            };

            for (const j of allJobs) {
                const atsProvider = j.atsProvider ?? j.source ?? providerKey;
                const adapterKey = `${atsProvider.toLowerCase()}ToJobLocationInput` as keyof typeof Adapters;
                const adapter = Adapters[adapterKey];

                // Fix empty/generic remote locations based on job title
                const titleLower = String(j.title || '').toLowerCase();
                let locTrimmed = String(j.location || '').trim();
                const locLower = locTrimmed.toLowerCase();
                
                if (!locTrimmed || locLower === 'remote' || locLower === '(remote)') {
                    if (titleLower.includes('uk remote') || titleLower.includes('remote uk') || titleLower.includes('united kingdom remote') || titleLower.includes('remote united kingdom')) {
                        j.location = 'UK Remote';
                    } else if (titleLower.includes('us remote') || titleLower.includes('remote us') || titleLower.includes('usa remote') || titleLower.includes('remote usa') || titleLower.includes('u.s. remote') || titleLower.includes('remote u.s')) {
                        j.location = 'US Remote';
                    } else if (titleLower.includes('india remote') || titleLower.includes('remote india')) {
                        j.location = 'India Remote';
                    } else if (titleLower.includes('remote')) {
                        j.location = 'Remote';
                    }
                }

                // Rebuild location input AFTER remote title rewrites so "US Remote" /
                // "India Remote" are not accepted as bare Remote UK jobs.
                // Sanitize title first so geo + taxonomy see clean text.
                j.title = sanitizeJobTitle(j.title);

                const titleReason = getJobTitleRejectReason(j.title);
                if (titleReason) {
                    rejectedCount++;
                    globalRejectionLog.push({
                        company: trading_name,
                        provider: displayProvider,
                        title: j.title,
                        location: j.location,
                        url: j.url,
                        reason: titleReason,
                    });
                    pushFilterLog('reject', titleReason, j, irelandOnlyMarket ? 'ireland' : 'uk');
                    continue;
                }

                const ingestReason = getIngestRejectReason(j, company);
                if (ingestReason) {
                    rejectedCount++;
                    globalRejectionLog.push({
                        company: trading_name,
                        provider: displayProvider,
                        title: j.title,
                        location: j.location,
                        url: j.url,
                        reason: ingestReason,
                    });
                    pushFilterLog('reject', ingestReason, j, irelandOnlyMarket ? 'ireland' : 'uk');
                    continue;
                }

                const locationInput = adapter ? adapter(j) : buildLocationInput(j);

                const matchesIreland = isIrelandJob(j.location, locationInput.locations);
                // Never let company-level trust bypass an explicit foreign location string.
                // NHS/Addison Lee still get a trust pass only when location is empty/remote/ambiguous.
                const locText = String(j.location || '').trim();
                const trustOk =
                    isTrustedUKCompany &&
                    (!locText || locationInput.isRemote || /^(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland)$/i.test(locText));
                const matchesUK = isUKJob(locationInput) || trustOk;

                // Ireland-market companies: only write RoI jobs to jobs_IR (never UK table).
                if (irelandOnlyMarket) {
                    if (matchesIreland) {
                        irelandJobs.push(j);
                        pushFilterLog('accept', 'ireland_geo', j, 'ireland');
                    } else {
                        rejectedCount++;
                        const reason = j.rejection_reason
                            || (isAmbiguousRemoteLocation(j.location) ? 'ambiguous_remote' : 'not_ireland_market');
                        globalRejectionLog.push({
                            company: trading_name,
                            provider: displayProvider,
                            title: j.title,
                            location: j.location,
                            url: j.url,
                            reason,
                        });
                        pushFilterLog('reject', reason, j, 'ireland');
                    }
                    continue;
                }

                // Dual-write for multi-location posts (e.g. "London | Dublin").
                if (matchesUK) {
                    ukJobs.push(j);
                    if (j.needs_review) needsReviewCount++;
                    pushFilterLog('accept', trustOk ? 'trusted_company' : 'uk_geo', j, 'uk');
                }
                if (matchesIreland) {
                    irelandJobs.push(j);
                    pushFilterLog('accept', 'ireland_geo', j, 'ireland');
                } else if (!matchesUK) {
                    rejectedCount++;
                    const reason = j.rejection_reason
                        || (isAmbiguousRemoteLocation(j.location) ? 'ambiguous_remote' : 'not_uk');
                    globalRejectionLog.push({
                        company: trading_name,
                        provider: displayProvider,
                        title: j.title,
                        location: j.location,
                        url: j.url,
                        reason,
                    });
                    pushFilterLog('reject', reason, j, 'uk');
                }
            }

            result.ukJobs = ukJobs.length;
            result.irelandJobs = irelandJobs.length;
            result.rejected = rejectedCount;
            result.needsReview = needsReviewCount;
            totalRejected += rejectedCount;

            const canWriteUk = isLicenceTruthy(company.licensed_sponsor);
            // Allow Ireland dual-write for UK licensed sponsors even when the
            // ireland_permit_employer flag has not been backfilled yet. Clear junk
            // (neither flag) is still blocked.
            const canWriteIreland =
                isLicenceTruthy(company.ireland_permit_employer) ||
                isLicenceTruthy(company.licensed_sponsor);

            if (!canWriteUk && ukJobs.length) {
                console.log(
                    `[${displayProvider.padEnd(12)}] ${trading_name.padEnd(30)} ⛔ Skip UK write — not licensed_sponsor (${ukJobs.length} matched)`
                );
            }
            if (!canWriteIreland && irelandJobs.length) {
                console.log(
                    `[${displayProvider.padEnd(12)}] ${trading_name.padEnd(30)} ⛔ Skip IR write — not permit/sponsor (${irelandJobs.length} matched)`
                );
            }

            const ukRows = !canWriteUk || irelandOnlyMarket
                ? []
                : await buildRowsForJobs(company, id, ukJobs, 'uk');
            const irelandRows = !canWriteIreland
                ? []
                : (await buildRowsForJobs(company, id, irelandJobs, 'ireland')).map((row) => ({
                    ...row,
                    source: 'ats' as const,
                }));

            const persistRows = async (tableName: 'jobs' | 'jobs_IR', rows: JobRow[]) => {
                const staleCutoff = new Date(
                    Date.now() - STALE_JOB_RETENTION_HOURS * 60 * 60 * 1000
                ).toISOString();

                /** Soft-delete only: expire rows not refreshed within the retention window. Never wipe on empty. */
                const purgeStaleForCompany = async (): Promise<number> => {
                    if (tableName === 'jobs_IR') {
                        const bySource = await supabase
                            .from(tableName)
                            .delete({ count: 'exact' })
                            .eq('company_id', id)
                            .eq('source', 'ats')
                            .lt('last_seen_at', staleCutoff);
                        if (bySource.error && /source|last_seen_at/i.test(bySource.error.message)) {
                            // Schema may lack source and/or last_seen_at — best-effort LinkedIn-safe purge
                            const { data: existing } = await supabase
                                .from(tableName)
                                .select('url, last_seen_at')
                                .eq('company_id', id);
                            const stale = (existing || [])
                                .filter((r: any) => {
                                    if (/linkedin\.com|lnkd\.in/i.test(r.url)) return false;
                                    if (!r.last_seen_at) return false;
                                    return r.last_seen_at < staleCutoff;
                                })
                                .map((r: any) => r.url as string);
                            let purged = 0;
                            for (const chunk of chunkArray(stale, 100)) {
                                const { error: delErr, count } = await supabase
                                    .from(tableName)
                                    .delete({ count: 'exact' })
                                    .in('url', chunk)
                                    .eq('company_id', id);
                                if (!delErr) purged += count || chunk.length;
                            }
                            return purged;
                        }
                        if (bySource.error) {
                            console.warn(`[${displayProvider}] ${trading_name} ${tableName} stale purge: ${bySource.error.message}`);
                            return 0;
                        }
                        return bySource.count || 0;
                    }

                    const { error, count } = await supabase
                        .from(tableName)
                        .delete({ count: 'exact' })
                        .eq('company_id', id)
                        .lt('last_seen_at', staleCutoff);
                    if (error) {
                        if (/last_seen_at/i.test(error.message)) {
                            console.warn(`[${displayProvider}] ${trading_name} ${tableName}: last_seen_at missing — skip stale purge (run add_last_seen_at.sql)`);
                        } else {
                            console.warn(`[${displayProvider}] ${trading_name} ${tableName} stale purge: ${error.message}`);
                        }
                        return 0;
                    }
                    return count || 0;
                };

                // Phase 1: never wipe the whole company set when today's filter yields 0 rows.
                if (!rows.length) {
                    const purged = await purgeStaleForCompany();
                    stalePurgedCount += purged;
                    if (purged > 0) {
                        console.log(`[${displayProvider}] ${trading_name.padEnd(30)} 🛡️  ${tableName}: 0 saved — preserved live set, purged ${purged} stale (>${STALE_JOB_RETENTION_HOURS}h)`);
                    }
                    return 0;
                }

                const { error: jobErr } = await supabase.from(tableName).upsert(rows, { onConflict: 'url' });
                if (jobErr) {
                    console.error(`[${displayProvider}] Initial upsert failed for ${trading_name}: ${jobErr.message}`);
                    // Graceful degrade when optional columns are missing from the live schema.
                    const stripSectorEmbedding = /sector_embedding/i.test(jobErr.message);
                    const stripSector =
                        /schema cache/i.test(jobErr.message) ||
                        (/\bsector\b/i.test(jobErr.message) && !stripSectorEmbedding);
                    const stripSource = /source/i.test(jobErr.message);
                    const stripSeen = /last_seen_at/i.test(jobErr.message);
                    const stripJobType = /job_type/i.test(jobErr.message);
                    if (stripSector || stripSectorEmbedding || stripSource || stripSeen || stripJobType) {
                        const stripped = rows.map((row) => {
                            const next: Record<string, unknown> = {
                                company_id: row.company_id,
                                title: row.title,
                                location: row.location,
                                url: row.url,
                                department: row.department,
                                level: row.level,
                                updated_at: row.updated_at,
                            };
                            if (!stripSector) next.sector = row.sector;
                            if (!stripSectorEmbedding && row.sector_embedding) {
                                next.sector_embedding = row.sector_embedding;
                            }
                            if (!stripSource && row.source) next.source = row.source;
                            if (!stripSeen) next.last_seen_at = row.last_seen_at;
                            if (!stripJobType) next.job_type = row.job_type;
                            return next;
                        });
                        const { error: fallbackErr } = await supabase
                            .from(tableName)
                            .upsert(stripped as any, { onConflict: 'url' });
                        if (!fallbackErr) {
                            console.warn(`[${displayProvider}] ${trading_name} ${tableName} upsert retried with reduced columns.`);
                            const purged = await purgeStaleForCompany();
                            stalePurgedCount += purged;
                            return rows.length;
                        }
                        console.error(`[${displayProvider}] ${trading_name} ${tableName} retry failed: ${fallbackErr.message}`);
                        return 0;
                    }
                    console.error(`[${displayProvider}] ${trading_name} ${tableName} upsert failed: ${jobErr.message}`);
                    return 0;
                }

                const purged = await purgeStaleForCompany();
                stalePurgedCount += purged;
                return rows.length;
            };

            if (!fallbackOnlyDryRun) {
                // Count once per company when a fetch returned jobs but markets saved nothing
                // (the old path would have wiped the company job set).
                if (
                    (!irelandOnlyMarket && ukRows.length === 0) ||
                    (irelandOnlyMarket && irelandRows.length === 0)
                ) {
                    wipePreventedCount++;
                }
                const savedUK = irelandOnlyMarket ? 0 : await persistRows('jobs', ukRows);
                const savedIreland = await persistRows('jobs_IR', irelandRows);
                result.saved = savedUK + savedIreland;
                result.savedIreland = savedIreland;
                totalSaved += result.saved;
            } else {
                result.saved = ukRows.length + irelandRows.length;
                result.savedIreland = irelandRows.length;
                totalSaved += result.saved;
            }
            if (healthTrackingEnabled && !fallbackOnlyDryRun) {
                await supabase.from('companies').update({
                    ats_status: 'ok',
                    ats_failure_count: 0,
                    ats_last_validated: new Date().toISOString(),
                }).eq('id', id);
            }

            // Update active jobs count — skip for Ireland-only market so they don't dominate UK browse.
            if (!fallbackOnlyDryRun && !irelandOnlyMarket) {
                const { count: finalCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', id);
                await supabase.from('companies').update({ active_jobs_count: finalCount || 0 }).eq('id', id);
            } else if (!fallbackOnlyDryRun && irelandOnlyMarket) {
                await supabase.from('companies').update({ active_jobs_count: 0 }).eq('id', id);
            }

            const statusEmoji = (result.ukJobs + result.irelandJobs) > 0 ? '✅' : '⚪';
            console.log(`[${displayProvider.padEnd(12)}] ${trading_name.padEnd(30)} ${statusEmoji} Fetch: ${result.fetched.toString().padEnd(3)} | UK: ${result.ukJobs.toString().padEnd(3)} | IR: ${result.irelandJobs.toString().padEnd(3)} | Dups: ${(result.ukJobs + result.irelandJobs - result.saved).toString().padEnd(3)} | Saved: ${result.saved.toString().padEnd(3)} | Rej: ${result.rejected.toString().padEnd(3)} | Rev: ${result.needsReview}`);

            results.push(result);
            await sleep(500); // Politeness delay
        } catch (err: any) {
            console.log(`[${displayProvider}] ${trading_name} ... ❌ ERROR: ${err.message}`);
            results.push({ ...result, error: err.message });
            if (healthTrackingEnabled && !fallbackOnlyDryRun) {
                await markCompanyFailure(id);
            }
        }
    }

    await Promise.all(companies.map((company) => limit(() => processCompany(company))));

    // ─── Summary ─────────────────────────────────────────────────────────────
    const finishedAt = new Date();
    const durationMs = Date.now() - startTime;
    const elapsed = (durationMs / 1000).toFixed(1);
    const withJobs = results.filter(r => r.saved > 0);
    const noJobs = results.filter(r => r.saved === 0 && !r.error);
    const errored = results.filter(r => r.error);

    console.log('\n════════════════════════════════════════════════════');
    console.log('  SYNC COMPLETE');
    console.log('════════════════════════════════════════════════════');
    console.log(`  ⏱  Time:          ${elapsed}s`);
    console.log(`  🆔 Sync run:      ${syncRunId}`);
    console.log(`  🏢 Companies:      ${companies.length} processed`);
    console.log(`  ✅ With jobs:      ${withJobs.length}`);
    console.log(`  ➕ Jobs saved:     ${totalSaved}`);
    console.log(`  🚫 Rejected:       ${totalRejected}`);
    console.log(`  🛡️  Wipe prevented: ${wipePreventedCount} (empty filter kept live set)`);
    console.log(`  🧹 Stale purged:   ${stalePurgedCount} (>${STALE_JOB_RETENTION_HOURS}h)`);
    console.log(`  ⚪ No jobs saved:  ${noJobs.length}`);
    if (fallbackOnlyDryRun) {
        console.log('  🧪 Mode:          custom fallback dry run (no writes)');
    }
    if (SERPER_API_KEY) {
        console.log(`  🔎 Serper hits:    ${serperHitCount}/${serperCallCount}`);
    }
    if (errored.length > 0) {
        console.log(`  ❌ Errors:        ${errored.length}`);
        errored.forEach(r => console.log(`     - ${r.company}: ${r.error}`));
    }

    // Persist filter decisions for DQ (location_filter_log)
    let filterLogsWritten = 0;
    if (!fallbackOnlyDryRun && !skipFilterLog) {
        filterLogsWritten = await flushFilterLogs();
        if (filterLogsWritten > 0) {
            console.log(`  📋 Filter log rows: ${filterLogsWritten}`);
        }
    } else if (skipFilterLog) {
        filterLogBuffer.length = 0;
        console.log('  📋 Filter log skipped (default; pass --enable-filter-log to write)');
    }

    // Persist sync summary for DQ ownership (table: sync_run_summary)
    if (!fallbackOnlyDryRun) {
        const summaryRow = {
            sync_run_id: syncRunId,
            started_at: new Date(startTime).toISOString(),
            finished_at: finishedAt.toISOString(),
            duration_ms: durationMs,
            companies_processed: companies.length,
            companies_with_jobs: withJobs.length,
            companies_errored: errored.length,
            jobs_saved: totalSaved,
            jobs_rejected: totalRejected,
            wipe_prevented: wipePreventedCount,
            stale_purged: stalePurgedCount,
            serper_calls: serperCallCount,
            serper_hits: serperHitCount,
            dry_run: false,
            market_filter: targetMarket || null,
            notes: `retention=${STALE_JOB_RETENTION_HOURS}h; skipped_dead_ats=${skippedDeadAts}; filter_logs=${filterLogsWritten}`,
        };
        const { error: summaryErr } = await supabase.from('sync_run_summary').insert(summaryRow);
        if (summaryErr) {
            console.warn(`  ⚠ Could not persist sync_run_summary: ${summaryErr.message}`);
            console.warn('     Run supabase/create_sync_run_summary.sql if the table is missing.');
        } else {
            console.log(`  📊 Sync summary saved (sync_run_id=${syncRunId})`);
        }
    }

    // Gap 9: Print Rejection Summary
    if (globalRejectionLog.length > 0) {
        const fs = await import('fs');
        const path = await import('path');
        const logPath = path.resolve(process.cwd(), 'rejection_log.json');
        fs.writeFileSync(logPath, JSON.stringify(globalRejectionLog, null, 2));

        console.log(`\n  📝 Rejection Log saved to ${logPath}`);
        console.log(`  Total rejected: ${globalRejectionLog.length}`);

        // Count top rejection reasons
        const reasons: Record<string, number> = {};
        for (const log of globalRejectionLog) {
            reasons[log.reason] = (reasons[log.reason] || 0) + 1;
        }
        console.log('  Top rejection reasons:');
        Object.entries(reasons)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([reason, count]) => {
                console.log(`     - ${reason}: ${count}`);
            });
    }
    console.log('');

    if (withJobs.length > 0) {
        console.log('  Top results:');
        withJobs
            .sort((a, b) => b.saved - a.saved)
            .slice(0, 10)
            .forEach(r => console.log(`     ${r.company.padEnd(35)} ${r.saved} jobs  [${r.provider}]`));
    }
    console.log('════════════════════════════════════════════════════\n');
  } finally {
    await closeSharedBrowser();
    await closePythonWorker();
  }
}

const isDirectExecution = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

if (isDirectExecution) {
    syncAll().catch(console.error);
}
