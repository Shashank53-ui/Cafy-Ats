/**
 * Export all assigned levels (exclude manual_review) for human/knowledge audit.
 *   npx tsx scripts/exportAssignedLevelsForAudit.ts
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

function normTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Knowledge heuristics: title signals that conflict with assigned 4-level. */
function knowledgeFlags(title: string, level: string): string[] {
  const t = title.toLowerCase();
  const flags: string[] = [];

  const has = (re: RegExp) => re.test(t);

  if (
    has(/\b(intern|internship|apprentice|placement student|vacation scheme|graduate scheme|grad scheme|new grad|early career)\b/) &&
    level !== 'Entry Level'
  ) {
    flags.push('title_suggests_Entry_Level');
  }
  if (has(/\b(junior|jr\.?)\b/) && !has(/\b(senior|sr\.?)\b/) && level !== 'Junior') {
    flags.push('title_suggests_Junior');
  }
  if (
    has(/\b(senior|sr\.?|snr|principal|staff engineer|director|head of|vice president|\bvp\b|cto|ceo|cfo|coo)\b/) &&
    level !== 'Senior'
  ) {
    if (!has(/\bstaff nurse\b/) && !has(/\blead generation\b/) && !has(/\bexecutive assistant\b/)) {
      flags.push('title_suggests_Senior');
    }
  }
  if (has(/\bstaff nurse\b/) && level !== 'Mid Level' && level !== 'Senior') {
    flags.push('Staff_Nurse_should_be_Mid_or_Senior_not_' + level);
  }
  if (has(/\barchitects?\b/) && level !== 'Senior' && !has(/\b(intern|graduate|junior)\b/)) {
    flags.push('Architect_should_be_Senior');
  }

  if (level === 'Mid Level' && has(/\b(intern|junior|graduate|senior|principal|director|vp|chief|staff engineer|architect)\b/)) {
    flags.push('Mid_with_conflicting_seniority_word');
  }
  if (level === 'Junior' && has(/\b(senior|principal|director|vp|chief|staff engineer)\b/) && !has(/\bstaff nurse\b/)) {
    flags.push('Junior_with_senior_title_words');
  }

  // Known traps
  if (has(/\bexecutive assistant\b/) && level === 'Senior') {
    flags.push('Executive_Assistant_not_Senior');
  }
  if (has(/\blead generation\b/) && level === 'Senior') {
    flags.push('Lead_Generation_not_Senior');
  }
  if (has(/\bassistant manager\b/) && level === 'Senior' && !has(/\b(senior|head of|director)\b/)) {
    flags.push('Assistant_Manager_often_not_Senior');
  }

  return flags;
}

async function main() {
  const rows = [...(await fetchAssigned('jobs')), ...(await fetchAssigned('jobs_IR'))];
  console.log('assigned_rows', rows.length);

  const bySource: Record<string, number> = {};
  const byLevel: Record<string, number> = {};
  for (const r of rows) {
    bySource[r.level_source] = (bySource[r.level_source] || 0) + 1;
    byLevel[r.level] = (byLevel[r.level] || 0) + 1;
  }

  // Unique title → level (collapse volume)
  const unique = new Map<string, { title: string; level: string; level_source: string; count: number; sample_ids: number[] }>();
  for (const r of rows) {
    const key = `${normTitle(r.title)}||${r.level}||${r.level_source.split(':')[0]}`;
    const cur = unique.get(key);
    if (!cur) {
      unique.set(key, {
        title: r.title,
        level: r.level,
        level_source: r.level_source,
        count: 1,
        sample_ids: [r.id],
      });
    } else {
      cur.count++;
      if (cur.sample_ids.length < 3) cur.sample_ids.push(r.id);
    }
  }

  const flagged: any[] = [];
  const okUnique: any[] = [];
  for (const u of unique.values()) {
    const flags = knowledgeFlags(u.title, u.level);
    const item = { ...u, flags };
    if (flags.length) flagged.push(item);
    else okUnique.push(item);
  }

  flagged.sort((a, b) => b.count - a.count);
  const embeddingRows = rows.filter((r) => r.level_source.startsWith('embedding:'));
  const embeddingFlagged = flagged.filter((f) => String(f.level_source).startsWith('embedding'));

  const logDir = path.resolve('logs');
  fs.mkdirSync(logDir, { recursive: true });
  const out = {
    assigned_rows: rows.length,
    unique_title_level_pairs: unique.size,
    byLevel,
    bySourceTop: Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([source, count]) => ({ source, count })),
    knowledge_flagged_unique: flagged.length,
    knowledge_flagged_job_rows_est: flagged.reduce((s, f) => s + f.count, 0),
    embedding_assigned_rows: embeddingRows.length,
    embedding_flagged_unique: embeddingFlagged.length,
    flagged_samples: flagged.slice(0, 200),
    all_embedding_unique: [...unique.values()]
      .filter((u) => u.level_source.startsWith('embedding:'))
      .sort((a, b) => a.level.localeCompare(b.level) || a.title.localeCompare(b.title)),
  };
  fs.writeFileSync(path.join(logDir, 'assigned_level_knowledge_audit.json'), JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        assigned_rows: out.assigned_rows,
        unique_pairs: out.unique_title_level_pairs,
        knowledge_flagged_unique: out.knowledge_flagged_unique,
        knowledge_flagged_job_rows_est: out.knowledge_flagged_job_rows_est,
        embedding_assigned_rows: out.embedding_assigned_rows,
        embedding_flagged_unique: out.embedding_flagged_unique,
        byLevel: out.byLevel,
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
