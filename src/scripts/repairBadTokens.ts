import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ValidationStatus = 'ok' | 'bad_token' | 'auth_or_bot_protected' | 'dead' | 'unchecked';

interface ValidationRow {
    company_id: number;
    company_name: string;
    ats_provider: string;
    ats_board_token: string;
    status: ValidationStatus;
    http_code: string;
    jobs_found: number;
    reason: string;
}

interface CompanyRow {
    id: number;
    trading_name: string;
    ats_provider: string;
    ats_board_token: string;
    url: string | null;
}

function csvEscape(value: string | number | null | undefined): string {
    const text = value === null || value === undefined ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    out.push(current);
    return out;
}

function parseValidationCsv(filePath: string): ValidationRow[] {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing validation input: ${filePath}`);
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];

    const header = parseCsvLine(lines[0]);
    const map = new Map<string, number>();
    header.forEach((name, idx) => map.set(name, idx));

    const rows: ValidationRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCsvLine(lines[i]);
        rows.push({
            company_id: Number(parts[map.get('company_id') ?? -1]),
            company_name: parts[map.get('company_name') ?? -1] || '',
            ats_provider: parts[map.get('ats_provider') ?? -1] || '',
            ats_board_token: parts[map.get('ats_board_token') ?? -1] || '',
            status: (parts[map.get('status') ?? -1] || 'unchecked') as ValidationStatus,
            http_code: parts[map.get('http_code') ?? -1] || '',
            jobs_found: Number(parts[map.get('jobs_found') ?? -1] || 0),
            reason: parts[map.get('reason') ?? -1] || '',
        });
    }
    return rows;
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

function normalizeTeamtailorToken(token: string): string {
    const cleaned = token.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (cleaned.includes('.teamtailor.com')) return cleaned.split('.')[0];
    return cleaned.split('/')[0];
}

function extractCandidateToken(provider: string, url: string): string | null {
    const ATS_RESOLVERS: Record<string, RegExp> = {
        greenhouse: /greenhouse\.io\/(?:boards\/)?([^/?#\s]+)/i,
        lever: /jobs\.lever\.co\/([^/?#\s]+)/i,
        ashby: /jobs\.ashbyhq\.com\/([^/?#\s]+)/i,
        workable: /apply\.workable\.com\/([^/?#\s]+)/i,
        teamtailor: /([^.\/]+)\.teamtailor\.com/i,
        teamtailor_html: /([^.\/]+)\.teamtailor\.com/i,
        bamboohr: /([^.\/]+)\.bamboohr\.com/i,
        smartrecruiters: /jobs\.smartrecruiters\.com\/([^/?#\s]+)/i,
        jobvite: /jobs\.jobvite\.com\/(?:company\/)?([^/?#\s]+)/i,
        avature: /(?:https?:\/\/)?([^.\/]+)\.avature\.net/i,
    };

    const resolver = ATS_RESOLVERS[provider];
    if (!resolver) return null;

    const match = url.match(resolver);
    if (!match || !match[1]) return null;

    if (provider === 'teamtailor' || provider === 'teamtailor_html') {
        return normalizeTeamtailorToken(match[1]);
    }

    return match[1];
}

async function probeToken(provider: string, token: string): Promise<boolean> {
    try {
        if (provider === 'greenhouse') {
            const res = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return false;
            const d = await res.json();
            return Array.isArray(d.jobs) && d.jobs.length > 0;
        }
        if (provider === 'ashby') {
            const res = await fetchWithTimeout(`https://api.ashbyhq.com/posting-api/job-board/${token}`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return false;
            const d = await res.json();
            return Array.isArray(d.jobs) && d.jobs.length > 0;
        }
        if (provider === 'lever') {
            const res = await fetchWithTimeout(`https://api.lever.co/v0/postings/${token}?limit=1`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return false;
            const d = await res.json();
            return Array.isArray(d) && d.length > 0;
        }
        if (provider === 'workable') {
            const res = await fetchWithTimeout(`https://apply.workable.com/api/v3/accounts/${token}/jobs`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
            });
            if (!res.ok) return false;
            const d = await res.json();
            return Array.isArray(d.results) && d.results.length > 0;
        }
        if (provider === 'teamtailor' || provider === 'teamtailor_html') {
            const domain = token.includes('.teamtailor.com') ? token : `${token}.teamtailor.com`;
            const res = await fetchWithTimeout(`https://${domain}/jobs.json?page[size]=1`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return false;
            const d = await res.json();
            return Array.isArray(d.data) && d.data.length > 0;
        }
        if (provider === 'bamboohr') {
            const res = await fetchWithTimeout(`https://${token}.bamboohr.com/careers/list`);
            return res.ok;
        }
        if (provider === 'smartrecruiters') {
            const res = await fetchWithTimeout(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=1&status=PUBLISHED`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return false;
            const d = await res.json();
            return Array.isArray(d.content) && d.content.length > 0;
        }
        if (provider === 'jobvite') {
            const res = await fetchWithTimeout(`https://jobs.jobvite.com/api/company/${token}/jobs`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return false;
            const d = await res.json();
            return Array.isArray(d.jobs) && d.jobs.length > 0;
        }
        if (provider === 'avature') {
            const res = await fetchWithTimeout(`https://${token}.avature.net/api/rest/v1/jobs`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return false;
            const d = await res.json();
            return Array.isArray(d.items) && d.items.length > 0;
        }
        return false;
    } catch {
        return false;
    }
}

async function run(): Promise<void> {
    const inputPath = path.resolve(process.cwd(), 'ats_validation_results.csv');
    const validationRows = parseValidationCsv(inputPath);

    const targetRows = validationRows.filter((row) => row.status === 'bad_token' || row.status === 'dead');
    console.log(`Repair candidates: ${targetRows.length}`);

    const ids = targetRows.map((row) => row.company_id);
    if (ids.length === 0) {
        console.log('No bad_token or dead rows to repair.');
        return;
    }

    const { data: companies, error } = await supabase
        .from('companies')
        .select('id, trading_name, ats_provider, ats_board_token, url')
        .in('id', ids);

    if (error) throw new Error(`Failed loading companies: ${error.message}`);

    const byId = new Map<number, CompanyRow>();
    (companies as CompanyRow[]).forEach((c) => byId.set(c.id, c));

    const needsReview: Array<{ company_id: number; company_name: string; careers_url: string; old_ats_provider: string; reason: string }> = [];
    const missingUrlLog: Array<{ company_id: number; company_name: string; ats_provider: string; reason: string }> = [];

    let repaired = 0;
    let unchanged = 0;

    for (const row of targetRows) {
        const company = byId.get(row.company_id);
        if (!company) continue;

        if (!company.url) {
            await supabase
                .from('companies')
                .update({ ats_status: 'needs_manual_review' })
                .eq('id', company.id);

            missingUrlLog.push({
                company_id: company.id,
                company_name: company.trading_name,
                ats_provider: company.ats_provider,
                reason: 'careers_url_null',
            });
            continue;
        }

        const candidate = extractCandidateToken(company.ats_provider, company.url);
        if (!candidate) {
            await supabase
                .from('companies')
                .update({ ats_status: 'needs_manual_review' })
                .eq('id', company.id);

            needsReview.push({
                company_id: company.id,
                company_name: company.trading_name,
                careers_url: company.url,
                old_ats_provider: company.ats_provider,
                reason: 'resolver_no_match',
            });
            continue;
        }

        if (candidate === company.ats_board_token) {
            unchanged++;
            continue;
        }

        const ok = await probeToken(company.ats_provider, candidate);
        if (!ok) {
            await supabase
                .from('companies')
                .update({ ats_status: 'needs_manual_review' })
                .eq('id', company.id);

            needsReview.push({
                company_id: company.id,
                company_name: company.trading_name,
                careers_url: company.url,
                old_ats_provider: company.ats_provider,
                reason: 'candidate_probe_failed',
            });
            continue;
        }

        const { error: updateError } = await supabase
            .from('companies')
            .update({
                ats_board_token: candidate,
                ats_status: 'ok',
                ats_last_validated: new Date().toISOString(),
                ats_failure_count: 0,
            })
            .eq('id', company.id);

        if (updateError) {
            needsReview.push({
                company_id: company.id,
                company_name: company.trading_name,
                careers_url: company.url,
                old_ats_provider: company.ats_provider,
                reason: `update_failed:${updateError.message}`,
            });
            continue;
        }

        repaired++;
        console.log(`REPAIRED ${company.trading_name}: ${company.ats_board_token} -> ${candidate}`);
    }

    const reviewHeader = 'company_id,company_name,careers_url,old_ats_provider,reason';
    const reviewLines = needsReview.map((r) => [
        csvEscape(r.company_id),
        csvEscape(r.company_name),
        csvEscape(r.careers_url),
        csvEscape(r.old_ats_provider),
        csvEscape(r.reason),
    ].join(','));
    fs.writeFileSync(path.resolve(process.cwd(), 'needs_review.csv'), `${reviewHeader}\n${reviewLines.join('\n')}\n`, 'utf-8');

    const missingHeader = 'company_id,company_name,ats_provider,reason';
    const missingLines = missingUrlLog.map((r) => [
        csvEscape(r.company_id),
        csvEscape(r.company_name),
        csvEscape(r.ats_provider),
        csvEscape(r.reason),
    ].join(','));
    fs.writeFileSync(path.resolve(process.cwd(), 'missing_careers_url.csv'), `${missingHeader}\n${missingLines.join('\n')}\n`, 'utf-8');

    console.log('Repair summary');
    console.log(`Repaired: ${repaired}`);
    console.log(`Needs manual review: ${needsReview.length + missingUrlLog.length}`);
    console.log(`Unchanged: ${unchanged}`);
}

run().catch((error) => {
    console.error('repairBadTokens failed:', error);
    process.exit(1);
});
