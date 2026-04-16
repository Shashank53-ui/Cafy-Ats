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
        console.log('STEP 1: Snapshot T&T Current Job Count (Before Fix)');
        console.log('═══════════════════════════════════════════════════════════\n');

        // Query T&T jobs using company ID 1691 (Turner & Townsend)
        const { data: ttData, error: ttError } = await supabase
            .from('jobs')
            .select('id', { count: 'exact' })
            .eq('company_id', 1691);

        if (ttError) {
            console.error('❌ Error fetching T&T job count:', ttError.message);
            return;
        }

        const ttCount = ttData?.length || 0;
        console.log(`✅ Turner & Townsend current job count: ${ttCount}`);
        if (ttCount === 0) {
            console.log('⚠️  WARNING: T&T has 0 jobs. The old broken cleanup may have already wiped them.');
        } else {
            console.log(`📌 Baseline established: ${ttCount} jobs. After T&T fix, count should match this.`);
        }

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('STEP 4: Dry-Run Count — Null Provider Auto-Detection');
        console.log('═══════════════════════════════════════════════════════════\n');

        // Count null-provider companies and their detectable ATS types
        const { data: nullProvidersData, error: nullError } = await supabase
            .from('companies')
            .select('id, trading_name, url, ats_provider')
            .is('ats_provider', null)
            .not('url', 'is', null);

        if (nullError) {
            console.error('❌ Error fetching null providers:', nullError.message);
            return;
        }

        console.log(`Found ${nullProvidersData?.length || 0} companies with null ats_provider but have careers_url\n`);

        // Analyze URL patterns to detect ATS type
        const patterns = {
            greenhouse: /greenhouse\.io/i,
            lever: /lever\.co/i,
            ashby: /ashby/i,
            workable: /workable/i,
            bamboohr: /bamboohr/i,
            teamtailor: /teamtailor/i,
            smartrecruiters: /smartrecruiters/i,
            workday: /myworkdayjobs\.com/i,
            icims: /icims\.com/i,
            jobvite: /jobvite/i,
            breezy: /breezy\.hr/i,
            recruitee: /recruitee/i,
            pinpoint: /pinpoint/i,
        };

        const distribution: Record<string, number> = {};
        let stillUnknown = 0;

        (nullProvidersData || []).forEach(company => {
            let found = false;
            for (const [ats, regex] of Object.entries(patterns)) {
                if (regex.test(company.url)) {
                    distribution[ats] = (distribution[ats] || 0) + 1;
                    found = true;
                    break;
                }
            }
            if (!found) {
                stillUnknown++;
            }
        });

        console.log('Distribution of auto-detectable ATS types:');
        console.log('───────────────────────────────────────────');
        Object.entries(distribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([ats, count]) => {
                console.log(`  ${ats.padEnd(18)} : ${count} companies`);
            });
        console.log(`  ${'still_unknown'.padEnd(18)} : ${stillUnknown} companies`);
        console.log(`\nTotal detectable: ${Object.values(distribution).reduce((a, b) => a + b, 0)} / ${nullProvidersData?.length}`);
        console.log(`Still unknown:   ${stillUnknown} companies (${((100 * stillUnknown) / (nullProvidersData?.length || 1)).toFixed(1)}%)`);

        console.log('\n' + '═'.repeat(63));
        console.log('\n✅ PRE-SYNC VERIFICATION COMPLETE\n');
        console.log('Next steps:');
        console.log('  1. Review T&T baseline count above');
        console.log('  2. Review null-provider distribution');
        console.log('  3. If still_unknown is < 50-100, proceed with bulk update');
        console.log('  4. Run: npm run sync -- --ids 1691 (T&T smoke test)');
        console.log('  5. Run: npm run sync -- --ids 39 (Visa smoke test)');
        console.log('\n');

    } catch (error: any) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

main();
