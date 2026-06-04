/**
 * testWorkdayStandalone.ts — Self-contained Workday fetch tester.
 * No DB / Playwright / Supabase imports — just raw HTTP to the Workday API.
 *
 * Run: npx tsx src/scripts/testWorkdayStandalone.ts
 */

const UK_FACET_IDS = [
    '29247e57dbaf46fb855b224e03170bc7',  // most tenants
    'f2e609fe92974a55a05fc1cdc2852122',  // some tenants
    'bc33aa31523742670152374cd3c0001a',  // alternate
];

const WDS = ['wd3', 'wd1', 'wd5', 'wd103', 'wd107', 'wd12', 'wd2', 'wd10', 'wd8'];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url: string, options: any, timeoutMs = 12000): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal });
        clearTimeout(timer);
        return res;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

type FetchResult = {
    jobs: Array<{ title: string; location: string; url: string; verified: boolean }>;
    workingEndpoint: string;
    workingFacet: string;
    total: number;
};

async function fetchWorkday(token: string): Promise<FetchResult | null> {
    const parts = token.split('/');
    const slug = parts[0];
    const board = parts.slice(1).join('/');
    if (!slug || !board) return null;

    // Detect wd subdomain from token if it's a URL
    let detectedWd = '';
    const wdMatch = token.match(/\.(wd\d+)\./);
    if (wdMatch) detectedWd = wdMatch[1];

    const wdList = [...WDS];
    if (detectedWd && wdList.includes(detectedWd)) {
        wdList.splice(wdList.indexOf(detectedWd), 1);
        wdList.unshift(detectedWd);
    }

    for (const wd of wdList) {
        const domain = `${slug}.${wd}.myworkdayjobs.com`;
        const apiUrl = `https://${domain}/wday/cxs/${slug}/${board}/jobs`;
        const publicBase = `https://${domain}/en-US/${board}`;

        // Try each facet ID approach
        const facetAttempts = [
            { key: 'locationCountry', ids: [UK_FACET_IDS[0]] },
            { key: 'locationCountry', ids: [UK_FACET_IDS[1], UK_FACET_IDS[2]] },
            { key: 'Location_Country', ids: [UK_FACET_IDS[0]] },
            { key: '', ids: [] }, // no facet fallback
        ];

        for (const { key, ids } of facetAttempts) {
            const appliedFacets: any = key && ids.length ? { [key]: ids } : {};

            try {
                const res = await fetchWithTimeout(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        'Referer': publicBase,
                    },
                    body: JSON.stringify({ appliedFacets, limit: 20, offset: 0, searchText: '' }),
                });

                if (!res.ok) continue;
                const data = await res.json();
                const posts = data?.jobPostings || [];
                if (posts.length === 0) continue;

                const total = data.total || posts.length;
                const facetLabel = key ? `${key}:[${ids.join(',')}]` : 'no-facet';
                console.log(`    Hit: ${domain} | facet=${facetLabel} | page1=${posts.length} total=${total}`);

                // Paginate all jobs
                const allJobs: FetchResult['jobs'] = [];
                let offset = 0;
                const finalFacets = key && ids.length ? { [key]: ids } : {};

                // Sanity-check: only distrust facet if explicit non-UK found
                let facetIsTrusted = key !== '';
                if (facetIsTrusted) {
                    for (const p of posts.slice(0, 20)) {
                        const loc = (p.locationsText || p.bulletFields?.[1] || '').toLowerCase();
                        const isNonUK = loc && !/\d+\s+locations?/.test(loc) && !/remote|flexible|hybrid|anywhere|worldwide|global/.test(loc) && isExplicitNonUK(loc);
                        if (isNonUK) { facetIsTrusted = false; break; }
                    }
                }

                while (offset < total || offset === 0) {
                    let currentPosts = posts;
                    if (offset > 0) {
                        const nextRes = await fetchWithTimeout(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                            body: JSON.stringify({ appliedFacets: finalFacets, limit: 20, offset, searchText: '' }),
                        });
                        if (!nextRes.ok) break;
                        const nd = await nextRes.json();
                        currentPosts = nd.jobPostings || [];
                    }
                    if (currentPosts.length === 0) break;

                    for (const j of currentPosts) {
                        allJobs.push({
                            title: j.title || '',
                            location: j.locationsText || j.bulletFields?.[1] || '',
                            url: `${publicBase}${j.externalPath}`,
                            verified: facetIsTrusted,
                        });
                    }
                    offset += 20;
                    if (offset > 0) await sleep(250);
                    if (offset >= total) break;
                }

                return { jobs: allJobs, workingEndpoint: domain, workingFacet: facetLabel, total };
            } catch {
                continue;
            }
        }
    }

    return null;
}

const NON_UK_PHRASES = [
    'united states', 'usa', ' us,', 'canada', 'india', 'australia', 'germany',
    'france', 'netherlands', 'spain', 'singapore', 'hong kong', 'dubai', 'uae',
    'new york', 'san francisco', 'dallas', 'chicago', 'boston', 'seattle',
    'pune', 'mumbai', 'bengaluru', 'bangalore', 'ireland', 'paris', 'berlin',
];

function isExplicitNonUK(loc: string): boolean {
    return NON_UK_PHRASES.some(p => loc.includes(p));
}

const UK_TERMS = ['london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'edinburgh',
    'bristol', 'cardiff', 'belfast', 'liverpool', 'sheffield', 'united kingdom', ' uk,', 'uk ', ' uk)', 'england', 'scotland', 'wales'];

function isUK(loc: string): boolean {
    const l = loc.toLowerCase();
    return UK_TERMS.some(t => l.includes(t));
}

const TEST_COMPANIES = [
    { name: 'Barclays',      token: 'barclays/External_Career_Site_Barclays' },
    { name: 'Lloyds',        token: 'lloydsbankinggroup/LBG_Careers' },
    { name: 'NatWest',       token: 'natwestgroup/NatWest_Careers' },
    { name: 'HSBC',          token: 'hsbc/External' },
    { name: 'Shell',         token: 'shell/ShellCareers' },
    { name: 'CrowdStrike',   token: 'crowdstrike/CrowdStrike_Careers' },
    { name: 'Dyson',         token: 'dyson/DysonCareers' },
    { name: 'Zendesk',       token: 'zendesk/zendesk' },
    { name: 'Live Nation',   token: 'livenation/LiveNation' },
    { name: 'Leidos',        token: 'leidos/Leidos_Careers' },
];

async function main() {
    console.log('='.repeat(70));
    console.log('  WORKDAY FETCHER TEST — STANDALONE');
    console.log('='.repeat(70));

    let totalUK = 0;
    let companiesOK = 0;

    for (const { name, token } of TEST_COMPANIES) {
        console.log(`\n[${name}] token=${token}`);
        const t0 = Date.now();

        try {
            const result = await fetchWorkday(token);
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

            if (!result) {
                console.log(`  -> NO WORKING ENDPOINT found (${elapsed}s)`);
                continue;
            }

            const { jobs, workingEndpoint, total } = result;
            const ukJobs = jobs.filter(j => j.verified || isUK(j.location));
            const nLocs = jobs.filter(j => /^\d+\s+locations?$/i.test(j.location));
            const trustedCount = jobs.filter(j => j.verified).length;

            console.log(`  -> ${workingEndpoint}`);
            console.log(`     Total from API: ${total} | Fetched: ${jobs.length} | UK-pass: ${ukJobs.length} | verified: ${trustedCount} | "N locations": ${nLocs.length} (${elapsed}s)`);

            // Show top 8 location strings
            const locCounts: Record<string, number> = {};
            for (const j of jobs) { locCounts[j.location || '(blank)'] = (locCounts[j.location || '(blank)'] || 0) + 1; }
            const top = Object.entries(locCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
            console.log('     Top locations:');
            for (const [loc, cnt] of top) console.log(`       ${String(cnt).padStart(3)}x  "${loc}"`);

            if (ukJobs.length > 0) { companiesOK++; totalUK += ukJobs.length; }
        } catch (err: any) {
            console.log(`  -> CRASH: ${err.message}`);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`  Companies returning UK jobs: ${companiesOK} / ${TEST_COMPANIES.length}`);
    console.log(`  Total UK jobs across all:    ${totalUK}`);
    console.log('='.repeat(70));
}

main().catch(e => { console.error(e); process.exit(1); });
