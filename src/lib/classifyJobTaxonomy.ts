import { ALLOWED_SECTORS } from './constants';
import { inferJobSector } from './inferJobSector';
import { canonicalJobDepartment } from './sanitizeJobDepartment';

const ALLOWED_SECTOR_SET = new Set<string>(ALLOWED_SECTORS);

/** Clamp any label to the 25 display sectors. Unknown → Other. */
export function clampAllowedSector(sector: string | null | undefined): string {
    const s = String(sector || '').trim();
    return ALLOWED_SECTOR_SET.has(s) ? s : 'Other';
}

/**
 * Single persist gate for `jobs.sector` and `jobs.department`.
 * Both fields are always an ALLOWED_SECTORS value (never junk, never blank).
 */
export function classifyJobTaxonomy(
    title: string,
    rawDepartment?: string | null,
    companySector?: string | null,
): { sector: string; department: string } {
    const sector = clampAllowedSector(
        inferJobSector(title, rawDepartment, companySector),
    );
    return {
        sector,
        department: canonicalJobDepartment(rawDepartment, sector),
    };
}
