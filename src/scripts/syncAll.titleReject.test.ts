/**
 * Smoke tests for Phase 1 title-reject reason codes.
 * Run: npx tsx src/scripts/syncAll.titleReject.test.ts
 */
import { getJobTitleRejectReason, isValidJobTitle } from './syncAll';

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(msg);
}

assert(getJobTitleRejectReason('') === 'title_too_short', 'empty → title_too_short');
assert(getJobTitleRejectReason('ab') === 'title_too_short', 'short → title_too_short');
assert(getJobTitleRejectReason('Careers') === 'title_junk', 'junk → title_junk');
assert(getJobTitleRejectReason('Retail Assistant') === 'title_low_profile', 'retail → title_low_profile');
assert(getJobTitleRejectReason('Warehouse Operative') === 'title_low_profile', 'warehouse → title_low_profile');
assert(getJobTitleRejectReason('Senior Software Engineer') === null, 'real title → null');
assert(isValidJobTitle('Senior Software Engineer') === true, 'isValid true');
assert(isValidJobTitle('Security Guard') === false, 'isValid false for low profile');

console.log('syncAll.titleReject.test.ts — all passed');
