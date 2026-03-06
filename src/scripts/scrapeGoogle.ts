import { supabase } from '../lib/supabase';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    try {
        dotenv.config({ path: '.env.local' });
    } catch (e) { }
}

async function scrapeGoogle() {
    console.log(`\\n--- Fetching Google Careers Jobs ---`);

    // 1. Find Company
    const companyNameSearch = 'Google';
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
        ats_board_token: 'google.com/about/careers'
    }).eq('id', company.id);

    // 3. Setup Fetch Loop
    const allJobs: any[] = [];
    let page = 1;

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 1080 }
        });
        const pageSession = await context.newPage();

        // Google paginates explicitly via page parameter
        while (true) {
            const uiUrl = `https://www.google.com/about/careers/applications/jobs/results?location=United%20Kingdom&page=${page}`;
            console.log(`Navigating to Google Careers Page ${page}: ${uiUrl}...`);

            await pageSession.goto(uiUrl, { waitUntil: 'networkidle', timeout: 60000 });

            // Wait briefly to allow Google WIZ to hydrate the DOM
            try {
                // Wait for the job card container to be visible
                await pageSession.waitForSelector('.sMn82b', { timeout: 10000 });
            } catch (waitErr) {
                console.log(`No job cards found on page ${page} (timeout). Reached end of pagination.`);
                break;
            }

            // A small artificial wait to ensure texts have painted
            await pageSession.waitForTimeout(2000);

            const html = await pageSession.content();
            const $ = cheerio.load(html);

            const batchJobs: any[] = [];

            $('div.sMn82b').each((i: number, el: any) => {
                const title = $(el).find('h3.Qk805e').text().trim() || $(el).find('h3').text().trim();
                let location = $(el).find('span.r0wTof').text().trim() || 'United Kingdom';

                // Cleanup "London, UKLondon, UK" duplicate strings often caused by screenreader spans
                if (location.length > 5) {
                    const half = Math.floor(location.length / 2);
                    if (location.substring(0, half) === location.substring(half)) {
                        location = location.substring(0, half);
                    }
                }

                // Find hidden Job ID Link
                const linkStr = $(el).html()?.match(/jobs\/results\/[a-zA-Z0-9-]+/);
                let hrefUrl = '';
                if (linkStr) {
                    hrefUrl = `https://www.google.com/about/careers/applications/${linkStr[0]}`;
                }

                if (title && hrefUrl) {
                    batchJobs.push({
                        title: title,
                        location: location,
                        url: hrefUrl,
                        department: 'General'
                    });
                }
            });

            if (batchJobs.length === 0) {
                console.log(`Page ${page} returned 0 jobs. Reached end of pagination.`);
                break;
            }

            allJobs.push(...batchJobs);
            console.log(`Fetched page ${page} (${batchJobs.length} jobs) via Google WIZ Extract`);

            page++;
        }
    } catch (e) {
        console.error("Error fetching Google Jobs:", e);
    } finally {
        if (browser) await browser.close();
    }

    // 4. Remove Duplicates (Google infinite scroll sometimes overlays)
    const uniqueJobs = Array.from(new Map(allJobs.map(item => [item.url, item])).values());

    console.log(`Attempting to save ${uniqueJobs.length} Google jobs to DB.`);

    if (uniqueJobs.length > 0) {
        const jobsToInsert = uniqueJobs.map((job: any) => ({
            company_id: company.id,
            title: job.title,
            location: job.location,
            url: job.url,
            department: job.department || null
        }));

        const { error: jobErr } = await supabase.from('jobs').upsert(jobsToInsert, { onConflict: 'url' });

        if (jobErr) console.error("Error inserting jobs", jobErr);
    }

    // 5. Update Exact Count Tracking
    await supabase.from('companies').update({
        active_jobs_count: uniqueJobs.length
    }).eq('id', company.id);

    console.log(`Successfully completed Google ingestion! Inserted ${uniqueJobs.length} jobs.`);
}

scrapeGoogle().catch(console.error);
