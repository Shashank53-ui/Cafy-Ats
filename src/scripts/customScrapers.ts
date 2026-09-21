import * as cheerio from 'cheerio';
import { Job, CompanyRow, fetchWithTimeout, fetchPhenom, fetchOracleCloud } from './syncAll';
import { inferJobTypeFromListing, parseJobType } from '../lib/parseJobType';
import pLimit from "p-limit";
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());
export async function fetchCustom(url: string, company?: CompanyRow): Promise<Job[]> {
    console.log(`[fetchCustom] Routing provider. Company ID: ${company?.id}, URL: "${url}"`);
    if (company?.id === 294 || url.includes('bbc.co.uk')) {
        return fetchBBC(url);
    }
    if (company?.id === 966 || url.includes('prosek.com')) {
        return fetchProsek(url);
    }
    if (company?.id === 1775 || url.includes('fishercareers.com')) {
        return fetchFisher(url);
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
    if (company?.id === 1594 || url.includes('yourcareer.rathbones.com')) {
        return fetchRathbones(url);
    }
    if (company?.id === 1584 || url.includes('talents.hikma.com')) {
        return fetchHikma(url);
    }
    if (company?.id === 928 || url.includes('netjets.jobs.hr.cloud.sap')) {
        return fetchNetJets(url);
    }
    if (company?.id === 440 || url.includes('careers.docusign.com')) {
        return fetchDocuSign(url);
    }
    if (company?.id === 1783 || url.includes('jobs.babcockinternational.com')) {
        return fetchBabcock(url);
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
    // ID 1714 = Kaluza (custom) — route only by URL domain, not by ID
    if (url.includes('infobric.com')) { return fetchInfobric(url); }
    // ID 989 = Ziff Davis (jobvite) — route only by URL domain, not by ID
    if (url.includes('otrium.com')) { return fetchOtrium(url); }
    // ID 1317 = YOOBIC (teamtailor) — route only by URL domain; Lucanet is ID 1692
    if (company?.id === 1692 || url.includes('lucanet.com')) { return fetchLucanet(url); }
    // ID 1377 = Cynergy Bank — route Reading only by URL domain
    if (url.includes('reading.ac.uk')) { return fetchReading(url); }
    // ID 1552 = Mind Foundry (greenhouse in DB) — route only by URL domain
    if (url.includes('mindfoundry.ai')) { return fetchMindFoundry(url); }
    if (url.includes('next.co.uk')) { return fetchNext(url); }
    if (url.includes('oraclecloud.com')) { return fetchOracleCloud(url); }
    if (url.includes('aize.io')) { return fetchAize(url); }
    if (url.includes('helloclue.com')) { return fetchClue(url); }
    if (url.includes('blackwall')) { return fetchBlackwall(url); }
    if (url.includes('booking.com')) { return fetchBooking(url); }
    // ID 1377 = Cynergy Bank (custom) — correct ID assignment
    if (company?.id === 1377 || url.includes('cynergy')) { return fetchCynergy(url); }
    // Duplicate Capgemini entry removed — already handled at line ~71 above
    
    // ID 1732 = Apple (custom)
    if (company?.id === 1732 || url.includes('jobs.apple.com')) { return fetchApple(url); }
    
    // ID 1636 = AXA UK (custom / Jibe)
    if (company?.id === 1636 || url.includes('axa.com')) { return fetchJibeApi('https://careers.axa.com', 'AXA'); }
    
    // ID 1734 = Aon (custom / Jibe)
    if (company?.id === 1734 || url.includes('jobs.aon.com')) { return fetchJibeApi('https://jobs.aon.com', 'Aon'); }
    
    // ID 1682 = Fitch Group (custom)
    if (company?.id === 1682 || url.includes('fitch.group')) { return fetchFitchGroup(url); }
    
    // ID 3160 = Tesco (custom)
    if (company?.id === 3160 || url.includes('tesco-careers.com') || url.includes('careers.tesco.com')) { return fetchTesco(url); }

    // ID 2695 = Ampa (custom / Pinpoint)
    if (company?.id === 2695 || url.includes('ampa.co.uk')) { return fetchAmpa(url); }

    // ID 4011 = Eli Lilly (Phenom)
    if (company?.id === 4011 || url.includes('careers.lilly.com')) {
        return fetchPhenom('https://careers.lilly.com');
    }

    // ID 4015 = Sanofi (custom)
    if (company?.id === 4015 || url.includes('jobs.sanofi.com')) { return fetchSanofi(url); }

    // ID 4016 = Hewlett Packard Enterprise (custom -> phenom)
    if (company?.id === 4016 || url.includes('careers.hpe.com')) { return fetchPhenom(url); }

    // ID 8000 = UnitedHealth Group (custom Radancy)
    if (company?.id === 8000 || url.includes('careers.unitedhealthgroup.com')) { return fetchUHG(url); }

    // ID 8001 = Qualcomm (custom Eightfold)
    if (company?.id === 8001 || url.includes('careers.qualcomm.com')) { return fetchQualcomm(); }

    // ID 8003 = Dell (Oracle Cloud)
    if (company?.id === 8003 || url.includes('enterpriseplatform.dell.com')) { return fetchOracleCloud('enterpriseplatform.dell.com|careers'); }

    // Future custom scrapers will be routed here based on domain or company ID
    return [];
}

export function cleanInlineJD(rawHtmlOrText?: string): string | undefined {
    if (!rawHtmlOrText || typeof rawHtmlOrText !== 'string') return undefined;

    // Quick length check
    if (rawHtmlOrText.trim().length < 100) return undefined;

    // Convert HTML to clean text
    if (rawHtmlOrText.includes('<') && rawHtmlOrText.includes('>')) {
        const $ = cheerio.load(rawHtmlOrText);
        $('script, style, iframe, noscript, svg, nav, footer, header').remove();

        // Convert block elements to logical newlines
        $('br').replaceWith('\n');
        $('p, div, h1, h2, h3, h4, h5, h6').each(function() { $(this).append('\n\n'); });
        $('li').each(function() { $(this).prepend('• ').append('\n'); });

        let text = $.text();

        // Clean up spacing
        text = text.replace(/[ \t]+/g, ' '); // collapse inline spaces
        text = text.replace(/^ | $/gm, ''); // remove leading/trailing spaces on each line
        text = text.replace(/\n{3,}/g, '\n\n'); // collapse multiple newlines

        const cleanText = text.trim();
        if (cleanText.length < 300) return undefined;

        // Return perfectly formatted plain text
        return cleanText;
    }

    return rawHtmlOrText.trim();
}

async function fetchAmpa(url: string): Promise<Job[]> {
    try {
        const r = await fetchWithTimeout(`https://careers.ampa.co.uk/postings.json`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!r.ok) return [];
        const d = await r.json();
        return (d.data || []).map((j: any) => {
            const locRaw = j.location;
            let location = '';
            if (locRaw && typeof locRaw === 'object') {
                const parts = [locRaw.name || locRaw.city, locRaw.province].filter(Boolean);
                location = parts.join(', ');
            } else {
                location = String(locRaw || '');
            }
            const fullDescription = [
                j.description,
                j.key_responsibilities_header ? `<strong>${j.key_responsibilities_header}</strong>` : '',
                j.key_responsibilities,
                j.skills_knowledge_expertise_header ? `<strong>${j.skills_knowledge_expertise_header}</strong>` : '',
                j.skills_knowledge_expertise,
                j.benefits_header ? `<strong>${j.benefits_header}</strong>` : '',
                j.benefits
            ].filter(Boolean).join('<br/><br/>');

            return {
                title: j.title || '',
                location,
                url: j.url || `https://careers.ampa.co.uk${j.path || ''}`,
                department: j.job?.department?.name || '',
                description: cleanInlineJD(fullDescription),
                salary: undefined
            };
        });
    } catch (e: any) {
        console.error('[Custom: Ampa] Error:', e.message);
        return []; 
    }
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
                const vacancyId = $(el).attr('data-vacancy-id') || '';
                const details = vacancyId
                    ? $(`.vacancy-description[data-vacancy-id="${vacancyId}"]`)
                    : $(el);
                const employmentField = details
                    .find('.vacancy-details-fields')
                    .toArray()
                    .map((n) => $(n).text().replace(/\s+/g, ' ').trim())
                    .filter((t) => /employment type|contract type/i.test(t));
                const jobType = inferJobTypeFromListing({ employmentField });
                
                if (title && jobUrl) {
                    jobs.push({
                        title,
                        location,
                        url: jobUrl,
                        department,
                        ...(jobType ? { job_type: jobType } : {}),
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
                    const decoded = decodeURIComponent(slugPart);
                    const segments = decoded.split('-');
                    
                    // BBC slug format: City-JobTitle-... or City-JobTitle-Postcode-...
                    // First segment is typically the city/location, not part of the title.
                    // Postcodes appear as two consecutive segments (e.g. "W1A" "1AA").
                    const postCodePattern = /^[A-Z]{1,2}[0-9][0-9A-Z]?$/;
                    const nonTitleSegments = new Set<number>();
                    for (let i = 0; i < segments.length - 1; i++) {
                        if (postCodePattern.test(segments[i]) && /^[0-9][A-Z]{2}$/.test(segments[i + 1])) {
                            nonTitleSegments.add(i);
                            nonTitleSegments.add(i + 1);
                        }
                    }
                    // Location = first segment; title = remaining minus postcode segments
                    const location = segments[0] ? segments[0].replace(/-/g, ' ') : 'United Kingdom';
                    const titleSegments = segments.slice(1).filter((_, i) => !nonTitleSegments.has(i + 1));
                    const title = titleSegments.join(' ').trim() || decoded.replace(/-/g, ' ');
                    
                    jobs.push({
                        title: title,
                        location: location,
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
    return fetchFromGreenhouse('alphasights', 'AlphaSights');
}

async function fetchDojo(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('dojo', 'Dojo');
}

async function fetchSpire(url: string): Promise<Job[]> {
    return fetchFromGreenhouse('spire', 'Spire');
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
    return fetchFromGreenhouse('cognism', 'Cognism');
}

async function fetchBaeSystems(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: BAE Systems] Fetching jobs via HTML...');
    
    try {
        let pageNum = 1;
        let hasNextPage = true;
        
        while (hasNextPage && pageNum <= 50) {
            const targetUrl = `https://jobsearch.baesystems.com/search-and-apply?_international_locations_checkboxes=united-kingdom&_paged=${pageNum}`;
            
            const res = await fetchWithTimeout(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            }, 30000);
            
            if (!res.ok) {
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
                    const card = link.closest('.job-card').length ? link.closest('.job-card') : link;
                    const employmentField = card
                        .find('.job-card__employment, .job-card__type, .job-type, .employment-type')
                        .first()
                        .text()
                        .replace(/\s+/g, ' ')
                        .trim();
                    const jobType = inferJobTypeFromListing({ employmentField });
                    jobs.push({
                        title: title,
                        location: loc,
                        url: jobUrl,
                        department: '',
                        ...(jobType ? { job_type: jobType } : {}),
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
            const res = await fetchWithTimeout(
                `https://gateway.mckinsey.com/apigw-x0cceuow60/v1/api/jobs/search?pageSize=20&start=${startOffset}&lang=en`,
                {
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'User-Agent': 'Mozilla/5.0'
                    }
                },
                30000
            );
            
            if (res.ok) {
                const data = await res.json();
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
                    // Use actual location from the JSON payload; fallback to empty so ukFilter decides
                    const loc = j._jobposting?.jobLocation?.[0]?.address?.addressLocality ||
                                j._jobposting?.jobLocation?.[0]?.address?.addressCountry ||
                                j['human-location'] || '';
                    jobs.push({
                        title: j.title,
                        url: j.url,
                        location: loc,
                        department: '',
                        description: cleanInlineJD(j.content_html)
                    });
                }
            } else if (data.data) {
                for (const j of data.data) {
                    const attrs = j.attributes || {};
                    const loc = attrs['human-location'] || '';
                    jobs.push({
                        title: attrs.title,
                        url: j.links?.careersite_job_url || '',
                        location: loc,
                        department: '',
                        description: cleanInlineJD(attrs.body || attrs.pitch)
                    });
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
                jobs.push({
                    title: j.title,
                    url: `https://careers.otrium.com/jobs/${j.id}`,
                    location: loc,
                    department: j.department || '',
                    description: cleanInlineJD(j.description)
                });
            }
        }
    } catch (e: any) { console.error('[Otrium] Error:', e.message); }
    return jobs;
}

async function fetchLucanet(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Lucanet] Fetching...');
    try {
        let hasNextPage = true;
        let startOffset = 0;
        
        while (hasNextPage && startOffset < 1000) {
            const res = await fetchWithTimeout(
                `https://lucanet.jobs.personio.com/search.json?language=en-GB&offset=${startOffset}`, 
                { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
            );
            
            if (!res.ok) {
                break;
            }
            
            const data = await res.json();
            
            if (data && Array.isArray(data)) {
                if (data.length === 0) break;
                
                for (const j of data) {
                    const loc = j.office || j.location || 'United Kingdom';
                    jobs.push({ 
                        title: j.name || j.title, 
                        url: `https://lucanet.jobs.personio.com/job/${j.id}`, 
                        location: loc, 
                        department: j.department || '' 
                    });
                }
                startOffset += data.length;
            } else {
                break;
            }
        }
        
        console.log(`[Custom: Lucanet] Found ${jobs.length} jobs.`);
    } catch (e: any) { 
        console.error('[Lucanet] Error:', e.message); 
    }
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

async function fetchNext(_url: string): Promise<Job[]> {
    console.log('[Custom: Next] Fetching Oracle Cloud HCM...');
    // Next retail careers sit on Oracle HCM; careers.next.co.uk is a vanity host.
    return fetchOracleCloud('ekeq.fa.em2.oraclecloud.com|CX_3001');
}

async function fetchAize(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Aize] Fetching Teamtailor API...');
    try {
        const res = await fetchWithTimeout('https://www.aize.io/jobs.json');
        if (res.ok) {
            const data = await res.json();
            for (const j of data.items || []) {
                // Use actual location from payload so ukFilter can properly decide
                const loc = j._jobposting?.jobLocation?.[0]?.address?.addressLocality ||
                            j._jobposting?.jobLocation?.[0]?.address?.addressCountry ||
                            j['human-location'] || '';
                jobs.push({
                    title: j.title,
                    url: j.url,
                    location: loc,
                    department: '',
                    description: cleanInlineJD(j.content_html)
                });
            }
        }
    } catch (e: any) { console.error('[Aize] Error:', e.message); }
    return jobs;
}

async function fetchMindFoundry(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Mind Foundry] Fetching Greenhouse API...');
    try {
        const res = await fetchWithTimeout('https://boards-api.greenhouse.io/v1/boards/mindfoundry/jobs?content=true');
        if (res.ok) {
            const data = await res.json();
            for (const j of data.jobs) {
                jobs.push({
                    title: j.title,
                    url: j.absolute_url,
                    location: j.location?.name || 'Remote',
                    department: '',
                    description: cleanInlineJD(j.content)
                });
            }
        }
    } catch (e: any) { console.error('[Mind Foundry] Error:', e.message); }
    return jobs;
}

async function fetchClue(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Clue] Fetching Greenhouse API...');
    try {
        const res = await fetchWithTimeout('https://boards-api.greenhouse.io/v1/boards/helloclue/jobs?content=true');
        if (res.ok) {
            const data = await res.json();
            for (const j of data.jobs) {
                jobs.push({
                    title: j.title,
                    url: j.absolute_url,
                    location: j.location?.name || 'Remote',
                    department: '',
                    description: cleanInlineJD(j.content)
                });
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
    console.log('[Custom: Booking.com] Fetching API...');
    try {
        for (const loc of ['United%20Kingdom', 'Ireland']) {
            const res = await fetchWithTimeout(`https://jobs.booking.com/api/jobs?location=${loc}&limit=100`, {
                method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
            });
            if (res.ok) {
                const data = await res.json();
                for (const j of data.jobs || []) {
                    if (j.data) {
                        let dept = j.data.category || '';
                        if (Array.isArray(dept)) dept = dept.join(', ');
                        
                        jobs.push({ 
                            title: j.data.title, 
                            url: `https://jobs.booking.com/job/${j.data.id}`, 
                            location: j.data.location_name || decodeURIComponent(loc), 
                            department: dept 
                        });
                    }
                }
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
            const tiles = ($('.job-tile').length > 0 ? $('.job-tile') : $('.data-row')).toArray();
            
            if (tiles.length === 0) break;
            
            let jobsOnPage = 0;
            for (const el of tiles) {
                const titleEl = $(el).find('.tiletitle a, .jobTitle a').first();
                const rawTitle = titleEl.text().trim().split('\n')[0].trim();
                let title = rawTitle;
                
                // Fix SuccessFactors title duplication bug
                if (title.length > 0 && title.length % 2 === 0) {
                    const half = title.length / 2;
                    if (title.substring(0, half) === title.substring(half)) title = title.substring(0, half);
                }
                
                const href = titleEl.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://careers.dcc.ie${href}`;
                
                const locSegments = $(el).find('.location, .jobFacility').text().trim().split('\n').map(s => s.trim()).filter(s => s && s !== 'Location');
                const location = locSegments.length > 0 ? locSegments.join(', ') : 'United Kingdom';
                
                if (title && jobUrl && !seenUrls.has(jobUrl)) {
                    seenUrls.add(jobUrl);
                    jobs.push({ title, url: jobUrl, location });
                    jobsOnPage++;
                }
            }
            
            if (jobsOnPage === 0) break;
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
                let rawLoc = $(el).find('.colLocation .jobLocation').text().trim();
                if (!rawLoc) {
                    rawLoc = $(el).find('.jobLocation').first().text().trim();
                }
                const location = rawLoc || 'United Kingdom'; // Fallback if completely empty, otherwise use extracted location
                
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
    let startrow = 0;
    
    console.log('[Custom: BIC] Fetching from SuccessFactors...');
    
    try {
        while (true) {
            const pageUrl = `${baseUrl}/search/?q=&locationsearch=&optionsFacetsDD_country=GB&startrow=${startrow}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            const rows = ($('.job-tile').length > 0 ? $('.job-tile') : $('.data-row')).toArray();
            
            if (rows.length === 0) break;
            
            let jobsOnPage = 0;
            for (const el of rows) {
                const titleEl = $(el).find('.tiletitle a, .jobTitle a').first();
                const rawTitle = titleEl.text().trim().split('\n')[0].trim();
                let title = rawTitle;
                
                // Fix SuccessFactors title duplication bug
                if (title.length > 0 && title.length % 2 === 0) {
                    const half = title.length / 2;
                    if (title.substring(0, half) === title.substring(half)) title = title.substring(0, half);
                }
                
                const href = titleEl.attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://careers.bic.com${href}`;
                
                const locSegments = $(el).find('.location').text().trim().split('\n').map(s => s.trim()).filter(s => s && s !== 'Location');
                const location = locSegments.length > 0 ? locSegments.join(', ') : 'United Kingdom';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                    jobsOnPage++;
                }
            }
            if (jobsOnPage === 0) break;
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
        const res = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`);
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
                    const jobTypeMeta = item.metadata?.find((m: any) => m.name && /employment|job.*type/i.test(m.name))?.value || '';
                    jobs.push({
                        title: item.title,
                        location: item.location?.name || '',
                        url: item.absolute_url,
                        job_type: parseJobType(jobTypeMeta || item.employment_type || item.type || item.employmentType) ?? undefined,
                        salary,
                        description: cleanInlineJD(item.content),
                        atsProvider: 'greenhouse',
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
    try {
        for (const country of ['GB', 'IE']) {
            let startrow = 0;
            const params = `?createNewAlert=false&q=&optionsFacetsDD_customfield1=&optionsFacetsDD_country=${country}&optionsFacetsDD_city=`;
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
                
                let jobsOnPage = 0;
                for (const el of tiles) {
                    const titleEl = $(el).find('.job-tile__title a, .jobTitle a');
                    let title = titleEl.text().trim();
                    const href = titleEl.attr('href') || '';
                    const jobUrl = href.startsWith('http') ? href : `https://careers.ey.com${href}`;
                    // EY URL already filters to country, so all jobs are UK or Ireland.
                    // Location field in EY's SuccessFactors is empty — extract city from the job URL slug (e.g. /ey/job/London-Senior-.../)
                    let location = $(el).find('.location, .jobFacility').text().trim();
                    if (!location) {
                        // Try to extract city from href slug: /ey/job/CityName-JobTitle.../
                        const cityMatch = href.match(/\/job\/([A-Za-z][A-Za-z-]+?)-[A-Z]/);
                        const fallbackCountry = country === 'GB' ? 'United Kingdom' : 'Ireland';
                        location = cityMatch ? cityMatch[1].replace(/-/g, ' ') + ', ' + fallbackCountry : fallbackCountry;
                    }

                    // Fix SuccessFactors title duplication bug (e.g. "ManagerManager" -> "Manager")
                    if (title.length > 0 && title.length % 2 === 0) {
                        const half = title.length / 2;
                        if (title.substring(0, half) === title.substring(half)) title = title.substring(0, half);
                    }
                    
                    const employmentField = $(el)
                        .find('.jobShifttype, .colShifttype, span.jobShifttype, .job-tile__shift')
                        .first()
                        .text()
                        .replace(/\s+/g, ' ')
                        .trim();
                    const jobType = inferJobTypeFromListing({ employmentField });
                    jobs.push({
                        title,
                        url: jobUrl,
                        location,
                        department: '',
                        ...(jobType ? { job_type: jobType } : {}),
                    });
                    jobsOnPage++;
                }
                
                startrow += 25;
                await new Promise(r => setTimeout(r, 300));
                if (jobsOnPage < 25) break;
            }
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
                    department: '',
                    description: cleanInlineJD(j.content_html)
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
    console.log('[Custom: Capgemini] Fetching jobs via API (Paginated)...');

    try {
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 20) { // arbitrary cap to prevent infinite loops
            const targetUrl = `https://cg-jobstream-api.azurewebsites.net/api/job-search?country_code=en-gb%2Cgb-en%2Cen-gb%2Cgb-en&page=${page}&size=100`;

            const res = await fetchWithTimeout(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            }, 30000); // 30s per page

            if (!res.ok) {
                console.error(`[Custom: Capgemini] API failed with status ${res.status}: ${res.statusText}`);
                break;
            }

            const result = await res.json();
            const items = result.data || [];
            if (items.length === 0) break;

            for (const job of items) {
                if (job.title && (job.apply_job_url || job.wp_url)) {
                    const jobType = inferJobTypeFromListing({
                        employmentField: job.contract_type || job.employment_type,
                    });
                    jobs.push({
                        title: job.title,
                        location: job.location || job.city || 'United Kingdom',
                        url: job.apply_job_url || job.wp_url,
                        department: job.sbu || job.professional_communities || '',
                        description: cleanInlineJD(job.job_description || job.description),
                        ...(jobType ? { job_type: jobType } : {}),
                    });
                }
            }

            if (items.length < 100) hasMore = false;
            page++;
            await new Promise(r => setTimeout(r, 500)); // sleep to respect rate limits
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

async function fetchApple(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    let page = 1;
    let totalPages = 1;
    
    console.log('[Custom: Apple] Fetching API...');
    
    try {
        for (const locCode of ['united-kingdom-GBR', 'ireland-IRL']) {
            page = 1;
            totalPages = 1;
            while (page <= totalPages && page <= 50) { // Safety limit of 50 pages
                const pageUrl = `https://jobs.apple.com/en-in/search?location=${locCode}&page=${page}`;
                const res = await fetchWithTimeout(pageUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                
                if (!res.ok) {
                    console.log(`[Custom: Apple] Failed to fetch page ${page} for ${locCode}: ${res.statusText}`);
                    break;
                }
                
                const html = await res.text();
                const $ = cheerio.load(html);
                let foundData = false;
                
                $('script').each((i, el) => {
                    const text = $(el).html();
                    if (text && text.includes('__staticRouterHydrationData = JSON.parse(')) {
                        const match = text.match(/JSON\.parse\((".*?")\);/);
                        if (match) {
                            try {
                                const jsonStr = JSON.parse(match[1]); 
                                const data = JSON.parse(jsonStr);     
                                const searchData = data?.loaderData?.search || {};
                                if (page === 1) {
                                    const totalRecords = searchData.totalRecords || 0;
                                    totalPages = Math.ceil(totalRecords / 20) || 1;
                                }
                                
                                const searchResults = searchData.searchResults || [];
                                for (const item of searchResults) {
                                    const title = item.postingTitle;
                                    const jobId = item.positionId;
                                    const jobUrl = `https://jobs.apple.com/en-in/details/${jobId}`;
                                    const location = item.locations?.[0]?.name || (locCode === 'ireland-IRL' ? 'Ireland' : 'United Kingdom');
                                    
                                    if (title && jobId) {
                                        const jobType = inferJobTypeFromListing({
                                            employmentField: [
                                                item.positionType,
                                                item.roleType,
                                                item.jobType,
                                                item.weeklyHours != null
                                                    ? `${item.weeklyHours} hours per week`
                                                    : null,
                                            ],
                                        });
                                        jobs.push({
                                            title,
                                            url: jobUrl,
                                            location,
                                            ...(jobType ? { job_type: jobType } : {}),
                                        });
                                    }
                                }
                                foundData = true;
                            } catch(e: any) {
                                console.error('[Custom: Apple] JSON parse error:', e.message);
                            }
                        }
                    }
                });
                
                if (!foundData) break;
                
                page++;
                await new Promise(r => setTimeout(r, 500)); // Respectful delay
            }
        }
        console.log(`[Custom: Apple] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Apple] Error:', e);
    }
    
    return jobs;
}

async function fetchJibeApi(baseUrl: string, companyName: string): Promise<Job[]> {
    const jobs: Job[] = [];
    let page = 1;
    let totalPages = 1;
    console.log(`[Custom: ${companyName}] Fetching API...`);
    try {
        for (const locCode of ['United%20Kingdom', 'Ireland']) {
            page = 1;
            totalPages = 1;
            while (page <= totalPages && page <= 50) { // Safety limit 50 pages (5000 jobs)
                const searchUrl = `${baseUrl}/api/jobs?page=${page}&limit=100&country=${locCode}`;
                const res = await fetchWithTimeout(searchUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                if (!res.ok) {
                    console.log(`[Custom: ${companyName}] Failed to fetch page ${page}: ${res.statusText}`);
                    break;
                }

                const data: any = await res.json();

                if (page === 1) {
                    totalPages = Math.ceil((data.totalCount || 0) / 100) || 1;
                    console.log(`[Custom: ${companyName}] Found ${data.totalCount || 0} jobs. Total pages: ${totalPages}`);
                }

                for (const item of data.jobs || []) {
                    const jData = item.data || {};
                    const title = jData.title;
                    const canonicalUrl = jData.meta_data?.canonical_url || jData.apply_url;
                    const location = jData.full_location || jData.country || decodeURIComponent(locCode);
                    const department = (jData.category && jData.category.length > 0) ? jData.category[0].trim() : '';
                    const description = jData.description || jData.content || '';

                    if (title && canonicalUrl) {
                        jobs.push({
                            title,
                            url: canonicalUrl,
                            location,
                            department,
                            description: cleanInlineJD(description)
                        });
                    }
                }

                page++;
                await new Promise(r => setTimeout(r, 500));
            }
        }
    } catch (e: any) {
        console.error(`[Custom: ${companyName}] Error:`, e.message);
    }
    return jobs;
}

async function fetchFitchGroup(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log(`[Custom: Fitch] Fetching HTML...`);
    try {
        for (const loc of ['uk', 'ireland']) {
            let startRow = 0;
            let foundJobs = true;
            let totalCount = 1000;
            
            while (foundJobs && startRow <= Math.min(totalCount, 5000)) {
                const pageUrl = `https://careers.fitch.group/search/?q=&locationsearch=${loc}&startrow=${startRow}`;
                const res = await fetchWithTimeout(pageUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                
                if (!res.ok) {
                    console.log(`[Custom: Fitch] Failed to fetch startRow ${startRow}: ${res.statusText}`);
                    break;
                }
                
                const html = await res.text();
                const $ = cheerio.load(html);
                
                const rows = $('tr.data-row');
                if (rows.length === 0) {
                    foundJobs = false;
                    break;
                }
                
                if (startRow === 0) {
                    const pagText = $('.paginationLabel').first().text();
                    const match = pagText.match(/of\s+(\d+)/);
                    if (match) totalCount = parseInt(match[1], 10);
                    console.log(`[Custom: Fitch] Found ${totalCount} total jobs (${loc})`);
                }
                
                rows.each((i, el) => {
                    const title = $(el).find('.jobTitle-link').text().trim();
                    let jobUrl = $(el).find('.jobTitle-link').attr('href');
                    if (jobUrl && !jobUrl.startsWith('http')) {
                        jobUrl = 'https://careers.fitch.group' + jobUrl;
                    }
                    const location = $(el).find('.jobLocation').text().trim() || (loc === 'uk' ? 'United Kingdom' : 'Ireland');
                    const department = $(el).find('.jobDepartment').text().trim() || '';
                    
                    if (title && jobUrl) {
                        jobs.push({ title, url: jobUrl, location, department });
                    }
                });
                
                startRow += 25;
                await new Promise(r => setTimeout(r, 300));
            }
        }
    } catch (e: any) {
        console.error('[Custom: Fitch] Error:', e.message);
    }
    return jobs;
}

async function fetchTesco(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    let offset = 0;
    let foundJobs = true;
    
    console.log(`[Custom: Tesco] Fetching HTML...`);
    try {
        while (foundJobs && offset <= 5000) { // Safety limit 5000 jobs
            const searchUrl = `https://careers.tesco.com/en_GB/careers/SearchJobs/?jobRecordsPerPage=100&jobOffset=${offset}`;
            const res = await fetchWithTimeout(searchUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            if (!res.ok) {
                console.log(`[Custom: Tesco] Failed to fetch offset ${offset}: ${res.statusText}`);
                break;
            }
            
            const html = await res.text();
            const $ = cheerio.load(html);
            
            const articles = $('article.article--result');
            if (articles.length === 0) {
                foundJobs = false;
                break;
            }
            
            articles.each((i, el) => {
                const title = $(el).find('h3 a').text().trim();
                let jobUrl = $(el).find('h3 a').attr('href');
                let location = $(el).find('.icon--location').text().trim();
                if (!location) {
                    location = $(el).find('[class*="location"]').text().trim();
                }
                const department = $(el).find('.icon--department').text().trim() || 'Retail';
                
                if (jobUrl && !jobUrl.startsWith('http')) {
                    jobUrl = 'https://careers.tesco.com' + jobUrl;
                }
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location: location || 'United Kingdom', department });
                }
            });
            
            console.log(`[Custom: Tesco] Offset ${offset}: Fetched ${articles.length} jobs.`);
            offset += articles.length;
            
            if (articles.length < 10) {
                console.log(`[Custom: Tesco] Reached the last page (fetched ${articles.length} < 10).`);
                foundJobs = false;
                break;
            }
            
            await new Promise(r => setTimeout(r, 500));
        }
    } catch (e: any) {
        console.error('[Custom: Tesco] Error:', e.message);
    }
    return jobs;
}


async function fetchBabcock(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://jobs.babcockinternational.com/Babcock/search/';
    let startrow = 0;
    
    console.log('[Custom: Babcock] Fetching from SuccessFactors...');
    
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
                    } else {
                        title = rawTitle;
                    }
                }
                const href = $(el).find('.jobTitle a').attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://jobs.babcockinternational.com${href}`;
                let rawLoc = $(el).find('.colLocation .jobLocation').text().trim();
                if (!rawLoc) {
                    rawLoc = $(el).find('.jobLocation').first().text().trim();
                }
                const location = rawLoc || 'United Kingdom';
                
                if (title && jobUrl) {
                    const employmentField = $(el)
                        .find('.jobShifttype, .colShifttype, span.jobShifttype')
                        .first()
                        .text()
                        .replace(/\s+/g, ' ')
                        .trim();
                    const jobType = inferJobTypeFromListing({ employmentField });
                    jobs.push({
                        title,
                        url: jobUrl,
                        location,
                        ...(jobType ? { job_type: jobType } : {}),
                    });
                }
            }
            
            startrow += 25;
            await new Promise(r => setTimeout(r, 300));
            if (rows.length < 25) break;
        }
        console.log(`[Custom: Babcock] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Babcock] Error:', e);
    }
    
    return jobs;
}


async function fetchRathbones(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://yourcareer.rathbones.com/search/';
    let startrow = 0;
    
    console.log('[Custom: Rathbones] Fetching from SuccessFactors...');
    
    try {
        while (true) {
            const pageUrl = `${baseUrl}?startrow=${startrow}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;
            
            const html = await res.text();
            const $ = cheerio.load(html);
            const rows = $('.sub-section-desktop').toArray();
            
            if (rows.length === 0) break;
            
            for (const el of rows) {
                let title = $(el).find('.jobTitle-link').text().trim();
                const href = $(el).find('.jobTitle-link').attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://yourcareer.rathbones.com${href}`;
                let rawLoc = $(el).find('.section-field.location div[id*="-value"]').text().trim();
                const location = rawLoc || 'United Kingdom';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            startrow += 5;
            await new Promise(r => setTimeout(r, 300));
            if (rows.length < 5) break;
        }
        console.log(`[Custom: Rathbones] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Rathbones] Error:', e);
    }
    
    return jobs;
}

async function fetchHikma(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://talents.hikma.com/search/';
    let startrow = 0;
    
    console.log('[Custom: Hikma] Fetching from SuccessFactors...');
    
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
                    } else {
                        title = rawTitle;
                    }
                }
                const href = $(el).find('.jobTitle a').attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://talents.hikma.com${href}`;
                
                let rawLoc = $(el).find('.colLocation .jobLocation').text().trim();
                if (!rawLoc) {
                    rawLoc = $(el).find('.jobLocation').first().text().trim();
                }
                const location = rawLoc || 'United Kingdom';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            startrow += 50;
            await new Promise(r => setTimeout(r, 300));
            if (rows.length < 50) break;
        }
        console.log(`[Custom: Hikma] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Hikma] Error:', e);
    }
    
    return jobs;
}

async function fetchNetJets(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const baseUrl = 'https://netjets.jobs.hr.cloud.sap/europe/search/';
    let startrow = 0;
    
    console.log('[Custom: NetJets] Fetching from SuccessFactors...');
    
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
                    } else {
                        title = rawTitle;
                    }
                }
                const href = $(el).find('.jobTitle a').attr('href') || '';
                const jobUrl = href.startsWith('http') ? href : `https://netjets.jobs.hr.cloud.sap${href}`;
                
                let rawLoc = $(el).find('.colLocation .jobLocation').text().trim();
                if (!rawLoc) {
                    rawLoc = $(el).find('.jobLocation').first().text().trim();
                }
                const location = rawLoc || 'United Kingdom';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }
            
            startrow += 25;
            await new Promise(r => setTimeout(r, 300));
            if (rows.length < 25) break;
        }
        console.log(`[Custom: NetJets] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: NetJets] Error:', e);
    }
    
    return jobs;
}

async function fetchDocuSign(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    let page = 1;

    console.log('[Custom: DocuSign] Fetching from JSON API...');
    
    try {
        while (true) {
            const pageUrl = `https://careers.docusign.com/api/jobs?page=${page}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;

            const data = await res.json();
            if (!data.jobs || data.jobs.length === 0) break;

            for (const item of data.jobs) {
                const jobData = item.data;
                const title = jobData.title;
                const jobUrl = jobData.meta_data?.canonical_url || `https://careers.docusign.com/jobs/${jobData.slug}?lang=en-us`;
                
                const location = jobData.location_name || jobData.city || jobData.country || 'Unknown';
                
                if (title && jobUrl) {
                    jobs.push({ title, url: jobUrl, location });
                }
            }

            page++;
            await new Promise(r => setTimeout(r, 200));
        }
        console.log(`[Custom: DocuSign] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: DocuSign] Error:', e);
    }
    
    return jobs;
}

async function fetchProsek(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Prosek] Fetching from Greenhouse API directly...');
    try {
        const apiUrl = 'https://boards-api.greenhouse.io/v1/boards/prosek/jobs?content=true';
        const res = await fetchWithTimeout(apiUrl);
        if (!res.ok) {
            console.error('[Custom: Prosek] API returned', res.status);
            return jobs;
        }
        
        const data = await res.json();
        if (data.jobs && Array.isArray(data.jobs)) {
            for (const job of data.jobs) {
                const title = job.title;
                const jobUrl = job.absolute_url;
                const location = job.location?.name || 'Unknown';
                if (title && jobUrl) {
                    jobs.push({
                        title,
                        url: jobUrl,
                        location,
                        description: cleanInlineJD(job.content)
                    });
                }
            }
        }
        console.log(`[Custom: Prosek] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Prosek] Error:', e);
    }
    return jobs;
}

async function fetchFisher(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    console.log('[Custom: Fisher] Fetching HTML pages...');
    
    let p = 1;
    const seenUrls = new Set<string>();
    
    try {
        while (true) {
            const pageUrl = `https://www.fishercareers.com/search-jobs?p=${p}`;
            const res = await fetchWithTimeout(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) break;

            const html = await res.text();
            const $ = cheerio.load(html);
            let newJobsOnPage = 0;
            
            $('a').each((i, el) => {
                const href = $(el).attr('href') || '';
                if (href.includes('/job/')) {
                    const title = $(el).find('.job-title').text().trim() || $(el).find('h3').text().trim();
                    const location = $(el).find('p').first().text().trim() || 'Unknown';
                    const jobUrl = href.startsWith('http') ? href : `https://www.fishercareers.com${href}`;
                    
                    if (title && jobUrl && !seenUrls.has(jobUrl)) {
                        seenUrls.add(jobUrl);
                        newJobsOnPage++;
                        jobs.push({ title, url: jobUrl, location });
                    }
                }
            });
            
            if (newJobsOnPage === 0) break;
            
            p++;
            await new Promise(r => setTimeout(r, 300));
        }
        console.log(`[Custom: Fisher] Found ${jobs.length} jobs.`);
    } catch (e) {
        console.error('[Custom: Fisher] Error:', e);
    }
    
    return jobs;
}

async function fetchSanofi(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    };

    let page = 1;
    let keepGoing = true;

    while (keepGoing && page <= 50) {
        try {
            const pageUrl = `https://jobs.sanofi.com/en/search-jobs?p=${page}`;
            console.log(`[Custom: Sanofi] Fetching page ${page} -> ${pageUrl}`);
            const r = await fetchWithTimeout(pageUrl, { headers });
            if (!r.ok) {
                console.log(`[Custom: Sanofi] HTTP error ${r.status}`);
                break;
            }
            const html = await r.text();
            const $ = cheerio.load(html);

            const items = $('#search-results-list ul li');
            if (items.length === 0) {
                keepGoing = false;
                break;
            }

            items.each((_, el) => {
                const a = $(el).find('a');
                if (!a.length) return;
                
                const title = a.find('h2').text().trim() || a.text().trim();
                let href = a.attr('href') || '';
                if (href.startsWith('/')) {
                    href = `https://jobs.sanofi.com${href}`;
                }

                let locText = $(el).find('.job-location').text().trim();
                locText = locText.replace(/^Location:\s*/i, '').trim();

                if (title && href) {
                    jobs.push({
                        title,
                        url: href,
                        location: locText
                    });
                }
            });
            page++;
        } catch (e) {
            console.error(`[Custom: Sanofi] Error on page ${page}:`, e);
            break;
        }
    }
    return jobs;
}
async function fetchUHG(url: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    };

    let page = 1;
    let keepGoing = true;

    while (keepGoing && page <= 400) {
        try {
            const pageUrl = `https://careers.unitedhealthgroup.com/search-jobs?p=${page}`;
            console.log(`[Custom: UHG] Fetching page ${page} -> ${pageUrl}`);
            const r = await fetchWithTimeout(pageUrl, { headers });
            if (!r.ok) {
                console.log(`[Custom: UHG] HTTP error ${r.status}`);
                break;
            }
            const html = await r.text();
            const $ = cheerio.load(html);

            const items = $('#search-results-list ul li');
            if (items.length === 0) {
                keepGoing = false;
                break;
            }

            items.each((_, el) => {
                const a = $(el).find('a');
                if (!a.length) return;
                const title = a.find('h2, h3').text().trim();
                let href = a.attr('href') || '';
                if (href && !href.startsWith('http')) {
                    href = `https://careers.unitedhealthgroup.com${href}`;
                }
                const loc = $(el).find('.job-location, .location').text().trim() || a.find('.job-location, .location').text().trim();
                
                if (title && href) {
                    jobs.push({
                        title,
                        url: href,
                        location: loc
                    });
                }
            });

            page++;
            // Random delay to avoid IP blocks
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));
        } catch (err: any) {
            console.log(`[Custom: UHG] Error fetching page ${page}: ${err.message}`);
            break;
        }
    }

    return jobs;
}

async function fetchQualcomm(): Promise<Job[]> {
    const rawPositions: any[] = [];
    let start = 0;
    const PAGE_SIZE = 10;

    while (start < 3000) { // Safety limit to cover ~3000 jobs
        try {
            const url = `https://careers.qualcomm.com/api/pcsx/search?domain=qualcomm.com&query=&start=${start}&sort_by=timestamp`;
            console.log(`[Custom: Qualcomm] Fetching start=${start} -> ${url}`);

            const res = await fetchWithTimeout(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) {
                console.log(`[Custom: Qualcomm] HTTP error ${res.status}`);
                break;
            }

            const d = await res.json();
            const positions = d.data?.positions || [];

            if (positions.length === 0) break;

            rawPositions.push(...positions);

            if (positions.length < PAGE_SIZE) break;

            start += positions.length;
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err: any) {
            console.log(`[Custom: Qualcomm] Error at start=${start}: ${err.message}`);
            break;
        }
    }

    // Concurrently fetch job descriptions for all collected positions
    const limit = pLimit(10);
    const allJobs: Job[] = [];

    await Promise.all(rawPositions.map(p => limit(async () => {
        try {
            const detailUrl = `https://careers.qualcomm.com/api/apply/v2/jobs/${p.id}?domain=qualcomm.com`;
            const detailRes = await fetchWithTimeout(detailUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                }
            });
            let description = '';
            if (detailRes.ok) {
                const detailData = await detailRes.json();
                description = detailData.job_description || '';
            }

            allJobs.push({
                title: p.name || '',
                location: p.locations?.[0] || p.standardizedLocations?.[0] || '',
                url: `https://careers.qualcomm.com${p.positionUrl}?domain=qualcomm.com`,
                department: p.department || '',
                salary: (typeof p !== 'undefined' && (p as any)?.salary) ? String(typeof (p as any).salary === 'object' ? JSON.stringify((p as any).salary) : (p as any).salary) : undefined,
                description: cleanInlineJD(description)
            });
        } catch (err: any) {
            console.log(`[Custom: Qualcomm] Error fetching detail for ${p.id}: ${err.message}`);
            allJobs.push({
                title: p.name || '',
                location: p.locations?.[0] || p.standardizedLocations?.[0] || '',
                url: `https://careers.qualcomm.com${p.positionUrl}?domain=qualcomm.com`,
                department: p.department || '',
                salary: (typeof p !== 'undefined' && (p as any)?.salary) ? String(typeof (p as any).salary === 'object' ? JSON.stringify((p as any).salary) : (p as any).salary) : undefined
            });
        }
    })));

    return allJobs;
}
