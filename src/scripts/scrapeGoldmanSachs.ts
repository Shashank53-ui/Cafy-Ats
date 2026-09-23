import { supabase } from '../lib/supabase';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import { isUKJob } from '../lib/ukFilter';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';
import { inferJobLevel } from '../lib/inferJobLevel';
import { resolveJobType } from '../lib/parseJobType';
import { sanitizeJobLocation } from '../lib/refineLocation';
import { cleanInlineJD } from './customScrapers';
import { fetchWithTimeout } from './syncAll';
import pLimit from "p-limit";

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    try {
        dotenv.config({ path: '.env.local' });
    } catch (e) { }
}

async function scrapeGoldmanSachs() {
    console.log(`\n--- Fetching Goldman Sachs Jobs ---`);

    // 1. Find Company
    const companyNameSearch = 'Goldman Sachs';
    const { data: companies, error: searchError } = await supabase
        .from('companies')
        .select('*')
        .ilike('trading_name', `%${companyNameSearch}%`);

    if (searchError || !companies || companies.length === 0) {
        console.error(`Could not find ${companyNameSearch} in DB!`);
        return;
    }

    const company = companies[0];
    console.log(`Found Company: ${company.trading_name} (ID: ${company.id})`);

    // 2. Map ats provider as custom
    await supabase.from('companies').update({
        ats_provider: 'custom_site',
        ats_board_token: 'higher.gs.com'
    }).eq('id', company.id);

    // 3. Setup Fetch Loop
    const allJobs: any[] = [];
    let page = 1;

    const { chromium } = require('playwright');
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const pageSession = await context.newPage();

        while (true) {
            const uiUrl = `https://higher.gs.com/results?LOCATION=Birmingham%7CLondon&page=${page}&sort=RELEVANCE`;
            console.log(`Navigating to Next.js Frontend Page ${page}: ${uiUrl}...`);

            await pageSession.goto(uiUrl, { waitUntil: 'networkidle', timeout: 60000 });

            // Wait briefly to allow React to hydrate the DOM with real data
            await pageSession.waitForTimeout(4000);

            const html = await pageSession.content();
            const $ = cheerio.load(html);

            const batchJobs: any[] = [];

            $('a.text-decoration-none[href^="/roles/"]').each((i: number, el: any) => {
                const link = $(el).attr('href');
                const title = $(el).find('span.gs-text').first().text().trim();

                const locationDiv = $(el).find('[data-testid="location"]').first();
                const location = locationDiv.text().replace(/·/g, ', ').replace(/\s+/g, ' ').trim();

                const departmentStr = $(el).parent().find('button.gs-tag__button').text().trim();

                if (title && link) {
                    batchJobs.push({
                        title: title,
                        location: location,
                        url: `https://higher.gs.com${link}`,
                        department: departmentStr || 'General Opportunities'
                    });
                }
            });

            if (batchJobs.length === 0) {
                console.log(`Page ${page} returned 0 jobs. Reached end of pagination.`);
                break;
            }

            allJobs.push(...batchJobs);
            console.log(`Fetched page ${page} (${batchJobs.length} jobs) via DOM Extract`);

            page++;
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (e) {
        console.error("Error fetching Goldman Sachs:", e);
    } finally {
        if (browser) await browser.close();
    }

    // 4. The higher.gs.com LOCATION query param is not a guaranteed hard filter —
    // re-validate every result before it goes anywhere near the jobs table.
    const ukJobs = allJobs.filter((job: any) => isUKJob({
        locations: [job.location].filter(Boolean),
        isRemote: /\bremote\b/i.test(job.location || ''),
        isTrustedSource: false
    }));
    const rejectedCount = allJobs.length - ukJobs.length;
    if (rejectedCount > 0) {
        console.log(`Filtered out ${rejectedCount} non-UK jobs from the scrape results.`);
    }

    console.log(`Attempting to save ${ukJobs.length} Goldman Sachs jobs to DB.`);

    if (ukJobs.length > 0) {
        // Fetch descriptions concurrently
        const limit = pLimit(10);
        console.log(`[Custom: Goldman Sachs] Fetching JDs for ${ukJobs.length} jobs concurrently...`);
        let validJobsCount = 0;
        let skippedJobsCount = 0;

        const jobsWithDescription: any[] = [];

        await Promise.all(ukJobs.map((job: any, i: number) => limit(async () => {
            let description = '';
            try {
                const res = await fetchWithTimeout(job.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!res.ok) {
                    console.error(`[Custom: Goldman Sachs] HTTP ${res.status} for ${job.url}`);
                    return;
                }
                const html = await res.text();
                const $ = cheerio.load(html);

                // Try common selectors for job description
                const selectors = [
                    '[data-id="job-description"]', '.job-description', '#job-description',
                    '.jobDescription', '.jobdescription', '.joblayouttoken', '#jd-description',
                    'div[itemprop="description"]', 'section[itemprop="description"]', '.posting-description',
                    '.job-details', '.description', '.jd-info', 'article', 'main.content', 'main',
                    '.gs-job-description', '.job-description-text', '.description-text'
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
                console.error(`[Custom: Goldman Sachs] Error fetching JD for ${job.url}: ${e.message}`);
                return;
            }

            const cleanDesc = cleanInlineJD(description) || '';

            if (cleanDesc.length < 300) {
                console.log(`[Custom: Goldman Sachs] Skipping job due to insufficient description: ${job.url}`);
                skippedJobsCount++;
                return;
            }

            const { sector, department } = classifyJobTaxonomy(
                job.title,
                job.department,
                company.company_sector,
            );
            const level = inferJobLevel(job.title);

            jobsWithDescription.push({
                company_id: company.id,
                title: job.title,
                location: sanitizeJobLocation(job.location, 'uk', job.title, job.url),
                url: job.url,
                department,
                sector,
                level,
                description: cleanDesc,
                job_type: resolveJobType({ title: job.title, level }),
            });
            validJobsCount++;
        })));

        if (jobsWithDescription.length > 0) {
            const { error: jobErr } = await supabase.from('jobs').upsert(jobsWithDescription, { onConflict: 'url' });
            if (jobErr) console.error("Error inserting jobs", jobErr);
        }

        console.log(`[Custom: Goldman Sachs] Saving stats: ${validJobsCount} saved, ${skippedJobsCount} skipped (no JD).`);

        // 5. Update Exact Count Tracking
        await supabase.from('companies').update({
            active_jobs_count: jobsWithDescription.length
        }).eq('id', company.id);

        console.log(`Successfully completed Goldman Sachs ingestion! Inserted ${jobsWithDescription.length} jobs.`);
    } else {
        await supabase.from('companies').update({
            active_jobs_count: 0
        }).eq('id', company.id);
        console.log("No jobs to insert for Goldman Sachs.");
    }
}

scrapeGoldmanSachs().catch(console.error);