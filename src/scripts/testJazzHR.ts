/**
 * testJazzHR.ts — Live test for the JazzHR fetcher across all 13 companies.
 * Run: npx tsx src/scripts/testJazzHR.ts
 */

import * as cheerio from 'cheerio';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const UK_TERMS = ['london','manchester','birmingham','leeds','edinburgh','glasgow','bristol','cardiff','belfast','liverpool','sheffield','newcastle','nottingham','leicester','coventry','brighton','oxford','cambridge','bath','york','reading','southampton','portsmouth','exeter','plymouth','derby','northampton','luton','swindon','bournemouth','remote','uk','united kingdom','gb','gbr','great britain','england','scotland','wales','northern ireland','haywards heath','hemel hempstead','knutsford','canary wharf','jersey','guernsey','isle of man'];
const HARD_BLOCKS = ['india','canada','australia','singapore','germany','france','netherlands','spain','poland','uae','dubai','ireland','new york','san francisco','chicago','boston','seattle','dallas','houston','atlanta','miami','amsterdam','berlin','munich','paris','madrid','barcelona','tokyo','beijing','shanghai','seoul','mumbai','delhi','bangalore','bengaluru','pune','chennai','toronto','sydney','melbourne','auckland','johannesburg'];

function isUKJob(rawLoc: string): boolean {
    if (!rawLoc) return false;
    const l = rawLoc.toLowerCase().trim();
    if (!l || l === 'remote') return true;
    const parts = l.split(/\s*[|·•]\s*/);
    for (const p of parts) {
        if (UK_TERMS.some(t => t.includes(' ') ? p.includes(t) : new RegExp('\\b' + t + '\\b').test(p))) return true;
    }
    for (const p of parts) {
        if (HARD_BLOCKS.some(t => t.includes(' ') ? p.includes(t) : new RegExp('\\b' + t + '\\b').test(p))) return false;
    }
    return false;
}

async function fetchJazzHR(token: string) {
    const url = `https://${token}.applytojob.com/apply`;
    const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
        signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const html = await r.text();
    const $ = cheerio.load(html);
    const jobs: Array<{ title: string; location: string; url: string; department: string }> = [];
    $('li.list-group-item').each((_, el) => {
        const anchor = $(el).find('h3.list-group-item-heading a, h2 a').first();
        const title = anchor.text().trim();
        const jobUrl = anchor.attr('href') || '';
        if (!title || !jobUrl) return;
        const listItems = $(el).find('ul.list-inline li');
        const location = listItems.eq(0).text().trim().replace(/^[^\w\s]+\s*/, '');
        const department = listItems.eq(1).text().trim();
        jobs.push({ title, location, url: jobUrl, department });
    });
    return jobs;
}

const TOKENS: Array<[string, string]> = [
    ['Vyne',            'vyne'],
    ['Incredible',      'getincredible'],
    ['Seenit',          'seenit'],
    ['Proxymity',       'proxymity'],
    ['Stored.',         'stored'],
    ['Avantia',         'avantialaw'],
    ['Antler',          '558485'],
    ['Genasys',         'genasys'],
    ['Rapyd',           'rapyd'],
    ['Marketbridge',    'Marketbridge'],
    ['atVenu',          'atvenu'],
    ['Haymarket',       'haymarket'],
    ['Verdant',         'verdantspecialtysolutions'],
];

async function main() {
    let totalUK = 0, totalAll = 0;
    console.log('=== JazzHR Live Test ===\n');
    for (const [name, token] of TOKENS) {
        try {
            const jobs = await fetchJazzHR(token);
            const ukJobs = jobs.filter(j => isUKJob(j.location));
            totalUK += ukJobs.length;
            totalAll += jobs.length;
            const status = jobs.length === 0 ? '(no jobs)' : `${ukJobs.length}/${jobs.length} UK`;
            console.log(name.padEnd(18) + status);
            ukJobs.slice(0, 2).forEach(j =>
                console.log(`  ${j.title.substring(0, 44).padEnd(46)}${j.location}`)
            );
            jobs.filter(j => !isUKJob(j.location)).slice(0, 2).forEach(j =>
                console.log(`  [skip] ${j.title.substring(0, 38).padEnd(40)}${j.location}`)
            );
        } catch (e: any) {
            console.log(name.padEnd(18) + 'ERROR: ' + e.message);
        }
        await sleep(300);
    }
    console.log(`\nTotal: ${totalUK} UK / ${totalAll} total across ${TOKENS.length} companies`);
}

main();
