/**
 * Classify a job title into ALLOWED_JOB_LEVELS via cosine similarity against
 * multiple prototype vectors per level (base description + example titles).
 * Score for a level = max similarity across that level's vectors.
 *
 * Stage 3 is deliberately near-certain only:
 *   1) exact normalized match to a prototype *example* title → always accept
 *   2) otherwise cosine must be near-identical (high score + clear margin)
 * Anything weaker falls through to manual review.
 */
import { ALLOWED_JOB_LEVELS } from './constants';
import {
  cosineSimilarity,
  embedText,
  embedTexts,
  normalizeTitleForEmbedding,
} from './embedText';
import {
  LEVEL_PROTOTYPES,
  getLevelPrototypeEntries,
  type AllowedJobLevel,
} from './levelPrototypes';

export type LevelEmbeddingClassifyResult = {
  level: AllowedJobLevel;
  score: number;
  secondLevel: AllowedJobLevel | null;
  secondScore: number;
  margin: number;
  confident: boolean;
  /** exact = normalized title equals a prototype example; cosine = vector match */
  matchKind: 'exact' | 'cosine';
};

/** One or more vectors per level (max-pooled at score time). */
export type LevelVectorBank = Record<AllowedJobLevel, Float32Array[]>;

// Near-certain only. Loose 0.42/0.05 flooded Mid/Junior; require near-identity.
const DEFAULT_MIN_SCORE = 0.92;
const DEFAULT_MIN_MARGIN = 0.08;

let levelBankPromise: Promise<LevelVectorBank> | null = null;
let exactPrototypeMap: Map<string, AllowedJobLevel> | null = null;

/** Normalized prototype example title → level (true 100% lexical match). */
export function getExactLevelPrototypeMap(): Map<string, AllowedJobLevel> {
  if (!exactPrototypeMap) {
    exactPrototypeMap = new Map();
    for (const level of ALLOWED_JOB_LEVELS as readonly AllowedJobLevel[]) {
      for (const example of LEVEL_PROTOTYPES[level].examples) {
        const norm = normalizeTitleForEmbedding(example);
        if (norm) exactPrototypeMap.set(norm, level);
      }
    }
  }
  return exactPrototypeMap;
}

/** 100% sure: title normalizes to a known prototype example. */
export function matchLevelByExactPrototype(title: string): AllowedJobLevel | null {
  const norm = normalizeTitleForEmbedding(title);
  if (!norm) return null;
  return getExactLevelPrototypeMap().get(norm) ?? null;
}

export async function buildLevelVectorBank(
  embed: (texts: string[]) => Promise<Float32Array[]> = embedTexts,
  extraExamples?: Partial<Record<AllowedJobLevel, string[]>>,
): Promise<LevelVectorBank> {
  const entries = getLevelPrototypeEntries();
  const bank = {} as LevelVectorBank;

  for (const { level, texts } of entries) {
    const extras = (extraExamples?.[level] || [])
      .map((t) => normalizeTitleForEmbedding(t))
      .filter(Boolean);
    const all = [...texts, ...extras];
    const uniq = [...new Set(all.map((t) => t.trim()).filter(Boolean))];
    const vectors = await embed(uniq);
    bank[level] = vectors;
  }
  return bank;
}

export async function getLevelVectorBank(
  extraExamples?: Partial<Record<AllowedJobLevel, string[]>>,
): Promise<LevelVectorBank> {
  if (extraExamples) {
    return buildLevelVectorBank(embedTexts, extraExamples);
  }
  if (!levelBankPromise) {
    levelBankPromise = buildLevelVectorBank();
  }
  return levelBankPromise;
}

export function resetLevelVectorBankCache(): void {
  levelBankPromise = null;
  exactPrototypeMap = null;
}

function maxCosine(titleVector: Float32Array | number[], vectors: Float32Array[]): number {
  let best = -1;
  for (const v of vectors) {
    const s = cosineSimilarity(titleVector, v);
    if (s > best) best = s;
  }
  return best;
}

export function rankLevels(
  titleVector: Float32Array | number[],
  levelBank: LevelVectorBank,
): { level: AllowedJobLevel; score: number }[] {
  const ranked = (ALLOWED_JOB_LEVELS as readonly AllowedJobLevel[]).map((level) => ({
    level,
    score: maxCosine(titleVector, levelBank[level]),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function classifyLevelVector(
  titleVector: Float32Array | number[],
  levelBank: LevelVectorBank,
  opts?: { minScore?: number; minMargin?: number },
): LevelEmbeddingClassifyResult {
  const minScore = opts?.minScore ?? DEFAULT_MIN_SCORE;
  const minMargin = opts?.minMargin ?? DEFAULT_MIN_MARGIN;
  const ranked = rankLevels(titleVector, levelBank);
  const top = ranked[0]!;
  const second = ranked[1] ?? null;
  const margin = second ? top.score - second.score : top.score;
  return {
    level: top.level,
    score: top.score,
    secondLevel: second?.level ?? null,
    secondScore: second?.score ?? 0,
    margin,
    confident: top.score >= minScore && margin >= minMargin,
    matchKind: 'cosine',
  };
}

export async function classifyTitleLevelByEmbedding(
  title: string,
  opts?: {
    minScore?: number;
    minMargin?: number;
    levelBank?: LevelVectorBank;
  },
): Promise<LevelEmbeddingClassifyResult | null> {
  const norm = normalizeTitleForEmbedding(title);
  if (!norm) return null;

  const exact = matchLevelByExactPrototype(title);
  if (exact) {
    return {
      level: exact,
      score: 1,
      secondLevel: null,
      secondScore: 0,
      margin: 1,
      confident: true,
      matchKind: 'exact',
    };
  }

  const levelBank = opts?.levelBank ?? (await getLevelVectorBank());
  const titleVector = await embedText(norm);
  return classifyLevelVector(titleVector, levelBank, opts);
}

export function levelBankToJSON(bank: LevelVectorBank): Record<string, number[][]> {
  const out: Record<string, number[][]> = {};
  for (const level of ALLOWED_JOB_LEVELS) {
    out[level] = bank[level as AllowedJobLevel].map((v) => Array.from(v));
  }
  return out;
}

export function levelBankFromJSON(raw: Record<string, number[][]>): LevelVectorBank {
  const bank = {} as LevelVectorBank;
  for (const level of ALLOWED_JOB_LEVELS) {
    const rows = raw[level];
    if (!rows?.length) throw new Error(`Missing level vectors for ${level}`);
    bank[level] = rows.map((r) => Float32Array.from(r));
  }
  return bank;
}
