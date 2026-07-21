/**
 * One-off cleanup: re-checks every existing jobs_IR row against the fixed
 * isIrelandJob() filter and deletes rows that no longer validate as Ireland.
 *
 * Run with --dry-run first to review what would be deleted before committing.
 *
 * Run: npx tsx src/scripts/cleanupJobsIR.ts --dry-run
 *      npx tsx src/scripts/cleanupJobsIR.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { isIrelandJob } from '../lib/irelandFilter';

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

async function cleanupJobsIR() {
    console.log(`Fetching all jobs_IR rows${dryRun ? ' (dry run — nothing will be deleted)' : ''}...`);

    const rows: { id: number; title: string; location: string | null; url: string }[] = [];
    const PAGE = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('jobs_IR')
            .select('id, title, location, url')
            .range(from, from + PAGE - 1);

        if (error) throw new Error(`Fetch failed: ${error.message}`);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }

    console.log(`Fetched ${rows.length} rows. Re-checking against the Ireland filter...`);

    const toDelete = rows.filter(r => !isIrelandJob(r.location));

    console.log(`${toDelete.length} of ${rows.length} rows fail the Ireland filter and would be deleted.`);
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
        const { error } = await supabase.from('jobs_IR').delete().in('id', chunk);
        if (error) {
            console.error(`Delete failed for chunk: ${error.message}`);
            continue;
        }
        deleted += chunk.length;
    }

    console.log(`\nDeleted ${deleted} non-Ireland rows from jobs_IR.`);
}

cleanupJobsIR().catch(err => {
    console.error(err);
    process.exit(1);
});
