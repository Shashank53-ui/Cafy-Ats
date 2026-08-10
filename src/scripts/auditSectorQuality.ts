/**
 * Read-only audit: sector/department classification quality on jobs / jobs_IR.
 * Mirrors auditLocationQuality.ts but for inferJobSector() instead of isUKJob().
 *
 * Flags three distinct problems:
 *   1. Drift    — stored `sector` disagrees with what inferJobSector() would
 *                 produce today (rules changed since the row was last synced/backfilled).
 *   2. Ambiguity — more than one RULES entry matches the same title, so the
 *                 outcome silently depends on rule order. Order-dependence is
 *                 the main fragility risk in a keyword classifier like this.
 *   3. Catch-all / thin buckets — samples from sectors that are either a
 *                 generic fallback (Other, Engineering (Other), Business & Strategy)
 *                 or have very low volume, for manual eyeballing.
 *
 * Run: npx tsx src/scripts/auditSectorQuality.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import { inferJobSector, RULES } from '../lib/inferJobSector';
import { ALLOWED_SECTORS } from '../lib/constants';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type JobRow = {
  id: number | string;
  title: string | null;
  department: string | null;
  sector: string | null;
  company_id: number | string | null;
  last_seen_at: string | null;
};

type CompanyRow = { id: number | string; company_sector: string | null };

// Generic buckets that absorb anything the specific rules didn't recognise —
// worth spot-checking more than the rest since misfires here are invisible
// in aggregate coverage stats.
const CATCH_ALL_SECTORS = new Set(['Other', 'Engineering (Other)', 'Business & Strategy']);

const THIN_SHARE_PCT = 3; // sectors under this % of total volume get sampled too

function pct(n: number, total: number) {
  if (!total) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

function topN(map: Map<string, number>, n: number) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function pageAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/** All RULES entries that match `text`, not just the first (order-blind view). */
function allMatchingSectors(text: string): { sector: string; ruleIndex: number }[] {
  const out: { sector: string; ruleIndex: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < RULES.length; i++) {
    const [regex, sector] = RULES[i];
    if (regex.test(text) && !seen.has(sector)) {
      seen.add(sector);
      out.push({ sector, ruleIndex: i });
    }
  }
  return out;
}

function auditDrift(rows: JobRow[], companySectorById: Map<string, string | null>) {
  const drifted: (JobRow & { fresh: string })[] = [];
  for (const r of rows) {
    const companySector = companySectorById.get(String(r.company_id)) ?? null;
    const fresh = inferJobSector(r.title || '', r.department, companySector) || 'Other';
    const stored = (r.sector || '').trim() || 'Other';
    if (fresh !== stored) drifted.push({ ...r, fresh });
  }
  return drifted;
}

function auditAmbiguity(rows: JobRow[]) {
  // Ambiguous: title text alone matches >1 distinct sector rule. Department is
  // excluded here — it's usually blank, and when present it's checked first
  // and short-circuits before title matching in inferJobSector anyway.
  const ambiguous: (JobRow & { candidates: string[] })[] = [];
  const seenTitles = new Set<string>();
  for (const r of rows) {
    const t = (r.title || '').toLowerCase().trim();
    if (!t || seenTitles.has(t)) continue; // de-dupe identical titles across postings
    seenTitles.add(t);
    const matches = allMatchingSectors(t);
    if (matches.length > 1) {
      ambiguous.push({ ...r, candidates: matches.map((m) => m.sector) });
    }
  }
  return ambiguous;
}

function printSamples(label: string, rows: { id: number | string; title: string | null; department: string | null; sector?: string | null }[], n = 10, extra?: (r: any) => string) {
  console.log(`\n${label} — samples (${Math.min(n, rows.length)} of ${rows.length}):`);
  for (const r of rows.slice(0, n)) {
    const dept = r.department ? ` | dept="${r.department}"` : '';
    const tail = extra ? ` | ${extra(r)}` : '';
    console.log(`  - [${r.id}] ${(r.title || '').slice(0, 70)}${dept}${tail}`);
  }
}

async function main() {
  console.log('Fetching companies, jobs, jobs_IR...');
  const [companies, uk, ir] = await Promise.all([
    pageAll<CompanyRow>('companies', 'id, company_sector'),
    pageAll<JobRow>('jobs', 'id, title, department, sector, company_id, last_seen_at'),
    pageAll<JobRow>('jobs_IR', 'id, title, department, sector, company_id, last_seen_at'),
  ]);
  const companySectorById = new Map(companies.map((c) => [String(c.id), c.company_sector]));
  const allRows = [...uk, ...ir];
  console.log(`UK jobs: ${uk.length} | IR jobs: ${ir.length} | combined: ${allRows.length}`);

  // 1. Drift — stored sector vs a fresh recompute with today's rules.
  const drifted = auditDrift(allRows, companySectorById);
  console.log(`\n======== DRIFT — stored sector vs current inferJobSector() ========`);
  console.log(`drifted: ${drifted.length} (${pct(drifted.length, allRows.length)}) — run backfillJobSectors.ts / reclassifyJobSectors.ts to resync`);
  const driftPairs = new Map<string, number>();
  for (const r of drifted) {
    const key = `${(r.sector || 'Other').trim() || 'Other'} → ${r.fresh}`;
    driftPairs.set(key, (driftPairs.get(key) || 0) + 1);
  }
  console.log('\nTop drift transitions (stored → fresh):');
  for (const [k, v] of topN(driftPairs, 15)) console.log(`  ${v}\t${k}`);
  printSamples(
    'Drift',
    drifted,
    12,
    (r) => `stored="${r.sector || 'Other'}" fresh="${r.fresh}"`
  );

  // 2. Ambiguity — order-dependent rule collisions on title text.
  const ambiguous = auditAmbiguity(allRows);
  console.log(`\n======== AMBIGUITY — titles matching >1 sector rule ========`);
  console.log(`unique ambiguous titles: ${ambiguous.length}`);
  const candidatePairs = new Map<string, number>();
  for (const r of ambiguous) {
    const key = r.candidates.join(' vs ');
    candidatePairs.set(key, (candidatePairs.get(key) || 0) + 1);
  }
  console.log('\nMost common rule collisions (all candidate sectors, first one wins):');
  for (const [k, v] of topN(candidatePairs, 20)) console.log(`  ${v}\t${k}`);
  printSamples('Ambiguous titles', ambiguous, 15, (r) => `candidates=[${r.candidates.join(', ')}]`);

  // 3. Catch-all + thin buckets — spot-check samples, using freshly computed sector.
  const bySector = new Map<string, JobRow[]>();
  for (const r of allRows) {
    const s = (r.sector || 'Other').trim() || 'Other';
    if (!bySector.has(s)) bySector.set(s, []);
    bySector.get(s)!.push(r);
  }
  console.log(`\n======== CATCH-ALL BUCKETS ========`);
  for (const sector of CATCH_ALL_SECTORS) {
    const rows = bySector.get(sector) || [];
    printSamples(`"${sector}"`, rows, 12);
  }

  console.log(`\n======== THIN SECTORS (<${THIN_SHARE_PCT}% share) ========`);
  for (const sector of ALLOWED_SECTORS) {
    const rows = bySector.get(sector) || [];
    const share = (100 * rows.length) / allRows.length;
    if (share < THIN_SHARE_PCT && rows.length > 0) {
      printSamples(`"${sector}" (${share.toFixed(2)}%)`, rows, 8);
    }
  }

  console.log('\n======== PRIORITY SUMMARY ========');
  console.log(
    JSON.stringify(
      {
        total: allRows.length,
        drifted: drifted.length,
        driftShare: pct(drifted.length, allRows.length),
        ambiguousTitles: ambiguous.length,
        catchAllCounts: [...CATCH_ALL_SECTORS].map((s) => ({ sector: s, count: (bySector.get(s) || []).length })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
