/**
 * Point licensed sponsors at their real ATS boards and re-enable live dead tokens.
 *
 *   npx tsx src/scripts/repairSponsoredAts.ts
 *   npx tsx src/scripts/repairSponsoredAts.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Patch = {
  id: string;
  ats_provider: string;
  ats_board_token: string;
  careers_url?: string;
};

const PATCHES: Patch[] = [
  { id: '1603', ats_provider: 'greenhouse', ats_board_token: 'pinterest', careers_url: 'https://boards.greenhouse.io/pinterest' },
  { id: '1489', ats_provider: 'greenhouse', ats_board_token: 'epicgames', careers_url: 'https://boards.greenhouse.io/epicgames' },
  { id: '768', ats_provider: 'greenhouse', ats_board_token: 'helsing', careers_url: 'https://boards.greenhouse.io/helsing' },
  { id: '924', ats_provider: 'greenhouse', ats_board_token: 'asana', careers_url: 'https://boards.greenhouse.io/asana' },
  { id: '915', ats_provider: 'greenhouse', ats_board_token: 'fanduel', careers_url: 'https://boards.greenhouse.io/fanduel' },
  { id: '1781', ats_provider: 'greenhouse', ats_board_token: 'ocadogroup', careers_url: 'https://boards.greenhouse.io/ocadogroup' },
  { id: '1108', ats_provider: 'greenhouse', ats_board_token: 'appsflyer', careers_url: 'https://boards.greenhouse.io/appsflyer' },
  { id: '1714', ats_provider: 'greenhouse', ats_board_token: 'kaluza', careers_url: 'https://boards.greenhouse.io/kaluza' },
  { id: '940', ats_provider: 'greenhouse', ats_board_token: 'complyadvantage', careers_url: 'https://boards.greenhouse.io/complyadvantage' },
  { id: '674', ats_provider: 'greenhouse', ats_board_token: 'circleci', careers_url: 'https://boards.greenhouse.io/circleci' },
  { id: '905', ats_provider: 'greenhouse', ats_board_token: 'skyscanner', careers_url: 'https://boards.greenhouse.io/skyscanner' },
  { id: '853', ats_provider: 'greenhouse', ats_board_token: 'climatex', careers_url: 'https://boards.greenhouse.io/climatex' },
  { id: '499', ats_provider: 'workable', ats_board_token: 'resi', careers_url: 'https://apply.workable.com/resi' },
  { id: '2520', ats_provider: 'workable', ats_board_token: 'captur', careers_url: 'https://apply.workable.com/captur/' },
  { id: '1775', ats_provider: 'workable', ats_board_token: 'fisher-investments', careers_url: 'https://apply.workable.com/fisher-investments/' },
  { id: '211', ats_provider: 'workable', ats_board_token: 'proximie', careers_url: 'https://apply.workable.com/proximie/' },
  { id: '98', ats_provider: 'workable', ats_board_token: 'employment-hero', careers_url: 'https://apply.workable.com/employment-hero/' },
  { id: '1430', ats_provider: 'ashby', ats_board_token: 'altruistiq', careers_url: 'https://jobs.ashbyhq.com/altruistiq' },
  { id: '630', ats_provider: 'smartrecruiters', ats_board_token: 'InPostSA', careers_url: 'https://careers.smartrecruiters.com/InPostSA' },
  { id: '703', ats_provider: 'workable', ats_board_token: 'luminance-1' },
  { id: '557', ats_provider: 'workable', ats_board_token: 'bauermediaoutdoor' },
  { id: '431', ats_provider: 'workable', ats_board_token: 'and-digital' },
  { id: '1101', ats_provider: 'workable', ats_board_token: 'joinblink' },
  { id: '1432', ats_provider: 'workable', ats_board_token: 'freddies-flowers-1' },
  { id: '282', ats_provider: 'workable', ats_board_token: 'hutch' },
  { id: '2116', ats_provider: 'ashby', ats_board_token: 'plural' },
  { id: '3060', ats_provider: 'workable', ats_board_token: 'flowdesk' },
  { id: '85', ats_provider: 'workable', ats_board_token: 'houst' },
];

async function main() {
  const planned: Array<{ id: string; name: string; from: string; to: string }> = [];
  for (const patch of PATCHES) {
    const { data, error } = await sb
      .from('companies')
      .select('id, trading_name, ats_provider, ats_board_token, ats_status, licensed_sponsor, sync_market')
      .eq('id', patch.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      planned.push({ id: patch.id, name: '(missing)', from: '', to: `${patch.ats_provider} ${patch.ats_board_token}` });
      continue;
    }
    const next = {
      ats_provider: patch.ats_provider,
      ats_board_token: patch.ats_board_token,
      ...(patch.careers_url ? { careers_url: patch.careers_url } : {}),
      ats_status: 'ok',
      ats_failure_count: 0,
      sync_market: 'both',
    };
    planned.push({
      id: String(data.id),
      name: data.trading_name,
      from: `${data.ats_provider} ${data.ats_status} ${data.ats_board_token}`,
      to: `${next.ats_provider} ${next.ats_board_token}`,
    });
    if (APPLY) {
      const { error: uerr } = await sb.from('companies').update(next).eq('id', patch.id);
      if (uerr) throw new Error(`${patch.id}: ${uerr.message}`);
      await sb
        .from('ats_import_audit')
        .update({
          sync_provider: next.ats_provider,
          provider_raw: next.ats_provider,
          board_token_raw: next.ats_board_token,
          ...(patch.careers_url ? { careers_url_raw: patch.careers_url } : {}),
        })
        .eq('company_id', patch.id);
    }
  }
  console.log(JSON.stringify({ apply: APPLY, count: planned.length, planned }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
