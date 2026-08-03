/**
 * seedIrelandCompaniesSafe.ts
 *
 * Insert-only seed of verified Ireland ATS companies.
 * - Only Status=Good rows with a real provider + board token
 * - Never updates/overwrites an existing company (by id OR trading_name)
 * - Marks rows as non-UK sponsors so visa/sponsor filters stay intact
 *
 * Run: npx tsx src/scripts/seedIrelandCompaniesSafe.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
});

const CSV_PATH = path.resolve(process.cwd(), 'data/ireland/raw/ireland_companies.csv');
const DRY_RUN = process.argv.includes('--dry-run');

type Candidate = {
    id: number;
    trading_name: string;
    ats_provider: string;
    ats_board_token: string;
    careers_url: string | null;
};

async function loadExisting(): Promise<{
    byId: Set<number>;
    byName: Map<string, { id: number; trading_name: string }>;
}> {
    const byId = new Set<number>();
    const byName = new Map<string, { id: number; trading_name: string }>();
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('companies')
            .select('id, trading_name')
            .range(from, from + 999);

        if (error) throw new Error(error.message);
        if (!data?.length) break;

        for (const row of data) {
            const id = Number(row.id);
            byId.add(id);
            byName.set(String(row.trading_name || '').toLowerCase().trim(), {
                id,
                trading_name: row.trading_name,
            });
        }

        if (data.length < 1000) break;
        from += 1000;
    }

    return { byId, byName };
}

function loadCandidates(): Candidate[] {
    const rows = parse(fs.readFileSync(CSV_PATH, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
    }) as Record<string, string>[];

    return rows
        .filter((r) => String(r.Status || '').toLowerCase() === 'good')
        .filter((r) => {
            const provider = String(r['ATS Provider'] || '').trim().toLowerCase();
            return !!provider && provider !== 'unknown' && !!String(r['ATS Board Token'] || '').trim();
        })
        .map((r) => ({
            id: Number(r['Company ID']),
            trading_name: String(r['Company Name'] || '').trim(),
            ats_provider: String(r['ATS Provider'] || '').trim().toLowerCase(),
            ats_board_token: String(r['ATS Board Token'] || '').trim(),
            careers_url: String(r.URL || '').trim() || null,
        }))
        .filter((r) => Number.isFinite(r.id) && r.id >= 900000 && r.trading_name);
}

async function main() {
    console.log(DRY_RUN ? 'DRY RUN — no writes' : 'LIVE insert-only seed');
    console.log('CSV:', CSV_PATH);

    const candidates = loadCandidates();
    const { byId, byName } = await loadExisting();

    const toInsert: Candidate[] = [];
    const skipped: Array<{ name: string; reason: string; existingId?: number }> = [];

    for (const c of candidates) {
        if (byId.has(c.id)) {
            skipped.push({ name: c.trading_name, reason: 'id_exists', existingId: c.id });
            continue;
        }
        const existing = byName.get(c.trading_name.toLowerCase());
        if (existing) {
            skipped.push({
                name: c.trading_name,
                reason: 'name_exists',
                existingId: existing.id,
            });
            continue;
        }
        toInsert.push(c);
    }

    console.log(`Good candidates: ${candidates.length}`);
    console.log(`Will insert:     ${toInsert.length}`);
    console.log(`Skipped:         ${skipped.length}`);
    if (skipped.length) {
        console.table(skipped);
    }

    if (!toInsert.length) {
        console.log('Nothing to insert.');
        return;
    }

    const records = toInsert.map((c) => ({
        id: c.id,
        trading_name: c.trading_name,
        ats_provider: c.ats_provider,
        ats_board_token: c.ats_board_token,
        careers_url: c.careers_url,
        url: c.careers_url,
        // Keep UK sponsor product untouched
        licensed_sponsor: false,
        open_to_sponsorship: 0,
        active_jobs_count: 0,
        ats_status: 'ok',
        ats_failure_count: 0,
        show_recently_added_badge: false,
        sync_market: 'ireland',
    }));

    if (DRY_RUN) {
        console.log('Dry-run sample:');
        console.table(records.slice(0, 10));
        console.log(`Would insert ${records.length} companies.`);
        return;
    }

    let { error } = await supabase.from('companies').insert(records);
    if (error && /sync_market/i.test(error.message)) {
        console.warn('sync_market column missing — inserting without it. Run supabase/add_ireland_source_and_market.sql');
        const withoutMarket = records.map(({ sync_market, ...rest }) => rest);
        ({ error } = await supabase.from('companies').insert(withoutMarket));
    }
    if (error) {
        console.error('Insert failed:', error.message);
        process.exit(1);
    }

    const idsPath = path.resolve(process.cwd(), 'data/ireland/raw/_seeded_ireland_ids.txt');
    fs.writeFileSync(idsPath, toInsert.map((c) => c.id).join(','));
    console.log(`Inserted ${records.length} companies with sync_market=ireland.`);
    console.log(`IDs written to ${idsPath}`);
    console.log('Next: npx tsx src/scripts/syncAll.ts --market ireland --exclude-linkedin');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
