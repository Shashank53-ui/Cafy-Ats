/**
 * scrapeLinkedinIreland.ts
 *
 * Daily LinkedIn Ireland volume engine for jobs_IR.
 * Keep this as the single LinkedIn entrypoint (npm run sync:linkedin / fetch-jobs.yml).
 */
import { PlaywrightCrawler, log } from 'crawlee';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { isIrelandJob } from '../lib/irelandFilter';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

log.setLevel(log.LEVELS.INFO);

/** More keywords + pagination → target ≥4k unique Ireland jobs daily. */
const KEYWORDS = [
    'Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
    'DevOps Engineer', 'Site Reliability Engineer', 'QA Engineer', 'Data Scientist',
    'Data Analyst', 'Data Engineer', 'Machine Learning Engineer', 'Product Manager',
    'Project Manager', 'Scrum Master', 'Business Analyst', 'UX Designer',
    'UI Designer', 'Graphic Designer', 'Marketing Manager', 'Digital Marketing',
    'Sales Executive', 'Account Executive', 'Account Manager', 'Customer Success',
    'HR Manager', 'Recruiter', 'Talent Acquisition', 'Financial Analyst',
    'Accountant', 'Operations Manager', 'Supply Chain', 'Logistics',
    'Customer Support', 'Technical Support', 'Network Engineer', 'Security Analyst',
    'Cybersecurity', 'Systems Administrator', 'Cloud Engineer', 'Solutions Architect',
    'IT Manager', 'Legal Counsel', 'Compliance Officer', 'VP Engineering',
    'VP Sales', 'Director Marketing', 'Director Product', 'Office Manager',
    'Executive Assistant', 'Mechanical Engineer', 'Electrical Engineer', 'Civil Engineer',
    'Industrial Engineer', 'Manufacturing Engineer', 'Quality Assurance', 'Retail Manager',
    'Content Writer', 'Copywriter', 'Technical Writer', 'Editor',
    'Public Relations', 'Event Planner', 'Social Media', 'SEO Specialist',
    'Video Editor', 'Animator', '3D Artist', 'Game Developer',
    'Mobile Developer', 'iOS Developer', 'Android Developer', 'Game Designer',
    'Blockchain Developer', 'Penetration Tester', 'Cloud Architect', 'Finance Manager',
    'HR Business Partner', 'Growth Hacker', 'VP Operations', 'Data Architect',
    'Engineering Manager', 'Head of Sales', 'Chief of Staff', 'Revenue Operations',
    'Pricing Analyst', 'Treasury Analyst', 'Tax Manager', 'Commercial Manager',
    'Legal Operations', 'Privacy Counsel', 'Risk Manager', 'Compliance Manager',
    'Nurse', 'Pharmacist', 'Accountant Dublin', 'Graduate', 'Internship Ireland',
    'Java Developer', 'Python Developer', 'React Developer', 'AWS', 'Azure',
    'Salesforce', 'SAP', 'Oracle', 'Business Development', 'Consultant',
];

/** LinkedIn public search pages: start=0,25,50,... */
const PAGE_STARTS = [0, 25, 50, 75, 100];

interface ScrapedJob {
    company: string;
    title: string;
    location: string;
    url: string;
}

const allJobs: ScrapedJob[] = [];
const seenUrls = new Set<string>();

function linkedInSearchUrl(keyword: string, start: number): string {
    const params = new URLSearchParams({
        keywords: keyword,
        location: 'Ireland',
        geoId: '104738515',
        start: String(start),
    });
    return `https://ie.linkedin.com/jobs/search?${params.toString()}`;
}

async function scrapeLinkedin() {
    const runStarted = new Date().toISOString();
    log.info('Starting LinkedIn Ireland scraper...');
    log.info(`Keywords=${KEYWORDS.length} pagesPerKeyword=${PAGE_STARTS.length}`);

    const crawler = new PlaywrightCrawler({
        headless: true,
        maxConcurrency: 2,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 90,
        requestHandler: async ({ page, request, log: reqLog }) => {
            const keyword = request.userData.keyword as string;
            const start = request.userData.start as number;
            reqLog.info(`Scraping keyword="${keyword}" start=${start}`);

            try {
                await page.waitForSelector('.base-search-card, .jobs-search__no-results', { timeout: 15000 });
            } catch {
                return;
            }

            // Infinite-scroll style load within the page
            for (let i = 0; i < 6; i++) {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight));
                await page.waitForTimeout(800);
            }

            const jobCards = await page.$$('.base-search-card');
            for (const card of jobCards) {
                try {
                    const titleEl = await card.$('.base-search-card__title');
                    const companyEl = await card.$('.base-search-card__subtitle');
                    const locationEl = await card.$('.job-search-card__location');
                    const linkEl = await card.$('a.base-card__full-link');

                    if (!titleEl || !companyEl || !locationEl || !linkEl) continue;

                    const title = (await titleEl.innerText()).trim();
                    const company = (await companyEl.innerText()).trim();
                    const location = (await locationEl.innerText()).trim();
                    let url = await linkEl.getAttribute('href');
                    if (url) url = url.split('?')[0];

                    if (!url || !title || !company || seenUrls.has(url)) continue;
                    seenUrls.add(url);
                    allJobs.push({ company, title, location, url });
                } catch {
                    // ignore card parse errors
                }
            }
        },
    });

    const requests = KEYWORDS.flatMap((kw) =>
        PAGE_STARTS.map((start) => ({
            url: linkedInSearchUrl(kw, start),
            userData: { keyword: kw, start },
        }))
    );

    await crawler.run(requests);
    log.info(`Finished scraping. Found ${allJobs.length} unique jobs.`);

    if (!allJobs.length) {
        log.warning('No LinkedIn jobs scraped — aborting DB writes to avoid wiping inventory.');
        process.exitCode = 1;
        return;
    }

    // LinkedIn's public search location param is not a strict geo filter — it
    // regularly returns jobs based elsewhere (other EU cities, the US, etc).
    // Re-validate every scraped location before it's allowed anywhere near jobs_IR.
    const irelandJobs = allJobs.filter(j => isIrelandJob(j.location));
    const rejectedCount = allJobs.length - irelandJobs.length;
    if (rejectedCount > 0) {
        log.info(`Filtered out ${rejectedCount} non-Ireland jobs from the scrape results.`);
    }

    // Map companies and insert missing ones
    log.info('Resolving companies...');
    const companyNames = [...new Set(irelandJobs.map((j) => j.company))];
    const companyMap = new Map<string, number>();
    let companiesCreated = 0;

    for (const name of companyNames) {
        const { data: existing } = await supabase
            .from('companies')
            .select('id, ats_provider')
            .ilike('trading_name', name)
            .limit(1)
            .maybeSingle();

        if (existing?.id) {
            companyMap.set(name, Number(existing.id));
            continue;
        }

        const { data: inserted, error } = await supabase
            .from('companies')
            .insert({
                trading_name: name,
                ats_provider: 'linkedin',
                ats_board_token: name,
                licensed_sponsor: false,
                open_to_sponsorship: 0,
                active_jobs_count: 0,
                sync_market: 'ireland',
                ats_status: 'ok',
            })
            .select('id')
            .single();

        if (error) {
            // sync_market column may be missing — retry without it
            if (/sync_market/i.test(error.message)) {
                const { data: inserted2, error: err2 } = await supabase
                    .from('companies')
                    .insert({
                        trading_name: name,
                        ats_provider: 'linkedin',
                        ats_board_token: name,
                        licensed_sponsor: false,
                        open_to_sponsorship: 0,
                        active_jobs_count: 0,
                    })
                    .select('id')
                    .single();
                if (err2) {
                    log.error(`Company insert failed for "${name}": ${err2.message}`);
                    continue;
                }
                if (inserted2) {
                    companyMap.set(name, Number(inserted2.id));
                    companiesCreated++;
                }
            } else {
                log.error(`Company insert failed for "${name}": ${error.message}`);
            }
            continue;
        }

        if (inserted) {
            companyMap.set(name, Number(inserted.id));
            companiesCreated++;
        }
    }

    const timestamp = new Date().toISOString();
    const getLevel = (t: string) => {
        const lower = t.toLowerCase();
        if (/\b(senior|sr\.?|lead|principal)\b/.test(lower)) return 'Senior';
        if (/\b(junior|jr\.?|graduate|intern)\b/.test(lower)) return 'Junior';
        if (/\b(manager|head|director|vp)\b/.test(lower)) return 'Manager';
        return 'Mid';
    };
    const getSector = (t: string) => {
        const lower = t.toLowerCase();
        if (/engineer|developer|data|software|devops|cloud/.test(lower)) return 'Engineering & Data';
        if (/sales|account|marketing/.test(lower)) return 'Sales & Marketing';
        if (/product|project/.test(lower)) return 'Product & Project';
        return 'Operations & Support';
    };

    log.info('Upserting jobs into jobs_IR (source=linkedin)...');
    let upserted = 0;
    let upsertErrors = 0;

    for (let i = 0; i < irelandJobs.length; i += 500) {
        const batch = irelandJobs
            .slice(i, i + 500)
            .map((j) => ({
                company_id: companyMap.get(j.company),
                title: j.title.substring(0, 255),
                location: j.location.substring(0, 255),
                url: j.url,
                department: null,
                level: getLevel(j.title),
                sector: getSector(j.title),
                updated_at: timestamp,
                last_seen_at: timestamp,
                source: 'linkedin',
            }))
            .filter((j) => j.company_id);

        let { error } = await supabase.from('jobs_IR').upsert(batch, { onConflict: 'url' });
        if (error && /source/i.test(error.message)) {
            const fallback = batch.map(({ source, ...rest }) => rest);
            ({ error } = await supabase.from('jobs_IR').upsert(fallback, { onConflict: 'url' }));
            if (!error) {
                log.warning('jobs_IR.source column missing — run supabase/add_ireland_source_and_market.sql');
            }
        }
        if (error) {
            log.error(`Batch insert error: ${error.message}`);
            upsertErrors++;
        } else {
            upserted += batch.length;
        }
    }

    // Stale cleanup: only LinkedIn-sourced rows older than this run
    log.info('Cleaning stale LinkedIn-sourced jobs_IR rows...');
    const { error: staleErr } = await supabase
        .from('jobs_IR')
        .delete()
        .eq('source', 'linkedin')
        .lt('updated_at', timestamp);

    if (staleErr) {
        // Fallback if source column missing: only delete for ats_provider=linkedin companies
        log.warning(`Source-aware stale delete failed (${staleErr.message}); falling back to linkedin-provider companies.`);
        const { data: linkedinCompanies } = await supabase
            .from('companies')
            .select('id')
            .eq('ats_provider', 'linkedin');

        if (linkedinCompanies?.length) {
            for (let i = 0; i < linkedinCompanies.length; i += 100) {
                const idChunk = linkedinCompanies.slice(i, i + 100).map((c) => c.id);
                const { error } = await supabase
                    .from('jobs_IR')
                    .delete()
                    .in('company_id', idChunk)
                    .lt('updated_at', timestamp);
                if (error) log.error(`Delete stale error: ${error.message}`);
            }
        }
    }

    log.info('══════════════════════════════════════');
    log.info(`LinkedIn Ireland sync complete`);
    log.info(`  started:            ${runStarted}`);
    log.info(`  unique scraped:     ${allJobs.length}`);
    log.info(`  companies resolved: ${companyMap.size}`);
    log.info(`  companies created:  ${companiesCreated}`);
    log.info(`  jobs upserted:      ${upserted}`);
    log.info(`  upsert errors:      ${upsertErrors}`);
    log.info('══════════════════════════════════════');

    if (allJobs.length < 1000) {
        log.warning(`Low LinkedIn yield (${allJobs.length}). Check for blocking/captcha.`);
        process.exitCode = 1;
    }
}

scrapeLinkedin().catch((err) => {
    console.error(err);
    process.exit(1);
});
