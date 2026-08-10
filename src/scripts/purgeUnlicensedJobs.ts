/**
 * Purge jobs that don't belong on a visa/permit board:
 *   - jobs: company must have licensed_sponsor = true
 *   - jobs_IR: company must have ireland_permit_employer OR licensed_sponsor
 *     (UK sponsors may dual-write Ireland roles; junk has neither flag)
 *
 * Run: npx tsx src/scripts/purgeUnlicensedJobs.ts --dry-run
 *      npx tsx src/scripts/purgeUnlicensedJobs.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dryRun = process.argv.includes('--dry-run');

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

function isTruthy(v: unknown): boolean {
    return v === true || v === 'true' || v === 't' || v === 1 || v === '1';
}

async function pageAll<T>(table: string, cols: string): Promise<T[]> {
    const rows: T[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase.from(table).select(cols).range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        if (!data?.length) break;
        rows.push(...(data as T[]));
        if (data.length < 1000) break;
        from += 1000;
    }
    return rows;
}

async function deleteIds(table: string, ids: Array<number | string>) {
    let deleted = 0;
    for (const chunk of chunkArray(ids, 500)) {
        const { error, count } = await supabase.from(table).delete({ count: 'exact' }).in('id', chunk);
        if (error) {
            console.error(`Delete failed for ${table} chunk: ${error.message}`);
            continue;
        }
        deleted += count ?? chunk.length;
    }
    return deleted;
}

async function main() {
    console.log(`Loading companies + jobs${dryRun ? ' (dry run)' : ''}...`);

    type Co = {
        id: number | string;
        trading_name: string;
        licensed_sponsor: unknown;
        ireland_permit_employer?: unknown;
    };

    let companies: Co[];
    try {
        companies = await pageAll<Co>(
            'companies',
            'id, trading_name, licensed_sponsor, ireland_permit_employer'
        );
    } catch (e: any) {
        if (/ireland_permit_employer/i.test(e.message)) {
            companies = await pageAll<Co>('companies', 'id, trading_name, licensed_sponsor');
        } else {
            throw e;
        }
    }

    const coMap = new Map(companies.map((c) => [String(c.id), c]));

    const ukJobs = await pageAll<{ id: number; company_id: number; title: string; location: string }>(
        'jobs',
        'id, company_id, title, location'
    );
    const irJobs = await pageAll<{ id: number; company_id: number; title: string; location: string }>(
        'jobs_IR',
        'id, company_id, title, location'
    );

    const ukBad = ukJobs.filter((j) => {
        const c = coMap.get(String(j.company_id));
        if (!c) return true;
        return !isTruthy(c.licensed_sponsor);
    });

    // IR: keep rows for UK licensed sponsors (dual-write). Purge only clear junk.
    const irBad = irJobs.filter((j) => {
        const c = coMap.get(String(j.company_id));
        if (!c) return true;
        return !isTruthy(c.ireland_permit_employer) && !isTruthy(c.licensed_sponsor);
    });

    const tally = (rows: typeof ukBad) => {
        const m = new Map<string, number>();
        for (const r of rows) {
            const c = coMap.get(String(r.company_id));
            const key = c ? `[${c.id}] ${c.trading_name}` : `[${r.company_id}] (missing company)`;
            m.set(key, (m.get(key) || 0) + 1);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    console.log(`\nUK jobs to purge (not licensed_sponsor): ${ukBad.length} / ${ukJobs.length}`);
    for (const [k, n] of tally(ukBad).slice(0, 25)) console.log(`  ${n}\t${k}`);

    console.log(`\nIR jobs to purge (neither permit nor UK sponsor): ${irBad.length} / ${irJobs.length}`);
    for (const [k, n] of tally(irBad).slice(0, 25)) console.log(`  ${n}\t${k}`);

    if (dryRun) {
        console.log('\nDry run complete. Re-run without --dry-run to delete.');
        return;
    }

    const ukDeleted = await deleteIds(
        'jobs',
        ukBad.map((j) => j.id)
    );
    const irDeleted = await deleteIds(
        'jobs_IR',
        irBad.map((j) => j.id)
    );
    console.log(`\nDeleted ${ukDeleted} from jobs, ${irDeleted} from jobs_IR.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
