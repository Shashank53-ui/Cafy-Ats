import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

function fallbackFromValidationCsv(): Array<{ provider: string; status: string; company_count: number }> {
    const filePath = path.resolve(process.cwd(), 'ats_validation_results.csv');
    if (!fs.existsSync(filePath)) {
        throw new Error('ats_validation_results.csv not found for fallback baseline generation');
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];

    const header = parseCsvLine(lines[0]);
    const providerIdx = header.indexOf('ats_provider');
    const statusIdx = header.indexOf('status');
    if (providerIdx === -1 || statusIdx === -1) {
        throw new Error('ats_validation_results.csv is missing required columns');
    }

    const counts = new Map<string, number>();
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCsvLine(lines[i]);
        const provider = parts[providerIdx] || 'unknown';
        const status = parts[statusIdx] || 'unknown';
        const key = `${provider}__${status}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    return Array.from(counts.entries())
        .map(([key, company_count]) => {
            const [provider, status] = key.split('__');
            return { provider, status, company_count };
        })
        .sort((a, b) => a.provider.localeCompare(b.provider) || a.status.localeCompare(b.status));
}

async function run(): Promise<void> {
    const { data, error } = await supabase
        .from('companies')
        .select('ats_provider, ats_status')
        .not('ats_provider', 'is', null);

    let rows: Array<{ provider: string; status: string; company_count: number }> = [];

    if (error) {
        if (error.message.includes('ats_status')) {
            console.warn('companies.ats_status is missing; falling back to ats_validation_results.csv');
            rows = fallbackFromValidationCsv();
        } else {
            throw new Error(error.message);
        }
    } else {
        const counts = new Map<string, number>();
        for (const row of data || []) {
            const provider = row.ats_provider || 'unknown';
            const status = row.ats_status || 'null';
            const key = `${provider}__${status}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        }

        rows = Array.from(counts.entries())
            .map(([key, companyCount]) => {
                const [provider, status] = key.split('__');
                return { provider, status, company_count: companyCount };
            })
            .sort((a, b) => a.provider.localeCompare(b.provider) || a.status.localeCompare(b.status));
    }

    const header = 'ats_provider,ats_status,company_count';
    const lines = rows.map((r) => [
        csvEscape(r.provider),
        csvEscape(r.status),
        csvEscape(r.company_count),
    ].join(','));

    fs.writeFileSync(path.resolve(process.cwd(), 'ats_baseline_post_repair.csv'), `${header}\n${lines.join('\n')}\n`, 'utf-8');
    console.log(`Wrote ats_baseline_post_repair.csv with ${rows.length} grouped rows`);
}

run().catch((error) => {
    console.error('exportAtsBaseline failed:', error);
    process.exit(1);
});
