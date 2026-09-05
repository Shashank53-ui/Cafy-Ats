/**
 * Backlog sweep for companies the daily sync has not visited.
 * Default cutoff is 48h so yesterday's successful fetch is not wiped
 * if today's cron has not run yet. After a successful fetch, syncAll
 * now drops missing URLs immediately.
 *
 *   npx tsx src/scripts/purgeExpiredJobs.ts
 *   npx tsx src/scripts/purgeExpiredJobs.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const APPLY = process.argv.includes('--apply');
const CUTOFF_HOURS = 48;

type StaleRow = {
  id: number;
  company_id: string | null;
  title: string;
  last_seen_at: string | null;
  source?: string | null;
  url?: string | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchStale(table: 'jobs' | 'jobs_IR', cutoff: string): Promise<StaleRow[]> {
  const rows: StaleRow[] = [];
  let from = 0;
  const select =
    table === 'jobs_IR'
      ? 'id, company_id, title, last_seen_at, source, url'
      : 'id, company_id, title, last_seen_at, url';
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .lt('last_seen_at', cutoff)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as StaleRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  if (table !== 'jobs_IR') return rows;
  return rows.filter((r) => {
    if (String(r.source || '').toLowerCase() === 'linkedin') return false;
    if (/linkedin\.com|lnkd\.in/i.test(String(r.url || ''))) return false;
    return true;
  });
}

async function deleteIds(table: string, ids: number[]) {
  if (table === 'jobs') {
    for (const part of chunk(ids, 200)) {
      const { error: appErr } = await sb.from('applications').delete().in('job_id', part);
      if (appErr && !/schema cache|does not exist|relation/i.test(appErr.message)) {
        throw new Error(`applications delete: ${appErr.message}`);
      }
      const { error: appliedErr } = await sb.from('user_applied_jobs').delete().in('job_id', part);
      if (appliedErr && !/schema cache|does not exist|relation/i.test(appliedErr.message)) {
        throw new Error(`user_applied_jobs delete: ${appliedErr.message}`);
      }
      const { error: reportedErr } = await sb.from('reported_jobs').delete().in('job_id', part);
      if (reportedErr && !/schema cache|does not exist|relation/i.test(reportedErr.message)) {
        throw new Error(`reported_jobs delete: ${reportedErr.message}`);
      }
    }
  }
  for (const part of chunk(ids, 200)) {
    const { error } = await sb.from(table).delete().in('id', part);
    if (error) throw new Error(`${table} delete: ${error.message}`);
  }
}

async function recountCompanies(ids: string[]) {
  for (const part of chunk(ids, 50)) {
    for (const id of part) {
      const { count, error } = await sb
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', id);
      if (error) throw new Error(`count ${id}: ${error.message}`);
      const { error: updErr } = await sb
        .from('companies')
        .update({ active_jobs_count: count || 0 })
        .eq('id', id);
      if (updErr) throw new Error(`active_jobs_count ${id}: ${updErr.message}`);
    }
  }
}

async function main() {
  const cutoff = new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000).toISOString();
  const uk = await fetchStale('jobs', cutoff);
  const ie = await fetchStale('jobs_IR', cutoff);

  const byCompany = (rows: StaleRow[]) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const id = String(r.company_id || '(none)');
      map.set(id, (map.get(id) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  };

  const summary = {
    apply: APPLY,
    cutoffHours: CUTOFF_HOURS,
    cutoff,
    jobs: uk.length,
    jobs_IR: ie.length,
    jobsTop: byCompany(uk),
    jobsIrTop: byCompany(ie),
    oldestUk: uk
      .slice()
      .sort((a, b) => String(a.last_seen_at).localeCompare(String(b.last_seen_at)))
      .slice(0, 6)
      .map((r) => `${r.title} | ${r.last_seen_at}`),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!APPLY) return;

  if (uk.length) await deleteIds('jobs', uk.map((r) => r.id));
  if (ie.length) await deleteIds('jobs_IR', ie.map((r) => r.id));

  const companyIds = [
    ...new Set([...uk, ...ie].map((r) => String(r.company_id || '')).filter(Boolean)),
  ];
  await recountCompanies(companyIds);
  console.log(`deleted jobs=${uk.length} jobs_IR=${ie.length} recounted=${companyIds.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
