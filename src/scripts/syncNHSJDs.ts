/**
 * syncNHSJDs.ts — Background JD Fetcher for NHS
 * 
 * Fetches full job descriptions for NHS jobs that are missing a description.
 * This runs at a safe, WAF-friendly pace to avoid the IP blocks that happen during a mass sync.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import pLimit from 'p-limit';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { fetchCustom } from './customScrapers'; // Just to resolve dependencies if any

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseNhsJobDescriptionHtml(html: string): string {
    const $ = cheerio.load(html);
    let descHtml = '';
    const sections = [
        '#job_overview',
        '#job_description',
        '#about_organisation',
        '#job_description_large',
        '[id^="skill_category"]' // For person specification sections
    ];
    let combined = '';
    sections.forEach(sel => {
        $(sel).each((_, el) => {
            const content = $(el).parent().html() || $(el).html() || '';
            if (content && !combined.includes(content)) {
                combined += `<div>${content}</div><br/>`;
            }
        });
    });

    if (combined.length > 100) {
        descHtml = combined;
    } else {
        const fallbackSelectors = ['.nhsuk-panel--blue', '.nhsuk-panel', '.nhsuk-summary-list__row', 'article', 'main'];
        for (const sel of fallbackSelectors) {
            const el = $(sel).first();
            if (el.length && el.html()) {
                const text = el.text().trim();
                if (text.length > 100) {
                    descHtml = el.html() || '';
                    break;
                }
            }
        }
    }
    if (!descHtml || descHtml.trim().length < 100) {
        descHtml = $('body').html() || '';
    }
    return descHtml;
}

async function run() {
    console.log('[nhs-backfill] Starting background JD fetcher...');
    
    // Find up to 500 NHS jobs without JDs (batching)
    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, url, title')
        .eq('company_id', 1690)
        .is('description', null)
        .limit(500);

    if (error) {
        console.error('[nhs-backfill] DB Error:', error);
        return;
    }

    if (!jobs || jobs.length === 0) {
        console.log('[nhs-backfill] No jobs missing JDs. Exiting.');
        return;
    }

    console.log(`[nhs-backfill] Found ${jobs.length} jobs needing a JD.`);
    
    // Use Playwright to bypass WAF TLS Fingerprinting Blocks
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        extraHTTPHeaders: {
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    });

    // Disable images, fonts, and CSS for speed
    await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
            route.abort();
        } else {
            route.continue();
        }
    });

    let successCount = 0;
    const descLimit = pLimit(5); // Concurrency of 5 tabs

    await Promise.all(jobs.map(async (job) => {
        return descLimit(async () => {
            const page = await context.newPage();
            try {
                const response = await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                if (response && !response.ok()) {
                    console.warn(`[nhs-backfill] HTTP ${response.status()} for ${job.url}`);
                } else {
                    const html = await page.content();
                    const descHtml = parseNhsJobDescriptionHtml(html);
                    
                    if (descHtml && descHtml.length > 100) {
                        const { error: upErr } = await supabase
                            .from('jobs')
                            .update({ description: descHtml })
                            .eq('id', job.id);
                        
                        if (upErr) {
                            console.error(`[nhs-backfill] DB Update failed for ${job.url}:`, upErr);
                        } else {
                            successCount++;
                        }
                    } else {
                        console.warn(`[nhs-backfill] Parsed HTML was too short for ${job.url}`);
                    }
                }
            } catch (err: any) {
                console.warn(`[nhs-backfill] Failed ${job.url}: ${err.message}`);
            } finally {
                await page.close().catch(() => {});
            }
        });
    }));

    await context.close().catch(() => {});
    await browser.close().catch(() => {});

    console.log(`[nhs-backfill] Finished processing. Successfully fetched and updated ${successCount}/${jobs.length} JDs.`);
}

run();
