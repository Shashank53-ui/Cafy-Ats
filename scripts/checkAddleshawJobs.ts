import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const id = '1585';
  for (const t of ['jobs', 'jobs_IR'] as const) {
    const { count, error } = await sb
      .from(t)
      .select('*', { count: 'exact', head: true })
      .eq('company_id', id);
    if (error) console.log(t, error.message);
    else console.log(t, 'count=', count);
  }
  const { data } = await sb
    .from('companies')
    .select('id,trading_name,ats_provider,ats_status,ats_board_token,careers_url,active_jobs_count,sync_market')
    .eq('id', id)
    .maybeSingle();
  console.log(JSON.stringify(data, null, 2));
}
main();
