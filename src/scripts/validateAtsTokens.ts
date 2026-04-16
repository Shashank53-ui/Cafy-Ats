import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ValidationStatus =
    | 'ok'
    | 'bad_token'
    | 'auth_or_bot_protected'
    | 'dead'
    | 'unchecked';

interface CompanyRow {
    id: number;
    trading_name: string;
    ats_provider: string;
    ats_board_token: string;
}

interface ValidationRow {
    company_id: number;
    company_name: string;
    ats_provider: string;
    ats_board_token: string;
    status: ValidationStatus;
    http_code: number | '';
    jobs_found: number;
    reason: string;
}

const POST_ONLY_PROVIDERS = new Set([
    'workday',
    'workday_enterprise',
    'oracle_cloud',
    'successfactors',
    'jpmc',
]);

const CHECKED_PROVIDERS = new Set([
    'greenhouse',
    'ashby',
    'lever',
    'workable',
    'teamtailor',
    'bamboohr',
    'smartrecruiters',
    'jobvite',
    'avature',
]);

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

function normalizeTeamtailorDomain(token: string): string {
    const trimmed = String(token || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!trimmed) return '';
    if (trimmed.includes('.teamtailor.com')) return trimmed;
    return `${trimmed}.teamtailor.com`;
}

function normalizeWorkableToken(token: string): string {
    return String(token || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
}

function normalizeAshbyToken(token: string): string {
    const trimmed = String(token || '').trim();
    const marker = 'job-board/';
    if (trimmed.includes(marker)) {
        return trimmed.slice(trimmed.indexOf(marker) + marker.length).replace(/\/$/, '');
    }
    return trimmed.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/').pop() || trimmed;
}

function normalizeAvatureToken(token: string): string {
    return String(token || '').trim().replace(/^https?:\/\//, '').split('.')[0].replace(/\/$/, '');
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                ...(options.headers || {}),
            },
        });
        clearTimeout(timeout);
        return res;
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

async function probeProvider(provider: string, rawToken: string): Promise<{ httpCode: number | ''; jobsFound: number; status: ValidationStatus; reason: string }> {
    try {
        if (provider === 'greenhouse') {
            const token = rawToken.split('?')[0];
            const urls = [
                `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
                `https://boards-api.eu.greenhouse.io/v1/boards/${token}/jobs?content=true`,
            ];
            for (const url of urls) {
                const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
                if (res.status === 404) continue;
                if (res.status === 401 || res.status === 403 || res.status === 429) {
                    return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
                }
                if (!res.ok) {
                    if (res.status >= 500) return { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' };
                    continue;
                }
                const data = await res.json();
                const jobsFound = Array.isArray(data.jobs) ? data.jobs.length : 0;
                return jobsFound > 0
                    ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'jobs_found' }
                    : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_jobs' };
            }
            return { httpCode: 404, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
        }

        if (provider === 'ashby') {
            const token = normalizeAshbyToken(rawToken);
            const res = await fetchWithTimeout(`https://api.ashbyhq.com/posting-api/job-board/${token}`, {
                headers: { Accept: 'application/json' },
            });
            if (res.status === 401 || res.status === 403 || res.status === 429) {
                return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
            }
            if (res.status === 404) return { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
            if (!res.ok) {
                return res.status >= 500
                    ? { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' }
                    : { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'http_error' };
            }
            const data = await res.json();
            const jobsFound = Array.isArray(data.jobs) ? data.jobs.length : 0;
            return jobsFound > 0
                ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'jobs_found' }
                : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_jobs' };
        }

        if (provider === 'lever') {
            const bases = ['https://api.eu.lever.co/v0/postings', 'https://api.lever.co/v0/postings'];
            for (const base of bases) {
                const res = await fetchWithTimeout(`${base}/${rawToken}?limit=1`, { headers: { Accept: 'application/json' } });
                if (res.status === 404) continue;
                if (res.status === 401 || res.status === 403 || res.status === 429) {
                    return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
                }
                if (!res.ok) {
                    if (res.status >= 500) return { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' };
                    continue;
                }
                const data = await res.json();
                const jobsFound = Array.isArray(data) ? data.length : 0;
                return jobsFound > 0
                    ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'jobs_found' }
                    : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_jobs' };
            }
            return { httpCode: 404, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
        }

        if (provider === 'workable') {
            const token = normalizeWorkableToken(rawToken);
            const res = await fetchWithTimeout(`https://apply.workable.com/api/v3/accounts/${token}/jobs`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
            });
            if (res.status === 401 || res.status === 403 || res.status === 429) {
                return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
            }
            if (res.status === 404) return { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
            if (!res.ok) {
                return res.status >= 500
                    ? { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' }
                    : { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'http_error' };
            }
            const data = await res.json();
            const jobsFound = Array.isArray(data.results) ? data.results.length : 0;
            return jobsFound > 0
                ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'jobs_found' }
                : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_jobs' };
        }

        if (provider === 'teamtailor') {
            const domain = normalizeTeamtailorDomain(rawToken);
            const res = await fetchWithTimeout(`https://${domain}/jobs.json?page[size]=1`, {
                headers: { Accept: 'application/json' },
            });
            if (res.status === 401 || res.status === 403 || res.status === 429) {
                return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
            }
            if (res.status === 404) return { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
            if (!res.ok) {
                return res.status >= 500
                    ? { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' }
                    : { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'http_error' };
            }
            const data = await res.json();
            const jobsFound = Array.isArray(data.data) ? data.data.length : 0;
            return jobsFound > 0
                ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'jobs_found' }
                : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_jobs' };
        }

        if (provider === 'bamboohr') {
            const token = String(rawToken || '').trim().replace(/^https?:\/\//, '').split('.')[0];
            const res = await fetchWithTimeout(`https://${token}.bamboohr.com/careers/list`);
            if (res.status === 401 || res.status === 403 || res.status === 429) {
                return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
            }
            if (res.status === 404) return { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
            if (!res.ok) {
                return res.status >= 500
                    ? { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' }
                    : { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'http_error' };
            }
            const body = await res.text();
            const jobsFound = body.includes('result') || body.includes('jobOpeningName') ? 1 : 0;
            return jobsFound > 0
                ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'content_detected' }
                : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_content' };
        }

        if (provider === 'smartrecruiters') {
            const token = String(rawToken || '').trim();
            const res = await fetchWithTimeout(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=1&status=PUBLISHED`, {
                headers: { Accept: 'application/json' },
            });
            if (res.status === 401 || res.status === 403 || res.status === 429) {
                return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
            }
            if (res.status === 404) return { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
            if (!res.ok) {
                return res.status >= 500
                    ? { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' }
                    : { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'http_error' };
            }
            const data = await res.json();
            const jobsFound = Array.isArray(data.content) ? data.content.length : 0;
            return jobsFound > 0
                ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'jobs_found' }
                : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_jobs' };
        }

        if (provider === 'jobvite') {
            const token = String(rawToken || '').trim();
            const res = await fetchWithTimeout(`https://jobs.jobvite.com/api/company/${token}/jobs`, {
                headers: { Accept: 'application/json' },
            });
            if (res.status === 401 || res.status === 403 || res.status === 429) {
                return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
            }
            if (res.status === 404) return { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
            if (!res.ok) {
                return res.status >= 500
                    ? { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' }
                    : { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'http_error' };
            }
            const data = await res.json();
            const jobsFound = Array.isArray(data.jobs) ? data.jobs.length : 0;
            return jobsFound > 0
                ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'jobs_found' }
                : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_jobs' };
        }

        if (provider === 'avature') {
            const token = normalizeAvatureToken(rawToken);
            const res = await fetchWithTimeout(`https://${token}.avature.net/api/rest/v1/jobs`, {
                headers: { Accept: 'application/json' },
            });
            if (res.status === 401 || res.status === 403 || res.status === 429) {
                return { httpCode: res.status, jobsFound: 0, status: 'auth_or_bot_protected', reason: 'blocked' };
            }
            if (res.status === 404) return { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'not_found' };
            if (!res.ok) {
                return res.status >= 500
                    ? { httpCode: res.status, jobsFound: 0, status: 'dead', reason: 'server_error' }
                    : { httpCode: res.status, jobsFound: 0, status: 'bad_token', reason: 'http_error' };
            }
            const data = await res.json();
            const jobsFound = Array.isArray(data.items) ? data.items.length : 0;
            return jobsFound > 0
                ? { httpCode: res.status, jobsFound, status: 'ok', reason: 'jobs_found' }
                : { httpCode: res.status, jobsFound, status: 'bad_token', reason: 'empty_jobs' };
        }

        return { httpCode: '', jobsFound: 0, status: 'unchecked', reason: 'provider_unchecked' };
    } catch (error: any) {
        const reason = error?.name === 'AbortError' ? 'timeout' : 'network_error';
        return { httpCode: '', jobsFound: 0, status: 'dead', reason };
    }
}

async function loadCompanies(): Promise<CompanyRow[]> {
    const rows: CompanyRow[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('companies')
            .select('id, trading_name, ats_provider, ats_board_token')
            .not('ats_provider', 'is', null)
            .not('ats_board_token', 'is', null)
            .range(from, from + pageSize - 1)
            .order('id', { ascending: true });

        if (error) {
            throw new Error(`Failed to load companies: ${error.message}`);
        }

        if (!data || data.length === 0) break;

        rows.push(...(data as CompanyRow[]));
        if (data.length < pageSize) break;
        from += pageSize;
    }

    return rows;
}

async function run(): Promise<void> {
    const companies = await loadCompanies();
    console.log(`Loaded ${companies.length} ATS-configured companies`);

    const results: ValidationRow[] = [];

    for (let i = 0; i < companies.length; i += 10) {
        const batch = companies.slice(i, i + 10);
        const batchResults = await Promise.all(batch.map(async (company) => {
            const provider = String(company.ats_provider || '').trim();
            const token = String(company.ats_board_token || '').trim();

            if (POST_ONLY_PROVIDERS.has(provider)) {
                const row: ValidationRow = {
                    company_id: company.id,
                    company_name: company.trading_name,
                    ats_provider: provider,
                    ats_board_token: token,
                    status: 'unchecked',
                    http_code: '',
                    jobs_found: 0,
                    reason: 'post_only_provider',
                };

                await supabase
                    .from('companies')
                    .update({
                        ats_status: row.status,
                        ats_last_validated: new Date().toISOString(),
                    })
                    .eq('id', company.id);

                return row;
            }

            if (!CHECKED_PROVIDERS.has(provider)) {
                const row: ValidationRow = {
                    company_id: company.id,
                    company_name: company.trading_name,
                    ats_provider: provider,
                    ats_board_token: token,
                    status: 'unchecked',
                    http_code: '',
                    jobs_found: 0,
                    reason: 'provider_unchecked',
                };

                await supabase
                    .from('companies')
                    .update({
                        ats_status: row.status,
                        ats_last_validated: new Date().toISOString(),
                    })
                    .eq('id', company.id);

                return row;
            }

            const probe = await probeProvider(provider, token);
            const row: ValidationRow = {
                company_id: company.id,
                company_name: company.trading_name,
                ats_provider: provider,
                ats_board_token: token,
                status: probe.status,
                http_code: probe.httpCode,
                jobs_found: probe.jobsFound,
                reason: probe.reason,
            };

            await supabase
                .from('companies')
                .update({
                    ats_status: row.status,
                    ats_last_validated: new Date().toISOString(),
                })
                .eq('id', company.id);

            return row;
        }));

        results.push(...batchResults);
        process.stdout.write(`Processed ${Math.min(i + 10, companies.length)} / ${companies.length}\r`);
        if (i + 10 < companies.length) {
            await sleep(500);
        }
    }

    console.log('\nWriting ats_validation_results.csv ...');
    const header = 'company_id,company_name,ats_provider,ats_board_token,status,http_code,jobs_found,reason';
    const lines = results.map((row) => [
        csvEscape(row.company_id),
        csvEscape(row.company_name),
        csvEscape(row.ats_provider),
        csvEscape(row.ats_board_token),
        csvEscape(row.status),
        csvEscape(row.http_code),
        csvEscape(row.jobs_found),
        csvEscape(row.reason),
    ].join(','));

    fs.writeFileSync(path.resolve(process.cwd(), 'ats_validation_results.csv'), `${header}\n${lines.join('\n')}\n`, 'utf-8');

    const summary = {
        total: results.length,
        ok: results.filter((r) => r.status === 'ok').length,
        bad_token: results.filter((r) => r.status === 'bad_token').length,
        auth_or_bot_protected: results.filter((r) => r.status === 'auth_or_bot_protected').length,
        dead: results.filter((r) => r.status === 'dead').length,
        unchecked: results.filter((r) => r.status === 'unchecked').length,
    };

    console.log('Validation summary');
    console.log(`Total checked: ${summary.total}`);
    console.log(`ok: ${summary.ok}`);
    console.log(`bad_token: ${summary.bad_token}`);
    console.log(`auth_or_bot_protected: ${summary.auth_or_bot_protected}`);
    console.log(`dead: ${summary.dead}`);
    console.log(`unchecked: ${summary.unchecked}`);
}

run().catch((error) => {
    console.error('validateAtsTokens failed:', error);
    process.exit(1);
});
