/**
 * Apply high-confidence knowledge-audit level fixes to production.
 * Reads logs/knowledge_level_fix_candidates.csv (high confidence + safe notes only).
 *
 *   npx tsx scripts/_tmpApplyKnowledgeLevelFixes.ts
 *   npx tsx scripts/_tmpApplyKnowledgeLevelFixes.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

/** Notes we trust enough to bulk-apply without row-level context. */
const SAFE_NOTES = new Set([
  'advisor_junior',
  'frontline_junior',
  'frontline_leader_junior',
  'frontline_supervisor_junior',
  'clinical_leader_mid',
  'professional_leader_mid',
  'professional_leader_senior',
  'uk_functional_executive',
  'associate_frontline',
  'kitchen_junior',
  'chef_mid',
  'executive_assistant',
]);

function norm(t: string): string {
  return String(t || '')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** School/youth activity leaders are frontline Junior, not professional Mid. */
function isSchoolActivityLeader(normTitle: string): boolean {
  return (
    /\b(activity|after[\s-]?school|breakfast club|holiday club|nursery activity)\b/.test(normTitle) &&
    /\bleaders?\b/.test(normTitle)
  );
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      cols.push(cur);
      cur = '';
    } else cur += ch;
  }
  cols.push(cur);
  return cols;
}

type Fix = {
  normTitle: string;
  from: string;
  to: string;
  note: string;
  jobCount: number;
};

async function main() {
  const csvPath = path.join('logs', 'knowledge_level_fix_candidates.csv');
  if (!fs.existsSync(csvPath)) throw new Error('Run scripts/_tmpKnowledgeAuditLevels.ts first');

  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  const fixes: Fix[] = [];
  for (const line of lines) {
    const [normTitle, jobCount, from, to, confidence, note] = parseCsvLine(line);
    if (confidence !== 'high' || !SAFE_NOTES.has(note)) continue;
    if (note === 'professional_leader_mid' && isSchoolActivityLeader(normTitle)) continue;
    fixes.push({
      normTitle,
      from,
      to,
      note,
      jobCount: Number(jobCount),
    });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    fix_titles: fixes.length,
    expected_jobs: fixes.reduce((s, f) => s + f.jobCount, 0),
    by_note: {} as Record<string, number>,
    by_direction: {} as Record<string, number>,
    updated: 0,
    skipped_wrong_level: 0,
    samples: [] as { table: string; id: number; title: string; from: string; to: string; note: string }[],
  };

  for (const f of fixes) {
    summary.by_note[f.note] = (summary.by_note[f.note] || 0) + f.jobCount;
    const dir = `${f.from} -> ${f.to}`;
    summary.by_direction[dir] = (summary.by_direction[dir] || 0) + f.jobCount;
  }

  for (const table of ['jobs', 'jobs_IR'] as const) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from(table)
        .select('id,title,level')
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      if (!data?.length) break;

      for (const row of data) {
        const title = String(row.title || '');
        const key = norm(title);
        const fix = fixes.find((f) => f.normTitle === key);
        if (!fix) continue;
        const stored = row.level || '';
        if (stored !== fix.from) {
          summary.skipped_wrong_level++;
          continue;
        }
        if (summary.samples.length < 30) {
          summary.samples.push({
            table,
            id: Number(row.id),
            title: title.slice(0, 100),
            from: stored,
            to: fix.to,
            note: fix.note,
          });
        }
        if (APPLY) {
          const { error: upErr } = await sb
            .from(table)
            .update({ level: fix.to, level_source: `knowledge_audit:${fix.note}` })
            .eq('id', row.id);
          if (upErr && /level_source/i.test(upErr.message)) {
            const alt = await sb.from(table).update({ level: fix.to }).eq('id', row.id);
            if (alt.error) throw alt.error;
          } else if (upErr) {
            throw upErr;
          }
        }
        summary.updated++;
      }

      if (data.length < 1000) break;
    }
  }

  fs.writeFileSync(path.join('logs', 'knowledge_level_apply_summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
