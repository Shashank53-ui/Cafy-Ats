/**
 * Per-row knowledge audit of every assigned level (excludes manual_review).
 * Verdict is based on title meaning — against the 4-level taxonomy.
 *
 *   npx tsx scripts/knowledgeAuditEveryAssignedLevel.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

type Row = {
  table: string;
  id: number;
  title: string;
  level: string;
  level_source: string;
};

type Verdict = 'ok' | 'wrong' | 'ambiguous' | 'inconsistent_source';

function norm(t: string): string {
  return String(t || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Expected level(s) from title wording alone (human knowledge, 4-level). */
function expectedFromTitle(title: string): {
  expected: string[] | null;
  notes: string[];
} {
  const t = norm(title);

  if (/\b(interns?|internships?|apprentices?|apprenticeships?|vacation schemes?)\b/.test(t)) {
    return { expected: ['Entry Level'], notes: ['title has intern/apprentice'] };
  }
  if (
    /\bplacements?\b/.test(t) &&
    /\b(months?|weeks?|scheme|programmes?|programs?|student|industrial|work|graduate)\b/.test(t)
  ) {
    return { expected: ['Entry Level'], notes: ['training placement'] };
  }

  if (/\b(seniors?|snr\.?|sr\.?)\b/.test(t) && /\bstaff\s+nurses?\b/.test(t)) {
    return { expected: ['Senior'], notes: ['Senior Staff Nurse'] };
  }
  if (/\bstaff\s+(nurses?|midwives|midwife|accountants?)\b/.test(t)) {
    return { expected: ['Mid Level'], notes: ['Staff Nurse/Accountant → Mid'] };
  }

  if (/\bmid[\s-]?level\b/.test(t) && /\b(seniors?|snr\.?|sr\.?)\b/.test(t)) {
    return { expected: ['Senior'], notes: ['mid-to-senior band → Senior'] };
  }
  if (/\b(juniors?|jr\.?)\b/.test(t) && /\bmid[\s-]?level\b/.test(t)) {
    return { expected: ['Junior'], notes: ['junior–mid band → Junior'] };
  }

  if (/\b(juniors?|jr\.?)\b/.test(t) && /\b(chief|cto|ceo|cfo|coo|cpo|ciso|president)\b/.test(t)) {
    return { expected: ['Junior'], notes: ['Junior + C-suite token → Junior'] };
  }

  if (/\bexecutive assistants?\b/.test(t)) {
    return { expected: null, notes: ['EA — should stay unassigned / not Senior'] };
  }

  if (
    /\b(account|sales|hr|marketing|recruitment)\s+executives?\b/.test(t)
  ) {
    return { expected: ['Junior'], notes: ['functional executive → Junior'] };
  }

  if (/\bassociate directors?\b/.test(t)) {
    return { expected: ['Senior'], notes: ['Associate Director → Senior'] };
  }
  if (/\bassistant managers?\b/.test(t)) {
    return { expected: ['Mid Level'], notes: ['Assistant Manager → Mid'] };
  }
  if (/\b(shift|sales)\s+leads?\b/.test(t)) {
    return { expected: ['Junior'], notes: ['Shift/Sales Lead → Junior'] };
  }
  if (/\bchief of staff\b/.test(t)) {
    return { expected: ['Senior'], notes: ['Chief of Staff → Senior'] };
  }

  if (
    /\b(solutions?|software|enterprise|cloud|security|data|technical|platform)\s+architects?\b/.test(t)
  ) {
    return { expected: ['Senior'], notes: ['Architect → Senior'] };
  }

  if (
    /\b(cto|ceo|cfo|coo|cpo|ciso)\b/.test(t) ||
    /\bmanaging directors?\b/.test(t) ||
    /\bvice presidents?\b/.test(t) ||
    /\b(avp|svp|evp)\b/.test(t) ||
    /(^|[^a-z])vp([^a-z]|$)/.test(t) ||
    /\bhead of\b/.test(t) ||
    (/\bdirectors?\b/.test(t) && !/\bassistant directors?\b/.test(t)) ||
    /\bprincipals?\b/.test(t) ||
    /\b(seniors?|snr\.?|sr\.?)\b/.test(t) ||
    (/\bstaff\b/.test(t) &&
      !/\b(deli|floor|kitchen|waiting|bar|shop|store|retail|sales|warehouse|support)\s+staff\b/.test(t)) ||
    (/\bleads?\b/.test(t) && !/\blead\s*gen/.test(t) && !/\b(shift|sales)\s+leads?\b/.test(t)) ||
    (/\b(software|engineering) managers?\b/.test(t) && !/\bassistant managers?\b/.test(t))
  ) {
    return { expected: ['Senior'], notes: ['seniority / leadership → Senior'] };
  }

  if (/\b(graduates?|entry[\s-]?level|early careers?|new grads?|grad schemes?|trainees?)\b/.test(t)) {
    return { expected: ['Entry Level'], notes: ['Graduate / entry'] };
  }

  if (/\b(juniors?|jr\.?)\b/.test(t)) {
    return { expected: ['Junior'], notes: ['Junior'] };
  }

  if (/\b(mid[\s-]?level|intermediate)\b/.test(t)) {
    return { expected: ['Mid Level'], notes: ['explicit Mid'] };
  }

  if (
    /\b(care assistants?|healthcare assistants?|sales assistants?|retail assistants?|baristas?|warehouse operatives?|kitchen porters?|support workers?)\b/.test(
      t,
    )
  ) {
    return { expected: ['Junior'], notes: ['frontline junior'] };
  }

  // Unmarked professional — no strong expectation (must not force Mid)
  return { expected: null, notes: ['no strong seniority words — unassigned ok'] };
}

function sourceImpliesLevel(source: string): string | null {
  const s = String(source || '');
  const m = s.match(/embedding:(?:exact|multi):(.+)$/);
  if (!m) return null;
  const slug = m[1]!;
  if (slug === 'entry_level' || slug === 'entry-level') return 'Entry Level';
  if (slug === 'mid_level' || slug === 'mid-level') return 'Mid Level';
  if (slug === 'junior') return 'Junior';
  if (slug === 'senior') return 'Senior';
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function judge(row: Row): { verdict: Verdict; reason: string; expected: string[] | null } {
  const { expected, notes } = expectedFromTitle(row.title);
  const implied = sourceImpliesLevel(row.level_source);
  if (implied && implied !== row.level) {
    return {
      verdict: 'inconsistent_source',
      reason: `level_source says ${row.level_source} but level=${row.level}`,
      expected: [implied],
    };
  }

  if (!expected) {
    if (/executive assistant/i.test(row.title) && row.level === 'Senior') {
      return { verdict: 'wrong', reason: 'Executive Assistant is not Senior', expected: null };
    }
    return { verdict: 'ok', reason: notes.join('; ') || 'no strong title signal', expected: null };
  }

  if (expected.includes(row.level)) {
    return { verdict: 'ok', reason: notes.join('; '), expected };
  }

  if (expected.length > 1) {
    return {
      verdict: 'ambiguous',
      reason: `got ${row.level}; acceptable ${expected.join('|')} — ${notes.join('; ')}`,
      expected,
    };
  }

  return {
    verdict: 'wrong',
    reason: `got ${row.level}; expected ${expected.join('|')} — ${notes.join('; ')}`,
    expected,
  };
}

async function fetchAssigned(table: 'jobs' | 'jobs_IR'): Promise<Row[]> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const out: Row[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('id,title,level,level_source')
      .not('level', 'is', null)
      .neq('level_source', 'manual_review')
      .order('id')
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      out.push({
        table,
        id: Number(r.id),
        title: String(r.title || ''),
        level: String(r.level || ''),
        level_source: String(r.level_source || ''),
      });
    }
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function main() {
  const rows = [...(await fetchAssigned('jobs')), ...(await fetchAssigned('jobs_IR'))];
  console.log('auditing_rows', rows.length);

  const judged = rows.map((r) => {
    const j = judge(r);
    return { ...r, ...j };
  });

  const counts = { ok: 0, wrong: 0, ambiguous: 0, inconsistent_source: 0 };
  for (const j of judged) counts[j.verdict]++;

  const wrong = judged.filter((j) => j.verdict === 'wrong' || j.verdict === 'inconsistent_source');
  const ambiguous = judged.filter((j) => j.verdict === 'ambiguous');

  const logDir = path.resolve('logs');
  fs.mkdirSync(logDir, { recursive: true });

  const csvPath = path.join(logDir, 'knowledge_audit_every_assigned.csv');
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [
    'table,id,title,level,level_source,verdict,expected,reason',
    ...judged.map((j) =>
      [
        j.table,
        j.id,
        esc(j.title),
        esc(j.level),
        esc(j.level_source),
        j.verdict,
        esc((j.expected || []).join('|')),
        esc(j.reason),
      ].join(','),
    ),
  ];
  fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');

  const jsonPath = path.join(logDir, 'knowledge_audit_every_assigned_summary.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        total_audited: judged.length,
        counts,
        pct_ok: judged.length ? Math.round((counts.ok / judged.length) * 1000) / 10 : 0,
        wrong_and_inconsistent: wrong.slice(0, 500).map((w) => ({
          table: w.table,
          id: w.id,
          title: w.title,
          level: w.level,
          level_source: w.level_source,
          expected: w.expected,
          reason: w.reason,
          verdict: w.verdict,
        })),
        ambiguous: ambiguous.slice(0, 200).map((w) => ({
          table: w.table,
          id: w.id,
          title: w.title,
          level: w.level,
          level_source: w.level_source,
          expected: w.expected,
          reason: w.reason,
        })),
        csv: csvPath,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        total_audited: judged.length,
        counts,
        pct_ok: judged.length ? Math.round((counts.ok / judged.length) * 1000) / 10 : 0,
        wrong_count: wrong.length,
        ambiguous_count: ambiguous.length,
        csv: csvPath,
        summary_json: jsonPath,
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
