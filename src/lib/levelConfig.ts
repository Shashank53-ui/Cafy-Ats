/**
 * Config for the 4-level seniority cascade (Entry / Junior / Mid / Senior).
 * Keep lists here — do not scatter magic strings across infer/resolve modules.
 */
import { type AllowedJobLevel } from './constants';

/** Soft years → level (Stage B). Only used when title has no confident hit. */
export const YEARS_TO_LEVEL: {
  entryMax: number;
  juniorMax: number;
  midMax: number;
} = {
  /** 0 → Entry Level */
  entryMax: 0,
  /** 1–2 → Junior */
  juniorMax: 2,
  /** 3–4 → Mid Level; ≥5 → Senior */
  midMax: 4,
};

/** Phrases in requirements that mean Entry Level (no years needed). */
export const ENTRY_PHRASES = [
  'no experience',
  'no prior experience',
  'experience not required',
  'no experience required',
  'fresher',
  'recent graduate',
  'recent graduates',
  'we will train',
  'we train you',
  'full training provided',
  'students welcome',
] as const;

/**
 * Collapse legacy 11-level taxonomy → 4 levels (one-time migration / prefs).
 */
export const LEGACY_LEVEL_MAP: Record<string, AllowedJobLevel> = {
  Internship: 'Entry Level',
  Graduate: 'Entry Level',
  Junior: 'Junior',
  'Mid-level': 'Mid Level',
  'Mid Level': 'Mid Level',
  'Entry Level': 'Entry Level',
  Senior: 'Senior',
  Staff: 'Senior',
  Lead: 'Senior',
  Principal: 'Senior',
  Director: 'Senior',
  VP: 'Senior',
  Executive: 'Senior',
};

export function mapLegacyJobLevel(level: string | null | undefined): AllowedJobLevel | null {
  if (!level?.trim()) return null;
  return LEGACY_LEVEL_MAP[level.trim()] ?? null;
}
