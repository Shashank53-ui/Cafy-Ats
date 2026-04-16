import axios, { AxiosError, AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { createAdminClient } from '../utils/supabase/admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type AtsStatus =
    | 'ok'
    | 'bad_token'
    | 'auth_or_bot_protected'
    | 'dead'
    | 'unchecked'
    | 'needs_manual_review'
    | 'no_careers_page_found';

interface CompanyRow {
    id: number;
    trading_name: string;
    url: string | null;
    careers_url?: string | null;
    ats_provider: string | null;
    ats_board_token: string | null;
    ats_status: string | null;
}

interface CliArgs {
    limit: number | null;
    provider: string | null;
    recheck: boolean;
    companyId: number | null;
}

interface CareersCandidate {
    url: string;
    score: number;
    text: string;
}

interface DetectionHit {
    provider: string;
    token: string;
    source: string;
}

interface ProbeResult {
    status: AtsStatus;
    code: number | '';
    tokenUsed: string;
}

interface RunRow {
    company: CompanyRow;
    careersUrlFound: string | null;
    oldProvider: string | null;
    oldToken: string | null;
    newProvider: string | null;
    newToken: string | null;
    status: AtsStatus;
    probeStatusCode: number | '';
    source: string;
    notes: string;
    changed: boolean;
}

interface SearchOrganicResult {
    link?: string;
    snippet?: string;
}

interface SearchMatch {
    provider: string;
    token: string;
    source: string;
    careersUrl: string | null;
    notes: string;
}

const CAREERS_LINK_PATTERNS: RegExp[] = [
    /careers/i,
    /jobs/i,
    /work.with.us/i,
    /join.us/i,
    /we.are.hiring/i,
    /join.our.team/i,
    /open.roles/i,
    /vacancies/i,
    /opportunities/i,
];

const ATS_PATTERNS: Array<{ provider: string; regex: RegExp }> = [
    { provider: 'greenhouse', regex: /boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i },
    { provider: 'lever', regex: /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i },
    { provider: 'ashby', regex: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i },
    { provider: 'workable', regex: /apply\.workable\.com\/([a-zA-Z0-9_-]+)/i },
    { provider: 'smartrecruiters', regex: /jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/i },
    { provider: 'recruitee', regex: /([a-zA-Z0-9_-]+)\.recruitee\.com/i },
    { provider: 'pinpoint', regex: /([a-zA-Z0-9_-]+)\.pinpointhq\.com/i },
    { provider: 'breezy', regex: /([a-zA-Z0-9_-]+)\.breezy\.hr/i },
    { provider: 'jobvite', regex: /jobs\.jobvite\.com\/([a-zA-Z0-9_-]+)/i },
    { provider: 'teamtailor', regex: /([a-zA-Z0-9_-]+)\.teamtailor\.com/i },
    { provider: 'bamboohr', regex: /([a-zA-Z0-9_-]+)\.bamboohr\.com/i },
    { provider: 'workday', regex: /([a-zA-Z0-9_-]+)\.wd\d+\.myworkdayjobs\.com/i },
    { provider: 'icims', regex: /([a-zA-Z0-9_-]+)\.icims\.com/i },
    { provider: 'successfactors', regex: /([a-zA-Z0-9_-]+)\.successfactors\.com/i },
    { provider: 'taleo', regex: /([a-zA-Z0-9_-]+)\.taleo\.net/i },
    { provider: 'avature', regex: /([a-zA-Z0-9_-]+)\.avature\.net/i },
];

const PROVIDER_PRIORITY = [
    'greenhouse',
    'ashby',
    'lever',
    'workable',
    'teamtailor',
    'bamboohr',
    'smartrecruiters',
    'recruitee',
    'pinpoint',
    'breezy',
    'jobvite',
    'workday',
    'icims',
    'successfactors',
    'taleo',
    'avature',
];

const INVALID_TOKENS = new Set([
    'www', 'jobs', 'careers', 'apply', 'hire', 'work',
    'en-us', 'en', 'job', 'career', 'about', 'company',
    'portal', 'external', 'internal', 'search', 'listing',
    'us', 'uk', 'eu', 'fr', 'de',
    'v1', 'v2', 'api',
    'home', 'index', 'page', 'post', 'category',
    // Static asset and path fragments
    'assets', 'asset', 'article', 'articles', 'lib', 'libs', 'library',
    'web', 'locale', 'locales', 'i18n', 'public', 'static',
    'images', 'img', 'css', 'js', 'javascript', 'styles',
    'fonts', 'icons', 'media', 'files', 'documents',
    'connect', 'login', 'signin', 'auth', 'logout',
    'help', 'support', 'faq', 'contact', 'feedback',
    'product', 'products', 'updates', 'news', 'blog',
    'pricing', 'solutions', 'platform', 'features',
    'viewer', 'pdfjs', 'pdf', 'document', 'cancel',
    'rehire', 'onboarding', 'eor', 'restart',
]);

const EXCLUDED_PATHS = [
    '/', '#', '', '/about', '/contact',
    '/blog', '/news', '/pricing', '/product', '/solutions',
    '/platform', '/login', '/signup', '/docs', '/support',
];

const ATS_HOST_HINTS = [
    'greenhouse.io',
    'lever.co',
    'ashbyhq.com',
    'workable.com',
    'smartrecruiters.com',
    'recruitee.com',
    'pinpointhq.com',
    'breezy.hr',
    'jobvite.com',
    'teamtailor.com',
    'bamboohr.com',
    'myworkdayjobs.com',
    'icims.com',
    'successfactors.com',
    'taleo.net',
    'avature.net',
];

const HEURISTIC_PROVIDERS = [
    'greenhouse',
    'lever',
    'ashby',
    'workable',
    'teamtailor',
];

const PROBES: Record<string, (token: string) => string> = {
    greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${t}/departments`,
    lever: (t) => `https://api.lever.co/v0/postings/${t}?limit=1&mode=json`,
    ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${t}`,
    workable: (t) => `https://apply.workable.com/${t}/`,
    smartrecruiters: (t) => `https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=1`,
    recruitee: (t) => `https://${t}.recruitee.com/api/offers`,
    pinpoint: (t) => `https://${t}.pinpointhq.com/postings.json`,
    breezy: (t) => `https://${t}.breezy.hr/json`,
    jobvite: (t) => `https://jobs.jobvite.com/api/company/${t}/jobs`,
    teamtailor: (t) => `https://${t}.teamtailor.com/jobs.json?page[size]=1`,
    bamboohr: (t) => `https://${t}.bamboohr.com/careers/list`,
};

const USER_AGENT = 'Mozilla/5.0 (compatible; JobBot/1.0)';

const SERPER_API_KEY = process.env.SERPER_API_KEY?.trim() || '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY?.trim() || '';
const SEARCH_MIN_INTERVAL_MS = Math.max(500, Number(process.env.SEARCH_MIN_INTERVAL_MS || 2000));
const DDG_DELAYS_MS = [2000, 5000, 10000];
const DETECT_BATCH_SIZE = Math.max(1, Number(process.env.ATS_DETECT_BATCH_SIZE || 1));
const SERPER_ATS_SITE_HINTS = [
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
let serperDisabled = false;

const DEFAULT_SEARXNG_INSTANCES = [
    'https://searx.be',
    'https://search.bus-hit.me',
    'https://searxng.site',
    'https://paulgo.io',
    'https://search.inetol.net',
];

const SEARXNG_INSTANCES = (process.env.SEARXNG_INSTANCES || DEFAULT_SEARXNG_INSTANCES.join(','))
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);

let duckDuckGoCallCount = 0;
let duckDuckGoSuccessCount = 0;
let serperCallCount = 0;
let serperSuccessCount = 0;
let searxngCallCount = 0;
let searxngSuccessCount = 0;
let tavilyCallCount = 0;
let tavilySuccessCount = 0;
let searchQueue: Promise<void> = Promise.resolve();
let lastSearchRequestAt = 0;
let searxngInstanceIndex = 0;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSerializedSearchRequest<T>(task: () => Promise<T>): Promise<T> {
    const previous = searchQueue;
    let release = () => {};
    searchQueue = new Promise<void>((resolve) => {
        release = resolve;
    });

    await previous;
    try {
        const elapsed = Date.now() - lastSearchRequestAt;
        const waitMs = Math.max(0, SEARCH_MIN_INTERVAL_MS - elapsed);
        if (waitMs > 0) {
            await sleep(waitMs + Math.floor(Math.random() * 500));
        }

        const result = await task();
        lastSearchRequestAt = Date.now();
        return result;
    } finally {
        release();
    }
}

function csvEscape(value: unknown): string {
    const text = value === null || value === undefined ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function parseCliArgs(): CliArgs {
    const args = process.argv.slice(2);
    const parsed: CliArgs = {
        limit: null,
        provider: null,
        recheck: false,
        companyId: null,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--limit') {
            const next = args[i + 1];
            if (!next) throw new Error('Missing value for --limit');
            const n = Number(next);
            if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --limit value: ${next}`);
            parsed.limit = Math.floor(n);
            i++;
            continue;
        }

        if (arg === '--provider') {
            const next = args[i + 1];
            if (!next) throw new Error('Missing value for --provider');
            parsed.provider = next.trim().toLowerCase();
            i++;
            continue;
        }

        if (arg === '--company-id') {
            const next = args[i + 1];
            if (!next) throw new Error('Missing value for --company-id');
            const n = Number(next);
            if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --company-id value: ${next}`);
            parsed.companyId = Math.floor(n);
            i++;
            continue;
        }

        if (arg === '--recheck') {
            parsed.recheck = true;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return parsed;
}

function normalizeUrl(baseUrl: string, raw: string): string | null {
    try {
        if (!raw) return null;
        if (raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('#')) return null;
        return new URL(raw, baseUrl).toString();
    } catch {
        return null;
    }
}

function normalizeToken(token: string): string {
    return token.trim().toLowerCase().replace(/\/+$/, '');
}

function tokenSimilarityScore(token: string, companyName: string): number {
    if (!token || !companyName) return 0;
    const normalized = normalizeToken(token);
    const companyNorm = normalizeToken(companyName).replace(/[^a-z0-9]/g, '');
    
    // Exact match or substring
    if (normalized === companyNorm || companyNorm.includes(normalized) || normalized.includes(companyNorm)) {
        return 10;
    }
    
    // Phonetic/Levenshtein rough check: if length close and significant character overlap
    const lenDiff = Math.abs(normalized.length - companyNorm.length);
    if (lenDiff <= 3) {
        const overlap = [...normalized].filter(c => companyNorm.includes(c)).length;
        if (overlap >= Math.max(normalized.length, companyNorm.length) * 0.6) {
            return 5;
        }
    }
    
    return 0;
}

function extractHost(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function isInvalidToken(token: string): boolean {
    if (!token) return true;
    
    // Normalize: strip underscores, dashes, and whitespace from edges and middle junk
    const normalized = normalizeToken(token)
        .replace(/^[_\-]+|[_\-]+$/g, '')  // strip leading/trailing underscores/dashes
        .replace(/[_\-\s]+/g, '');         // remove internal junk
    
    if (!normalized || normalized.length === 0) return true;
    if (normalized.length < 2) return true;  // single-char tokens are garbage
    if (/^\d+$/.test(normalized)) return true;  // numeric-only tokens
    
    // Check against blocklist
    if (INVALID_TOKENS.has(normalized)) return true;
    
    // Reject anything that looks like a UUID or hash
    if (/^[a-f0-9]{8,}$/.test(normalized)) return true;
    
    return false;
}

function isPlausibleToken(token: string): boolean {
    if (!token) return false;
    const normalized = normalizeToken(token)
        .replace(/^[_\-]+|[_\-]+$/g, '')
        .replace(/[_\-\s]+/g, '');
    
    // Reasonable ATS token: 2-50 chars, alphanumeric + dash/underscore
    if (normalized.length < 2 || normalized.length > 50) return false;
    
    // Must contain at least one letter
    if (!/[a-z]/.test(normalized)) return false;
    
    // No more than 3 consecutive dashes/underscores
    if (/-{4,}|_{4,}/.test(normalized)) return false;
    
    return true;
}

function providerRank(provider: string): number {
    const index = PROVIDER_PRIORITY.indexOf(provider);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function scoreCareersLink(url: string, text: string): number {
    let score = 0;
    for (const pattern of CAREERS_LINK_PATTERNS) {
        const hrefMatch = pattern.test(url);
        const textMatch = pattern.test(text);
        if (hrefMatch) score += 2;
        if (textMatch) score += 2;
        if (hrefMatch && textMatch) score += 3;
    }
    return score;
}

function isExcludedCareersPath(url: string): boolean {
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        const cleaned = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
        if (EXCLUDED_PATHS.includes(cleaned)) return true;
        if (cleaned.split('/').filter(Boolean).length === 0) return true;
        return false;
    } catch {
        return true;
    }
}

async function fetchWithRedirects(
    inputUrl: string,
    timeoutMs: number,
    maxRedirects = 3
): Promise<{ finalUrl: string; html: string; status: number }> {
    let current = inputUrl;

    for (let i = 0; i <= maxRedirects; i++) {
        let response: AxiosResponse<string>;
        try {
            response = await axios.get<string>(current, {
                timeout: timeoutMs,
                maxRedirects: 0,
                responseType: 'text',
                validateStatus: () => true,
                headers: {
                    'User-Agent': USER_AGENT,
                    Accept: 'text/html,application/xhtml+xml,*/*',
                },
            });
        } catch (error) {
            throw error;
        }

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.location;
            if (!location) throw new Error(`Redirect without location header (${response.status})`);
            if (i === maxRedirects) throw new Error('Too many redirects');
            current = new URL(location, current).toString();
            continue;
        }

        return {
            finalUrl: current,
            html: typeof response.data === 'string' ? response.data : '',
            status: response.status,
        };
    }

    throw new Error('Unable to fetch URL');
}

function collectSources(html: string, pageUrl: string): { sources: string[]; links: string[] } {
    const $ = cheerio.load(html);
    const sources: string[] = [pageUrl, html];
    const links: string[] = [];

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const normalized = normalizeUrl(pageUrl, href);
        if (normalized) {
            sources.push(normalized);
            links.push(normalized);
        }
    });

    $('iframe[src], script[src]').each((_, el) => {
        const src = $(el).attr('src') || '';
        const normalized = normalizeUrl(pageUrl, src);
        if (normalized) {
            sources.push(normalized);
        }
    });

    return { sources, links };
}

function detectAtsFromSources(
    sources: string[],
    providerFilter: string | null
): DetectionHit | null {
    const orderedPatterns = [...ATS_PATTERNS].sort((a, b) => providerRank(a.provider) - providerRank(b.provider));
    let fallbackInvalidHit: DetectionHit | null = null;

    for (const pattern of orderedPatterns) {
        if (providerFilter && pattern.provider !== providerFilter) {
            continue;
        }

        for (const source of sources) {
            const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`);
            const match = regex.exec(source);
            if (match && match[1]) {
                const normalizedToken = normalizeToken(match[1]);
                if (!normalizedToken) {
                    continue;
                }

                const hit: DetectionHit = {
                    provider: pattern.provider,
                    token: normalizedToken,
                    source,
                };

                // Keep scanning if this token is clearly generic noise (for example "www").
                if (isInvalidToken(normalizedToken)) {
                    fallbackInvalidHit = fallbackInvalidHit || hit;
                    continue;
                }

                return {
                    provider: hit.provider,
                    token: hit.token,
                    source: hit.source,
                };
            }
        }
    }

    return fallbackInvalidHit;
}

function looksLikeJobListingLink(link: string): boolean {
    const lower = link.toLowerCase();
    const pathMatches = /\/job\/|\/jobs\/|\/role\/|\/opening\/|\/position\//i.test(lower);
    if (pathMatches) return true;

    const host = extractHost(link);
    return ATS_HOST_HINTS.some((hint) => host.includes(hint));
}

function classifyFetchError(error: unknown): AtsStatus {
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNABORTED') return 'dead';
        const status = axiosError.response?.status;
        if (status && status >= 500) return 'dead';
    }
    return 'dead';
}

async function findCareersPage(homepageUrl: string): Promise<{ careersUrl: string | null; notes: string }> {
    const homepage = await fetchWithRedirects(homepageUrl, 12_000, 3);
    if (homepage.status >= 400) {
        return { careersUrl: null, notes: `homepage_http_${homepage.status}` };
    }

    const $ = cheerio.load(homepage.html);
    const candidates: CareersCandidate[] = [];

    $('a[href]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim();
        const text = ($(el).text() || '').trim();
        const normalized = normalizeUrl(homepage.finalUrl, href);
        if (!normalized) return;
        if (isExcludedCareersPath(normalized)) return;

        const score = scoreCareersLink(normalized, text);
        if (score <= 0) return;

        candidates.push({ url: normalized, score, text });
    });

    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 0) {
        return { careersUrl: candidates[0].url, notes: `careers:${candidates[0].url}` };
    }

    const fallbackPaths = ['/careers', '/jobs'];
    for (const fallback of fallbackPaths) {
        const candidate = normalizeUrl(homepage.finalUrl, fallback);
        if (!candidate) continue;

        try {
            const res = await fetchWithRedirects(candidate, 15_000, 3);
            if (res.status >= 200 && res.status < 400 && res.html.length > 100) {
                return { careersUrl: res.finalUrl, notes: `fallback:${fallback}` };
            }
        } catch {
            // Try next fallback.
        }
    }

    return { careersUrl: null, notes: 'no_careers_page_found' };
}

function pickSampleJobLink(links: string[]): string | null {
    for (const link of links) {
        if (looksLikeJobListingLink(link)) {
            return link;
        }
    }
    return null;
}

function tokenVariants(token: string): string[] {
    const normalized = normalizeToken(token);
    const variants = new Set<string>();
    variants.add(normalized);

    const dashed = normalized.replace(/[\s_]+/g, '-');
    variants.add(dashed);
    variants.add(normalized.replace(/[-_]?\d+$/, ''));
    variants.add(dashed.replace(/[-_]?\d+$/, ''));
    variants.add(normalized.replace(/\d+$/, ''));

    const cleaned = [...variants]
        .map((v) => normalizeToken(v))
        .map((v) => v.replace(/[-_]+$/g, ''))
        .filter((v) => v.length > 0)
        .filter((v) => !isInvalidToken(v));

    return [...new Set(cleaned)];
}

async function probeUrl(url: string): Promise<{ code: number | ''; status: AtsStatus }> {
    try {
        const res = await axios.get<string>(url, {
            timeout: 8_000,
            maxRedirects: 3,
            responseType: 'text',
            validateStatus: () => true,
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'application/json,text/html,*/*',
            },
        });

        if (res.status === 200) {
            // 200 always wins.
            return { status: 'ok', code: 200 };
        }
        if (res.status === 404) {
            return { status: 'bad_token', code: 404 };
        }
        if (res.status === 401 || res.status === 403) {
            return { status: 'auth_or_bot_protected', code: res.status };
        }
        if (res.status >= 500) {
            return { status: 'dead', code: res.status };
        }
        return { status: 'bad_token', code: res.status };
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED') return { status: 'dead', code: '' };
            const status = error.response?.status;
            if (status && status >= 500) return { status: 'dead', code: status };
        }
        return { status: 'dead', code: '' };
    }
}

async function probeToken(provider: string, token: string, companyName?: string): Promise<ProbeResult> {
    const probeFn = PROBES[provider];
    if (!probeFn) {
        return { status: 'unchecked', code: '', tokenUsed: token };
    }

    // Pre-filter: reject obviously-bad tokens without probing
    if (!isPlausibleToken(token)) {
        return { status: 'bad_token', code: '', tokenUsed: normalizeToken(token) };
    }

    const variants = tokenVariants(token);
    if (variants.length === 0) {
        return { status: 'bad_token', code: 404, tokenUsed: normalizeToken(token) };
    }

    for (const variant of variants) {
        console.log(`[RETRY] Probing token variant: ${variant}`);
        const result = await probeUrl(probeFn(variant));
        if (result.status === 'ok') {
            return { status: 'ok', code: result.code, tokenUsed: variant };
        }
        if (result.status === 'auth_or_bot_protected' || result.status === 'dead') {
            return { status: result.status, code: result.code, tokenUsed: variant };
        }
    }

    return { status: 'bad_token', code: 404, tokenUsed: variants[0] || token };
}

function unwrapDuckDuckGoRedirect(url: string): string {
    try {
        const parsed = new URL(url);
        if (!parsed.hostname.toLowerCase().includes('duckduckgo.com')) {
            return url;
        }

        const redirect = parsed.searchParams.get('uddg') || parsed.searchParams.get('u');
        if (!redirect) return url;
        return decodeURIComponent(redirect);
    } catch {
        return url;
    }
}

function isValidSearchResultLink(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;

        const host = parsed.hostname.toLowerCase();
        if (host.includes('duckduckgo.com')) return false;
        return true;
    } catch {
        return false;
    }
}

function extractDuckDuckGoResults(html: string, num: number): SearchOrganicResult[] {
    const $ = cheerio.load(html || '');
    const results: SearchOrganicResult[] = [];
    const seen = new Set<string>();

    const pushResult = (linkRaw: string, snippetRaw: string): void => {
        if (results.length >= num) return;

        const unwrapped = unwrapDuckDuckGoRedirect((linkRaw || '').trim());
        if (!isValidSearchResultLink(unwrapped)) return;
        if (seen.has(unwrapped)) return;

        seen.add(unwrapped);
        const snippet = (snippetRaw || '').replace(/\s+/g, ' ').trim();
        results.push({
            link: unwrapped,
            snippet: snippet || undefined,
        });
    };

    $('div.result').each((_, el) => {
        if (results.length >= num) return;
        const linkRaw = ($(el).find('a.result__a').attr('href') || '').trim();
        const snippetRaw = ($(el).find('.result__snippet').text() || '').trim();
        pushResult(linkRaw, snippetRaw);
    });

    if (results.length < num) {
        $('a.result-link, a.result__url, a[href*="/l/?uddg="], a[href*="duckduckgo.com/l/?uddg="]').each((_, el) => {
            if (results.length >= num) return;
            const linkRaw = ($(el).attr('href') || '').trim();
            const snippetRaw = ($(el).closest('tr, td, div.result').text() || '').trim();
            pushResult(linkRaw, snippetRaw);
        });
    }

    return results;
}

async function duckDuckGoSearch(query: string, num: number): Promise<SearchOrganicResult[]> {
    duckDuckGoCallCount++;
    return runSerializedSearchRequest(async () => {
        try {
            const response = await axios.get<string>('https://html.duckduckgo.com/html/', {
                timeout: 10_000,
                responseType: 'text',
                params: { q: query },
                headers: {
                    'User-Agent': USER_AGENT,
                    Accept: 'text/html,application/xhtml+xml,*/*',
                },
            });

            let results = extractDuckDuckGoResults(response.data || '', num);

            if (results.length === 0) {
                const fallbackBody = new URLSearchParams({ q: query }).toString();
                const liteResponse = await axios.post<string>('https://lite.duckduckgo.com/lite/', fallbackBody, {
                    timeout: 10_000,
                    responseType: 'text',
                    headers: {
                        'User-Agent': USER_AGENT,
                        Accept: 'text/html,application/xhtml+xml,*/*',
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });
                results = extractDuckDuckGoResults(liteResponse.data || '', num);
            }

            if (results.length > 0) {
                duckDuckGoSuccessCount++;
            }

            return results;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const code = error.response?.status || error.code || 'unknown';
                console.warn(`[DUCKDUCKGO] search failed (${code}) for query: ${query.slice(0, 80)}`);
            }
            return [];
        }
    });
}

async function duckDuckGoWithBackoff(query: string, num: number): Promise<SearchOrganicResult[]> {
    for (let attempt = 0; attempt < DDG_DELAYS_MS.length; attempt++) {
        await sleep(DDG_DELAYS_MS[attempt] + Math.floor(Math.random() * 2000));
        const results = await duckDuckGoSearch(query, num);
        if (results.length > 0) return results;

        if (attempt < DDG_DELAYS_MS.length - 1) {
            console.warn(`[DUCKDUCKGO] attempt ${attempt + 1} failed; backing off before retry`);
        }
    }

    return [];
}

async function serperSearch(query: string, num: number): Promise<SearchOrganicResult[]> {
    if (!SERPER_API_KEY || serperDisabled) return [];
    serperCallCount++;

    return runSerializedSearchRequest(async () => {
        try {
            const response = await axios.post<{ organic?: Array<{ link?: string; snippet?: string }> }>(
                'https://google.serper.dev/search',
                {
                    q: query,
                    num,
                    gl: 'gb',
                },
                {
                    timeout: 10_000,
                    headers: {
                        'X-API-KEY': SERPER_API_KEY,
                        'Content-Type': 'application/json',
                        'User-Agent': USER_AGENT,
                    },
                }
            );

            const results = (response.data.organic || [])
                .map((item) => ({ link: item.link, snippet: item.snippet }))
                .filter((item) => item.link);

            if (results.length > 0) {
                serperSuccessCount++;
            }

            return results;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const code = error.response?.status || error.code || 'unknown';
                console.warn(`[SERPER] search failed (${code}) for query: ${query.slice(0, 80)}`);
                if (code === 401 || code === 403) {
                    serperDisabled = true;
                }
            }
            return [];
        }
    });
}

async function searxngSearch(query: string, num: number): Promise<SearchOrganicResult[]> {
    const base = SEARXNG_INSTANCES[searxngInstanceIndex % SEARXNG_INSTANCES.length];
    searxngInstanceIndex++;
    searxngCallCount++;

    const results = await runSerializedSearchRequest(async () => {
        try {
            const response = await axios.get<any>(`${base}/search`, {
                timeout: 10_000,
                params: {
                    q: query,
                    format: 'json',
                    categories: 'general',
                },
                headers: {
                    'User-Agent': USER_AGENT,
                    Accept: 'application/json',
                },
            });

            let items = response.data.results || response.data;

            if (items && typeof items === 'object' && !Array.isArray(items)) {
                items = items.results || items.hits || [];
            }

            if (!Array.isArray(items)) {
                return [];
            }

            return items
                .slice(0, num)
                .map((item) => ({
                    link: item.url || item.link || item.href || '',
                    snippet: item.content || item.snippet || item.summary || item.description || '',
                }))
                .filter((item) => item.link && typeof item.link === 'string' && item.link.startsWith('http'));
        } catch {
            return [];
        }
    });

    if (results.length > 0) {
        searxngSuccessCount++;
        return results;
    }

    return [];
}

function extractSerperSearchResults(data: any): SearchOrganicResult[] {
    const links: SearchOrganicResult[] = [];
    const seen = new Set<string>();

    const pushLink = (link: any, snippet = ''): void => {
        const normalized = String(link || '').trim();
        if (!/^https?:\/\//i.test(normalized)) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        links.push({ link: normalized, snippet: String(snippet || '').trim() });
    };

    for (const item of data?.organic || []) {
        pushLink(item?.link, item?.snippet);
    }

    pushLink(data?.answerBox?.link, data?.answerBox?.snippet);
    pushLink(data?.answerBox?.website, data?.answerBox?.snippet);
    pushLink(data?.knowledgeGraph?.website, data?.knowledgeGraph?.description);
    pushLink(data?.knowledgeGraph?.descriptionLink, data?.knowledgeGraph?.description);

    return links;
}

function buildSerperQueries(company: CompanyRow): { direct: string[]; generic: string[] } {
    const name = company.trading_name.trim();
    const escapedName = name.replace(/\"/g, '');
    const direct = [
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
    ].map((hint) => `"${escapedName}" ${hint}`);

    const generic = [
        `"${escapedName}" careers UK`,
        `"${escapedName}" jobs UK`,
        `"${escapedName}" careers`,
        `"${escapedName}" jobs`,
        `"${escapedName}" apply`,
        `"${escapedName}" hiring careers`,
        `"${escapedName}" work with us`,
    ];

    try {
        if (company.url) {
            const host = extractHost(company.url);
            if (host) {
                generic.unshift(`site:${host} careers`);
                generic.unshift(`"${escapedName}" site:${host}`);
            }
        }
    } catch {
        // Ignore malformed company URLs.
    }

    return {
        direct: Array.from(new Set(direct)).slice(0, 13),
        generic: Array.from(new Set(generic)).slice(0, 8),
    };
}

async function tavilySearch(query: string, num: number): Promise<SearchOrganicResult[]> {
    if (!TAVILY_API_KEY) return [];
    tavilyCallCount++;

    return runSerializedSearchRequest(async () => {
        try {
            const response = await axios.post<{
                results?: Array<{ url?: string; content?: string }>;
            }>(
                'https://api.tavily.com/search',
                {
                    api_key: TAVILY_API_KEY,
                    query,
                    search_depth: 'basic',
                    max_results: Math.min(10, num),
                    include_raw_content: false,
                    topic: 'general',
                },
                {
                    timeout: 10_000,
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'User-Agent': USER_AGENT,
                    },
                },
            );

            const results = (response.data.results || [])
                .map((item) => ({ link: item.url, snippet: item.content }))
                .filter((item) => item.link)
                .slice(0, num);

            if (results.length > 0) {
                tavilySuccessCount++;
            }

            return results;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const code = error.response?.status || error.code || 'unknown';
                console.warn(`[TAVILY] search failed (${code}) for query: ${query.slice(0, 80)}`);
            }
            return [];
        }
    });
}

async function searchForAts(queries: string | string[], num: number): Promise<SearchOrganicResult[]> {
    const queryList = Array.isArray(queries) ? queries : [queries];

    for (const query of queryList) {
        const serperResults = await serperSearch(query, num);
        if (serperResults.length > 0) return serperResults;
    }

    const firstQuery = queryList[0] || '';

    const searxngResults = await searxngSearch(firstQuery, num);
    if (searxngResults.length > 0) return searxngResults;

    const tavilyResults = await tavilySearch(firstQuery, num);
    if (tavilyResults.length > 0) return tavilyResults;

    return duckDuckGoWithBackoff(firstQuery, num);
}

function matchFromSearchResults(
    results: SearchOrganicResult[],
    providerFilter: string | null,
    sourcePrefix: string
): SearchMatch | null {
    for (const result of results) {
        const link = result.link || '';
        const snippet = result.snippet || '';

        if (link) {
            const urlMatch = detectAtsFromSources([link], providerFilter);
            if (urlMatch) {
                return {
                    provider: urlMatch.provider,
                    token: urlMatch.token,
                    source: sourcePrefix,
                    careersUrl: link,
                    notes: `${sourcePrefix}_link:${link}`,
                };
            }
        }

        if (snippet) {
            const snippetMatch = detectAtsFromSources([snippet], providerFilter);
            if (snippetMatch) {
                return {
                    provider: snippetMatch.provider,
                    token: snippetMatch.token,
                    source: `${sourcePrefix}_snippet`,
                    careersUrl: link || null,
                    notes: `${sourcePrefix}_snippet:${link || 'no_link'}`,
                };
            }
        }
    }

    return null;
}

async function crawlSearchResultsForAts(
    results: SearchOrganicResult[],
    company: CompanyRow,
    providerFilter: string | null,
    sourcePrefix: string
): Promise<SearchMatch | null> {
    for (const result of results) {
        const link = result.link || '';
        if (!link) continue;
        if (company.url && link === company.url) continue;

        try {
            const page = await fetchWithRedirects(link, 15_000, 3);
            const sources = collectSources(page.html, page.finalUrl).sources;
            const hit = detectAtsFromSources(sources, providerFilter);
            if (hit) {
                const token = normalizeToken(hit.token);
                
                // Require company-name similarity or company URL presence in source for search results
                const similarity = tokenSimilarityScore(token, company.trading_name);
                const linkHost = extractHost(link);
                const companyHost = company.url ? extractHost(company.url) : '';
                const isCompanyDomain = companyHost && linkHost === companyHost;
                
                if (similarity === 0 && !isCompanyDomain) {
                    // Skip weak evidence matches
                    continue;
                }
                
                return {
                    provider: hit.provider,
                    token: hit.token,
                    source: `${sourcePrefix}_crawl`,
                    careersUrl: link,
                    notes: `${sourcePrefix}_crawl:${link}`,
                };
            }
        } catch {
            // Continue scanning next result.
        }
    }

    return null;
}

async function findAtsViaSearch(company: CompanyRow, providerFilter: string | null): Promise<SearchMatch | null> {
    const queries = buildSerperQueries(company);

    const searchResults1 = await searchForAts(queries.direct, 5);
    const direct = matchFromSearchResults(searchResults1, providerFilter, 'search');
    if (direct) {
        const token = normalizeToken(direct.token);
        // For direct ATS site search, validate token makes sense for this company
        const similarity = tokenSimilarityScore(token, company.trading_name);
        if (similarity > 0) {
            return direct;
        }
    }

    const searchResults2 = await searchForAts(queries.generic, 5);
    const crawl = await crawlSearchResultsForAts(searchResults2, company, providerFilter, 'search');
    if (crawl) return crawl;

    return null;
}

function collectHeuristicTokens(company: CompanyRow): string[] {
    const candidates = new Set<string>();

    const add = (value: string | null | undefined): void => {
        if (!value) return;
        const cleaned = normalizeToken(value)
            .replace(/^www\./, '')
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');

        if (cleaned.length < 3) return;
        if (isInvalidToken(cleaned)) return;
        candidates.add(cleaned);
    };

    add(company.trading_name);
    add(company.trading_name?.replace(/\s+/g, ''));

    const urls = [company.url, company.careers_url || null].filter(Boolean) as string[];
    for (const rawUrl of urls) {
        try {
            const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
            const labels = host.split('.').filter(Boolean);
            if (labels.length > 0) {
                add(labels[0]);
            }

            if (labels.length > 1) {
                const secondLevel = labels[labels.length - 2];
                add(secondLevel);
            }
        } catch {
            // Ignore malformed URL.
        }
    }

    return [...candidates];
}

async function runHeuristicProbeFallback(
    company: CompanyRow,
    providerFilter: string | null,
    base: Omit<RunRow, 'changed'>
): Promise<Omit<RunRow, 'changed'> | null> {
    const tokens = collectHeuristicTokens(company).slice(0, 6);
    if (tokens.length === 0) return null;

    const providers = providerFilter
        ? HEURISTIC_PROVIDERS.filter((p) => p === providerFilter)
        : HEURISTIC_PROVIDERS;

    for (const provider of providers) {
        for (const token of tokens) {
            const probe = await probeToken(provider, token);
            if (probe.status === 'bad_token') {
                continue;
            }

            return applyProviderAndProbe(
                company,
                base.careersUrlFound,
                base.oldProvider,
                base.oldToken,
                provider,
                token,
                probe,
                'heuristic_probe',
                `heuristic_probe:${provider}:${token}`
            );
        }
    }

    return null;
}

function applyProviderAndProbe(
    company: CompanyRow,
    careersUrlFound: string | null,
    oldProvider: string | null,
    oldToken: string | null,
    provider: string,
    tokenRaw: string,
    probe: ProbeResult,
    source: string,
    notes: string
): Omit<RunRow, 'changed'> {
    const token = normalizeToken(tokenRaw);

    if (probe.status === 'ok') {
        return {
            company,
            careersUrlFound,
            oldProvider,
            oldToken,
            newProvider: provider,
            newToken: probe.tokenUsed,
            status: 'ok',
            probeStatusCode: probe.code,
            source,
            notes,
        };
    }

    if (!token || isInvalidToken(token) || probe.status === 'bad_token') {
        return {
            company,
            careersUrlFound,
            oldProvider,
            oldToken,
            newProvider: provider,
            newToken: token,
            status: 'bad_token',
            probeStatusCode: probe.code,
            source,
            notes: !token || isInvalidToken(token) ? `invalid_token:${token || 'empty'}` : notes,
        };
    }

    return {
        company,
        careersUrlFound,
        oldProvider,
        oldToken,
        newProvider: provider,
        newToken: probe.tokenUsed,
        status: probe.status,
        probeStatusCode: probe.code,
        source,
        notes,
    };
}

async function runSearchFallback(
    company: CompanyRow,
    providerFilter: string | null,
    base: Omit<RunRow, 'changed'>
): Promise<Omit<RunRow, 'changed'>> {
    const searchMatch = await findAtsViaSearch(company, providerFilter);
    if (searchMatch) {
        const provider = searchMatch.provider;
        const token = normalizeToken(searchMatch.token);
        
        // Final gate: require plausible token AND company relevance
        if (!isPlausibleToken(token)) {
            // Token failed plausibility check, skip to heuristic fallback
        } else {
            // Even plausible tokens from search must have company link
            const similarity = tokenSimilarityScore(token, company.trading_name);
            const linkHost = searchMatch.careersUrl ? extractHost(searchMatch.careersUrl) : '';
            const companyHost = company.url ? extractHost(company.url) : '';
            const isCompanyLink = companyHost && linkHost === companyHost;
            
            // Require EITHER strong similarity OR company domain link for search results
            if (similarity > 0 || isCompanyLink) {
                const probe = await probeToken(provider, token);

                return applyProviderAndProbe(
                    company,
                    searchMatch.careersUrl,
                    base.oldProvider,
                    base.oldToken,
                    provider,
                    token,
                    probe,
                    searchMatch.source,
                    searchMatch.notes
                );
            }
        }
    }

    const heuristicMatch = await runHeuristicProbeFallback(company, providerFilter, base);
    if (heuristicMatch) {
        return heuristicMatch;
    }

    return {
        ...base,
        status: 'needs_manual_review',
        source: 'search_exhausted',
        notes: `${base.notes};search_exhausted`,
    };
}

async function getSupabaseClient(): Promise<ReturnType<typeof createAdminClient>> {
    try {
        const { createClient: createServerClient } = await import('../utils/supabase/server');
        const serverClient = await createServerClient();
        return serverClient as ReturnType<typeof createAdminClient>;
    } catch {
        return createAdminClient();
    }
}

async function hasCareersColumn(supabase: ReturnType<typeof createAdminClient>): Promise<boolean> {
    const { error } = await supabase
        .from('companies')
        .select('careers_url')
        .limit(1);

    return !error;
}

async function loadCompanies(
    supabase: ReturnType<typeof createAdminClient>,
    args: CliArgs,
    careersColumnExists: boolean
): Promise<CompanyRow[]> {
    const rows: CompanyRow[] = [];
    let from = 0;
    const pageSize = 500;
    const selected = careersColumnExists
        ? 'id, trading_name, url, careers_url, ats_provider, ats_board_token, ats_status'
        : 'id, trading_name, url, ats_provider, ats_board_token, ats_status';

    while (true) {
        let query = supabase
            .from('companies')
            .select(selected)
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);

        if (args.companyId !== null) {
            query = query.eq('id', args.companyId);
        } else if (args.recheck) {
            query = query.or('ats_provider.is.null,ats_board_token.is.null,ats_status.in.(bad_token,dead,needs_manual_review,ok)');
        } else {
            query = query.or('ats_provider.is.null,ats_board_token.is.null,ats_status.in.(bad_token,dead,needs_manual_review)');
        }

        if (args.provider) {
            query = query.eq('ats_provider', args.provider);
        }

        const { data, error } = await query;
        if (error) {
            throw new Error(`Failed loading companies: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        rows.push(...(data as unknown as CompanyRow[]));

        if (data.length < pageSize || args.companyId !== null) break;
        from += pageSize;
    }

    if (args.limit !== null) {
        return rows.slice(0, args.limit);
    }

    return rows;
}

async function detectCompany(
    company: CompanyRow,
    providerFilter: string | null
): Promise<Omit<RunRow, 'changed'>> {
    const oldProvider = company.ats_provider;
    const oldToken = company.ats_board_token;

    if (!company.url) {
        return {
            company,
            careersUrlFound: null,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status: 'dead',
            probeStatusCode: '',
            source: 'crawl',
            notes: 'missing_homepage_url',
        };
    }

    let careersUrl: string | null = null;
    let careersNotes = '';

    try {
        const careers = await findCareersPage(company.url);
        careersUrl = careers.careersUrl;
        careersNotes = careers.notes;
    } catch (error) {
        return {
            company,
            careersUrlFound: null,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status: classifyFetchError(error),
            probeStatusCode: '',
            source: 'crawl',
            notes: 'homepage_fetch_failed',
        };
    }

    if (!careersUrl) {
        const noPageResult: Omit<RunRow, 'changed'> = {
            company,
            careersUrlFound: null,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status: 'no_careers_page_found',
            probeStatusCode: '',
            source: 'crawl',
            notes: careersNotes || 'no_careers_page_found',
        };
        return runSearchFallback(company, providerFilter, noPageResult);
    }

    let careersPage: { finalUrl: string; html: string; status: number };
    try {
        console.log(`[FETCH] Fetching careers page: ${careersUrl}`);
        careersPage = await fetchWithRedirects(careersUrl, 15_000, 3);
    } catch {
        return {
            company,
            careersUrlFound: careersUrl,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status: 'dead',
            probeStatusCode: '',
            source: 'crawl',
            notes: 'careers_fetch_failed',
        };
    }

    const careersCollection = collectSources(careersPage.html, careersPage.finalUrl);
    const hitOnCareers = detectAtsFromSources(careersCollection.sources, providerFilter);
    let hit = hitOnCareers;

    if (!hit) {
        const sampleLink = pickSampleJobLink(careersCollection.links);
        if (sampleLink) {
            try {
                const samplePage = await fetchWithRedirects(sampleLink, 15_000, 3);
                const sampleCollection = collectSources(samplePage.html, samplePage.finalUrl);
                hit = detectAtsFromSources(sampleCollection.sources, providerFilter);
            } catch {
                // Keep going without sample page hit.
            }
        }
    }

    if (!hit) {
        const manualResult: Omit<RunRow, 'changed'> = {
            company,
            careersUrlFound: careersPage.finalUrl,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status: 'needs_manual_review',
            probeStatusCode: '',
            source: 'crawl',
            notes: `careers_no_ats_match:${careersPage.finalUrl}`,
        };
        return runSearchFallback(company, providerFilter, manualResult);
    }

    const provider = hit.provider;
    const token = normalizeToken(hit.token);

    // If crawl only found a generic token (for example "www") or non-plausible token, try search/heuristics instead.
    if (!token || isInvalidToken(token) || !isPlausibleToken(token)) {
        const weakHitResult: Omit<RunRow, 'changed'> = {
            company,
            careersUrlFound: careersPage.finalUrl,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status: 'needs_manual_review',
            probeStatusCode: '',
            source: 'crawl',
            notes: `crawl_invalid_token:${provider}:${token || 'empty'}`,
        };
        return runSearchFallback(company, providerFilter, weakHitResult);
    }

    // Require company-name similarity or company URL evidence for acceptance
    const similarity = tokenSimilarityScore(token, company.trading_name);
    const hasCompanyUrlEvidence = company.url && hit.source.includes(new URL(company.url).hostname);
    
    if (similarity === 0 && !hasCompanyUrlEvidence) {
        const weakEvidenceResult: Omit<RunRow, 'changed'> = {
            company,
            careersUrlFound: careersPage.finalUrl,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status: 'needs_manual_review',
            probeStatusCode: '',
            source: 'crawl',
            notes: `crawl_weak_evidence:${provider}:${token}`,
        };
        return runSearchFallback(company, providerFilter, weakEvidenceResult);
    }

    const probe = await probeToken(provider, token, company.trading_name);

    if (probe.status === 'bad_token') {
        const badProbeResult: Omit<RunRow, 'changed'> = {
            company,
            careersUrlFound: careersPage.finalUrl,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status: 'needs_manual_review',
            probeStatusCode: probe.code,
            source: 'crawl',
            notes: `crawl_probe_bad_token:${provider}:${token}`,
        };
        return runSearchFallback(company, providerFilter, badProbeResult);
    }

    return applyProviderAndProbe(
        company,
        careersPage.finalUrl,
        oldProvider,
        oldToken,
        provider,
        token,
        probe,
        'crawl',
        `source:${hit.source}`
    );
}

function computeChanged(row: Omit<RunRow, 'changed'>, careersColumnExists: boolean): RunRow {
    const careersChanged = careersColumnExists && row.careersUrlFound !== (row.company.careers_url || null);
    const changed =
        row.newProvider !== row.oldProvider ||
        row.newToken !== row.oldToken ||
        row.status !== row.company.ats_status ||
        careersChanged;

    return { ...row, changed };
}

async function persistRow(
    supabase: ReturnType<typeof createAdminClient>,
    row: RunRow,
    careersColumnExists: boolean
): Promise<void> {
    if (!row.changed) return;

    const payload: Record<string, unknown> = {
        ats_provider: row.newProvider,
        ats_board_token: row.newToken,
        ats_status: row.status,
        ats_last_validated: new Date().toISOString(),
    };

    if (careersColumnExists) {
        payload.careers_url = row.careersUrlFound;
    }

    const { error } = await supabase
        .from('companies')
        .update(payload)
        .eq('id', row.company.id);

    if (error) {
        throw new Error(`Failed to update company ${row.company.id}: ${error.message}`);
    }
}

function statusLabel(row: RunRow): string {
    if (row.status === 'ok' && row.source.startsWith('duckduckgo')) return '[OK-DDG]';
    if (row.status === 'ok') return '[OK-CRAWL]';
    if (row.status === 'no_careers_page_found') return '[NO_PAGE]';
    if (row.status === 'bad_token') return '[BAD_TOK]';
    if (row.newProvider && row.newToken) return '[FOUND]';
    return '[MANUAL]';
}

function logRow(row: RunRow): void {
    const provider = row.newProvider ?? '—';
    const token = row.newToken ?? '—';
    const code = row.probeStatusCode === '' ? '—' : String(row.probeStatusCode);
    const careers = row.careersUrlFound ? new URL(row.careersUrlFound).pathname || '/' : '—';
    const source = row.source || 'crawl';

    console.log(
        `${statusLabel(row)} ${row.company.trading_name.padEnd(24)} ${provider.padEnd(12)} / ${token.padEnd(20)} (careers: ${careers}, probed: ${code}, source: ${source})`
    );
}

function writeCsv(rows: RunRow[]): void {
    const header = [
        'company_id', 'trading_name', 'url', 'careers_url_found',
        'old_provider', 'old_token', 'new_provider', 'new_token',
        'status', 'probe_status_code', 'source', 'notes',
    ].join(',');

    const lines = rows.map((row) => [
        csvEscape(row.company.id),
        csvEscape(row.company.trading_name),
        csvEscape(row.company.url),
        csvEscape(row.careersUrlFound),
        csvEscape(row.oldProvider),
        csvEscape(row.oldToken),
        csvEscape(row.newProvider),
        csvEscape(row.newToken),
        csvEscape(row.status),
        csvEscape(row.probeStatusCode),
        csvEscape(row.source),
        csvEscape(row.notes),
    ].join(','));

    fs.writeFileSync(path.resolve(process.cwd(), 'ats_detection_results.csv'), `${header}\n${lines.join('\n')}\n`, 'utf-8');
}

function printSummary(rows: RunRow[]): void {
    const newlyConfigured = rows.filter((r) => (!r.oldProvider || !r.oldToken) && !!r.newProvider && !!r.newToken).length;
    const tokenCorrected = rows.filter((r) => r.oldProvider === r.newProvider && !!r.oldToken && r.oldToken !== r.newToken).length;
    const verifiedOk = rows.filter((r) => r.status === 'ok').length;
    const unchecked = rows.filter((r) => r.status === 'unchecked').length;
    const noCareers = rows.filter((r) => r.status === 'no_careers_page_found').length;
    const authProtected = rows.filter((r) => r.status === 'auth_or_bot_protected').length;
    const dead = rows.filter((r) => r.status === 'dead').length;

    console.log('');
    console.log(`Newly configured:  ${newlyConfigured}`);
    console.log(`Token corrected:   ${tokenCorrected}`);
    console.log(`Verified ok:       ${verifiedOk}`);
    console.log(`Unchecked:         ${unchecked}`);
    console.log(`No careers page:   ${noCareers}`);
    console.log(`Auth protected:    ${authProtected}`);
    console.log(`Dead:              ${dead}`);
    console.log(`Search calls:      ${serperCallCount + searxngCallCount + tavilyCallCount + duckDuckGoCallCount}`);
    console.log(`Serper calls/hits: ${serperCallCount}/${serperSuccessCount}`);
    console.log(`SearXNG calls/hits:${searxngCallCount}/${searxngSuccessCount}`);
    console.log(`Tavily calls/hits: ${tavilyCallCount}/${tavilySuccessCount}`);
    console.log(`DuckDuckGo calls:  ${duckDuckGoCallCount}`);
    console.log(`DuckDuckGo hits:   ${duckDuckGoSuccessCount}`);
}

export async function runDetectAtsFromCareersPage(): Promise<void> {
    const args = parseCliArgs();
    const supabase = await getSupabaseClient();
    const careersColumnExists = await hasCareersColumn(supabase);

    const companies = await loadCompanies(supabase, args, careersColumnExists);
    console.log(`Loaded ${companies.length} companies for careers-page ATS detection.`);

    const rows: RunRow[] = [];

    for (let i = 0; i < companies.length; i += DETECT_BATCH_SIZE) {
        const batch = companies.slice(i, i + DETECT_BATCH_SIZE);

        const batchRows = await Promise.all(
            batch.map(async (company) => {
                const detected = await detectCompany(company, args.provider);
                const row = computeChanged(detected, careersColumnExists);
                await persistRow(supabase, row, careersColumnExists);
                return row;
            })
        );

        for (const row of batchRows) {
            rows.push(row);
            logRow(row);
        }

        if (i + DETECT_BATCH_SIZE < companies.length) {
            await sleep(500);
        }
    }

    writeCsv(rows);
    printSummary(rows);
}

const isDirectExecution = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

if (isDirectExecution) {
    runDetectAtsFromCareersPage().catch((error) => {
        console.error('detectAtsFromCareersPage failed:', error);
        process.exit(1);
    });
}
