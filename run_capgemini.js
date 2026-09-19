const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
    
    // We just want to call the custom scraper directly
    const { fetchCustom } = require('./src/scripts/customScrapers.ts'); // Wait tsx can't execute via node directly this easily
}
console.log("Run via tsx");
