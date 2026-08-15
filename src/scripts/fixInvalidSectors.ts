/**
 * Rewrite job.sector values that are leaked company_sector labels
 * (not in ALLOWED_SECTORS) using inferJobSector.
 *
 * Usage:
 *   npx tsx src/scripts/fixInvalidSectors.ts --dry-run
 *   npx tsx src/scripts/fixInvalidSectors.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { inferJobSector } from '../lib/inferJobSector';
import { ALLOWED_SECTORS } from '../lib/constants';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ALLOWED = new Set(ALLOWED_SECTORS as readonly string[]);
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type JobsTable = 'jobs' | 'jobs_IR';

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

async function fixTable(table: JobsTable, dryRun: boolean) {
    const { data, error } = await supabase
        .from(table)
        .select('id, title, department, sector, company_id')
        .not('sector', 'in', `(${[...ALLOWED].map((s) => `"${s}"`).join(',')})`);
    // PostgREST in() with spaces in values is fragile — page all and filter locally.
    console.log(`\n=== ${table} ${dryRun ? '(dry-run)' : '(apply)'} ===`);
    if (error) {
        console.log('filter error, paging all:', error.message);
    }

    const rows: any[] = [];
    let from = 0;
    for (;;) {
        const page = await supabase
            .from(table)
            .select('id, title, department, sector, company_id')
            .range(from, from + 999);
        if (page.error) throw new Error(page.error.message);
        if (!page.data?.length) break;
        for (const r of page.data) {
            if (!ALLOWED.has(String(r.sector || '').trim())) rows.push(r);
        }
        if (page.data.length < 1000) break;
        from += 1000;
    }
    console.log(`Invalid-sector rows: ${rows.length}`);

    const companyIds = [...new Set(rows.map((r) => r.company_id))];
    const companySector = new Map<string, string | null>();
    for (const chunk of chunkArray(companyIds, 200)) {
        const { data: cos } = await supabase.from('companies').select('id, company_sector').in('id', chunk);
        for (const c of cos || []) companySector.set(String(c.id), c.company_sector ?? null);
    }

    const byTarget = new Map<string, number[]>();
    const samples = new Map<string, number>();
    for (const r of rows) {
        const dept = ALLOWED.has(String(r.department || '').trim()) ? null : r.department;
        const inferred = inferJobSector(r.title, dept, companySector.get(String(r.company_id))) || 'Other';
        const from = String(r.sector || '').trim() || '(blank)';
        const key = `${from} → ${inferred}`;
        samples.set(key, (samples.get(key) || 0) + 1);
        const list = byTarget.get(inferred) || [];
        list.push(r.id);
        byTarget.set(inferred, list);
    }
    console.log('Top changes:', [...samples.entries()].sort((a, b) => b[1] - a[1]));

    if (dryRun) {
        console.log('Dry-run only.');
        return { table, cleaned: 0, planned: rows.length };
    }

    let cleaned = 0;
    for (const [sector, ids] of byTarget) {
        for (const chunk of chunkArray(ids, 200)) {
            const { error: uerr } = await supabase.from(table).update({ sector }).in('id', chunk);
            if (uerr) console.error(uerr.message);
            else cleaned += chunk.length;
        }
    }
    console.log(`Updated ${cleaned} sectors.`);
    return { table, cleaned, planned: rows.length };
}

async function main() {
    const dryRun = !process.argv.includes('--apply');
    for (const t of ['jobs', 'jobs_IR'] as JobsTable[]) await fixTable(t, dryRun);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
