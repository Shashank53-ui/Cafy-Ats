/**
 * Strip "Join Our Talent Pool" marketing from stored titles.
 * Deletes rows that become empty / junk after sanitize.
 *
 *   npx tsx src/scripts/cleanTalentPoolTitles.ts
 *   npx tsx src/scripts/cleanTalentPoolTitles.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
import { createClient } from '@supabase/supabase-js';
import { isUnusableJobTitle, sanitizeJobTitle } from '../lib/sanitizeJobTitle';
import { getJobTitleRejectReason } from './syncAll';

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchTalentPool(table: 'jobs' | 'jobs_IR') {
  const rows: Array<{ id: number; title: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table)
      .select('id, title')
      .or(
        'title.ilike.%talent%pool%,title.ilike.%talent%community%,title.ilike.%talent%network%,title.ilike.%talent%pipeline%',
      )
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < 1000) break;
  }
  return rows;
}

async function deleteIds(table: 'jobs' | 'jobs_IR', ids: number[]) {
  if (table === 'jobs') {
    for (const part of chunk(ids, 200)) {
      await sb.from('applications').delete().in('job_id', part);
    }
  }
  for (const part of chunk(ids, 200)) {
    const { error } = await sb.from(table).delete().in('id', part);
    if (error) throw error;
  }
}

async function main() {
  const out: any = { apply: APPLY };
  for (const table of ['jobs', 'jobs_IR'] as const) {
    const rows = await fetchTalentPool(table);
    const updates: Array<{ id: number; from: string; to: string }> = [];
    const deletes: Array<{ id: number; title: string }> = [];
    for (const r of rows) {
      const next = sanitizeJobTitle(r.title);
      if (isUnusableJobTitle(r.title) || getJobTitleRejectReason(next) !== null) {
        deletes.push({ id: r.id, title: r.title });
        continue;
      }
      if (next !== r.title) updates.push({ id: r.id, from: r.title, to: next });
    }
    out[table] = {
      scanned: rows.length,
      update: updates.length,
      delete: deletes.length,
      updateSamples: updates.slice(0, 15).map((u) => `${u.from} → ${u.to}`),
      deleteSamples: deletes.slice(0, 10).map((d) => d.title),
    };
    if (!APPLY) continue;
    for (const u of updates) {
      const { error } = await sb.from(table).update({ title: u.to }).eq('id', u.id);
      if (error) throw error;
    }
    if (deletes.length) await deleteIds(table, deletes.map((d) => d.id));
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
