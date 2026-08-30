/**
 * Regression: Ireland-range UK sponsors must keep writing UK jobs.
 * Run: npx tsx src/lib/syncMarket.test.ts
 */
import { inferDefaultSyncMarket, resolveSyncMarket } from './syncMarket';

let failed = 0;
function check(name: string, cond: boolean) {
    if (!cond) {
        failed++;
        console.error(`FAIL: ${name}`);
    } else {
        console.log(`ok: ${name}`);
    }
}

check(
    'Pulse Ireland-range + licensed → both',
    inferDefaultSyncMarket(940003, { licensed_sponsor: 'true' }) === 'both',
);
check(
    'Pulse id as string + licensed → both',
    inferDefaultSyncMarket('940003', { licensed_sponsor: true }) === 'both',
);
check(
    'Ireland-range without licence → ireland',
    inferDefaultSyncMarket(940005, { licensed_sponsor: false }) === 'ireland',
);
check('UK id → uk', inferDefaultSyncMarket(2211, { licensed_sponsor: 'true' }) === 'uk');
check(
    'LinkedIn provider stays ireland',
    inferDefaultSyncMarket(940008, { licensed_sponsor: 'true', ats_provider: 'linkedin' }) ===
        'ireland',
);

check(
    'explicit ireland + licensed sponsor upgrades to both',
    resolveSyncMarket({
        id: 940003,
        sync_market: 'ireland',
        licensed_sponsor: 'true',
        ats_provider: 'greenhouse',
    }) === 'both',
);
check(
    'explicit ireland without licence stays ireland',
    resolveSyncMarket({
        id: 940005,
        sync_market: 'ireland',
        licensed_sponsor: false,
        ats_provider: 'workable',
    }) === 'ireland',
);
check(
    'explicit uk stays uk',
    resolveSyncMarket({ id: 2211, sync_market: 'uk', licensed_sponsor: 'true' }) === 'uk',
);
check(
    'LinkedIn explicit ireland stays ireland even if licensed',
    resolveSyncMarket({
        id: 900001,
        sync_market: 'ireland',
        licensed_sponsor: 'true',
        ats_provider: 'linkedin',
    }) === 'ireland',
);
check(
    'missing sync_market uses licence in Ireland range',
    resolveSyncMarket({
        id: '900027',
        licensed_sponsor: 'true',
        ats_provider: 'greenhouse',
    }) === 'both',
);

if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll sync market checks passed.');
