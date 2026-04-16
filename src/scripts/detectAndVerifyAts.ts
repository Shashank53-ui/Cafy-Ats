import { createAdminClient } from '../utils/supabase/admin';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type AtsStatus =
    | 'ok'
    | 'bad_token'
    | 'auth_or_bot_protected'
    | 'dead'
    | 'unchecked'
    | 'needs_manual_review';

interface CompanyRow {
    id: number;
    trading_name: string;
    url: string | null;
    ats_provider: string | null;
    ats_board_token: string | null;
    ats_status: string | null;
}

interface AtsFingerprint {
    provider: string;
    patterns: RegExp[];
    probe: ((token: string) => string) | null;
    probeMethod?: 'GET';
}

interface MatchCandidate {
    provider: string;
    token: string;
    source: string;
}

interface ProbeResult {
    status: AtsStatus;
    httpCode: number | '';
    jobsFound: number;
}

interface DetectionResult {
    company: CompanyRow;
    oldProvider: string | null;
    oldToken: string | null;
    newProvider: string | null;
    newToken: string | null;
    status: AtsStatus;
    probeHttpCode: number | '';
    jobsFound: number;
    detectedAt: string;
    changed: boolean;
    logLabel: string;
}

interface CliArgs {
    all: boolean;
    provider: string | null;
    limit: number | null;
}

const ATS_FINGERPRINTS: AtsFingerprint[] = [
    {
        provider: 'greenhouse',
        patterns: [
            /boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/,
            /boards-api\.greenhouse\.io\/v1\/boards\/([a-zA-Z0-9_-]+)/,
        ],
        probe: (token) => `https://boards-api.greenhouse.io/v1/boards/${token}/departments`,
        probeMethod: 'GET',
    },
    {
        provider: 'lever',
        patterns: [
            /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/,
        ],
        probe: (token) => `https://api.lever.co/v0/postings/${token}?limit=1&mode=json`,
        probeMethod: 'GET',
    },
    {
        provider: 'ashby',
        patterns: [
            /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/,
            /ashbyhq\.com\/([a-zA-Z0-9_-]+)/,
        ],
        probe: (token) => `https://api.ashbyhq.com/posting-api/job-board/${token}`,
        probeMethod: 'GET',
    },
    {
        provider: 'workable',
        patterns: [
            /apply\.workable\.com\/([a-zA-Z0-9_-]+)/,
            /([a-zA-Z0-9_-]+)\.workable\.com/,
        ],
        probe: (token) => `https://apply.workable.com/api/v1/widget/jobs/?company=${token}&limit=1`,
        probeMethod: 'GET',
    },
    {
        provider: 'teamtailor',
        patterns: [
            /([a-zA-Z0-9_-]+)\.teamtailor\.com/,
        ],
        probe: (token) => `https://${token}.teamtailor.com/jobs.json?page[size]=1`,
        probeMethod: 'GET',
    },
    {
        provider: 'bamboohr',
        patterns: [
            /([a-zA-Z0-9_-]+)\.bamboohr\.com/,
        ],
        probe: (token) => `https://${token}.bamboohr.com/careers/list`,
        probeMethod: 'GET',
    },
    {
        provider: 'smartrecruiters',
        patterns: [
            /jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/,
        ],
        probe: (token) => `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=1`,
        probeMethod: 'GET',
    },
    {
        provider: 'workday',
        patterns: [
            /([a-zA-Z0-9_-]+)\.wd\d+\.myworkdayjobs\.com/,
            /myworkdayjobs\.com\/([a-zA-Z0-9_-]+)/,
        ],
        probe: null,
    },
    {
        provider: 'icims',
        patterns: [
            /([a-zA-Z0-9_-]+)\.icims\.com/,
            /careers\.icims\.com\/jobs\/([a-zA-Z0-9_-]+)/,
        ],
        probe: null,
    },
    {
        provider: 'lever',
        patterns: [
            /jobs\.eu\.lever\.co\/([a-zA-Z0-9_-]+)/,
        ],
        probe: (token) => `https://api.lever.co/v0/postings/${token}?limit=1&mode=json`,
        probeMethod: 'GET',
    },
    {
        provider: 'recruitee',
        patterns: [
            /([a-zA-Z0-9_-]+)\.recruitee\.com/,
        ],
        probe: (token) => `https://${token}.recruitee.com/api/offers`,
        probeMethod: 'GET',
    },
    {
        provider: 'pinpoint',
        patterns: [
            /([a-zA-Z0-9_-]+)\.pinpointhq\.com/,
        ],
        probe: (token) => `https://${token}.pinpointhq.com/postings.json`,
        probeMethod: 'GET',
    },
    {
        provider: 'breezy',
        patterns: [
            /([a-zA-Z0-9_-]+)\.breezy\.hr/,
        ],
        probe: (token) => `https://${token}.breezy.hr/json`,
        probeMethod: 'GET',
    },
    {
        provider: 'jobvite',
        patterns: [
            /jobs\.jobvite\.com\/([a-zA-Z0-9_-]+)/,
        ],
        probe: (token) => `https://jobs.jobvite.com/api/company/${token}/jobs`,
        probeMethod: 'GET',
    },
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
];

const REJECTED_TOKENS = new Set([
    'www',
    'jobs',
    'careers',
    'apply',
    'hire',
    'work',
    'en-us',
    'en',
    'job',
    'career',
    'about',
    'company',
]);

class PerDomainRateLimiter {
    private readonly minIntervalMs: number;
    private readonly chains = new Map<string, Promise<void>>();
    private readonly lastRequestAt = new Map<string, number>();

    constructor(minIntervalMs: number) {
        this.minIntervalMs = minIntervalMs;
    }

    async schedule<T>(domain: string, work: () => Promise<T>): Promise<T> {
        const key = domain.toLowerCase();
        const previous = this.chains.get(key) ?? Promise.resolve();

        let resolveCurrent!: () => void;
        const current = new Promise<void>((resolve) => {
            resolveCurrent = resolve;
        });
        this.chains.set(key, current);

        await previous;

        const last = this.lastRequestAt.get(key) ?? 0;
        const waitMs = Math.max(0, this.minIntervalMs - (Date.now() - last));
        if (waitMs > 0) {
            await sleep(waitMs);
        }

        this.lastRequestAt.set(key, Date.now());
        try {
            return await work();
        } finally {
            resolveCurrent();
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvEscape(value: string | number | null | undefined): string {
    const text = value === null || value === undefined ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function parseCliArgs(): CliArgs {
    const args = process.argv.slice(2);
    const parsed: CliArgs = { all: false, provider: null, limit: null };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--all') {
            parsed.all = true;
            continue;
        }

        if (arg === '--provider') {
            const value = args[i + 1];
            if (!value || value.startsWith('--')) {
                throw new Error('Missing value for --provider');
            }
            parsed.provider = value.trim().toLowerCase();
            i++;
            continue;
        }

        if (arg === '--limit') {
            const value = args[i + 1];
            if (!value || value.startsWith('--')) {
                throw new Error('Missing value for --limit');
            }
            const n = Number(value);
            if (!Number.isFinite(n) || n <= 0) {
                throw new Error(`Invalid --limit value: ${value}`);
            }
            parsed.limit = Math.floor(n);
            i++;
            continue;
        }

        throw new Error(`Unknown arg: ${arg}`);
    }

    return parsed;
}

function normalizeToken(raw: string): string {
    return raw.trim().toLowerCase().replace(/\/+$/, '');
}

function looksRejectedToken(token: string): boolean {
    return REJECTED_TOKENS.has(token);
}

function extractAllMatches(text: string, pattern: RegExp): string[] {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    const matches: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
            matches.push(match[1]);
        }
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
    }

    return matches;
}

function getFingerprintByProvider(provider: string): AtsFingerprint | undefined {
    return ATS_FINGERPRINTS.find((f) => f.provider === provider);
}

function getPriority(provider: string): number {
    const idx = PROVIDER_PRIORITY.indexOf(provider);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function dedupeMatches(matches: MatchCandidate[]): MatchCandidate[] {
    const seen = new Set<string>();
    const out: MatchCandidate[] = [];
    for (const m of matches) {
        const key = `${m.provider}|${m.token}|${m.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
    }
    return out;
}

async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number,
    limiter: PerDomainRateLimiter
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const hostname = new URL(url).hostname;
        return await limiter.schedule(hostname, async () => {
            return await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; ATS-Detector/1.0)',
                    ...(options.headers || {}),
                },
            });
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchHomepageHtml(
    inputUrl: string,
    limiter: PerDomainRateLimiter
): Promise<{ html: string; finalUrl: string }> {
    let currentUrl = inputUrl;

    for (let i = 0; i <= 3; i++) {
        const response = await fetchWithTimeout(
            currentUrl,
            {
                method: 'GET',
                redirect: 'manual',
                headers: { Accept: 'text/html,application/xhtml+xml' },
            },
            10_000,
            limiter
        );

        const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
        if (isRedirect) {
            const location = response.headers.get('location');
            if (!location) {
                throw new Error(`Redirect missing location header (${response.status})`);
            }
            if (i === 3) {
                throw new Error('Too many redirects');
            }
            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }

        if (!response.ok) {
            throw new Error(`Homepage HTTP ${response.status}`);
        }

        const html = await response.text();
        return { html, finalUrl: currentUrl };
    }

    throw new Error('Unable to fetch homepage');
}

function collectMatchCandidates(html: string, finalUrl: string): MatchCandidate[] {
    const $ = cheerio.load(html);

    const sources: string[] = [html, finalUrl];
    $('a[href], iframe[src], script[src]').each((_, el) => {
        const href = $(el).attr('href');
        const src = $(el).attr('src');
        if (href) sources.push(href);
        if (src) sources.push(src);
    });

    const matches: MatchCandidate[] = [];
    for (const source of sources) {
        for (const fingerprint of ATS_FINGERPRINTS) {
            for (const pattern of fingerprint.patterns) {
                const tokens = extractAllMatches(source, pattern);
                for (const token of tokens) {
                    matches.push({
                        provider: fingerprint.provider,
                        token,
                        source,
                    });
                }
            }
        }
    }

    return dedupeMatches(matches);
}

function chooseBestMatch(matches: MatchCandidate[]): MatchCandidate | null {
    if (matches.length === 0) return null;

    const sorted = [...matches].sort((a, b) => {
        const p = getPriority(a.provider) - getPriority(b.provider);
        if (p !== 0) return p;
        return a.provider.localeCompare(b.provider);
    });

    return sorted[0];
}

function estimateJobsFound(provider: string, bodyText: string): number {
    try {
        const parsed = JSON.parse(bodyText) as Record<string, unknown>;

        if (provider === 'greenhouse' && Array.isArray(parsed.departments)) return parsed.departments.length;
        if (provider === 'lever' && Array.isArray(parsed)) return parsed.length;
        if (provider === 'ashby' && Array.isArray(parsed.jobs)) return parsed.jobs.length;
        if (provider === 'workable' && Array.isArray(parsed.results)) return parsed.results.length;
        if (provider === 'teamtailor' && Array.isArray(parsed.data)) return parsed.data.length;
        if (provider === 'smartrecruiters' && Array.isArray(parsed.content)) return parsed.content.length;
        if (provider === 'recruitee' && Array.isArray(parsed.offers)) return parsed.offers.length;
        if (provider === 'pinpoint' && Array.isArray(parsed.posts)) return parsed.posts.length;
        if (provider === 'breezy' && Array.isArray(parsed.positions)) return parsed.positions.length;
        if (provider === 'jobvite' && Array.isArray(parsed.jobs)) return parsed.jobs.length;
    } catch {
        // Non-JSON bodies still count as valid if body length threshold is met.
    }

    return bodyText.length > 50 ? 1 : 0;
}

async function probeToken(
    provider: string,
    token: string,
    limiter: PerDomainRateLimiter
): Promise<ProbeResult> {
    const fingerprint = getFingerprintByProvider(provider);

    if (!fingerprint || !fingerprint.probe) {
        return {
            status: 'unchecked',
            httpCode: '',
            jobsFound: 0,
        };
    }

    const url = fingerprint.probe(token);

    try {
        const response = await fetchWithTimeout(
            url,
            {
                method: fingerprint.probeMethod || 'GET',
                redirect: 'follow',
                headers: { Accept: 'application/json,text/html,*/*' },
            },
            8_000,
            limiter
        );

        const bodyText = await response.text();

        if (response.status === 200 && bodyText.length > 50) {
            return {
                status: 'ok',
                httpCode: response.status,
                jobsFound: estimateJobsFound(provider, bodyText),
            };
        }

        if (response.status === 404) {
            return { status: 'bad_token', httpCode: 404, jobsFound: 0 };
        }

        if (response.status === 403) {
            return { status: 'auth_or_bot_protected', httpCode: 403, jobsFound: 0 };
        }

        if (response.status >= 500) {
            return { status: 'dead', httpCode: response.status, jobsFound: 0 };
        }

        return {
            status: 'bad_token',
            httpCode: response.status,
            jobsFound: 0,
        };
    } catch (error: unknown) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'AbortError') {
            return { status: 'dead', httpCode: '', jobsFound: 0 };
        }
        return { status: 'dead', httpCode: '', jobsFound: 0 };
    }
}

async function loadTargetCompanies(supabase: ReturnType<typeof createAdminClient>, args: CliArgs): Promise<CompanyRow[]> {
    const rows: CompanyRow[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        let query = supabase
            .from('companies')
            .select('id, trading_name, url, ats_provider, ats_board_token, ats_status')
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);

        if (args.provider) {
            query = query.eq('ats_provider', args.provider);
        }

        if (args.all) {
            query = query.or('ats_provider.is.null,ats_board_token.is.null,ats_status.in.(bad_token,dead,needs_manual_review,ok)');
        } else {
            query = query.or('ats_provider.is.null,ats_board_token.is.null,ats_status.in.(bad_token,dead,needs_manual_review)');
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed loading companies: ${error.message}`);
        }

        if (!data || data.length === 0) break;

        rows.push(...(data as CompanyRow[]));

        if (data.length < pageSize) break;
        from += pageSize;
    }

    if (args.limit !== null) {
        return rows.slice(0, args.limit);
    }

    return rows;
}

function renderLiveTable(processedRows: DetectionResult[], processed: number, total: number): void {
    const recent = processedRows.slice(-12);
    const widths = {
        company: 28,
        provider: 14,
        token: 22,
        status: 20,
        jobs: 10,
    };

    const line = '-'.repeat(102);

    const header = [
        'Company'.padEnd(widths.company),
        'Provider'.padEnd(widths.provider),
        'Token'.padEnd(widths.token),
        'Status'.padEnd(widths.status),
        'Jobs'.padEnd(widths.jobs),
    ].join(' | ');

    console.log('');
    console.log(`ATS detection progress: ${processed}/${total}`);
    console.log(line);
    console.log(header);
    console.log(line);

    for (const row of recent) {
        const provider = row.newProvider ?? '';
        const token = row.newToken ?? '';
        const display = [
            row.company.trading_name.slice(0, widths.company).padEnd(widths.company),
            provider.slice(0, widths.provider).padEnd(widths.provider),
            token.slice(0, widths.token).padEnd(widths.token),
            row.status.slice(0, widths.status).padEnd(widths.status),
            String(row.jobsFound).slice(0, widths.jobs).padEnd(widths.jobs),
        ].join(' | ');
        console.log(display);
    }

    console.log(line);
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

function resultTag(status: AtsStatus): string {
    if (status === 'ok') return '[OK]';
    if (status === 'bad_token') return '[BAD_TOKEN]';
    if (status === 'unchecked') return '[UNCHECKED]';
    if (status === 'needs_manual_review') return '[MANUAL]';
    if (status === 'dead') return '[DEAD]';
    return '[MANUAL]';
}

async function detectAtsForCompany(
    company: CompanyRow,
    limiter: PerDomainRateLimiter
): Promise<DetectionResult> {
    const oldProvider = company.ats_provider;
    const oldToken = company.ats_board_token;
    const detectedAt = new Date().toISOString();

    if (!company.url) {
        const status: AtsStatus = 'dead';
        return {
            company,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status,
            probeHttpCode: '',
            jobsFound: 0,
            detectedAt,
            changed: status !== company.ats_status,
            logLabel: resultTag(status),
        };
    }

    let html = '';
    let finalUrl = company.url;
    try {
        const fetched = await fetchHomepageHtml(company.url, limiter);
        html = fetched.html;
        finalUrl = fetched.finalUrl;
    } catch {
        const status: AtsStatus = 'dead';
        return {
            company,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status,
            probeHttpCode: '',
            jobsFound: 0,
            detectedAt,
            changed: status !== company.ats_status,
            logLabel: '[DEAD]',
        };
    }

    const candidates = collectMatchCandidates(html, finalUrl);
    const match = chooseBestMatch(candidates);

    if (!match) {
        const status: AtsStatus = 'needs_manual_review';
        return {
            company,
            oldProvider,
            oldToken,
            newProvider: oldProvider,
            newToken: oldToken,
            status,
            probeHttpCode: '',
            jobsFound: 0,
            detectedAt,
            changed: status !== company.ats_status,
            logLabel: '[MANUAL]',
        };
    }

    const normalizedToken = normalizeToken(match.token);
    const provider = match.provider;

    if (!normalizedToken || looksRejectedToken(normalizedToken)) {
        const status: AtsStatus = 'needs_manual_review';
        return {
            company,
            oldProvider,
            oldToken,
            newProvider: provider,
            newToken: normalizedToken || oldToken,
            status,
            probeHttpCode: '',
            jobsFound: 0,
            detectedAt,
            changed:
                status !== company.ats_status ||
                provider !== oldProvider ||
                (normalizedToken || oldToken) !== oldToken,
            logLabel: '[BAD_TOKEN]',
        };
    }

    const probe = await probeToken(provider, normalizedToken, limiter);

    return {
        company,
        oldProvider,
        oldToken,
        newProvider: provider,
        newToken: normalizedToken,
        status: probe.status,
        probeHttpCode: probe.httpCode,
        jobsFound: probe.jobsFound,
        detectedAt,
        changed:
            provider !== oldProvider ||
            normalizedToken !== oldToken ||
            probe.status !== company.ats_status,
        logLabel: resultTag(probe.status),
    };
}

async function persistIfChanged(
    supabase: ReturnType<typeof createAdminClient>,
    result: DetectionResult
): Promise<void> {
    if (!result.changed) {
        return;
    }

    const { error } = await supabase
        .from('companies')
        .update({
            ats_provider: result.newProvider,
            ats_board_token: result.newToken,
            ats_status: result.status,
            ats_last_validated: result.detectedAt,
        })
        .eq('id', result.company.id);

    if (error) {
        throw new Error(`DB update failed for company ${result.company.id}: ${error.message}`);
    }
}

function writeResultsCsv(results: DetectionResult[]): void {
    const header = [
        'company_id',
        'trading_name',
        'url',
        'old_provider',
        'old_token',
        'new_provider',
        'new_token',
        'status',
        'probe_http_code',
        'detected_at',
    ].join(',');

    const lines = results.map((row) => [
        csvEscape(row.company.id),
        csvEscape(row.company.trading_name),
        csvEscape(row.company.url),
        csvEscape(row.oldProvider),
        csvEscape(row.oldToken),
        csvEscape(row.newProvider),
        csvEscape(row.newToken),
        csvEscape(row.status),
        csvEscape(row.probeHttpCode),
        csvEscape(row.detectedAt),
    ].join(','));

    const filePath = path.resolve(process.cwd(), 'ats_detection_results.csv');
    fs.writeFileSync(filePath, `${header}\n${lines.join('\n')}\n`, 'utf-8');
}

function printSummary(results: DetectionResult[]): void {
    const totalProcessed = results.length;
    const newlyDetected = results.filter((r) => (!r.oldProvider || !r.oldToken) && !!r.newProvider && !!r.newToken).length;
    const tokenCorrected = results.filter((r) => r.oldProvider && r.oldProvider === r.newProvider && r.oldToken !== r.newToken).length;
    const verifiedOk = results.filter((r) => r.status === 'ok').length;
    const unchecked = results.filter((r) => r.status === 'unchecked').length;
    const manual = results.filter((r) => r.status === 'needs_manual_review').length;
    const dead = results.filter((r) => r.status === 'dead').length;

    console.log('');
    console.log('Summary');
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Newly detected: ${newlyDetected}`);
    console.log(`Token corrected: ${tokenCorrected}`);
    console.log(`Verified ok: ${verifiedOk}`);
    console.log(`Unchecked (POST-only): ${unchecked}`);
    console.log(`Needs manual review: ${manual}`);
    console.log(`Dead (homepage unreachable): ${dead}`);
}

async function run(): Promise<void> {
    const args = parseCliArgs();
    const supabase = await getSupabaseClient();

    const targets = await loadTargetCompanies(supabase, args);
    console.log(`Loaded ${targets.length} companies to detect ATS from homepage.`);

    const limiter = new PerDomainRateLimiter(2000);
    const results: DetectionResult[] = [];

    for (let i = 0; i < targets.length; i += 10) {
        const batch = targets.slice(i, i + 10);

        const batchResults = await Promise.all(
            batch.map(async (company) => {
                const result = await detectAtsForCompany(company, limiter);
                await persistIfChanged(supabase, result);
                return result;
            })
        );

        for (const row of batchResults) {
            results.push(row);
            console.log(
                `${row.logLabel} ${row.company.trading_name} ${row.newProvider || 'unknown'}:${row.newToken || 'unknown'} status=${row.status}`
            );
        }

        renderLiveTable(results, Math.min(i + 10, targets.length), targets.length);

        if (i + 10 < targets.length) {
            await sleep(300);
        }
    }

    writeResultsCsv(results);
    printSummary(results);
}

run().catch((error) => {
    console.error('detectAndVerifyAts failed:', error);
    process.exit(1);
});
