/**
 * Update companies.licensed_sponsor from the official Home Office register.
 * Does NOT delete any jobs.
 *
 * Run: npx tsx src/scripts/updateLicensedSponsorsFromRegister.ts
 * Dry:  npx tsx src/scripts/updateLicensedSponsorsFromRegister.ts --dry-run
 */
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function isTrue(v: unknown): boolean {
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
  'TECHNOLOGY', 'TECHNOLOGIES', 'SOLUTIONS', 'FOUNDATION', 'TRUST', 'NHS',
  'ALLIANCE', 'CARE',
]);

function isBadMatch(org: string): boolean {
  const u = org.toUpperCase();
  return (
    /\bNHS\b/.test(u) ||
    /FOUNDATION TRUST/.test(u) ||
    /CARE HOME/.test(u) ||
    /RESTAURANT|\bT\/A\b|TAKEAWAY|CUISINE/.test(u)
  );
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t) && t.length > 1);
}

/** Hand-verified aliases: our trading_name -> register organisation name substring/exact */
const ALIASES: Record<string, string[]> = {
  nandos: ["NANDO'S LTD", 'NANDOS LTD', "NANDO'S LIMITED"],
  accorhotel: ['ACCOR UK LIMITED', 'ACCOR UK LTD'],
  portmandentex: ['PORTMAN HEALTHCARE LIMITED', 'PORTMAN HEALTHCARE'],
  frasersgroup: ['FRASERS GROUP PLC', 'FRASERS GROUP'],
  socotecukireland: ['SOCOTEC UK LIMITED'],
  entain: ['ENTAIN MARKETING (UK) LIMITED', 'ENTAIN'],
  'rentokil initial  group': ['RENTOKIL INITIAL UK LIMITED', 'RENTOKIL INITIAL 1927 PLC'],
  'rentokil initial group': ['RENTOKIL INITIAL UK LIMITED', 'RENTOKIL INITIAL 1927 PLC'],
  sumup: ['SUMUP PAYMENTS LIMITED'],
  ipsen: ['IPSEN BIOPHARM LIMITED', 'IPSEN'],
  eurofins: ['EUROFINS'],
  'kurt geiger': ['KURT GEIGER LIMITED'],
  'state street international': ['STATE STREET BANK AND TRUST COMPANY', 'STATE STREET'],
  junioradventuresgroup: ['JUNIOR ADVENTURES GROUP UK LTD', 'JUNIOR ADVENTURES GROUP'],
  itxuklimited: ['ITX UK LIMITED'],
  securitas: ['SECURITAS'],
  novartis: ['NOVARTIS PHARMACEUTICALS UK LTD', 'NOVARTIS'],
  marex: ['MAREX GROUP PLC', 'MAREX'],
  'ss&c technologies': ['SS&C SOLUTIONS LIMITED', 'SS&C FINANCIAL SERVICES INTERNATIONAL LIMITED'],
  'stripe technology company limited': ['STRIPE PAYMENTS UK LTD', 'STRIPE'],
  'evelyn partners': ['EVELYN PARTNERS GROUP LIMITED'],
  'indra group uk & ireland': ['INDRA SISTEMAS S.A.', 'INDRA SISTEMAS'],
  'pa consulting': ['PA HOLDINGS LIMITED', 'PA CONSULTING'],
  'pa consulting services limited': ['PA HOLDINGS LIMITED', 'PA CONSULTING'],
  'northern trust corp.': ['NORTHERN TRUST', 'NORTHERN TRUST MANAGEMENT SERVICES LIMITED'],
  'northern trust corp': ['NORTHERN TRUST', 'NORTHERN TRUST MANAGEMENT SERVICES LIMITED'],
  'northern trust': ['NORTHERN TRUST'],
  'guidewire software': ['GUIDEWIRE SOFTWARE (UK) LIMITED', 'GUIDEWIRE SOFTWARE'],
  linkedin: ['LINKEDIN TECHNOLOGY UK LIMITED', 'LINKEDIN'],
  'henry schein ireland': ['HENRY SCHEIN', 'HENRY SCHEIN ONE UK LIMITED'],
  broadcom: ['BROADCOM EUROPE LIMITED', 'BROADCOM'],
  monzo: ['MONZO BANK LTD', 'MONZO'],
  boeing: ['BOEING DEFENCE UK LIMITED', 'BOEING'],
  mastercard: ['MASTERCARD UK MANAGEMENT SERVICES LTD', 'MASTERCARD'],
  flipdish: ['FLIPDISH UK LIMITED', 'FLIPDISH'],
  expeditors: ['EXPEDITORS INTERNATIONAL UK LTD', 'EXPEDITORS'],
  'squarespace ireland limited': ['SQUARESPACE UK LIMITED', 'SQUARESPACE'],
  'avery dennison': ['AVERY DENNISON MATERIALS UK LIMITED', 'AVERY DENNISON'],
  solarwinds: ['SOLARWINDS SOFTWARE UK LIMITED', 'SOLARWINDS'],
  stepstone: ['STEPSTONE GROUP EUROPE LLP', 'STEPSTONE'],
  icims: ['ICIMS INTERNATIONAL LLC', 'ICIMS'],
  waystone: ['WAYSTONE COMPLIANCE SOLUTIONS (UK) LTD', 'WAYSTONE'],
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
  securitas: ['SECURITAS SECURITY SERVICES LTD', 'SECURITAS'],
  'johnson controls': ['JOHNSON CONTROLS'],
  'version 1': ['VERSION 1'],
  'apex group': ['APEX GROUP'],
  alphasense: ['ALPHASENSE TECHNOLOGY LIMITED', 'ALPHASENSE'],
  careersdeltacapita: ['DELTA CAPITA'],
  'interpath advisory': ['INTERPATH LIMITED'],
  hmgroup: ['H AND M HENNES', 'H & M HENNES'],
  necsws: ['NEC SOFTWARE SOLUTIONS UK LIMITED', 'NEC EUROPE LTD'],
  veoliaenvironnementsa: ['VEOLIA ES (UK) LTD', 'VEOLIA'],
  teneo: ['TENEO BUSINESS CONSULTING LTD'],
  cfgi: ['CFGI (UK) LIMITED'],
  'fanatics betting & gaming': ['FANATICS INTERNATIONAL LIMITED'],
};

async function downloadRegister(): Promise<string[]> {
  const page = await fetch('https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers').then((r) =>
    r.text(),
  );
  const links = [...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/g)].map((m) => m[0]);
  const csvUrl =
    links.find((l) => /Worker|Register|SP_/i.test(l)) || links[0];
  if (!csvUrl) throw new Error('Could not find sponsor register CSV on GOV.UK');
  console.log('Downloading register:', csvUrl);
  const csv = await fetch(csvUrl).then((r) => r.text());
  const orgs: string[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    let org = '';
    if (line.startsWith('"')) {
      const m = line.match(/^"([^"]*)"/);
      org = m ? m[1] : line.split(',')[0];
    } else {
      org = line.split(',')[0];
    }
    if (org.trim()) orgs.push(org.trim());
  }
  console.log(`Register orgs loaded: ${orgs.length}`);
  return orgs;
}

function buildIndex(orgs: string[]) {
  const byNorm = new Map<string, string[]>();
  const byFirstToken = new Map<string, string[]>();
  for (const org of orgs) {
    const n = normalize(org);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n)!.push(org);
    const toks = tokens(org);
    if (toks[0] && toks[0].length >= 4) {
      if (!byFirstToken.has(toks[0])) byFirstToken.set(toks[0], []);
      byFirstToken.get(toks[0])!.push(org);
    }
  }
  return { byNorm, byFirstToken, orgs };
}

function aliasMatch(name: string, orgs: string[]): string | null {
  const key = name.toLowerCase().trim();
  const aliases = ALIASES[key];
  if (!aliases) return null;
  const upperOrgs = orgs.map((o) => ({ u: o.toUpperCase(), o }));
  for (const alias of aliases) {
    const a = alias.toUpperCase();
    for (const { u, o } of upperOrgs) {
      if (isBadMatch(o)) continue;
      if (u === a || u.startsWith(a)) return o;
    }
  }
  for (const alias of aliases) {
    const a = alias.toUpperCase();
    if (a.length < 8) continue;
    for (const { u, o } of upperOrgs) {
      if (isBadMatch(o)) continue;
      if (u.includes(a)) return o;
    }
  }
  for (const alias of aliases) {
    const first = tokens(alias)[0];
    if (!first || first.length < 5) continue;
    for (const org of orgs) {
      if (isBadMatch(org)) continue;
      const ot = tokens(org);
      if (ot[0] === first) return org;
    }
  }
  return null;
}

function strictMatch(
  name: string,
  houseName: string | null,
  index: ReturnType<typeof buildIndex>,
): { org: string; method: string } | null {
  const candidates = [name, houseName].filter(Boolean) as string[];
  for (const c of candidates) {
    const hit = aliasMatch(c, index.orgs);
    if (hit) return { org: hit, method: 'alias' };
  }

  for (const c of candidates) {
    const n = normalize(c);
    if (index.byNorm.has(n)) return { org: index.byNorm.get(n)![0], method: 'exact_norm' };
  }

  // Multi-token names only — single brand tokens ("Simon", "Notion", "GoTo")
  // cause too many false positives against unrelated register orgs.
  for (const c of candidates) {
    const nt = tokens(c);
    if (nt.length < 2) continue;
    const first = nt[0];
    if (first.length < 4) continue;
    const pool = index.byFirstToken.get(first) || [];
    let best: { org: string; score: number } | null = null;
    for (const org of pool) {
      if (isBadMatch(org)) continue;
      const ot = tokens(org);
      if (ot[0] !== first) continue; // brand must lead the legal name
      const inter = new Set(nt.filter((t) => ot.includes(t)));
      const score = inter.size / nt.length;
      if (score < 0.75) continue;
      if (inter.size < 2) continue;
      if (!best || score > best.score) best = { org, score };
    }
    if (best) return { org: best.org, method: `token_${best.score.toFixed(2)}` };
  }

  return null;
}

async function allCompanies() {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('companies')
      .select('id, trading_name, companies_house_name, licensed_sponsor, ireland_permit_employer')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return rows.map((r) => ({
    ...r,
    id: String(r.id).trim(),
  }));
}

async function countJobs(table: 'jobs' | 'jobs_IR', ids: string[]) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true }).in('company_id', chunk);
    if (error) {
      const nums = chunk.map(Number).filter(Number.isFinite);
      const r = await sb.from(table).select('id', { count: 'exact', head: true }).in('company_id', nums);
      if (r.error) throw new Error(r.error.message);
      n += r.count || 0;
    } else n += count || 0;
  }
  return n;
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — no DB writes' : 'LIVE UPDATE — will set licensed_sponsor=true for matches');
  const orgs = await downloadRegister();
  const index = buildIndex(orgs);
  const companies = await allCompanies();

  const needsFix = companies.filter((c) => !isTrue(c.licensed_sponsor));
  console.log(`Companies not marked UK licensed: ${needsFix.length}`);

  const toUpdate: Array<{ id: string; trading_name: string; match: string; method: string; before: any }> = [];
  for (const c of needsFix) {
    const m = strictMatch(c.trading_name, c.companies_house_name, index);
    if (!m) continue;
    toUpdate.push({
      id: String(c.id).trim(),
      trading_name: c.trading_name,
      match: m.org,
      method: m.method,
      before: c.licensed_sponsor,
    });
  }

  console.log(`Matches to flip to licensed: ${toUpdate.length}`);
  console.table(toUpdate.slice(0, 40).map((r) => ({ id: r.id, name: r.trading_name, match: r.match, method: r.method })));

  let updated = 0;
  let failed = 0;
  if (!DRY_RUN) {
    for (const row of toUpdate) {
      // Live column behaves as text in API responses — write "true" for consistency
      const { error } = await sb.from('companies').update({ licensed_sponsor: true }).eq('id', row.id);
      if (error) {
        const retry = await sb.from('companies').update({ licensed_sponsor: 'true' }).eq('id', row.id);
        if (retry.error) {
          console.warn(`Failed ${row.id} ${row.trading_name}: ${retry.error.message}`);
          failed++;
          continue;
        }
      }
      updated++;
    }
  }

  // Recount after (or projected) update
  const afterCompanies = DRY_RUN
    ? companies.map((c) => {
        if (toUpdate.some((u) => u.id === String(c.id).trim())) {
          return { ...c, licensed_sponsor: true };
        }
        return c;
      })
    : await allCompanies();

  const ukYes = afterCompanies.filter((c) => isTrue(c.licensed_sponsor));
  const ukNo = afterCompanies.filter((c) => !isTrue(c.licensed_sponsor));
  const ieYes = afterCompanies.filter((c) => isTrue(c.ireland_permit_employer));
  const ieNo = afterCompanies.filter((c) => !isTrue(c.ireland_permit_employer));

  const { count: totalUK } = await sb.from('jobs').select('id', { count: 'exact', head: true });
  const { count: totalIR } = await sb.from('jobs_IR').select('id', { count: 'exact', head: true });

  const keepUK = await countJobs('jobs', ukYes.map((c) => String(c.id).trim()));
  const keepIR = await countJobs('jobs_IR', ieYes.map((c) => String(c.id).trim()));

  // Unlicensed = total - keep (includes orphans with no company / unmatched)
  const unlicensedUK = (totalUK || 0) - keepUK;
  const unlicensedIR = (totalIR || 0) - keepIR;

  const report = {
    dry_run: DRY_RUN,
    register_orgs: orgs.length,
    companies_flipped_to_licensed: DRY_RUN ? toUpdate.length : updated,
    update_failures: failed,
    sample_flips: toUpdate.slice(0, 50),
    after: {
      total_UK_jobs: totalUK,
      uk_licensed_jobs: keepUK,
      uk_unlicensed_jobs: unlicensedUK,
      total_IR_jobs: totalIR,
      ireland_permit_jobs: keepIR,
      ireland_without_permit_flag_jobs: unlicensedIR,
      note_ireland:
        'Ireland has no Home Office-style licence register; ireland_permit_employer is permit-history based and was not bulk-changed from the UK CSV.',
    },
  };

  const outPath = path.resolve(process.cwd(), 'tmp-licensed-update-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.after, null, 2));
  console.log(`\nFlipped companies: ${report.companies_flipped_to_licensed}`);
  console.log(`UK unlicensed jobs remaining: ${unlicensedUK}`);
  console.log(`IR jobs without ireland_permit_employer: ${unlicensedIR}`);
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
