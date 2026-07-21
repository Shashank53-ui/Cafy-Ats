import * as cheerio from 'cheerio';
import { Job, CompanyRow, fetchWithTimeout } from './syncAll';

export async function fetchCustom(url: string, company?: CompanyRow): Promise<Job[]> {
    if (url.includes('careers.bbc.co.uk')) {
        return fetchBBC(url);
    }
    if (url.includes('kpmgcareers.co.uk')) {
        return fetchKPMG(url);
    }
    // Future custom scrapers will be routed here based on domain or company ID
    return [];
}

async function fetchKPMG(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://www.kpmgcareers.co.uk';
    const startUrl = `${baseUrl}/search/vacancies/`;
    let page = 1;

    try {
        // KPMG exposes jobs through a server-rendered HTML search page with pagination
        while (page <= 50) { // Safety limit
            const pageUrl = page === 1 ? startUrl : `${startUrl}?page=${page}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            
            if (!res.ok) {
                console.log(`[Custom: KPMG] Failed to fetch page ${page}: ${res.statusText}`);
                break;
            }

            const html = await res.text();
            const $ = cheerio.load(html);
            
            const jobElements = $('.vacancy-result').toArray();
            if (jobElements.length === 0) {
                break; // No more jobs
            }
            
            jobElements.forEach(el => {
                const title = $(el).find('h3').text().trim();
                const location = $(el).find('.vacancy-location b').text().trim();
                const department = $(el).find('.vacancy-service-line b').text().trim();
                const href = $(el).find('a.view-job-description').attr('href');
                
                const jobUrl = href?.startsWith('/') ? `${baseUrl}${href}` : (href || '');
                
                if (title && jobUrl) {
                    jobs.push({
                        title,
                        location,
                        url: jobUrl,
                        department,
                    });
                }
            });
            
            page++;
        }
        console.log(`[Custom: KPMG] Extracted ${jobs.length} jobs`);
    } catch (e) {
        console.error(`[Custom: KPMG] Error:`, e);
    }
    
    return jobs;
}

async function fetchBBC(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
        // We use this because standard HTML fetching gets blocked or returns 0 jobs due to JS rendering
        const sitemapUrl = 'https://careers.bbc.co.uk/sitemap.xml';
        const res = await fetchWithTimeout(sitemapUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (!res.ok) {
            console.log(`[Custom: BBC] Failed to fetch sitemap: ${res.statusText}`);
            return [];
        }

        const xml = await res.text();
        const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);

        for (const jobUrl of urls) {
            if (jobUrl.includes('/job/')) {
                // jobUrl format: https://careers.bbc.co.uk/job/London-Senior-Software-Engineer-W1A-1AA/1366730157/
                const parts = jobUrl.split('/job/');
                if (parts.length > 1) {
                    const slugPart = parts[1].split('/')[0]; // e.g. London-Senior-Software-Engineer-W1A-1AA
                    // Decode URL components just in case
                    const decoded = decodeURIComponent(slugPart);
                    // Replace dashes with spaces to make a readable title
                    let title = decoded.replace(/-/g, ' ');
                    
                    jobs.push({
                        title: title,
                        location: title, // Put title in location so ukFilter can scan it for cities
                        url: jobUrl,
                        department: '',
                        salary: undefined
                    });
                }
            }
        }
        console.log(`[Custom: BBC] Found ${jobs.length} jobs in sitemap`);
    } catch (e) {
        console.error(`[Custom: BBC] Error fetching jobs:`, e);
    }
    return jobs;
}
