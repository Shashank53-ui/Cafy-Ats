/**
 * Score hand-labeled golden set against live `sector` / hybrid.
 *
 * Usage:
 *   npx tsx src/scripts/scoreSectorGoldenSet.ts
 *   npx tsx src/scripts/scoreSectorGoldenSet.ts --file=data/embeddings/sector_golden_set.csv
 *   npx tsx src/scripts/scoreSectorGoldenSet.ts --refresh-db
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ALLOWED_SECTORS } from '../lib/constants';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ALLOWED = new Set<string>(ALLOWED_SECTORS as readonly string[]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function parseArgs() {
  const argv = process.argv.slice(2);
  const file =
    argv.find((a) => a.startsWith('--file='))?.slice(7) ||
    'data/embeddings/sector_golden_set.csv';
  const refreshDb = argv.includes('--refresh-db');
  return { file: path.resolve(process.cwd(), file), refreshDb };
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (ch !== '\r') cur += ch;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => {
        obj[h] = (r[i] ?? '').trim();
      });
      return obj;
    });
}

async function fetchRow(table: string, id: string) {
  const { data, error } = await supabase
    .from(table)
    .select('id, title, department, sector, sector_embedding')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    title: string | null;
    department: string | null;
    sector: string | null;
    sector_embedding: string | null;
  } | null;
}

async function main() {
  const { file, refreshDb } = parseArgs();
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}\nRun: npx tsx src/scripts/exportSectorGoldenSet.ts`);
  }

  const labeled = parseCsv(fs.readFileSync(file, 'utf8'));
  const withExpected = labeled.filter((r) => r.expected_sector);
  const blank = labeled.length - withExpected.length;

  console.log(`File: ${file}`);
  console.log(`Rows: ${labeled.length} | labeled: ${withExpected.length} | blank: ${blank}`);

  if (!withExpected.length) {
    console.log('\nNo expected_sector values yet. Fill the CSV, then re-run.');
    return;
  }

  let sectorHits = 0;
  let embHits = 0;
  let hybridHits = 0;
  let invalidExpected = 0;
  const misses: {
    title: string;
    expected: string;
    sector: string | null;
    embedding: string | null;
    hybrid: string;
    bucket: string;
  }[] = [];

  for (const r of withExpected) {
    const expected = r.expected_sector.trim();
    if (!ALLOWED.has(expected)) {
      invalidExpected++;
      console.warn(`Invalid expected_sector "${expected}" id=${r.id}`);
      continue;
    }

    let title = r.title || '';
    let department = r.department || null;
    let sector = r.sector || null;
    let embedding = r.sector_embedding || null;

    if (refreshDb || !sector) {
      const live = await fetchRow(r.table || 'jobs', r.id);
      if (live) {
        title = live.title || title;
        department = live.department;
        sector = live.sector;
        embedding = live.sector_embedding;
      }
    }

    const rawDept = department && !ALLOWED.has(department) ? department : null;
    const hybrid = classifyJobTaxonomy(title, rawDept, null, embedding).sector;

    if (sector === expected) sectorHits++;
    if (embedding === expected) embHits++;
    if (hybrid === expected) hybridHits++;
    else {
      misses.push({
        title,
        expected,
        sector,
        embedding,
        hybrid,
        bucket: r.bucket || '',
      });
    }
  }

  const n = withExpected.length - invalidExpected;
  const pct = (x: number) => (n ? ((100 * x) / n).toFixed(1) : '0');

  console.log('\n========== GOLDEN SET SCORE ==========');
  console.log(`Scored: ${n}`);
  console.log(`sector:              ${sectorHits}/${n} (${pct(sectorHits)}%)`);
  console.log(`sector_embedding:    ${embHits}/${n} (${pct(embHits)}%)`);
  console.log(`hybrid → sector:     ${hybridHits}/${n} (${pct(hybridHits)}%)`);

  if (misses.length) {
    console.log(`\nMisses (first ${Math.min(20, misses.length)}):`);
    for (const m of misses.slice(0, 20)) {
      console.log(
        `  want=${m.expected} got_hybrid=${m.hybrid} sector=${m.sector} emb=${m.embedding} | ${m.title}`,
      );
    }
  }

  if (n >= 50 && Number(pct(hybridHits)) >= 95) console.log('\n≥95%: HIT');
  else if (n >= 50) console.log('\n≥95%: NOT YET — fix rules from misses');
  else console.log('\nLabel more rows (aim 200–450) for a stable score.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
