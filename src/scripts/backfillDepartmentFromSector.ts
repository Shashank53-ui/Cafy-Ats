/**
 * backfillDepartmentFromSector.ts — final pass to guarantee every row has
 * a non-null `department`.
 *
 * Several ATS providers (Workday, Oracle Cloud, several custom scrapers,
 * and a portion of Teamtailor/SmartRecruiters/Pinpoint postings) genuinely
 * do not expose a department field in their feed at all — there is no real
 * value to extract. syncAll.ts's buildRowsForJobs now stores the job's own
 * sector as department for any row where the source didn't provide one, so
 * new jobs are covered going forward. This script applies the same rule
 * retroactively to every existing null-department row: department = sector.
 * By this point sector itself is guaranteed non-null (backfillJobSectors.ts
 * defaults unclassifiable jobs to 'Other'), so this always has a value to
 * fall back to.
 *
 * Run: npx tsx src/scripts/backfillDepartmentFromSector.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

async function backfillTable(table: 'jobs' | 'jobs_IR') {
    console.log(`\n=== ${table} ===`);
    const rows: { id: number; sector: string | null }[] = [];
    const PAGE = 1000;
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from(table)
            .select('id, sector')
            .is('department', null)
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`${table} fetch failed: ${error.message}`);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }

    if (!rows.length) { console.log('No null-department rows found.'); return; }
    console.log(`Found ${rows.length} null-department rows.`);

    const noSector = rows.filter((r) => !r.sector);
    if (noSector.length) {
        console.warn(`  ${noSector.length} of these also have no sector — skipping (nothing to fall back to). Run backfillJobSectors.ts first.`);
    }

    const bySector = new Map<string, number[]>();
    for (const r of rows) {
        if (!r.sector) continue;
        if (!bySector.has(r.sector)) bySector.set(r.sector, []);
        bySector.get(r.sector)!.push(r.id);
    }

    let totalUpdated = 0;
    for (const [sector, ids] of bySector) {
        for (const chunk of chunkArray(ids, 500)) {
            const { error } = await supabase.from(table).update({ department: sector }).in('id', chunk);
            if (error) {
                console.error(`Update failed for "${sector}": ${error.message}`);
            } else {
                totalUpdated += chunk.length;
            }
        }
    }
    console.log(`Done. Updated ${totalUpdated} rows in ${table} (department = sector).`);
}

async function main() {
    await backfillTable('jobs');
    await backfillTable('jobs_IR');
}

main().catch((e) => { console.error(e); process.exit(1); });
