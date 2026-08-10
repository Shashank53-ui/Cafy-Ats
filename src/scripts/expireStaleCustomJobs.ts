/**
 * Expire stale NHS (and other custom-scraper) UK jobs not seen recently.
 * Default: company_id 1690 (NHS), older than 30 days.
 *
 * Run: npx tsx src/scripts/expireStaleCustomJobs.ts --dry-run
 *      npx tsx src/scripts/expireStaleCustomJobs.ts
 *      npx tsx src/scripts/expireStaleCustomJobs.ts --ids 1690,1726 --days 30
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dryRun = process.argv.includes('--dry-run');
const daysArg = process.argv.find((a) => a.startsWith('--days='));
const days = daysArg ? Number(daysArg.split('=')[1]) : 30;
const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const companyIds = (idsArg ? idsArg.split('=')[1] : '1690')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

async function main() {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    console.log(`Expiring jobs for companies [${companyIds.join(', ')}] with last_seen_at < ${cutoff}`);

    let total = 0;
    for (const companyId of companyIds) {
        const ids: number[] = [];
        let from = 0;
        while (true) {
            const { data, error } = await sb
                .from('jobs')
                .select('id, title, last_seen_at')
                .eq('company_id', companyId)
                .or(`last_seen_at.lt.${cutoff},last_seen_at.is.null`)
                .range(from, from + 999);
            if (error) throw new Error(error.message);
            if (!data?.length) break;
            for (const r of data) ids.push(r.id);
            if (data.length < 1000) break;
            from += 1000;
        }

        console.log(`company ${companyId}: ${ids.length} stale rows`);
        total += ids.length;
        if (dryRun || !ids.length) continue;

        let deleted = 0;
        for (const chunk of chunkArray(ids, 500)) {
            const { error, count } = await sb.from('jobs').delete({ count: 'exact' }).in('id', chunk);
            if (error) {
                console.error(`Delete failed: ${error.message}`);
                continue;
            }
            deleted += count ?? chunk.length;
        }
        console.log(`  deleted ${deleted}`);
    }

    console.log(dryRun ? `\nDry run: would delete ${total} rows.` : `\nDone. Deleted toward ${total} stale rows.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
