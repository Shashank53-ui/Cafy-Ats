/**
 * One-time: remap jobs.level / jobs_IR.level from 11 → 4 buckets,
 * replace CHECK constraints, then optionally re-resolve with the new cascade.
 *
 *   npx tsx scripts/migrateJobLevelsTo4.ts --dry-run
 *   npx tsx scripts/migrateJobLevelsTo4.ts --apply
 *   npx tsx scripts/migrateJobLevelsTo4.ts --apply --repair
 *
 * Prefer applying supabase/migrate_job_levels_to_4.sql in the Supabase SQL editor
 * first if CHECK constraints block updates; this script uses the same CASE map.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mapLegacyJobLevel } from '../src/lib/levelConfig';
import { ALLOWED_JOB_LEVELS } from '../src/lib/constants';
import { getLevelVectorBank } from '../src/lib/classifyLevelByEmbedding';
import { isEmbeddingRuntimeAvailable } from '../src/lib/embedText';
import { resolveJobLevelsBatch } from '../src/lib/resolveJobLevel';

type Sb = SupabaseClient<any, 'public', any>;
type JobsTable = 'jobs' | 'jobs_IR';

async function fetchLevels(sb: Sb, table: JobsTable) {
  const out: { id: number; title: string; description: string | null; level: string | null; level_source: string | null }[] = [];
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
  const repair = process.argv.includes('--repair');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const sb = createClient(url, key, { auth: { persistSession: false } }) as Sb;
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}${repair ? ' +REPAIR' : ''}`);
  console.log(`Target allowlist: ${ALLOWED_JOB_LEVELS.join(' | ')}`);

  const summary: Record<string, unknown> = {};

  for (const table of ['jobs', 'jobs_IR'] as JobsTable[]) {
    const rows = await fetchLevels(sb, table);
    const byFrom: Record<string, number> = {};
    const updates: { id: number; level: string | null }[] = [];

    for (const row of rows) {
      const cur = row.level;
      if (!cur) continue;
      const mapped = mapLegacyJobLevel(cur);
      const next =
        mapped && (ALLOWED_JOB_LEVELS as readonly string[]).includes(mapped)
          ? mapped
          : (ALLOWED_JOB_LEVELS as readonly string[]).includes(cur)
            ? cur
            : null;
      byFrom[`${cur}→${next}`] = (byFrom[`${cur}→${next}`] || 0) + 1;
      if (next !== cur) updates.push({ id: row.id, level: next });
    }

    summary[table] = {
      rows: rows.length,
      wouldRemap: updates.length,
      mapCounts: byFrom,
    };
    console.log(`\n${table}: ${rows.length} rows, ${updates.length} remaps`);
    console.log(JSON.stringify(byFrom, null, 2));

    if (apply && updates.length) {
      // Drop/recreate constraints via RPC is not available — update in batches.
      // If CHECK still has old values, apply supabase/migrate_job_levels_to_4.sql first.
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < updates.length; i += 50) {
        const chunk = updates.slice(i, i + 50);
        await Promise.all(
          chunk.map(async (u) => {
            const { error } = await sb.from(table).update({ level: u.level }).eq('id', u.id);
            if (error) {
              fail++;
              if (fail <= 5) console.error(`  update fail ${table}#${u.id}: ${error.message}`);
            } else ok++;
          }),
        );
        if ((i + 50) % 500 === 0 || i + 50 >= updates.length) {
          console.log(`  ${table} remapped ${Math.min(i + 50, updates.length)}/${updates.length}`);
        }
      }
      (summary[table] as Record<string, unknown>).remappedOk = ok;
      (summary[table] as Record<string, unknown>).remappedFail = fail;
    }

    if (apply && repair) {
      const embOk = await isEmbeddingRuntimeAvailable();
      const levelBank = embOk ? await getLevelVectorBank() : undefined;
      console.log(`  ${table}: re-resolving (embedding=${embOk ? 'on' : 'off'})…`);
      const CHUNK = 1500;
      let changed = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const resolved = await resolveJobLevelsBatch(
          slice.map((r) => ({ title: r.title, description: r.description })),
          { levelBank, skipEmbedding: !embOk },
        );
        for (let j = 0; j < slice.length; j++) {
          const row = slice[j]!;
          const next = resolved[j]!;
          const levelSame = (row.level || null) === (next.level || null);
          // After remap, row.level in memory may be stale — compare to remapped value
          const remapped = row.level ? mapLegacyJobLevel(row.level) ?? row.level : null;
          const levelSame2 = (remapped || null) === (next.level || null);
          const sourceSame = (row.level_source || null) === next.source;
          if (levelSame2 && sourceSame) continue;
          if (levelSame && sourceSame) continue;
          changed++;
          const { error } = await sb
            .from(table)
            .update({ level: next.level, level_source: next.source })
            .eq('id', row.id);
          if (error && changed <= 5) console.error(`  repair fail ${table}#${row.id}: ${error.message}`);
        }
        console.log(`  ${table}: repair progress ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
      }
      (summary[table] as Record<string, unknown>).repairChanged = changed;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log('\nDry-run only. Apply SQL first if needed:');
    console.log('  supabase/migrate_job_levels_to_4.sql');
    console.log('Then: npx tsx scripts/migrateJobLevelsTo4.ts --apply --repair');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
