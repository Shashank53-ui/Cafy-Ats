/**
 * Smoke tests for sanitizeJobTitle.
 * Run: npx tsx src/lib/sanitizeJobTitle.test.ts
 */
import { sanitizeJobTitle, isUnusableJobTitle } from './sanitizeJobTitle';

const cases: [string, string][] = [
  [
    'Revolut Phone Support Specialist - Arabic London, UK added 19-08-2026 View job',
    'Revolut Phone Support Specialist - Arabic London, UK',
  ],
  [
    'Cervest Junior DevOps Engineer Barcelona, Spain added 30-07-2026 View job',
    'Cervest Junior DevOps Engineer Barcelona, Spain',
  ],
  [
    'Revolut Junior Private Banker Remote added 14-08-2026 Vie',
    'Revolut Junior Private Banker Remote',
  ],
  ['Senior Auditor', 'Senior Auditor'],
  [
    'Founding Team MemberForward Deployed Engineer LondonView job',
    'Founding Team Member Forward Deployed Engineer London',
  ],
  ['View job', ''],
  ['DevOps Engineer', 'DevOps Engineer'],
  [
    'FieldDeployed GxP DirectorMenlo Park, CaliforniaView role→',
    'Field Deployed GxP Director',
  ],
  [
    'GxP Director Menlo Park, California View role',
    'GxP Director',
  ],
  [
    'Join Our Talent Pool: Lift Engineers in Southern England',
    'Lift Engineers in Southern England',
  ],
  [
    'Join Our Talent Pool: Escalator Engineers in London',
    'Escalator Engineers in London',
  ],
  [
    'Join Our Talent Network: Software Engineers',
    'Software Engineers',
  ],
  [
    'Join Our Talent Bank: Electrician',
    'Electrician',
  ],
  [
    'Join Our Talent Pipeline: Data Analysts',
    'Data Analysts',
  ],
  [
    'Join Our Team: Lift Engineers',
    'Lift Engineers',
  ],
  [
    'Candidate Pool: Nurses London',
    'Nurses London',
  ],
  [
    "Join AECOM's Quantity Surveyor Talent Network",
    'Quantity Surveyor',
  ],
  [
    "Join Scissero’s Talent Network",
    '',
  ],
  [
    'We are growing - join our Tax Talent Community - London',
    '',
  ],
  [
    'Future Medical Affairs Leadership Opportunities – Join Our Medical Affairs Talent Leaders Pipeline',
    '',
  ],
  [
    'Game Producer - Talent Pool (EU)',
    'Game Producer',
  ],
  [
    'Client Partner (Leisure Vertical) - Join Our Talent Network',
    'Client Partner (Leisure Vertical)',
  ],
  [
    'H beauty Chester - Join our Talent Community: Assistant Managers',
    'H beauty Chester: Assistant Managers',
  ],
  ['Join our Talent Pool', ''],
  ['Future Talent Pool', ''],
  ['Sales Talent Pool', 'Sales Talent Pool'],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = sanitizeJobTitle(input);
  if (got !== want) {
    failed++;
    console.error(`FAIL: ${JSON.stringify(input)} → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok: ${want || '(empty)'}`);
  }
}
if (failed) process.exit(1);
if (
  !isUnusableJobTitle(
    "Career growthWe’ll help accelerate your career with growth and learning opportunities so you can build your path for success.Learn more",
  )
) {
  console.error('FAIL: marketing blob should be unusable');
  process.exit(1);
}
if (!isUnusableJobTitle('Join our Talent Pool')) {
  console.error('FAIL: bare talent pool should be unusable');
  process.exit(1);
}
if (!isUnusableJobTitle('Sales Talent Pool')) {
  console.error('FAIL: sales talent pool should be unusable');
  process.exit(1);
}
if (isUnusableJobTitle('Senior Software Engineer')) {
  console.error('FAIL: real title should be usable');
  process.exit(1);
}
if (isUnusableJobTitle('Join Our Talent Pool: Lift Engineers in London')) {
  console.error('FAIL: lift engineer talent-pool title should be usable after sanitize');
  process.exit(1);
}
console.log(`\nAll ${cases.length} title sanitize checks passed.`);
