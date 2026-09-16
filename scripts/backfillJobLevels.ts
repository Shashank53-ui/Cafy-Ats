/**
 * Backfill jobs.level / level_source with the new cascade (title → JD label → null).
 * Also writes a CSV of rows that need manual review.
 *
 *   npx tsx scripts/backfillJobLevels.ts --dry-run
 *   npx tsx scripts/backfillJobLevels.ts --apply
 *   npx tsx scripts/backfillJobLevels.ts --apply --table jobs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mapLegacyJobLevel } from '../src/lib/levelConfig';
import { getLevelVectorBank } from '../src/lib/classifyLevelByEmbedding';
import { isEmbeddingRuntimeAvailable } from '../src/lib/embedText';
import { resolveJobLevelsBatch } from '../src/lib/resolveJobLevel';
import type { AllowedJobLevel } from '../src/lib/inferJobLevel';

type Sb = SupabaseClient<any, 'public', any>;

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

/** Previous Mid-default 11-level title rules — collapsed to 4 for CSV comparison. */
function oldInferJobLevel(title: string): AllowedJobLevel | null {
  if (!title) return null;
  const t = title.toLowerCase();
  let level: string;
  if (/\b(chief|cto|ceo|cfo|coo|cpo|president|managing director|md)\b/.test(t)) level = 'Executive';
  else if (/\bvp\b|vice president/.test(t)) level = 'VP';
  else if (/\bdirector\b/.test(t) || /\bhead of\b/.test(t)) level = 'Director';
  else if (/\bprincipal\b/.test(t)) level = 'Principal';
  else if (/\b(senior|sr\.?)\b/.test(t)) level = 'Senior';
  else if (
    /\blead\b/.test(t) ||
    (/\b(software|engineering) managers?\b/.test(t) && !/\bassistant managers?\b/.test(t))
  ) {
    level = 'Lead';
  } else if (
    /\b(deli|floor|kitchen|waiting|bar|shop|store|retail|sales|warehouse|support)\s+staff\b/.test(t) ||
    /\bstaff\s*\([^)]*(full|part)\s*time/.test(t)
  ) {
    level = 'Junior';
  } else if (/\bstaff\b/.test(t)) level = 'Staff';
  else if (/\b(intern|internship|placement|apprentice|apprenticeship)\b/.test(t)) level = 'Internship';
  else if (/\b(graduate|entry.?level|early career|new grad|grad scheme|graduate scheme)\b/.test(t)) {
    level = 'Graduate';
  } else if (/\b(junior|jr\.?)\b/.test(t)) level = 'Junior';
  else if (
    /\b(care assistant|healthcare assistant|\bhca\b|support worker|care worker|\bcarer\b|home care)\b/.test(t) ||
    /\b(kitchen assistant|kitchen porter|catering assistant|dishwasher|commis chef|deli assistant)\b/.test(t) ||
    /\b(cashier|sales assistant|shop assistant|store assistant|retail assistant|team member)\b/.test(t) ||
    /\b(sales associate|retail associate|store associate|fragrance associate|warehouse associate)\b/.test(t) ||
    /\b(waiter|waitress|waiting staff|barista|bartender|bar staff|room attendant|housekeep|cleaner|chambermaid)\b/.test(t) ||
    /\b(warehouse operative|order picker|picker\s*[/&]?\s*packer|\bpacker\b)\b/.test(t) ||
    /\b(security guard|security officer|delivery driver|van driver)\b/.test(t)
  ) {
    level = 'Junior';
  } else level = 'Mid-level';
  return mapLegacyJobLevel(level);
}

type JobsTable = 'jobs' | 'jobs_IR';

type Row = {
  id: number;
  title: string;
  description: string | null;
  level: string | null;
  level_source: string | null;
  url: string | null;
  location: string | null;
  company_id: string | null;
};

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const dryRun = !apply || argv.includes('--dry-run');
  const tableIdx = argv.indexOf('--table');
  const tableArg =
    tableIdx >= 0 && argv[tableIdx + 1] ? String(argv[tableIdx + 1]).trim() : null;
  const tables: JobsTable[] =
    tableArg === 'jobs' || tableArg === 'jobs_IR' ? [tableArg] : ['jobs', 'jobs_IR'];
  return { dryRun, tables };
}

function csvEscape(value: string | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchAll(sb: Sb, table: JobsTable): Promise<Row[]> {
  const out: Row[] = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('id,title,description,level,level_source,url,location,company_id')
      .order('id', { ascending: true })
      .range(from, from + page - 1);
    if (error) {
      // level_source may not exist yet — fall back
      if (/level_source/i.test(error.message)) {
        const alt = await sb
          .from(table)
          .select('id,title,description,level,url,location,company_id')
          .order('id', { ascending: true })
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
            url: r.url ?? null,
            location: r.location ?? null,
            company_id: r.company_id != null ? String(r.company_id) : null,
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
        url: r.url ?? null,
        location: r.location ?? null,
        company_id: r.company_id != null ? String(r.company_id) : null,
      });
    }
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function loadCompanyNames(
  sb: Sb,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  const page = 500;
  for (let i = 0; i < uniq.length; i += page) {
    const chunk = uniq.slice(i, i + page);
    const { data, error } = await sb.from('companies').select('id,trading_name,companies_house_name').in('id', chunk);
    if (error) {
      console.warn(`companies lookup skipped: ${error.message}`);
      break;
    }
    for (const c of data || []) {
      const name = String(c.trading_name || c.companies_house_name || '').trim();
      map.set(String(c.id), name);
    }
  }
  return map;
}

async function updateOne(
  sb: Sb,
  table: JobsTable,
  u: { id: number; level: string | null; level_source: string },
  withSource: boolean,
): Promise<{ ok: true; stripSource: boolean } | { ok: false; err: string; stripSource: boolean }> {
  const payload: Record<string, unknown> = { level: u.level };
  if (withSource) payload.level_source = u.level_source;

  const { error } = await sb.from(table).update(payload).eq('id', u.id);
  if (!error) return { ok: true, stripSource: !withSource };

  if (withSource && /level_source/i.test(error.message)) {
    const { error: e2 } = await sb.from(table).update({ level: u.level }).eq('id', u.id);
    if (e2) return { ok: false, err: e2.message, stripSource: true };
    return { ok: true, stripSource: true };
  }
  return { ok: false, err: error.message, stripSource: !withSource };
}

/** Parallel per-row updates (PostgREST can't batch different payloads in one update). */
async function updateBatch(
  sb: Sb,
  table: JobsTable,
  updates: { id: number; level: string | null; level_source: string }[],
  withSource: boolean,
): Promise<{ ok: number; err: string | null; stripSource: boolean }> {
  let stripSource = !withSource;
  const CONCURRENCY = 25;
  let ok = 0;

  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((u) => updateOne(sb, table, u, !stripSource)),
    );
    for (const r of results) {
      if (r.stripSource) stripSource = true;
      if (!r.ok) return { ok, err: r.err, stripSource };
      ok++;
    }
    if (i === 0 || (i / CONCURRENCY) % 40 === 0 || i + CONCURRENCY >= updates.length) {
      console.log(`    ${table} progress ${Math.min(i + CONCURRENCY, updates.length)}/${updates.length}`);
    }
  }
  return { ok, err: null, stripSource };
}

async function main() {
  const { dryRun, tables } = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const sb = createClient(url, key, { auth: { persistSession: false } }) as Sb;
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Target: ${new URL(url).host}`);
  console.log(`Tables: ${tables.join(', ')}`);

  const logDir = path.resolve(process.cwd(), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const csvPath = path.join(logDir, 'level_manual_review.csv');

  const csvRows: string[] = [
    [
      'table',
      'id',
      'title',
      'url',
      'company',
      'location',
      'old_approach_level',
      'your_level',
      'level_source',
      'embedding_score',
      'embedding_margin',
      'description_preview',
      'notes',
    ].join(','),
  ];

  const summary: Record<string, unknown> = {};
  let withSource = true;

  const embOk = await isEmbeddingRuntimeAvailable();
  console.log(`Stage 3 embedding: ${embOk ? 'ENABLED' : 'unavailable — stages 1–2 only'}`);
  const levelBank = embOk ? await getLevelVectorBank() : undefined;

  for (const table of tables) {
    const rows = await fetchAll(sb, table);
    const companyMap = await loadCompanyNames(
      sb,
      rows.map((r) => r.company_id || ''),
    );

    let assigned = 0;
    let manual = 0;
    let viaEmbedding = 0;
    let unchanged = 0;
    let updated = 0;
    const sourceCounts = new Map<string, number>();
    const pending: { id: number; level: string | null; level_source: string }[] = [];

    console.log(`  ${table}: resolving ${rows.length} rows (title → JD → embedding)…`);
    const resolvedList: Awaited<ReturnType<typeof resolveJobLevelsBatch>> = [];
    const RESOLVE_CHUNK = 1500;
    for (let i = 0; i < rows.length; i += RESOLVE_CHUNK) {
      const slice = rows.slice(i, i + RESOLVE_CHUNK);
      const part = await resolveJobLevelsBatch(
        slice.map((r) => ({ title: r.title, description: r.description })),
        { levelBank, skipEmbedding: !embOk },
      );
      resolvedList.push(...part);
      console.log(`    resolved ${Math.min(i + RESOLVE_CHUNK, rows.length)}/${rows.length}`);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const resolved = resolvedList[i]!;
      sourceCounts.set(resolved.source, (sourceCounts.get(resolved.source) || 0) + 1);

      if (resolved.source.startsWith('embedding:')) viaEmbedding++;

      if (resolved.level == null) {
        manual++;
        const preview = row.description
          ? String(row.description).replace(/\s+/g, ' ').trim().slice(0, 200)
          : '';
        csvRows.push(
          [
            csvEscape(table),
            csvEscape(String(row.id)),
            csvEscape(row.title),
            csvEscape(row.url),
            csvEscape(row.company_id ? companyMap.get(row.company_id) || '' : ''),
            csvEscape(row.location),
            csvEscape(oldInferJobLevel(row.title)),
            '', // your_level — fill in during review
            csvEscape(resolved.source),
            csvEscape(
              resolved.embedding ? resolved.embedding.score.toFixed(4) : '',
            ),
            csvEscape(
              resolved.embedding ? resolved.embedding.margin.toFixed(4) : '',
            ),
            csvEscape(preview),
            '', // notes
          ].join(','),
        );
      } else {
        assigned++;
      }

      const nextLevel = resolved.level;
      const nextSource = resolved.source;
      const levelSame = (row.level || null) === nextLevel;
      const sourceSame = (row.level_source || null) === nextSource;
      if (levelSame && sourceSame) {
        unchanged++;
        continue;
      }

      pending.push({ id: row.id, level: nextLevel, level_source: nextSource });
    }

    if (!dryRun) {
      console.log(`  ${table}: applying ${pending.length} updates (${unchanged} already current)…`);
      const res = await updateBatch(sb, table, pending, withSource);
      withSource = !res.stripSource && withSource;
      if (res.err) throw new Error(`${table} update failed: ${res.err}`);
      updated = res.ok;
      console.log(`  ${table}: done ${updated}`);
    }

    summary[table] = {
      total: rows.length,
      assigned,
      via_embedding: viaEmbedding,
      manual_review: manual,
      pct_assigned: rows.length ? Math.round((assigned / rows.length) * 1000) / 10 : 0,
      pct_manual_review: rows.length ? Math.round((manual / rows.length) * 1000) / 10 : 0,
      rows_written: dryRun ? 0 : updated,
      level_unchanged_count: unchanged,
      top_sources: [...sourceCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([source, count]) => ({ source, count })),
    };
  }

  fs.writeFileSync(csvPath, csvRows.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify({ summary, csv: csvPath, csv_rows: csvRows.length - 1 }, null, 2));
  if (dryRun) {
    console.log('\nDry-run only. Re-run with --apply to write levels to Supabase.');
  } else if (!withSource) {
    console.log('\nNote: level_source column missing — ran ALTER? See supabase/add_level_source.sql');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
