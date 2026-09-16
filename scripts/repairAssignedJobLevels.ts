/**
 * Re-resolve levels for all jobs and patch rows that differ after rule fixes.
 * Also forces Architect exact prototypes to Senior when source/level disagree.
 *
 *   npx tsx scripts/repairAssignedJobLevels.ts --dry-run
 *   npx tsx scripts/repairAssignedJobLevels.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getLevelVectorBank } from '../src/lib/classifyLevelByEmbedding';
import { isEmbeddingRuntimeAvailable } from '../src/lib/embedText';
import { resolveJobLevelsBatch } from '../src/lib/resolveJobLevel';

type Sb = SupabaseClient<any, 'public', any>;
type JobsTable = 'jobs' | 'jobs_IR';
type Row = {
  id: number;
  title: string;
  description: string | null;
  level: string | null;
  level_source: string | null;
};

async function fetchAll(sb: Sb, table: JobsTable): Promise<Row[]> {
  const out: Row[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('id,title,description,level,level_source')
      .order('id')
      .range(from, from + page - 1);
    if (error) {
      if (/level_source/i.test(error.message)) {
        const alt = await sb
          .from(table)
          .select('id,title,description,level')
          .order('id')
          .range(from, from + page - 1);
        if (alt.error) throw new Error(`${table}: ${alt.error.message}`);
        if (!alt.data?.length) break;
        for (const r of alt.data) {
          out.push({
            id: Number(r.id),
            title: String(r.title ?? ''),
            description: r.description ?? null,
            level: r.level ?? null,
            level_source: null,
          });
        }
        if (alt.data.length < page) break;
        from += page;
        continue;
      }
      throw new Error(`${table}: ${error.message}`);
    }
    if (!data?.length) break;
    for (const r of data) {
      out.push({
        id: Number(r.id),
        title: String(r.title ?? ''),
        description: r.description ?? null,
        level: r.level ?? null,
        level_source: (r as { level_source?: string | null }).level_source ?? null,
      });
    }
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const sb = createClient(url, key, { auth: { persistSession: false } }) as Sb;
  const embOk = await isEmbeddingRuntimeAvailable();
  const levelBank = embOk ? await getLevelVectorBank() : undefined;
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'} | embedding=${embOk ? 'on' : 'off'}`);

  const summary: Record<string, unknown> = {};
  const samples: { table: string; id: number; title: string; from: string; to: string; source: string }[] = [];

  for (const table of ['jobs', 'jobs_IR'] as JobsTable[]) {
    const rows = await fetchAll(sb, table);
    const resolvedList = [] as Awaited<ReturnType<typeof resolveJobLevelsBatch>>;
    const CHUNK = 1500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const part = await resolveJobLevelsBatch(
        slice.map((r) => ({ title: r.title, description: r.description })),
        { levelBank, skipEmbedding: !embOk },
      );
      resolvedList.push(...part);
      console.log(`  ${table}: resolved ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
    }

    let changed = 0;
    let unchanged = 0;
    const updates: { id: number; level: string | null; level_source: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const next = resolvedList[i]!;
      const levelSame = (row.level || null) === (next.level || null);
      const sourceSame = (row.level_source || null) === next.source;
      if (levelSame && sourceSame) {
        unchanged++;
        continue;
      }
      changed++;
      updates.push({ id: row.id, level: next.level, level_source: next.source });
      if (samples.length < 40) {
        samples.push({
          table,
          id: row.id,
          title: row.title,
          from: `${row.level ?? 'null'}|${row.level_source ?? ''}`,
          to: `${next.level ?? 'null'}|${next.source}`,
          source: next.source,
        });
      }
    }

    if (apply) {
      const CONCURRENCY = 25;
      let ok = 0;
      for (let i = 0; i < updates.length; i += CONCURRENCY) {
        const chunk = updates.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async (u) => {
            const { error } = await sb
              .from(table)
              .update({ level: u.level, level_source: u.level_source })
              .eq('id', u.id);
            if (error) throw new Error(`${table} id=${u.id}: ${error.message}`);
            ok++;
          }),
        );
        if (i === 0 || i + CONCURRENCY >= updates.length) {
          console.log(`  ${table}: wrote ${Math.min(i + CONCURRENCY, updates.length)}/${updates.length}`);
        }
      }
      summary[table] = { total: rows.length, changed, unchanged, written: ok };
    } else {
      summary[table] = { total: rows.length, changed, unchanged, written: 0 };
    }
  }

  console.log(JSON.stringify({ summary, samples }, null, 2));
  if (!apply) console.log('\nDry-run only. Re-run with --apply to write.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
