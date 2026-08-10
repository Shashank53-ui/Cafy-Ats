import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { isUKJob } from '../lib/ukFilter';
import { workdayToJobLocationInput } from '../lib/ukFilterAdapters';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function isUKLocation(loc: string, url?: string) {
    if (!loc) return false;
    return isUKJob(workdayToJobLocationInput({ locationsText: loc, url }));
}

function safeStr(s: any, maxLen = 500) {
    return String(s || '').slice(0, maxLen);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, options: any = {}, timeout = 25000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

// All known Workday subdomain variants to probe when exact one is unknown
const WD_SUBDOMAINS = ['wd3', 'wd1', 'wd5', 'wd103', 'wd1001', 'wd12', 'wd10', 'wd8', 'wd6', 'wd2'];

function buildWorkdayEndpoints(token: string): Array<{ apiUrl: string; publicBase: string }> {
    const endpoints: Array<{ apiUrl: string; publicBase: string }> = [];

    if (token.startsWith('http')) {
        // Full URL stored — parse exactly as given, preserving the wdXXX subdomain
        try {
            const urlOb = new URL(token);
            const tenantMatch = urlOb.hostname.match(/^([^.]+)\./);
            const tenant = tenantMatch ? tenantMatch[1] : '';
            const pathParts = urlOb.pathname.split('/').filter(p => p !== 'en-US' && p !== 'en-GB' && p.length > 0);
            const site = pathParts[0] || 'Careers';
            const publicBase = `https://${urlOb.hostname}/${site}`;
            endpoints.push({ apiUrl: `https://${urlOb.hostname}/wday/cxs/${tenant}/${site}/jobs`, publicBase });
        } catch { /* Invalid URL, fall through */ }
    } else if (token.includes('/')) {
        // tenant/site format — probe all wdXXX subdomains
        const [tenant, site] = token.split('/');
        for (const wd of WD_SUBDOMAINS) {
            endpoints.push({
                apiUrl: `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
                publicBase: `https://${tenant}.${wd}.myworkdayjobs.com/${site}`
            });
        }
    } else {
        // Plain token — try common site names AND all wdXXX subdomains
        const siteNames = ['Careers', 'External', 'Jobs', token, `${token}Careers`];
        for (const wd of WD_SUBDOMAINS) {
            for (const site of siteNames) {
                endpoints.push({
                    apiUrl: `https://${token}.${wd}.myworkdayjobs.com/wday/cxs/${token}/${site}/jobs`,
                    publicBase: `https://${token}.${wd}.myworkdayjobs.com/${site}`
                });
            }
        }
    }

    return endpoints;
}

async function scrapeWorkdayJobs(companyId: number, tradingName: string, token: string, syncRunId: string) {
    console.log(`\n🏢 Fetching Workday for [${tradingName}]...`);

    const endpoints = buildWorkdayEndpoints(token);
    const allJobs: any[] = [];

    const ukFacetPayloads = [
        { appliedFacets: { locationCountry: ["f2e609fe92974a55a05fc1cdc2852122", "bc33aa31523742670152374cd3c0001a"] }, limit: 20, offset: 0, searchText: '' },
        { appliedFacets: { locationCountry: ["29247e57dbaf46fb855b224e03170bc7"] }, limit: 20, offset: 0, searchText: '' },
        { appliedFacets: { Location_Country: ["f2e609fe92974a55a05fc1cdc2852122"] }, limit: 20, offset: 0, searchText: '' },
        { appliedFacets: {}, limit: 20, offset: 0, searchText: 'United Kingdom' },
        { appliedFacets: {}, limit: 20, offset: 0, searchText: '' },
    ];

    let found = false;

    // Probe each endpoint and each payload until we get jobs
    outerLoop:
    for (const { apiUrl, publicBase } of endpoints) {
        for (const payload of ukFacetPayloads) {
            try {
                const res = await fetchWithTimeout(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                    body: JSON.stringify(payload)
                }, 12000);

                if (!res.ok) continue;
                const data = await res.json();
                const posts = data.jobPostings || [];
                if (posts.length === 0) continue;

                console.log(`  -> Working endpoint: ${apiUrl} [${posts.length} on page 1, total: ${data.total}]`);
                found = true;
                const total = data.total || 0;
                let offset = 0;

                while (offset < total || offset === 0) {
                    let currentPosts = posts;
                    if (offset > 0) {
                        const nextRes = await fetchWithTimeout(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': publicBase },
                            body: JSON.stringify({ ...payload, offset })
                        }, 12000);
                        if (nextRes.ok) {
                            const nextData = await nextRes.json();
                            currentPosts = nextData.jobPostings || [];
                        } else break;
                    }

                    if (currentPosts.length === 0) break;

                    for (const j of currentPosts) {
                        // Accenture-style: locationsText is undefined, location is in bulletFields[1]
                        const loc = j.locationsText || j.bulletFields?.[1] || 'UK';
                        const jobUrl = safeStr(`${publicBase}${j.externalPath}`, 500);
                        if (isUKLocation(loc, jobUrl)) {
                            allJobs.push({
                                title: safeStr(j.title),
                                location: safeStr(loc),
                                url: jobUrl,
                                department: safeStr(j.jobFamilyGroup || j.jobFamily || '') || null
                            });
                        }
                    }

                    offset += 20;
                    if (offset >= 2000) break;
                    await sleep(300);
                }
                break outerLoop; // success — stop trying other endpoints
            } catch {
                continue;
            }
        }
    }

    if (!found) {
        console.log(`  -> No working endpoint found.`);
    }

    // Deduplicate
    const uniqueJobs = Array.from(new Map(allJobs.map(item => [item.url, item])).values())
        .filter(j => isUKLocation(j.location, j.url));
    console.log(`  -> Extracted ${uniqueJobs.length} live UK roles.`);

    if (uniqueJobs.length > 0) {
        const jobsToInsert = uniqueJobs.map(j => ({
            company_id: companyId,
            ...j,
            last_seen_at: new Date().toISOString(),
            sync_run_id: syncRunId
        }));

        for (let i = 0; i < jobsToInsert.length; i += 100) {
            const chunk = jobsToInsert.slice(i, i + 100);
            await supabase.from('jobs').upsert(chunk, { onConflict: 'company_id,url' });
        }
    }

    // Cleanup stale jobs
    await supabase.from('jobs')
        .delete()
        .eq('company_id', companyId)
        .neq('sync_run_id', syncRunId);

    // Update count
    await supabase.from('companies').update({ active_jobs_count: uniqueJobs.length }).eq('id', companyId);
    return uniqueJobs.length;
}


async function start() {
    console.log("========================================");
    console.log("   MASS WORKDAY ATS INGESTION SCRIPT");
    console.log("========================================");

    // Support --name "company name" to run for a single company
    const nameArg = process.argv.indexOf('--name');
    const targetName = nameArg !== -1 ? process.argv[nameArg + 1] : null;

    let query = supabase
        .from('companies')
        .select('id, trading_name, ats_board_token')
        .in('ats_provider', ['workday', 'workday_enterprise']);

    if (targetName) {
        query = query.ilike('trading_name', `%${targetName}%`);
        console.log(`🎯 Targeting companies matching: "${targetName}"`);
    }

    const { data: companies, error } = await query;

    if (error || !companies) {
        console.error("Failed to load companies.", error);
        return;
    }

    console.log(`Loaded ${companies.length} Workday instances.`);
    const syncRunId = crypto.randomUUID();
    let totalJobsSaved = 0;
    let companiesWithJobs = 0;

    // Use concurrency control (batch of 5 at a time)
    const concurrency = 5;
    for (let i = 0; i < companies.length; i += concurrency) {
        const batch = companies.slice(i, i + concurrency);
        const promises = batch.map(c =>
            scrapeWorkdayJobs(c.id, c.trading_name, c.ats_board_token || '', syncRunId)
                .catch(e => { console.error(`Error processing ${c.trading_name}:`, e); return 0; })
        );
        const results = await Promise.all(promises);

        for (const count of results) {
            totalJobsSaved += count;
            if (count > 0) companiesWithJobs++;
        }
    }

    console.log("\n========================================");
    console.log("   SYNC COMPLETE");
    console.log(`   Companies Processed: ${companies.length}`);
    console.log(`   Companies With UK Jobs: ${companiesWithJobs}`);
    console.log(`   Total UK Jobs Saved: ${totalJobsSaved}`);
    console.log("========================================");
}

start();
