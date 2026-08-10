/**
 * Mark companies that are neither UK licensed sponsors nor Ireland permit
 * employers as ats_status=disabled so sync skips fetching their junk feeds.
 *
 * Run: npx tsx src/scripts/disableUnlicensedAts.ts --dry-run
 *      npx tsx src/scripts/disableUnlicensedAts.ts
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

function isTruthy(v: unknown) {
    return v === true || v === 'true' || v === 't' || v === 1 || v === '1';
}

async function main() {
    const rows: any[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await sb
            .from('companies')
            .select('id, trading_name, licensed_sponsor, ireland_permit_employer, ats_provider, ats_board_token, ats_status')
            .range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }

    const targets = rows.filter(
        (c) =>
            !isTruthy(c.licensed_sponsor) &&
            !isTruthy(c.ireland_permit_employer) &&
            c.ats_provider &&
            c.ats_board_token &&
            String(c.ats_status || '').toLowerCase() !== 'disabled'
    );

    console.log(`Would disable ATS on ${targets.length} unlicensed companies`);
    for (const c of targets.slice(0, 20)) {
        console.log(`  [${c.id}] ${c.trading_name} | ${c.ats_provider}`);
    }

    if (dryRun) {
        console.log('Dry run complete.');
        return;
    }

    let updated = 0;
    for (let i = 0; i < targets.length; i += 100) {
        const chunk = targets.slice(i, i + 100);
        const ids = chunk.map((c) => c.id);
        const { error, count } = await sb
            .from('companies')
            .update({ ats_status: 'disabled' }, { count: 'exact' })
            .in('id', ids);
        if (error) {
            console.error(error.message);
            continue;
        }
        updated += count ?? chunk.length;
    }
    console.log(`Disabled ATS on ${updated} companies.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
