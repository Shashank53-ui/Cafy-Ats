/**
 * Job level cascade (4 levels: Entry Level / Junior / Mid Level / Senior):
 *   stage 1 title rules → stage 2a JD label → stage 2b soft years
 *   → stage 3 multi-chunk embedding → manual_review if still unsure.
 *
 * Map only when confident. Unmarked titles are never silently Mid.
 */
import { inferJobLevelFromTitle, inferJobLevelFromArchetype, type AllowedJobLevel, type JobLevelMatch } from './inferJobLevel';
import { inferJobLevelFromJD } from './inferJobLevelFromJD';
import { inferJobLevelFromYears } from './inferJobLevelFromYears';
import {
  classifyLevelVector,
  getLevelVectorBank,
  matchLevelByExactPrototype,
  type LevelEmbeddingClassifyResult,
  type LevelVectorBank,
} from './classifyLevelByEmbedding';
import { buildTitleChunkEmbedTexts } from './levelJdChunks';
import {
  embedTexts,
  isEmbeddingRuntimeAvailable,
} from './embedText';

export type ResolvedJobLevel = {
  level: AllowedJobLevel | null;
  source: string;
  needsManualReview: boolean;
  /** Present when stage 3 ran (even if not confident). */
  embedding?: {
    score: number;
    margin: number;
    secondLevel: AllowedJobLevel | null;
    confident: boolean;
    matchKind?: 'exact' | 'cosine' | 'multi_chunk';
    chunkCount?: number;
    confidentChunkCount?: number;
  };
};

export type ResolveJobLevelOptions = {
  /** Skip MiniLM stage 3 (tests / offline). Default false. */
  skipEmbedding?: boolean;
  /** Reuse a pre-built bank (batch sync / backfill). */
  levelBank?: LevelVectorBank;
};

/** Stages 1–2 only (sync / rules). Archetypes run after years. */
export function resolveJobLevelRulesOnly(input: {
  title: string;
  description?: string | null;
}): ResolvedJobLevel {
  const titleHit = inferJobLevelFromTitle(input.title);
  if (titleHit) {
    return {
      level: titleHit.level,
      source: titleHit.source,
      needsManualReview: false,
    };
  }

  const jdHit = inferJobLevelFromJD(input.description);
  if (jdHit) {
    return {
      level: jdHit.level,
      source: jdHit.source,
      needsManualReview: false,
    };
  }

  const yearsHit = inferJobLevelFromYears(input.description);
  if (yearsHit) {
    return {
      level: yearsHit.level,
      source: yearsHit.source,
      needsManualReview: false,
    };
  }

  const archetypeHit = inferJobLevelFromArchetype(input.title);
  if (archetypeHit) {
    return {
      level: archetypeHit.level,
      source: archetypeHit.source,
      needsManualReview: false,
    };
  }

  return {
    level: null,
    source: 'manual_review',
    needsManualReview: true,
  };
}

/**
 * Full cascade including confidence-gated semantic stage 3.
 * Falls through to manual_review if embeddings unavailable or not confident.
 */
export async function resolveJobLevel(
  input: { title: string; description?: string | null },
  opts?: ResolveJobLevelOptions,
): Promise<ResolvedJobLevel> {
  const [out] = await resolveJobLevelsBatch([input], opts);
  return out!;
}

function levelSlug(level: AllowedJobLevel): string {
  return level.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Merge per-chunk classifications: only near-certain chunks vote;
 * unanimous level → accept; else manual_review.
 */
export function aggregateChunkClassifications(
  chunkResults: LevelEmbeddingClassifyResult[],
): ResolvedJobLevel {
  const confident = chunkResults.filter((c) => c.confident);
  const bestAny = [...chunkResults].sort((a, b) => b.score - a.score)[0];

  const baseMeta = {
    score: bestAny?.score ?? 0,
    margin: bestAny?.margin ?? 0,
    secondLevel: bestAny?.secondLevel ?? null,
    matchKind: 'multi_chunk' as const,
    chunkCount: chunkResults.length,
    confidentChunkCount: confident.length,
  };

  if (!confident.length) {
    return {
      level: null,
      source: 'manual_review',
      needsManualReview: true,
      embedding: { ...baseMeta, confident: false },
    };
  }

  const levels = new Set(confident.map((c) => c.level));
  if (levels.size > 1) {
    return {
      level: null,
      source: 'manual_review',
      needsManualReview: true,
      embedding: {
        ...baseMeta,
        score: Math.max(...confident.map((c) => c.score)),
        confident: false,
      },
    };
  }

  const level = confident[0]!.level;
  const best = confident.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    level,
    source: `embedding:multi:${levelSlug(level)}`,
    needsManualReview: false,
    embedding: {
      score: best.score,
      margin: best.margin,
      secondLevel: best.secondLevel,
      confident: true,
      matchKind: 'multi_chunk',
      chunkCount: chunkResults.length,
      confidentChunkCount: confident.length,
    },
  };
}

/**
 * Batch resolve — embeds title+JD chunks only for rows that miss stages 1–2.
 */
export async function resolveJobLevelsBatch(
  inputs: { title: string; description?: string | null }[],
  opts?: ResolveJobLevelOptions,
): Promise<ResolvedJobLevel[]> {
  const results: ResolvedJobLevel[] = inputs.map((input) =>
    resolveJobLevelRulesOnly(input),
  );

  if (opts?.skipEmbedding) return results;

  const pendingIdx: number[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i]!.needsManualReview) pendingIdx.push(i);
  }
  if (!pendingIdx.length) return results;

  const available = await isEmbeddingRuntimeAvailable();
  if (!available) return results;

  let levelBank: LevelVectorBank;
  try {
    levelBank = opts?.levelBank ?? (await getLevelVectorBank());
  } catch {
    return results;
  }

  // 100% sure: exact normalized match to a prototype example (no MiniLM).
  const stillNeedEmbed: number[] = [];
  for (let j = 0; j < pendingIdx.length; j++) {
    const idx = pendingIdx[j]!;
    const title = inputs[idx]!.title;
    const exact = matchLevelByExactPrototype(title);
    if (exact) {
      results[idx] = {
        level: exact,
        source: `embedding:exact:${levelSlug(exact)}`,
        needsManualReview: false,
        embedding: {
          score: 1,
          margin: 1,
          secondLevel: null,
          confident: true,
          matchKind: 'exact',
        },
      };
    } else {
      stillNeedEmbed.push(j);
    }
  }

  if (!stillNeedEmbed.length) return results;

  const perJobTexts: string[][] = stillNeedEmbed.map((j) => {
    const idx = pendingIdx[j]!;
    return buildTitleChunkEmbedTexts(inputs[idx]!.title, inputs[idx]!.description);
  });

  const uniqueTexts: string[] = [];
  const textToUnique = new Map<string, number>();
  for (const texts of perJobTexts) {
    for (const t of texts) {
      const key = t.toLowerCase();
      if (!textToUnique.has(key)) {
        textToUnique.set(key, uniqueTexts.length);
        uniqueTexts.push(t);
      }
    }
  }
  if (!uniqueTexts.length) return results;

  const EMBED_CHUNK = 128;
  const uniqueVectors: Float32Array[] = new Array(uniqueTexts.length);
  try {
    for (let i = 0; i < uniqueTexts.length; i += EMBED_CHUNK) {
      const slice = uniqueTexts.slice(i, i + EMBED_CHUNK);
      const vecs = await embedTexts(slice);
      for (let k = 0; k < vecs.length; k++) uniqueVectors[i + k] = vecs[k]!;
    }
  } catch {
    return results;
  }

  for (let n = 0; n < stillNeedEmbed.length; n++) {
    const idx = pendingIdx[stillNeedEmbed[n]!]!;
    const texts = perJobTexts[n]!;
    if (!texts.length) continue;

    const chunkResults: LevelEmbeddingClassifyResult[] = [];
    for (const t of texts) {
      const u = textToUnique.get(t.toLowerCase());
      if (u == null) continue;
      chunkResults.push(classifyLevelVector(uniqueVectors[u]!, levelBank));
    }
    results[idx] = aggregateChunkClassifications(chunkResults);
  }

  return results;
}

/** @deprecated Prefer resolveJobLevel / resolveJobLevelRulesOnly. Alias for rules-only. */
export function resolveJobLevelSync(input: {
  title: string;
  description?: string | null;
}): ResolvedJobLevel {
  return resolveJobLevelRulesOnly(input);
}

export type { AllowedJobLevel, JobLevelMatch };
