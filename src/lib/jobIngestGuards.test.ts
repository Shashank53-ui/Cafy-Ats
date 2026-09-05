/**
 * Regression guards for ingest failure modes (Molten portfolio, relocate, poison).
 * Run: npx tsx src/lib/jobIngestGuards.test.ts
 */
import assert from 'node:assert/strict';
import {
  getIngestRejectReason,
  isForeignEmployerJobUrl,
  extractSharedAtsBoardSlug,
  atsBoardTokenMatchesCompany,
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
  'fast-track Australia GP detected',
  isRelocateAbroadTitle('General Practitioner | Irish GPs | Fast-Track Your Move to Australia'),
);
check(
  'Canada construction headline detected',
  isRelocateAbroadTitle('Construction Worker - Roads and Bridges - Canada'),
);
check(
  'UK nurse is not relocate-abroad',
  isRelocateAbroadTitle('Staff Nurse - London') === false,
);
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
  'circleci.com apply URL is not foreign to CircleCI',
  isForeignEmployerJobUrl('http://www.circleci.com/careers/jobs/8608742002/?gh_jid=8608742002', {
    trading_name: 'CircleCI',
    url: 'https://circleci.com',
    careers_url: 'https://boards.greenhouse.io/circleci',
    ats_board_token: 'circleci',
  }) === false,
);
check(
  'pinterestcareers.com is not foreign to Pinterest',
  isForeignEmployerJobUrl('https://www.pinterestcareers.com/jobs/123', {
    trading_name: 'Pinterest',
    url: 'https://www.pinterest.com',
    careers_url: 'https://boards.greenhouse.io/pinterest',
    ats_board_token: 'pinterest',
  }) === false,
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
  'Pulse greenhouse is foreign to Digital Autopsy even when token is a Wix URL',
  isForeignEmployerJobUrl('https://job-boards.greenhouse.io/pulse/jobs/6088758003', {
    trading_name: 'Digital Autopsy UK',
    url: 'https://www.digitalautopsy.co.uk/news-and-careers',
    careers_url: 'https://www.digitalautopsy.co.uk/news-and-careers',
    ats_board_token: 'https://www.digitalautopsy.co.uk/news-and-careers/categories/careers',
  }) === true,
);
check(
  'Pulse greenhouse is ok for Pulse',
  isForeignEmployerJobUrl('https://job-boards.greenhouse.io/pulse/jobs/6088758003', {
    trading_name: 'pulse',
    ats_board_token: 'pulse',
    url: 'https://boards.greenhouse.io/pulse',
  }) === false,
);
check(
  'Workable short /j/ link is not foreign for the owning company',
  isForeignEmployerJobUrl('https://apply.workable.com/j/A24057111C', {
    trading_name: 'Starling Bank',
    ats_board_token: 'starling-bank',
    url: 'https://www.starlingbank.com',
  }) === false,
);
check(
  'Greenhouse gh_board=samsara is foreign to Yumpingo',
  isForeignEmployerJobUrl(
    'https://job-boards.greenhouse.io/company/careers/roles/8002357?gh_jid=8002357&gh_board=samsara',
    {
      trading_name: 'Yumpingo',
      ats_board_token: 'yumpingo',
      url: 'https://www.yumpingo.com',
    },
  ) === true,
);
check(
  'Greenhouse gh_board=samsara is ok for Samsara',
  isForeignEmployerJobUrl(
    'https://job-boards.greenhouse.io/company/careers/roles/8002357?gh_board=samsara',
    {
      trading_name: 'Samsara',
      ats_board_token: 'samsara',
      url: 'https://www.samsara.com',
    },
  ) === false,
);
check(
  'Ashby cube board is foreign to BBJ&K',
  isForeignEmployerJobUrl('https://jobs.ashbyhq.com/cube/b314e561-599f-4043-9e6d-64c67ba14ba5', {
    trading_name: 'BBJ&K',
    ats_board_token: '',
    url: 'https://www.bbjk.com',
  }) === true,
);
check(
  'extractSharedAtsBoardSlug reads gh_board',
  extractSharedAtsBoardSlug(
    'https://job-boards.greenhouse.io/company/careers/roles/8002357?gh_board=samsara',
  ) === 'samsara',
);
check(
  'extractSharedAtsBoardSlug ignores Workable /j/ short links',
  extractSharedAtsBoardSlug('https://apply.workable.com/j/A24057111C') === null,
);
check(
  'extractSharedAtsBoardSlug keeps Pulse greenhouse path',
  extractSharedAtsBoardSlug('https://job-boards.greenhouse.io/pulse/jobs/6088758003') === 'pulse',
);
check(
  'board slug matches FanDuel greenhouse',
  atsBoardTokenMatchesCompany('fanduel', 'FanDuel') === true,
);
check(
  'board slug matches Ocado Group',
  atsBoardTokenMatchesCompany('ocadogroup', 'Ocado Group') === true,
);
check(
  'poisoned Luminos breezy does not match Transreport',
  atsBoardTokenMatchesCompany('the-luminos-fund', 'Transreport') === false,
);
check(
  'generic lever/blue does not match Blue Light Card',
  atsBoardTokenMatchesCompany('blue', 'Blue Light Card') === false,
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
