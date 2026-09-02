/**
 * Point pharma employers at the live ATS boards (AZ Radancy, Pfizer/GSK/Novartis Workday).
 *
 *   npx tsx src/scripts/repairPharmaAts.ts
 *   npx tsx src/scripts/repairPharmaAts.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Patch = {
  match: string;
  ats_provider: string;
  ats_board_token: string;
  careers_url: string;
  ats_status?: string;
};

const PATCHES: Patch[] = [
  {
    match: 'AstraZeneca',
    ats_provider: 'astrazeneca',
    ats_board_token: 'astrazeneca',
    careers_url: 'https://careers.astrazeneca.com/search-jobs',
    ats_status: 'ok',
  },
  {
    match: 'Pfizer',
    ats_provider: 'workday',
    ats_board_token: 'pfizer/PfizerCareers',
    careers_url: 'https://pfizer.wd1.myworkdayjobs.com/PfizerCareers/',
    ats_status: 'ok',
  },
  {
    match: 'GSK',
    ats_provider: 'workday',
    ats_board_token: 'gsk/GSKCareers',
    careers_url: 'https://gsk.wd5.myworkdayjobs.com/GSKCareers',
    ats_status: 'ok',
  },
  {
    match: 'Novartis',
    ats_provider: 'workday',
    ats_board_token: 'novartis/Novartis_Careers',
    careers_url: 'https://novartis.wd3.myworkdayjobs.com/Novartis_Careers',
    ats_status: 'ok',
  },
  {
    match: 'Eli Lilly',
    ats_provider: 'phenom',
    ats_board_token: 'https://careers.lilly.com',
    careers_url: 'https://careers.lilly.com/us/en/search-results',
    ats_status: 'ok',
  },
];

async function main() {
  const planned: Array<{ id: string; name: string; from: string; to: string }> = [];

  for (const patch of PATCHES) {
    const { data: hits, error } = await sb
      .from('companies')
      .select('id, trading_name, ats_provider, ats_board_token, careers_url, ats_status')
      .ilike('trading_name', `%${patch.match}%`);
    if (error) throw error;
    for (const hit of hits || []) {
      // GSK must not rewrite Haleon (gsknch) or "GSK" substring in other names.
      if (patch.match === 'GSK' && !/^gsk$/i.test(String(hit.trading_name || '').trim())) continue;
      if (patch.match === 'Pfizer' && !/pfizer/i.test(hit.trading_name || '')) continue;

      const next = {
        ats_provider: patch.ats_provider,
        ats_board_token: patch.ats_board_token,
        careers_url: patch.careers_url,
        ...(patch.ats_status ? { ats_status: patch.ats_status } : {}),
      };
      const changed =
        String(hit.ats_provider || '') !== next.ats_provider ||
        String(hit.ats_board_token || '') !== next.ats_board_token ||
        String(hit.careers_url || '') !== next.careers_url;
      if (changed) {
        planned.push({
          id: String(hit.id),
          name: hit.trading_name,
          from: `${hit.ats_provider} ${hit.ats_board_token}`,
          to: `${next.ats_provider} ${next.ats_board_token}`,
        });
      }
      if (APPLY) {
        if (changed) {
          const { error: uerr } = await sb.from('companies').update(next).eq('id', hit.id);
          if (uerr) throw new Error(`${hit.trading_name}: ${uerr.message}`);
        }
        // companies.ats_* is not enough — syncAll prefers ats_import_audit.
        await sb
          .from('ats_import_audit')
          .update({
            sync_provider: next.ats_provider,
            provider_raw: next.ats_provider,
            board_token_raw: next.ats_board_token,
            careers_url_raw: next.careers_url,
          })
          .eq('company_id', hit.id);
      }
    }
  }

  const novartisId = await trimNovartisId(APPLY);

  console.log(JSON.stringify({ apply: APPLY, planned, novartisId }, null, 2));
}

/** Production Novartis PK is "4065\\n", so `--ids 4065` never loads the row. */
async function trimNovartisId(apply: boolean) {
  const { data: hits, error } = await sb
    .from('companies')
    .select('id, trading_name')
    .ilike('trading_name', 'Novartis');
  if (error) throw error;
  const hit = (hits || []).find((row) => String(row.id).includes('\n') || String(row.id) !== String(row.id).trim());
  if (!hit) return { skipped: true, reason: 'id already clean' };

  const dirty = hit.id;
  const clean = String(dirty).trim();
  const { data: clash } = await sb.from('companies').select('id').eq('id', clean).neq('id', dirty);
  if (clash && clash.length > 0) {
    return { skipped: true, reason: `clean id ${clean} already exists`, dirty };
  }

  if (!apply) return { skipped: false, dirty, clean };

  for (const table of ['jobs', 'jobs_IR'] as const) {
    const { error: childErr } = await sb.from(table).update({ company_id: clean }).eq('company_id', dirty);
    if (childErr) return { skipped: true, reason: `${table}: ${childErr.message}`, dirty, clean };
  }
  const { error: parentErr } = await sb.from('companies').update({ id: clean }).eq('id', dirty);
  if (parentErr) return { skipped: true, reason: parentErr.message, dirty, clean };
  await sb.from('ats_import_audit').update({ company_id: Number(clean) }).eq('company_id', dirty);
  return { skipped: false, dirty, clean, applied: true };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
