/**
 * Token helpers for embedding/merge gates.
 * Kept free of Transformers.js so Next.js can import mergeJobSector.
 */

export function normalizeTitleForEmbedding(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const EMBED_STOP = new Set([
  'senior',
  'junior',
  'lead',
  'principal',
  'staff',
  'manager',
  'assistant',
  'officer',
  'executive',
  'specialist',
  'associate',
  'director',
  'head',
  'chief',
  'intern',
  'graduate',
  'contract',
  'contractor',
  'temporary',
  'permanent',
  'full',
  'part',
  'time',
  'london',
  'dublin',
  'remote',
  'hybrid',
  'uk',
  'emea',
  'with',
  'and',
  'the',
  'for',
  'from',
]);

/** Content tokens used to decide whether MiniLM should guess at all. */
export function contentTokensForEmbedding(title: string): string[] {
  return normalizeTitleForEmbedding(title)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !EMBED_STOP.has(w));
}

/** One-word / grade-only titles ("Lateral", "TEAM MANAGER") are not cosine-safe. */
export function titleHasEmbeddingSignal(title: string, minTokens = 2): boolean {
  return contentTokensForEmbedding(title).length >= minTokens;
}
