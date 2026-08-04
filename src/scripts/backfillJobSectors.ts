/**
 * backfillJobSectors.ts — Phase 2 of the sector/department data-quality fix.
 *
 * Classifies existing null-sector rows in both `jobs` and `jobs_IR` using
 * inferJobSector(title, department, companySector). Previously this only
 * covered `jobs` and never passed companySector at all, so the P3 company
 * fallback (see backfillCompanySector.ts, which populates it) never had a
 * chance to fire. Anything still unclassifiable after all three inputs is
 * set to 'Other' (a real ALLOWED_SECTORS value) instead of left null, so
 * the UI never has to show a blank sector badge.
 *
 * Run: npx tsx src/scripts/backfillJobSectors.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { inferJobSector } from '../lib/inferJobSector';

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

async function loadCompanySectorMap(): Promise<Map<number, string | null>> {
    const map = new Map<number, string | null>();
    const PAGE = 1000;
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from('companies')
            .select('id, company_sector')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`companies fetch failed: ${error.message}`);
        if (!data?.length) break;
        for (const row of data) map.set(Number(row.id), row.company_sector);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return map;
}

async function backfillTable(table: 'jobs' | 'jobs_IR', companySectorMap: Map<number, string | null>) {
    console.log(`\n=== ${table} ===`);
    console.log('Fetching null-sector rows...');

    const rows: { id: number; company_id: number; title: string; department: string | null }[] = [];
    const PAGE = 1000;
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from(table)
            .select('id, company_id, title, department')
            .is('sector', null)
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`${table} fetch failed: ${error.message}`);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }

    if (!rows.length) { console.log('No null-sector rows found.'); return; }
    console.log(`Found ${rows.length} rows to classify.`);

    const sectorGroups = new Map<string, number[]>();
    let fromRules = 0;
    let fromCompanyFallback = 0;
    let defaultedToOther = 0;

    for (const row of rows) {
        const companySector = companySectorMap.get(Number(row.company_id)) ?? null;
        let sector = inferJobSector(row.title, row.department, companySector);

        if (sector && sector === companySector && !matchesTitleOrDept(row.title, row.department)) {
            fromCompanyFallback++;
        } else if (sector) {
            fromRules++;
        }

        if (!sector) {
            sector = 'Other';
            defaultedToOther++;
        }

        if (!sectorGroups.has(sector)) sectorGroups.set(sector, []);
        sectorGroups.get(sector)!.push(row.id);
    }

    console.log(`Classified via title/department rules: ${fromRules}`);
    console.log(`Classified via company_sector fallback: ${fromCompanyFallback}`);
    console.log(`Defaulted to 'Other' (no signal at all): ${defaultedToOther}`);
    console.log('Sector breakdown:');
    for (const [sector, ids] of sectorGroups) {
        console.log(`  ${sector}: ${ids.length}`);
    }

    let totalUpdated = 0;
    for (const [sector, ids] of sectorGroups) {
        for (const chunk of chunkArray(ids, 500)) {
            const { error } = await supabase.from(table).update({ sector }).in('id', chunk);
            if (error) {
                console.error(`Update failed for "${sector}": ${error.message}`);
            } else {
                totalUpdated += chunk.length;
            }
        }
    }
    console.log(`Done. Updated ${totalUpdated} rows in ${table}.`);
}

// Re-run inferJobSector with no companySector to tell whether the P3
// fallback was actually what produced the classification (for reporting only).
function matchesTitleOrDept(title: string, department: string | null): boolean {
    return inferJobSector(title, department, null) !== null;
}

async function main() {
    const companySectorMap = await loadCompanySectorMap();
    await backfillTable('jobs', companySectorMap);
    await backfillTable('jobs_IR', companySectorMap);
}

main().catch(err => { console.error(err); process.exit(1); });
