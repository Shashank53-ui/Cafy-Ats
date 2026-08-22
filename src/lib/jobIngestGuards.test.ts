/**
 * Regression guards for ingest failure modes (Molten portfolio, relocate, poison).
 * Run: npx tsx src/lib/jobIngestGuards.test.ts
 */
import assert from 'node:assert/strict';
import {
  getIngestRejectReason,
  isForeignEmployerJobUrl,
  isRelocateAbroadTitle,
  sanitizeCompanySectorForInference,
} from './jobIngestGuards';
import { sanitizeJobTitle } from './sanitizeJobTitle';
import { isUKJob } from './ukFilter';
import { classifyJobTaxonomy } from './classifyJobTaxonomy';

let failed = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    failed++;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`ok: ${name}`);
  }
}

// Dirty aggregator titles
check(
  'sanitize strips added/View job',
  sanitizeJobTitle(
    'Revolut Phone Support Specialist - Arabic London, UK added 19-08-2026 View job',
  ) === 'Revolut Phone Support Specialist - Arabic London, UK',
);

// Relocate abroad
check('relocate Australia detected', isRelocateAbroadTitle('Relocate to Australia: Principal Engineer'));
check(
  'relocate rejected by UK filter even with London',
  isUKJob({
    locations: ['London', 'Relocate to Australia: Principal Engineer'],
    isRemote: false,
    isTrustedSource: false,
  }) === false,
);

// Cross-company / portfolio URLs
check(
  'revolut.com foreign to Molten',
  isForeignEmployerJobUrl('https://www.revolut.com/careers/position/abc', {
    trading_name: 'Molten Ventures',
    url: 'https://www.moltenventures.com/opportunities',
    careers_url: 'https://www.moltenventures.com/opportunities',
  }) === true,
);
check(
  'greenhouse/graphcore foreign to Molten',
  isForeignEmployerJobUrl('https://boards.greenhouse.io/graphcore/jobs/123', {
    trading_name: 'Molten Ventures',
    url: 'https://www.moltenventures.com',
    careers_url: 'https://www.moltenventures.com/opportunities',
  }) === true,
);
check(
  'greenhouse/graphcore ok for Graphcore',
  isForeignEmployerJobUrl('https://boards.greenhouse.io/graphcore/jobs/123', {
    trading_name: 'Graphcore',
    ats_board_token: 'graphcore',
    url: 'https://www.graphcore.ai',
  }) === false,
);
check(
  'linkedin job foreign',
  isForeignEmployerJobUrl('https://es.linkedin.com/jobs/view/123', {
    trading_name: 'Cervest',
    url: 'https://www.cervest.earth',
  }) === true,
);

check(
  'ingest gate rejects foreign url',
  getIngestRejectReason(
    { title: 'Engineer', url: 'https://www.revolut.com/careers/x' },
    { trading_name: 'Molten Ventures', url: 'https://www.moltenventures.com' },
  ) === 'foreign_employer_url',
);
check(
  'ingest gate rejects Durham-NC workday path',
  getIngestRejectReason(
    { title: 'GMP Technician', url: 'https://sbm.wd1.myworkdayjobs.com/en-US/job/Durham-NC/x' },
    { trading_name: 'SBM', url: 'https://www.sbmmanagement.com' },
  ) === 'foreign_url_geo',
);
check(
  'ingest gate keeps Workday en-US + London',
  getIngestRejectReason(
    { title: 'Engineer', url: 'https://acme.wd1.myworkdayjobs.com/en-US/External/job/London/x' },
    { trading_name: 'Acme', url: 'https://www.acme.com', ats_board_token: 'acme' },
  ) === null,
);

// company_sector poison
check(
  'weak Software company_sector nulled',
  sanitizeCompanySectorForInference('Engineering (Software)') === null,
);
check(
  'Senior Auditor not poisoned by Soft company sector',
  classifyJobTaxonomy('Senior Auditor', null, 'Engineering (Software)', 'Finance').sector ===
    'Finance',
);
check(
  'Private Banker not poisoned by Soft company sector',
  classifyJobTaxonomy('Junior Private Banker', null, 'Engineering (Software)', null).sector ===
    'Finance',
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log(`\nAll ingest guard checks passed.`);
