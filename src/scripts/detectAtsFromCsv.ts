/**
 * detectAtsFromCsv.ts
 *
 * CSV-in/CSV-out ATS discovery — no Supabase involved at all. Reads
 * data/ireland/raw/ireland_bulk_seed.csv (Company Name, URL columns only),
 * crawls each company's homepage (and a likely careers-page link on it) looking
 * for a recognizable ATS URL pattern (same patterns/provider list used by
 * npm run detect:ats), and writes results to a new CSV.
 *
 * Does NOT touch Supabase / the companies table. Pure local file in, local file out.
 *
 * Run: npx tsx src/scripts/detectAtsFromCsv.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

const IN_CSV = path.resolve(process.cwd(), 'data/ireland/raw/ireland_bulk_seed.csv');
const OUT_CSV = path.resolve(process.cwd(), 'data/ireland/raw/ireland_bulk_seed_detected.csv');

const USER_AGENT = 'Mozilla/5.0 (compatible; JobBot/1.0)';
const CONCURRENCY = 6;
const TIMEOUT_MS = 12000;

const ATS_PATTERNS: Array<{ provider: string; regex: RegExp }> = [
    { provider: 'greenhouse', regex: /(?:boards|job-boards)\.(?:eu\.)?greenhouse\.io\/([a-zA-Z0-9_-]+)/i },
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
    { provider: 'workday', regex: /([a-zA-Z0-9_-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-zA-Z0-9_-]+\/)?([a-zA-Z0-9_-]+)/i },
    { provider: 'icims', regex: /([a-zA-Z0-9_-]+)\.icims\.com/i },
    { provider: 'successfactors', regex: /([a-zA-Z0-9_-]+)\.successfactors\.com/i },
    { provider: 'avature', regex: /([a-zA-Z0-9_-]+)\.avature\.net/i },
    { provider: 'personio', regex: /([a-zA-Z0-9_-]+)\.(?:jobs\.personio\.(?:com|de))/i },
];

const INVALID_TOKENS = new Set([
    'www', 'jobs', 'careers', 'apply', 'hire', 'work', 'en-us', 'en', 'job', 'career',
    'about', 'company', 'portal', 'external', 'internal', 'search', 'listing',
    'us', 'uk', 'eu', 'v1', 'v2', 'api', 'home', 'index',
]);

const CAREERS_LINK_PATTERNS: RegExp[] = [
    /careers/i, /jobs/i, /work.with.us/i, /join.us/i, /we.are.hiring/i,
    /join.our.team/i, /open.roles/i, /vacancies/i, /opportunities/i,
];

interface SeedRow { name: string; url: string; }
interface DetectedRow {
    name: string; url: string; provider: string; token: string; careersUrl: string; status: string;
}

function splitCsvLine(line: string): string[] {
    const out: string[] = []; let cur = ''; let q = false;
    for (const ch of line) {
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
        else cur += ch;
    }
    out.push(cur.trim());
    return out;
}

function loadSeed(): SeedRow[] {
    const lines = fs.readFileSync(IN_CSV, 'utf-8').split(/\r?\n/).filter(l => l.trim());
    const headers = splitCsvLine(lines[0]);
    const nameIdx = headers.indexOf('Company Name');
    const urlIdx = headers.indexOf('URL');
    return lines.slice(1).map(line => {
        const cols = splitCsvLine(line);
        return { name: cols[nameIdx], url: cols[urlIdx] };
    }).filter(r => r.name && r.url);
}

async function fetchText(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
            signal: controller.signal,
            redirect: 'follow',
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.text();
    } catch {
        clearTimeout(timer);
        return null;
    }
}

function matchAts(html: string, baseUrl: string): { provider: string; token: string; matchedUrl: string } | null {
    for (const { provider, regex } of ATS_PATTERNS) {
        const m = html.match(regex);
        if (!m) continue;
        if (provider === 'workday') {
            const tenant = m[1];
            const wd = m[2];
            const board = m[3];
            if (INVALID_TOKENS.has(tenant.toLowerCase()) || INVALID_TOKENS.has(board.toLowerCase())) continue;
            return { provider, token: `${tenant}/${board}`, matchedUrl: `${tenant}.${wd}.myworkdayjobs.com/${board}` };
        }
        const token = m[1];
        if (!token || INVALID_TOKENS.has(token.toLowerCase())) continue;
        return { provider, token, matchedUrl: m[0] };
    }
    return null;
}

function findCareersLink($: cheerio.CheerioAPI, baseUrl: string): string | null {
    let best: { url: string; score: number } | null = null;
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().toLowerCase();
        if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
        const combined = `${href} ${text}`;
        const score = CAREERS_LINK_PATTERNS.reduce((s, re) => s + (re.test(combined) ? 1 : 0), 0);
        if (score > 0) {
            let abs: string;
            try { abs = new URL(href, baseUrl).toString(); } catch { return; }
            if (!best || score > best.score) best = { url: abs, score };
        }
    });
    return best ? (best as { url: string; score: number }).url : null;
}

async function detectOne(row: SeedRow): Promise<DetectedRow> {
    const base: DetectedRow = { name: row.name, url: row.url, provider: 'unknown', token: '', careersUrl: '', status: 'not_found' };

    const homeHtml = await fetchText(row.url);
    if (!homeHtml) return { ...base, status: 'fetch_failed' };

    // 1. Check homepage HTML directly for an ATS link (common for small/scaleup sites)
    let hit = matchAts(homeHtml, row.url);
    if (hit) return { ...base, provider: hit.provider, token: hit.token, careersUrl: row.url, status: 'found_on_homepage' };

    // 2. Find a careers-page link and check that page too
    const $ = cheerio.load(homeHtml);
    const careersUrl = findCareersLink($, row.url);
    if (!careersUrl) return { ...base, status: 'no_careers_link_found' };

    const careersHtml = await fetchText(careersUrl);
    if (!careersHtml) return { ...base, careersUrl, status: 'careers_page_fetch_failed' };

    hit = matchAts(careersHtml, careersUrl);
    if (hit) return { ...base, provider: hit.provider, token: hit.token, careersUrl, status: 'found_on_careers_page' };

    return { ...base, careersUrl, status: 'no_ats_pattern_matched' };
}

async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    async function worker() {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            results[i] = await fn(items[i]);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
}

function csvEscape(v: string): string {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
}

async function main() {
    const seed = loadSeed();
    console.log(`Loaded ${seed.length} companies from ${IN_CSV}\n`);

    let done = 0;
    const results = await runPool(seed, CONCURRENCY, async (row) => {
        const r = await detectOne(row);
        done++;
        const tag = r.provider !== 'unknown' ? `${r.provider}/${r.token}` : r.status;
        console.log(`[${String(done).padStart(3)}/${seed.length}] ${row.name.padEnd(30)} -> ${tag}`);
        return r;
    });

    const found = results.filter(r => r.provider !== 'unknown');
    console.log(`\nFound ATS for ${found.length}/${results.length} companies.`);

    const header = 'Company Name,URL,ATS Provider,ATS Board Token,Careers URL,Status';
    const lines = results.map(r => [
        r.name, r.url, r.provider, r.token, r.careersUrl, r.provider !== 'unknown' ? 'Good' : 'needs_manual_review',
    ].map(v => csvEscape(String(v))).join(','));
    fs.writeFileSync(OUT_CSV, [header, ...lines].join('\n'));
    console.log(`\nWrote ${OUT_CSV}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
