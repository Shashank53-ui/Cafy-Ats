/**
 * Buffer titles that stages 1–2 could not confidently classify.
 * Flushed to logs/level_manual_review.jsonl at end of sync.
 */
import fs from 'fs';
import path from 'path';

export type LevelManualReviewEntry = {
  title: string;
  url?: string | null;
  company?: string | null;
  description_preview?: string | null;
  reason: string;
  at: string;
};

const buffer: LevelManualReviewEntry[] = [];

export function resetLevelManualReviewBuffer(): void {
  buffer.length = 0;
}

export function enqueueLevelManualReview(entry: Omit<LevelManualReviewEntry, 'at' | 'reason'> & {
  reason?: string;
}): void {
  const desc = entry.description_preview
    ? String(entry.description_preview).replace(/\s+/g, ' ').trim().slice(0, 180)
    : null;
  buffer.push({
    title: entry.title,
    url: entry.url ?? null,
    company: entry.company ?? null,
    description_preview: desc,
    reason: entry.reason || 'stages_1_2_no_confident_match',
    at: new Date().toISOString(),
  });
}

export function getLevelManualReviewBufferSize(): number {
  return buffer.length;
}

/** Append buffer to logs/level_manual_review.jsonl; returns rows written. */
export function flushLevelManualReviewLog(): number {
  if (!buffer.length) return 0;
  const logDir = path.resolve(process.cwd(), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'level_manual_review.jsonl');
  const lines = buffer.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(logPath, lines, 'utf8');
  const n = buffer.length;
  buffer.length = 0;
  return n;
}
