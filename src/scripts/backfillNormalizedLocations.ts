/**
 * Re-normalize stored location strings on jobs / jobs_IR via the Python
 * normalizer. Updates rows only when the formatted display value changes.
 *
 * Run: npx tsx src/scripts/backfillNormalizedLocations.ts --dry-run
 *      npx tsx src/scripts/backfillNormalizedLocations.ts --market uk
 *      npx tsx src/scripts/backfillNormalizedLocations.ts --market ireland
 *      npx tsx src/scripts/backfillNormalizedLocations.ts   # both markets
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import {
    formatNormalizedLocation,
    normalizeLocationsViaPython,
} from './syncAll';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dryRun = process.argv.includes('--dry-run');
const marketArgIdx = process.argv.indexOf('--market');
const marketArg = marketArgIdx !== -1 ? process.argv[marketArgIdx + 1] : null;

type Market = 'uk' | 'ireland';

function marketsToRun(): Market[] {
    if (marketArg === 'uk' || marketArg === 'ireland') return [marketArg];
    return ['uk', 'ireland'];
}

function tableFor(market: Market): 'jobs' | 'jobs_IR' {
    return market === 'uk' ? 'jobs' : 'jobs_IR';
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

async function fetchAllRows(table: 'jobs' | 'jobs_IR') {
    const rows: { id: number; location: string | null }[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select('id, location')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`Fetch ${table} failed: ${error.message}`);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return rows;
}

async function backfillMarket(market: Market) {
    const table = tableFor(market);
    console.log(`\n── ${table} (${market})${dryRun ? ' [dry-run]' : ''} ──`);

    const rows = await fetchAllRows(table);
    console.log(`Fetched ${rows.length} rows`);

    const BATCH = 200;
    let changed = 0;
    let unchanged = 0;
    let failedNorm = 0;
    const samples: { id: number; from: string; to: string }[] = [];

    for (const chunk of chunkArray(rows, BATCH)) {
        const raws = chunk.map(r => r.location ?? '');
        const normalized = await normalizeLocationsViaPython(raws, market);

        if (normalized.length !== chunk.length) {
            failedNorm += chunk.length;
            console.warn(`  normalize batch size mismatch (${normalized.length} vs ${chunk.length}) — skipping batch`);
            continue;
        }

        const updates: { id: number; location: string }[] = [];
        for (let i = 0; i < chunk.length; i++) {
            const row = chunk[i];
            const n = normalized[i];
            if (!n) {
                failedNorm++;
                continue;
            }
            const formatted = formatNormalizedLocation(n);
            if (!formatted) {
                unchanged++;
                continue;
            }
            const current = (row.location ?? '').trim();
            if (formatted === current) {
                unchanged++;
                continue;
            }
            changed++;
            if (samples.length < 40) {
                samples.push({ id: row.id, from: current, to: formatted });
            }
            updates.push({ id: row.id, location: formatted.slice(0, 255) });
        }

        if (dryRun || !updates.length) continue;

        // Group by target location so we can update many ids in one request.
        const byLocation = new Map<string, number[]>();
        for (const u of updates) {
            const ids = byLocation.get(u.location) ?? [];
            ids.push(u.id);
            byLocation.set(u.location, ids);
        }

        for (const [location, ids] of byLocation) {
            for (const idChunk of chunkArray(ids, 200)) {
                const { error } = await supabase
                    .from(table)
                    .update({ location })
                    .in('id', idChunk);
                if (error) {
                    console.error(`  Update location="${location}" failed: ${error.message}`);
                }
            }
        }
    }

    console.log(`Would update: ${changed} | Unchanged: ${unchanged} | Norm skip/fail: ${failedNorm}`);
    for (const s of samples) {
        console.log(`  [${s.id}] "${s.from}" → "${s.to}"`);
    }
    if (changed > samples.length) {
        console.log(`  ... and ${changed - samples.length} more`);
    }
}

async function main() {
    for (const market of marketsToRun()) {
        await backfillMarket(market);
    }
    console.log(dryRun ? '\nDry run complete.' : '\nBackfill complete.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
