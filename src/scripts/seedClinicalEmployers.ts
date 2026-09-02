/**
 * Seed missing clinical employers (Novo, Takeda, HSE) and re-enable Bayer.
 *
 *   npx tsx src/scripts/seedClinicalEmployers.ts
 *   npx tsx src/scripts/seedClinicalEmployers.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PHARMA_SECTOR = 'Pharmaceuticals / Biotechnology';

type NewCompany = {
  id: string;
  trading_name: string;
  ats_provider: string;
  ats_board_token: string;
  careers_url: string;
  url: string;
  licensed_sponsor: boolean;
  ireland_permit_employer: boolean;
  sync_market: 'uk' | 'ireland' | 'both';
  ats_status: string;
  company_sector: string;
  open_to_sponsorship: number;
};

const INSERTS: NewCompany[] = [
  {
    id: '970001',
    trading_name: 'Novo Nordisk',
    ats_provider: 'successfactors',
    ats_board_token: 'https://careers.novonordisk.com',
    careers_url: 'https://careers.novonordisk.com/search/',
    url: 'https://www.novonordisk.com',
    licensed_sponsor: true,
    ireland_permit_employer: true,
    sync_market: 'both',
    ats_status: 'ok',
    company_sector: PHARMA_SECTOR,
    open_to_sponsorship: 1,
  },
  {
    id: '900167',
    trading_name: 'Takeda',
    ats_provider: 'takeda',
    ats_board_token: 'https://jobs.takeda.com',
    careers_url: 'https://jobs.takeda.com/search-jobs',
    url: 'https://www.takeda.com',
    licensed_sponsor: true,
    ireland_permit_employer: true,
    sync_market: 'both',
    ats_status: 'ok',
    company_sector: PHARMA_SECTOR,
    open_to_sponsorship: 1,
  },
  {
    id: '900180',
    trading_name: 'HSE',
    ats_provider: 'hse',
    ats_board_token: 'https://about.hse.ie/jobs/job-search/',
    careers_url: 'https://about.hse.ie/jobs/job-search/',
    url: 'https://www.hse.ie',
    licensed_sponsor: false,
    ireland_permit_employer: true,
    sync_market: 'ireland',
    ats_status: 'ok',
    company_sector: 'Healthcare',
    open_to_sponsorship: 0,
  },
];

async function findByName(name: string) {
  const { data, error } = await sb
    .from('companies')
    .select('id, trading_name, ats_provider, ats_status, licensed_sponsor, company_sector')
    .ilike('trading_name', name)
    .limit(5);
  if (error) throw error;
  return data || [];
}

async function main() {
  const planned: Array<Record<string, unknown>> = [];

  for (const row of INSERTS) {
    const hits = await findByName(row.trading_name);
    const existing = hits.find((h) => String(h.trading_name).trim().toLowerCase() === row.trading_name.toLowerCase())
      || (row.trading_name === 'HSE' ? hits.find((h) => /^hse$/i.test(String(h.trading_name))) : undefined);
    if (existing) {
      planned.push({ action: 'exists', id: existing.id, name: existing.trading_name, provider: existing.ats_provider });
      continue;
    }
    const { data: idClash } = await sb.from('companies').select('id, trading_name').eq('id', row.id).maybeSingle();
    if (idClash) {
      planned.push({ action: 'id_clash', id: row.id, name: row.trading_name, heldBy: idClash.trading_name });
      continue;
    }
    planned.push({ action: 'insert', id: row.id, name: row.trading_name, provider: row.ats_provider });
    if (APPLY) {
      const { data, error } = await sb.from('companies').insert(row).select('id, trading_name').single();
      if (error) throw new Error(`${row.trading_name}: ${error.message}`);
      planned[planned.length - 1].id = data?.id;
    }
  }

  const bayerHits = await findByName('Bayer');
  const bayer = bayerHits.find((h) => /^bayer$/i.test(String(h.trading_name)));
  if (bayer) {
    const patch = {
      ats_provider: 'successfactors',
      ats_board_token: 'https://jobs.bayer.com',
      careers_url: 'https://jobs.bayer.com/search/',
      ats_status: 'ok',
      licensed_sponsor: true,
      ireland_permit_employer: true,
      company_sector: PHARMA_SECTOR,
      sync_market: 'both',
    };
    planned.push({ action: 'patch', id: bayer.id, name: 'Bayer', from: bayer.ats_status, to: 'ok' });
    if (APPLY) {
      const { error } = await sb.from('companies').update(patch).eq('id', bayer.id);
      if (error) throw new Error(`Bayer: ${error.message}`);
    }
  }

  const msdHits = await findByName('MSD');
  const msd = msdHits.find((h) => /^msd$/i.test(String(h.trading_name)));
  if (msd && msd.company_sector !== PHARMA_SECTOR) {
    planned.push({ action: 'patch', id: msd.id, name: 'MSD', from: msd.company_sector, to: PHARMA_SECTOR });
    if (APPLY) {
      const { error } = await sb.from('companies').update({ company_sector: PHARMA_SECTOR }).eq('id', msd.id);
      if (error) throw new Error(`MSD: ${error.message}`);
    }
  }

  console.log(JSON.stringify({ apply: APPLY, planned }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
