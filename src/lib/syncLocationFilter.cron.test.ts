/**
 * Cron-path location filter smoke tests.
 * Mirrors what /api/cron/sync-jobs → syncAll() uses: isUKJob + isIrelandJob.
 *
 * Run: npx tsx src/lib/syncLocationFilter.cron.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { isUKJob } from './ukFilter';
import { isIrelandJob } from './irelandFilter';

function uk(location: string, isRemote = false) {
  return isUKJob({ locations: [location], isRemote, isTrustedSource: false });
}

function ie(location: string) {
  return isIrelandJob(location);
}

test('cron UK: U.S. Travelling blocked', () => {
  assert.equal(uk('U.S. Travelling'), false);
});

test('cron UK: U.S. blocked', () => {
  assert.equal(uk('U.S.'), false);
});

test('cron UK: United States blocked', () => {
  assert.equal(uk('New York, NY, United States'), false);
});

test('cron UK: US Remote blocked', () => {
  assert.equal(uk('US Remote', true), false);
});

test('cron UK: Remote USA blocked', () => {
  assert.equal(uk('Remote - United States', true), false);
});

test('cron UK: London accepted', () => {
  assert.equal(uk('London'), true);
});

test('cron UK: Remote UK accepted', () => {
  assert.equal(uk('Remote UK', true), true);
});

test('cron IE: United Kingdom blocked from Ireland', () => {
  assert.equal(ie('United Kingdom'), false);
});

test('cron IE: United States blocked from Ireland', () => {
  assert.equal(ie('Atlanta, GA, United States'), false);
});

test('cron IE: U.S. blocked from Ireland', () => {
  assert.equal(ie('U.S. Travelling'), false);
});

test('cron IE: Dublin Ireland accepted', () => {
  assert.equal(ie('Dublin, Ireland'), true);
});

test('cron IE: Cork accepted', () => {
  assert.equal(ie('Cork'), true);
});

test('cron IE: Portugal blocked', () => {
  assert.equal(ie('Portugal'), false);
});

test('cron IE: Amsterdam Netherlands blocked', () => {
  assert.equal(ie('Amsterdam, Netherlands'), false);
});

test('cron IE: Singapore blocked', () => {
  assert.equal(ie('Singapore, Singapore'), false);
});

test('cron IE: Dublin Ohio USA blocked', () => {
  assert.equal(ie('Dublin-Ohio-United States of America'), false);
});
