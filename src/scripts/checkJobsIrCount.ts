/**
 * checkJobsIrCount.ts — fail if jobs_IR is below the daily Ireland SLA.
 * Usage: npx tsx src/scripts/checkJobsIrCount.ts [--min 6000]
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const minArg = process.argv.indexOf('--min');
const MIN = minArg !== -1 ? parseInt(process.argv[minArg + 1], 10) : 6000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
    const { count, error } = await supabase
        .from('jobs_IR')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Count failed:', error.message);
        process.exit(1);
    }

    const n = count ?? 0;
    console.log(`jobs_IR count=${n} min=${MIN}`);

    const { count: linkedinCount } = await supabase
        .from('jobs_IR')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'linkedin');

    const { count: atsCount } = await supabase
        .from('jobs_IR')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'ats');

    console.log(`  source=linkedin: ${linkedinCount ?? 'n/a'}`);
    console.log(`  source=ats: ${atsCount ?? 'n/a'}`);

    if (n < MIN) {
        console.error(`FAIL: jobs_IR ${n} < ${MIN}`);
        process.exit(1);
    }
    console.log('PASS: Ireland job SLA met');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
