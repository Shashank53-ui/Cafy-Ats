// Shared allowlists for preferences validation
// Used in both PreferencesForm.tsx (UI) and preferences/actions.ts (server validation)

/** Employment type (Full-time / Contract / …) — not seniority. */
export const ALLOWED_JOB_TYPES = [
    'Full-time',
    'Part-time',
    'Contract',
    'Internship',
    'Placement scheme',
] as const;

/** Seniority / catalog level — same values as preferences + jobs.level. */
export const ALLOWED_JOB_LEVELS = [
    'Entry Level',
    'Junior',
    'Mid Level',
    'Senior',
] as const;

export type AllowedJobLevel = (typeof ALLOWED_JOB_LEVELS)[number];

export const ALLOWED_LOCATIONS = [
    'London',
    'Rest of UK',
    'Scotland',
    'Wales',
] as const;

export const ALLOWED_SECTORS = [
    'Business & Strategy',
    'Construction & Infrastructure',
    'Customer Success',
    'Data',
    'Design',
    'Engineering (Hardware)',
    'Engineering (Other)',
    'Engineering (Software)',
    'Finance',
    'Healthcare',
    'Healthcare & Social Care',
    'HR / People',
    'Legal',
    'Logistics & Transport',
    'Marketing & PR',
    'Media & Journalism',
    'Operations',
    'Other',
    'Pharmaceutical',
    'Product Management',
    'Project Management',
    'Research (Non-technical)',
    'Research (Technical)',
    'Retail & Hospitality',
    'Sales & Partnerships',
] as const;
