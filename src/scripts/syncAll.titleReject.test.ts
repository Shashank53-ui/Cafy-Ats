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
assert(getJobTitleRejectReason('Relocate to Australia: Principal Engineer') === 'title_relocate_abroad', 'relocate → title_relocate_abroad');
assert(getJobTitleRejectReason('General Practitioner | Fast-Track Your Move to Australia') === 'title_relocate_abroad', 'fast-track AU → title_relocate_abroad');
assert(isValidJobTitle('Staff Nurse - London') === true, 'nurse is valid');
assert(isValidJobTitle('Security Guard') === false, 'isValid false for low profile');

console.log('syncAll.titleReject.test.ts — all passed');
