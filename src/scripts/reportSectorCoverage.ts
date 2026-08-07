/**
 * Phase 4 Step 1: report live sector coverage for jobs + companies.
 * Run: npx tsx src/scripts/reportSectorCoverage.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function pageAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

function tally(rows: { sector?: string | null; company_sector?: string | null }[], key: 'sector' | 'company_sector') {
  const map = new Map<string, number>();
  for (const r of rows) {
    const s = String(r[key] || 'Unclassified').trim() || 'Unclassified';
    map.set(s, (map.get(s) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function main() {
  const [jobs, jobsIR, companies] = await Promise.all([
    pageAll<{ sector: string | null }>('jobs', 'sector'),
    pageAll<{ sector: string | null }>('jobs_IR', 'sector'),
    pageAll<{ id: any; trading_name: string; company_sector: string | null; ats_provider: string | null }>(
      'companies',
      'id, trading_name, company_sector, ats_provider',
    ),
  ]);

  const jobTally = tally([...jobs, ...jobsIR], 'sector');
  const companyTally = tally(companies, 'company_sector');
  const totalJobs = jobs.length + jobsIR.length;

  const thinJobSectors = jobTally
    .filter((r) => r.label !== 'Unclassified')
    .map((r) => ({ ...r, share: +((100 * r.count) / totalJobs).toFixed(2) }))
    .filter((r) => r.share < 3)
    .sort((a, b) => a.share - b.share);

  const report = {
    totals: {
      uk_jobs: jobs.length,
      ir_jobs: jobsIR.length,
      combined_jobs: totalJobs,
      companies: companies.length,
      companies_with_sector: companies.filter((c) => c.company_sector).length,
      companies_with_ats: companies.filter((c) => c.ats_provider).length,
    },
    job_sectors: jobTally.map((r) => ({
      ...r,
      share: +((100 * r.count) / totalJobs).toFixed(2),
    })),
    company_sectors: companyTally,
    thin_job_sectors_under_3pct: thinJobSectors,
    existing_names_lower: companies.map((c) => String(c.trading_name || '').toLowerCase().trim()),
  };

  fs.writeFileSync('tmp-sector-coverage.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ totals: report.totals, thin: thinJobSectors.slice(0, 15), top_jobs: report.job_sectors.slice(0, 10) }, null, 2));
  console.log('Wrote tmp-sector-coverage.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
