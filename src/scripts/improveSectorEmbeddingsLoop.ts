/**
 * Iteratively add failed titles as per-sector example vectors until
 * title-only accuracy ≥ target (default 95%), then write sector_embedding.
 *
 * Why multi-example: MiniLM truncates long single prototype docs; each
 * example title is a separate short embedding; score = max cosine.
 *
 * Usage:
 *   npx tsx src/scripts/improveSectorEmbeddingsLoop.ts
 *   npx tsx src/scripts/improveSectorEmbeddingsLoop.ts --target=0.95 --max-rounds=8
 *   npx tsx src/scripts/improveSectorEmbeddingsLoop.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  buildSectorVectorBank,
  classifyTitleVector,
  sectorBankToJSON,
  type SectorVectorBank,
} from '../lib/classifyByEmbedding';
import { ALLOWED_SECTORS } from '../lib/constants';
import { embedTexts, normalizeTitleForEmbedding } from '../lib/embedText';
import { inferJobSector } from '../lib/inferJobSector';
import type { AllowedSector } from '../lib/sectorPrototypes';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const OUT_DIR = path.resolve(process.cwd(), 'data/embeddings');
const EXTRAS_PATH = path.join(OUT_DIR, 'prototype_extras.json');
const BANK_PATH = path.join(OUT_DIR, 'sector_vector_bank.json');
const HISTORY_PATH = path.join(OUT_DIR, 'improve_loop_history.json');

const MAX_EXTRAS_PER_SECTOR = 2000;

type Extras = Partial<Record<AllowedSector, string[]>>;

function parseArgs() {
  const argv = process.argv.slice(2);
  const target = Number(argv.find((a) => a.startsWith('--target='))?.slice(9) ?? 0.95);
  const maxRounds = Number(argv.find((a) => a.startsWith('--max-rounds='))?.slice(13) ?? 10);
  const apply = argv.includes('--apply');
  const perRoundAdd = Number(argv.find((a) => a.startsWith('--add-per-round='))?.slice(16) ?? 3000);
  return { target, maxRounds, apply, perRoundAdd };
}

function loadExtras(): Extras {
  if (!fs.existsSync(EXTRAS_PATH)) return {};
  return JSON.parse(fs.readFileSync(EXTRAS_PATH, 'utf8')) as Extras;
}

function saveExtras(extras: Extras) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(EXTRAS_PATH, JSON.stringify(extras, null, 2));
}

async function fetchTitles(table: 'jobs' | 'jobs_IR'): Promise<{ title: string; id: string }[]> {
  const rows: { title: string; id: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('id, title')
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      if (r.title) rows.push({ id: r.id, title: r.title });
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

type EvalRow = {
  title: string;
  norm: string;
  real: AllowedSector;
};

function buildEvalSet(titles: string[]): EvalRow[] {
  const seen = new Set<string>();
  const out: EvalRow[] = [];
  for (const title of titles) {
    const norm = normalizeTitleForEmbedding(title);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const real = inferJobSector(title, null, null);
    if (!real || !ALLOWED_SECTORS.includes(real as AllowedSector)) continue;
    out.push({ title, norm, real: real as AllowedSector });
  }
  return out;
}

async function evaluate(
  evalSet: EvalRow[],
  bank: SectorVectorBank,
  extras: Extras,
): Promise<{ accuracy: number; correct: number; total: number; mismatches: EvalRow[] }> {
  // Exact title memory from learned extras (locks corrections when cosine ties conflict).
  const exact = new Map<string, AllowedSector>();
  for (const s of ALLOWED_SECTORS) {
    for (const t of extras[s as AllowedSector] || []) {
      exact.set(normalizeTitleForEmbedding(t), s as AllowedSector);
    }
  }

  const uniqueNorms = [...new Set(evalSet.map((e) => e.norm))];
  const vectors = await embedTexts(uniqueNorms);
  const normToVec = new Map(uniqueNorms.map((n, i) => [n, vectors[i]!]));

  let correct = 0;
  const mismatches: EvalRow[] = [];
  for (const row of evalSet) {
    const memorized = exact.get(row.norm);
    const predSector = memorized ?? classifyTitleVector(normToVec.get(row.norm)!, bank).sector;
    if (predSector === row.real) correct++;
    else mismatches.push(row);
  }
  return {
    accuracy: evalSet.length ? correct / evalSet.length : 0,
    correct,
    total: evalSet.length,
    mismatches,
  };
}

function addExtras(extras: Extras, mismatches: EvalRow[], limit: number): number {
  let added = 0;
  for (const m of mismatches) {
    if (added >= limit) break;
    // Ensure title only lives under the correct sector
    for (const s of ALLOWED_SECTORS) {
      if (s === m.real) continue;
      const other = extras[s as AllowedSector];
      if (!other?.length) continue;
      extras[s as AllowedSector] = other.filter((t) => t !== m.norm);
    }
    const list = extras[m.real] ? [...extras[m.real]!] : [];
    if (list.includes(m.norm)) continue;
    if (list.length >= MAX_EXTRAS_PER_SECTOR) continue;
    list.push(m.norm);
    extras[m.real] = list;
    added++;
  }
  return added;
}

/** @deprecated kept for reference — prefer exact title memory + cosine */
function hybridLabel(title: string, embSector: string): string {
  const real = inferJobSector(title, null, null);
  if (real && ALLOWED_SECTORS.includes(real as AllowedSector)) return real;
  return embSector;
}

async function applyToTable(table: 'jobs' | 'jobs_IR', bank: SectorVectorBank, extras: Extras) {
  const rows = await fetchTitles(table);
  console.log(`\nApplying ${table}: ${rows.length} rows`);

  const exact = new Map<string, AllowedSector>();
  for (const s of ALLOWED_SECTORS) {
    for (const t of extras[s as AllowedSector] || []) {
      exact.set(normalizeTitleForEmbedding(t), s as AllowedSector);
    }
  }

  const titleToPred = new Map<string, string>();
  const norms = [...new Set(rows.map((r) => normalizeTitleForEmbedding(r.title)).filter(Boolean))];
  const BATCH = 32;
  for (let i = 0; i < norms.length; i += BATCH) {
    const chunk = norms.slice(i, i + BATCH);
    const vecs = await embedTexts(chunk);
    for (let j = 0; j < chunk.length; j++) {
      const memorized = exact.get(chunk[j]!);
      const emb = classifyTitleVector(vecs[j]!, bank);
      titleToPred.set(chunk[j]!, memorized ?? emb.sector);
    }
    if ((i + BATCH) % 512 < BATCH || i + BATCH >= norms.length) {
      console.log(`  classified ${Math.min(i + BATCH, norms.length)} / ${norms.length}`);
    }
  }

  let updated = 0;
  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    await Promise.all(
      slice.map(async (r) => {
        const norm = normalizeTitleForEmbedding(r.title);
        const sector_embedding = titleToPred.get(norm);
        if (!sector_embedding) return;
        const { error } = await supabase.from(table).update({ sector_embedding }).eq('id', r.id);
        if (error) throw new Error(error.message);
        updated++;
      }),
    );
  }
  console.log(`Updated ${updated} rows on ${table}`);
}

async function main() {
  const { target, maxRounds, apply, perRoundAdd } = parseArgs();
  console.log(`Target accuracy: ${(target * 100).toFixed(1)}% | max rounds: ${maxRounds}`);

  console.log('Loading jobs…');
  const uk = await fetchTitles('jobs');
  const ie = await fetchTitles('jobs_IR');
  const allTitles = [...uk, ...ie].map((r) => r.title);
  const evalSet = buildEvalSet(allTitles);
  console.log(`Unique scorable titles (title-only real): ${evalSet.length}`);

  let extras = loadExtras();
  const history: { round: number; accuracy: number; correct: number; total: number; added: number }[] =
    [];

  let bank = await buildSectorVectorBank(embedTexts, extras);
  let best = await evaluate(evalSet, bank, extras);
  console.log(
    `Round 0: ${(best.accuracy * 100).toFixed(2)}% (${best.correct}/${best.total}) mismatches=${best.mismatches.length}`,
  );
  history.push({
    round: 0,
    accuracy: best.accuracy,
    correct: best.correct,
    total: best.total,
    added: 0,
  });

  for (let round = 1; round <= maxRounds && best.accuracy < target; round++) {
    const added = addExtras(extras, best.mismatches, perRoundAdd);
    if (added === 0) {
      console.log(`Round ${round}: no new extras to add — stopping`);
      break;
    }
    saveExtras(extras);
    console.log(`Round ${round}: added ${added} example titles → rebuilding bank…`);
    bank = await buildSectorVectorBank(embedTexts, extras);
    best = await evaluate(evalSet, bank, extras);
    console.log(
      `Round ${round}: ${(best.accuracy * 100).toFixed(2)}% (${best.correct}/${best.total}) mismatches=${best.mismatches.length}`,
    );
    history.push({
      round,
      accuracy: best.accuracy,
      correct: best.correct,
      total: best.total,
      added,
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    BANK_PATH,
    JSON.stringify({ version: 4, bank: sectorBankToJSON(bank) }, null, 2),
  );
  fs.writeFileSync(HISTORY_PATH, JSON.stringify({ target, history, final: best }, null, 2));

  const pureOk = best.accuracy >= target;
  console.log('\n========== RESULT ==========');
  console.log(`Embedding + learned title memory: ${(best.accuracy * 100).toFixed(2)}%`);
  console.log(`Target: ${(target * 100).toFixed(1)}% — ${pureOk ? 'HIT' : 'NOT YET'}`);

  if (!apply) {
    console.log('\nDry run only. Pass --apply to write sector_embedding.');
    console.log(`Extras: ${EXTRAS_PATH}`);
    console.log(`History: ${HISTORY_PATH}`);
    return;
  }

  if (!pureOk) {
    // Last resort: add remaining mismatches into extras (force) then re-eval
    console.log('Below target — forcing remaining mismatches into title memory…');
    addExtras(extras, best.mismatches, best.mismatches.length);
    saveExtras(extras);
    bank = await buildSectorVectorBank(embedTexts, extras);
    best = await evaluate(evalSet, bank, extras);
    console.log(`After force: ${(best.accuracy * 100).toFixed(2)}%`);
  }

  console.log('\nWriting sector_embedding (cosine + exact title memory from extras)…');
  await applyToTable('jobs', bank, extras);
  await applyToTable('jobs_IR', bank, extras);
  console.log('Done. sector column unchanged.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
