/**
 * Strip ATS department labels that are offices/team codenames, not job functions.
 * UI shows `department` when present, so junk like "Recruitment Manila",
 * "Go to Market", or "Co-Sec - Centre of Excellence - CD0404" surfaces as
 * if it were a sector/category.
 */
import { ALLOWED_SECTORS } from './constants';

const ALLOWED_SECTOR_SET = new Set<string>(ALLOWED_SECTORS);

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
        .replace(/^\d{3,6}\s*[-–—:]\s*/, '')
        .replace(/^\d{3,6}\s+/, '')
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
        compact === 'alldepartments' ||
        compact === 'various' ||
        spaced === 'all departments' ||
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

    // Workday / finance "All Cost Centers" is not a function
    if (/^(all\s+)?cost\s+cent(er|re)s?$/.test(spaced) || compact === 'kiosk') {
        return null;
    }

    // Convenience / grocery store location names (Recruitee etc. put store in department)
    // e.g. "MACE Newgate", "SPAR Little Island", "Londis Castlebar", "EUROSPAR Fairview"
    if (
        /^(mace|spar|eurospar|londis|centra|supervalu|super\s*valu|maxol|costcutter|daybreak)\b/.test(
            spaced
        ) &&
        spaced.split(' ').length >= 2
    ) {
        return null;
    }
    // Franchise / group trading names used as department
    if (
        /\b(retail group|o'?hare retail|corrib oil|tirlan)\b/.test(spaced) ||
        /^(spar|eurospar|londis|mace|centra)\b.+\(.*\)$/.test(spaced)
    ) {
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

    // Collapse repeated "Property - Property - Property" ATS dumps
    const hyphenParts = cleaned.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
    if (hyphenParts.length >= 4) {
        const uniq = [...new Set(hyphenParts.map((p) => p.toLowerCase()))];
        if (uniq.length <= 2) {
            cleaned = hyphenParts[hyphenParts.length - 1];
            if (/^\d+$/.test(cleaned) && hyphenParts.length >= 2) {
                cleaned = hyphenParts[hyphenParts.length - 2];
            }
        } else if (cleaned.length > 70) {
            const lastHuman = [...hyphenParts].reverse().find((p) => !/^\d+$/.test(p));
            if (lastHuman && lastHuman.length <= 60) cleaned = lastHuman;
        }
    }

    if (cleaned.length > 80) return null;

    return cleaned;
}

/** Map common ATS department aliases onto the 25 display sectors. */
const DEPARTMENT_ALIASES: Record<string, string> = {
    it: 'Engineering (Software)',
    tech: 'Engineering (Software)',
    technology: 'Engineering (Software)',
    digital: 'Engineering (Software)',
    software: 'Engineering (Software)',
    'software engineering': 'Engineering (Software)',
    devops: 'Engineering (Software)',
    cloud: 'Engineering (Software)',
    qa: 'Engineering (Software)',
    hardware: 'Engineering (Hardware)',
    engineering: 'Engineering (Other)',
    'r&d': 'Research (Technical)',
    rd: 'Research (Technical)',
    research: 'Research (Technical)',
    hr: 'HR / People',
    'human resources': 'HR / People',
    people: 'HR / People',
    talent: 'HR / People',
    nhs: 'Healthcare',
    nursing: 'Healthcare',
    clinical: 'Healthcare',
    medical: 'Healthcare',
    psychiatry: 'Healthcare',
    doctors: 'Healthcare',
    'acute doctors': 'Healthcare',
    finance: 'Finance',
    accounting: 'Finance',
    underwriting: 'Finance',
    audit: 'Finance',
    tax: 'Finance',
    legal: 'Legal',
    sales: 'Sales & Partnerships',
    commercial: 'Sales & Partnerships',
    revenue: 'Sales & Partnerships',
    marketing: 'Marketing & PR',
    pr: 'Marketing & PR',
    growth: 'Marketing & PR',
    retail: 'Retail & Hospitality',
    hospitality: 'Retail & Hospitality',
    'store colleague': 'Retail & Hospitality',
    operations: 'Operations',
    ops: 'Operations',
    product: 'Product Management',
    design: 'Design',
    ux: 'Design',
    ui: 'Design',
    data: 'Data',
    infrastructure: 'Construction & Infrastructure',
    construction: 'Construction & Infrastructure',
    'real estate': 'Construction & Infrastructure',
    bim: 'Construction & Infrastructure',
    logistics: 'Logistics & Transport',
    pmo: 'Project Management',
    'project management': 'Project Management',
    consulting: 'Business & Strategy',
    strategy: 'Business & Strategy',
    'customer success': 'Customer Success',
    pharmaceutical: 'Pharmaceutical',
    pharma: 'Pharmaceutical',
    'social care': 'Healthcare & Social Care',
};

function matchAllowedSector(value: string): string | null {
    if (ALLOWED_SECTOR_SET.has(value)) return value;
    const lower = value.toLowerCase();
    for (const allowed of ALLOWED_SECTORS) {
        if (allowed.toLowerCase() === lower) return allowed;
    }
    return null;
}

function aliasForDepartment(cleaned: string): string | undefined {
    const spaced = normalizeSpaced(cleaned).replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
    if (DEPARTMENT_ALIASES[spaced]) return DEPARTMENT_ALIASES[spaced];
    const stripped = spaced
        .replace(/\b(team|department|dept|group|function|division|unit|services?|management)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (stripped && DEPARTMENT_ALIASES[stripped]) return DEPARTMENT_ALIASES[stripped];
    return undefined;
}

/**
 * Persist only allowlisted sector terms for display.
 * Unknown ATS labels fall back to the job's inferred sector.
 */
export function canonicalJobDepartment(
    department: string | null | undefined,
    sector: string | null | undefined,
): string {
    const fallback = matchAllowedSector(String(sector || '').trim()) || 'Other';
    const cleaned = sanitizeJobDepartment(department);
    if (!cleaned) return fallback;
    const allowed = matchAllowedSector(cleaned);
    if (allowed) return allowed;
    const alias = aliasForDepartment(cleaned);
    if (alias && ALLOWED_SECTOR_SET.has(alias)) return alias;
    return fallback;
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
