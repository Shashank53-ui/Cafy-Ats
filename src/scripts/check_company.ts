import { supabase } from '../lib/supabase';

async function main() {
  const { data, error } = await supabase
    .from('companies')
    .select('id, trading_name, ats_provider, active_jobs_count')
    .in('id', [1726, 1727, 1728, 1729, 1730]);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Companies:', data);
}

main();