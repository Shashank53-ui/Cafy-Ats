/**
 * Fix orphan company_ids + finish UK register / Ireland permit name matching.
 * Does NOT delete any jobs.
 *
 * Run: npx tsx src/scripts/fixOrphansAndLicensedMatching.ts
 * Dry:  npx tsx src/scripts/fixOrphansAndLicensedMatching.ts --dry-run
 */
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const IRELAND_CSV = path.resolve(process.cwd(), 'data/ireland/raw/ireland_companies.csv');
const PERMITS_JSON = path.resolve(process.cwd(), 'data/ireland/raw/ireland-employment-permits-merged.json');

function isTrue(v: unknown) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function normalize(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set([
  'LIMITED', 'LTD', 'PLC', 'LLP', 'GROUP', 'UK', 'IRELAND', 'INTERNATIONAL',
  'COMPANY', 'HOLDINGS', 'SERVICES', 'THE', 'AND', 'OF', 'INC', 'CORP',
  'TECHNOLOGY', 'TECHNOLOGIES', 'SOLUTIONS', 'UC', 'DAC', 'EUROPE',
]);

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t) && t.length > 1);
}

function isBadUkMatch(org: string): boolean {
  const u = org.toUpperCase();
  return (
    /\bNHS\b/.test(u) ||
    /FOUNDATION TRUST/.test(u) ||
    /CARE HOME/.test(u) ||
    /RESTAURANT|\bT\/A\b|TAKEAWAY|CUISINE|HEALTHCARE \(/.test(u)
  );
}

/** Extra hand aliases for remaining high-volume unlicensed brands */
const ALIASES: Record<string, string[]> = {
  aecom: ['AECOM LIMITED'],
  pulse: ['PULSE HEALTHCARE LIMITED'],
  mmc: ['MARSH LIMITED', 'MERCER LIMITED', 'GUY CARPENTER & COMPANY LIMITED'],
  citibank: ['CITIBANK INTERNATIONAL LIMITED', 'CITIGROUP', 'CITI GROUP'],
  'primark limited': ['PRIMARK STORES LIMITED', 'ASSOCIATED BRITISH FOODS PLC'],
  primark: ['PRIMARK STORES LIMITED', 'ASSOCIATED BRITISH FOODS PLC'],
  icon: ['ICON CLINICAL RESEARCH (U.K.) LIMITED', 'ICON CLINICAL (UK) LIMITED'],
  sgs: ['SGS UNITED KINGDOM LIMITED', 'SGS UNITED KINGDOM LTD'],
  rlb: ['RIDER LEVETT BUCKNALL UK LIMITED'],
  'lexisnexis® risk solutions': ['LEXISNEXIS RISK SOLUTIONS UK LIMITED', 'RELX (UK) LIMITED'],
  'lexisnexis risk solutions': ['LEXISNEXIS RISK SOLUTIONS UK LIMITED', 'RELX (UK) LIMITED'],
  stryker: ['STRYKER UK LIMITED'],
  'jensen hughes': ['JENSEN HUGHES UK LIMITED', 'JENSEN HUGHES'],
  'ogilvy mather group ltd': ['OGILVY & MATHER GROUP (HOLDINGS) LIMITED', 'OGILVY'],
  securitas: ['SECURITAS SECURITY SERVICES LTD', 'SECURITAS'],
  mastercard: ['MASTERCARD UK MANAGEMENT SERVICES LTD', 'MASTERCARD'],
  'johnson controls': ['JOHNSON CONTROLS', 'JOHNSON CONTROLS BUILDING EFFICIENCY'],
  'johnson & johnson': ['JANSSEN-CILAG LIMITED', 'JOHNSON AND JOHNSON'],
  'version 1': ['VERSION 1'],
  'apex group': ['APEX GROUP'],
  'dept digital limited': ['DEPT AGENCY UK LIMITED', 'DEPT'],
  alphasense: ['ALPHASENSE TECHNOLOGY LIMITED', 'ALPHASENSE'],
  'winthrop technologies': ['WINTHROP'],
  laundryheap: ['LAUNDRYHEAP'],
  rituals1: ['RITUALS'],
  careersdeltacapita: ['DELTA CAPITA'],
  elevenlabs: ['ELEVEN LABS', 'ELEVENLABS'],
  interpath: ['INTERPATH LIMITED'],
  interpathadvisory: ['INTERPATH LIMITED'],
  'interpath advisory': ['INTERPATH LIMITED'],
  hmgroup: ['H AND M HENNES', 'H & M HENNES'],
  necsws: ['NEC SOFTWARE SOLUTIONS UK LIMITED', 'NEC EUROPE LTD'],
  veoliaenvironnementsa: ['VEOLIA ES (UK) LTD', 'VEOLIA'],
  teneo: ['TENEO BUSINESS CONSULTING LTD'],
  cfgi: ['CFGI (UK) LIMITED'],
  'fanatics betting & gaming': ['FANATICS INTERNATIONAL LIMITED'],
  'pa consulting': ['PA HOLDINGS LIMITED', 'PA CONSULTING'],
  dckgroup: ['DCK'],
  'job bridge global': ['JOB BRIDGE'],
  'radius limited': ['RADIUS PAYMENT SOLUTIONS', 'RADIUS LIMITED'],
  'kanadeviainova': ['KANA'],
  heidi: ['HEIDI'],
  tether: ['TETHER'],
  gearup2success: ['GEAR UP'],
  'aureol global connections': ['AUREOL'],
  josephsearchhospitalitylimited: ['JOSEPH'],
  icdsconstruction: ['ICDS'],
  valsoft: ['VALSOFT'],
  'valsoft corporation': ['VALSOFT'],
  'trinny london': ['TRINNY'],
  ayvens: ['ALD AUTOMOTIVE LIMITED', 'ALD AUTOMOTIVE'],
};

async function pageAll<T extends Record<string, any>>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function downloadUkRegister(): Promise<string[]> {
  const page = await fetch('https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers').then((r) => r.text());
  const links = [...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/g)].map((m) => m[0]);
  const csvUrl = links.find((l) => /SP_|Worker|Register/i.test(l)) || links[0];
  if (!csvUrl) throw new Error('UK register CSV not found');
  console.log('UK register CSV:', csvUrl);
  const csv = await fetch(csvUrl).then((r) => r.text());
  const orgs: string[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const org = line.startsWith('"') ? (line.match(/^"([^"]*)"/)?.[1] || '') : line.split(',')[0];
    if (org.trim()) orgs.push(org.trim());
  }
  return orgs;
}

function buildUkIndex(orgs: string[]) {
  const byNorm = new Map<string, string>();
  const byFirst = new Map<string, string[]>();
  for (const org of orgs) {
    if (isBadUkMatch(org)) continue;
    const n = normalize(org);
    if (!byNorm.has(n)) byNorm.set(n, org);
    const first = tokens(org)[0];
    if (first && first.length >= 4) {
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first)!.push(org);
    }
  }
  return { byNorm, byFirst, orgs };
}

function matchUkRegister(name: string, index: ReturnType<typeof buildUkIndex>): string | null {
  const key = name.toLowerCase().trim();
  const aliases = ALIASES[key];

  const tryNeedles = (needles: string[]) => {
    for (const needle of needles) {
      const a = needle.toUpperCase();
      const first = tokens(needle)[0];
      const pool = (first && index.byFirst.get(first)) || [];
      for (const org of pool) {
        const u = org.toUpperCase();
        if (u === a || u.startsWith(a)) return org;
      }
      // fallback exact norm
      const nn = normalize(needle);
      if (index.byNorm.has(nn)) return index.byNorm.get(nn)!;
    }
    for (const needle of needles) {
      const a = needle.toUpperCase();
      if (a.length < 8) continue;
      const first = tokens(needle)[0];
      const pool = (first && index.byFirst.get(first)) || [];
      for (const org of pool) {
        if (org.toUpperCase().includes(a)) return org;
      }
    }
    return null;
  };

  if (aliases) {
    const hit = tryNeedles(aliases);
    if (hit) return hit;
  }

  const n = normalize(name);
  if (index.byNorm.has(n)) return index.byNorm.get(n)!;

  const nt = tokens(name);
  if (nt.length >= 2 && nt[0].length >= 4) {
    const pool = index.byFirst.get(nt[0]) || [];
    let best: { o: string; score: number } | null = null;
    for (const o of pool) {
      const ot = tokens(o);
      if (ot[0] !== nt[0]) continue;
      const inter = nt.filter((t) => ot.includes(t)).length;
      const score = inter / nt.length;
      if (score >= 0.75 && inter >= 2 && (!best || score > best.score)) best = { o, score };
    }
    if (best) return best.o;
  }
  return null;
}

function loadIrelandCsv(): Map<string, { trading_name: string; ats_provider: string; ats_board_token: string; careers_url: string | null }> {
  const rows = parse(fs.readFileSync(IRELAND_CSV, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];
  const map = new Map<string, any>();
  for (const r of rows) {
    const id = String(r['Company ID'] || '').trim();
    if (!id) continue;
    map.set(id, {
      trading_name: String(r['Company Name'] || '').trim(),
      ats_provider: String(r['ATS Provider'] || '').trim().toLowerCase() || null,
      ats_board_token: String(r['ATS Board Token'] || '').trim() || null,
      careers_url: String(r.URL || '').trim() || null,
    });
  }
  return map;
}

function loadPermitIndex(): {
  byNorm: Map<string, string>;
  byFirstToken: Map<string, string[]>;
} {
  const raw = JSON.parse(fs.readFileSync(PERMITS_JSON, 'utf8'));
  const employers: string[] = (raw.employers || []).map((e: any) => String(e.employerName || '').trim()).filter(Boolean);
  const byNorm = new Map<string, string>();
  const byFirstToken = new Map<string, string[]>();
  for (const name of employers) {
    const n = normalize(name);
    if (!byNorm.has(n)) byNorm.set(n, name);
    const first = tokens(name)[0];
    if (!first || first.length < 4) continue;
    if (!byFirstToken.has(first)) byFirstToken.set(first, []);
    byFirstToken.get(first)!.push(name);
  }
  return { byNorm, byFirstToken };
}

function matchIrelandPermit(name: string, index: ReturnType<typeof loadPermitIndex>): string | null {
  const n = normalize(name);
  if (index.byNorm.has(n)) return index.byNorm.get(n)!;

  const nt = tokens(name);
  if (!nt.length) return null;
  const first = nt[0];
  if (first.length < 4) return null;

  const pool = index.byFirstToken.get(first) || [];
  if (nt.length === 1) {
    if (first.length >= 6) {
      // Prefer exact brand-leading legal entity, avoid tiny restaurants
      const hit = pool.find((emp) => {
        const ot = tokens(emp);
        return ot[0] === first && (ot.length <= 4 || /LIMITED|LTD|PLC|UC|DAC|IRELAND/i.test(emp));
      });
      return hit || null;
    }
    return null;
  }

  let best: { name: string; score: number } | null = null;
  for (const emp of pool) {
    const ot = tokens(emp);
    if (!ot.length || ot[0] !== first) continue;
    const inter = nt.filter((t) => ot.includes(t)).length;
    const score = inter / nt.length;
    if (score >= 0.7 && inter >= 2 && (!best || score > best.score)) best = { name: emp, score };
  }
  return best?.name || null;
}

async function setFlag(id: any, patch: Record<string, any>) {
  if (DRY_RUN) return { error: null };
  let { error } = await sb.from('companies').update(patch).eq('id', id);
  if (error) {
    // retry string booleans
    const alt = { ...patch };
    for (const k of Object.keys(alt)) {
      if (alt[k] === true) alt[k] = 'true';
      if (alt[k] === false) alt[k] = 'false';
    }
    ({ error } = await sb.from('companies').update(alt).eq('id', id));
  }
  return { error };
}

async function countJobs(table: 'jobs' | 'jobs_IR', ids: string[]) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const r = await sb.from(table).select('id', { count: 'exact', head: true }).in('company_id', chunk);
    if (!r.error) {
      n += r.count || 0;
      continue;
    }
    const nums = chunk.map(Number).filter(Number.isFinite);
    if (nums.length) {
      const r2 = await sb.from(table).select('id', { count: 'exact', head: true }).in('company_id', nums);
      n += r2.count || 0;
    }
  }
  return n;
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN' : 'LIVE — restoring orphans + matching flags (no job deletes)');

  const [companies, ukJobs, irJobs, ukOrgs] = await Promise.all([
    pageAll<{ id: any; trading_name: string; licensed_sponsor: any; ireland_permit_employer: any }>(
      'companies',
      'id, trading_name, licensed_sponsor, ireland_permit_employer',
    ),
    pageAll<{ company_id: any }>('jobs', 'company_id'),
    pageAll<{ company_id: any }>('jobs_IR', 'company_id'),
    downloadUkRegister(),
  ]);

  const permitIndex = loadPermitIndex();
  const irelandCsv = loadIrelandCsv();
  const ukIndex = buildUkIndex(ukOrgs);

  const companyByTrim = new Map<string, (typeof companies)[0]>();
  for (const c of companies) companyByTrim.set(String(c.id).trim(), c);

  const jobCountUK = new Map<string, number>();
  for (const j of ukJobs) {
    const id = String(j.company_id).trim();
    jobCountUK.set(id, (jobCountUK.get(id) || 0) + 1);
  }
  const jobCountIR = new Map<string, number>();
  for (const j of irJobs) {
    const id = String(j.company_id).trim();
    jobCountIR.set(id, (jobCountIR.get(id) || 0) + 1);
  }

  const allJobIds = new Set([...jobCountUK.keys(), ...jobCountIR.keys()]);
  const orphanIds = [...allJobIds].filter((id) => !companyByTrim.has(id));
  orphanIds.sort((a, b) => (jobCountUK.get(b) || 0) + (jobCountIR.get(b) || 0) - ((jobCountUK.get(a) || 0) + (jobCountIR.get(a) || 0)));

  console.log(`Companies: ${companies.length}`);
  console.log(`UK register orgs: ${ukOrgs.length}`);
  console.log(`Ireland permit employers: ${permitIndex.byNorm.size}`);
  console.log(`Orphan company_ids: ${orphanIds.length}`);

  const restored: any[] = [];
  const restoreFailed: any[] = [];

  for (const oid of orphanIds) {
    const csv = irelandCsv.get(oid);
    const trading_name = csv?.trading_name || `Restored company ${oid}`;
    const ukHit = matchUkRegister(trading_name, ukIndex);
    const ieHit = matchIrelandPermit(trading_name, permitIndex);

    const row: Record<string, any> = {
      id: oid,
      trading_name,
      ats_provider: csv?.ats_provider || null,
      ats_board_token: csv?.ats_board_token || null,
      careers_url: csv?.careers_url || null,
      url: csv?.careers_url || null,
      licensed_sponsor: !!ukHit,
      ireland_permit_employer: !!ieHit,
      open_to_sponsorship: 0,
      active_jobs_count: 0,
      ats_status: csv ? 'ok' : 'orphan_restored',
      ats_failure_count: 0,
      show_recently_added_badge: false,
      sync_market: oid.startsWith('900') ? 'ireland' : null,
    };

    if (DRY_RUN) {
      restored.push({
        id: oid,
        trading_name,
        uk_jobs: jobCountUK.get(oid) || 0,
        ir_jobs: jobCountIR.get(oid) || 0,
        ukHit,
        ieHit,
        status: 'would_insert',
      });
      continue;
    }

    let { error } = await sb.from('companies').insert(row);
    if (error && /sync_market/i.test(error.message)) {
      const { sync_market, ...rest } = row;
      ({ error } = await sb.from('companies').insert(rest));
    }
    if (error && /ireland_permit_employer/i.test(error.message)) {
      const { ireland_permit_employer, ...rest } = row;
      ({ error } = await sb.from('companies').insert(rest));
      if (!error && ieHit) await setFlag(oid, { ireland_permit_employer: true });
    }
    if (error) {
      restoreFailed.push({ id: oid, trading_name, error: error.message });
    } else {
      restored.push({
        id: oid,
        trading_name,
        uk_jobs: jobCountUK.get(oid) || 0,
        ir_jobs: jobCountIR.get(oid) || 0,
        ukHit,
        ieHit,
        status: 'inserted',
      });
      companyByTrim.set(oid, {
        id: oid,
        trading_name,
        licensed_sponsor: !!ukHit,
        ireland_permit_employer: !!ieHit,
      } as any);
    }
  }

  // Reload companies after restores
  const companies2 = DRY_RUN
    ? [
        ...companies,
        ...restored.map((r) => ({
          id: r.id,
          trading_name: r.trading_name,
          licensed_sponsor: !!r.ukHit,
          ireland_permit_employer: !!r.ieHit,
        })),
      ]
    : await pageAll<any>('companies', 'id, trading_name, licensed_sponsor, ireland_permit_employer');

  const ukFlips: any[] = [];
  const ieFlips: any[] = [];
  const ukFail: any[] = [];
  const ieFail: any[] = [];

  for (const c of companies2) {
    const name = String(c.trading_name || '').trim();
    if (!name) continue;

    if (!isTrue(c.licensed_sponsor)) {
      const hit = matchUkRegister(name, ukIndex);
      if (hit) {
        const { error } = await setFlag(c.id, { licensed_sponsor: true });
        if (error) ukFail.push({ id: c.id, name, error: error.message, hit });
        else {
          ukFlips.push({ id: String(c.id).trim(), name, hit });
          c.licensed_sponsor = true;
        }
      }
    }

    if (!isTrue(c.ireland_permit_employer)) {
      const hit = matchIrelandPermit(name, permitIndex);
      if (hit) {
        const { error } = await setFlag(c.id, { ireland_permit_employer: true });
        if (error) ieFail.push({ id: c.id, name, error: error.message, hit });
        else {
          ieFlips.push({ id: String(c.id).trim(), name, hit });
          c.ireland_permit_employer = true;
        }
      }
    }
  }

  const ukYes = companies2.filter((c) => isTrue(c.licensed_sponsor)).map((c) => String(c.id).trim());
  const ieYes = companies2.filter((c) => isTrue(c.ireland_permit_employer)).map((c) => String(c.id).trim());
  const companyIds = new Set(companies2.map((c) => String(c.id).trim()));

  const { count: totalUK } = await sb.from('jobs').select('id', { count: 'exact', head: true });
  const { count: totalIR } = await sb.from('jobs_IR').select('id', { count: 'exact', head: true });
  const keepUK = await countJobs('jobs', ukYes);
  const keepIR = await countJobs('jobs_IR', ieYes);

  let orphanUK = 0;
  for (const [id, n] of jobCountUK) if (!companyIds.has(id)) orphanUK += n;
  let orphanIR = 0;
  for (const [id, n] of jobCountIR) if (!companyIds.has(id)) orphanIR += n;

  // Remaining unlicensed with company present
  const remainingUK: any[] = [];
  for (const [id, n] of jobCountUK) {
    if (n <= 0) continue;
    const c = companies2.find((x) => String(x.id).trim() === id);
    if (!c) continue;
    if (!isTrue(c.licensed_sponsor)) remainingUK.push({ id, name: c.trading_name, jobs: n });
  }
  remainingUK.sort((a, b) => b.jobs - a.jobs);

  const remainingIR: any[] = [];
  for (const [id, n] of jobCountIR) {
    if (n <= 0) continue;
    const c = companies2.find((x) => String(x.id).trim() === id);
    if (!c) continue;
    if (!isTrue(c.ireland_permit_employer)) remainingIR.push({ id, name: c.trading_name, jobs: n });
  }
  remainingIR.sort((a, b) => b.jobs - a.jobs);

  const report = {
    dry_run: DRY_RUN,
    orphans_restored: restored.length,
    orphan_restore_failures: restoreFailed,
    sample_restored: restored.slice(0, 30),
    uk_licensed_flips: ukFlips.length,
    ireland_permit_flips: ieFlips.length,
    sample_uk_flips: ukFlips.slice(0, 40),
    sample_ie_flips: ieFlips.slice(0, 40),
    uk_flip_failures: ukFail.slice(0, 20),
    ie_flip_failures: ieFail.slice(0, 20),
    after: {
      total_UK_jobs: totalUK,
      uk_licensed_jobs: keepUK,
      uk_unlicensed_jobs: (totalUK || 0) - keepUK,
      uk_orphan_jobs_remaining: orphanUK,
      total_IR_jobs: totalIR,
      ireland_permit_jobs: keepIR,
      ireland_jobs_without_permit_flag: (totalIR || 0) - keepIR,
      ireland_orphan_jobs_remaining: orphanIR,
      combined_unlicensed_style: (totalUK || 0) - keepUK + ((totalIR || 0) - keepIR),
      licensed_companies: ukYes.length,
      ireland_permit_companies: ieYes.length,
      note: 'No jobs deleted. Orphans re-inserted from ireland_companies.csv where possible; UK flags from Home Office register; IR flags from employment-permits list.',
    },
    top_remaining_uk_unlicensed: remainingUK.slice(0, 25),
    top_remaining_ir_without_permit: remainingIR.slice(0, 25),
  };

  const out = path.resolve(process.cwd(), 'tmp-orphan-licensed-fix-report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.after, null, 2));
  console.log(`Restored orphans: ${restored.length} (failures: ${restoreFailed.length})`);
  console.log(`UK licensed flips: ${ukFlips.length}`);
  console.log(`Ireland permit flips: ${ieFlips.length}`);
  console.log('Report:', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
