/**
 * testWorkday.ts — Tests the Workday fetcher for UK banks and major companies.
 *
 * Run: npx tsx src/scripts/testWorkday.ts
 */

import { FETCHERS } from './syncAll';
import { isUKJob } from '../lib/ukFilter';
import * as Adapters from '../lib/ukFilterAdapters';

const fetchWorkday = FETCHERS['workday'];

const TEST_COMPANIES: Array<{ name: string; token: string }> = [
    { name: 'Barclays',      token: 'barclays/External_Career_Site_Barclays' },
    { name: 'Lloyds',        token: 'lloydsbankinggroup/LBG_Careers' },
    { name: 'NatWest',       token: 'natwestgroup/NatWest_Careers' },
    { name: 'HSBC',          token: 'hsbc/External' },
    { name: 'Shell',         token: 'shell/ShellCareers' },
    { name: 'CrowdStrike',   token: 'crowdstrike/CrowdStrike_Careers' },
    { name: 'Leidos',        token: 'leidos/Leidos_Careers' },
    { name: 'Zendesk',       token: 'zendesk/zendesk' },
    { name: 'Live Nation',   token: 'livenation/LiveNation' },
    { name: 'Dyson',         token: 'dyson/DysonCareers' },
];

function summariseLocations(jobs: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const j of jobs) {
        const loc = j.location || j.locationsText || '(none)';
        counts[loc] = (counts[loc] || 0) + 1;
    }
    return Object.fromEntries(
        Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    );
}

async function run() {
    console.log('='.repeat(60));
    console.log('  WORKDAY FETCHER TEST');
    console.log('='.repeat(60));

    let totalJobs = 0;
    let companiesWithJobs = 0;

    for (const { name, token } of TEST_COMPANIES) {
        process.stdout.write(`\n[${name}] (${token})\n  Fetching...`);

        try {
            const jobs = await fetchWorkday(token);

            if (jobs.length === 0) {
                console.log(` -> 0 jobs returned`);
                continue;
            }

            // Run UK filter on each job (same as syncAll does)
            const ukJobs = jobs.filter(j => {
                const adapter = (Adapters as any)['workdayToJobLocationInput'];
                const input = adapter ? adapter(j) : { locations: [j.location ?? ''], isRemote: false, isTrustedSource: false };
                return isUKJob(input);
            });

            const nLocationsJobs = jobs.filter(j => /^\d+\s+locations?$/i.test(j.location || ''));
            const verifiedJobs = jobs.filter((j: any) => j.verified);

            console.log(`\n  Raw fetched:     ${jobs.length}`);
            console.log(`  UK filter pass:  ${ukJobs.length}`);
            console.log(`  verified=true:   ${verifiedJobs.length}`);
            console.log(`  "N locations":   ${nLocationsJobs.length}`);
            console.log(`  Top locations:`);
            const locs = summariseLocations(jobs);
            for (const [loc, count] of Object.entries(locs)) {
                console.log(`    ${count.toString().padStart(3)}x  ${loc}`);
            }

            if (ukJobs.length > 0) {
                companiesWithJobs++;
                totalJobs += ukJobs.length;
            }
        } catch (err: any) {
            console.log(` -> ERROR: ${err.message}`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`  SUMMARY`);
    console.log(`  Companies with UK jobs: ${companiesWithJobs} / ${TEST_COMPANIES.length}`);
    console.log(`  Total UK jobs:          ${totalJobs}`);
    console.log('='.repeat(60));
}

run().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
