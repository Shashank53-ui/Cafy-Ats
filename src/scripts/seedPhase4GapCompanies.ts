/**
 * Phase 4: seed missing companies in thin industries (telecom, logistics,
 * media, care, food, energy, education) using web-verified careers URLs / ATS.
 *
 * Skips names that already exist. Sets licensed_sponsor=true for known UK
 * sponsors; company_sector for feed diversity.
 *
 * Run: npx tsx src/scripts/seedPhase4GapCompanies.ts
 * Dry:  npx tsx src/scripts/seedPhase4GapCompanies.ts --dry-run
 */
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const DRY_RUN = process.argv.includes('--dry-run');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Phase-4 custom id block (960000+).
 * Ireland permit seeds use 900000–959999; syncAll treats id >= 960000 as UK.
 */
const ID_START = 960001;

type Seed = {
  trading_name: string;
  company_sector: string;
  careers_url: string;
  ats_provider?: string | null;
  ats_board_token?: string | null;
  register_hint: string;
  industry_gap: string;
};

const SEEDS: Seed[] = [
  {
    trading_name: 'Virgin Media O2',
    company_sector: 'Engineering (Hardware)',
    careers_url: 'https://jobs.virginmediao2.co.uk/',
    register_hint: 'Virgin Media Limited',
    industry_gap: 'Telecom',
  },
  {
    trading_name: 'DHL',
    company_sector: 'Logistics & Transport',
    careers_url: 'https://careers.dhl.com/',
    register_hint: 'DHL Air (UK)',
    industry_gap: 'Logistics',
  },
  {
    trading_name: 'FedEx',
    company_sector: 'Logistics & Transport',
    careers_url: 'https://fedex.wd1.myworkdayjobs.com/FXE-EU_External',
    ats_provider: 'workday',
    ats_board_token: 'fedex/FXE-EU_External',
    register_hint: 'FedEx Express UK Limited',
    industry_gap: 'Logistics',
  },
  // UPS omitted — no clear UK register match under common legal names in current CSV
  {
    trading_name: 'Network Rail',
    company_sector: 'Logistics & Transport',
    careers_url: 'https://www.networkrail.co.uk/careers/',
    register_hint: 'Network Rail Infrastructure',
    industry_gap: 'Logistics / Rail',
  },
  {
    trading_name: 'ITV',
    company_sector: 'Media & Journalism',
    careers_url: 'https://careers.itv.com/',
    register_hint: 'ITV plc',
    industry_gap: 'Media',
  },
  {
    trading_name: 'Ubisoft',
    company_sector: 'Media & Journalism',
    careers_url: 'https://careers.smartrecruiters.com/ubisoft2',
    ats_provider: 'smartrecruiters',
    ats_board_token: 'Ubisoft2',
    register_hint: 'Ubisoft Reflections',
    industry_gap: 'Media / Gaming',
  },
  {
    trading_name: 'Elsevier',
    company_sector: 'Media & Journalism',
    careers_url: 'https://relx.wd3.myworkdayjobs.com/ElsevierJobs',
    ats_provider: 'workday',
    ats_board_token: 'relx/ElsevierJobs',
    register_hint: 'RELX (UK)',
    industry_gap: 'Media / Publishing',
  },
  {
    trading_name: 'Rockstar Games',
    company_sector: 'Media & Journalism',
    careers_url: 'https://www.rockstargames.com/careers',
    register_hint: 'Rockstar Games UK',
    industry_gap: 'Media / Gaming',
  },
  {
    trading_name: 'Nestlé UK',
    company_sector: 'Retail & Hospitality',
    careers_url: 'https://www.nestle.co.uk/en-gb/jobs',
    register_hint: 'Nestle UK Limited',
    industry_gap: 'Food / FMCG',
  },
  {
    trading_name: 'Barchester Healthcare',
    company_sector: 'Healthcare & Social Care',
    careers_url: 'https://www.barchester.com/careers',
    register_hint: 'Barchester Healthcare',
    industry_gap: 'Social care',
  },
  {
    trading_name: 'HC-One',
    company_sector: 'Healthcare & Social Care',
    careers_url: 'https://www.hc-one.co.uk/careers',
    register_hint: 'HC-One Limited',
    industry_gap: 'Social care',
  },
  {
    trading_name: 'Care UK',
    company_sector: 'Healthcare & Social Care',
    careers_url: 'https://www.careuk.com/careers',
    register_hint: 'Care UK',
    industry_gap: 'Social care',
  },
  {
    trading_name: 'Teach First',
    company_sector: 'Business & Strategy',
    careers_url: 'https://www.teachfirst.org.uk/careers',
    register_hint: 'Teach First',
    industry_gap: 'Education',
  },
  {
    trading_name: 'EDF Energy',
    company_sector: 'Engineering (Other)',
    careers_url: 'https://careers.edfenergy.com/',
    register_hint: 'EDF Energy Ltd',
    industry_gap: 'Energy',
  },
  {
    trading_name: 'ScottishPower',
    company_sector: 'Engineering (Other)',
    careers_url: 'https://www.scottishpower.com/pages/careers.aspx',
    register_hint: 'ScottishPower Limited',
    industry_gap: 'Energy',
  },
  {
    trading_name: 'GKN Aerospace',
    company_sector: 'Engineering (Hardware)',
    careers_url: 'https://www.gknaerospace.com/en/careers/',
    register_hint: 'GKN Aerospace Services',
    industry_gap: 'Manufacturing / Aerospace',
  },
  {
    trading_name: 'CMS',
    company_sector: 'Legal',
    careers_url: 'https://jobs.cms-lawnow.com/',
    register_hint: 'CMS Cameron Mckenna',
    industry_gap: 'Legal',
  },
];

async function loadExistingNames(): Promise<Set<string>> {
  const names = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('companies').select('id, trading_name').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data || []) names.add(String(row.trading_name || '').toLowerCase().trim());
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return names;
}

async function maxIdInRange(): Promise<number> {
  let from = 0;
  let max = ID_START - 1;
  while (true) {
    const { data, error } = await sb.from('companies').select('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const n = Number(String(row.id).trim());
      if (Number.isFinite(n) && n >= 960000 && n < 970000 && n > max) max = n;
    }
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return max;
}

async function downloadRegisterOrgs(): Promise<string[]> {
  const page = await fetch('https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers').then((r) => r.text());
  const links = [...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/g)].map((m) => m[0]);
  const csvUrl = links.find((l) => /SP_|Worker|Register/i.test(l)) || links[0];
  const csv = await fetch(csvUrl!).then((r) => r.text());
  const orgs: string[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const org = line.startsWith('"') ? (line.match(/^"([^"]*)"/)?.[1] || '') : line.split(',')[0];
    if (org.trim()) orgs.push(org.trim());
  }
  return orgs;
}

function onRegister(orgs: string[], hint: string): string | null {
  const h = hint.toUpperCase();
  const hit = orgs.find((o) => o.toUpperCase().includes(h));
  return hit || null;
}

function alreadyHave(names: Set<string>, trading: string): boolean {
  const t = trading.toLowerCase();
  if (names.has(t)) return true;
  const key = t.replace(/[^a-z0-9]+/g, ' ').trim();
  for (const n of names) {
    const nn = n.replace(/[^a-z0-9]+/g, ' ').trim();
    if (nn === key || nn.startsWith(key + ' ') || key.startsWith(nn + ' ')) return true;
    // avoid weak one-token collisions for short names like CMS / ITV / UPS / DHL
    if (key.length <= 4) {
      if (nn === key) return true;
    } else if (nn.includes(key) || key.includes(nn)) {
      if (Math.min(nn.length, key.length) >= 5) return true;
    }
  }
  return false;
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN' : 'LIVE seed Phase 4 gap companies');
  const [names, orgs] = await Promise.all([loadExistingNames(), downloadRegisterOrgs()]);
  console.log(`Existing companies: ${names.size}; register orgs: ${orgs.length}`);

  let nextId = Math.max(ID_START, (await maxIdInRange()) + 1);
  const toInsert: any[] = [];
  const skipped: any[] = [];

  for (const seed of SEEDS) {
    if (alreadyHave(names, seed.trading_name)) {
      skipped.push({ name: seed.trading_name, reason: 'already_exists' });
      continue;
    }
    const reg = onRegister(orgs, seed.register_hint);
    if (!reg) {
      skipped.push({ name: seed.trading_name, reason: 'not_on_uk_register', hint: seed.register_hint });
      // Still insert but mark licensed_sponsor false — user can fix later
    }
    const id = String(nextId++);
    toInsert.push({
      id,
      trading_name: seed.trading_name,
      careers_url: seed.careers_url,
      url: seed.careers_url,
      ats_provider: seed.ats_provider || null,
      ats_board_token: seed.ats_board_token || null,
      company_sector: seed.company_sector,
      licensed_sponsor: !!reg,
      open_to_sponsorship: 0,
      active_jobs_count: 0,
      ats_status: seed.ats_provider ? 'ok' : 'unchecked',
      ats_failure_count: 0,
      show_recently_added_badge: true,
      industry_gap: seed.industry_gap,
      register_match: reg,
    });
  }

  console.log(`Will insert: ${toInsert.length}; skipped: ${skipped.length}`);
  console.table(
    toInsert.map((r) => ({
      id: r.id,
      name: r.trading_name,
      sector: r.company_sector,
      ats: r.ats_provider || '(detect later)',
      licensed: r.licensed_sponsor,
      gap: r.industry_gap,
    })),
  );
  if (skipped.length) console.table(skipped);

  if (DRY_RUN || !toInsert.length) {
    fs.writeFileSync('tmp-phase4-seed-plan.json', JSON.stringify({ toInsert, skipped }, null, 2));
    console.log('Dry-run / nothing to insert. Plan: tmp-phase4-seed-plan.json');
    return;
  }

  const rows = toInsert.map(({ industry_gap, register_match, ...rest }) => rest);
  const { error } = await sb.from('companies').insert(rows);
  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  fs.writeFileSync('tmp-phase4-seed-result.json', JSON.stringify({ inserted: toInsert, skipped }, null, 2));
  console.log(`Inserted ${rows.length} companies. Next: run ATS detect / sync for these ids.`);
  console.log('IDs:', rows.map((r) => r.id).join(','));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
