/**
 * Export a stratified sample of jobs for hand-labeling (business-correct sectors).
 *
 * Fill `expected_sector` with one of ALLOWED_SECTORS, then score with:
 *   npx tsx src/scripts/scoreSectorGoldenSet.ts
 *
 * Usage:
 *   npx tsx src/scripts/exportSectorGoldenSet.ts
 *   npx tsx src/scripts/exportSectorGoldenSet.ts --per-bucket=40
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ALLOWED_SECTORS } from '../lib/constants';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type JobsTable = 'jobs' | 'jobs_IR';

type Row = {
  id: string;
  title: string | null;
  department: string | null;
  sector: string | null;
  sector_embedding: string | null;
};

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function parsePerBucket(): number {
  const arg = process.argv.find((a) => a.startsWith('--per-bucket='));
  return arg ? Number(arg.slice('--per-bucket='.length)) || 30 : 30;
}

async function fetchTable(table: JobsTable): Promise<(Row & { table: JobsTable })[]> {
  const out: (Row & { table: JobsTable })[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('id, title, department, sector, sector_embedding')
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) out.push({ ...(r as Row), table });
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pick(rows: (Row & { table: JobsTable })[], n: number) {
  return shuffle(rows).slice(0, n);
}

async function main() {
  const perBucket = parsePerBucket();
  console.log(`Fetching jobs (per-bucket≈${perBucket})…`);
  const all = [...(await fetchTable('jobs')), ...(await fetchTable('jobs_IR'))];
  console.log(`Loaded ${all.length} rows`);

  const buckets: Record<string, (Row & { table: JobsTable })[]> = {
    clear_software: [],
    clear_legal: [],
    clear_healthcare: [],
    clear_retail: [],
    clear_finance: [],
    sector_other: [],
    sector_vs_embedding_disagree: [],
    vague_manager: [],
    vague_analyst: [],
    hard_trading: [],
  };

  for (const r of all) {
    const t = (r.title || '').toLowerCase();
    if (/\b(software engineer|frontend developer|backend engineer|devops)\b/.test(t)) {
      buckets.clear_software!.push(r);
    }
    if (/\b(lawyer|solicitor|attorney)\b/.test(t)) buckets.clear_legal!.push(r);
    if (/\b(staff nurse|clinical pharmacist|consultant psychiatrist)\b/.test(t)) {
      buckets.clear_healthcare!.push(r);
    }
    if (
      /\b(store manager|fashion assistant|online trading manager|barista|merchandiser)\b/.test(t)
    ) {
      buckets.clear_retail!.push(r);
    }
    if (/\b(financial analyst|investment banking|fx trader)\b/.test(t)) {
      buckets.clear_finance!.push(r);
    }
    if (r.sector === 'Other') buckets.sector_other!.push(r);
    if (r.sector && r.sector_embedding && r.sector !== r.sector_embedding) {
      buckets.sector_vs_embedding_disagree!.push(r);
    }
    if (
      /\b(manager)\b/i.test(t) &&
      (r.title || '').trim().split(/\s+/).length <= 3
    ) {
      buckets.vague_manager!.push(r);
    }
    if (/\banalyst\b/i.test(t) && (r.title || '').trim().split(/\s+/).length <= 4) {
      buckets.vague_analyst!.push(r);
    }
    if (/\btrading\b/i.test(t)) buckets.hard_trading!.push(r);
  }

  const seen = new Set<string>();
  const sample: (Row & { table: JobsTable; bucket: string })[] = [];

  for (const [bucket, rows] of Object.entries(buckets)) {
    const n = bucket.startsWith('clear_') ? Math.min(perBucket, 25) : perBucket;
    for (const r of pick(rows, n)) {
      const key = `${r.table}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sample.push({ ...r, bucket });
    }
  }

  const capped = shuffle(sample).slice(0, 450);
  capped.sort(
    (a, b) => a.bucket.localeCompare(b.bucket) || (a.title || '').localeCompare(b.title || ''),
  );

  const outDir = path.resolve(process.cwd(), 'data/embeddings');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'sector_golden_set.csv');
  const guidePath = path.join(outDir, 'sector_golden_set_README.md');

  const header = [
    'id',
    'table',
    'bucket',
    'title',
    'department',
    'sector',
    'sector_embedding',
    'expected_sector',
  ];
  const lines = [header.join(',')];
  for (const r of capped) {
    lines.push(
      [
        r.id,
        r.table,
        r.bucket,
        csvEscape(r.title || ''),
        csvEscape(r.department || ''),
        csvEscape(r.sector || ''),
        csvEscape(r.sector_embedding || ''),
        '',
      ].join(','),
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');

  fs.writeFileSync(
    guidePath,
    `# Sector golden set

## How to label

1. Open \`sector_golden_set.csv\` in Excel / Google Sheets.
2. Fill **expected_sector** with exactly one of:

${ALLOWED_SECTORS.map((s) => `- \`${s}\``).join('\n')}

3. Leave blank only if you cannot decide (skipped when scoring).
4. Score:

\`\`\`bash
npx tsx src/scripts/scoreSectorGoldenSet.ts
npx tsx src/scripts/scoreSectorGoldenSet.ts --refresh-db
\`\`\`

Aim for **≥95%** hybrid accuracy on labeled rows (toward 99% on clear titles).
`,
    'utf8',
  );

  console.log(`\nExported ${capped.length} rows → ${csvPath}`);
  console.log(`Guide → ${guidePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
