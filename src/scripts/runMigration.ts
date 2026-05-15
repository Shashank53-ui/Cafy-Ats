import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Prefer the service role key for migrations and admin scripts so RLS does not block DML.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    const sqlPath = path.join(process.cwd(), 'supabase', 'user_preferences.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Running migration...");

    // Using rpc or direct query might not work if not supported directly by supabase-js client without a function.
    // Wait, supabase-js `rpc` requires a Postgres function. Let's try to just insert a row to test, but we need the table.

    // We can't execute raw SQL via standard supabase-js unless we have `pg` installed or use PostgREST endpoint for executing sql.
    // Wait, let's create a quick Node script using `pg` if available, or just instruct to run it in SQL editor.
    console.log("Since Supabase requires Postgres direct connection to run raw SQL DDL, it's best to run the contents of 'supabase/user_preferences.sql' in the Supabase SQL Editor on the web dashboard.");
}

runMigration();
