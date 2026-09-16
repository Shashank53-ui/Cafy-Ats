/**
 * 4-level seniority prototypes for embedding classification (stage 3).
 *
 * Exact prototype matches only fire on examples that are unambiguous.
 * Unmarked IC titles (e.g. bare "Software Engineer") are intentionally
 * NOT listed as examples — we only map when 100% sure.
 */
import { ALLOWED_JOB_LEVELS, type AllowedJobLevel } from './constants';

export type { AllowedJobLevel };

export type LevelPrototype = {
  base: string;
  examples: string[];
};

export const LEVEL_PROTOTYPES: Record<AllowedJobLevel, LevelPrototype> = {
  'Entry Level': {
    base: 'Internship, apprenticeship, graduate scheme, or fresher role — training position or first role with no prior professional experience required.',
    examples: [
      'Summer Intern',
      'Software Engineering Intern',
      'Marketing Intern',
      'Placement Student',
      'Industrial Placement',
      'Year in Industry Placement',
      'Undergraduate Intern',
      'Internship Programme',
      'Work Experience Placement',
      'Vacation Scheme',
      'Apprentice',
      'Degree Apprentice',
      'Graduate Software Engineer',
      'Graduate Scheme',
      'Graduate Analyst',
      'Graduate Trainee',
      'Early Careers Programme',
      'Entry Level Analyst',
      'Trainee Accountant',
    ],
  },
  Junior: {
    base: 'Junior individual-contributor role — early career, typically 0–2 years, works under supervision, assistants and many functional executive titles.',
    examples: [
      'Junior Software Developer',
      'Junior Data Analyst',
      'Junior Accountant',
      'Junior Marketing Executive',
      'Junior Designer',
      'Junior Project Coordinator',
      'Sales Assistant',
      'Retail Assistant',
      'Customer Service Assistant',
      'Warehouse Operative',
      'Care Assistant',
      'Kitchen Porter',
      'Junior QA Tester',
      'Account Executive',
      'Sales Executive',
      'Marketing Executive',
      'Shift Lead',
      'Junior Recruitment Consultant',
    ],
  },
  'Mid Level': {
    base: 'Standard individual-contributor professional role with established competency, several years of experience, not a people manager and not senior-graded.',
    examples: [
      'Mid Level Software Engineer',
      'Mid-level Engineer',
      'Intermediate Developer',
      'Mid Level Data Analyst',
      'Mid Level Product Manager',
      'Staff Nurse',
      'Staff Accountant',
      'Assistant Manager',
      'Registered Nurse',
    ],
  },
  Senior: {
    base: 'Senior individual contributor or leadership — deep expertise, architects, staff/principal/lead IC grades, directors, VPs, and C-suite.',
    examples: [
      'Senior Software Engineer',
      'Senior Data Analyst',
      'Senior Product Manager',
      'Solutions Architect',
      'Solution Architect',
      'Software Architect',
      'Cloud Architect',
      'Security Architect',
      'Data Architect',
      'Enterprise Architect',
      'Staff Software Engineer',
      'Staff Engineer',
      'Principal Engineer',
      'Lead Software Engineer',
      'Engineering Manager',
      'Software Engineering Manager',
      'Director of Engineering',
      'Head of Engineering',
      'VP of Engineering',
      'Chief Technology Officer',
      'Managing Director',
      'Chief of Staff',
      'Associate Director of Finance',
      'Senior Consultant',
    ],
  },
};

export function getLevelPrototypeEntries(): { level: AllowedJobLevel; texts: string[] }[] {
  return (ALLOWED_JOB_LEVELS as readonly AllowedJobLevel[]).map((level) => {
    const proto = LEVEL_PROTOTYPES[level];
    return { level, texts: [proto.base, ...proto.examples] };
  });
}
