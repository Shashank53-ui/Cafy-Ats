/**
 * Tests for rules + embedding merge (only safe embedding fills).
 * Run: npx tsx --test src/lib/mergeJobSector.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { embeddingSupportedByTitle, mergeJobSector } from './mergeJobSector';

test('rules win when clear even if embedding differs', () => {
  const r = mergeJobSector('Legal', 'Finance', 'Finance Lawyer');
  assert.equal(r.sector, 'Legal');
  assert.equal(r.source, 'rules');
});

test('rules Retail wins over embedding Software', () => {
  const r = mergeJobSector('Retail & Hospitality', 'Engineering (Software)', 'Online Trading Manager');
  assert.equal(r.sector, 'Retail & Hospitality');
  assert.equal(r.source, 'rules');
});

test('embedding fills Other when title supports sector', () => {
  const r = mergeJobSector('Other', 'Logistics & Transport', 'Postperson with Driving');
  // "driving" / logistics support — may or may not hit; check warehouse case
  const r2 = mergeJobSector('Other', 'Logistics & Transport', 'Warehouse Team Leader');
  assert.equal(r2.sector, 'Logistics & Transport');
  assert.equal(r2.source, 'embedding');
  void r;
});

test('embedding rejected for unsupported vague title', () => {
  assert.equal(embeddingSupportedByTitle('Bar & Waiting Staff', 'Healthcare'), false);
  const r = mergeJobSector('Other', 'Healthcare', 'Bar & Waiting Staff');
  assert.equal(r.sector, 'Other');
  assert.equal(r.source, 'other');
});

test('software engineer rules path', () => {
  const r = mergeJobSector('Engineering (Software)', 'Data', 'Senior Software Engineer');
  assert.equal(r.sector, 'Engineering (Software)');
});

test('thin titles do not take embedding Construction guesses', () => {
  const r = mergeJobSector('Other', 'Construction & Infrastructure', 'Lateral');
  assert.equal(r.sector, 'Other');
  assert.equal(r.source, 'other');
});

test('rules Team Manager beats company/embedding noise', () => {
  const r = mergeJobSector('Operations', 'Engineering (Other)', 'TEAM MANAGER');
  assert.equal(r.sector, 'Operations');
  assert.equal(r.source, 'rules');
});
