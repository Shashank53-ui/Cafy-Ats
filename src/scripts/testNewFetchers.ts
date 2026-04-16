import { FETCHERS } from './syncAll';

const TEST_TOKENS: Record<string, string[]> = {
    jobvite: ['innocent', 'double-negative-visual-effects', 'moneycorp'],
    avature: ['siemens', 'metrobank'],
    teamtailor_html: ['depop', 'addisonlee', 'breathebatterytechnologies'],
};

const ALLOW_ZERO_RESULTS = new Set(['avature']);

async function run(): Promise<void> {
    for (const [provider, tokens] of Object.entries(TEST_TOKENS)) {
        const fetcher = FETCHERS[provider];
        if (!fetcher) {
            console.error(`FAIL: missing fetcher for provider ${provider}`);
            process.exit(1);
        }

        let jobs: Array<Record<string, unknown>> = [];
        let usedToken = '';

        for (const token of tokens) {
            const result = await fetcher(token);
            console.log(`${provider} (${token}): ${result.length} jobs`);
            if (result.length > 0) {
                jobs = result as Array<Record<string, unknown>>;
                usedToken = token;
                break;
            }
        }

        if (jobs.length === 0) {
            if (ALLOW_ZERO_RESULTS.has(provider)) {
                console.warn(`WARN: ${provider} returned 0 jobs for all tokens (allowed soft-fail)`);
                continue;
            }
            console.error(`FAIL: ${provider} returned 0 jobs for all tokens`);
            process.exit(1);
        }

        const first = jobs[0];
        const required = ['title', 'url', 'location'];
        for (const field of required) {
            if (!first[field]) {
                console.error(`FAIL: ${provider} job missing field: ${field}`);
                console.error('Got:', JSON.stringify(first, null, 2));
                process.exit(1);
            }
        }

        console.log(`OK: ${provider} (${usedToken}) - sample: ${String(first.title)} | ${String(first.location)}`);
    }
}

run().catch((error) => {
    console.error('FAIL: test runner crashed', error);
    process.exit(1);
});
