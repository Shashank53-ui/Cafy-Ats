import https from 'https';
import { supabase } from '../lib/supabase';
import dotenv from 'dotenv';
import { isUKLocation } from './fallbackScraper';

dotenv.config({ path: '.env.local' });

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Ensure the local isUKLocation is duplicated here so we don't have to export it
async function checkUK(locationStr: string): Promise<boolean> {
    if (!locationStr) return false;
    const lower = locationStr.toLowerCase();
    const ukKeywords = [
        'uk', 'united kingdom', 'london', 'gb', 'england', 'scotland', 'wales',
        'northern ireland', 'remote - uk', 'belfast', 'edinburgh', 'manchester',
        'bristol', 'cambridge', 'oxford', 'glasgow', 'leeds', 'birmingham',
        'knutsford', 'radbroke', 'northampton', 'halifax', 'milton keynes',
        'chester', 'liverpool', 'sheffield', 'newcastle', 'cardiff', 'swansea',
        'nottingham', 'southampton', 'reading', 'brighton', 'bournemouth', 'poole',
        'jersey', 'isle of man', 'guernsey', 'city of london', 'canary wharf',
        'lanarkshire'
    ];
    return ukKeywords.some(kw => lower.includes(kw));
}

function fetchPage(offset: number): Promise<any> {
    return new Promise((resolve, reject) => {
        const url = `https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=all&finder=findReqs;siteNumber=CX_1001,facetsList=LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS,limit=25,locationId=300000000289276,offset=${offset},sortBy=POSTING_DATES_DESC`;

        https.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                "Accept": "application/json"
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function scrapeJPMorgan() {
    console.log("Starting Oracle Taleo API Scan for JPMorgan Chase...");

    let offset = 0;
    let total = 1; // dummy initial
    let allRawJobs: any[] = [];

    while (offset < total) {
        console.log(`Fetching offset ${offset}...`);
        const data = await fetchPage(offset);

        if (!data.items || data.items.length === 0) break;

        const pageData = data.items[0];
        total = pageData.TotalJobsCount;

        if (pageData.requisitionList) {
            allRawJobs.push(...pageData.requisitionList);
            console.log(`  -> Fetched ${allRawJobs.length} / ${total} jobs`);
        } else {
            break;
        }

        offset += 25;
        await sleep(500); // rate limiting
    }

    console.log(`\nFinished fetching ${allRawJobs.length} raw UK jobs. Filtering exact UK locations...`);

    const ukJobs: any[] = [];
    for (const job of allRawJobs) {
        if (await checkUK(job.PrimaryLocation)) {
            ukJobs.push({
                title: job.Title,
                location: job.PrimaryLocation,
                url: `https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/${job.Id}`
            });
        }
    }

    console.log(`Filtered down to ${ukJobs.length} exact UK jobs.`);

    if (ukJobs.length > 0) {
        const { data: company } = await supabase.from('companies').select('id').eq('trading_name', 'JPMorgan Chase & Co.').single();
        if (company) {
            const jobsToInsert = ukJobs.map(j => ({
                company_id: company.id,
                title: j.title,
                location: j.location,
                url: j.url
            }));
            await supabase.from('jobs').upsert(jobsToInsert, { onConflict: 'url' });
            await supabase.from('companies').update({
                ats_provider: 'taleo_api',
                active_jobs_count: jobsToInsert.length
            }).eq('id', company.id);
            console.log(`✅ Saved ${jobsToInsert.length} JPMorgan jobs to Supabase!`);
        }
    }
}

scrapeJPMorgan().catch(console.error);
