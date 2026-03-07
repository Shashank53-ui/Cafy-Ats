/**
 * syncAll.ts — Master Daily Sync Script
 *
 * Dynamically reads ALL companies from Supabase, routes each to the correct
 * ATS fetcher based on ats_provider, filters for UK-only jobs, and upserts
 * to the jobs table.
 *
 * Adding a new company to the DB is all that's needed — this script picks it up
 * automatically on the next run. No code changes required.
 *
 * Supported ATS providers:
 *   greenhouse, ashby, lever, workable, teamtailor, bamboohr,
 *   smartrecruiters, pinpoint, breezy, recruitee, workday,
 *   personio, hibob, custom_scraper
 *
 * Special scrapers (run separately after ATS sync):
 *   Amazon, Goldman Sachs, Google, JPMC (handled via their scripts)
 *
 * Run: npx tsx src/scripts/syncAll.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import * as cheerio from 'cheerio';
import { inferJobLevel } from '../lib/inferJobLevel';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
    title: string;
    location: string;
    url: string;
    department?: string;
}

interface SyncResult {
    company: string;
    provider: string;
    fetched: number;
    ukJobs: number;
    saved: number;
    error?: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function isUKLocation(loc: any): boolean {
    if (!loc) return false;
    const l = String(loc).toLowerCase();

    // Explicit exclusions for known false positives
    if (l.includes('ukraine')) return false;
    // Use regex word boundaries (\b) to ensure we match whole words, not substrings
    const ukRegex = /\b(uk|united kingdom|gb|england|scotland|wales|london|manchester|birmingham|edinburgh|bristol|cambridge|oxford|glasgow|leeds|sheffield|newcastle|cardiff|liverpool|nottingham|reading|brighton|southampton|belfast|coventry|northampton|milton keynes|remote - uk|uk remote|richmond|halifax|sunderland|leicester|chester|basingstoke|knutsford|canary wharf|radbroke|gloucester|solihull|warwick|bromley|southend|hove|purley|gildersome|portishead|pendeford|barnwood|united kingdom)\b/;

    // Allow "X Locations" if it's potentially UK (will be refined later or trusted by filter)
    const isMulti = /\d+ locations/i.test(l);

    return ukRegex.test(l) || isMulti || (l.endsWith(' uk') || l.endsWith(', uk') || l.endsWith(' united kingdom'));
}

function safeStr(s: any, maxLen = 500): string {
    return String(s || '').slice(0, maxLen);
}

// ─── ATS Fetchers — each accepts (token: string) and returns Job[] ─────────

async function fetchGreenhouse(token: string): Promise<Job[]> {
    // Support tokens like "gympass?office_id=4038159002"
    const [boardToken, query] = token.split('?');
    const officeId = query?.split('=')[1];

    // boards-api.greenhouse.io is the definitive JSON API.
    // Some boards (like Winton) require the .eu subdomain.
    const subdomains = ['boards-api', 'boards-api.eu'];

    for (const sub of subdomains) {
        const url = `https://${sub}.greenhouse.io/v1/boards/${boardToken}/jobs?content=true${officeId ? `&office_id=${officeId}` : ''}`;
        try {
            const r = await fetch(url, {
                headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
            });
            if (!r.ok) continue;
            const text = await r.text();
            if (!text || !text.startsWith('{')) continue; // skip HTML responses
            const d = JSON.parse(text);
            const jobs: Job[] = (d.jobs || []).map((j: any) => ({
                title: j.title || '',
                location: j.location?.name || '',
                url: j.absolute_url || j.url || '',
                department: j.departments?.[0]?.name || ''
            }));
            if (jobs.length > 0) return jobs;
        } catch { }
    }
    return [];
}

async function fetchAshby(token: string): Promise<Job[]> {
    try {
        const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
        if (!r.ok) return [];
        const d = await r.json();
        return (d.jobs || []).map((j: any) => {
            const locRaw = typeof j.location === 'string' ? j.location : (j.location?.name || '');
            const secLocs = (j.secondaryLocations || [])
                .map((l: any) => typeof l === 'string' ? l : (l.location || l.name || ''))
                .join(' ');
            return {
                title: j.title || '',
                location: `${locRaw} ${secLocs}`.trim(),
                url: j.jobUrl || '',
                department: j.department || ''
            };
        });
    } catch { return []; }
}

async function fetchLever(token: string): Promise<Job[]> {
    // Try EU lever first (easol etc uses eu subdomain)
    for (const base of ['https://api.eu.lever.co/v0/postings', 'https://api.lever.co/v0/postings']) {
        try {
            const r = await fetch(`${base}/${token}`);
            console.log(`[DEBUG] Lever ${token} ${base} status: ${r.status}`);
            if (r.ok) {
                const d = await r.json();
                if (Array.isArray(d) && d.length > 0) {
                    return d.map((j: any) => ({
                        title: j.text || '',
                        location: j.categories?.location || j.workplaceType || '',
                        url: j.hostedUrl || '',
                        department: j.categories?.department || j.categories?.team || ''
                    }));
                }
            }
        } catch (e: any) {
            console.log(`[DEBUG] Lever error: ${e.message}`);
        }
    }
    return [];
}

async function fetchWorkable(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let nextToken = '';
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    for (let i = 0; i < 10; i++) { // Limit to 10 pages (~100-200 jobs)
        try {
            const body: any = { query: '', location: [], department: [], worktype: [], remote: [] };
            if (nextToken) body.next = nextToken;

            const r = await fetch(`https://apply.workable.com/api/v3/accounts/${token}/jobs`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'User-Agent': ua,
                    'Referer': `https://apply.workable.com/${token}/`
                },
                body: JSON.stringify(body)
            });
            if (!r.ok) break;
            const d = await r.json();
            const results = d.results || [];
            if (results.length === 0) break;

            allJobs.push(...results.map((j: any) => ({
                title: j.title || '',
                location: j.location?.city ? `${j.location.city}, ${j.location.country || ''}` : (j.location?.country || j.country || ''),
                url: `https://apply.workable.com/${token}/j/${j.shortcode}/`,
                department: Array.isArray(j.department) ? j.department[0] : (j.department || '')
            })));

            nextToken = d.nextPage;
            if (!nextToken) break;
            await sleep(500);
        } catch { break; }
    }
    return allJobs;
}

async function fetchTeamtailor(token: string): Promise<Job[]> {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    // 1. Try JSON first
    try {
        const url = token.includes('.') ? `https://${token}/jobs.json` : `https://${token}.teamtailor.com/jobs.json`;
        const r = await fetch(url, {
            headers: {
                'User-Agent': ua,
                'Accept': 'application/vnd.api+json',
                'Referer': token.includes('.') ? `https://${token}/` : `https://${token}.teamtailor.com/`
            }
        });
        if (r.ok) {
            const d = await r.json();
            if (d.data?.length > 0) {
                return d.data.map((j: any) => ({
                    title: j.attributes?.title || '',
                    location: j.attributes?.['human-location'] || '',
                    url: j.links?.['careersite-job-url'] || '',
                    department: ''
                }));
            }
        }
    } catch { }

    // 2. Try RSS as fallback
    try {
        const rssUrl = token.includes('.') ? `https://${token}/jobs.rss` : `https://${token}.teamtailor.com/jobs.rss`;
        const r = await fetch(rssUrl, { headers: { 'User-Agent': ua } });
        if (!r.ok) return [];

        const xml = await r.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const jobs: Job[] = [];

        $('item').each((_, el) => {
            const item = $(el);
            jobs.push({
                title: item.find('title').text().trim(),
                location: item.find('description').text().split('·')[1]?.trim() || 'UK',
                url: item.find('link').text().trim(),
                department: item.find('category').first().text().trim()
            });
        });
        return jobs;
    } catch { return []; }
}

async function fetchBambooHR(token: string): Promise<Job[]> {
    try {
        // Try the open /careers/list endpoint first
        const r = await fetch(`https://${token}.bamboohr.com/careers/list`);
        if (r.ok) {
            const d = await r.json();
            return (d.result || []).map((j: any) => ({
                title: j.jobOpeningName || '',
                location: `${j.location?.city || ''} ${j.location?.state || ''}`.trim(),
                url: `https://${token}.bamboohr.com/careers/${j.id}`,
                department: ''
            }));
        }
        // Fallback: applicant tracking API
        const r2 = await fetch(
            `https://api.bamboohr.com/api/gateway.php/${token}/v1/applicant_tracking/jobs?status=Open`,
            { headers: { 'Accept': 'application/json' } }
        );
        if (!r2.ok) return [];
        const d2 = await r2.json();
        return (d2 || []).map((j: any) => ({
            title: j.jobTitle?.label || j.title || '',
            location: j.location?.label || '',
            url: `https://${token}.bamboohr.com/jobs/${j.id}/`,
            department: j.department?.label || ''
        }));
    } catch { return []; }
}

async function fetchSmartRecruiters(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let offset = 0;
    while (true) {
        try {
            const r = await fetch(
                `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100&offset=${offset}&status=PUBLISHED`
            );
            if (!r.ok) break;
            const d = await r.json();
            const content = d.content || [];
            if (content.length === 0) break;

            allJobs.push(...content.map((j: any) => ({
                title: j.name || '',
                location: `${j.location?.city || ''} ${j.location?.country || ''}`.trim(),
                url: `https://jobs.smartrecruiters.com/${token}/${j.id}`,
                department: j.department?.label || ''
            })));

            if (content.length < 100) break;
            offset += 100;
            if (offset > 1000) break; // Safety
            await sleep(500);
        } catch { break; }
    }
    return allJobs;
}

async function fetchPinpoint(token: string): Promise<Job[]> {
    try {
        const r = await fetch(`https://${token}.pinpointhq.com/postings.json`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!r.ok) return [];
        const d = await r.json();
        return (d.data || []).map((j: any) => {
            const locRaw = j.location;
            const location = locRaw && typeof locRaw === 'object'
                ? (locRaw.name || locRaw.city || '')
                : String(locRaw || '');
            return {
                title: j.title || '',
                location,
                url: j.url || `https://${token}.pinpointhq.com${j.path || ''}`,
                department: j.job_function || j.department || ''
            };
        });
    } catch { return []; }
}

async function fetchBreezy(token: string): Promise<Job[]> {
    try {
        const r = await fetch(`https://${token}.breezy.hr/json`);
        if (!r.ok) return [];
        const d = await r.json();
        return (d || []).map((j: any) => ({
            title: j.name || '',
            location: j.location?.name || '',
            url: j.url || '',
            department: j.department?.name || ''
        }));
    } catch { return []; }
}

async function fetchRecruitee(token: string): Promise<Job[]> {
    try {
        const r = await fetch(`https://${token}.recruitee.com/api/offers/?state=published`);
        if (!r.ok) return [];
        const d = await r.json();
        return (d.offers || []).map((j: any) => ({
            title: j.title || '',
            location: j.location || j.city || '',
            url: j.careers_url || '',
            department: j.department || ''
        }));
    } catch { return []; }
}

async function fetchPersonio(token: string): Promise<Job[]> {
    try {
        // Personio XML endpoint — most reliable public endpoint
        const r = await fetch(`https://${token}.jobs.personio.de/xml?language=en`);
        if (!r.ok) return [];
        const xml = await r.text();
        // Simple XML parse without a library — extract <position> blocks
        const posBlocks = xml.match(/<position>([\s\S]*?)<\/position>/g) || [];
        return posBlocks.map(block => {
            const get = (tag: string) => {
                const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
                return m ? m[1].trim() : '';
            };
            return {
                title: get('name') || get('title'),
                location: get('office') || get('location'),
                url: get('jobUrl') || `https://${token}.jobs.personio.de`,
                department: get('department')
            };
        });
    } catch { return []; }
}

async function fetchWorkday(token: string): Promise<Job[]> {
    const parts = token.split('/');
    if (parts.length < 2) return [];
    const slug = parts[0];
    const board = parts.slice(1).join('/');

    // Wells Fargo uses myworkdaysite.com. Willis Re uses standard myworkdayjobs.com.
    const isWorkdaySite = slug === 'wf' || slug.includes('hcahealthcare');

    for (const wd of ['wd3', 'wd1', 'wd5', 'wd103', 'wd107', 'wd108', 'wd12', 'wd2']) {
        // Try both slug.wd.domain and wd.domain
        const domains = isWorkdaySite
            ? [`${slug}.${wd}.myworkdaysite.com`, `${wd}.myworkdaysite.com`]
            : [`${slug}.${wd}.myworkdayjobs.com`, `${wd}.myworkdayjobs.com`];

        for (const domain of domains) {
            const apiUrl = `https://${domain}/wday/cxs/${slug}/${board}/jobs`;
            const publicBase = `https://${domain}/en-US/${board}`;

            try {
                let res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                    body: JSON.stringify({
                        appliedFacets: { locationCountry: ['29247e57dbaf46fb855b224e03170bc7'] },
                        limit: 20, offset: 0, searchText: ''
                    })
                });

                if (!res.ok) {
                    // Try alternate location facet
                    res = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                        body: JSON.stringify({
                            appliedFacets: { Location_Country: ['29247e57dbaf46fb855b224e03170bc7'] },
                            limit: 20, offset: 0, searchText: ''
                        })
                    });
                }

                if (!res.ok) {
                    // Fallback: no facets
                    res = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' })
                    });
                }

                if (!res.ok) {
                    continue;
                }

                const data = await res.json();
                const posts = data?.jobPostings || [];

                if (posts.length === 0) {
                    if (isWorkdaySite) break;
                    continue;
                }

                const allJobs: Job[] = [];
                let offset = 0;
                const total = data.total || 0;

                while (offset < total || offset === 0) {
                    let currentPosts = posts;
                    if (offset > 0) {
                        const nextRes = await fetch(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                            body: JSON.stringify({
                                appliedFacets: data.appliedFacets || {},
                                limit: 20, offset, searchText: ''
                            })
                        });
                        if (nextRes.ok) {
                            const nextData = await nextRes.json();
                            currentPosts = nextData.jobPostings || [];
                        } else break;
                    }

                    if (currentPosts.length === 0) break;
                    allJobs.push(...currentPosts.map((j: any) => ({
                        title: j.title || '',
                        location: j.locationsText || '',
                        url: `${publicBase}${j.externalPath}`,
                        department: ''
                    })));

                    offset += 20;
                    if (offset >= 2000) break;
                    await sleep(300);
                }
                return allJobs;
            } catch {
                continue;
            }
        }
    }
    return [];
}

async function fetchOracleCloud(token: string): Promise<Job[]> {
    try {
        const [domain, site] = token.split('|');
        const url = `https://${domain}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.workLocation,requisitionList.otherWorkLocations,requisitionList.secondaryLocations,flexFieldsFacet.values,requisitionList.requisitionFlexFields&finder=findReqs;siteNumber=${site},facetsList=LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS,limit=100,sortBy=POSTING_DATES_DESC`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) return [];
        const data: any = await res.json();
        return (data.items?.[0]?.requisitionList || []).map((j: any) => ({
            title: j.Title || '',
            location: j.PrimaryLocation || j.workLocation?.Region || '',
            url: `https://${domain}/hcmUI/CandidateExperience/en/sites/${site}/job/${j.Id}`,
            department: j.Organization || ''
        }));
    } catch { return []; }
}

async function fetchWipro(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let pageNumber = 0;
    while (true) {
        try {
            const r = await fetch("https://careers.wipro.com/services/recruiting/v1/jobs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                },
                body: JSON.stringify({
                    locale: "en_US",
                    pageNumber: pageNumber,
                    sortBy: "",
                    keywords: "",
                    location: "United Kingdom",
                    facetFilters: {},
                    brand: "",
                    skills: [],
                    categoryId: 0,
                    alertId: "",
                    rcmCandidateId: ""
                })
            });
            if (!r.ok) break;
            const d = await r.json();
            const results = d.jobSearchResult || [];
            if (results.length === 0) break;

            allJobs.push(...results.map((item: any) => {
                const j = item.response;
                return {
                    title: j.unifiedStandardTitle || "",
                    location: (j.jobLocationShort && j.jobLocationShort[0]) || "UK",
                    url: `https://careers.wipro.com/job/${j.unifiedUrlTitle}/${j.id}-en_US`,
                    department: (j.custRMKMappingPicklist && j.custRMKMappingPicklist[0]) || ""
                };
            }));

            if (results.length < 10) break; // Wipro seems to return 10 per page by default
            pageNumber++;
            if (pageNumber > 100) break; // Safety
            await sleep(300);
        } catch { break; }
    }
    return allJobs;
}

async function fetchSuccessFactors(token: string): Promise<Job[]> {
    const allJobs: Job[] = [];
    let startrow = 0;
    while (true) {
        try {
            const url = `https://careers.${token}/search/?q=&locationsearch=united+kingdom&startrow=${startrow}`;
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) break;
            const html = await res.text();
            const $ = cheerio.load(html);
            const rows = $('tr.data-row');
            if (rows.length === 0) break;
            rows.each((_, el) => {
                const row = $(el);
                const titleLink = row.find('.jobTitle a');
                const title = titleLink.text().trim();
                const jobUrl = titleLink.attr('href');
                const location = row.find('.jobLocation').text().trim();
                if (title && jobUrl) {
                    allJobs.push({
                        title,
                        location: location.split('\n')[0].trim() || 'UK',
                        url: jobUrl.startsWith('http') ? jobUrl : `https://careers.${token}${jobUrl}`
                    });
                }
            });
            if (rows.length < 20) break;
            startrow += 20;
            if (startrow > 200) break; // Limit for sync performance
            await sleep(500);
        } catch { break; }
    }
    return allJobs;
}

async function fetchHibob(token: string): Promise<Job[]> {
    try {
        // token is the company identifier, e.g. "ustwo"
        const domain = token.includes('.') ? token : `${token}.careers.hibob.com`;
        const companyId = token.split('.')[0];

        const r = await fetch(`https://${domain}/api/job-ad`, {
            headers: {
                'Accept': 'application/json',
                'companyidentifier': companyId,
                'referer': `https://${domain}/jobs`
            }
        });
        if (!r.ok) return [];
        const d = await r.json();
        return (d.jobAdDetails || []).map((j: any) => ({
            title: j.title || '',
            location: `${j.site || ''} ${j.country || ''}`.trim(),
            url: `https://${domain}/jobs/${j.id}`,
            department: typeof j.department === 'string' ? j.department : (j.department?.name || '')
        }));
    } catch { return []; }
}

async function fetchEightfold(token: string): Promise<Job[]> {
    // token format: "domain.com|filter_country" e.g. "vodafone.com|United Kingdom"
    const [domain, country] = token.split('|');
    if (!domain) return [];

    const allJobs: Job[] = [];
    let start = 0;
    const PAGE_SIZE = 10;

    while (start < 300) { // Safety limit
        try {
            const countryFilter = country ? `&filter_country=${encodeURIComponent(country)}` : '';
            const url = `https://jobs.${domain}/api/pcsx/search?domain=${domain}&query=&location=&start=${start}&sort_by=timestamp${countryFilter}`;

            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) break;
            const d = await res.json();
            const positions = d.data?.positions || [];
            if (positions.length === 0) break;

            allJobs.push(...positions.map((p: any) => ({
                title: p.name || '',
                location: p.locations?.[0] || p.standardizedLocations?.[0] || 'UK',
                url: `https://jobs.${domain}${p.positionUrl}`,
                department: p.department || ''
            })));

            if (positions.length < PAGE_SIZE) break;
            start += positions.length;
            await sleep(500);
        } catch { break; }
    }
    return allJobs;
}

async function fetchICIMS(token: string): Promise<Job[]> {
    try {
        // iCIMS usually has a job search JSON endpoint at [customer].icims.com/jobs/search?pr=[page]&in_iframe=1&schemaId=job&json=1
        // But for LSL Property Services specifically, we might need a different pattern if the above fails.
        // Let's implement a robust version that tries the common JSON endpoint.
        const allJobs: Job[] = [];
        let pr = 0;

        while (true) {
            const url = `https://${token}.icims.com/jobs/search?pr=${pr}&in_iframe=1&schemaId=job&json=1`;
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) break;

            const data: any = await res.json();
            // iCIMS JSON structure is often an array of job objects directly or in a 'results' field
            const results = Array.isArray(data) ? data : (data.results || []);
            if (results.length === 0) break;

            allJobs.push(...results.map((j: any) => ({
                title: j.title || j.JobTitle || '',
                location: j.location || j.JobLocation || 'UK',
                url: j.url || `https://${token}.icims.com/jobs/${j.id || j.JobId}/job`,
                department: j.department || j.JobCategory || ''
            })));

            if (results.length < 10) break; // Arbitrary small page size check
            pr++;
            if (pr > 20) break; // Safety break
        }
        return allJobs;
    } catch { return []; }
}

async function fetchRippling(token: string): Promise<Job[]> {
    // Rippling uses Next.js - job data is embedded in __NEXT_DATA__ script tag
    try {
        const url = `https://ats.rippling.com/${token}/jobs`;
        const r = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
        });
        if (!r.ok) return [];
        const html = await r.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) return [];
        const data = JSON.parse(match[1]);
        // Job data is nested in dehydratedState queries
        const queries = data?.props?.pageProps?.dehydratedState?.queries || [];
        const items: any[] = queries.flatMap((q: any) => q?.state?.data?.items || []);
        return items.map((j: any) => ({
            title: j.name || '',
            location: (j.locations || []).map((l: any) => l.name || l.city || '').join(', '),
            url: j.url || `https://ats.rippling.com/${token}/jobs/${j.id}`,
            department: j.department?.name || ''
        }));
    } catch { return []; }
}



const FETCHERS: Record<string, (token: string) => Promise<Job[]>> = {
    greenhouse: fetchGreenhouse,
    ashby: fetchAshby,
    lever: fetchLever,
    workable: fetchWorkable,
    teamtailor: fetchTeamtailor,
    bamboohr: fetchBambooHR,
    smartrecruiters: fetchSmartRecruiters,
    pinpoint: fetchPinpoint,
    breezy: fetchBreezy,
    recruitee: fetchRecruitee,
    personio: fetchPersonio,
    workday: fetchWorkday,
    workday_enterprise: fetchWorkday,
    oracle_cloud: fetchOracleCloud,
    successfactors: fetchSuccessFactors,
    eightfold: fetchEightfold,
    hibob: fetchHibob,
    wipro: fetchWipro,
    icims: fetchICIMS,
    breezyhr: fetchBreezy,
    rippling: fetchRippling,
};

// Providers that return UK-only results natively (no keyword filter needed)
// Removed for safety - always applying keyword filter
// const UK_NATIVE_PROVIDERS = new Set(['workday']);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function syncAll() {
    const startTime = Date.now();
    console.log('\n════════════════════════════════════════════════════');
    console.log('  DAILY SYNC — ' + new Date().toISOString());
    console.log('════════════════════════════════════════════════════\n');

    const args = process.argv.slice(2);
    const idIndex = args.indexOf('--ids');
    const specificIds = idIndex !== -1 ? args[idIndex + 1].split(',').map(id => parseInt(id.trim())) : null;

    let query = supabase
        .from('companies')
        .select('id, trading_name, ats_provider, ats_board_token')
        .order('trading_name');

    if (specificIds) {
        query = query.in('id', specificIds);
        console.log(`Filtering for ${specificIds.length} specific IDs: ${specificIds.join(', ')}`);
    }

    const { data: companies, error } = await query;

    if (error || !companies) {
        console.error('❌ Could not load companies from DB:', error?.message);
        return;
    }

    console.log(`Found ${companies.length} companies with configured ATS\n`);

    const results: SyncResult[] = [];
    let totalSaved = 0;

    for (const company of companies) {
        const { id, trading_name, ats_provider, ats_board_token } = company;

        const fetcher = FETCHERS[ats_provider];
        if (!fetcher) {
            console.log(`[SKIP] ${trading_name} — no fetcher for provider: ${ats_provider}`);
            continue;
        }

        process.stdout.write(`[${ats_provider.toUpperCase()}] ${trading_name} ... `);

        const result: SyncResult = {
            company: trading_name,
            provider: ats_provider,
            fetched: 0, ukJobs: 0, saved: 0
        };

        try {
            const allJobs = await fetcher(ats_board_token);
            result.fetched = allJobs.length;

            // Apply UK keyword filter to all fetched jobs for safety
            const ukJobs = allJobs.filter(j => isUKLocation(j.location));

            result.ukJobs = ukJobs.length;
            console.log(`${allJobs.length} total → ${ukJobs.length} UK`);

            if (ukJobs.length > 0) {
                // Deduplicate by URL to avoid "ON CONFLICT" errors in Postgres upsert
                const uniqueJobs = Array.from(new Map(ukJobs.map(j => [j.url, j])).values());

                const rows = uniqueJobs
                    .filter(j => j.url && j.title)
                    .map(j => ({
                        company_id: id,
                        title: safeStr(j.title),
                        location: safeStr(j.location),
                        url: safeStr(j.url),
                        department: j.department ? safeStr(j.department) : null,
                        level: inferJobLevel(safeStr(j.title))
                    }));

                const { error: jobErr } = await supabase
                    .from('jobs')
                    .upsert(rows, { onConflict: 'url' });

                if (jobErr) {
                    result.error = jobErr.message;
                    console.error(`  ❌ ${jobErr.message}`);
                } else {
                    result.saved = rows.length;
                    totalSaved += rows.length;
                }
            }

            // Always update active_jobs_count (even if 0 — keeps data fresh)
            await supabase
                .from('companies')
                .update({ active_jobs_count: ukJobs.length })
                .eq('id', id);

        } catch (e: any) {
            result.error = e.message;
            console.error(`  ❌ ${e.message}`);
        }

        results.push(result);
        await sleep(400); // be polite to APIs
    }

    // ─── Summary ─────────────────────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const withJobs = results.filter(r => r.saved > 0);
    const noJobs = results.filter(r => r.saved === 0 && !r.error);
    const errored = results.filter(r => r.error);

    console.log('\n════════════════════════════════════════════════════');
    console.log('  SYNC COMPLETE');
    console.log('════════════════════════════════════════════════════');
    console.log(`  ⏱  Time:          ${elapsed}s`);
    console.log(`  🏢 Companies:      ${companies.length} processed`);
    console.log(`  ✅ With UK jobs:   ${withJobs.length}`);
    console.log(`  ➕ Jobs saved:     ${totalSaved}`);
    console.log(`  ⚪ No UK jobs:     ${noJobs.length}`);
    if (errored.length > 0) {
        console.log(`  ❌ Errors:        ${errored.length}`);
        errored.forEach(r => console.log(`     - ${r.company}: ${r.error}`));
    }
    console.log('');

    if (withJobs.length > 0) {
        console.log('  Top results:');
        withJobs
            .sort((a, b) => b.saved - a.saved)
            .slice(0, 10)
            .forEach(r => console.log(`     ${r.company.padEnd(35)} ${r.saved} jobs  [${r.provider}]`));
    }
    console.log('════════════════════════════════════════════════════\n');
}

syncAll().catch(console.error);
