import { supabase } from '../lib/supabase';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { isUKJob } from '../lib/ukFilter';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';
import { resolveJobLevelsBatch } from '../lib/resolveJobLevel';
import { resolveJobType } from '../lib/parseJobType';
import { sanitizeJobLocation } from '../lib/refineLocation';
import pLimit from 'p-limit';
import { fetchWithTimeout } from './syncAll';
import { cleanInlineJD } from './customScrapers';

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
        .eq('trading_name', companyNameSearch);

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
                // No fallback to a fake "United Kingdom" default here — an unparsed location
                // must not be manufactured into a confirmed-UK signal for the filter below.
                let location = $(el).find('span.r0wTof').text().trim();

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
    const dedupedJobs = Array.from(new Map(allJobs.map(item => [item.url, item])).values());

    // The location=United%20Kingdom query param is not a guaranteed hard filter —
    // re-validate every result before it goes anywhere near the jobs table.
    const uniqueJobs = dedupedJobs.filter((job: any) => isUKJob({
        locations: [job.location].filter(Boolean),
        isRemote: /\bremote\b/i.test(job.location || ''),
        isTrustedSource: false
    }));
    const rejectedCount = dedupedJobs.length - uniqueJobs.length;
    if (rejectedCount > 0) {
        console.log(`Filtered out ${rejectedCount} non-UK/unparsed-location jobs from the scrape results.`);
    }

    console.log(`Attempting to save ${uniqueJobs.length} Google jobs to DB.`);

    if (uniqueJobs.length > 0) {
        const levelResolved = await resolveJobLevelsBatch(
            uniqueJobs.map((job: any) => ({ title: job.title })),
        );

        // Fetch JDs concurrently
        const limit = pLimit(10);
        console.log(`[Custom: Google] Fetching JDs for ${uniqueJobs.length} jobs concurrently...`);
        let validJobsCount = 0;
        let skippedJobsCount = 0;

        const jobsToInsert: any[] = [];

        await Promise.all(uniqueJobs.map((job: any, i: number) => limit(async () => {
            let description = '';
            try {
                const res = await fetchWithTimeout(job.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const text = await res.text();
                const scripts = [...text.matchAll(/AF_initDataCallback\((.*?)\);<\/script>/g)];
                let htmlStrings: string[] = [];

                for (const match of scripts) {
                    let content = match[1];
                    if (content.includes("Minimum qualifications:")) {
                        const dataMatch = content.match(/data:([\s\S]*?), sideChannel/);
                        if (dataMatch) {
                            try {
                                const dataArr = JSON.parse(dataMatch[1]);
                                function traverse(obj: any) {
                                    if (typeof obj === 'string') {
                                        if (obj.includes('<p>') || obj.includes('<h3') || obj.includes('<ul') || obj.includes('</li')) {
                                            if (!obj.startsWith('http')) {
                                                htmlStrings.push(obj);
                                            }
                                        }
                                    } else if (Array.isArray(obj)) {
                                        obj.forEach(traverse);
                                    }
                                }
                                traverse(dataArr);
                            } catch (e) {
                                console.error(`[Custom: Google] JSON parse error on ${job.url}:`, e);
                            }
                        }
                        break;
                    }
                }

                if (htmlStrings.length > 0) {
                    let uniqueStrs = [...new Set(htmlStrings)];
                    uniqueStrs = uniqueStrs.filter((str, i, arr) => {
                        return !arr.some((other, j) => i !== j && other.includes(str));
                    });
                    description = uniqueStrs.join('<br><br>');
                }

            } catch (e: any) {
                console.error(`[Custom: Google] Error fetching JD for ${job.url}: ${e.message}`);
            }

            const cleanDesc = cleanInlineJD(description) || '';

            if (cleanDesc.length < 300) {
                console.log(`[Custom: Google] Skipping job due to insufficient description: ${job.url}`);
                skippedJobsCount++;
                return;
            }

            const { sector, department } = classifyJobTaxonomy(
                job.title,
                job.department,
                company.company_sector,
            );
            const resolved = levelResolved[i]!;
            const level = resolved.level;

            // Debug first job
            if (jobsToInsert.length === 0) {
                console.log(`[Custom: Google] First job description length: ${cleanDesc.length}`);
                console.log(`[Custom: Google] First job description preview: ${cleanDesc.slice(0, 200)}`);
            }
            jobsToInsert.push({
                company_id: company.id,
                title: job.title,
                location: sanitizeJobLocation(job.location, 'uk', job.title, job.url),
                url: job.url,
                department,
                sector,
                level,
                level_source: resolved.source,
                description: cleanDesc,
                job_type: resolveJobType({ title: job.title, level }),
            });
            validJobsCount++;
        })));

        if (jobsToInsert.length > 0) {
            const { error: jobErr } = await supabase.from('jobs').upsert(jobsToInsert, { onConflict: 'url' });
            if (jobErr) console.error("Error inserting jobs", jobErr);
        }

        console.log(`[Custom: Google] Saving stats: ${validJobsCount} saved, ${skippedJobsCount} skipped (no JD).`);

        // 5. Update Exact Count Tracking
        await supabase.from('companies').update({
            active_jobs_count: jobsToInsert.length
        }).eq('id', company.id);

        console.log(`Successfully completed Google ingestion! Inserted ${jobsToInsert.length} jobs.`);
    } else {
        await supabase.from('companies').update({
            active_jobs_count: 0
        }).eq('id', company.id);
        console.log("No jobs to insert for Google.");
    }
}

scrapeGoogle().catch(console.error);
