/**
 * Merge title-first rules + model embedding into a single business-safe sector.
 *
 * Policy:
 *   1. If rules return a clear sector (not Other) → use rules
 *   2. Else if embedding is allowlisted and title shares tokens with that
 *      sector's prototype / label → use embedding
 *   3. Else if embedding is a high-precision sector → use embedding
 *      (fills Other without Soft/Business/Design poison)
 *   4. Else → Other
 */
import { ALLOWED_SECTORS } from './constants';
import { SECTOR_PROTOTYPES, type AllowedSector } from './sectorPrototypes';

const ALLOWED = new Set<string>(ALLOWED_SECTORS);

/** High-precision sectors safe to apply when rules are Other (no title support). */
const TRUST_EMB_WITHOUT_SUPPORT = new Set([
  'Finance',
  'Legal',
  'HR / People',
  'Construction & Infrastructure',
  'Sales & Partnerships',
  'Logistics & Transport',
  'Operations',
  'Retail & Hospitality',
  'Pharmaceutical',
  'Media & Journalism',
  'Research (Technical)',
  'Research (Non-technical)',
  'Healthcare & Social Care',
]);

const STOP = new Set([
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

function tokens(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** True if the title shares enough substance with the sector prototype. */
export function embeddingSupportedByTitle(title: string, embeddingSector: string): boolean {
  if (!ALLOWED.has(embeddingSector) || embeddingSector === 'Other') return false;
  const proto = SECTOR_PROTOTYPES[embeddingSector as AllowedSector];
  if (!proto) return false;
  const hay = `${embeddingSector} ${proto.base} ${proto.examples.join(' ')}`.toLowerCase();
  const titleToks = tokens(title);
  if (titleToks.length === 0) return false;
  const hits = titleToks.filter((w) => hay.includes(w));
  return hits.length >= 1;
}

export type SectorMergeSource = 'rules' | 'embedding' | 'other';

export function mergeJobSector(
  rulesSector: string | null | undefined,
  embeddingSector: string | null | undefined,
  title: string,
): { sector: string; source: SectorMergeSource } {
  const rules = String(rulesSector || '').trim();
  const emb = String(embeddingSector || '').trim();

  const rulesOk = ALLOWED.has(rules) && rules !== 'Other';
  if (rulesOk) {
    return { sector: rules, source: 'rules' };
  }

  const embAllowed = ALLOWED.has(emb) && emb !== 'Other';
  if (embAllowed && embeddingSupportedByTitle(title, emb)) {
    return { sector: emb, source: 'embedding' };
  }

  if (embAllowed && TRUST_EMB_WITHOUT_SUPPORT.has(emb)) {
    return { sector: emb, source: 'embedding' };
  }

  if (ALLOWED.has(rules)) return { sector: rules, source: 'other' };
  return { sector: 'Other', source: 'other' };
}
