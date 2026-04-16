import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
    const { data, error } = await supabase
        .from('companies')
        .select('id, trading_name, ats_provider')
        .ilike('trading_name', '%turner%townsend%');

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log('Turner & Townsend company lookup:\n');
    (data || []).forEach(c => {
        console.log(`ID: ${c.id} | ${c.trading_name} | Provider: ${c.ats_provider}`);
    });
}

main();
