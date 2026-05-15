import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// When RLS is enabled, prefer the service role key for scripts that perform
// admin writes. Fall back to the anon key only for local testing.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey as string);

// Define Amazon as a company first to link jobs
async function getOrCreateAmazonCompany() {
    const { data: existing } = await supabase
        .from('companies')
        .select('*')
        .eq('trading_name', 'Amazon')
        .single();

    if (existing) return existing;

    // Create it if it doesn't exist
    const { data: inserted, error } = await supabase
        .from('companies')
        .insert({
            trading_name: 'Amazon',
            companies_house_name: 'AMAZON UK SERVICES LTD.',
            url: 'https://www.amazon.jobs',
            licensed_sponsor: true,
            active_jobs_count: 0
        })
        .select()
        .single();

    if (error) throw error;
    return inserted;
}

// Map Amazon location data to standard formatting
function mapLocation(jobInfo: any): string {
    if (jobInfo.normalized_location) {
        return jobInfo.normalized_location;
    }
    const parts = [jobInfo.city, jobInfo.state, jobInfo.country_code].filter(Boolean);
    return parts.join(', ') || 'UK';
}

function truncate(str: string, max: number): string {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) : str;
}

async function scrapeAmazon() {
    console.log('Fetching Amazon Jobs...');

    const company = await getOrCreateAmazonCompany();

    const targetJobs = 450;
    const batchSize = 100; // API usually allows up to 100 per request
    let offset = 0;
    let allJobs: any[] = [];

    while (allJobs.length < targetJobs) {
        // We filter by full-time and country=GBR 
        const url = `https://www.amazon.jobs/en/search.json?offset=${offset}&result_limit=${batchSize}&sort=relevant&job_type%5B%5D=Full-Time&country%5B%5D=GBR`;
        console.log(`Fetching from ${url} ...`);

        try {
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            if (!res.ok) {
                console.error(`Status ${res.status} from Amazon API`);
                break;
            }

            const data = await res.json();

            if (!data.jobs || data.jobs.length === 0) {
                console.log('No more jobs returned.');
                break;
            }

            // Filter strictly for UK just in case the API ignores the country flag
            const ukJobs = data.jobs.filter((j: any) => j.country_code === 'UK' || j.country_code === 'GB' || j.country_code === 'GBR');

            allJobs = allJobs.concat(ukJobs);
            offset += batchSize;

            if (offset >= data.hits) {
                break; // reached end of all results
            }

            // Artificial delay to prevent ratelimiting
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error('Error fetching chunk:', e);
            break;
        }
    }

    // Trim to specified amount
    const limitJobs = allJobs.slice(0, targetJobs);

    console.log(`Found ${limitJobs.length} UK Amazon jobs. Pushing to DB...`);

    let insertedJobsCount = 0;

    for (const job of limitJobs) {
        try {
            const absoluteUrl = `https://www.amazon.jobs${job.job_path}`;
            const locationStr = mapLocation(job);

            const { error: upsertError } = await supabase
                .from('jobs')
                .upsert({
                    company_id: company.id,
                    url: truncate(absoluteUrl, 500),
                    title: truncate(job.title, 500),
                    department: truncate(job.job_category || job.job_family_name || 'Various', 500),
                    location: truncate(locationStr, 500)
                }, { onConflict: 'url' });

            if (upsertError) {
                console.error(`Failed to insert ${job.title}:`, upsertError.message);
            } else {
                insertedJobsCount++;
            }
        } catch (e) {
            console.error('Processing error:', e);
        }
    }

    if (insertedJobsCount > 0) {
        console.log(`Updating company active_jobs_count...`);
        // Recalculate this company's jobs
        const { count } = await supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id);

        await supabase
            .from('companies')
            .update({ active_jobs_count: count || insertedJobsCount })
            .eq('id', company.id);
    }

    console.log(`Success! Ingested ${insertedJobsCount} Amazon jobs.`);
}

scrapeAmazon().catch(console.error);
