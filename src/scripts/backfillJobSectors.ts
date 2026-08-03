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

async function backfillJobSectors() {
    console.log('Fetching null-sector jobs...');

    const jobs: { id: number; title: string; department: string | null }[] = [];
    const PAGE = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('jobs')
            .select('id, title, department')
            .is('sector', null)
            .range(from, from + PAGE - 1);

        if (error) throw new Error(`Fetch failed: ${error.message}`);
        if (!data?.length) break;
        jobs.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }

    if (!jobs.length) { console.log('No null-sector jobs found.'); return; }

    console.log(`Found ${jobs.length} jobs to classify.`);

    // Group ids by inferred sector — one UPDATE per sector value
    const sectorGroups = new Map<string, number[]>();
    let skipped = 0;

    for (const job of jobs) {
        const sector = inferJobSector(job.title, job.department);
        if (!sector) { skipped++; continue; }
        if (!sectorGroups.has(sector)) sectorGroups.set(sector, []);
        sectorGroups.get(sector)!.push(job.id);
    }

    console.log(`Classified: ${jobs.length - skipped} | Still unclassifiable: ${skipped}`);
    console.log('Sector breakdown:');
    for (const [sector, ids] of sectorGroups) {
        console.log(`  ${sector}: ${ids.length}`);
    }

    let totalUpdated = 0;
    for (const [sector, ids] of sectorGroups) {
        for (const chunk of chunkArray(ids, 500)) {
            const { error: updateErr } = await supabase
                .from('jobs')
                .update({ sector })
                .in('id', chunk);

            if (updateErr) {
                console.error(`Update failed for "${sector}": ${updateErr.message}`);
            } else {
                totalUpdated += chunk.length;
            }
        }
    }

    console.log(`Done. Updated ${totalUpdated} jobs.`);
}

backfillJobSectors().catch(err => { console.error(err); process.exit(1); });
