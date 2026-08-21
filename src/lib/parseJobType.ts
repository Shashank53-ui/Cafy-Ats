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

  if (/\b(placement scheme|industrial placement|year in industry|sandwich year)\b/.test(l)) {
    return 'Placement scheme';
  }

  if (/\b(internships?|\bintern\b|co-?op|graduate (scheme|program|programme)|student placement)\b/.test(l)) {
    return 'Internship';
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

/**
 * Parse ATS employment type into an allowlisted job type.
 * Prefer short employment fields; when given an array, try shorter parts first
 * so titles do not drown out `employmentType: "Full-time"`.
 */
export function parseJobType(raw?: unknown): AllowedJobType | null {
  const parts = partsFrom(raw);
  if (!parts.length) return null;

  const ordered = [...parts].sort((a, b) => a.length - b.length);
  for (const part of ordered) {
    const hit = classifyOne(part);
    if (hit && ALLOWED.has(hit)) return hit;
  }
  return null;
}
