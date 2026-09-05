/**
 * Point NHS at a live search URL and re-enable a few skipped boards.
 *   npx tsx src/scripts/repairExpiredBoards.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const NHS_TOKEN =
  'https://www.jobs.nhs.uk/candidate/search/results?payBand=BAND_5&payBand=BAND_6&payBand=BAND_7&payBand=BAND_8A&payBand=BAND_8B&payBand=BAND_8C&payBand=BAND_8D&payBand=BAND_9&payBand=CONSULTANT&payBand=SPECIALTY_DOCTOR&payBand=SPECIALTY_REGISTRAR&payBand=SPECIALIST&payBand=DOCTOR_OTHER&payBand=VERY_SENIOR_MANAGER';

async function main() {
  const patches = [
    {
      id: '1690',
      ats_provider: 'nhs',
      ats_board_token: NHS_TOKEN,
      careers_url: 'https://www.jobs.nhs.uk/',
      ats_status: 'ok',
      ats_failure_count: 0,
    },
    {
      id: '1726',
      ats_provider: 'goldmansachs',
      ats_board_token: 'https://higher.gs.com/results?LOCATION=Birmingham%7CLondon&page=1&sort=RELEVANCE',
      careers_url: 'https://higher.gs.com/results?LOCATION=Birmingham%7CLondon&page=1&sort=RELEVANCE',
      ats_status: 'ok',
      ats_failure_count: 0,
    },
    {
      id: '479',
      ats_provider: 'custom',
      ats_board_token: 'https://www.revolut.com/careers',
      careers_url: 'https://www.revolut.com/careers',
      sync_market: 'both',
      ats_status: 'ok',
      ats_failure_count: 0,
    },
    { id: '528', ats_status: 'ok', ats_failure_count: 0 },
    { id: '1415', ats_status: 'ok', ats_failure_count: 0 },
  ];
  console.log(JSON.stringify({ apply: APPLY, patches }, null, 2));
  if (!APPLY) return;
  for (const p of patches) {
    const { id, ...rest } = p;
    const { error } = await sb.from('companies').update(rest).eq('id', id);
    if (error) throw new Error(`${id}: ${error.message}`);
  }
  console.log('patched', patches.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
