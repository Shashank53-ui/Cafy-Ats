import { createClient } from '@supabase/supabase-js';

// If we are in a Node.js environment (e.g. CLI script), load dotenv
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    try {
        const dotenv = require('dotenv');
        dotenv.config({ path: '.env.local' });
    } catch (e) {
        // dotenv might not be available in browser, which is fine
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';

// Prefer the service role key when running in Node (CLI scripts / server-side
// scripts) so writes succeed when RLS is enabled. In browser (client-side)
// code we always use the public anon key.
const isServer = typeof window === 'undefined';
const supabaseKey = isServer
    ? process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey || '');
