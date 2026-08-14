/**
 * Strip ATS department labels that are offices/team codenames, not job functions.
 * UI shows `department` when present, so junk like "Recruitment Manila",
 * "Go to Market", or "Co-Sec - Centre of Excellence - CD0404" surfaces as
 * if it were a sector/category.
 */

/** Short labels that are real function names — keep even though they look like codes. */
const KEEP_SHORT_DEPARTMENTS = new Set([
    'it', 'hr', 'pr', 'r&d', 'rd', 'ux', 'ui', 'qa', 'fx', 'bi', 'ai', 'ml',
    'pmo', 'bim', 'mep', 'nhs', 'cx', 'eu', 'uk', 'emea', 'apac', 'bd',
    'cs', 'pm', 'de', 'ds', 'fa', 'pe', 're', 'rn', 'md', 'gp', 'sre',
    'devops', 'secops', 'infosec', 'legal', 'risk', 'audit', 'tax', 'ops',
    'finance', 'sales', 'marketing', 'product', 'design', 'data', 'people',
    'engineering', 'commercial', 'retail', 'strategy', 'operations',
    'underwriting', 'hospitality', 'claims', 'health', 'care', 'tech',
    'growth', 'cloud', 'bank', 'site', 'dev',
]);

function normalizeSpaced(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[_/|]+/g, ' ')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripCostCenterSuffix(raw: string): string {
    // "Investment Management - CD0339", "Digital Services - G - UI1314",
    // "Engineering K207", "Commercial K203", "Planning K212",
    // "HQU-COM - Group Commercial", "HQU-ITC - IT Team"
    return raw
        .replace(/^HQU-[A-Z]{2,6}\s*[-–—]\s*/i, '')
        .replace(/\s*[-–—]\s*(group|as|uk|emea|apac)\s*[-–—]\s*[A-Z]{1,6}\d{2,}\b/gi, '')
        .replace(/\s*[-–—]\s*[A-Z]\s*[-–—]\s*[A-Z]{1,6}\d{2,}\b/gi, '')
        .replace(/\s*[-–—]\s*[A-Z]{1,6}\d{2,}\b/gi, '')
        .replace(/\s+[A-Z]?\d?[A-Z]{0,3}K\d{2,4}\b/gi, '')
        .replace(/\s+K\d{2,4}\b/gi, '')
        .replace(/\s*[-–—]\s*(group|as)\s*$/gi, '')
        .replace(/\s*[-–—]\s*$/g, '')
        .replace(/^\s*[-–—]\s*/g, '')
        .trim();
}

export function sanitizeJobDepartment(department: string | null | undefined): string | null {
    const raw = String(department || '').trim();
    if (!raw) return null;

    const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const spaced = normalizeSpaced(raw);

    // Placeholder / empty ATS values — treat as missing so UI can fall back to sector
    if (
        compact === 'notspecified' ||
        compact === 'unspecified' ||
        compact === 'na' ||
        compact === 'none' ||
        compact === 'null' ||
        compact === 'nil' ||
        compact === 'unknown' ||
        compact === 'tbd' ||
        compact === 'general' ||
        spaced === 'n/a' ||
        spaced === 'not available' ||
        spaced === 'not applicable' ||
        spaced === '-' ||
        spaced === '--' ||
        spaced === '.'
    ) {
        return null;
    }

    // Recruitment agency / sourcing office location (not the job's function)
    if (compact === 'recruitmentmanila' || /^recruitment\s*manila\b/.test(spaced)) {
        return null;
    }

    // Named business units / brands mistaken for departments
    if (compact === 'asiera') {
        return null;
    }

    // Go-to-market / GTM is an internal org bucket, not a display category
    if (
        compact === 'gtm' ||
        compact === 'gotomarket' ||
        compact === 'gotomarketgtm' ||
        /^go\s*to\s*market\b/.test(spaced) ||
        /^goto\s*market\b/.test(spaced) ||
        /^gtm\b/.test(spaced) ||
        /\bgo\s*to\s*market\b/.test(spaced) ||
        /\bgoto\s*market\b/.test(spaced)
    ) {
        return null;
    }

    // Company-secretarial / CoE org buckets with internal names
    if (
        /\bco\s*sec\b/.test(spaced) ||
        /\bcentre of excellence\b/.test(spaced) ||
        /\bcenter of excellence\b/.test(spaced) ||
        (/\bcoe\b/.test(spaced) && /\b(regulatory|reporting|cd\d+)/.test(spaced))
    ) {
        return null;
    }

    // Strip trailing cost-center / Workday org codes first so "BIM K201" → "BIM"
    let cleaned = stripCostCenterSuffix(raw);
    if (!cleaned) return null;

    const cleanedSpaced = normalizeSpaced(cleaned);
    const cleanedCompact = cleanedSpaced.replace(/[^a-z0-9]+/g, '');

    // Explicit known opaque org codes (mixed case variants)
    if (/^(gbo|gto|hss|invent|max\s*ahp|ukib\s*ssa|ptd|dts|mtp|tstm|ddmr|alos|actu|spar|pcroi|fsee\s*us|rda|cdao|oper|etp|dag|ois|fmna|pos\s*dnu|sheq)$/i.test(cleanedSpaced)) {
        return null;
    }

    // Opaque ALLCAPS org codes (GBO, HSS, INVENT, MAX AHP, …)
    // Do NOT treat Title-Case English words (Bank, Tech, Growth) as codes.
    if (
        cleaned.length <= 12 &&
        /^[A-Z0-9][A-Z0-9 &]*$/.test(cleaned) &&
        !KEEP_SHORT_DEPARTMENTS.has(cleanedSpaced) &&
        !KEEP_SHORT_DEPARTMENTS.has(cleanedCompact)
    ) {
        return null;
    }

    // After stripping codes, drop if still an internal CoE/Co-Sec style label
    if (
        /\bco\s*sec\b/.test(cleanedSpaced) ||
        /\bcentre of excellence\b/.test(cleanedSpaced) ||
        /\bcenter of excellence\b/.test(cleanedSpaced)
    ) {
        return null;
    }

    // Leftover still contains an embedded cost-center token → too internal
    if (/\b[A-Z]{1,6}\d{3,}\b/.test(cleaned)) {
        return null;
    }

    return cleaned;
}

/** True when department is a GTM-style org label (use as Sales cue for classification). */
export function isGoToMarketDepartment(department: string | null | undefined): boolean {
    const raw = String(department || '').trim();
    if (!raw) return false;
    const spaced = normalizeSpaced(raw);
    return (
        /\bgo\s*to\s*market\b/.test(spaced) ||
        /\bgoto\s*market\b/.test(spaced) ||
        /(^|\s)gtm(\s|$|\()/.test(spaced)
    );
}
