/**
 * Smoke tests for sanitizeJobTitle.
 * Run: npx tsx src/lib/sanitizeJobTitle.test.ts
 */
import { sanitizeJobTitle } from './sanitizeJobTitle';

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
    'Founding Team MemberForward Deployed Engineer London',
  ],
  ['View job', ''],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = sanitizeJobTitle(input);
  if (got !== want) {
    failed++;
    console.error(`FAIL: ${JSON.stringify(input)} → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok: ${want}`);
  }
}
if (failed) process.exit(1);
console.log(`\nAll ${cases.length} title sanitize checks passed.`);
