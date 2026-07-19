import { PlaywrightCrawler, log } from 'crawlee';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey);

log.setLevel(log.LEVELS.INFO);

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
    'Legal Operations', 'Privacy Counsel', 'Risk Manager', 'Compliance Manager'
];

interface ScrapedJob {
    company: string;
    title: string;
    location: string;
    url: string;
}

const allJobs: ScrapedJob[] = [];
const seenUrls = new Set<string>();

async function scrapeLinkedin() {
    log.info('Starting LinkedIn Scraper...');
    const crawler = new PlaywrightCrawler({
        headless: true,
        maxConcurrency: 3,
        requestHandlerTimeoutSecs: 60,
        requestHandler: async ({ page, request, log }) => {
            log.info(`Scraping keyword: ${request.userData.keyword}`);
            
            try {
                await page.waitForSelector('.base-search-card', { timeout: 10000 });
            } catch (e) {
                return;
            }

            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight));
                await page.waitForTimeout(1000);
            }

            const jobCards = await page.$$('.base-search-card');
            for (const card of jobCards) {
                try {
                    const titleEl = await card.$('.base-search-card__title');
                    const companyEl = await card.$('.base-search-card__subtitle');
                    const locationEl = await card.$('.job-search-card__location');
                    const linkEl = await card.$('a.base-card__full-link');

                    if (titleEl && companyEl && locationEl && linkEl) {
                        const title = (await titleEl.innerText()).trim();
                        const company = (await companyEl.innerText()).trim();
                        const location = (await locationEl.innerText()).trim();
                        let url = await linkEl.getAttribute('href');
                        
                        if (url) url = url.split('?')[0];

                        if (url && !seenUrls.has(url)) {
                            seenUrls.add(url);
                            allJobs.push({ company, title, location, url });
                        }
                    }
                } catch (e) {}
            }
        },
    });

    const urls = KEYWORDS.map(kw => ({
        url: `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(kw)}&location=Ireland&geoId=104738515&trk=public_jobs_jobs-search-bar_search-submit&position=1&pageNum=0`,
        userData: { keyword: kw }
    }));

    await crawler.run(urls);
    log.info(`Finished scraping. Found ${allJobs.length} unique jobs.`);

    // Map companies and insert missing ones
    log.info('Upserting companies...');
    const companyNames = [...new Set(allJobs.map(j => j.company))];
    const companyMap = new Map<string, number>();

    // Batch process companies
    for (const name of companyNames) {
        // Find existing
        const { data: existing } = await supabase
            .from('companies')
            .select('id')
            .eq('trading_name', name)
            .limit(1)
            .single();

        if (existing) {
            companyMap.set(name, existing.id);
        } else {
            // Upsert new
            const { data: inserted, error } = await supabase
                .from('companies')
                .upsert({
                    trading_name: name,
                    ats_provider: 'linkedin',
                    ats_board_token: name
                }, { onConflict: 'trading_name' })
                .select('id')
                .single();
                
            if (inserted) companyMap.set(name, inserted.id);
        }
    }

    // Upsert jobs
    log.info('Upserting jobs into jobs_IR...');
    const timestamp = new Date().toISOString();
    
    // Convert to DB format
    // Simple helper functions (import from inferJobLevel if possible, but keeping inline for standalone simplicity)
    const getLevel = (t: string) => {
        const lower = t.toLowerCase();
        if (lower.includes('senior') || lower.includes('sr') || lower.includes('lead') || lower.includes('principal')) return 'Senior';
        if (lower.includes('junior') || lower.includes('jr') || lower.includes('graduate')) return 'Junior';
        if (lower.includes('manager') || lower.includes('head') || lower.includes('director') || lower.includes('vp')) return 'Manager';
        return 'Mid';
    };

    const getSector = (t: string) => {
        const lower = t.toLowerCase();
        if (lower.includes('engineer') || lower.includes('developer') || lower.includes('data')) return 'Engineering & Data';
        if (lower.includes('sales') || lower.includes('account') || lower.includes('marketing')) return 'Sales & Marketing';
        if (lower.includes('product') || lower.includes('project')) return 'Product & Project';
        return 'Operations & Support';
    };

    for (let i = 0; i < allJobs.length; i += 500) {
        const batch = allJobs.slice(i, i + 500).map(j => ({
            company_id: companyMap.get(j.company),
            title: j.title.substring(0, 255),
            location: j.location.substring(0, 255),
            url: j.url,
            department: null,
            level: getLevel(j.title),
            sector: getSector(j.title),
            updated_at: timestamp
        })).filter(j => j.company_id); // Only valid mapped companies

        const { error } = await supabase.from('jobs_IR').upsert(batch, { onConflict: 'url' });
        if (error) log.error(`Batch insert error: ${error.message}`);
    }

    // Delete stale linkedin jobs
    log.info('Cleaning up stale LinkedIn jobs...');
    // Find all company IDs that are linkedin providers
    const { data: linkedinCompanies } = await supabase
        .from('companies')
        .select('id')
        .eq('ats_provider', 'linkedin');
        
    if (linkedinCompanies && linkedinCompanies.length > 0) {
        const companyIds = linkedinCompanies.map(c => c.id);
        
        // Delete where company_id is in list AND updated_at < timestamp
        // Supabase REST API doesn't support complex joins in delete, so we do it by chunks
        for (let i = 0; i < companyIds.length; i += 100) {
            const idChunk = companyIds.slice(i, i + 100);
            const { error } = await supabase
                .from('jobs_IR')
                .delete()
                .in('company_id', idChunk)
                .lt('updated_at', timestamp);
                
            if (error) log.error(`Delete stale error: ${error.message}`);
        }
    }

    log.info('LinkedIn sync completed successfully.');
}

scrapeLinkedin().catch(console.error);
