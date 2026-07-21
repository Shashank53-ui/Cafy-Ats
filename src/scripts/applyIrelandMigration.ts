/**
 * applyIrelandMigration.ts
 *
 * Applies add_ireland_source_and_market.sql when DATABASE_URL / DIRECT_URL is set.
 * Otherwise prints the SQL path for the Supabase SQL editor.
 *
 *   npx tsx src/scripts/applyIrelandMigration.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SQL_PATH = path.resolve(process.cwd(), 'supabase/add_ireland_source_and_market.sql');

async function main() {
    const sql = fs.readFileSync(SQL_PATH, 'utf8');
    const dbUrl =
        process.env.DATABASE_URL ||
        process.env.DIRECT_URL ||
        process.env.SUPABASE_DB_URL ||
        process.env.POSTGRES_URL ||
        '';

    if (!dbUrl) {
        console.log('No DATABASE_URL / DIRECT_URL found.');
        console.log('Apply this SQL in the Supabase SQL editor, then re-run:');
        console.log(`  ${SQL_PATH}`);
        console.log('\n--- SQL preview ---\n');
        console.log(sql);
        process.exit(2);
    }

    // Dynamic import so projects without pg still typecheck scripts that don't need it
    const pg = await import('pg');
    const client = new pg.default.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
        await client.query(sql);
        console.log('Migration applied successfully.');
    } finally {
        await client.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
