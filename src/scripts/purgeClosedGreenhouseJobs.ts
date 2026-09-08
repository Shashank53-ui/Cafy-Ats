/**
 * Drop Greenhouse jobs whose posting ID is no longer on the live board.
 * Closed Greenhouse URLs often 200-redirect to the company board ("Jobs at X")
 * instead of 404, so last_seen_at alone can leave a dead Apply button until
 * the next successful company sync.
 *
 *   npx tsx src/scripts/purgeClosedGreenhouseJobs.ts
 *   npx tsx src/scripts/purgeClosedGreenhouseJobs.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type JobRow = { id: number; company_id: string | null; title: string; url: string | null };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseGreenhouseUrl(url: string): { board: string; jobId: string } | null {
  const m = String(url || '').match(
    /greenhouse\.io\/(?:embed\/job_board\?for=)?([^/?#]+)\/jobs\/(\d+)/i,
  );
  if (!m) return null;
  return { board: m[1].toLowerCase(), jobId: m[2] };
}

async function fetchAllJobs(table: 'jobs' | 'jobs_IR'): Promise<JobRow[]> {
  const rows: JobRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table)
      .select('id, company_id, title, url')
      .ilike('url', '%greenhouse.io%')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as JobRow[]));
    if (data.length < 1000) break;
  }
  return rows;
}

async function liveJobIds(board: string): Promise<Set<string> | null> {
  for (const sub of ['boards-api', 'boards-api.eu']) {
    try {
      const res = await fetch(`https://${sub}.greenhouse.io/v1/boards/${board}/jobs`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const ids = new Set<string>((data.jobs || []).map((j: any) => String(j.id)));
      return ids;
    } catch {
      /* try next subdomain */
    }
  }
  return null;
}

async function deleteIds(table: 'jobs' | 'jobs_IR', ids: number[]) {
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

async function sweep(table: 'jobs' | 'jobs_IR') {
  const rows = await fetchAllJobs(table);
  const byBoard = new Map<string, Array<JobRow & { jobId: string }>>();
  for (const row of rows) {
    const parsed = parseGreenhouseUrl(String(row.url || ''));
    if (!parsed) continue;
    const list = byBoard.get(parsed.board) || [];
    list.push({ ...row, jobId: parsed.jobId });
    byBoard.set(parsed.board, list);
  }

  const closed: Array<{ id: number; title: string; board: string; jobId: string }> = [];
  const skippedBoards: string[] = [];
  for (const [board, list] of byBoard) {
    const live = await liveJobIds(board);
    if (!live) {
      skippedBoards.push(board);
      continue;
    }
    for (const row of list) {
      if (!live.has(row.jobId)) {
        closed.push({ id: row.id, title: row.title, board, jobId: row.jobId });
      }
    }
  }
  return { totalGh: rows.length, boards: byBoard.size, closed, skippedBoards };
}

export async function runClosedGreenhouseSweep(apply: boolean): Promise<{ jobs: number; jobs_IR: number }> {
  const uk = await sweep('jobs');
  const ie = await sweep('jobs_IR');
  console.log(
    JSON.stringify(
      {
        apply,
        jobs: { totalGh: uk.totalGh, boards: uk.boards, closed: uk.closed.length, samples: uk.closed.slice(0, 15) },
        jobs_IR: { totalGh: ie.totalGh, boards: ie.boards, closed: ie.closed.length, samples: ie.closed.slice(0, 10) },
        skippedBoards: [...new Set([...uk.skippedBoards, ...ie.skippedBoards])],
      },
      null,
      2,
    ),
  );
  if (!apply) return { jobs: 0, jobs_IR: 0 };
  if (uk.closed.length) await deleteIds('jobs', uk.closed.map((c) => c.id));
  if (ie.closed.length) await deleteIds('jobs_IR', ie.closed.map((c) => c.id));
  console.log('deleted', { jobs: uk.closed.length, jobs_IR: ie.closed.length });
  return { jobs: uk.closed.length, jobs_IR: ie.closed.length };
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectExecution) {
  runClosedGreenhouseSweep(process.argv.includes('--apply')).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
