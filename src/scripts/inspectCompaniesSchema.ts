import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    try {
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('QUERY 1: Actual Company Table Columns');
        console.log('═══════════════════════════════════════════════════════════\n');

        // Fetch one row to see all columns
        const { data: sample, error: sampleError } = await supabase
            .from('companies')
            .select('*')
            .limit(1);

        if (sampleError || !sample || sample.length === 0) {
            console.error('❌ Could not fetch sample row:', sampleError?.message);
            return;
        }

        console.log('Columns in companies table:');
        Object.keys(sample[0]).forEach((col, i) => {
            console.log(`  ${i + 1}. ${col}`);
        });

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('QUERY 2: Sample Null-Provider Companies (Full Row)');
        console.log('═══════════════════════════════════════════════════════════\n');

        const { data: nullSamples, error: nullError } = await supabase
            .from('companies')
            .select('*')
            .is('ats_provider', null)
            .limit(3);

        if (nullError) {
            console.error('❌ Error:', nullError.message);
            return;
        }

        if (!nullSamples || nullSamples.length === 0) {
            console.log('No null-provider companies found.');
            return;
        }

        console.log(`Found ${nullSamples.length} sample null-provider companies:\n`);
        
        nullSamples.forEach((company: any, idx: number) => {
            console.log(`\n--- Company ${idx + 1} ---`);
            Object.entries(company).forEach(([key, value]) => {
                const displayValue = typeof value === 'string' 
                    ? (value.length > 80 ? value.substring(0, 80) + '...' : value)
                    : value;
                console.log(`${key}: ${displayValue}`);
            });
        });

    } catch (error: any) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

main();
