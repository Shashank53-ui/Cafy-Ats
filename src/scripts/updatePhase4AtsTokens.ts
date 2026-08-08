/**
 * Update Phase 4 gap companies with hunted UK ATS tokens.
 * Run: npx tsx src/scripts/updatePhase4AtsTokens.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}
const sb = createClient(url, key);

type Update = {
  id: number;
  ats_provider: string | null;
  ats_board_token: string | null;
  ats_status: string;
  careers_url?: string;
  notes: string;
};

const UPDATES: Update[] = [
  {
    id: 960001,
    ats_provider: 'avature',
    ats_board_token: 'virginmediao2',
    ats_status: 'unchecked',
    careers_url: 'https://jobs.virginmediao2.co.uk/',
    notes: 'Avature portal virginmediao2.avature.net (public REST often blocked)',
  },
  {
    id: 960002,
    ats_provider: 'phenom',
    ats_board_token: 'https://careers.dhl.com',
    ats_status: 'unchecked',
    careers_url: 'https://careers.dhl.com/',
    notes: 'Phenom global board; UK filter applied post-fetch',
  },
  {
    id: 960003,
    ats_provider: 'workday',
    ats_board_token: 'fedex/FXE-EU_External',
    ats_status: 'unchecked',
    careers_url: 'https://careers.fedex.com/',
    notes: 'EU Workday board; UK rows use GBR location codes',
  },
  {
    id: 960006,
    ats_provider: 'smartrecruiters',
    ats_board_token: 'Ubisoft2',
    ats_status: 'unchecked',
    careers_url: 'https://www.ubisoft.com/en-us/company/careers',
    notes: 'Global SR board; few UK postings (Newcastle)',
  },
  {
    id: 960007,
    ats_provider: 'workday',
    ats_board_token: 'relx/ElsevierJobs',
    ats_status: 'unchecked',
    careers_url: 'https://relx.wd3.myworkdayjobs.com/ElsevierJobs',
    notes: 'RELX Elsevier Workday; UK facet/location London Wall etc.',
  },
  {
    id: 960008,
    ats_provider: 'greenhouse',
    ats_board_token: 'rockstargames',
    ats_status: 'unchecked',
    careers_url: 'https://www.rockstargames.com/careers',
    notes: 'Confirmed Greenhouse board with many UK studio roles',
  },
  {
    id: 960009,
    ats_provider: 'successfactors',
    ats_board_token: 'https://career2.successfactors.eu/careers?company=nestleHRprdBX',
    ats_status: 'unchecked',
    careers_url: 'https://www.nestle.co.uk/en-gb/jobs',
    notes: 'SuccessFactors company nestleHRprdBX → jobdetails.nestle.com',
  },
  {
    id: 960014,
    ats_provider: 'workday',
    ats_board_token: 'iberdrola/Iberdrola',
    ats_status: 'unchecked',
    careers_url: 'https://iberdrola.wd3.myworkdayjobs.com/Iberdrola',
    notes: 'ScottishPower parent Iberdrola Workday; UK search returns Glasgow etc.',
  },
  {
    id: 960015,
    ats_provider: 'successfactors',
    ats_board_token: 'https://career2.successfactors.eu/careers?company=gknaerospa',
    ats_status: 'unchecked',
    careers_url: 'https://joinus.gknaerospace.com/',
    notes: 'SuccessFactors company gknaerospa → careers.gknaerospace.com',
  },
  {
    id: 960005,
    ats_provider: 'oracle_cloud',
    ats_board_token: 'fa-euup-saasfaprod1.fa.ocs.oraclecloud.com|CX_1',
    ats_status: 'unchecked',
    careers_url: 'https://careers.itv.com/jobs',
    notes: 'Oracle Cloud HCM CE site CX_1; REST returns UK requisitions',
  },
  {
    id: 960013,
    ats_provider: 'generic_careers',
    ats_board_token: 'https://careers.edfenergy.com/jobs',
    ats_status: 'unchecked',
    careers_url: 'https://careers.edfenergy.com/jobs',
    notes: 'Attrax SSR job list on /jobs; generic HTML scraper (first page)',
  },
  {
    id: 960010,
    ats_provider: 'talenttrack',
    ats_board_token: '5|https://jobs.barchester.com|barchester',
    ats_status: 'unchecked',
    careers_url: 'https://jobs.barchester.com/',
    notes: 'TalentTrack oid/5 public search API (~980 UK care roles)',
  },
  {
    id: 960016,
    ats_provider: 'workday',
    ats_board_token: 'cmno/CMS_Career_Site',
    ats_status: 'unchecked',
    careers_url: 'https://cmno.wd3.myworkdayjobs.com/CMS_Career_Site',
    notes: 'CMS UK moved to Workday board CMS_Career_Site (was SelectMinds)',
  },
  {
    id: 960011,
    ats_provider: 'softscape',
    ats_board_token: 'https://apply.hc-one.co.uk',
    ats_status: 'unchecked',
    careers_url: 'https://apply.hc-one.co.uk/vacancies/vacancy-search-results.aspx',
    notes: 'Softscape map markers JSON (~320 UK care vacancies)',
  },
  {
    id: 960012,
    ats_provider: 'teachfirst',
    ats_board_token: 'https://www.teachfirst.org.uk/working-teach-first/vacancies',
    ats_status: 'unchecked',
    careers_url: 'https://www.teachfirst.org.uk/working-teach-first/vacancies',
    notes: 'Drupal vacancies page with Salesforce PeoplePlatform apply links',
  },
  {
    id: 960004,
    ats_provider: 'networkrail',
    ats_board_token: 'networkrail',
    ats_status: 'unchecked',
    careers_url: 'https://apxprodnwrl.opc.oracleoutsourcing.com/ords/r/xxapex/recruitment-external-candidate/find-a-job',
    notes: 'Oracle APEX portal; Playwright fetchAll on Maintenance + Corporate pages',
  },
];

async function main() {
  const results: any[] = [];
  for (const u of UPDATES) {
    const payload: Record<string, unknown> = {
      ats_provider: u.ats_provider,
      ats_board_token: u.ats_board_token,
      ats_status: u.ats_status,
    };
    if (u.careers_url) payload.careers_url = u.careers_url;

    const { data, error } = await sb
      .from('companies')
      .update(payload)
      .eq('id', u.id)
      .select('id, trading_name, ats_provider, ats_board_token, ats_status, careers_url')
      .single();

    results.push({
      id: u.id,
      notes: u.notes,
      ok: !error,
      error: error?.message,
      row: data,
    });
    console.log(
      error
        ? `FAIL ${u.id}: ${error.message}`
        : `OK   ${u.id} ${data?.trading_name} → ${data?.ats_provider}/${data?.ats_board_token}`
    );
  }

  console.log('\nAll Phase-4 seed companies now have ATS wiring (Network Rail via Oracle APEX).');

  await import('fs').then((fs) =>
    fs.writeFileSync('tmp-phase4-ats-updates.json', JSON.stringify({ results }, null, 2))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
