/**
 * Run: npx tsx src/lib/closedAtsBoards.test.ts
 */
import assert from 'node:assert/strict';
import { parseAtsJobUrl } from './closedAtsBoards';

function check(name: string, url: string, expected: { provider: string; board: string; jobId: string } | null) {
  const got = parseAtsJobUrl(url);
  if (expected === null) {
    assert.equal(got, null, name);
    return;
  }
  assert.equal(got?.provider, expected.provider, `${name} provider`);
  assert.equal(got?.board, expected.board, `${name} board`);
  assert.equal(got?.jobId, expected.jobId, `${name} jobId`);
}

check('greenhouse', 'https://job-boards.greenhouse.io/carbonchain/jobs/6121104004', {
  provider: 'greenhouse',
  board: 'carbonchain',
  jobId: '6121104004',
});
check('lever eu', 'https://jobs.eu.lever.co/controlai/3a5dfcaa-d138-4728-b937-626c6dec5d01', {
  provider: 'lever',
  board: 'controlai',
  jobId: '3a5dfcaa-d138-4728-b937-626c6dec5d01',
});
check('ashby', 'https://jobs.ashbyhq.com/9fin/01140ffd-b8fe-4933-8d80-af96c6db5cdf', {
  provider: 'ashby',
  board: '9fin',
  jobId: '01140ffd-b8fe-4933-8d80-af96c6db5cdf',
});
check('workable shortlink', 'https://apply.workable.com/j/0012BAE925', {
  provider: 'workable',
  board: '',
  jobId: '0012BAE925',
});
check('workable account', 'https://apply.workable.com/acme/j/00ABEAD161/', {
  provider: 'workable',
  board: 'acme',
  jobId: '00ABEAD161',
});
check('smartrecruiters', 'https://jobs.smartrecruiters.com/AbbVie/3743990015072166', {
  provider: 'smartrecruiters',
  board: 'AbbVie',
  jobId: '3743990015072166',
});
check('pinpoint', 'https://accelercomm.pinpointhq.com/en/postings/23648361-8621-48da-9fae-91073269bea2', {
  provider: 'pinpoint',
  board: 'accelercomm',
  jobId: '23648361-8621-48da-9fae-91073269bea2',
});
check('breezy', 'https://archangellightworks.breezy.hr/p/137beb871cdc01-optical-ait-engineer', {
  provider: 'breezy',
  board: 'archangellightworks',
  jobId: '137beb871cdc01-optical-ait-engineer',
});
check('recruitee', 'https://adzuna.recruitee.com/o/senior-marketer-sample-london', {
  provider: 'recruitee',
  board: 'adzuna',
  jobId: 'senior-marketer-sample-london',
});
check('bamboohr', 'https://applied.bamboohr.com/careers/465', {
  provider: 'bamboohr',
  board: 'applied',
  jobId: '465',
});
check('personio', 'https://elgin-energy.jobs.personio.de/job/2733509?display=en', {
  provider: 'personio',
  board: 'elgin-energy',
  jobId: '2733509',
});
check('teamtailor', 'https://addisonlee.teamtailor.com/jobs/7877178-strategic-account-manager', {
  provider: 'teamtailor',
  board: 'addisonlee',
  jobId: '7877178',
});
check('jobvite', 'https://jobs.jobvite.com/double-negative-visual-effects/job/o0LQzfwU', {
  provider: 'jobvite',
  board: 'double-negative-visual-effects',
  jobId: 'o0LQzfwU',
});
check('unknown', 'https://careers.tesco.com/job/123', null);

console.log('closedAtsBoards.parseAtsJobUrl ok');
