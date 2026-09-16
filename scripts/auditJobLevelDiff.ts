/**
 * Audit: old Mid-level-fallback title rules vs new confident cascade
 * on every row in jobs (+ jobs_IR).
 *
 *   npx tsx scripts/auditJobLevelDiff.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import { mapLegacyJobLevel } from '../src/lib/levelConfig';
import { resolveJobLevelRulesOnly } from '../src/lib/resolveJobLevel';
import type { AllowedJobLevel } from '../src/lib/inferJobLevel';

/** Previous approach (pre-cascade): keyword tiers + Mid-level default, collapsed to 4. */
function oldInferJobLevel(title: string): AllowedJobLevel | null {
  if (!title) return null;
  const t = title.toLowerCase();
  let level: string;

  if (/\b(chief|cto|ceo|cfo|coo|cpo|president|managing director|md)\b/.test(t)) {
    level = 'Executive';
  } else if (/\bvp\b|vice president/.test(t)) {
    level = 'VP';
  } else if (/\bdirector\b/.test(t) || /\bhead of\b/.test(t)) {
    level = 'Director';
  } else if (/\bprincipal\b/.test(t)) {
    level = 'Principal';
  } else if (/\b(senior|sr\.?)\b/.test(t)) {
    level = 'Senior';
  } else if (
    /\blead\b/.test(t) ||
    (/\b(software|engineering) managers?\b/.test(t) && !/\bassistant managers?\b/.test(t))
  ) {
    level = 'Lead';
  } else if (
    /\b(deli|floor|kitchen|waiting|bar|shop|store|retail|sales|warehouse|support)\s+staff\b/.test(t) ||
    /\bstaff\s*\([^)]*(full|part)\s*time/.test(t)
  ) {
    level = 'Junior';
  } else if (/\bstaff\b/.test(t)) {
    level = 'Staff';
  } else if (/\b(intern|internship|placement|apprentice|apprenticeship)\b/.test(t)) {
    level = 'Internship';
  } else if (/\b(graduate|entry.?level|early career|new grad|grad scheme|graduate scheme)\b/.test(t)) {
    level = 'Graduate';
  } else if (/\b(junior|jr\.?)\b/.test(t)) {
    level = 'Junior';
  } else if (
    /\b(care assistant|healthcare assistant|\bhca\b|support worker|care worker|\bcarer\b|home care)\b/.test(t) ||
    /\b(kitchen assistant|kitchen porter|catering assistant|dishwasher|commis chef|deli assistant)\b/.test(t) ||
    /\b(cashier|sales assistant|shop assistant|store assistant|retail assistant|team member)\b/.test(t) ||
    /\b(sales associate|retail associate|store associate|fragrance associate|warehouse associate)\b/.test(t) ||
    /\b(waiter|waitress|waiting staff|barista|bartender|bar staff|room attendant|housekeep|cleaner|chambermaid)\b/.test(t) ||
    /\b(warehouse operative|order picker|picker\s*[/&]?\s*packer|\bpacker\b)\b/.test(t) ||
    /\b(security guard|security officer|delivery driver|van driver)\b/.test(t)
  ) {
    level = 'Junior';
  } else {
    level = 'Mid-level';
  }
  return mapLegacyJobLevel(level);
}

type Row = {
  id: number;
  title: string;
  description: string | null;
  level: string | null;
  url: string;
};

async function fetchAll(table: 'jobs' | 'jobs_IR'): Promise<Row[]> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const out: Row[] = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('id,title,description,level,url')
      .order('id', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as Row[]));
    if (data.length < page) break;
    from += page;
  }
  return out;
}

function auditTable(name: string, rows: Row[]) {
  let same = 0;
  let changed = 0;
  let oldMidNowNull = 0;
  let newNull = 0;
  let newAssigned = 0;
  let dbMatchesNew = 0;
  let dbDiffersNew = 0;

  const byTransition = new Map<string, number>();
  const byNewSource = new Map<string, number>();
  const changedSamples: any[] = [];
  const suspiciousNew: any[] = []; // rare: new assigned something different from old non-mid

  for (const row of rows) {
    const oldL = oldInferJobLevel(row.title);
    const resolved = resolveJobLevelRulesOnly({
      title: row.title,
      description: row.description,
    });
    const newL = resolved.level;
    const src = resolved.source;
    byNewSource.set(src, (byNewSource.get(src) || 0) + 1);

    if (newL == null) newNull++;
    else newAssigned++;

    const key = `${oldL ?? 'null'}→${newL ?? 'null'}`;
    byTransition.set(key, (byTransition.get(key) || 0) + 1);

    if (oldL === newL) same++;
    else {
      changed++;
      if (oldL === 'Mid Level' && newL == null) oldMidNowNull++;
      if (changedSamples.length < 25) {
        changedSamples.push({
          id: row.id,
          title: row.title,
          old: oldL,
          new: newL,
          source: src,
          db_level: row.level,
        });
      }
      if (oldL && oldL !== 'Mid Level' && newL && oldL !== newL) {
        if (suspiciousNew.length < 20) {
          suspiciousNew.push({
            id: row.id,
            title: row.title,
            old: oldL,
            new: newL,
            source: src,
          });
        }
      }
    }

    const db = row.level || null;
    if (db === newL) dbMatchesNew++;
    else dbDiffersNew++;
  }

  const transitions = [...byTransition.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ transition: k, count: n }));

  const sources = [...byNewSource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ source: k, count: n }));

  return {
    table: name,
    total: rows.length,
    same_old_vs_new: same,
    changed_old_vs_new: changed,
    old_mid_now_manual_review_null: oldMidNowNull,
    new_assigned: newAssigned,
    new_null_manual_review: newNull,
    pct_new_assigned: rows.length ? Math.round((newAssigned / rows.length) * 1000) / 10 : 0,
    pct_manual_review: rows.length ? Math.round((newNull / rows.length) * 1000) / 10 : 0,
    db_level_matches_new_logic: dbMatchesNew,
    db_level_differs_from_new_logic: dbDiffersNew,
    note:
      'DB still has OLD stored levels until you re-sync/backfill. "new_*" = recomputed with cascade.',
    top_transitions: transitions.slice(0, 20),
    sources,
    changed_samples: changedSamples,
    keyword_disagreements: suspiciousNew,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  console.log('target', new URL(url).host);

  const uk = await fetchAll('jobs');
  const ie = await fetchAll('jobs_IR');
  console.log(
    JSON.stringify(
      {
        jobs: auditTable('jobs', uk),
        jobs_IR: auditTable('jobs_IR', ie),
        combined_total: uk.length + ie.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
