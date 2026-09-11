/**
 * Production runtime for `sector_embedding` during daily sync.
 *
 * Order:
 *   1. Exact title memory from data/embeddings/prototype_extras.json
 *   2. MiniLM cosine vs sector prototype bank (optional — skipped if HF missing)
 *   3. Title-only keyword rules (same target the improve loop learned)
 *   4. Other
 *
 * Load once per process via ensureSectorEmbeddingRuntime().
 */
import fs from 'fs';
import path from 'path';
import {
  buildSectorVectorBank,
  classifyTitleVector,
  sectorBankFromJSON,
  type SectorVectorBank,
} from './classifyByEmbedding';
import { ALLOWED_SECTORS } from './constants';
import {
  embedText,
  getEmbeddingUnavailableReason,
  isEmbeddingRuntimeAvailable,
  normalizeTitleForEmbedding,
} from './embedText';
import { titleHasEmbeddingSignal } from './embeddingTitleSignal';
import { inferJobSector } from './inferJobSector';
import type { AllowedSector } from './sectorPrototypes';

const OUT_DIR = path.resolve(process.cwd(), 'data/embeddings');
const EXTRAS_PATH = path.join(OUT_DIR, 'prototype_extras.json');
const BANK_PATH = path.join(OUT_DIR, 'sector_vector_bank.json');

let readyPromise: Promise<void> | null = null;
let exactMemory = new Map<string, AllowedSector>();
let bank: SectorVectorBank | null = null;
let miniLmEnabled = false;

function loadExactMemory(): Map<string, AllowedSector> {
  const map = new Map<string, AllowedSector>();
  if (!fs.existsSync(EXTRAS_PATH)) {
    console.warn(`[sector_embedding] No extras at ${EXTRAS_PATH} — memory disabled`);
    return map;
  }
  const extras = JSON.parse(fs.readFileSync(EXTRAS_PATH, 'utf8')) as Partial<
    Record<AllowedSector, string[]>
  >;
  for (const s of ALLOWED_SECTORS) {
    for (const t of extras[s] || []) {
      const norm = normalizeTitleForEmbedding(t);
      if (norm) map.set(norm, s);
    }
  }
  console.log(`[sector_embedding] Loaded ${map.size} title memories from extras`);
  return map;
}

async function loadBank(): Promise<SectorVectorBank | null> {
  if (fs.existsSync(BANK_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8')) as {
        version?: number;
        bank?: Record<string, number[][]>;
      };
      if (raw.bank) {
        console.log(`[sector_embedding] Loaded vector bank from ${BANK_PATH}`);
        return sectorBankFromJSON(raw.bank);
      }
    } catch (e) {
      console.warn(`[sector_embedding] Bank cache unreadable:`, e);
    }
  }

  if (!(await isEmbeddingRuntimeAvailable())) {
    console.warn(
      `[sector_embedding] MiniLM unavailable (${getEmbeddingUnavailableReason() || 'unknown'}) — using title memory + rules only`,
    );
    return null;
  }

  console.log('[sector_embedding] Building light prototype bank (no extras vectors)…');
  return buildSectorVectorBank();
}

export async function ensureSectorEmbeddingRuntime(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      exactMemory = loadExactMemory();
      bank = await loadBank();
      miniLmEnabled = !!(bank && (await isEmbeddingRuntimeAvailable()));
      if (miniLmEnabled) {
        console.log('[sector_embedding] MiniLM enabled for sector_embedding column');
      } else {
        console.warn(
          '[sector_embedding] MiniLM disabled — sync will still run; sector_embedding falls back to memory/rules',
        );
      }
    })();
  }
  await readyPromise;
}

/** Classify one job title for the sector_embedding column. */
export async function resolveSectorEmbedding(title: string): Promise<string> {
  await ensureSectorEmbeddingRuntime();
  const norm = normalizeTitleForEmbedding(title);
  if (!norm) return 'Other';

  const memorized = exactMemory.get(norm);
  if (memorized) return memorized;

  if (!titleHasEmbeddingSignal(title)) return 'Other';

  if (miniLmEnabled && bank) {
    try {
      const titleVector = await embedText(norm);
      const pred = classifyTitleVector(titleVector, bank);
      if (pred.confident) return pred.sector;
    } catch (e) {
      console.warn(`[sector_embedding] MiniLM failed for "${norm.slice(0, 60)}":`, e);
    }
  }

  const rules = inferJobSector(title, null, null);
  if (rules && (ALLOWED_SECTORS as readonly string[]).includes(rules)) return rules;

  return 'Other';
}

/** Batch helper — same order, shared runtime. */
export async function resolveSectorEmbeddings(titles: string[]): Promise<string[]> {
  await ensureSectorEmbeddingRuntime();
  const out: string[] = [];
  for (const t of titles) {
    out.push(await resolveSectorEmbedding(t));
  }
  return out;
}
