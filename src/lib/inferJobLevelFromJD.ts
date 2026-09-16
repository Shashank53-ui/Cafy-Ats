/**
 * Cascade stage 2a — explicit labeled field in the JD
 * (e.g. "Career Level: Senior", "Seniority: Mid Level").
 *
 * Precision over recall: free-text years are handled separately in
 * inferJobLevelFromYears. If a label isn't unambiguous, return null.
 */
import { ALLOWED_JOB_LEVELS, type AllowedJobLevel } from './constants';
import type { JobLevelMatch } from './inferJobLevel';
import { mapLegacyJobLevel } from './levelConfig';

const ALLOWED = new Set<string>(ALLOWED_JOB_LEVELS);

const LEVEL_SYNONYMS: Record<string, AllowedJobLevel> = {
  intern: 'Entry Level',
  internship: 'Entry Level',
  placement: 'Entry Level',
  apprentice: 'Entry Level',
  apprenticeship: 'Entry Level',
  graduate: 'Entry Level',
  fresher: 'Entry Level',
  trainee: 'Entry Level',
  'entry level': 'Entry Level',
  'entry-level': 'Entry Level',
  junior: 'Junior',
  'mid level': 'Mid Level',
  'mid-level': 'Mid Level',
  midlevel: 'Mid Level',
  intermediate: 'Mid Level',
  senior: 'Senior',
  staff: 'Senior',
  lead: 'Senior',
  principal: 'Senior',
  director: 'Senior',
  'vice president': 'Senior',
  vp: 'Senior',
  executive: 'Senior',
  'c-suite': 'Senior',
};

/** Only labeled fields — not prose years or "nice to have" bullets. */
const LABEL_PATTERN =
  /\b(?:seniority(?:\s+level)?|career\s*level|job\s*level|role\s*level|experience\s*level)\s*[:\-]\s*([a-z][a-z\s\-]{1,30}?)(?:[\n\r.,;|]|$)/i;

function normalizeCandidate(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '');
}

/**
 * Stage 2a: JD labeled field only. null = no confident match.
 */
export function inferJobLevelFromJD(
  description: string | null | undefined,
): JobLevelMatch | null {
  const text = String(description || '');
  if (!text.trim()) return null;

  const match = text.match(LABEL_PATTERN);
  if (!match?.[1]) return null;

  const candidate = normalizeCandidate(match[1]);

  // Accept already-canonical / legacy labels verbatim
  const legacy = mapLegacyJobLevel(match[1].trim());
  if (legacy && ALLOWED.has(legacy)) {
    return { level: legacy, source: `jd:label:${legacy.toLowerCase().replace(/\s+/g, '_')}` };
  }

  const keys = Object.keys(LEVEL_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (candidate === key || candidate.startsWith(key + ' ')) {
      const level = LEVEL_SYNONYMS[key];
      if (level && ALLOWED.has(level)) {
        return { level, source: `jd:label:${key}` };
      }
    }
  }

  return null;
}
