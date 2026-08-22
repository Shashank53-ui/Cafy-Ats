import { parseJobType, resolveJobType } from './parseJobType';
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
  ['Software Apprentice', 'Internship'],
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

const resolveCases: Array<[{ employment?: unknown; title?: string; level?: string | null }, string]> = [
  [{ title: 'Software Engineer' }, 'Full-time'],
  [{ title: 'Summer Intern' }, 'Internship'],
  [{ title: 'Analyst', level: 'Internship' }, 'Internship'],
  [{ employment: 'Part-time', title: 'Engineer' }, 'Part-time'],
  [{ title: 'Contract Manager' }, 'Full-time'], // role title, not employment Contract
  [{ employment: 'Full-time', title: 'Software Engineer - Intern' }, 'Internship'],
  [{ employment: 'Full-time', title: 'Part Time Care Assistant' }, 'Part-time'],
  [{ employment: 'Full-time', title: 'Care Assistant - Bank - Care Home' }, 'Part-time'],
  [{ title: 'Registered Nurse (RGN) - Bank' }, 'Part-time'],
  [{ employment: 'Full-time', title: 'Software Engineer' }, 'Full-time'],
];

for (const [input, expect] of resolveCases) {
  const got = resolveJobType(input);
  if (got !== expect) {
    failed++;
    console.error(`FAIL resolve: ${JSON.stringify(input)} → ${got}, want ${expect}`);
  } else {
    console.log(`ok resolve: ${JSON.stringify(input)} → ${got}`);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} parseJobType + ${resolveCases.length} resolveJobType checks passed.`);
