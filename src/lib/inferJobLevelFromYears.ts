/**
 * Cascade stage 2b — soft years hint from Requirements only.
 *
 * Cannot override a clear title hit (caller enforces order).
 * Only maps when the years signal is unambiguous; otherwise null.
 */
import type { AllowedJobLevel } from './constants';
import type { JobLevelMatch } from './inferJobLevel';
import { ENTRY_PHRASES, YEARS_TO_LEVEL } from './levelConfig';

/** Prefer Requirements / Essential / Must-have sections; abstain if none (100% sure). */
function extractRequirementsText(description: string): string | null {
  const text = String(description || '').replace(/<[^>]+>/g, ' ');
  const section =
    text.match(
      /(?:^|\n)\s*(?:requirements?|essential(?:\s+criteria)?|must[\s-]?haves?|about you|what (?:you'?ll|you will) need|key skills|qualifications?|experience required)\s*[:\n]([\s\S]{20,2500}?)(?=\n\s*(?:responsibilities|about (?:us|the role)|benefits|what we offer|nice to have|desirable|preferred)|$)/i,
    )?.[1] ?? null;

  // Also accept a single clear "X+ years ... required" line anywhere
  if (!section) {
    const line = text.match(
      /\b(?:at\s+least|minimum(?:\s+of)?|min\.?)?\s*\d{1,2}\s*\+?\s*(?:-|–|to\s+\d{1,2}\s+)?(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+)?experience\b[^\n.]{0,40}\brequired\b/i,
    );
    if (line) return line[0].replace(/\s+/g, ' ').trim();
    // Entry phrases may appear without a Requirements heading
    const lower = text.toLowerCase();
    for (const phrase of ENTRY_PHRASES) {
      if (lower.includes(phrase)) return phrase;
    }
    return null;
  }

  const body = section.replace(/\s+/g, ' ').trim();
  return body
    .replace(/\bnice to have\b[\s\S]{0,400}/gi, ' ')
    .replace(/\bpreferred\b[\s\S]{0,400}/gi, ' ')
    .replace(/\bdesirable\b[\s\S]{0,400}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a confident years requirement.
 * Returns { min, max } when a range is present; max may equal min for "5+" / "3 years".
 */
export function parseYearsRequired(
  text: string,
): { min: number; max: number | null } | null {
  const t = text.toLowerCase();

  if (
    /\b(0|zero)\s*[\-+]?\s*(?:years?|yrs?)\b/.test(t) ||
    /\bno\s+(?:prior\s+)?experience\b/.test(t)
  ) {
    return { min: 0, max: 0 };
  }

  const plus = t.match(
    /\b(?:at\s+least|minimum(?:\s+of)?|min\.?)\s*(\d{1,2})\s*[\+]?\s*(?:years?|yrs?)\b/,
  );
  if (plus?.[1]) return { min: Number(plus[1]), max: null };

  const plus2 = t.match(/\b(\d{1,2})\s*\+\s*(?:years?|yrs?)\b/);
  if (plus2?.[1]) return { min: Number(plus2[1]), max: null };

  const range = t.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?|yrs?)\b/);
  if (range?.[1] && range[2]) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a <= b && b <= 20) {
      return { min: a, max: b };
    }
  }

  const plain = t.match(
    /\b(\d{1,2})\s*(?:years?|yrs?)(?:\s*(?:of|')?\s*(?:relevant\s+)?(?:experience|exp\.?))?\b/,
  );
  if (plain?.[1]) {
    const n = Number(plain[1]);
    if (n >= 0 && n <= 20) return { min: n, max: n };
  }

  return null;
}

/** @deprecated Prefer parseYearsRequired */
export function parseMinYearsRequired(text: string): number | null {
  return parseYearsRequired(text)?.min ?? null;
}

function yearsSignalToLevel(min: number, max: number | null): AllowedJobLevel | null {
  // Clear Mid band: "2-4 years"
  if (max != null && min >= 2 && max <= 4) return 'Mid Level';
  // Clear Junior band: "0-2" / "1-2"
  if (max != null && max <= 2 && min <= 2) {
    return min <= YEARS_TO_LEVEL.entryMax ? 'Entry Level' : 'Junior';
  }
  // Open-ended or single number
  if (min <= YEARS_TO_LEVEL.entryMax) return 'Entry Level';
  if (min <= YEARS_TO_LEVEL.juniorMax) return 'Junior';
  if (min <= YEARS_TO_LEVEL.midMax) return 'Mid Level';
  if (min >= 5) return 'Senior';
  return null;
}

/**
 * Stage 2b: soft years → level. null = not confident enough to map.
 */
export function inferJobLevelFromYears(
  description: string | null | undefined,
): JobLevelMatch | null {
  const text = extractRequirementsText(String(description || ''));
  if (!text) return null;

  const lower = text.toLowerCase();
  for (const phrase of ENTRY_PHRASES) {
    if (lower.includes(phrase)) {
      return { level: 'Entry Level', source: `years:entry_phrase:${phrase.replace(/\s+/g, '_')}` };
    }
  }

  const parsed = parseYearsRequired(text);
  if (!parsed) return null;
  if (parsed.min > 20) return null;

  const level = yearsSignalToLevel(parsed.min, parsed.max);
  if (!level) return null;
  const maxPart = parsed.max == null ? 'plus' : String(parsed.max);
  return { level, source: `years:min:${parsed.min}:max:${maxPart}` };
}
