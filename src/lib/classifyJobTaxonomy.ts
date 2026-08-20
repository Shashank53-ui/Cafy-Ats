import { ALLOWED_SECTORS } from './constants';
import { inferJobSector } from './inferJobSector';
import { mergeJobSector, type SectorMergeSource } from './mergeJobSector';
import { canonicalJobDepartment } from './sanitizeJobDepartment';

const ALLOWED_SECTOR_SET = new Set<string>(ALLOWED_SECTORS);

/** Clamp any label to the 25 display sectors. Unknown → Other. */
export function clampAllowedSector(sector: string | null | undefined): string {
    const s = String(sector || '').trim();
    return ALLOWED_SECTOR_SET.has(s) ? s : 'Other';
}

/**
 * Single persist gate for `jobs.sector` and `jobs.department`.
 * Rules (title-first) win when clear; model embedding only fills Other
 * when the title supports that sector.
 */
export function classifyJobTaxonomy(
    title: string,
    rawDepartment?: string | null,
    companySector?: string | null,
    embeddingSector?: string | null,
): { sector: string; department: string; source: SectorMergeSource } {
    const rulesSector = clampAllowedSector(
        inferJobSector(title, rawDepartment, companySector),
    );
    const { sector, source } = mergeJobSector(rulesSector, embeddingSector, title);
    return {
        sector,
        department: canonicalJobDepartment(rawDepartment, sector),
        source,
    };
}
