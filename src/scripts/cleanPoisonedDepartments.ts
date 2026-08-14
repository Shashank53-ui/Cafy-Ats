/**
 * cleanPoisonedDepartments.ts — cleanup for bad `department` values.
 *
 * - Junk ATS labels (Recruitment Manila, GTM, GBO, Co-Sec, Asiera, placeholders)
 *   → replaced with the job's `sector` (never left null/blank)
 * - Cost-center suffixes / HQU- prefixes → stripped human label
 * - Blank/null department → filled with `sector`
 *
 * Sector-taxonomy labels already stored as department are left as-is (valid display).
 * Never overwrites `sector`.
 *
 * Usage:
 *   npx tsx src/scripts/cleanPoisonedDepartments.ts --dry-run
 *   npx tsx src/scripts/cleanPoisonedDepartments.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { ALLOWED_SECTORS } from '../lib/constants';
import { sanitizeJobDepartment } from '../lib/sanitizeJobDepartment';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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

function sectorFallback(sector: string | null | undefined): string {
    const s = String(sector || '').trim();
    if (s && (ALLOWED_SECTORS as readonly string[]).includes(s)) return s;
    return s || 'Other';
}

/** Desired persisted department. Undefined = leave unchanged. */
function desiredDepartment(
    department: string | null,
    sector: string | null
): string | undefined {
    const fallback = sectorFallback(sector);
    const trimmed = String(department || '').trim();

    // Blank → fill with sector
    if (!trimmed) return fallback;

    // Already a sector label — keep for display
    if ((ALLOWED_SECTORS as readonly string[]).includes(trimmed)) return undefined;

    const cleaned = sanitizeJobDepartment(trimmed);
    if (cleaned === null) return fallback;
    if (cleaned === trimmed) return undefined;
    // Stripped label that somehow became empty
    if (!cleaned.trim()) return fallback;
    return cleaned;
}

async function fetchAll(table: JobsTable) {
    const rows: { id: number; department: string | null; sector: string | null }[] = [];
    const PAGE = 1000;
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from(table)
            .select('id, department, sector')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`${table} fetch failed: ${error.message}`);
        if (!data?.length) break;
        rows.push(...(data as any));
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return rows;
}

async function cleanTable(table: JobsTable, dryRun: boolean) {
    console.log(`\n=== ${table} ${dryRun ? '(dry-run)' : '(apply)'} ===`);
    const rows = await fetchAll(table);
    console.log(`Loaded ${rows.length.toLocaleString()} rows.`);

    const byTarget = new Map<string, number[]>();
    const samples = new Map<string, number>();

    for (const r of rows) {
        const next = desiredDepartment(r.department, r.sector);
        if (next === undefined) continue;
        const from = (r.department || '').trim() || '(blank)';
        const key = `${from} → ${next}`;
        samples.set(key, (samples.get(key) || 0) + 1);
        const list = byTarget.get(next) || [];
        list.push(r.id);
        byTarget.set(next, list);
    }

    const planned = [...byTarget.values()].reduce((n, list) => n + list.length, 0);
    console.log(`Departments to rewrite: ${planned.toLocaleString()}`);
    console.log(
        'Top changes:',
        [...samples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    );

    if (dryRun || !planned) {
        if (dryRun) console.log('Dry-run only — no writes. Re-run with --apply to commit.');
        return { table, cleaned: 0, planned };
    }

    let cleaned = 0;
    for (const [target, ids] of byTarget) {
        for (const chunk of chunkArray(ids, 500)) {
            const { error } = await supabase
                .from(table)
                .update({ department: target })
                .in('id', chunk);
            if (error) console.error(`Update failed (→ ${target}): ${error.message}`);
            else cleaned += chunk.length;
        }
    }
    console.log(`Updated department on ${cleaned.toLocaleString()} rows.`);
    return { table, cleaned, planned };
}

async function main() {
    const dryRun = !process.argv.includes('--apply');
    if (dryRun) console.log('Mode: dry-run (pass --apply to write)');
    else console.log('Mode: APPLY');

    const results = [];
    for (const table of ['jobs', 'jobs_IR'] as JobsTable[]) {
        results.push(await cleanTable(table, dryRun));
    }
    console.log('\nSummary:', results);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
