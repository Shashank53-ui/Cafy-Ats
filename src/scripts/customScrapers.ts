import * as cheerio from 'cheerio';
import { Job, CompanyRow, fetchWithTimeout, fetchPhenom, fetchOracleCloud } from './syncAll';
import { supabase } from '../lib/supabase';
import { inferJobTypeFromListing, parseJobType, resolveJobType } from '../lib/parseJobType';
import { sanitizeJobLocation } from '../lib/refineLocation';
import { isUKJob } from '../lib/ukFilter';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';
import { resolveJobLevelsBatch } from '../lib/resolveJobLevel';
import { chromium } from 'playwright';
import pLimit from "p-limit";
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());
async function enrichHtmlJobDescriptionsConcurrently(jobs: Job[]): Promise<void> {
    const limit = pLimit(5);
    await Promise.all(jobs.map(j => limit(async () => {
        if (j.description && j.description.length > 50) return;

        // Small delay to prevent rate limits / IP blocks (406 Not Acceptable)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

        let retries = 3;
        while (retries > 0) {
            try {
                const res = await fetchWithTimeout(j.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!res.ok) {
                    if (res.status === 406 || res.status === 429) {
                        console.log(`[enrichHtml] Rate limited (${res.status}) on ${j.url}, retrying in 5s...`);
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        retries--;
                        continue;
                    }
                    console.log(`[enrichHtml] Failed to fetch JD for ${j.url}: HTTP ${res.status}`);
                    return;
                }
                const html = await res.text();
                let $ = cheerio.load(html);

                // JLR / SuccessFactors edge case: Some return a script wrapping HTML or block entirely without cookies, but we try parsing anyway.
                const selectors = [
                    '[data-id="job-description"]', '.job-description', '#job-description',
                    '.jobDescription', '.jobdescription', '.joblayouttoken', '#jd-description',
                    'div[itemprop="description"]', 'section[itemprop="description"]', '.posting-description',
                    '.job-details', '.description', '.jd-info', '.article__content', 'article', 'main.content', 'main'
                ];

                for (const sel of selectors) {
                    if ($(sel).length && $(sel).first().text().trim().length > 100) {
                        j.description = cleanInlineJD($(sel).first().html() || '');
                        if (j.description) return;
                    }
                }

                j.description = cleanInlineJD($('body').html() || '');
                return; // Success
            } catch (err: any) {
                console.log(`[enrichHtml] Error fetching JD for ${j.url}: ${err.message}`);
                return;
            }
        }
    })));
}

async function fetchCustomInternal(url: string, company?: CompanyRow): Promise<Job[]> {
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

    // ID 1733 = Google (custom) — route by URL domain to survive DB ID changes
    if (url.includes('google.com/about/careers') || url.includes('google.com/about/careers/applications')) { return fetchGoogle(company || { id: 1733, trading_name: 'Google' } as CompanyRow); }

    // ID 8003 = Dell (Oracle Cloud)
    if (company?.id === 8003 || url.includes('enterpriseplatform.dell.com')) { return fetchOracleCloud('enterpriseplatform.dell.com|careers'); }

    // Future custom scrapers will be routed here based on domain or company ID
    return [];
}

async function fetchGoogle(company: CompanyRow): Promise<Job[]> {
    console.log(`\\n--- Fetching Google Careers Jobs for ${company.trading_name} (ID: ${company.id}) ---`);

    // 1. Find Company (already passed, but we can double-check)
    const { data: companies, error: searchError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', company.id);

    if (searchError || !companies || companies.length === 0) {
        console.error(`Could not find company with ID ${company.id} in DB!`);
        return [];
    }

    const companyData = companies[0];
    console.log(`Found Company: ${companyData.trading_name} (ID: ${companyData.id})`);

    // 2. Map ats provider as custom (optional, but we can set if not already)
    // We'll skip updating the DB here to avoid unnecessary writes on every sync.
    // The syncAll pipeline expects the provider to be set to 'custom_site' for this to be called.
    // If you need to set it, do it once via a separate script or manually.

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
        return [];
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

    if (uniqueJobs.length === 0) {
        console.log("No jobs to insert for Google.");
        return [];
    }

    const levelResolved = await resolveJobLevelsBatch(
        uniqueJobs.map((job: any) => ({ title: job.title }))
    );

    // Fetch JDs concurrently
    const limit = pLimit(10);
    console.log(`[Custom: Google] Fetching JDs for ${uniqueJobs.length} jobs concurrently...`);
    let validJobsCount = 0;
    let skippedJobsCount = 0;

    const jobsToInsert: Job[] = [];

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
            companyData.company_sector,
        );
        const resolved = levelResolved[i]!;
        const level = resolved.level;

        // Debug first job
        if (jobsToInsert.length === 0) {
            console.log(`[Custom: Google] First job description length: ${cleanDesc.length}`);
            console.log(`[Custom: Google] First job description preview: ${cleanDesc.slice(0, 200)}`);
        }

        jobsToInsert.push({
            title: job.title,
            location: sanitizeJobLocation(job.location, 'uk', job.title, job.url),
            url: job.url,
            department,
            description: cleanDesc,
        } as any);
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
    }).eq('id', companyData.id);

    console.log(`Successfully completed Google ingestion! Inserted ${jobsToInsert.length} jobs.`);
    return jobsToInsert;
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

        let cleanText = text.trim();
        
        // Strip common unwanted UI text from the beginning/anywhere
        cleanText = cleanText.replace(/(?:^[ \t]*•?[ \t]*\n*)*Back to (?:job )?search results\s*/ig, '');
        
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
    const rawJobs: any[] = [];
    const allJobs: Job[] = [];
    let csrfToken = '';

    try {
        let from = 0;
        let totalHits = 1;
        let lastFirstJobId = '';
        
        while (from < totalHits) {
            const searchUrl = `https://careers.serco.com/gb/en/search-results?from=${from}&s=40`;
            const initRes = await fetchWithTimeout(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!initRes.ok) break;
            
            const html = await initRes.text();

            if (!csrfToken) {
                const csrfMatch = html.match(/"csrfToken"\s*:\s*"([^"]+)"/);
                if (csrfMatch) csrfToken = csrfMatch[1];
            }

            const match = html.match(/"eagerLoadRefineSearch"\s*:\s*(\{[\s\S]*?\})\s*,\s*"jobwidgetsettings"/);
            if (!match) break;
            
            const data = JSON.parse(match[1]);
            const jobs = data?.data?.jobs || [];
            totalHits = data?.totalHits || 0;
            
            if (jobs.length === 0) break;
            
            // Check for pagination failure (if it returns the exact same page)
            if (jobs[0].jobId === lastFirstJobId) break;
            lastFirstJobId = jobs[0].jobId;
            
            rawJobs.push(...jobs);
            
            from += jobs.length;
            await new Promise(r => setTimeout(r, 1000));
        }

        const limit = pLimit(10);
        await Promise.all(rawJobs.map(j => limit(async () => {
            let description = '';
            try {
                const jobSeqNo = String(j.jobSeqNo || j.jobseqno || '');
                const locale = String(j.locale || 'en_gb');
                const req = await fetchWithTimeout("https://careers.serco.com/widgets", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": "Mozilla/5.0",
                        "X-CSRF-Token": csrfToken
                    },
                    body: JSON.stringify({
                        lang: locale, deviceType: "desktop", country: locale.split('_')[1] || "gb",
                        pageName: "job-details", ddoKey: "jobDetail", jobSeqNo, siteType: "external"
                    })
                });
                if (req.ok) {
                    const d = await req.json();
                    const jobDetail = d.jobDetail?.data?.job || d.data?.job;
                    description = jobDetail?.description || jobDetail?.ml_Description || '';
                }
            } catch (err: any) {
                console.log(`[Custom: Serco] Error fetching JD: ${err.message}`);
            }

            const slug = (j.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            allJobs.push({
                title: j.title || '',
                location: j.location || j.cityStateCountry || '',
                url: `https://careers.serco.com/gb/en/job/${j.jobId}/${slug}`,
                department: j.category || '',
                salary: undefined,
                description: cleanInlineJD(description)
            });
        })));
    } catch (err) {
        console.error('[Custom: Serco]', err);
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
    const rawJobs: any[] = [];

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

                if (title && jobUrl) {
                    rawJobs.push({
                        title,
                        location,
                        department,
                        url: jobUrl,
                        vacancyId
                    });
                }
            });

            page++;
        }
        console.log(`[Custom: KPMG] Extracted ${rawJobs.length} job summaries`);

        // Now fetch descriptions concurrently for each job
        const limit = pLimit(10);
        const kpmgJobs: Job[] = [];

        await Promise.all(rawJobs.map(job => limit(async () => {
            let description = '';
            try {
                // Try to fetch the job description from the detail page
                const detailRes = await fetchWithTimeout(job.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });

                if (detailRes.ok) {
                    const detailHtml = await detailRes.text();
                    const $$ = cheerio.load(detailHtml);

                    // Try multiple selectors for KPMG job description
                    const descriptionSelectors = [
                        '.vacancy-description',
                        '[data-vacancy-id]',
                        '.job-description',
                        '.description',
                        '.job-details',
                        '[itemprop="description"]',
                        '.vacancy-details',
                        '.job-info'
                    ];

                    for (const selector of descriptionSelectors) {
                        const descElem = $$(selector).first();
                        if (descElem.length && descElem.text().trim().length > 100) {
                            description = descElem.html() || descElem.text();
                            break;
                        }
                    }

                    // Fallback: get main content if specific selectors fail
                    if (!description || description.trim().length < 100) {
                        const mainContent = $$('main').first() || $$('.content').first() || $$('article').first();
                        if (mainContent.length) {
                            description = mainContent.html() || mainContent.text();
                        }
                    }
                }
            } catch (err: any) {
                console.log(`[Custom: KPMG] Error fetching description for ${job.url}: ${err.message}`);
            }

            // Clean and validate the description
            const cleanDescription = cleanInlineJD(description);

            // Only add job if we have a valid description (>300 chars after cleaning)
            if (cleanDescription && cleanDescription.length >= 300) {
                const jobType = inferJobTypeFromListing({
                    employmentField: job.department // Using department as employment field fallback
                });

                kpmgJobs.push({
                    title: job.title,
                    location: job.location,
                    url: job.url,
                    department: job.department,
                    ...(jobType ? { job_type: jobType } : {}),
                    description: cleanDescription
                });
            } else {
                console.log(`[Custom: KPMG] Skipping job due to insufficient description: ${job.url}`);
            }
        })));

        jobs.push(...kpmgJobs);
        console.log(`[Custom: KPMG] Found ${kpmgJobs.length} jobs with valid descriptions`);
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

        // Filter to only job URLs
        const jobUrls = urls.filter(jobUrl => jobUrl.includes('/job/'));
        console.log(`[Custom: BBC] Found ${jobUrls.length} job URLs in sitemap`);

        // Process jobs concurrently with p-limit to avoid rate limiting
        const limit = pLimit(10);
        const bbcJobs: Job[] = [];

        await Promise.all(jobUrls.map(jobUrl => limit(async () => {
            try {
                // Fetch the individual job page
                const jobRes = await fetchWithTimeout(jobUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });

                if (!jobRes.ok) {
                    console.log(`[Custom: BBC] Failed to fetch job page ${jobUrl}: ${jobRes.status}`);
                    return;
                }

                const html = await jobRes.text();
                const $ = cheerio.load(html);

                // Extract title from the job page
                let title = $('h1').first().text().trim() ||
                           $('title').first().text().replace(' - BBC Careers', '').trim();

                // Extract location - BBC often has it in structured data or specific elements
                let location = 'United Kingdom';
                const locationSelectors = [
                    '[data-testid="location"]',
                    '.location',
                    '[class*="location"]',
                    'dd[data-testid="location"]'
                ];

                for (const selector of locationSelectors) {
                    const locElem = $(selector).first();
                    if (locElem.length && locElem.text().trim()) {
                        location = locElem.text().trim();
                        break;
                    }
                }

                // Extract job description
                let description = '';
                const descriptionSelectors = [
                    '[data-testid="job-description"]',
                    '.job-description',
                    '#job-description',
                    '.jobDescription',
                    '[itemprop="description"]',
                    '.description',
                    '.job-details',
                    '.posting-description',
                    'section[data-testid="job-description"]',
                    'div[data-testid="job-description"]'
                ];

                for (const selector of descriptionSelectors) {
                    const descElem = $(selector).first();
                    if (descElem.length && descElem.text().trim().length > 100) {
                        description = descElem.html() || descElem.text();
                        break;
                    }
                }

                // Fallback: get main content if specific selectors fail
                if (!description || description.trim().length < 100) {
                    const mainContent = $('main').first() || $('.content').first() || $('article').first();
                    if (mainContent.length) {
                        description = mainContent.html() || mainContent.text();
                    }
                }

                // Clean and validate the description
                const cleanDescription = cleanInlineJD(description);

                // Only add job if we have a valid description (>300 chars after cleaning)
                if (cleanDescription && cleanDescription.length >= 300) {
                    // Extract department if available
                    let department = '';
                    const deptSelectors = [
                        '[data-testid="department"]',
                        '.department',
                        '[class*="department"]',
                        'dd[data-testid="department"]'
                    ];

                    for (const selector of deptSelectors) {
                        const deptElem = $(selector).first();
                        if (deptElem.length && deptElem.text().trim()) {
                            department = deptElem.text().trim();
                            break;
                        }
                    }

                    bbcJobs.push({
                        title: title,
                        location: location,
                        url: jobUrl,
                        department: department,
                        salary: undefined,
                        description: cleanDescription
                    });
                } else {
                    console.log(`[Custom: BBC] Skipping job due to insufficient description: ${jobUrl}`);
                }
            } catch (err: any) {
                console.log(`[Custom: BBC] Error processing job ${jobUrl}: ${err.message}`);
            }
        })));

        jobs.push(...bbcJobs);
        console.log(`[Custom: BBC] Found ${bbcJobs.length} jobs with valid descriptions`);
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

        // Concurrently fetch job descriptions for all extracted jobs
        const limit = pLimit(10);
        await Promise.all(extracted.map(item => limit(async () => {
            let description = '';
            try {
                if (item.positionUrl) {
                    const detailRes = await fetchWithTimeout(item.positionUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (detailRes.ok) {
                        const detailHtml = await detailRes.text();
                        const $ = cheerio.load(detailHtml);
                        let descElem = $('meta[property="og:description"]').first();
                        if (descElem.length) description = descElem.attr('content') || '';
                        else {
                            const content = $('article, .job-description, .description, .details').first();
                            if (content.length) description = content.text();
                        }
                        if (!description || description.trim().length < 100) description = item.name || '';
                    }
                }
            } catch (err: any) {
                console.log(`[Custom: Vodafone] Error fetching JD for ${item.id}: ${err.message}`);
            }
            const cleanDescription = cleanInlineJD(description);
            if (cleanDescription && cleanDescription.length >= 300) {
                jobs.push({
                    title: item.name,
                    location: (item.locations && item.locations.length > 0) ? item.locations[0] : (item.location || ''),
                    department: item.department || '',
                    url: item.positionUrl.startsWith('http') ? item.positionUrl : `https://jobs.vodafone.com${item.positionUrl}`,
                    description: cleanDescription
                });
            }
        })));

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
            });
            
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
    const basicJobs: {
        title: string;
        url: string;
        location: string;
    }[] = [];
    console.log('[Custom: Elastic] Fetching via Playwright (App Search intercept)...');

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    let jobs: Job[] = []; // Declare here to be accessible in finally and return
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
                if (title && jobUrl) {
                    basicJobs.push({ title, url: jobUrl, location });
                }
            }
        }

        // Scrape DOM job cards directly — Elastic list page uses .list-group .job-group-item
        const listJobs = await page.evaluate(() => {
            const results: any[] = [];
            document.querySelectorAll('.list-group .job-group-item').forEach((el) => {
                const a = el.querySelector('a');
                if (a) {
                    const title = a.textContent?.trim() || (el.textContent || '').trim();
                    const href = (a.getAttribute('href') || '');
                    if (title && href && href.includes('/jobs/')) {
                        results.push({ title, url: href.startsWith('http') ? href : 'https://jobs.elastic.co' + href });
                    }
                }
            });
            // Also try broader selectors if first fails
            if (results.length === 0) {
                document.querySelectorAll('a[href*="/jobs/"]').forEach((a) => {
                    const href = a.getAttribute('href') || '';
                    const title = a.textContent?.trim() || '';
                    if (title && href && !results.find(r => r.url === href)) {
                        results.push({ title, url: href.startsWith('http') ? href : 'https://jobs.elastic.co' + href });
                    }
                });
            }
            return results;
        });
        for (const item of listJobs) {
            basicJobs.push({ title: item.title, url: item.url, location: 'United Kingdom' });
        }

        // Fallback: original intercept + DOM
        if (basicJobs.length === 0) {
            for (const data of apiResults) {
                const results = data.results || data.hits || data.jobs || [];
                for (const item of results) {
                    const title = item.title?.raw || item.title || '';
                    const jobUrl = item.url?.raw || item.absolute_url?.raw || item.url || '';
                    const location = item.location?.raw || item.city?.raw || item.location || 'United Kingdom';
                    if (title && jobUrl) basicJobs.push({ title, url: jobUrl, location });
                }
            }
            if (basicJobs.length === 0) {
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
                    basicJobs.push({ title: item.title, url: jobUrl, location: 'United Kingdom' });
                }
            }
        }

        console.log(`[Custom: Elastic] Found ${basicJobs.length} basic jobs. Fetching descriptions...`);

        // Fetch descriptions concurrently with validation
        const limit = pLimit(10);
        jobs = []; // Initialize

        await Promise.all(basicJobs.map(basicJob => limit(async () => {
            try {
                // Fetch the individual job page
                const jobRes = await fetchWithTimeout(basicJob.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });

                if (!jobRes.ok) {
                    console.log(`[Custom: Elastic] Failed to fetch job page ${basicJob.url}: ${jobRes.status}`);
                    return;
                }

                const html = await jobRes.text();
                const $ = cheerio.load(html);

                // Extract job description
                let description = '';

                // Elastic recently moved their job data into a Next.js / Vue stringified JSON object inside #app
                const appNode = $('#app');
                if (appNode.length) {
                    const dataPage = appNode.attr('data-page');
                    if (dataPage) {
                        try {
                            const json = JSON.parse(dataPage);
                            const props = json.props || {};

                            description = props.job_object?.description
                                || props.job_object?.content
                                || props.templateJobContent?.description
                                || (typeof props.templateJobContent === 'string' ? props.templateJobContent : '')
                                || props.content
                                || '';
                        } catch (e) {
                            console.error(`[Custom: Elastic] Failed to parse data-page JSON for ${basicJob.url}`);
                        }
                    }
                }

                // If that fails, try the whole #job-desc text first
                if (!description || description.length < 100) {
                    description = $('#job-desc').text().trim();
                }

                // If that is too short, try to get text from collapsable sections
                if (description.length < 100) {
                    const descBlocks: string[] = [];
                    const descSelectors = [
                        '#job-desc .optCollapsableSection',
                        '#job-desc .optSectionWrap .optCollapsableSection',
                        '.optCollapsableSection',
                        '.optSectionWrap.open .optCollapsableSection',
                        '.optSectionWrap .optCollapsableSection.open'
                    ];
                    for (const sel of descSelectors) {
                        $(sel).each((i, el) => {
                            const text = $(el).text().trim();
                            if (text.length > 50) {
                                descBlocks.push(text);
                            }
                        });
                    }
                    if (descBlocks.length) {
                        description = descBlocks.join('\n\n');
                    }
                }

                // Fallback: get main content if still too short
                if (description.length < 100) {
                    const mainContent = $('main').first() || $('.content').first() || $('article').first();
                    if (mainContent.length) {
                        description = mainContent.text().trim();
                    }
                }

                // Clean and validate the description
                const cleanDescription = cleanInlineJD(description);

                // Only add job if we have a valid description (>300 chars after cleaning)
                if (cleanDescription && cleanDescription.length >= 300) {
                    // Infer job type from title - use cardText field since we don't have specific employmentField
                    const jobType = inferJobTypeFromListing({ cardText: basicJob.title });

                    jobs.push({
                        title: basicJob.title,
                        location: basicJob.location,
                        url: basicJob.url,
                        department: '',
                        salary: undefined,
                        description: cleanDescription,
                        job_type: jobType,
                        atsProvider: 'custom'
                    });
                } else {
                    console.log(`[Custom: Elastic] Skipping job due to insufficient description: ${basicJob.url}`);
                }
            } catch (err: any) {
                console.log(`[Custom: Elastic] Error processing job ${basicJob.url}: ${err.message}`);
            }
        })));

        console.log(`[Custom: Elastic] Found ${jobs.length} jobs with valid descriptions`);
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
            }, 60000) // 60s per page

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
                        description: j.job_description || undefined,
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

            const pageJobs: any[] = [];
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

                    pageJobs.push({
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

            // Fetch descriptions for the jobs on this page concurrently
            const limit = pLimit(10);
            await Promise.all(pageJobs.map((basicJob) => limit(async () => {
                let description = '';
                try {
                    const res = await fetchWithTimeout(basicJob.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const text = await res.text();
                    const $ = cheerio.load(text);

                    // Try to extract from __NEXT_DATA__
                    const nextData = JSON.parse($('#__NEXT_DATA__').html() || '{}');

                    // Look for job data in nextData
                    function findJobData(obj: any, path: string = ''): { field: string; value: string } | null {
                        if (!obj || typeof obj !== 'object') return null;
                        if (Array.isArray(obj)) {
                            for (let i = 0; i < obj.length; i++) {
                                const found = findJobData(obj[i], `${path}[${i}]`);
                                if (found) return found;
                            }
                            return null;
                        } else {
                            const keys = Object.keys(obj);
                            // Look for common job description fields
                            const descKeys = ['content', 'jobDescription', 'description', 'body', 'text'];
                            for (const key of descKeys) {
                                if (keys.includes(key) && typeof obj[key] === 'string' && obj[key].length > 100) {
                                    return { field: key, value: obj[key] };
                                }
                            }
                            // Recurse into objects
                            for (const k of Object.keys(obj)) {
                                const found = findJobData(obj[k], path ? `${path}.${k}` : k);
                                if (found) return found;
                            }
                            return null;
                        }
                    }

                    const jobData = findJobData(nextData.props || nextData);
                    if (jobData) {
                        description = jobData.value;
                    } else {
                        // Fallback: try to get from DOM selectors
                        const selectors = [
                            'section',
                            '[data-testid*="job-description"]',
                            '[data-testid*="description"]',
                            '.job-description',
                            '.JobDescription',
                            '.job-detail',
                            '.JobDetail',
                            '[class*="content"]',
                            'article',
                            '.rich-text',
                            '.markdown'
                        ];
                        for (const selector of selectors) {
                            const el = $(selector);
                            if (el.length) {
                                const text = el.text().trim();
                                if (text.length > 200) {
                                    description = text;
                                    break;
                                }
                            }
                        }
                    }

                } catch (e: any) {
                    console.error(`[Custom: Stripe] Error fetching JD for ${basicJob.url}: ${e.message}`);
                }

                const cleanDesc = cleanInlineJD(description) || '';

                if (cleanDesc.length < 300) {
                    console.log(`[Custom: Stripe] Skipping job due to insufficient description: ${basicJob.url}`);
                    return;
                }

                jobs.push({
                    title: basicJob.title,
                    location: sanitizeJobLocation(basicJob.location, 'uk', basicJob.title, basicJob.url),
                    url: basicJob.url,
                    department: basicJob.department,
                    description: cleanDesc,
                } as any);
            })));

            skip += 100;
            if (skip > 3000) break; // safety cap
        }
    } catch (e: any) {
        console.error(`[Custom: Stripe] error:`, e.message);
    }
    return jobs;
}

async function fetchApple(url: string): Promise<Job[]> {
    const rawJobs: any[] = [];
    const jobs: Job[] = [];
    console.log('[Custom: Apple] Fetching API...');
    
    try {
        for (const locCode of ['united-kingdom-GBR', 'ireland-IRL']) {
            let page = 1;
            let totalPages = 1;
            while (page <= totalPages && page <= 50) { 
                const pageUrl = `https://jobs.apple.com/en-in/search?location=${locCode}&page=${page}`;
                const res = await fetchWithTimeout(pageUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                if (!res.ok) {
                    console.log(`[Custom: Apple] Failed to fetch page ${page} for ${locCode}`);
                    break;
                }
                const html = await res.text();
                const $ = cheerio.load(html);
                let foundData = false;
                
                $('script').each((i, el) => {
                    const text = $(el).html();
                    if (text && text.includes('__staticRouterHydrationData = JSON.parse(')) {
                        const match = text.match(/JSON\.parse\((".+?")\);/);
                        if (match) {
                            try {
                                const jsonStr = JSON.parse(match[1]); 
                                const data = JSON.parse(jsonStr);     
                                const searchData = data?.loaderData?.search || {};
                                console.log(`[Custom: Apple] Parsed searchData for ${locCode}, totalRecords:`, searchData.totalRecords);
                                if (page === 1) {
                                    const totalRecords = searchData.totalRecords || 0;
                                    totalPages = Math.ceil(totalRecords / 20) || 1;
                                }
                                const searchResults = searchData.searchResults || [];
                                for (const item of searchResults) {
                                    item._locCode = locCode;
                                    rawJobs.push(item);
                                }
                                if (searchResults.length > 0) foundData = true;
                            } catch (e) {
                                console.error("[Custom: Apple] Parse error:", e);
                            }
                        }
                    }
                });
                if (!foundData) {
                    console.log(`[Custom: Apple] No data found on page ${page} for ${locCode}. HTML length: ${html.length}`);
                    break;
                }
                page++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        console.log(`[Custom: Apple] Finished fetching pages. rawJobs length: ${rawJobs.length}`);

        const limit = pLimit(10);
        await Promise.all(rawJobs.map(item => limit(async () => {
            const title = item.postingTitle;
            const jobId = item.positionId;
            const jobUrl = `https://jobs.apple.com/en-in/details/${jobId}`;
            const location = item.locations?.[0]?.name || (item._locCode === 'ireland-IRL' ? 'Ireland' : 'United Kingdom');
            
            if (title && jobId) {
                const jobType = inferJobTypeFromListing({
                    employmentField: [
                        item.positionType,
                        item.roleType,
                        item.jobType,
                        item.weeklyHours != null ? `${item.weeklyHours} hours per week` : null,
                    ],
                });

                let description = cleanInlineJD(item.jobSummary) || '';
                try {
                    const dRes = await fetchWithTimeout(jobUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (dRes.ok) {
                        const dHtml = await dRes.text();
                        const $d = cheerio.load(dHtml);
                        $d('script').each((i, el) => {
                            const text = $d(el).html();
                            if (text && text.includes('__staticRouterHydrationData = JSON.parse(')) {
                                const match = text.match(/JSON\.parse\((".+?")\);/);
                                if (match) {
                                    try {
                                        const jsonStr = JSON.parse(match[1]);
                                        const data = JSON.parse(jsonStr);
                                        const jd = data?.loaderData?.jobDetails?.jobsData?.[0] || data?.loaderData?.jobDetails?.jobsData || {};
                                        if (jd.description) {
                                            const fullDesc = (jd.jobSummary || '') + '\n\n' + (jd.description || '') + '\n\n' + (jd.minimumQualifications || '') + '\n\n' + (jd.preferredQualifications || '');
                                            description = cleanInlineJD(fullDesc) || description;
                                        }
                                    } catch(e){}
                                }
                            }
                        });
                    }
                } catch(e) {}
                jobs.push({
                    title,
                    url: jobUrl,
                    location,
                    salary: undefined,
                    job_type: jobType,
                    atsProvider: 'custom',
                    description: cleanInlineJD(description)
                });
            }
        })));
        
    } catch (err: any) {
        console.log(`[Custom: Apple] Error: ${err.message}`);
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
            
            let res = await fetchWithTimeout(searchUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            
            if (!res.ok) {
                if (res.status === 406 || res.status === 429) {
                    console.log(`[Custom: Tesco] Rate limited (${res.status}) at offset ${offset}. Waiting 30s before retry...`);
                    await new Promise(r => setTimeout(r, 30000));
                    res = await fetchWithTimeout(searchUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15' }
                    });
                }
                
                if (!res.ok) {
                    console.log(`[Custom: Tesco] Failed to fetch offset ${offset}: ${res.statusText}`);
                    break;
                }
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
            
            // Increased delay between pages to avoid IP blocks
            await new Promise(r => setTimeout(r, Math.random() * 1000 + 1000));
        }
    } catch (e: any) {
        console.error('[Custom: Tesco] Error:', e.message);
    }
    
    // Deduplicate by URL to save JD fetching time
    const uniqueJobs = new Map<string, Job>();
    for (const job of jobs) {
        if (!uniqueJobs.has(job.url)) {
            uniqueJobs.set(job.url, job);
        }
    }
    return Array.from(uniqueJobs.values());
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

            let res: Response | null = null;
            let retries = 3;
            
            while (retries > 0) {
                res = await fetchWithTimeout(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                });

                if (res.ok) {
                    break;
                } else if (res.status === 429) {
                    console.log(`[Custom: Qualcomm] 429 Rate Limit for search API start=${start}. Retrying...`);
                    retries--;
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    console.log(`[Custom: Qualcomm] HTTP error ${res.status}`);
                    break;
                }
            }

            if (!res || !res.ok) break;

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
    // Reduced concurrency to 1 and added delays to avoid strict 403 CloudFront WAF blocks
    const limit = pLimit(1);
    const allJobs: Job[] = [];

    // Pre-filter UK jobs to only fetch JDs for relevant jobs (avoids fetching 2000+ JDs and getting WAF banned)
    const ukPositions = [];
    const nonUkPositions = [];
    
    for (const p of rawPositions) {
        const loc = p.locations?.[0] || p.standardizedLocations?.[0] || '';
        const title = p.name || '';
        const isUk = isUKJob({ locations: [loc], isRemote: title.toLowerCase().includes('remote') || loc.toLowerCase().includes('remote'), isTrustedSource: false });
        if (isUk) {
            ukPositions.push(p);
        } else {
            nonUkPositions.push(p);
        }
    }

    // Push non-UK jobs without description so syncAll.ts can correctly log them as rejected
    for (const p of nonUkPositions) {
        allJobs.push({
            title: p.name || '',
            location: p.locations?.[0] || p.standardizedLocations?.[0] || '',
            url: `https://careers.qualcomm.com${p.positionUrl}?domain=qualcomm.com`,
            department: p.department || '',
            salary: (typeof p !== 'undefined' && (p as any)?.salary) ? String(typeof (p as any).salary === 'object' ? JSON.stringify((p as any).salary) : (p as any).salary) : undefined
        });
    }

    await Promise.all(ukPositions.map(p => limit(async () => {
        try {
            const detailUrl = `https://careers.qualcomm.com/api/apply/v2/jobs/${p.id}?domain=qualcomm.com`;
            let description = '';
            let retries = 3;
            
            // Mandatory delay between requests to stay under WAF radar
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1500));

            while (retries > 0) {
                const detailRes = await fetchWithTimeout(detailUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                });
                
                if (detailRes.ok) {
                    const text = await detailRes.text();
                    try {
                        const detailData = JSON.parse(text);
                        description = detailData.job_description || '';
                    } catch (e) {
                        // Ignore parse error
                    }
                    break;
                } else if (detailRes.status === 429 || detailRes.status === 403) {
                    console.log(`[Custom: Qualcomm] ${detailRes.status} Rate Limit for detail ${p.id}. Retrying in 15s...`);
                    retries--;
                    await new Promise(resolve => setTimeout(resolve, 15000));
                } else {
                    break;
                }
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

export async function fetchCustom(url: string, company?: CompanyRow): Promise<Job[]> {
    const jobs = await fetchCustomInternal(url, company);
    if (jobs && jobs.length > 0) {
        await enrichHtmlJobDescriptionsConcurrently(jobs);
    }
    return jobs;
}
