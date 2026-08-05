/**
 * backfillDepartmentBambooBreezy.ts — Phase 5 of the sector/department fix.
 *
 * BambooHR and Breezy both had real department-extraction bugs (fixed in
 * syncAll.ts: BambooHR hardcoded department: '' despite departmentLabel
 * being in the response; Breezy read `.name` off what's actually a flat
 * string). Those fixes only affect newly-synced jobs going forward — this
 * script re-fetches current postings for just these two providers'
 * companies and updates department on existing `jobs`/`jobs_IR` rows by
 * matching `url`, without needing a full re-sync of everyone.
 *
 * Run: npx tsx src/scripts/backfillDepartmentBambooBreezy.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import pLimit from 'p-limit';
import {
    loadAllCompanies,
    resolveProviderAndToken,
    fetchBambooHR,
    fetchBreezy,
    type CompanyRow,
} from './syncAll';

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

async function backfillCompany(
    company: CompanyRow,
    stats: { companiesProcessed: number; rowsUpdated: number; rowsStillEmpty: number; errors: number },
) {
    const resolved = resolveProviderAndToken(company.ats_provider, company.ats_board_token, company.careers_url ?? null);
    if (!resolved) return;

    try {
        const jobs = resolved.provider === 'bamboohr'
            ? await fetchBambooHR(resolved.token)
            : await fetchBreezy(resolved.token);

        stats.companiesProcessed++;
        if (!jobs.length) return;

        const deptByUrl = new Map<string, string>();
        for (const j of jobs) {
            if (j.url && j.department && j.department.trim()) {
                deptByUrl.set(j.url, j.department.trim());
            }
        }
        if (!deptByUrl.size) return;

        for (const table of ['jobs', 'jobs_IR'] as const) {
            const { data: existing, error } = await supabase
                .from(table)
                .select('id, url, department')
                .eq('company_id', company.id)
                .is('department', null);
            if (error) { console.warn(`  [${company.trading_name}] ${table} fetch error: ${error.message}`); continue; }
            if (!existing?.length) continue;

            for (const row of existing) {
                const dept = deptByUrl.get(row.url);
                if (!dept) { stats.rowsStillEmpty++; continue; }
                const { error: updateErr } = await supabase
                    .from(table)
                    .update({ department: dept })
                    .eq('id', row.id);
                if (updateErr) {
                    console.warn(`  [${company.trading_name}] update failed for row ${row.id}: ${updateErr.message}`);
                } else {
                    stats.rowsUpdated++;
                }
            }
        }
    } catch (e: any) {
        stats.errors++;
        console.warn(`  [${company.trading_name}] fetch error: ${e.message}`);
    }
}

async function main() {
    const all = await loadAllCompanies(null);
    const targets = all.filter((c) => {
        const p = String(c.ats_provider || '').toLowerCase();
        return p === 'bamboohr' || p === 'breezy';
    });
    console.log(`Found ${targets.length} BambooHR/Breezy companies to re-check.`);

    const stats = { companiesProcessed: 0, rowsUpdated: 0, rowsStillEmpty: 0, errors: 0 };
    const limit = pLimit(6);
    await Promise.all(targets.map((c) => limit(() => backfillCompany(c, stats))));

    console.log('\nDone.');
    console.log(`Companies processed:      ${stats.companiesProcessed}`);
    console.log(`Rows updated:             ${stats.rowsUpdated}`);
    console.log(`Rows still empty (no      `);
    console.log(`  matching live posting):  ${stats.rowsStillEmpty}`);
    console.log(`Fetch errors:             ${stats.errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
