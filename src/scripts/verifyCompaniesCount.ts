import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { count, error } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`companies row count: ${count}`);
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
