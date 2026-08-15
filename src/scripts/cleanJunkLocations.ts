/**
 * Rewrite junk location strings (GBR, requisition IDs, N/A, multi-country dumps).
 *
 * Usage:
 *   npx tsx src/scripts/cleanJunkLocations.ts --dry-run
 *   npx tsx src/scripts/cleanJunkLocations.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { sanitizeJobLocation } from '../lib/refineLocation';

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

async function fetchAll(table: JobsTable) {
    const rows: { id: number; location: string | null; title: string | null; url: string | null }[] = [];
    const PAGE = 1000;
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from(table)
            .select('id, location, title, url')
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
    const market: 'uk' | 'ireland' = table === 'jobs_IR' ? 'ireland' : 'uk';
    console.log(`\n=== ${table} ${dryRun ? '(dry-run)' : '(apply)'} ===`);
    const rows = await fetchAll(table);
    console.log(`Loaded ${rows.length.toLocaleString()} rows.`);

    const byTarget = new Map<string, number[]>();
    const samples = new Map<string, number>();

    for (const r of rows) {
        const from = String(r.location || '').trim();
        const next = sanitizeJobLocation(from, market, r.title, r.url);
        if (!from || next === from) continue;
        const key = `${from.slice(0, 80)} → ${next}`;
        samples.set(key, (samples.get(key) || 0) + 1);
        const list = byTarget.get(next) || [];
        list.push(r.id);
        byTarget.set(next, list);
    }

    const planned = [...byTarget.values()].reduce((n, list) => n + list.length, 0);
    console.log(`Locations to rewrite: ${planned.toLocaleString()}`);
    console.log('Top changes:', [...samples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));

    if (dryRun || !planned) {
        if (dryRun) console.log('Dry-run only — no writes. Re-run with --apply to commit.');
        return { table, cleaned: 0, planned };
    }

    let cleaned = 0;
    for (const [target, ids] of byTarget) {
        for (const chunk of chunkArray(ids, 500)) {
            const { error } = await supabase.from(table).update({ location: target }).in('id', chunk);
            if (error) console.error(`Update failed (→ ${target}): ${error.message}`);
            else cleaned += chunk.length;
        }
    }
    console.log(`Updated location on ${cleaned.toLocaleString()} rows.`);
    return { table, cleaned, planned };
}

async function main() {
    const dryRun = !process.argv.includes('--apply');
    console.log(dryRun ? 'Mode: dry-run (pass --apply to write)' : 'Mode: APPLY');
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
