/**
 * backfillJobTypes.ts — Assign jobs.job_type for every catalog row.
 *
 * Priority:
 *   1. Explicit title / employment cues via parseJobType (Part-time, Contract, …)
 *   2. (legacy) level === Internship → Internship — removed under 4-level taxonomy
 *   3. else Full-time
 *   3. else → Full-time (default for this sponsor-role catalog)
 *
 * Sync can later overwrite with ATS employment fields when present.
 *
 * Usage:
 *   npx tsx src/scripts/backfillJobTypes.ts --dry-run
 *   npx tsx src/scripts/backfillJobTypes.ts --apply
 *   npx tsx src/scripts/backfillJobTypes.ts --apply --table jobs
 *   npx tsx src/scripts/backfillJobTypes.ts --apply --force   # overwrite existing
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { parseJobType, resolveJobType } from '../lib/parseJobType';
import type { AllowedJobType } from '../lib/parseJobType';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type JobsTable = 'jobs' | 'jobs_IR';

type JobRow = {
  id: number;
  title: string;
  level: string | null;
  job_type: string | null;
};

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const dryRun = !apply || argv.includes('--dry-run');
  const force = argv.includes('--force');
  const tableIdx = argv.indexOf('--table');
  const tableArg =
    tableIdx >= 0 && argv[tableIdx + 1] ? String(argv[tableIdx + 1]).trim() : null;

  const tables: JobsTable[] =
    tableArg === 'jobs' || tableArg === 'jobs_IR' ? [tableArg] : ['jobs', 'jobs_IR'];

  return { dryRun, force, tables };
}

/** Infer employment type from the job row itself. */
function inferJobTypeFromRow(row: {
  title: string;
  level?: string | null;
  job_type?: string | null;
}): AllowedJobType {
  return resolveJobType({
    employment: row.job_type,
    title: row.title,
    level: row.level,
  });
}

async function fetchAllRows(table: JobsTable): Promise<JobRow[]> {
  const PAGE = 1000;
  const rows: JobRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('id, title, level, job_type')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      rows.push({
        id: Number(r.id),
        title: String(r.title ?? ''),
        level: r.level ?? null,
        job_type: r.job_type ?? null,
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  const { dryRun, force, tables } = parseArgs(process.argv.slice(2));
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}${force ? ' (force overwrite)' : ''}`);
  console.log(`Tables: ${tables.join(', ')}`);

  const totals = {
    scanned: 0,
    alreadySet: 0,
    wouldSet: 0,
    updated: 0,
    stillNull: 0,
    byType: {} as Record<string, number>,
    bySource: { title: 0, levelInternship: 0, defaultFullTime: 0 },
  };

  for (const table of tables) {
    console.log(`\n── ${table} ──`);
    const rows = await fetchAllRows(table);
    totals.scanned += rows.length;

    const updates: { id: number; job_type: AllowedJobType }[] = [];

    for (const row of rows) {
      const fromTitle = parseJobType(row.title);
      if (fromTitle) totals.bySource.title += 1;
      else totals.bySource.defaultFullTime += 1;

      const inferred = inferJobTypeFromRow(
        force ? { title: row.title, level: row.level, job_type: null } : row,
      );
      if (row.job_type === inferred) {
        totals.alreadySet += 1;
        continue;
      }

      totals.wouldSet += 1;
      totals.byType[inferred] = (totals.byType[inferred] || 0) + 1;
      updates.push({ id: row.id, job_type: inferred });
    }

    console.log(`  scanned=${rows.length} updates=${updates.length}`);

    if (dryRun || !updates.length) continue;

    const BATCH = 100;
    for (let i = 0; i < updates.length; i += BATCH) {
      const chunk = updates.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async (u) => {
          const { error } = await supabase
            .from(table)
            .update({ job_type: u.job_type })
            .eq('id', u.id);
          if (error) throw new Error(`${table} update id=${u.id}: ${error.message}`);
          totals.updated += 1;
        }),
      );
      if ((i + BATCH) % 2000 < BATCH || i + BATCH >= updates.length) {
        console.log(`  … wrote ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
      }
    }
  }

  console.log('\n── Summary ──');
  console.log(JSON.stringify(totals, null, 2));
  if (dryRun) {
    console.log('\nRe-run with --apply to write.');
  } else {
    console.log('\nAll null job_type rows filled from title / level / Full-time default.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
