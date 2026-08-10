/**
 * Recompute job.level from title using current inferJobLevel rules.
 *
 * Run: npx tsx src/scripts/backfillJobLevels.ts --dry-run
 *      npx tsx src/scripts/backfillJobLevels.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { inferJobLevel } from '../lib/inferJobLevel';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dryRun = process.argv.includes('--dry-run');

async function backfill(table: 'jobs' | 'jobs_IR') {
    let from = 0;
    let changed = 0;
    let scanned = 0;
    const samples: string[] = [];

    while (true) {
        const { data, error } = await sb
            .from(table)
            .select('id, title, level')
            .range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        if (!data?.length) break;

        for (const row of data) {
            scanned++;
            const next = inferJobLevel(String(row.title || '')) || 'Mid-level';
            if (next === row.level) continue;
            changed++;
            if (samples.length < 25) {
                samples.push(`${row.id}: ${row.level} → ${next} | ${String(row.title).slice(0, 55)}`);
            }
            if (!dryRun) {
                const { error: upErr } = await sb.from(table).update({ level: next }).eq('id', row.id);
                if (upErr) console.error(`Update failed ${row.id}: ${upErr.message}`);
            }
        }

        if (data.length < 1000) break;
        from += 1000;
    }

    console.log(`\n======== ${table} ========`);
    console.log(`scanned=${scanned} changed=${changed}${dryRun ? ' (dry-run)' : ''}`);
    for (const s of samples) console.log(`  ${s}`);
}

async function main() {
    await backfill('jobs');
    await backfill('jobs_IR');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
