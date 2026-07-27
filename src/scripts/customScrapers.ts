import * as cheerio from 'cheerio';
import { Job, CompanyRow, fetchWithTimeout } from './syncAll';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());
export async function fetchCustom(url: string, company?: CompanyRow): Promise<Job[]> {
    if (url.includes('careers.bbc.co.uk')) {
        return fetchBBC(url);
    }
    if (url.includes('serco.com') || company?.id === 1740) {
        return fetchSerco(url);
    }
    if (url.includes('kpmgcareers.co.uk')) {
        return fetchKPMG(url);
    }
    if (url.includes('sumup.com')) {
        return fetchSumup(url);
    }
    if (url.includes('vodafone.com')) {
        return fetchVodafone(url);
    }
    if (url.includes('ibm.com')) {
        return fetchIBM(url);
    }
    if (url.includes('alphasights.com')) {
        return fetchAlphaSights(url);
    }
    if (url.includes('dojo.careers')) {
        return fetchDojo(url);
    }
    if (url.includes('spire.com')) {
        return fetchSpire(url);
    }
    if (url.includes('racingcareers.mclaren.com')) {
        return fetchMcLaren(url);
    }
    if (url.includes('cognism.com')) {
        return fetchCognism(url);
    }
    // Future custom scrapers will be routed here based on domain or company ID
    return [];
}

async function fetchSerco(url: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    try {
        let from = 0;
        let totalHits = 1;
        let lastFirstJobId = '';
        
        while (from < totalHits) {
            const searchUrl = `https://careers.serco.com/gb/en/search-results?from=${from}&s=40`;
            const initRes = await fetchWithTimeout(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!initRes.ok) break;
            
            const html = await initRes.text();
            const match = html.match(/"eagerLoadRefineSearch"\s*:\s*(\{[\s\S]*?\})\s*,\s*"jobwidgetsettings"/);
            if (!match) break;
            
            const data = JSON.parse(match[1]);
            const jobs = data?.data?.jobs || [];
            totalHits = data?.totalHits || 0;
            
            if (jobs.length === 0) break;
            
            // Check for pagination failure (if it returns the exact same page)
            if (jobs[0].jobId === lastFirstJobId) break;
            lastFirstJobId = jobs[0].jobId;
            
            for (const j of jobs) {
                const slug = (j.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                allJobs.push({
                    title: j.title || '',
                    location: j.location || j.cityStateCountry || '',
                    url: `https://careers.serco.com/gb/en/job/${j.jobId}/${slug}`,
                    department: j.category || '',
                    salary: undefined
                });
            }
            
            from += jobs.length;
            // sleep is not imported in customScrapers.ts, so we use a small manual delay
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (e) {
        console.error('[Custom: Serco] Error:', e);
    }
    return allJobs;
}

async function fetchSumup(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
        const res = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (!res.ok) {
            console.log(`[Custom: SumUp] Failed to fetch page: ${res.statusText}`);
            return [];
        }

        const html = await res.text();
        const $ = cheerio.load(html);
        
        // SumUp uses Next.js and hydrates its jobs directly in the DOM
        const nextDataStr = $('#__NEXT_DATA__').html();
        if (nextDataStr) {
            const nextData = JSON.parse(nextDataStr);
            const greenhouse = nextData.props?.pageProps?.page?.greenhouse;
            
            if (Array.isArray(greenhouse)) {
                for (const item of greenhouse) {
                    if (item.title && item.url) {
                        jobs.push({
                            title: item.title,
                            location: item.location?.city || '',
                            department: item.parentDepartmentName || item.department || '',
                            url: `https://www.sumup.com${item.url}`,
                        });
                    }
                }
            }
        }
        
        console.log(`[Custom: SumUp] Found ${jobs.length} jobs in Next.js state`);
    } catch (e) {
        console.error(`[Custom: SumUp] Error:`, e);
    }
    
    return jobs;
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

async function fetchVodafone(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log(`[Custom: Vodafone] Launching Puppeteer to scrape Eightfold...`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        const startUrl = 'https://jobs.vodafone.com/careers?start=0&pid=563018697741452&sort_by=timestamp';
        
        await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const extracted = await page.evaluate(async () => {
            const results: any[] = [];
            let start = 0;
            let total = 100; // Will be updated on first request
            
            while (start < total) {
                // Rate limit slightly
                await new Promise(r => setTimeout(r, 200));
                
                try {
                    const res = await fetch(`https://jobs.vodafone.com/api/pcsx/search?domain=vodafone.com&start=${start}&num=10&sort_by=timestamp`);
                    if (res.ok) {
                        const json = await res.json();
                        const data = json.data;
                        if (data && data.positions) {
                            total = data.count || data.positions.length;
                            results.push(...data.positions);
                            start += data.positions.length;
                            if (data.positions.length === 0) break;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                } catch (e) {
                    break;
                }
            }
            return results;
        });

        for (const item of extracted) {
            if (item.name && item.positionUrl) {
                jobs.push({
                    title: item.name,
                    location: (item.locations && item.locations.length > 0) ? item.locations[0] : (item.location || ''),
                    department: item.department || '',
                    url: item.positionUrl.startsWith('http') ? item.positionUrl : `https://jobs.vodafone.com${item.positionUrl}`,
                });
            }
        }
        
        console.log(`[Custom: Vodafone] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error(`[Custom: Vodafone] Error:`, e);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
    
    return jobs;
}

async function fetchIBM(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log(`[Custom: IBM] Fetching jobs via public search API...`);
    
    let from = 0;
    const size = 100;
    let total = 100; // Will be updated on first request
    
    try {
        while (from < total) {
            const payload = {
                "appId": "careers",
                "scopes": ["careers2"],
                "query": {
                    "bool": {
                        "must": [
                            {
                                "terms": {
                                    "field_keyword_05": ["United Kingdom"]
                                }
                            }
                        ]
                    }
                },
                "size": size,
                "from": from,
                "sort": [{ "_score": "desc" }, { "pageviews": "desc" }],
                "lang": "zz",
                "localeSelector": {},
                "sm": { "query": "", "lang": "zz" },
                "_source": ["_id", "title", "url", "description", "language", "entitled", "field_keyword_17", "field_keyword_08", "field_keyword_18", "field_keyword_19"]
            };

            const res = await fetchWithTimeout('https://www-api.ibm.com/search/api/v2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                },
                body: JSON.stringify(payload)
            }, 10000); // 10s timeout

            if (!res.ok) {
                console.log(`[Custom: IBM] Failed to fetch jobs (Status: ${res.status}): ${res.statusText}`);
                break;
            }

            const data = await res.json();
            const hitsInfo = data.hits;
            
            if (!hitsInfo || !hitsInfo.hits || hitsInfo.hits.length === 0) {
                break;
            }
            
            total = hitsInfo.total?.value || 0;
            
            for (const hit of hitsInfo.hits) {
                const source = hit._source;
                if (source && source.title && source.url) {
                    jobs.push({
                        title: source.title,
                        location: (source.field_keyword_19 ? source.field_keyword_19 + ', United Kingdom' : 'United Kingdom'),
                        department: source.field_keyword_08 || '',
                        url: source.url,
                    });
                }
            }
            
            from += hitsInfo.hits.length;
            
            // Rate limit slightly
            await new Promise(r => setTimeout(r, 200));
        }
        console.log(`[Custom: IBM] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error(`[Custom: IBM] Error:`, e);
    }
    
    return jobs;
}

async function fetchAlphaSights(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log(`[Custom: AlphaSights] Fetching from Greenhouse API...`);
    
    try {
        const res = await fetchWithTimeout('https://boards-api.greenhouse.io/v1/boards/alphasights/jobs');
        if (!res.ok) {
            console.log(`[Custom: AlphaSights] Failed to fetch: ${res.statusText}`);
            return [];
        }
        
        const data = await res.json();
        if (data.jobs && Array.isArray(data.jobs)) {
            for (const item of data.jobs) {
                if (item.title && item.absolute_url) {
                    let salary;
                    if (item.metadata && Array.isArray(item.metadata)) {
                        const salaryField = item.metadata.find((m: any) => m.name === 'Salary');
                        if (salaryField && salaryField.value) {
                            salary = salaryField.value;
                        }
                    }
                    
                    jobs.push({
                        title: item.title,
                        location: item.location?.name || '',
                        url: item.absolute_url,
                        department: '', 
                        salary: salary
                    });
                }
            }
        }
        console.log(`[Custom: AlphaSights] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error(`[Custom: AlphaSights] Error:`, e);
    }
    
    return jobs;
}

async function fetchDojo(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log(`[Custom: Dojo] Fetching from Greenhouse API...`);
    
    try {
        const res = await fetchWithTimeout('https://boards-api.greenhouse.io/v1/boards/dojo/jobs');
        if (!res.ok) {
            console.log(`[Custom: Dojo] Failed to fetch: ${res.statusText}`);
            return [];
        }
        
        const data = await res.json();
        if (data.jobs && Array.isArray(data.jobs)) {
            for (const item of data.jobs) {
                if (item.title && item.absolute_url) {
                    let salary;
                    if (item.metadata && Array.isArray(item.metadata)) {
                        const salaryField = item.metadata.find((m: any) => m.name === 'Salary');
                        if (salaryField && salaryField.value) {
                            salary = salaryField.value;
                        }
                    }
                    
                    jobs.push({
                        title: item.title,
                        location: item.location?.name || '',
                        url: item.absolute_url,
                        department: '', 
                        salary: salary
                    });
                }
            }
        }
        console.log(`[Custom: Dojo] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error(`[Custom: Dojo] Error:`, e);
    }
    
    return jobs;
}

async function fetchSpire(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log(`[Custom: Spire] Fetching from Greenhouse API...`);
    
    try {
        const res = await fetchWithTimeout('https://boards-api.greenhouse.io/v1/boards/spire/jobs');
        if (!res.ok) {
            console.log(`[Custom: Spire] Failed to fetch: ${res.statusText}`);
            return [];
        }
        
        const data = await res.json();
        if (data.jobs && Array.isArray(data.jobs)) {
            for (const item of data.jobs) {
                if (item.title && item.absolute_url) {
                    let salary;
                    if (item.metadata && Array.isArray(item.metadata)) {
                        const salaryField = item.metadata.find((m: any) => m.name === 'Salary');
                        if (salaryField && salaryField.value) {
                            salary = salaryField.value;
                        }
                    }
                    
                    jobs.push({
                        title: item.title,
                        location: item.location?.name || '',
                        url: item.absolute_url,
                        department: '', 
                        salary: salary
                    });
                }
            }
        }
        console.log(`[Custom: Spire] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error(`[Custom: Spire] Error:`, e);
    }
    
    return jobs;
}

async function fetchMcLaren(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log(`[Custom: McLaren] Fetching HTML to extract Recruitee data-props...`);
    
    try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) {
            console.log(`[Custom: McLaren] Failed to fetch: ${res.statusText}`);
            return [];
        }
        
        const html = await res.text();
        const $ = cheerio.load(html);
        const dataProps = $('div[data-component="PublicApp"]').attr('data-props');
        
        if (dataProps) {
            const data = JSON.parse(dataProps);
            const offers = data.appConfig?.offers || [];
            const departments = data.appConfig?.departments || [];
            
            for (const item of offers) {
                const title = item.translations?.en?.title || item.title;
                if (title && item.slug) {
                    let deptName = '';
                    if (item.departmentId) {
                        const dept = departments.find((d: any) => d.id === item.departmentId);
                        if (dept && dept.translations?.en?.name) {
                            deptName = dept.translations.en.name;
                        }
                    }
                    
                    jobs.push({
                        title: title,
                        location: item.city || item.translations?.en?.country || '',
                        url: `https://racingcareers.mclaren.com/o/${item.slug}`,
                        department: deptName, 
                        salary: undefined
                    });
                }
            }
        }
        console.log(`[Custom: McLaren] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error(`[Custom: McLaren] Error:`, e);
    }
    
    return jobs;
}

async function fetchCognism(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log(`[Custom: Cognism] Fetching from Greenhouse API...`);
    
    try {
        const res = await fetchWithTimeout('https://boards-api.greenhouse.io/v1/boards/cognism/jobs');
        if (!res.ok) {
            console.log(`[Custom: Cognism] Failed to fetch: ${res.statusText}`);
            return [];
        }
        
        const data = await res.json();
        if (data.jobs && Array.isArray(data.jobs)) {
            for (const item of data.jobs) {
                if (item.title && item.absolute_url) {
                    let salary;
                    if (item.metadata && Array.isArray(item.metadata)) {
                        const salaryField = item.metadata.find((m: any) => m.name === 'Salary');
                        if (salaryField && salaryField.value) {
                            salary = salaryField.value;
                        }
                    }
                    
                    jobs.push({
                        title: item.title,
                        location: item.location?.name || '',
                        url: item.absolute_url,
                        department: '', 
                        salary: salary
                    });
                }
            }
        }
        console.log(`[Custom: Cognism] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error(`[Custom: Cognism] Error:`, e);
    }
    
    return jobs;
}
