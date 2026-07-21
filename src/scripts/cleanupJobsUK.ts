/**
 * One-off cleanup: re-checks every existing jobs row against the fixed isUKJob()
 * filter and deletes rows that no longer validate as UK. Written after finding
 * that the Workday facet "trust" heuristic and a handful of custom scrapers
 * (Workday, JPMC, Goldman Sachs, Google) were letting non-UK rows through.
 *
 * Run with --dry-run first to review what would be deleted before committing.
 *
 * Run: npx tsx src/scripts/cleanupJobsUK.ts --dry-run
 *      npx tsx src/scripts/cleanupJobsUK.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { isUKJob } from '../lib/ukFilter';
import { buildLocationInput } from './syncAll';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dryRun = process.argv.includes('--dry-run');

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

async function cleanupJobsUK() {
    console.log(`Fetching all jobs rows${dryRun ? ' (dry run — nothing will be deleted)' : ''}...`);

    const rows: { id: number; title: string; location: string | null; url: string }[] = [];
    const PAGE = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('jobs')
            .select('id, title, location, url')
            .range(from, from + PAGE - 1);

        if (error) throw new Error(`Fetch failed: ${error.message}`);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }

    console.log(`Fetched ${rows.length} rows. Re-checking against the UK filter...`);

    // Re-validate from the stored location text alone — never re-grant isTrustedSource,
    // since that flag is exactly what let the Workday facet-trust bug through originally.
    const toDelete = rows.filter(r => !isUKJob(buildLocationInput({ location: r.location, title: r.title } as any)));

    console.log(`${toDelete.length} of ${rows.length} rows fail the UK filter and would be deleted.`);
    for (const r of toDelete.slice(0, 50)) {
        console.log(`  - [${r.id}] "${r.title}" @ "${r.location}" (${r.url})`);
    }
    if (toDelete.length > 50) console.log(`  ... and ${toDelete.length - 50} more`);

    if (dryRun || !toDelete.length) {
        console.log(dryRun ? '\nDry run complete. Re-run without --dry-run to delete these rows.' : '\nNothing to delete.');
        return;
    }

    const ids = toDelete.map(r => r.id);
    let deleted = 0;
    for (const chunk of chunkArray(ids, 500)) {
        const { error } = await supabase.from('jobs').delete().in('id', chunk);
        if (error) {
            console.error(`Delete failed for chunk: ${error.message}`);
            continue;
        }
        deleted += chunk.length;
    }

    console.log(`\nDeleted ${deleted} non-UK rows from jobs.`);
}

cleanupJobsUK().catch(err => {
    console.error(err);
    process.exit(1);
});
