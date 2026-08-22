/**
 * Local sentence embeddings via Transformers.js (MiniLM).
 * Sync/backfill scripts only — do not import from Next.js request paths.
 */
import { pipeline } from '@huggingface/transformers';

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMS = 384;

export {
  contentTokensForEmbedding,
  normalizeTitleForEmbedding,
  titleHasEmbeddingSignal,
} from './embeddingTitleSignal';

type FeatureExtractor = (
  text: string | string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[]; tolist?: () => number[][] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL) as Promise<FeatureExtractor>;
  }
  return extractorPromise;
}

/** Embed one or more texts. Returns L2-normalized 384-d vectors. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const out: Float32Array[] = [];

  // Sequential / small batches keep RAM low on t3.small
  const BATCH = 16;
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    for (const text of chunk) {
      const result = await extractor(text, { pooling: 'mean', normalize: true });
      const data = result.data instanceof Float32Array
        ? result.data
        : new Float32Array(result.data as ArrayLike<number>);
      // Single string → dims [1, 384] or flat 384
      if (data.length === EMBEDDING_DIMS) {
        out.push(data);
      } else if (data.length > EMBEDDING_DIMS && data.length % EMBEDDING_DIMS === 0) {
        // Take first row if batched oddly
        out.push(data.slice(0, EMBEDDING_DIMS));
      } else {
        throw new Error(`Unexpected embedding length ${data.length} for: ${text.slice(0, 80)}`);
      }
    }
  }
  return out;
}

export async function embedText(text: string): Promise<Float32Array> {
  const [v] = await embedTexts([text]);
  return v;
}

/** Cosine similarity for L2-normalized vectors = dot product. */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i]! * b[i]!;
  return sum;
}

/** Release model handle (tests / scripts). Next call reloads. */
export function resetEmbeddingPipeline(): void {
  extractorPromise = null;
}
