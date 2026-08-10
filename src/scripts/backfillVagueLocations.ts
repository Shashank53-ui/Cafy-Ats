/**
 * Backfill country-only UK/Ireland locations when title/url names a known city.
 *
 * Run: npx tsx src/scripts/backfillVagueLocations.ts --dry-run
 *      npx tsx src/scripts/backfillVagueLocations.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { refineVagueLocation } from '../lib/refineLocation';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dryRun = process.argv.includes('--dry-run');

async function backfill(table: 'jobs' | 'jobs_IR', market: 'uk' | 'ireland') {
    const countryFilter =
        market === 'uk'
            ? 'United Kingdom'
            : 'Ireland';

    let from = 0;
    let updated = 0;
    let scanned = 0;

    while (true) {
        const { data, error } = await sb
            .from(table)
            .select('id, title, location, url')
            .eq('location', countryFilter)
            .range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        if (!data?.length) break;

        for (const row of data) {
            scanned++;
            const next = refineVagueLocation(row.location, row.title, row.url, market);
            if (!next || next === row.location) continue;
            updated++;
            console.log(`[${table}] ${row.id}: "${row.location}" → "${next}" | ${String(row.title).slice(0, 60)}`);
            if (!dryRun) {
                const { error: upErr } = await sb.from(table).update({ location: next }).eq('id', row.id);
                if (upErr) console.error(`Update failed ${row.id}: ${upErr.message}`);
            }
        }

        if (data.length < 1000) break;
        from += 1000;
    }

    // Also catch exact "UK" / "Republic of Ireland"
    const alts = market === 'uk' ? ['UK', 'England', 'Scotland', 'Wales'] : ['Republic of Ireland', 'Eire'];
    for (const alt of alts) {
        from = 0;
        while (true) {
            const { data, error } = await sb
                .from(table)
                .select('id, title, location, url')
                .eq('location', alt)
                .range(from, from + 999);
            if (error) break;
            if (!data?.length) break;
            for (const row of data) {
                scanned++;
                const next = refineVagueLocation(row.location, row.title, row.url, market);
                if (!next || next === row.location) continue;
                updated++;
                console.log(`[${table}] ${row.id}: "${row.location}" → "${next}" | ${String(row.title).slice(0, 60)}`);
                if (!dryRun) {
                    await sb.from(table).update({ location: next }).eq('id', row.id);
                }
            }
            if (data.length < 1000) break;
            from += 1000;
        }
    }

    console.log(`${table}: scanned=${scanned} would_update=${updated}${dryRun ? ' (dry-run)' : ''}`);
}

async function main() {
    await backfill('jobs', 'uk');
    await backfill('jobs_IR', 'ireland');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
