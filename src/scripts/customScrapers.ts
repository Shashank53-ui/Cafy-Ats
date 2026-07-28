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
    if (company?.id === 220 || url.includes('jobs.nottingham.ac.uk')) {
        return fetchNottingham(url);
    }
    if (company?.id === 457 || url.includes('depopcareers.com')) {
        return fetchDepop(url);
    }
    if (company?.id === 308 || url.includes('stripe.com/jobs')) {
        return fetchStripe(url);
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
    if (company?.id === 1730 || url.includes('jobsearch.baesystems.com')) {
        return fetchBaeSystems(url);
    }
    if (company?.id === 1660 || url.includes('mckinsey.com')) {
        return fetchMcKinsey(url);
    }
    if (company?.id === 2025 || url.includes('careers.dcc.ie')) {
        return fetchDCC(url);
    }
    if (company?.id === 1689 || url.includes('jaguarlandrovercareers.com')) {
        return fetchJLR(url);
    }
    if (company?.id === 2189 || url.includes('careers.gates.com')) {
        return fetchGates(url);
    }
    if (company?.id === 2263 || url.includes('careers.bic.com')) {
        return fetchBIC(url);
    }
    if (company?.id === 1715 || url.includes('metrobank.avature.net')) {
        return fetchMetroBank(url);
    }
    if (company?.id === 1774 || url.includes('capgemini.com')) {
        return fetchCapgemini(url);
    }
    if (company?.id === 979 || url.includes('careers.zenobe.com')) {
        return fetchZenobe(url);
    }
    if (company?.id === 1590 || url.includes('collinsongrouptalent.com')) {
        return fetchCollinson(url);
    }
    if (company?.id === 407 || url.includes('jobs.elastic.co')) {
        return fetchElastic(url);
    }
    if (company?.id === 768 || url.includes('helsing.ai')) {
        return fetchHelsing(url);
    }
    if (company?.id === 893 || url.includes('datadoghq.com')) {
        return fetchDatadog(url);
    }
    if (company?.id === 889 || url.includes('careers.nothing.tech')) {
        return fetchNothing(url);
    }
    if (company?.id === 2306 || url.includes('bluelightcard.co.uk')) {
        return fetchBlueLight(url);
    }
    if (company?.id === 379 || url.includes('samsara.com/company/careers')) {
        return fetchSamsara(url);
    }
    if (company?.id === 2692 || url.includes('levccareers.com')) {
        return fetchLEVC(url);
    }
    if (company?.id === 43 || url.includes('salsify.com/careers')) {
        return fetchSalsify(url);
    }
    if (company?.id === 49 || url.includes('public.io/careers')) {
        return fetchPublic(url);
    }
    if (company?.id === 50 || url.includes('zwift.com/uk/careers')) {
        return fetchZwift(url);
    }
    if (company?.id === 157 || url.includes('trustpilot.com/careers')) {
        return fetchTrustpilot(url);
    }
    if (company?.id === 169 || url.includes('fastly.com/about/careers')) {
        return fetchFastly(url);
    }
    if (company?.id === 218 || url.includes('careers.airbnb.com')) {
        return fetchAirbnb(url);
    }
    if (company?.id === 370 || url.includes('careers.bromcom.com')) {
        return fetchBromcom(url);
    }
    if (company?.id === 1652 || url.includes('careers.ey.com')) {
        return fetchEY(url);
    }
    if (company?.id === 2030 || url.includes('logically.ai')) { return fetchLogically(url); }
    if (company?.id === 1714 || url.includes('infobric.com')) { return fetchInfobric(url); }
    if (company?.id === 989 || url.includes('otrium.com')) { return fetchOtrium(url); }
    if (company?.id === 1317 || url.includes('lucanet.com')) { return fetchLucanet(url); }
    if (company?.id === 1377 || url.includes('reading.ac.uk')) { return fetchReading(url); }
    if (company?.id === 1552 || url.includes('mindfoundry.ai')) { return fetchMindFoundry(url); }
    if (url.includes('next.co.uk') || url.includes('oraclecloud.com')) { return fetchNext(url); }
    if (url.includes('aize.io')) { return fetchAize(url); }
    if (url.includes('helloclue.com')) { return fetchClue(url); }
    if (url.includes('blackwall')) { return fetchBlackwall(url); }
    if (url.includes('booking.com')) { return fetchBooking(url); }
    if (url.includes('cynergy') || company?.id === 1317) { return fetchCynergy(url); }
    if (company?.id === 1774 || url.includes('capgemini.com')) { return fetchCapgemini(url); }
    
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

async function fetchBaeSystems(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: BAE Systems] Fetching jobs via HTML...');
    const cheerio = require('cheerio');
    
    try {
        let pageNum = 1;
        let hasNextPage = true;
        
        while (hasNextPage && pageNum <= 50) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const targetUrl = `https://jobsearch.baesystems.com/search-and-apply?_international_locations_checkboxes=united-kingdom&_paged=${pageNum}`;
            
            const res = await fetch(targetUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                console.log(`[BAE Debug] status=${res.status}`);
                break;
            }
            
            const html = await res.text();
            const $ = cheerio.load(html);
            
            const jobLinks = $('a[href*="/job/"]');
            if (jobLinks.length === 0) {
                hasNextPage = false;
                break;
            }
            
            jobLinks.each((_: any, el: any) => {
                const link = $(el);
                const title = link.find('h3').text().trim() || link.find('.job-title').text().trim();
                let loc = link.find('.job-card__location').text().replace(/\s+/g, ' ').trim();
                if (!loc) loc = 'United Kingdom';
                
                const href = link.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://jobsearch.baesystems.com${href}`;
                
                if (title && href) {
                    jobs.push({
                        title: title,
                        location: loc,
                        url: jobUrl,
                        department: ''
                    });
                }
            });
            
            if (jobLinks.length < 10) {
                hasNextPage = false;
            }
            
            pageNum++;
        }
    } catch (e: any) {
        console.error('[BAE Systems] Error:', e.message);
    }
    
    const uniqueJobs = Array.from(new Map(jobs.map(j => [j.url, j])).values());
    console.log(`[Custom: BAE Systems] Found ${uniqueJobs.length} jobs.`);
    return uniqueJobs;
}

async function fetchMcKinsey(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: McKinsey] Fetching API...');
    try {
        let hasNextPage = true;
        let startOffset = 1;
        while (hasNextPage && startOffset < 1000) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const res = await fetch(`https://gateway.mckinsey.com/apigw-x0cceuow60/v1/api/jobs/search?pageSize=20&start=${startOffset}&lang=en`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'User-Agent': 'Mozilla/5.0'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            console.log(`[McKinsey Debug] start=${startOffset} status=${res.status}`);
            
            if (res.ok) {
                const data = await res.json();
                console.log(`[McKinsey Debug] results length=${data.docs?.length}`);
                if (data.docs && data.docs.length > 0) {
                    for (const job of data.docs) {
                        let locStr = 'Remote';
                        if (job.locations && job.locations.length > 0) {
                            locStr = job.locations.map((l: any) => `${l.city}, ${l.country}`).join('; ');
                        }
                        jobs.push({
                            title: job.title || '',
                            location: locStr,
                            url: `https://www.mckinsey.com/careers/search-jobs/jobs/${job.jobID || job.id}`,
                            department: job.interestCategory || job.interest || ''
                        });
                    }
                    if (data.docs.length < 20) {
                        hasNextPage = false;
                    }
                } else {
                    hasNextPage = false;
                }
            } else {
                hasNextPage = false;
            }
            startOffset += 20;
        }
    } catch (e: any) {
        console.error('[McKinsey] Error:', e.message);
    }
    return jobs;
}

async function fetchLogically(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Logically] Fetching BambooHR API...');
    try {
        const res = await fetchWithTimeout('https://logicallyai.bamboohr.com/careers/list');
        if (res.ok) {
            const data = await res.json();
            if (data.result && data.result.length > 0) {
                for (const j of data.result) {
                    let loc = 'Remote';
                    if (j.location && j.location.city) {
                        loc = `${j.location.city}, ${j.location.state || ''} ${j.location.country || ''}`.trim();
                    }
                    jobs.push({
                        title: j.jobOpeningName,
                        url: `https://logicallyai.bamboohr.com/careers/${j.id}`,
                        location: loc,
                        department: j.departmentLabel || ''
                    });
                }
            }
        }
    } catch (e: any) { console.error('[Logically] Error:', e.message); }
    return jobs;
}

async function fetchInfobric(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Infobric] Fetching Teamtailor API...');
    try {
        const res = await fetchWithTimeout('https://careers.infobric.com/jobs.json', { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
            const data = await res.json();
            if (data.items) {
                for (const j of data.items) {
                    jobs.push({ title: j.title, url: j.url, location: 'UK', department: '' });
                }
            } else if (data.data) {
                for (const j of data.data) {
                    jobs.push({ title: j.attributes.title, url: j.links.careersite_job_url, location: 'UK', department: '' });
                }
            }
        }
    } catch (e: any) { console.error('[Infobric] Error:', e.message); }
    return jobs;
}

async function fetchOtrium(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Otrium] Fetching HiBob API...');
    try {
        const res = await fetchWithTimeout('https://api.hibob.com/v1/external/boards/otrium/jobs');
        if (res.ok) {
            const data = await res.json();
            for (const j of (data.jobs || [])) {
                let loc = j.location?.site?.name || j.location?.site?.country || 'Remote';
                jobs.push({ title: j.title, url: `https://careers.otrium.com/jobs/${j.id}`, location: loc, department: j.department || '' });
            }
        }
    } catch (e: any) { console.error('[Otrium] Error:', e.message); }
    return jobs;
}

async function fetchLucanet(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Lucanet] Fetching...');
    try {
        const res = await fetchWithTimeout('https://jobs.lucanet.com/jobs.json');
        if (res.ok) {
            const data = await res.json();
            for (const j of data.items || []) {
                let loc = 'Unknown';
                if (j._jobposting?.jobLocation?.[0]?.address?.addressCountry) {
                    loc = j._jobposting.jobLocation[0].address.addressCountry;
                }
                jobs.push({ title: j.title, url: j.url, location: loc, department: '' });
            }
        }
    } catch (e: any) { console.error('[Lucanet] Error:', e.message); }
    return jobs;
}

async function fetchReading(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Reading] Scraping HTML...');
    try {
        const res = await fetchWithTimeout('https://jobs.reading.ac.uk/vacancies.aspx');
        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            $('tr.vacancy').each((_, el) => {
                const linkEl = $(el).find('a.vacancy-link');
                const title = linkEl.text().trim();
                const link = linkEl.attr('href');
                const loc = $(el).find('.location').text().trim() || 'Reading, UK';
                if (title && link) {
                    jobs.push({ title, url: `https://jobs.reading.ac.uk/${link}`, location: loc, department: '' });
                }
            });
        }
    } catch (e: any) { console.error('[Reading] Error:', e.message); }
    return jobs;
}

async function fetchNext(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Next] Fetching...');
    return jobs;
}

async function fetchAize(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Aize] Fetching Teamtailor API...');
    try {
        const res = await fetchWithTimeout('https://www.aize.io/jobs.json');
        if (res.ok) {
            const data = await res.json();
            for (const j of data.items || []) {
                jobs.push({ title: j.title, url: j.url, location: 'UK', department: '' });
            }
        }
    } catch (e: any) { console.error('[Aize] Error:', e.message); }
    return jobs;
}

async function fetchMindFoundry(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Mind Foundry] Fetching Greenhouse API...');
    try {
        const res = await fetchWithTimeout('https://boards-api.greenhouse.io/v1/boards/mindfoundry/jobs');
        if (res.ok) {
            const data = await res.json();
            for (const j of data.jobs) {
                jobs.push({ title: j.title, url: j.absolute_url, location: j.location?.name || 'Remote', department: '' });
            }
        }
    } catch (e: any) { console.error('[Mind Foundry] Error:', e.message); }
    return jobs;
}

async function fetchClue(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Clue] Fetching Greenhouse API...');
    try {
        const res = await fetchWithTimeout('https://boards-api.greenhouse.io/v1/boards/helloclue/jobs');
        if (res.ok) {
            const data = await res.json();
            for (const j of data.jobs) {
                jobs.push({ title: j.title, url: j.absolute_url, location: j.location?.name || 'Remote', department: '' });
            }
        }
    } catch (e: any) { console.error('[Clue] Error:', e.message); }
    return jobs;
}

async function fetchBlackwall(url: string): Promise<Job[]> {
    return [];
}

async function fetchBooking(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Booking.com] Fetching Phenom API...');
    try {
        const payload = {
            "from": 0, "size": 100, "query": "*",
            "location": [], "department": [], "city": [], "state": [], "country": ["United Kingdom"]
        };
        const res = await fetchWithTimeout('https://jobs.booking.com/api/jobs/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            for (const j of data.jobs || []) {
                jobs.push({ title: j.title, url: j.url, location: 'United Kingdom', department: j.category || '' });
            }
        }
    } catch (e: any) { console.error('[Booking.com] Error:', e.message); }
    return jobs;
}

async function fetchDCC(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://careers.dcc.ie/flogasbritain/search/';
    const seenUrls = new Set<string>();
    let startrow = 0;
    
    console.log('[Custom: DCC] Fetching from SuccessFactors...');
    
    try {
        while (true) {
            const pageUrl = `${baseUrl}?startrow=${startrow}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            // DCC Flogas Britain SuccessFactors — try both job-tile and data-row formats
            const tiles = $('.job-tile, .data-row').toArray();
            
            if (tiles.length === 0) break;
            
            let newJobsOnPage = 0;
            for (const el of tiles) {
                const titleEl = $(el).find('.job-tile__title a, .jobTitle a');
                const title = titleEl.text().trim();
                const href = titleEl.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://careers.dcc.ie${href}`;
                // All jobs from Flogas Britain section are UK — hardcode UK location
                const rawLocation = $(el).find('.location, .jobFacility').text().trim();
                const location = rawLocation ? rawLocation + ', United Kingdom' : 'United Kingdom';
                
                if (title && jobUrl && !seenUrls.has(jobUrl)) {
                    seenUrls.add(jobUrl);
                    jobs.push({ title, url: jobUrl, location });
                    newJobsOnPage++;
                }
            }
            
            if (newJobsOnPage === 0) break;
            startrow += 25;
            await new Promise(r => setTimeout(r, 300));
        }
        console.log(`[Custom: DCC] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: DCC] Error:', e);
    }
    
    return jobs;
}

async function fetchJLR(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://www.jaguarlandrovercareers.com/search/';
    let startrow = 0;
    
    console.log('[Custom: JLR] Fetching from SuccessFactors...');
    
    try {
        while (true) {
            const pageUrl = `${baseUrl}?startrow=${startrow}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            const rows = $('.data-row').toArray();
            
            if (rows.length === 0) break;
            
            for (const el of rows) {
                // Use .hidden-phone to avoid duplicate responsive text; fall back to full text and de-dupe
                let title = $(el).find('.jobTitle .hidden-phone').text().trim();
                if (!title) {
                    const rawTitle = $(el).find('.jobTitle a').text().trim();
                    // De-duplicate SuccessFactors responsive text (e.g. "EngineerEngineer" → "Engineer")
                    if (rawTitle.length % 2 === 0) {
                        const half = rawTitle.length / 2;
                        title = rawTitle.substring(0, half) === rawTitle.substring(half) ? rawTitle.substring(0, half) : rawTitle;
                    } else {
                        title = rawTitle;
                    }
                }
                const href = $(el).find('.jobTitle a').attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://www.jaguarlandrovercareers.com${href}`;
                const rawLoc = $(el).find('.jobFacility .hidden-phone').text().trim() ||
                               $(el).find('.jobFacility').text().trim();
                // JLR is a UK manufacturer — always ensure UK appears in location
                const location = rawLoc ? (rawLoc.toLowerCase().includes('united kingdom') ? rawLoc : rawLoc + ', United Kingdom') : 'United Kingdom';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            startrow += 25;
            await new Promise(r => setTimeout(r, 300));
            if (rows.length < 25) break;
        }
        console.log(`[Custom: JLR] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: JLR] Error:', e);
    }
    
    return jobs;
}

async function fetchGates(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://careers.gates.com/search/';
    let startrow = 0;
    
    console.log('[Custom: Gates] Fetching from SuccessFactors...');
    
    try {
        while (true) {
            const pageUrl = `${baseUrl}?startrow=${startrow}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            const rows = $('.data-row').toArray();
            
            if (rows.length === 0) break;
            
            for (const el of rows) {
                let title = $(el).find('.jobTitle .hidden-phone').text().trim();
                if (!title) {
                    const rawTitle = $(el).find('.jobTitle a').text().trim();
                    if (rawTitle.length % 2 === 0) {
                        const half = rawTitle.length / 2;
                        title = rawTitle.substring(0, half) === rawTitle.substring(half) ? rawTitle.substring(0, half) : rawTitle;
                    } else { title = rawTitle; }
                }
                const href = $(el).find('.jobTitle a').attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://careers.gates.com${href}`;
                const rawLoc = $(el).find('.jobFacility .hidden-phone').text().trim() ||
                               $(el).find('.jobFacility').text().trim();
                const location = rawLoc ? (rawLoc.toLowerCase().includes('united kingdom') ? rawLoc : rawLoc + ', United Kingdom') : 'United Kingdom';
                const department = $(el).find('.jobDepartment').text().trim();
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location, department });
                }
            }
            
            startrow += 25;
            await new Promise(r => setTimeout(r, 300));
            if (rows.length < 25) break;
        }
        console.log(`[Custom: Gates] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Gates] Error:', e);
    }
    
    return jobs;
}

async function fetchBIC(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://careers.bic.com/search/';
    const seenUrls = new Set<string>();
    let startrow = 0;
    
    console.log('[Custom: BIC] Fetching from SuccessFactors...');
    
    try {
        while (true) {
            const pageUrl = `${baseUrl}?startrow=${startrow}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            const tiles = $('.job-tile').toArray();
            
            if (tiles.length === 0) break;
            
            let newJobsOnPage = 0;
            for (const el of tiles) {
                const titleEl = $(el).find('.job-tile__title a');
                const title = titleEl.text().trim();
                const href = titleEl.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://careers.bic.com${href}`;
                const location = $(el).find('.location').text().trim();
                
                if (title && jobUrl && !seenUrls.has(jobUrl)) {
                    seenUrls.add(jobUrl);
                    jobs.push({ title, url: jobUrl, location });
                    newJobsOnPage++;
                }
            }
            
            if (newJobsOnPage === 0) break;
            startrow += 25;
            await new Promise(r => setTimeout(r, 300));
        }
        console.log(`[Custom: BIC] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: BIC] Error:', e);
    }
    
    return jobs;
}

async function fetchMetroBank(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://metrobank.avature.net';
    // Jobs live at /amazingcareers/SearchJobs/?jobOffset=N (6 per page)
    let offset = 0;
    const seenUrls = new Set<string>();
    
    console.log('[Custom: Metro Bank] Fetching from Avature portal...');
    
    try {
        while (true) {
            const pageUrl = `${baseUrl}/amazingcareers/SearchJobs/?jobOffset=${offset}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            
            // Job links are /amazingcareers/JobDetail/Title/ID
            const jobLinks = $('a[href*="JobDetail"]').filter((_, el) => {
                const href = $(el).attr('href') || '';
                return !href.includes('twitter') && !href.includes('facebook') && !href.includes('linkedin');
            });

            if (jobLinks.length === 0) break;

            let newOnPage = 0;
            jobLinks.each((_, el) => {
                const title = $(el).text().trim();
                const href = $(el).attr('href') || '';
                if (!title || title === 'Read more') return;
                const jobUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                if (!seenUrls.has(jobUrl)) {
                    seenUrls.add(jobUrl);
                    // Location is in the row: "Team: X - Location: Y Ref: ..."
                    const row = $(el).closest('tr, div, li');
                    const rowText = row.text();
                    const locMatch = rowText.match(/Location:\s*([^R]+?)(?:Ref:|$)/);
                    const location = locMatch ? locMatch[1].trim() : 'United Kingdom';
                    jobs.push({ title, url: jobUrl, location: location || 'United Kingdom' });
                    newOnPage++;
                }
            });

            if (newOnPage === 0) break;
            offset += 6;
            await new Promise(r => setTimeout(r, 300));
        }
        console.log(`[Custom: Metro Bank] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Metro Bank] Error:', e);
    }
    
    return jobs;
}



async function fetchZenobe(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://careers.zenobe.com';
    let page = 1;
    
    console.log('[Custom: Zenobe] Fetching Teamtailor HTML...');
    
    try {
        while (page <= 20) {
            const pageUrl = `${baseUrl}/jobs/?page=${page}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            
            // Zenobe Teamtailor: jobs live in #jobs li, location in div.mt-1
            const items = $('[data-id="jobs-list"] li, #jobs li').toArray();
            if (items.length === 0) break;
            
            for (const el of items) {
                const a = $(el).find('a[href*="/jobs/"]').first();
                const title = a.text().trim();
                const href = a.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                // Location is inside div.mt-1 span, typically in the middle or end
                const mt1 = $(el).find('div.mt-1');
                const location = mt1.text().trim() || 'United Kingdom';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            page++;
        }
        console.log(`[Custom: Zenobe] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Zenobe] Error:', e);
    }
    
    return jobs;
}

async function fetchCollinson(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://www.collinsongrouptalent.com';
    let page = 1;
    
    console.log('[Custom: Collinson] Fetching Teamtailor HTML...');
    
    try {
        while (page <= 20) {
            const pageUrl = `${baseUrl}/jobs/?page=${page}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            
            const items = $('#jobs-list-container li').toArray();
            if (items.length === 0) break;
            
            for (const el of items) {
                const titleEl = $(el).find('.text-block-base-link');
                const title = titleEl.text().trim();
                const a = $(el).find('a').first();
                const href = a.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                const location = $(el).find('[class*="location"]').text().trim();
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            page++;
        }
        console.log(`[Custom: Collinson] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Collinson] Error:', e);
    }
    
    return jobs;
}

async function fetchElastic(url: string): Promise<Job[]> {
    // The /api/filter/jobs endpoint is gone (404). Elastic now uses AppSearchAPIConnector.
    // Scrape via Playwright to intercept the App Search API call.
    const jobs: Job[] = [];
    console.log('[Custom: Elastic] Fetching via Playwright (App Search intercept)...');

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const apiResults: any[] = [];

        page.on('response', async (res: any) => {
            const resUrl: string = res.url();
            if (resUrl.includes('elastic') && resUrl.includes('search') &&
                res.headers()['content-type']?.includes('json')) {
                try {
                    const json = await res.json();
                    apiResults.push(json);
                } catch { /* ignore */ }
            }
        });

        await page.goto('https://jobs.elastic.co/jobs/country/united-kingdom', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(5000);

        for (const data of apiResults) {
            const results = data.results || data.hits || data.jobs || [];
            for (const item of results) {
                const title = item.title?.raw || item.title || '';
                const jobUrl = item.url?.raw || item.absolute_url?.raw || item.url || '';
                const location = item.location?.raw || item.city?.raw || item.location || 'United Kingdom';
                if (title && jobUrl) jobs.push({ title, url: jobUrl, location });
            }
        }

        // Fallback: scrape DOM job cards
        if (jobs.length === 0) {
            const domJobs = await page.evaluate(() => {
                const results: any[] = [];
                document.querySelectorAll('[class*="job"] a, article a, li a').forEach((el: Element) => {
                    const title = el.textContent?.trim() || '';
                    const href = el.getAttribute('href') || '';
                    if (title && href && href.includes('/jobs/')) results.push({ title, url: href });
                });
                return results;
            });
            for (const item of domJobs) {
                const jobUrl = item.url.startsWith('http') ? item.url : `https://jobs.elastic.co${item.url}`;
                jobs.push({ title: item.title, url: jobUrl, location: 'United Kingdom' });
            }
        }

        console.log(`[Custom: Elastic] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Elastic] Error:', e);
    } finally {
        await browser.close();
    }

    return jobs;
}

async function fetchFromGreenhouse(boardToken: string, label: string): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
        const res = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`);
        if (!res.ok) {
            console.log(`[Custom: ${label}] Failed to fetch: ${res.statusText}`);
            return [];
        }
        const data = await res.json();
        if (data.jobs && Array.isArray(data.jobs)) {
            for (const item of data.jobs) {
                if (item.title && item.absolute_url) {
                    let salary;
                    if (item.metadata && Array.isArray(item.metadata)) {
                        const salaryField = item.metadata.find((m: any) => m.name === 'Salary');
                        if (salaryField?.value) salary = salaryField.value;
                    }
                    jobs.push({
                        title: item.title,
                        location: item.location?.name || '',
                        url: item.absolute_url,
                        salary,
                    });
                }
            }
        }
        console.log(`[Custom: ${label}] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error(`[Custom: ${label}] Error:`, e);
    }
    return jobs;
}

async function fetchHelsing(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('helsing', 'Helsing');
}

async function fetchDatadog(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('datadog', 'Datadog');
}

async function fetchNothing(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('nothing', 'Nothing');
}

async function fetchSamsara(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('samsara', 'Samsara');
}

async function fetchSalsify(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('salsify', 'Salsify');
}

async function fetchPublic(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('public-io', 'PUBLIC');
}

async function fetchZwift(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('zwift', 'Zwift');
}

async function fetchTrustpilot(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('trustpilot', 'Trustpilot');
}

async function fetchFastly(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('fastly', 'Fastly');
}

async function fetchAirbnb(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('airbnb', 'Airbnb');
}

async function fetchBlueLight(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://careers.bluelightcard.co.uk';
    let page = 1;
    
    console.log('[Custom: Blue Light Card] Fetching Teamtailor HTML...');
    
    try {
        while (page <= 20) {
            const pageUrl = `${baseUrl}/jobs?page=${page}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            
            const items = $('[data-id="jobs-list"] li, #jobs li, .jobs-list li').toArray();
            if (items.length === 0) break;
            
            for (const el of items) {
                const a = $(el).find('a[href*="/jobs/"]').first();
                const title = a.text().trim();
                const href = a.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                // Blue Light Card Teamtailor: location in div.mt-1
                const mt1 = $(el).find('div.mt-1');
                const location = mt1.text().trim() || 'United Kingdom';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            page++;
        }
        console.log(`[Custom: Blue Light Card] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Blue Light Card] Error:', e);
    }
    
    return jobs;
}

async function fetchLEVC(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://joinus.levccareers.com';
    let page = 1;
    
    console.log('[Custom: LEVC] Fetching Teamtailor HTML...');
    
    try {
        while (page <= 20) {
            const pageUrl = `${baseUrl}/jobs/?page=${page}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            
            const items = $('[data-id="jobs-list"] li, #jobs li, .jobs-list li').toArray();
            if (items.length === 0) break;
            
            for (const el of items) {
                const a = $(el).find('a').first();
                const title = a.text().trim();
                const href = a.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                // LEVC stores location inside div.mt-1
                const location = $(el).find('div.mt-1').text().trim() || 'Coventry';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            page++;
        }
        console.log(`[Custom: LEVC] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: LEVC] Error:', e);
    }
    
    return jobs;
}

async function fetchBromcom(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Bromcom] Fetching Recruitee data-props...');
    
    try {
        const res = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) {
            console.log(`[Custom: Bromcom] Failed to fetch: ${res.statusText}`);
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
                        if (dept?.translations?.en?.name) deptName = dept.translations.en.name;
                    }
                    jobs.push({
                        title,
                        location: item.city || item.translations?.en?.country || '',
                        url: `https://careers.bromcom.com/o/${item.slug}`,
                        department: deptName,
                    });
                }
            }
        }
        console.log(`[Custom: Bromcom] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Bromcom] Error:', e);
    }
    
    return jobs;
}

async function fetchEY(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://careers.ey.com/search/';
    const params = '?createNewAlert=false&q=&optionsFacetsDD_customfield1=&optionsFacetsDD_country=GB&optionsFacetsDD_city=';
    let startrow = 0;
    
    console.log('[Custom: EY] Fetching from SuccessFactors...');
    
    try {
        while (true) {
            const pageUrl = `${baseUrl}${params}&startrow=${startrow}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            const tiles = $('.job-tile, .data-row').toArray();
            
            if (tiles.length === 0) break;
            
            for (const el of tiles) {
                const titleEl = $(el).find('.job-tile__title a, .jobTitle a');
                let title = titleEl.text().trim();
                const href = titleEl.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://careers.ey.com${href}`;
                // EY URL already filters to country=GB, so all jobs are UK.
                // Location field in EY's SuccessFactors is empty — hardcode United Kingdom
                // and extract city from the job URL slug (e.g. /ey/job/London-Senior-.../)
                let location = $(el).find('.location, .jobFacility').text().trim();
                if (!location) {
                    // Try to extract city from href slug: /ey/job/CityName-JobTitle.../
                    const cityMatch = href.match(/\/job\/([A-Za-z][A-Za-z-]+?)-[A-Z]/);
                    location = cityMatch ? cityMatch[1].replace(/-/g, ' ') + ', United Kingdom' : 'United Kingdom';
                }

                // Fix SuccessFactors title duplication bug (e.g. "ManagerManager" -> "Manager")
                if (title.length > 0 && title.length % 2 === 0) {
                    const half = title.length / 2;
                    if (title.substring(0, half) === title.substring(half)) title = title.substring(0, half);
                }
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            startrow += 25;
            await new Promise(r => setTimeout(r, 300));
            if (tiles.length < 25) break;
        }
        console.log(`[Custom: EY] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: EY] Error:', e);
    }
    
    return jobs;
}

async function fetchCynergy(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Cynergy] Fetching Teamtailor API...');
    try {
        const res = await fetchWithTimeout('https://careers.cynergybank.co.uk/jobs.json');
        if (res.ok) {
            const data = await res.json();
            for (const j of data.items || []) {
                jobs.push({
                    title: j.title || '',
                    url: j.url || '',
                    location: 'United Kingdom',
                    department: ''
                });
            }
        }
    } catch (e: any) {
        console.error('[Cynergy] Error:', e.message);
    }
    return jobs;
}

async function fetchCapgemini(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Capgemini] Fetching jobs via API...');
    
    try {
        const targetUrl = `https://cg-jobstream-api.azurewebsites.net/api/job-search?country_code=en-gb%2Cgb-en%2Cen-gb%2Cgb-en&page=1&size=500`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const res = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
            console.log(`[Capgemini Debug] status=${res.status}`);
            return jobs;
        }
        
        const result = await res.json();
        const items = result.data || [];
        
        for (const job of items) {
            if (job.title && (job.apply_job_url || job.wp_url)) {
                jobs.push({
                    title: job.title,
                    location: job.location || job.city || 'United Kingdom',
                    url: job.apply_job_url || job.wp_url,
                    department: job.sbu || job.professional_communities || ''
                });
            }
        }
    } catch (e: any) {
        console.error('[Capgemini] Error:', e.message);
    }
    
    const uniqueJobs = Array.from(new Map(jobs.map(j => [j.url, j])).values());
    console.log(`[Custom: Capgemini] Found ${uniqueJobs.length} jobs.`);
    return uniqueJobs;
}

async function fetchNottingham(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
        const res = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) {
            console.log(`[Custom: Nottingham] Failed to fetch: ${res.statusText}`);
            return [];
        }

        const html = await res.text();
        const $ = cheerio.load(html);
        let currentCategory = 'Nottingham, UK';

        $('.vacancylist').each((i, listDiv) => {
            $(listDiv).children().each((j, el) => {
                if (el.tagName === 'h3') {
                    currentCategory = $(el).text().trim();
                } else if (el.tagName === 'p') {
                    const a = $(el).find('a');
                    if (a.length) {
                        const title = a.text().trim();
                        const href = a.attr('href');
                        let location = 'Nottingham, UK';
                        if (currentCategory.includes('Ningbo')) location = 'Ningbo, China';
                        else if (currentCategory.includes('Malaysia')) location = 'Semenyih, Malaysia';

                        jobs.push({
                            title,
                            url: 'https://jobs.nottingham.ac.uk/' + href,
                            location,
                            department: currentCategory,
                            salary: undefined
                        });
                    }
                }
            });
        });
    } catch (e: any) {
        console.error(`[Custom: Nottingham] error:`, e.message);
    }
    return jobs;
}

async function fetchDepop(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) {
            console.log(`[Custom: Depop] Failed to fetch: ${res.statusText}`);
            return [];
        }

        const html = await res.text();
        const $ = cheerio.load(html);
        const nextData = $('#__NEXT_DATA__').html();
        if (nextData) {
            const data = JSON.parse(nextData);
            
            let foundJobs: any = null;
            function findJobs(obj: any): any {
                if (!obj) return null;
                if (Array.isArray(obj)) {
                    if (obj.length > 0 && obj[0].title && (obj[0].location || obj[0].city || obj[0].team)) return obj;
                    for (const item of obj) {
                        const res = findJobs(item);
                        if (res) return res;
                    }
                } else if (typeof obj === 'object') {
                    for (const key in obj) {
                        const res = findJobs(obj[key]);
                        if (res) return res;
                    }
                }
                return null;
            }
            
            foundJobs = findJobs(data);
            if (foundJobs) {
                for (const j of foundJobs) {
                    jobs.push({
                        title: j.title || '',
                        url: j.absolute_url || url,
                        location: j.location || j.city || '',
                        department: j.team || '',
                        salary: undefined
                    });
                }
            }
        }
    } catch (e: any) {
        console.error(`[Custom: Depop] error:`, e.message);
    }
    return jobs;
}

async function fetchStripe(baseUrl: string): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
        let skip = 0;
        while (true) {
            const url = `https://stripe.com/jobs/search?skip=${skip}`;
            const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) {
                console.log(`[Custom: Stripe] Failed to fetch skip=${skip}: ${res.statusText}`);
                break;
            }

            const html = await res.text();
            const $ = cheerio.load(html);
            
            let pageCount = 0;
            $('tr').each((i, el) => {
                if (i === 0) return; // headers
                const linkEl = $(el).find('a');
                if (linkEl.length) {
                    const title = linkEl.text().trim();
                    let href = linkEl.attr('href');
                    if (href && href.startsWith('/')) href = 'https://stripe.com' + href;
                    
                    const tds = $(el).find('td');
                    let department = '';
                    let location = '';
                    if (tds.length >= 3) {
                        department = $(tds[1]).text().trim();
                        location = $(tds[2]).text().trim();
                    } else if (tds.length === 2) {
                        location = $(tds[1]).text().trim();
                    }
                    
                    jobs.push({
                        title,
                        url: href || url,
                        department,
                        location,
                        salary: undefined
                    });
                    pageCount++;
                }
            });

            if (pageCount < 10) {
                break;
            }
            skip += 100;
            if (skip > 3000) break; // safety cap
        }
    } catch (e: any) {
        console.error(`[Custom: Stripe] error:`, e.message);
    }
    return jobs;
}

