import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await sb
    .from('companies')
    .select(
      'id,trading_name,companies_house_name,ats_provider,ats_board_token,careers_url,licensed_sponsor,active_jobs_count,sync_market',
    )
    .or('trading_name.ilike.%addleshaw%,companies_house_name.ilike.%addleshaw%')
    .limit(20);

  if (error) throw error;

  if (!data?.length) {
    console.log('NOT_FOUND: no company matching Addleshaw');
    return;
  }

  console.log(`FOUND ${data.length}:`);
  for (const c of data) {
    console.log(JSON.stringify(c, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
