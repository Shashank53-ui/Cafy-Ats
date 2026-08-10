/**
 * List licensed sponsors that have an ATS token but zero jobs in jobs/jobs_IR.
 * Optionally write a sync batch file of IDs.
 *
 * Run: npx tsx src/scripts/listSponsorsMissingJobs.ts
 *      npx tsx src/scripts/listSponsorsMissingJobs.ts --write-ids
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const writeIds = process.argv.includes('--write-ids');

const SKIP_PROVIDERS = new Set([
    'linkedin', 'custom', 'unknown', 'not found', 'linekdin', 'internal / email',
    'work at a startup', 'ycombinator',
]);

const MAINSTREAM = new Set([
    'greenhouse', 'ashby', 'lever', 'workable', 'teamtailor', 'bamboohr',
    'smartrecruiters', 'pinpoint', 'breezy', 'recruitee', 'workday', 'personio',
    'jobvite', 'hibob', 'rippling', 'successfactors', 'icims', 'oracle_cloud',
]);

async function pageAll(table: string, cols: string) {
    const rows: any[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return rows;
}

function isTruthy(v: unknown) {
    return v === true || v === 'true' || v === 't' || v === 1 || v === '1';
}

async function main() {
    const [cos, uk, ir] = await Promise.all([
        pageAll(
            'companies',
            'id, trading_name, licensed_sponsor, ireland_permit_employer, ats_provider, ats_board_token, ats_status'
        ),
        pageAll('jobs', 'company_id'),
        pageAll('jobs_IR', 'company_id'),
    ]);

    const withJobs = new Set<string>();
    for (const r of uk) withJobs.add(String(r.company_id));
    for (const r of ir) withJobs.add(String(r.company_id));

    const missing = cos.filter((c) => {
        if (!isTruthy(c.licensed_sponsor) && !isTruthy(c.ireland_permit_employer)) return false;
        if (!c.ats_provider || !c.ats_board_token) return false;
        if (withJobs.has(String(c.id))) return false;
        const status = String(c.ats_status || '').toLowerCase();
        if (status === 'dead' || status === 'disabled') return false;
        return true;
    });

    const byProv = new Map<string, typeof missing>();
    for (const c of missing) {
        const p = String(c.ats_provider || 'unknown').toLowerCase();
        if (!byProv.has(p)) byProv.set(p, []);
        byProv.get(p)!.push(c);
    }

    console.log(`Licensed/permit sponsors with ATS token but 0 jobs: ${missing.length}`);
    for (const [p, list] of [...byProv.entries()].sort((a, b) => b[1].length - a[1].length)) {
        console.log(`  ${list.length}\t${p}`);
    }

    const fixable = missing.filter((c) => {
        const p = String(c.ats_provider || '').toLowerCase();
        return MAINSTREAM.has(p) && !SKIP_PROVIDERS.has(p);
    });

    console.log(`\nMainstream ATS fixable candidates: ${fixable.length}`);
    for (const c of fixable.slice(0, 40)) {
        console.log(
            `  [${c.id}] ${c.trading_name} | ${c.ats_provider} | ${String(c.ats_board_token).slice(0, 50)}`
        );
    }

    if (writeIds) {
        const ids = fixable.map((c) => c.id);
        const out = path.resolve(process.cwd(), 'data/sponsors_missing_jobs_ids.txt');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, ids.join(',') + '\n', 'utf8');
        console.log(`\nWrote ${ids.length} ids to ${out}`);
        console.log(`Sync batch example:\n  npx tsx src/scripts/syncAll.ts --ids ${ids.slice(0, 20).join(',')}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
