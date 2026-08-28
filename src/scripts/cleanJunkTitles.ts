/**
 * Rewrite scraped junk in jobs.title (View role→, glued US city, FieldDeployed…).
 * Deletes rows whose title sanitizes to empty/junk, or that are US worksites.
 *
 *   npx tsx src/scripts/cleanJunkTitles.ts
 *   npx tsx src/scripts/cleanJunkTitles.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';
import { isForeignLocationLeak } from '../lib/foreignLocationLeak';
import { isUnusableJobTitle, sanitizeJobTitle } from '../lib/sanitizeJobTitle';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAll(table: 'jobs' | 'jobs_IR') {
  const rows: { id: number; title: string; location: string | null; url: string | null }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('id, title, location, url')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const summary: Record<string, { updated: number; deleted: number; samples: string[] }> = {
    jobs: { updated: 0, deleted: 0, samples: [] },
    jobs_IR: { updated: 0, deleted: 0, samples: [] },
  };

  for (const table of ['jobs', 'jobs_IR'] as const) {
    const market = table === 'jobs_IR' ? 'ireland' : 'uk';
    const rows = await fetchAll(table);
    const toUpdate: { id: number; title: string }[] = [];
    const toDelete: number[] = [];
    const deleteSamples: string[] = [];

    for (const r of rows) {
      const next = sanitizeJobTitle(r.title);
      const leak = isForeignLocationLeak(
        { location: r.location, title: next || r.title, url: r.url },
        market,
      );
      if (isUnusableJobTitle(r.title) || leak) {
        toDelete.push(r.id);
        if (deleteSamples.length < 15) {
          deleteSamples.push(`${r.title} | ${r.location}`);
        }
        continue;
      }
      if (next !== r.title) {
        toUpdate.push({ id: r.id, title: next });
        if (summary[table].samples.length < 15) {
          summary[table].samples.push(`${r.title} → ${next}`);
        }
      }
    }

    summary[table].updated = toUpdate.length;
    summary[table].deleted = toDelete.length;
    summary[table].samples = [
      ...deleteSamples.map((s) => `DEL ${s}`),
      ...summary[table].samples,
    ];

    if (apply) {
      for (const part of chunk(toDelete, 200)) {
        const { error } = await sb.from(table).delete().in('id', part);
        if (error) throw error;
      }
      const byTitle = new Map<string, number[]>();
      for (const row of toUpdate) {
        const list = byTitle.get(row.title) || [];
        list.push(row.id);
        byTitle.set(row.title, list);
      }
      for (const [title, ids] of byTitle) {
        for (const part of chunk(ids, 200)) {
          const { error } = await sb.from(table).update({ title }).in('id', part);
          if (error) throw error;
        }
      }
    }
  }

  console.log(JSON.stringify({ apply, summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
