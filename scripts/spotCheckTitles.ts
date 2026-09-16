import { inferJobLevelFromTitle } from '../src/lib/inferJobLevel';

const titles = [
  '2027 BNY Summer Internship Program – Office of the COO (Manchester)',
  'Capital Markets COO - Junior Business Manager',
  'Solutions Architect',
  'Enterprise Architect',
  'Identity Security Engineering - SailPoint, Vice President',
  'Staff Nurse - CT',
  'Senior Staff Nurse',
  'Partner Principal Architect, GSI CTO, Google Cloud',
  'QA Automation Engineer Team Lead, Charles River Development , AVP',
  'Mid-level to Senior Software Engineer',
  'Software Engineer',
  'Project Manager',
  'Registered Nurse',
  'Site Reliability Engineer',
];

for (const t of titles) {
  const hit = inferJobLevelFromTitle(t);
  console.log(`${hit?.level ?? 'null'}\t${hit?.source ?? '-'}\t${t}`);
}
