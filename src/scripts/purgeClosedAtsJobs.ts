/**
 * Drop ATS jobs whose posting ID is no longer on the live board.
 * Covers Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Pinpoint,
 * Breezy, Recruitee, BambooHR, Personio, Teamtailor, Jobvite.
 *
 * SmartRecruiters giant boards are probed by posting ID (404 = closed) so we
 * never paginate 6k+ global listings. Nightly syncAll skips SmartRecruiters.
 *
 * Workday / NHS / Oracle / own-domain careers still rely on the daily company
 * fetch: an empty fetch never wipes the live set.
 *
 *   npx tsx src/scripts/purgeClosedAtsJobs.ts
 *   npx tsx src/scripts/purgeClosedAtsJobs.ts --apply
 *   npx tsx src/scripts/purgeClosedAtsJobs.ts --skip=greenhouse --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { createClient } from '@supabase/supabase-js';
import {
  ATS_URL_LIKE,
  fetchLiveJobIds,
  normalizeJobId,
  parseAtsJobUrl,
  type AtsProvider,
} from '../lib/closedAtsBoards';

const APPLY = process.argv.includes('--apply');
const skipArg = process.argv.find((a) => a.startsWith('--skip='));
const onlyArg = process.argv.find((a) => a.startsWith('--only='));

export type ClosedAtsSweepOptions = {
  apply: boolean;
  skip?: string[];
  only?: string[];
};

function parseCsvFlag(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type JobRow = { id: number; company_id: string | null; title: string; url: string | null };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchJobsByLike(table: 'jobs' | 'jobs_IR', like: string): Promise<JobRow[]> {
  const rows: JobRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table)
      .select('id, company_id, title, url')
      .ilike('url', like)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as JobRow[]));
    if (data.length < 1000) break;
  }
  return rows;
}

async function loadWorkableTokensByCompany(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await sb
    .from('companies')
    .select('id, ats_provider, ats_board_token')
    .ilike('ats_provider', 'workable');
  if (error) throw error;
  for (const row of data || []) {
    const token = String(row.ats_board_token || '')
      .trim()
      .replace(/^https?:\/\/(?:apply\.)?workable\.com\//i, '')
      .replace(/\/+$/, '')
      .split(/[/?#]/)[0];
    if (!token) continue;
    map.set(String(row.id), token);
  }
  return map;
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

type ClosedRow = { id: number; title: string; provider: AtsProvider; board: string; jobId: string };

async function sweepTable(
  table: 'jobs' | 'jobs_IR',
  workableByCompany: Map<string, string>,
  skip: Set<string>,
  only: Set<string>,
): Promise<{ scanned: number; boards: number; closed: ClosedRow[]; skipped: string[] }> {
  const closed: ClosedRow[] = [];
  const skipped: string[] = [];
  let scanned = 0;
  let boards = 0;
  const limit = pLimit(8);
  const providers = (Object.keys(ATS_URL_LIKE) as AtsProvider[]).filter((p) => {
    if (skip.has(p)) return false;
    if (only.size && !only.has(p)) return false;
    return true;
  });

  for (const provider of providers) {
    const part = await fetchJobsByLike(table, ATS_URL_LIKE[provider]);
    scanned += part.length;
    const groups = new Map<string, Array<JobRow & { jobId: string }>>();
    for (const row of part) {
      const parsed = parseAtsJobUrl(String(row.url || ''));
      if (!parsed || parsed.provider !== provider) continue;
      let board = parsed.board;
      if (provider === 'workable' && !board) {
        const token = workableByCompany.get(String(row.company_id || ''));
        if (!token) continue;
        board = token.toLowerCase();
      }
      if (!board) continue;
      const list = groups.get(board) || [];
      list.push({ ...row, jobId: parsed.jobId });
      groups.set(board, list);
    }
    boards += groups.size;
    console.log(`[${table}] ${provider}: ${part.length} urls, ${groups.size} boards`);
    let done = 0;
    await Promise.all(
      [...groups.entries()].map(([board, list]) =>
        limit(async () => {
          const needed = new Set(list.map((row) => normalizeJobId(row.jobId)));
          const live = await fetchLiveJobIds(provider, board, needed);
          done += 1;
          if (done % 25 === 0 || done === groups.size) {
            console.log(`[${table}] ${provider}: probed ${done}/${groups.size}`);
          }
          if (!live) {
            skipped.push(`${provider}::${board}`);
            return;
          }
          // Empty live payloads are often a bad slug / empty API, not a fully closed board.
          if (live.size === 0 && list.length >= 8 && provider !== 'smartrecruiters') {
            skipped.push(`${provider}::${board}:empty-live`);
            return;
          }
          const liveNorm = new Set([...live].map(normalizeJobId));
          for (const row of list) {
            if (!liveNorm.has(normalizeJobId(row.jobId))) {
              closed.push({
                id: row.id,
                title: row.title,
                provider,
                board,
                jobId: row.jobId,
              });
            }
          }
        }),
      ),
    );
  }

  return { scanned, boards, closed, skipped };
}

export async function runClosedAtsSweep(
  applyOrOpts: boolean | ClosedAtsSweepOptions,
): Promise<{ jobs: number; jobs_IR: number }> {
  const opts: ClosedAtsSweepOptions =
    typeof applyOrOpts === 'boolean' ? { apply: applyOrOpts } : applyOrOpts;
  const skip = new Set(opts.skip || parseCsvFlag(skipArg?.slice('--skip='.length)));
  const only = new Set(opts.only || parseCsvFlag(onlyArg?.slice('--only='.length)));
  const apply = opts.apply;
  console.log(`closed ATS sweep apply=${apply} skip=${[...skip].join(',') || '(none)'} only=${[...only].join(',') || '(all)'}`);
  const workableByCompany = await loadWorkableTokensByCompany();
  console.log(`workable company tokens: ${workableByCompany.size}`);
  const uk = await sweepTable('jobs', workableByCompany, skip, only);
  const ie = await sweepTable('jobs_IR', workableByCompany, skip, only);
  const byProvider = (rows: ClosedRow[]) => {
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.provider] = (counts[row.provider] || 0) + 1;
    return counts;
  };
  console.log(
    JSON.stringify(
      {
        apply,
        skip: [...skip],
        jobs: {
          scanned: uk.scanned,
          boards: uk.boards,
          closed: uk.closed.length,
          byProvider: byProvider(uk.closed),
          samples: uk.closed.slice(0, 20),
        },
        jobs_IR: {
          scanned: ie.scanned,
          boards: ie.boards,
          closed: ie.closed.length,
          byProvider: byProvider(ie.closed),
          samples: ie.closed.slice(0, 10),
        },
        skippedBoards: [...new Set([...uk.skipped, ...ie.skipped])].slice(0, 40),
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
  runClosedAtsSweep(APPLY).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
