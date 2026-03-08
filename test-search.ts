import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync('search-log.txt', msg + '\n');
};

if (fs.existsSync('search-log.txt')) fs.unlinkSync('search-log.txt');

async function testSearch(searchTerm) {
    log(`Testing Two-Step Search for: "${searchTerm}"`);

    // Step 1: Find matching companies
    log('Step 1: Finding matching companies...');
    const { data: companies, error: coError } = await supabase
        .from('companies')
        .select('id')
        .ilike('trading_name', `%${searchTerm}%`);

    if (coError) {
        log(`  -> Company Search Failed: ${coError.message}`);
        return;
    }

    const companyIds = companies?.map(c => c.id) || [];
    log(`  -> Found ${companyIds.length} matching companies.`);

    // Step 2: Search jobs
    log('\nStep 2: Searching jobs (Title OR Company IDs)...');
    let jobQuery = supabase
        .from('jobs')
        .select('*, company:companies!inner(*)', { count: 'exact' });

    const orConditions = [`title.ilike.%${searchTerm}%`];
    if (companyIds.length > 0) {
        orConditions.push(`company_id.in.(${companyIds.join(',')})`);
    }

    const { data: jobs, error: jobError, count } = await jobQuery
        .or(orConditions.join(','))
        .range(0, 4);

    if (jobError) {
        log(`  -> Job Search Failed: ${jobError.message} (${jobError.code})`);
    } else {
        log(`  -> Success! Found ${count} jobs total.`);
        jobs?.forEach(j => {
            log(`- [${j.id}] ${j.title} @ ${j.company?.trading_name}`);
        });
    }
}

const term = process.argv[2] || 'Developer';
testSearch(term).then(() => log('\nDone.'));
