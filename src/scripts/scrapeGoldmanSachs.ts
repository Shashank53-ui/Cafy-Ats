import { supabase } from '../lib/supabase';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import { isUKJob } from '../lib/ukFilter';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';
import { inferJobLevel } from '../lib/inferJobLevel';
import { resolveJobType } from '../lib/parseJobType';
import { sanitizeJobLocation } from '../lib/refineLocation';

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
        const jobsToInsert = ukJobs.map((job: any) => {
            const { sector, department } = classifyJobTaxonomy(
                job.title,
                job.department,
                company.company_sector,
            );
            const level = inferJobLevel(job.title);
            return {
                company_id: company.id,
                title: job.title,
                location: sanitizeJobLocation(job.location, 'uk', job.title, job.url),
                url: job.url,
                department,
                sector,
                level,
                job_type: resolveJobType({ title: job.title, level }),
            };
        });

        const { error: jobErr } = await supabase.from('jobs').upsert(jobsToInsert, { onConflict: 'url' });

        if (jobErr) console.error("Error inserting jobs", jobErr);
    }

    // 5. Update Exact Count Tracking
    await supabase.from('companies').update({
        active_jobs_count: ukJobs.length
    }).eq('id', company.id);

    console.log(`Successfully completed Goldman Sachs ingestion! Inserted ${ukJobs.length} jobs.`);
}

scrapeGoldmanSachs().catch(console.error);
