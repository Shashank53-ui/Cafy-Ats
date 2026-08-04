/**
 * backfillCompanySector.ts — Phase 1 of the sector/department data-quality fix.
 *
 * 74% of companies (2,276/3,075) have no `company_sector`, which silently
 * disables the P3 fallback in inferJobSector() for every one of their jobs.
 *
 * For each company with company_sector = null, in priority order:
 *   1. Majority vote across that company's own already-classified jobs
 *      (jobs + jobs_IR combined) — the most reliable signal, since it's
 *      real classified postings for this exact company.
 *   2. Fall back to running the same keyword rules against the company's
 *      `description` text (reuses inferJobSector by passing description
 *      in as the "title" argument).
 *   3. Otherwise leave null — don't guess.
 *
 * Run: npx tsx src/scripts/backfillCompanySector.ts
 */
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

async function fetchAllPaged<T>(
    table: string,
    columns: string,
    filter?: (q: any) => any,
): Promise<T[]> {
    const rows: T[] = [];
    const PAGE = 1000;
    let from = 0;
    for (;;) {
        let query = supabase.from(table).select(columns).range(from, from + PAGE - 1);
        if (filter) query = filter(query);
        const { data, error } = await query;
        if (error) throw new Error(`${table} fetch failed: ${error.message}`);
        if (!data?.length) break;
        rows.push(...(data as T[]));
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return rows;
}

async function main() {
    console.log('Fetching companies with company_sector = null...');
    const companies = await fetchAllPaged<{ id: number; description: string | null }>(
        'companies',
        'id, description',
        (q) => q.is('company_sector', null),
    );
    console.log(`  ${companies.length} companies missing company_sector`);
    if (!companies.length) { console.log('Nothing to do.'); return; }

    console.log('Fetching classified jobs (sector IS NOT NULL) from jobs + jobs_IR...');
    const [ukJobs, irJobs] = await Promise.all([
        fetchAllPaged<{ company_id: number; sector: string }>(
            'jobs', 'company_id, sector', (q) => q.not('sector', 'is', null),
        ),
        fetchAllPaged<{ company_id: number; sector: string }>(
            'jobs_IR', 'company_id, sector', (q) => q.not('sector', 'is', null),
        ),
    ]);
    console.log(`  ${ukJobs.length} classified UK jobs, ${irJobs.length} classified Ireland jobs`);

    // company_id -> sector -> count
    const votes = new Map<number, Map<string, number>>();
    for (const j of [...ukJobs, ...irJobs]) {
        const id = Number(j.company_id);
        if (!votes.has(id)) votes.set(id, new Map());
        const m = votes.get(id)!;
        m.set(j.sector, (m.get(j.sector) || 0) + 1);
    }

    function majoritySector(companyId: number): string | null {
        const m = votes.get(companyId);
        if (!m || m.size === 0) return null;
        let best: string | null = null;
        let bestCount = 0;
        for (const [sector, count] of m) {
            if (count > bestCount) { best = sector; bestCount = count; }
        }
        return best;
    }

    let fromVote = 0;
    let fromDescription = 0;
    let stillNull = 0;
    const updates: { id: number; sector: string }[] = [];

    for (const c of companies) {
        const id = Number(c.id);
        const voted = majoritySector(id);
        if (voted) {
            updates.push({ id, sector: voted });
            fromVote++;
            continue;
        }
        const fromDesc = c.description ? inferJobSector(c.description, null, null) : null;
        if (fromDesc) {
            updates.push({ id, sector: fromDesc });
            fromDescription++;
            continue;
        }
        stillNull++;
    }

    console.log(`\nClassified via job majority-vote: ${fromVote}`);
    console.log(`Classified via description text:  ${fromDescription}`);
    console.log(`Left null (no signal available):  ${stillNull}`);

    // Group by sector value for batched updates
    const bySector = new Map<string, number[]>();
    for (const u of updates) {
        if (!bySector.has(u.sector)) bySector.set(u.sector, []);
        bySector.get(u.sector)!.push(u.id);
    }

    let totalUpdated = 0;
    for (const [sector, ids] of bySector) {
        for (const chunk of chunkArray(ids, 500)) {
            const { error } = await supabase.from('companies').update({ company_sector: sector }).in('id', chunk);
            if (error) {
                console.error(`Update failed for "${sector}": ${error.message}`);
            } else {
                totalUpdated += chunk.length;
            }
        }
    }

    console.log(`\nDone. Updated ${totalUpdated} companies.`);
    console.log('Sector breakdown:');
    for (const [sector, ids] of bySector) {
        console.log(`  ${sector}: ${ids.length}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
