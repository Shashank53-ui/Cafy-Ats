/**
 * Smoke tests for ATS department sanitization.
 * Run: npx tsx src/lib/sanitizeJobDepartment.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { isGoToMarketDepartment, sanitizeJobDepartment } from './sanitizeJobDepartment';

test('nulls placeholder departments', () => {
  assert.equal(sanitizeJobDepartment('Not Specified'), null);
  assert.equal(sanitizeJobDepartment('not specified'), null);
  assert.equal(sanitizeJobDepartment('N/A'), null);
  assert.equal(sanitizeJobDepartment('General'), null);
  assert.equal(sanitizeJobDepartment('Unknown'), null);
  assert.equal(sanitizeJobDepartment('TBD'), null);
});

test('nulls Recruitment Manila office labels', () => {
  assert.equal(sanitizeJobDepartment('Recruitment Manila'), null);
  assert.equal(sanitizeJobDepartment('RecruitmentManila'), null);
  assert.equal(sanitizeJobDepartment('recruitment  manila'), null);
});

test('nulls Go-to-Market / GTM team labels', () => {
  assert.equal(sanitizeJobDepartment('Go to Market'), null);
  assert.equal(sanitizeJobDepartment('Go-To-Market'), null);
  assert.equal(sanitizeJobDepartment('GoTo Market'), null);
  assert.equal(sanitizeJobDepartment('GTM'), null);
  assert.equal(sanitizeJobDepartment('Cloud Go-To-Market (GTM)'), null);
});

test('keeps real departments', () => {
  assert.equal(sanitizeJobDepartment('Engineering'), 'Engineering');
  assert.equal(sanitizeJobDepartment('People'), 'People');
  assert.equal(sanitizeJobDepartment('Sales'), 'Sales');
  assert.equal(sanitizeJobDepartment('IT'), 'IT');
  assert.equal(sanitizeJobDepartment('HR'), 'HR');
  assert.equal(sanitizeJobDepartment('R&D'), 'R&D');
  assert.equal(sanitizeJobDepartment('NHS'), 'NHS');
});

test('nulls opaque org codes like GBO', () => {
  assert.equal(sanitizeJobDepartment('GBO'), null);
  assert.equal(sanitizeJobDepartment('GTO'), null);
  assert.equal(sanitizeJobDepartment('HSS'), null);
  assert.equal(sanitizeJobDepartment('INVENT'), null);
});

test('nulls Co-Sec / Centre of Excellence cost-center labels', () => {
  assert.equal(sanitizeJobDepartment('Co-Sec - Centre of Excellence - CD0404'), null);
  assert.equal(sanitizeJobDepartment('Audit Centre of Excellence (ACE)'), null);
  assert.equal(sanitizeJobDepartment('COE Regulatory Reporting - CD0401'), null);
});

test('strips trailing cost-center codes but keeps human label', () => {
  assert.equal(sanitizeJobDepartment('Investment Management - CD0339'), 'Investment Management');
  assert.equal(sanitizeJobDepartment('Engineering K207'), 'Engineering');
  assert.equal(sanitizeJobDepartment('Commercial K203'), 'Commercial');
  assert.equal(sanitizeJobDepartment('Transfer Agency - CD0108'), 'Transfer Agency');
  assert.equal(sanitizeJobDepartment('BIM K201'), 'BIM');
  assert.equal(sanitizeJobDepartment('Digital Services - G - UI1314'), 'Digital Services');
  assert.equal(sanitizeJobDepartment('People & Development - Group - UI1101'), 'People & Development');
});

test('keeps short English department words', () => {
  assert.equal(sanitizeJobDepartment('Bank'), 'Bank');
  assert.equal(sanitizeJobDepartment('Tech'), 'Tech');
  assert.equal(sanitizeJobDepartment('Growth'), 'Growth');
  assert.equal(sanitizeJobDepartment('Cloud'), 'Cloud');
  assert.equal(sanitizeJobDepartment('Dublin'), 'Dublin');
});

test('nulls business-unit names like Asiera', () => {
  assert.equal(sanitizeJobDepartment('Asiera'), null);
});

test('nulls convenience-store location departments', () => {
  assert.equal(sanitizeJobDepartment('MACE Newgate'), null);
  assert.equal(sanitizeJobDepartment('MACE Sallynoggin'), null);
  assert.equal(sanitizeJobDepartment('SPAR Little Island'), null);
  assert.equal(sanitizeJobDepartment('EUROSPAR Fairview'), null);
  assert.equal(sanitizeJobDepartment('Londis Castlebar'), null);
  assert.equal(sanitizeJobDepartment('SPAR Westport (Corrib Oil)'), null);
  assert.equal(sanitizeJobDepartment("O'Hare Retail Group"), null);
  assert.equal(sanitizeJobDepartment('MACE'), null); // opaque brand code → sector fallback
});

test('strips HQU- org prefixes', () => {
  assert.equal(sanitizeJobDepartment('HQU-COM - Group Commercial'), 'Group Commercial');
  assert.equal(sanitizeJobDepartment('HQU-ITC - IT Team'), 'IT Team');
  assert.equal(sanitizeJobDepartment('HQU-HRU - Human Resources'), 'Human Resources');
});

test('nulls cost-center and kiosk placeholders', () => {
  assert.equal(sanitizeJobDepartment('All Cost Centers'), null);
  assert.equal(sanitizeJobDepartment('Cost Centers'), null);
  assert.equal(sanitizeJobDepartment('Kiosk'), null);
});

test('strips leading GL / Workday numbers', () => {
  assert.equal(sanitizeJobDepartment('30000 - DTC Digital Experience'), 'DTC Digital Experience');
  assert.equal(sanitizeJobDepartment('1340 Customer Success Management'), 'Customer Success Management');
  assert.equal(sanitizeJobDepartment('80000 - Accounting'), 'Accounting');
});

test('detects GTM departments', () => {
  assert.equal(isGoToMarketDepartment('Go to Market'), true);
  assert.equal(isGoToMarketDepartment('Engineering'), false);
});
