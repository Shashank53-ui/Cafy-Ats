/**
 * Local sentence embeddings via Transformers.js (MiniLM).
 * Sync/backfill scripts only — do not import from Next.js request paths.
 *
 * Tuned for AWS t3.small (~2GB RAM):
 * - Xenova/all-MiniLM-L6-v2 (small 384-d model; matches sector_vector_bank.json)
 * - Default quantized q4 (lowest practical RAM); falls back to q8 then fp32
 * - Single ONNX thread, one title at a time
 * - Lazy import so sync still starts if the package is missing
 */
export const EMBEDDING_MODEL =
  process.env.SECTOR_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
/** q4 default for t3.small; override with SECTOR_EMBEDDING_DTYPE=q8|fp32 if needed. */
export const EMBEDDING_DTYPE = (process.env.SECTOR_EMBEDDING_DTYPE || 'q4') as
  | 'fp32'
  | 'fp16'
  | 'q8'
  | 'q4'
  | 'q4f16';
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

type DType = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';

let extractorPromise: Promise<FeatureExtractor> | null = null;
let unavailableReason: string | null = null;
let loadedDtype: DType | null = null;

/** True when the Transformers.js package can be loaded. */
export async function isEmbeddingRuntimeAvailable(): Promise<boolean> {
  if (unavailableReason) return false;
  try {
    await getExtractor();
    return true;
  } catch {
    return false;
  }
}

export function getEmbeddingUnavailableReason(): string | null {
  return unavailableReason;
}

export function getLoadedEmbeddingDtype(): DType | null {
  return loadedDtype;
}

function dtypeFallbackChain(preferred: DType): DType[] {
  const order: DType[] = [preferred, 'q4', 'q8', 'fp32'];
  return [...new Set(order)];
}

async function getExtractor(): Promise<FeatureExtractor> {
  if (unavailableReason) {
    throw new Error(unavailableReason);
  }
  if (!extractorPromise) {
    extractorPromise = (async () => {
      try {
        // Avoid CUDA / GPU native packages on small CPU instances.
        process.env.ONNXRUNTIME_NODE_INSTALL_CUDA ??= '0';

        const mod = await import('@huggingface/transformers');
        const { pipeline, env } = mod as typeof import('@huggingface/transformers') & {
          env: {
            backends?: { onnx?: { wasm?: { numThreads?: number; proxy?: boolean } } };
          };
        };

        // Keep WASM/ONNX footprint tiny on t3.small.
        if (env?.backends?.onnx?.wasm) {
          env.backends.onnx.wasm.numThreads = 1;
          env.backends.onnx.wasm.proxy = false;
        }

        let lastErr: unknown;
        for (const dtype of dtypeFallbackChain(EMBEDDING_DTYPE)) {
          try {
            console.log(
              `[sector_embedding] Loading ${EMBEDDING_MODEL} dtype=${dtype} (t3.small profile)`,
            );
            const extractor = (await pipeline('feature-extraction', EMBEDDING_MODEL, {
              dtype,
            })) as FeatureExtractor;
            loadedDtype = dtype;
            return extractor;
          } catch (e) {
            lastErr = e;
            console.warn(`[sector_embedding] dtype=${dtype} failed, trying next…`, e);
          }
        }
        throw lastErr;
      } catch (e: any) {
        unavailableReason =
          e?.code === 'MODULE_NOT_FOUND' ||
          /Cannot find module '@huggingface\/transformers'/.test(String(e?.message || e))
            ? 'Optional dependency @huggingface/transformers is not installed'
            : `Embedding runtime failed: ${e?.message || e}`;
        extractorPromise = null;
        loadedDtype = null;
        throw new Error(unavailableReason);
      }
    })();
  }
  return extractorPromise;
}

/** Embed one or more texts. Returns L2-normalized 384-d vectors. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const out: Float32Array[] = [];

  // One-at-a-time keeps RSS low on t3.small during daily sync.
  for (const text of texts) {
    const result = await extractor(text, { pooling: 'mean', normalize: true });
    const data =
      result.data instanceof Float32Array
        ? result.data
        : new Float32Array(result.data as ArrayLike<number>);
    if (data.length === EMBEDDING_DIMS) {
      out.push(data);
    } else if (data.length > EMBEDDING_DIMS && data.length % EMBEDDING_DIMS === 0) {
      out.push(data.slice(0, EMBEDDING_DIMS));
    } else {
      throw new Error(`Unexpected embedding length ${data.length} for: ${text.slice(0, 80)}`);
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
  unavailableReason = null;
  loadedDtype = null;
}
