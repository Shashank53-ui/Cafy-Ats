import https from 'https';
import { supabase } from '../lib/supabase';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import { isUKJob } from '../lib/ukFilter';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';
import { resolveJobLevelsBatch } from '../lib/resolveJobLevel';
import { resolveJobType } from '../lib/parseJobType';
import { sanitizeJobLocation } from '../lib/refineLocation';
import { cleanInlineJD } from './customScrapers';
import { fetchWithTimeout } from './syncAll';
import pLimit from "p-limit";

dotenv.config({ path: '.env.local' });

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkUK(locationStr: string): Promise<boolean> {
    if (!locationStr) return false;
    return isUKJob({ locations: [locationStr], isRemote: /\bremote\b/i.test(locationStr), isTrustedSource: false });
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
        const { data: company } = await supabase.from('companies').select('id, company_sector').eq('trading_name', 'JPMorgan Chase & Co.').single();
        if (company) {
            // Fetch descriptions concurrently
            const limit = pLimit(10);
            console.log(`[Custom: JPMorgan Chase] Fetching JDs for ${ukJobs.length} jobs concurrently...`);
            let validJobsCount = 0;
            let skippedJobsCount = 0;

            const jobsToInsert: any[] = [];

            await Promise.all(ukJobs.map((job: any, i: number) => limit(async () => {
                let description = '';
                try {
                    const res = await fetchWithTimeout(job.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (!res.ok) {
                        console.error(`[Custom: JPMorgan Chase] HTTP ${res.status} for ${job.url}`);
                        return;
                    }
                    const html = await res.text();
                    const $ = cheerio.load(html);

                    // Try common selectors for Oracle Taleo job description
                    const selectors = [
                        '#jobDescription',
                        '.jobdescription',
                        '[id="jobDescription"]',
                        '.description',
                        '.job_desc',
                        '.job-description',
                        '.section.job-description',
                        '.jobcontent',
                        '.jobinfo',
                        '.display',
                        'div[class*="jobdesc"]',
                        'div[class*="description"]'
                    ];

                    let found = false;
                    for (const sel of selectors) {
                        if ($(sel).length && $(sel).first().text().trim().length > 100) {
                            description = $(sel).first().html() || '';
                            found = true;
                            break;
                        }
                    }

                    if (!found) {
                        // Fallback to body if nothing else found
                        description = $('body').html() || '';
                    }

                } catch (e: any) {
                    console.error(`[Custom: JPMorgan Chase] Error fetching JD for ${job.url}: ${e.message}`);
                    return;
                }

                const cleanDesc = cleanInlineJD(description) || '';

                if (cleanDesc.length < 300) {
                    console.log(`[Custom: JPMorgan Chase] Skipping job due to insufficient description: ${job.url}`);
                    skippedJobsCount++;
                    return;
                }

                const { sector, department } = classifyJobTaxonomy(
                    job.title,
                    null,
                    company.company_sector,
                );
                const levelResolved = await resolveJobLevelsBatch(
                    [{ title: job.title }]
                );
                const level = levelResolved[0]!.level;

                jobsToInsert.push({
                    company_id: company.id,
                    title: job.title,
                    location: sanitizeJobLocation(job.location, 'uk', job.title, job.url),
                    url: job.url,
                    department,
                    sector,
                    level,
                    level_source: levelResolved[0]!.source,
                    description: cleanDesc,
                    job_type: resolveJobType({ title: job.title, level }),
                });
                validJobsCount++;
            })));

            if (jobsToInsert.length > 0) {
                const { error: jobErr } = await supabase.from('jobs').upsert(jobsToInsert, { onConflict: 'url' });
                if (jobErr) console.error("Error inserting jobs", jobErr);
            }

            console.log(`[Custom: JPMorgan Chase] Saving stats: ${validJobsCount} saved, ${skippedJobsCount} skipped (no JD).`);

            // 5. Update Exact Count Tracking
            await supabase.from('companies').update({
                ats_provider: 'taleo_api',
                active_jobs_count: jobsToInsert.length
            }).eq('id', company.id);
            console.log(`✅ Saved ${jobsToInsert.length} JPMorgan jobs to Supabase!`);
        }
    } else {
        await supabase.from('companies').update({
            active_jobs_count: 0
        }).eq('trading_name', 'JPMorgan Chase & Co.');
        console.log("No UK jobs to insert for JPMorgan Chase.");
    }
}

scrapeJPMorgan().catch(console.error);