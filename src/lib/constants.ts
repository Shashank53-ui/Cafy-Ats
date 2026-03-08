// Shared allowlists for preferences validation
// Used in both PreferencesForm.tsx (UI) and preferences/actions.ts (server validation)

export const ALLOWED_JOB_TYPES = [
    'Full-time',
    'Part-time',
    'Internship',
    'Placement scheme',
] as const;

export const ALLOWED_LOCATIONS = [
    'London',
    'Rest of UK',
    'Scotland',
    'Wales',
] as const;

export const ALLOWED_SECTORS = [
    'Business & Strategy',
    'Customer Success',
    'Data',
    'Design',
    'Engineering (Hardware)',
    'Engineering (Other)',
    'Engineering (Software)',
    'Finance',
    'Healthcare',
    'HR / People',
    'Legal',
    'Marketing & PR',
    'Media & Journalism',
    'Operations',
    'Other',
    'Product Management',
    'Project Management',
    'Research (Non-technical)',
    'Research (Technical)',
    'Sales & Partnerships',
] as const;
