/**
 * One-off audit: how many jobs look Pharmaceutical by keywords but aren't tagged yet.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { inferJobSector } from '../lib/inferJobSector';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PHARMA =
    /pharma|biotech|biopharma|life.?science|pharmacovigilance|drug discovery|drug development|medicinal chemistry|formulation scientist|clinical research associate|\bcra\b|\bgmp\b|bioprocess|biomanufacturing/i;

const COMPANY_PHARMA =
    /pharma|biotech|life.?science|biopharma|pharmaceutical/i;

async function loadCompanySectors() {
    const map = new Map<number, string | null>();
    let from = 0;
    for (;;) {
        const { data, error } = await sb
            .from('companies')
            .select('id, company_sector, trading_name')
            .range(from, from + 999);
        if (error) throw error;
        if (!data?.length) break;
        for (const r of data) {
            map.set(Number(r.id), r.company_sector ?? null);
        }
        if (data.length < 1000) break;
        from += 1000;
    }
    return map;
}

async function scan(table: 'jobs' | 'jobs_IR', companyMap: Map<number, string | null>) {
    let from = 0;
    let total = 0;
    let pharmaSector = 0;
    let keywordHit = 0;
    let keywordNotPharma = 0;
    let companySignalNotPharma = 0;
    let wouldInferPharma = 0;
    const bySector = new Map<string, number>();
    const samples: string[] = [];

    for (;;) {
        const { data, error } = await sb
            .from(table)
            .select('id, company_id, title, department, sector')
            .order('id', { ascending: true })
            .range(from, from + 999);
        if (error) throw error;
        if (!data?.length) break;

        for (const r of data) {
            total++;
            const sector = (r.sector || '(null)').trim() || '(null)';
            if (sector === 'Pharmaceutical') {
                pharmaSector++;
                continue;
            }

            const text = `${r.title || ''} ${r.department || ''}`;
            const companySector = companyMap.get(Number(r.company_id)) ?? null;
            const inferred = inferJobSector(r.title, r.department, companySector);
            if (inferred === 'Pharmaceutical') wouldInferPharma++;

            const keyword = PHARMA.test(text);
            const companyHit = companySector ? COMPANY_PHARMA.test(companySector) : false;

            if (keyword) {
                keywordHit++;
                keywordNotPharma++;
                bySector.set(sector, (bySector.get(sector) || 0) + 1);
                if (samples.length < 12) {
                    samples.push(
                        `[${sector}] infer=${inferred} | ${r.title} | dept=${r.department || '-'} | co=${companySector || '-'}`
                    );
                }
            } else if (companyHit) {
                companySignalNotPharma++;
            }
        }

        if (data.length < 1000) break;
        from += 1000;
    }

    console.log(`\n=== ${table} ===`);
    console.log(
        JSON.stringify(
            {
                total,
                alreadyPharmaceutical: pharmaSector,
                titleDeptKeywordHitsNotTagged: keywordNotPharma,
                companySectorLooksPharmaButNotTagged: companySignalNotPharma,
                inferWouldBePharmaceuticalNow: wouldInferPharma,
            },
            null,
            2
        )
    );
    console.log('Keyword hits by current sector:');
    [...bySector.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([s, c]) => console.log(`  ${c}\t${s}`));
    console.log('Samples:');
    samples.forEach((s) => console.log(`  ${s}`));
}

async function main() {
    const companyMap = await loadCompanySectors();
    console.log(`Companies loaded: ${companyMap.size}`);
    await scan('jobs', companyMap);
    await scan('jobs_IR', companyMap);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
