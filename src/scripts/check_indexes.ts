import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkIndexes() {
    console.log('Checking indexes for critical tables...');

    const tables = ['jobs', 'companies', 'subscriptions', 'customers'];

    for (const table of tables) {
        const { data, error } = await supabase.rpc('get_table_indexes', { table_name: table });

        if (error) {
            // If RPC doesn't exist, try raw query via another method or just report missing RPC
            console.log(`Table: ${table} - Could not fetch indexes directly (RPC missing?).`);

            // Attempt to use a generic query if possible, or just list columns to see if they look like they should be indexed
            const { data: cols, error: colError } = await supabase.from(table).select('*').limit(1);
            if (cols) {
                console.log(`Columns in ${table}: ${Object.keys(cols[0]).join(', ')}`);
            }
            continue;
        }

        console.log(`Table: ${table} Indexes:`, data);
    }
}

checkIndexes();
