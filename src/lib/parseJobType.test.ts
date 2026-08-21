/**
 * Smoke tests for parseJobType.
 * Run: npx tsx src/lib/parseJobType.test.ts
 */
import assert from 'node:assert/strict';
import { parseJobType } from './parseJobType';
import { ALLOWED_JOB_TYPES } from './constants';

const cases: Array<[unknown, string | null]> = [
  [null, null],
  ['', null],
  ['Full-time', 'Full-time'],
  ['FULL_TIME', 'Full-time'],
  ['permanent', 'Full-time'],
  ['Part-time', 'Part-time'],
  ['part time', 'Part-time'],
  ['Internship', 'Internship'],
  ['Summer Intern', 'Internship'],
  ['Industrial Placement', 'Placement scheme'],
  ['Fixed-term', 'Contract'],
  ['Temporary', 'Contract'],
  ['Contract', 'Contract'],
  ['Freelance', 'Contract'],
  // Title false positives must not become Contract
  ['Contract Manager', null],
  ['Senior Contracts Manager - London', null],
  // Array: employment field wins over title
  [['Contract Manager', 'Full-time'], 'Full-time'],
  [['Senior Auditor – Cloud', 'part-time'], 'Part-time'],
  [['Software Engineer', ''], null],
  ['something weird', null],
];

let failed = 0;
for (const [input, expect] of cases) {
  const got = parseJobType(input);
  if (got !== expect) {
    failed++;
    console.error(`FAIL: ${JSON.stringify(input)} → ${JSON.stringify(got)}, want ${JSON.stringify(expect)}`);
  } else {
    console.log(`ok: ${JSON.stringify(input)} → ${got}`);
  }
  if (got && !(ALLOWED_JOB_TYPES as readonly string[]).includes(got)) {
    failed++;
    console.error(`FAIL: ${got} not in ALLOWED_JOB_TYPES`);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} parseJobType checks passed.`);
