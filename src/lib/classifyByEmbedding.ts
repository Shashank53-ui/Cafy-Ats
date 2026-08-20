/**
 * Classify a job title into ALLOWED_SECTORS via cosine similarity
 * against multiple prototype vectors per sector (base + example titles).
 * Score for a sector = max similarity across that sector's vectors.
 */
import { ALLOWED_SECTORS } from './constants';
import {
  cosineSimilarity,
  embedText,
  embedTexts,
  normalizeTitleForEmbedding,
} from './embedText';
import {
  getSectorPrototypeEntries,
  type AllowedSector,
} from './sectorPrototypes';

export type EmbeddingClassifyResult = {
  sector: AllowedSector;
  score: number;
  secondSector: AllowedSector | null;
  secondScore: number;
  margin: number;
  confident: boolean;
};

/** One or more vectors per sector (max-pooled at score time). */
export type SectorVectorBank = Record<AllowedSector, Float32Array[]>;

/** @deprecated single-vector map — prefer SectorVectorBank */
export type SectorVectorMap = Record<AllowedSector, Float32Array>;

const DEFAULT_MIN_SCORE = 0.28;
const DEFAULT_MIN_MARGIN = 0.02;

let sectorBankPromise: Promise<SectorVectorBank> | null = null;

export async function buildSectorVectorBank(
  embed: (texts: string[]) => Promise<Float32Array[]> = embedTexts,
  extraExamples?: Partial<Record<AllowedSector, string[]>>,
): Promise<SectorVectorBank> {
  const entries = getSectorPrototypeEntries();
  const bank = {} as SectorVectorBank;

  for (const { sector, texts } of entries) {
    const extras = (extraExamples?.[sector] || [])
      .map((t) => normalizeTitleForEmbedding(t))
      .filter(Boolean);
    const all = [...texts, ...extras];
    // Dedupe
    const uniq = [...new Set(all.map((t) => t.trim()).filter(Boolean))];
    const vectors = await embed(uniq);
    bank[sector] = vectors;
  }
  return bank;
}

/** @deprecated */
export async function buildSectorVectors(
  embed: (texts: string[]) => Promise<Float32Array[]> = embedTexts,
): Promise<SectorVectorMap> {
  const bank = await buildSectorVectorBank(embed);
  const map = {} as SectorVectorMap;
  for (const s of ALLOWED_SECTORS) {
    map[s as AllowedSector] = bank[s as AllowedSector][0]!;
  }
  return map;
}

export async function getSectorVectorBank(
  extraExamples?: Partial<Record<AllowedSector, string[]>>,
): Promise<SectorVectorBank> {
  if (extraExamples) {
    return buildSectorVectorBank(embedTexts, extraExamples);
  }
  if (!sectorBankPromise) {
    sectorBankPromise = buildSectorVectorBank();
  }
  return sectorBankPromise;
}

export async function getSectorVectors(): Promise<SectorVectorMap> {
  const bank = await getSectorVectorBank();
  const map = {} as SectorVectorMap;
  for (const s of ALLOWED_SECTORS) {
    map[s as AllowedSector] = bank[s as AllowedSector][0]!;
  }
  return map;
}

export function resetSectorVectorsCache(): void {
  sectorBankPromise = null;
}

function maxCosine(titleVector: Float32Array | number[], vectors: Float32Array[]): number {
  let best = -1;
  for (const v of vectors) {
    const s = cosineSimilarity(titleVector, v);
    if (s > best) best = s;
  }
  return best;
}

export function rankSectors(
  titleVector: Float32Array | number[],
  sectorVectors: SectorVectorMap | SectorVectorBank,
): { sector: AllowedSector; score: number }[] {
  const ranked = (ALLOWED_SECTORS as readonly AllowedSector[]).map((sector) => {
    const entry = sectorVectors[sector];
    const score = Array.isArray(entry)
      ? maxCosine(titleVector, entry)
      : cosineSimilarity(titleVector, entry);
    return { sector, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function classifyTitleVector(
  titleVector: Float32Array | number[],
  sectorVectors: SectorVectorMap | SectorVectorBank,
  opts?: { minScore?: number; minMargin?: number },
): EmbeddingClassifyResult {
  const minScore = opts?.minScore ?? DEFAULT_MIN_SCORE;
  const minMargin = opts?.minMargin ?? DEFAULT_MIN_MARGIN;
  const ranked = rankSectors(titleVector, sectorVectors);
  const top = ranked[0]!;
  const second = ranked[1] ?? null;
  const margin = second ? top.score - second.score : top.score;
  return {
    sector: top.sector,
    score: top.score,
    secondSector: second?.sector ?? null,
    secondScore: second?.score ?? 0,
    margin,
    confident: top.score >= minScore && margin >= minMargin,
  };
}

export async function classifyTitleByEmbedding(
  title: string,
  opts?: {
    minScore?: number;
    minMargin?: number;
    sectorVectors?: SectorVectorMap | SectorVectorBank;
  },
): Promise<EmbeddingClassifyResult> {
  const norm = normalizeTitleForEmbedding(title);
  if (!norm) {
    return {
      sector: 'Other',
      score: 0,
      secondSector: null,
      secondScore: 0,
      margin: 0,
      confident: false,
    };
  }
  const sectorVectors = opts?.sectorVectors ?? (await getSectorVectorBank());
  const titleVector = await embedText(norm);
  return classifyTitleVector(titleVector, sectorVectors, opts);
}

export function sectorBankToJSON(bank: SectorVectorBank): Record<string, number[][]> {
  const out: Record<string, number[][]> = {};
  for (const sector of ALLOWED_SECTORS) {
    out[sector] = bank[sector as AllowedSector].map((v) => Array.from(v));
  }
  return out;
}

export function sectorBankFromJSON(raw: Record<string, number[][]>): SectorVectorBank {
  const bank = {} as SectorVectorBank;
  for (const sector of ALLOWED_SECTORS) {
    const rows = raw[sector];
    if (!rows?.length) throw new Error(`Missing sector vectors for ${sector}`);
    bank[sector] = rows.map((r) => Float32Array.from(r));
  }
  return bank;
}

/** @deprecated single-vector JSON helpers */
export function sectorVectorsToJSON(map: SectorVectorMap): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const sector of ALLOWED_SECTORS) {
    out[sector] = Array.from(map[sector as AllowedSector]);
  }
  return out;
}

export function sectorVectorsFromJSON(raw: Record<string, number[]>): SectorVectorMap {
  const map = {} as SectorVectorMap;
  for (const sector of ALLOWED_SECTORS) {
    const arr = raw[sector];
    if (!arr?.length) throw new Error(`Missing sector vector for ${sector}`);
    map[sector] = Float32Array.from(arr);
  }
  return map;
}
