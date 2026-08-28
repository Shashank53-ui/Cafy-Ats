/**
 * Normalize ATS employment-type fields into product job types.
 * Returns null when unknown (do not invent a type from vague titles).
 */
import { ALLOWED_JOB_TYPES } from './constants';

export type AllowedJobType = (typeof ALLOWED_JOB_TYPES)[number];

const ALLOWED = new Set<string>(ALLOWED_JOB_TYPES);

/** Roles where "contract" is a job function, not employment type. */
const CONTRACT_FALSE_POSITIVE =
  /\b(contract managers?|contracts? managers?|contract specialis|contract negotiat|contract lawyers?|contract counsel|contracts? administrators?|contracts? officers?)\b/;

function partsFrom(raw: unknown): string[] {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw
      .flatMap((x) => partsFrom(x))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof raw === 'object') {
    return partsFrom(String(raw));
  }
  return [String(raw).trim()];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Classify one short field or a longer blob. Longer text uses stricter patterns. */
function classifyOne(raw: string): AllowedJobType | null {
  const l = normalize(raw);
  if (!l) return null;
  const long = l.length > 48;

  // Part-time before full-time so "full / part time" oddities prefer part when explicit.
  if (/\b(part[\s-]?time|parttime|\bpt\b)\b/.test(l)) return 'Part-time';
  if (/\b(full[\s-]?time|fulltime|\bft\b|permanent)\b/.test(l)) return 'Full-time';

  if (/\b(placement scheme|industrial placement|graduate placement|year in industry|sandwich year)\b/.test(l)) {
    return 'Placement scheme';
  }

  // Do not treat "Co-op Academy" / supermarket Co-op as a university co-op internship.
  if (
    /\b(internships?|\bintern\b|apprentice|apprenticeship|graduate (scheme|program|programme)|student placement)\b/.test(l) ||
    /\bco-?op\s+(?:intern|student|program|programme|placement|engineer|developer)\b/.test(l) ||
    /\b(?:intern|student)\s+co-?op\b/.test(l)
  ) {
    return 'Internship';
  }

  // UK "bank" care/nursing = as-needed shifts (not Full-time).
  if (/\bbank\b/.test(l) && /\b(care|nurse|nursing|rgn|rmn|\bhca\b|carer)\b/.test(l)) {
    return 'Part-time';
  }

  // Contract / temp — skip title-like false positives ("Contract Manager").
  if (!CONTRACT_FALSE_POSITIVE.test(l)) {
    if (long) {
      // Long blobs (titles + card text): require clear employment phrases only.
      if (
        /\b(fixed[\s-]?term|temporary contract|on a contract|contract (basis|role|position)|freelance|casual)\b/.test(
          l,
        )
      ) {
        return 'Contract';
      }
    } else if (
      /\b(fixed[\s-]?term|temporary|temp\b|contract(or|ing)?|freelance|casual|contingent)\b/.test(l)
    ) {
      return 'Contract';
    }
  }

  return null;
}

/** Legal / T&C lines that mention "contract" but are not employment type. */
const LISTING_NOISE =
  /agenda for change|contract of employment|terms (and|&) conditions|equal opportunit/i;

/**
 * Pull short employment / hours lines from a job card.
 * Ignores long body copy so legal footers cannot stamp Contract / Part-time.
 */
export function extractEmploymentSnippet(text: string): string | null {
  if (!text) return null;
  const lines = String(text)
    .split(/[\n\r|;•·]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const hits: string[] = [];
  for (const line of lines) {
    if (line.length > 80) continue;
    if (LISTING_NOISE.test(line)) continue;
    if (
      /\b(full[\s-]?time|part[\s-]?time|permanent|fixed[\s-]?term|temporary|intern(ship)?|apprentice|bank|casual|locum|contract)\b/i.test(
        line,
      )
    ) {
      hits.push(line);
    }
  }
  return hits.length ? hits.join(' ') : null;
}

/** UK listings often say "36 hrs p/w" instead of Full-time / Part-time. */
export function parseHoursPerWeek(text: string): number | null {
  const m = String(text || '').match(
    /(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\s*(?:p\/w|per week|a week|\bpw\b)/i,
  );
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function jobTypeFromWeeklyHours(hours: number): AllowedJobType | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return hours >= 30 ? 'Full-time' : 'Part-time';
}

/**
 * Dedicated ATS field first, then short metadata lines, then weekly hours.
 * Never pass a full HTML card into parseJobType — use this instead.
 */
export function inferJobTypeFromListing(input: {
  employmentField?: unknown;
  cardText?: string | null;
}): AllowedJobType | null {
  const fromField = parseJobType(input.employmentField);
  if (fromField) return fromField;

  const snippet = extractEmploymentSnippet(input.cardText || '');
  const fromSnippet = parseJobType(snippet);
  if (fromSnippet) return fromSnippet;

  const hrs = parseHoursPerWeek(input.cardText || '');
  return hrs != null ? jobTypeFromWeeklyHours(hrs) : null;
}

/**
 * Parse ATS employment type into an allowlisted job type.
 * Prefer short employment fields; when given an array, try shorter parts first
 * so titles do not drown out `employmentType: "Full-time"`.
 */
export function parseJobType(raw?: unknown): AllowedJobType | undefined {
  const parts = partsFrom(raw);
  if (!parts.length) return undefined;

  const ordered = [...parts].sort((a, b) => a.length - b.length);
  for (const part of ordered) {
    const hit = classifyOne(part);
    if (hit && ALLOWED.has(hit)) return hit;
  }
  return undefined;
}

/**
 * Always returns an allowlisted type for catalog rows.
 * Prefer ATS/parsed employment → title cues → Internship level → Full-time.
 */
export function resolveJobType(input: {
  employment?: unknown;
  title?: string | null;
  level?: string | null;
}): AllowedJobType {
  const fromEmployment = parseJobType(input.employment);
  const fromTitle = parseJobType(input.title ?? undefined);

  // Title intern / part-time / placement beats a generic Full-time (catalog default
  // or ATS "full-time" facet on an internship posting).
  if (
    fromTitle &&
    fromTitle !== 'Full-time' &&
    fromTitle !== 'Contract' &&
    fromEmployment === 'Full-time'
  ) {
    return fromTitle;
  }

  const titleNorm = normalize(String(input.title || ''));
  if (
    fromEmployment &&
    !(fromEmployment === 'Contract' && CONTRACT_FALSE_POSITIVE.test(titleNorm))
  ) {
    return fromEmployment;
  }
  if (fromTitle) return fromTitle;
  if ((input.level || '').trim() === 'Internship') return 'Internship';
  return 'Full-time';
}
