/**
 * seedIrelandFromPermits.ts
 *
 * 1. Reads data/ireland/raw/ireland-employment-permits-merged.json
 * 2. Extracts the top N employers (by totalPermits).
 * 3. Uses Serper API to find their official website.
 * 4. Crawls the homepage and careers page to detect ATS providers/tokens.
 * 5. Outputs to data/ireland/raw/ireland_top_sponsors_detected.csv
 *
 * Run: npx tsx src/scripts/seedIrelandFromPermits.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const JSON_PATH = path.resolve(process.cwd(), 'data/ireland/raw/ireland-employment-permits-merged.json');
const OUT_CSV = path.resolve(process.cwd(), 'data/ireland/raw/ireland_top_sponsors_detected.csv');

const SERPER_API_KEY = process.env.SERPER_API_KEY || '';
if (!SERPER_API_KEY) {
    console.error('SERPER_API_KEY missing in environment variables.');
    process.exit(1);
}

const USER_AGENT = 'Mozilla/5.0 (compatible; JobBot/1.0)';
const TIMEOUT_MS = 10000;
const TOP_N = 10; // Define how many top companies to process

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

async function tavilySearchLinks(query: string, num = 3): Promise<string[]> {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    if (!TAVILY_API_KEY) return [];
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ api_key: TAVILY_API_KEY, query: query, max_results: num }),
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
            const errText = await res.text();
            console.error(`Tavily API error: ${res.status} ${res.statusText} - ${errText}`);
            return [];
        }
        const data = await res.json();
        return (data.results || []).map((r: any) => r.url).filter(Boolean);
    } catch (e: any) {
        console.error(`Tavily fetch error: ${e.message}`);
        return [];
    }
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
    return best ? best.url : null;
}

function csvEscape(v: string): string {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
}

async function main() {
    if (!fs.existsSync(JSON_PATH)) {
        console.error(`Missing JSON at ${JSON_PATH}`);
        process.exit(1);
    }
    
    const rawData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    let employers = rawData.employers || [];
    
    // Sort by total permits descending and slice
    employers.sort((a: any, b: any) => b.totalPermits - a.totalPermits);
    employers = employers.slice(0, TOP_N);
    
    console.log(`Processing Top ${employers.length} employers...`);
    
    const results = [];
    let startId = 900500; // Custom ID range for Ireland bulk

    // We process sequentially or with small concurrency to avoid Serper rate limits
    for (let i = 0; i < employers.length; i++) {
        const emp = employers[i];
        const name = emp.employerName;
        console.log(`\n[${i + 1}/${employers.length}] Searching: ${name}`);

        // 1. Search for website
        const links = await tavilySearchLinks(`${name} Ireland careers OR jobs`);
        const url = links[0]; // Take best guess
        
        if (!url) {
            console.log(`  -> No URL found via Serper.`);
            results.push({ id: startId++, name, url: '', provider: 'unknown', token: '', careersUrl: '', status: 'not_found' });
            continue;
        }

        console.log(`  -> Found URL: ${url}`);
        
        // 2. Fetch HTML
        const html = await fetchText(url);
        if (!html) {
            console.log(`  -> Fetch failed.`);
            results.push({ id: startId++, name, url, provider: 'unknown', token: '', careersUrl: '', status: 'fetch_failed' });
            continue;
        }

        // 3. Match ATS on page
        let hit = matchAts(html, url);
        if (hit) {
            console.log(`  -> ✅ ATS Found on landing page: ${hit.provider}/${hit.token}`);
            results.push({ id: startId++, name, url, provider: hit.provider, token: hit.token, careersUrl: url, status: 'found_on_homepage' });
            continue;
        }

        // 4. Try finding a careers link and checking there
        const $ = cheerio.load(html);
        const careersUrl = findCareersLink($, url);
        if (!careersUrl) {
            console.log(`  -> No ATS and no careers link found.`);
            results.push({ id: startId++, name, url, provider: 'unknown', token: '', careersUrl: '', status: 'no_careers_link_found' });
            continue;
        }

        console.log(`  -> Crawling careers page: ${careersUrl}`);
        const careersHtml = await fetchText(careersUrl);
        if (careersHtml) {
            hit = matchAts(careersHtml, careersUrl);
            if (hit) {
                console.log(`  -> ✅ ATS Found on careers page: ${hit.provider}/${hit.token}`);
                results.push({ id: startId++, name, url, provider: hit.provider, token: hit.token, careersUrl, status: 'found_on_careers_page' });
                continue;
            }
        }
        
        console.log(`  -> No ATS pattern matched.`);
        results.push({ id: startId++, name, url, provider: 'unknown', token: '', careersUrl, status: 'no_ats_pattern_matched' });
    }

    const header = 'Company ID,Company Name,ATS Provider,ATS Board Token,URL,Verification,Status';
    const lines = results.map(r => [
        r.id, r.name, r.provider, r.token, r.url, 'script-discovered', r.provider !== 'unknown' ? 'Good' : 'needs_manual_review',
    ].map(v => csvEscape(String(v))).join(','));
    
    fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
    fs.writeFileSync(OUT_CSV, [header, ...lines].join('\n'));
    console.log(`\n🎉 Done! Wrote results to ${OUT_CSV}`);
    
    const found = results.filter(r => r.provider !== 'unknown');
    console.log(`Successfully discovered ATS for ${found.length} out of ${results.length} companies.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
