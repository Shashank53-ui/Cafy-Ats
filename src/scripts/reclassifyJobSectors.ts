/**
 * reclassifyJobSectors.ts — Re-run inferJobSector on existing catalog rows.
 *
 * Use after taxonomy changes (e.g. adding Pharmaceutical) so legacy labels
 * like Healthcare → Pharmaceutical get rewritten on jobs / jobs_IR.
 *
 * By default only updates rows whose inferred sector CHANGES.
 *
 * Usage:
 *   npx tsx src/scripts/reclassifyJobSectors.ts --dry-run
 *   npx tsx src/scripts/reclassifyJobSectors.ts --apply
 *   npx tsx src/scripts/reclassifyJobSectors.ts --apply --only Pharmaceutical
 *   npx tsx src/scripts/reclassifyJobSectors.ts --apply --table jobs_IR
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { inferJobSector } from '../lib/inferJobSector';
import { ALLOWED_SECTORS } from '../lib/constants';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type JobsTable = 'jobs' | 'jobs_IR';

function parseArgs(argv: string[]) {
    const apply = argv.includes('--apply');
    const dryRun = !apply || argv.includes('--dry-run');
    const onlyIdx = argv.indexOf('--only');
    const only =
        onlyIdx >= 0 && argv[onlyIdx + 1] ? String(argv[onlyIdx + 1]).trim() : null;
    const tableIdx = argv.indexOf('--table');
    const tableArg =
        tableIdx >= 0 && argv[tableIdx + 1] ? String(argv[tableIdx + 1]).trim() : null;

    if (only && !(ALLOWED_SECTORS as readonly string[]).includes(only)) {
        console.error(`--only must be an ALLOWED_SECTORS value. Got: ${only}`);
        process.exit(1);
    }

    const tables: JobsTable[] =
        tableArg === 'jobs' || tableArg === 'jobs_IR'
            ? [tableArg]
            : ['jobs', 'jobs_IR'];

    return { dryRun, only, tables };
}

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
        for (const row of data) map.set(Number(row.id), row.company_sector ?? null);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return map;
}

async function fetchAllJobRows(table: JobsTable) {
    const rows: {
        id: number;
        company_id: number;
        title: string;
        department: string | null;
        sector: string | null;
    }[] = [];
    const PAGE = 1000;
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from(table)
            .select('id, company_id, title, department, sector')
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`${table} fetch failed: ${error.message}`);
        if (!data?.length) break;
        rows.push(
            ...(data as {
                id: number;
                company_id: number;
                title: string;
                department: string | null;
                sector: string | null;
            }[])
        );
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return rows;
}

async function reclassifyTable(
    table: JobsTable,
    companySectorMap: Map<number, string | null>,
    opts: { dryRun: boolean; only: string | null }
) {
    console.log(`\n=== ${table} ${opts.dryRun ? '(dry-run)' : '(apply)'} ===`);
    const rows = await fetchAllJobRows(table);
    console.log(`Loaded ${rows.length.toLocaleString()} rows.`);

    /** newSector → ids to update */
    const updates = new Map<string, number[]>();
    /** fromSector → toSector → count */
    const transitionCounts = new Map<string, Map<string, number>>();
    let unchanged = 0;
    let skippedByOnly = 0;

    for (const row of rows) {
        const companySector = companySectorMap.get(Number(row.company_id)) ?? null;
        const current = (row.sector || '').trim() || null;

        // `department` gets backfilled to the sector string itself when the ATS gave
        // none (see syncAll.ts / backfillJobSectors.ts). Feeding that straight back in
        // would let inferJobSector's department-priority step re-confirm the row's own
        // (possibly stale) sector forever, regardless of title-rule improvements. Treat
        // a department that merely echoes the current sector as no signal at all.
        const deptForClassification =
            row.department && row.department.trim() === current ? null : row.department;
        const inferred =
            inferJobSector(row.title, deptForClassification, companySector) || 'Other';

        if (current === inferred) {
            unchanged++;
            continue;
        }

        if (opts.only && inferred !== opts.only) {
            skippedByOnly++;
            continue;
        }

        if (!updates.has(inferred)) updates.set(inferred, []);
        updates.get(inferred)!.push(Number(row.id));

        const fromKey = current ?? '(null)';
        if (!transitionCounts.has(fromKey)) transitionCounts.set(fromKey, new Map());
        const toMap = transitionCounts.get(fromKey)!;
        toMap.set(inferred, (toMap.get(inferred) ?? 0) + 1);
    }

    const totalToUpdate = [...updates.values()].reduce((n, ids) => n + ids.length, 0);
    console.log(`Unchanged: ${unchanged.toLocaleString()}`);
    if (opts.only) {
        console.log(`Skipped (inferred ≠ ${opts.only}): ${skippedByOnly.toLocaleString()}`);
    }
    console.log(`Would update: ${totalToUpdate.toLocaleString()}`);

    if (transitionCounts.size) {
        console.log('Transitions (from → to):');
        const lines: string[] = [];
        for (const [from, toMap] of transitionCounts) {
            for (const [to, count] of toMap) {
                lines.push(`  ${from} → ${to}: ${count}`);
            }
        }
        lines.sort((a, b) => {
            const ca = Number(a.split(': ').pop());
            const cb = Number(b.split(': ').pop());
            return cb - ca;
        });
        for (const line of lines.slice(0, 40)) console.log(line);
        if (lines.length > 40) console.log(`  … ${lines.length - 40} more`);
    }

    if (opts.dryRun) {
        console.log('Dry-run only — no writes. Re-run with --apply to commit.');
        return { table, updated: 0, planned: totalToUpdate };
    }

    let updated = 0;
    for (const [sector, ids] of updates) {
        for (const chunk of chunkArray(ids, 500)) {
            const { error } = await supabase.from(table).update({ sector }).in('id', chunk);
            if (error) {
                console.error(`Update failed for "${sector}" (${chunk.length} ids): ${error.message}`);
            } else {
                updated += chunk.length;
            }
        }
    }

    console.log(`Updated sector on ${updated.toLocaleString()} rows in ${table}.`);
    return { table, updated, planned: totalToUpdate };
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    console.log(
        `Reclassify job sectors — mode=${opts.dryRun ? 'dry-run' : 'apply'}` +
            (opts.only ? ` only→${opts.only}` : ' (all changed inferences)') +
            ` tables=${opts.tables.join(',')}`
    );

    const companySectorMap = await loadCompanySectorMap();
    console.log(`Loaded ${companySectorMap.size.toLocaleString()} company sector rows.`);

    const results = [];
    for (const table of opts.tables) {
        results.push(await reclassifyTable(table, companySectorMap, opts));
    }

    const planned = results.reduce((n, r) => n + r.planned, 0);
    const updated = results.reduce((n, r) => n + r.updated, 0);
    console.log(`\nSummary: planned=${planned.toLocaleString()} updated=${updated.toLocaleString()}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
