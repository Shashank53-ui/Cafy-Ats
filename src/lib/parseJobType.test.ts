import {
  extractEmploymentSnippet,
  inferJobTypeFromListing,
  jobTypeFromWeeklyHours,
  parseHoursPerWeek,
  parseJobType,
  resolveJobType,
} from './parseJobType';
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
  ['Graduate Placement - Technical Purchasing (12-24 Months)', 'Placement scheme'],
  ['Caterlink - Chef Manager - Co-op Academy Delius', null],
  ['Caterlink - Chef - COOP Academy Grange', null],
  ['Software Engineer Co-op Intern', 'Internship'],
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
  [{ title: 'Analyst', level: 'Entry Level' }, 'Full-time'],
  [{ employment: 'Part-time', title: 'Engineer' }, 'Part-time'],
  [{ title: 'Contract Manager' }, 'Full-time'], // role title, not employment Contract
  [{ employment: 'Contract', title: 'Senior Contracts Manager:Rail projects' }, 'Full-time'],
  [{ title: 'Graduate Placement - Technical Purchasing (12-24 Months)', level: 'Entry Level' }, 'Placement scheme'],
  [{ title: 'Caterlink - Chef Manager - Co-op Academy Delius', level: 'Mid Level' }, 'Full-time'],
  [{ employment: 'Full-time', title: 'Software Engineer - Intern' }, 'Internship'],
  [{ employment: 'Full-time', title: 'Part Time Care Assistant' }, 'Part-time'],
  [{ employment: 'Full-time', title: 'Care Assistant - Bank - Care Home' }, 'Part-time'],
  [{ title: 'Registered Nurse (RGN) - Bank' }, 'Part-time'],
  [{ employment: 'Full-time', title: 'Software Engineer (Contract)' }, 'Contract'],
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

const snippetCases: Array<[string, string | null]> = [
  ['Permanent\nFull time - 37.5 hours per week', 'Permanent Full time - 37.5 hours per week'],
  [
    'Staff Nurse\nNHS Trust\nThis post is offered on an Agenda for Change contract with standard terms and conditions of employment for the successful candidate after interview.',
    null,
  ],
  ['Equal opportunities employer. Contract of employment issued on start.', null],
];

for (const [input, expect] of snippetCases) {
  const got = extractEmploymentSnippet(input);
  if (got !== expect) {
    failed++;
    console.error(`FAIL snippet: ${JSON.stringify(input)} → ${JSON.stringify(got)}, want ${JSON.stringify(expect)}`);
  } else {
    console.log(`ok snippet: ${JSON.stringify(input.slice(0, 40))} → ${got}`);
  }
}

const listingCases: Array<[{ employmentField?: unknown; cardText?: string }, string | null]> = [
  [{ employmentField: 'Employment type: Full Time' }, 'Full-time'],
  [{ employmentField: 'Contract type: Permanent' }, 'Full-time'],
  [{ cardText: 'Permanent\nPart time' }, 'Part-time'],
  [{ cardText: 'Sales Advisor\n20 hrs p/w' }, 'Part-time'],
  [{ cardText: 'Sales Advisor\n36 hrs p/w' }, 'Full-time'],
  [
    {
      cardText:
        'Software Engineer\nPlease read the contract of employment and terms and conditions before applying. This is a permanent position.',
    },
    null,
  ],
  [{ employmentField: 'Full-time', cardText: 'part time mentioned in a long legal footer that is ignored' }, 'Full-time'],
];

for (const [input, expect] of listingCases) {
  const got = inferJobTypeFromListing(input);
  if (got !== expect) {
    failed++;
    console.error(`FAIL listing: ${JSON.stringify(input)} → ${got}, want ${expect}`);
  } else {
    console.log(`ok listing: ${JSON.stringify(input)} → ${got}`);
  }
}

if (parseHoursPerWeek('36 hrs p/w') !== 36 || jobTypeFromWeeklyHours(20) !== 'Part-time') {
  failed++;
  console.error('FAIL hours helpers');
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log(
  `\nAll ${cases.length} parseJobType + ${resolveCases.length} resolveJobType + ${snippetCases.length} snippet + ${listingCases.length} listing checks passed.`,
);
