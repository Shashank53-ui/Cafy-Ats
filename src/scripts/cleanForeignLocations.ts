/**
 * Delete jobs whose stored location/title/URL is a foreign worksite
 * (Durham NC stored as Durham, California in title, etc.).
 *
 *   npx tsx src/scripts/cleanForeignLocations.ts
 *   npx tsx src/scripts/cleanForeignLocations.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';
import { isForeignLocationLeak } from '../lib/foreignLocationLeak';

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
    rows.push(
      ...(data as { id: number; title: string; location: string | null; url: string | null }[]),
    );
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const samples: Record<string, string[]> = { jobs: [], jobs_IR: [] };
  const counts: Record<string, number> = { jobs: 0, jobs_IR: 0 };

  for (const table of ['jobs', 'jobs_IR'] as const) {
    const market = table === 'jobs_IR' ? 'ireland' : 'uk';
    const rows = await fetchAll(table);
    const ids: number[] = [];
    for (const r of rows) {
      if (
        !isForeignLocationLeak(
          { location: r.location, title: r.title, url: r.url },
          market,
        )
      ) {
        continue;
      }
      ids.push(r.id);
      if (samples[table].length < 25) {
        samples[table].push(`${r.title} | ${r.location} | ${r.url}`);
      }
    }
    counts[table] = ids.length;
    if (apply && ids.length) {
      for (const part of chunk(ids, 200)) {
        const { error } = await sb.from(table).delete().in('id', part);
        if (error) throw error;
      }
    }
  }

  console.log(
    JSON.stringify(
      { apply, counts, samples },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
