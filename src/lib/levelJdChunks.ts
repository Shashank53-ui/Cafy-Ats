/**
 * Split a job description into short word-chunks for stage-3 semantic level
 * matching. Each chunk is later embedded as `title + chunk` so the title
 * anchors every comparison.
 */
const DEFAULT_WORDS_PER_CHUNK = 150;
const DEFAULT_MAX_CHUNKS = 4;

export type JdChunkOptions = {
  wordsPerChunk?: number;
  maxChunks?: number;
};

/** Collapse whitespace and return word tokens. */
export function jdWords(description: string | null | undefined): string[] {
  const text = String(description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];
  return text.split(' ').filter(Boolean);
}

/**
 * Up to `maxChunks` slices of ~`wordsPerChunk` words each (from the start).
 * Empty description → [].
 */
export function chunkJobDescription(
  description: string | null | undefined,
  opts?: JdChunkOptions,
): string[] {
  const wordsPerChunk = opts?.wordsPerChunk ?? DEFAULT_WORDS_PER_CHUNK;
  const maxChunks = opts?.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const words = jdWords(description);
  if (!words.length) return [];

  const chunks: string[] = [];
  for (let i = 0; i < words.length && chunks.length < maxChunks; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }
  return chunks;
}

/**
 * Texts to embed for stage 3: one string per chunk as `title\\n\\nchunk`.
 * If there is no JD, returns `[title]` only.
 */
export function buildTitleChunkEmbedTexts(
  title: string,
  description: string | null | undefined,
  opts?: JdChunkOptions,
): string[] {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const chunks = chunkJobDescription(description, opts);
  if (!chunks.length) return [t];
  return chunks.map((c) => `${t}\n\n${c}`);
}
