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
        console.log('\nDEBUG: Sample null-provider company URLs\n');

        const { data: samples, error } = await supabase
            .from('companies')
            .select('id, trading_name, url, ats_provider')
            .is('ats_provider', null)
            .not('url', 'is', null)
            .limit(30);

        if (error) {
            console.error('Error:', error.message);
            return;
        }

        console.log(`Found ${samples?.length || 0} sample companies:\n`);
        (samples || []).forEach((c: any, i: number) => {
            console.log(`${i + 1}. ${c.trading_name}`);
            console.log(`   URL: ${c.url}`);
            console.log('');
        });

    } catch (error: any) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

main();
