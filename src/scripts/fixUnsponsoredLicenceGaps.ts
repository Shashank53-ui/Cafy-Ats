/**
 * Rematch companies with neither licence flag against UK register + Ireland
 * permits using brand→legal aliases and common legal-name patterns.
 *
 * Does NOT delete jobs. Only sets licensed_sponsor / ireland_permit_employer.
 *
 *   npx tsx src/scripts/fixUnsponsoredLicenceGaps.ts --dry-run
 *   npx tsx src/scripts/fixUnsponsoredLicenceGaps.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const OUT = path.resolve(process.cwd(), 'tmp-unsponsored-gap-fix.json');
const PERMITS_JSON = path.resolve(
  process.cwd(),
  'data/ireland/raw/ireland-employment-permits-merged.json'
);

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

function isBadMatch(org: string): boolean {
  const u = org.toUpperCase();
  return (
    /\bNHS\b/.test(u) ||
    /FOUNDATION TRUST/.test(u) ||
    /CARE HOME|CARE LIMITED|NURSER|NURSING HOME|COOKERY|KIDDIES/.test(u) ||
    /RESTAURANT|\bT\/A\b|TAKEAWAY|CUISINE|BAKERY|STREET FOOD/.test(u) ||
    /WINDOWS|DOORS|CARS LTD|PHARMA LTD|ENERGY ASSESSOR|CRICKET|ELECTRICAL/.test(u) ||
    /GONG CHA|ROWAN ALBA|ROWAN PHARMA|STAGE AND LIGHT|STAGE DOOR|STAGE ENTERPRISES/.test(u) ||
    /WATER PRIVATE LIMITED|CODER SPOT|ADDITIVE TECHNOLOGIES|A-PMG/.test(u) ||
    /CHI HUNG|CHI STREET|WITTY KIDDIES|ASHBY HASTINGS|PROJECT 23RD/.test(u)
  );
}

/** Reject known false-friend brand → org pairs even if fuzzy matched */
const REJECT_PAIRS: Array<{ brand: RegExp; org: RegExp }> = [
  { brand: /^ashby$/i, org: /cricket|cars|energy|signs/i },
  { brand: /^w1tty$/i, org: /kiddies|nursery|witty/i },
  { brand: /^chi$/i, org: /street food|hung nguyen|^chi /i },
  { brand: /^psl$/i, org: /people solutions/i },
  { brand: /^mako$/i, org: /derivatives|global/i },
  { brand: /^stage$/i, org: /stage/i },
  { brand: /^jwb$/i, org: /electrical/i },
  { brand: /^aios/i, org: /aios technology/i },
  { brand: /^alo$/i, org: /alo europe/i },
  { brand: /^wizinc$/i, org: /./i },
  { brand: /^ai\.io$/i, org: /./i },
  { brand: /^dublin business school$/i, org: /kaplan care/i },
  { brand: /^réalta|^realta/i, org: /alta advisers/i },
  { brand: /^apex group$/i, org: /additive/i },
  { brand: /^pmg$/i, org: /a-pmg|pmg limited/i },
  { brand: /^sona$/i, org: /asset/i },
  { brand: /^unify$/i, org: /unify brands/i },
  { brand: /^front$/i, org: /front page|inn ltd/i },
];

/** Brand trading_name (lower) → legal-name needles to look up on registers */
const ALIASES: Record<string, string[]> = {
  optum: [
    'Optum Health Solutions (UK) Limited',
    'Optum Services (Ireland) Limited',
    'Optum Health Solutions (Ireland) Limited',
  ],
  esri: ['Esri (UK) Ltd', 'ESRI (UK) LIMITED'],
  mewssystems: ['Mews Systems Limited', 'MEWS SYSTEMS LIMITED'],
  mews: ['Mews Systems Limited'],
  nisos: ['Nisos Group Limited', 'NISOS GROUP LIMITED'],
  quora: ['Quora Ireland Limited', 'QUORA IRELAND LIMITED'],
  heidi: ['Heidi Health Ltd', 'HEIDI HEALTH LTD'],
  'crowdgen by appen': ['Appen (Europe) LTD', 'APPEN (EUROPE) LTD', 'Appen Limited'],
  appen: ['Appen (Europe) LTD', 'APPEN (EUROPE) LTD'],
  cielo: ['Cielo Talent Ltd', 'CIELO TALENT LTD'],
  reiss: ['Reiss Limited', 'REISS LIMITED'],
  vald: ['Vald Operations Limited', 'VALD OPERATIONS LIMITED'],
  coder: ['Coder Technologies Inc', 'CODER TECHNOLOGIES INC'],
  'jensen hughes': ['Jensen Hughes UK Limited', 'JENSEN HUGHES UK LIMITED'],
  ayvens: ['ALD Automotive Limited', 'ALD AUTOMOTIVE LIMITED'],
  'apex group': ['Apex Fund Services (Ireland) Limited', 'APEX FUND SERVICES'],
  msd: [
    'Merck Sharp & Dohme (UK) Limited',
    'Merck Sharp & Dohme Ireland (Human Health) Limited',
  ],
  loveholidays: ['Loveholidays Limited', 'LOVEHOLIDAYS LIMITED', 'Love Holidays Limited'],
  clio: ['Themis Solutions (Ireland) Limited', 'Themis Technologies Ltd'],
  phorest: ['Phorest Software Limited', 'PHOREST LIMITED'],
  'yuno energy': ['Yuno Energy Limited', 'YUNO ENERGY LIMITED'],
  onsemi: ['ON Semiconductor Limited', 'ON SEMICONDUCTOR LIMITED'],
  sprinklr: ['Sprinklr UK Ltd', 'SPRINKLR UK LTD'],
  'ukg (ultimate kronos group)': ['UKG Technology Limited', 'UKG TECHNOLOGY LIMITED'],
  dolby: ['Dolby Europe Limited', 'Dolby International AB'],
  'u.s. bank national association': ['U.S. Bank Europe DAC', 'US BANK EUROPE DAC'],
  workhuman: ['Globoforce UK Limited', 'Globoforce Limited'],
  tines: ['Tines Security Services Limited', 'Tines Limited', 'TINES LIMITED'],
  letsgetchecked: ['LetsGetChecked Limited', 'LETSGETCHECKED LIMITED'],
  'web summit': ['Web Summit Services Ltd', 'WEB SUMMIT SERVICES LTD'],
  front: ['Front Europe Limited', 'Frontapp Ireland Limited', 'FRONTAPP IRELAND LIMITED'],
  ashby: [],
  wizinc: [],
  'match group': ['Match.com International Limited'],
  '2k games': ['Take-Two Interactive Software Europe Limited'],
  'deel it': ['Deel Ireland EOR Ltd', 'DEEL IRELAND EOR LTD'],
  'black duck software, inc.': [
    'Synopsys (Northern Europe) Ltd',
    'Synopsys International Ltd',
  ],
  ramboll3: ['Ramboll UK Limited', 'RAMBOLL UK LIMITED'],
  ramboll: ['Ramboll UK Limited', 'RAMBOLL UK LIMITED'],
  'px group': ['px Limited', 'PX LIMITED'],
  ag1: ['AG1 UK Enterprise Ltd', 'AG1 UK ENTERPRISE LTD'],
  'gp fund solutions': ['GP Fund Solutions UK Ltd', 'GP FUND SOLUTIONS UK LTD'],
  oxfam: ['Oxfam GB', 'OXFAM REPUBLIC OF IRELAND'],
  'nnit a/s': ['NNIT Ireland Ltd', 'NNIT IRELAND LTD'],
  wiz: ['Wiz Cloud Limited', 'WIZ CLOUD LIMITED'],
  edcengineering: ['EDC Engineering Design Consultants Ltd'],
};

function brandKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function pageAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function downloadUkRegister(): Promise<string[]> {
  const page = await fetch(
    'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers'
  ).then((r) => r.text());
  const links = [...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/g)].map(
    (m) => m[0]
  );
  const csvUrl = links.find((l) => /SP_|Worker|Register/i.test(l)) || links[0];
  if (!csvUrl) throw new Error('UK register CSV not found');
  console.log('UK register:', csvUrl);
  const csv = await fetch(csvUrl).then((r) => r.text());
  const orgs: string[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const org = line.startsWith('"')
      ? line.match(/^"([^"]*)"/)?.[1] || ''
      : line.split(',')[0];
    if (org.trim()) orgs.push(org.trim());
  }
  return orgs;
}

function buildIndex(orgs: string[], filterBad: boolean) {
  const byNorm = new Map<string, string>();
  const byFirst = new Map<string, string[]>();
  const allNorm: string[] = [];
  for (const org of orgs) {
    if (filterBad && isBadMatch(org)) continue;
    const n = normalize(org);
    if (!byNorm.has(n)) byNorm.set(n, org);
    allNorm.push(n);
    const first = tokens(org)[0];
    if (first && first.length >= 3) {
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first)!.push(org);
    }
  }
  return { byNorm, byFirst };
}

function findNeedle(needle: string, index: ReturnType<typeof buildIndex>): string | null {
  if (!needle.trim()) return null;
  const nn = normalize(needle);
  if (index.byNorm.has(nn)) {
    const hit = index.byNorm.get(nn)!;
    return isBadMatch(hit) ? null : hit;
  }

  const a = needle.toUpperCase();
  const first = tokens(needle)[0];
  if (!first) return null;
  const pool = index.byFirst.get(first) || [];

  // exact / starts-with on uppercased org
  for (const org of pool) {
    if (isBadMatch(org)) continue;
    const u = org.toUpperCase();
    if (u === a || u.startsWith(a + ' ') || u.startsWith(a + ',') || u === a) return org;
  }

  // contains full needle if long enough
  if (a.length >= 10) {
    for (const org of pool) {
      if (isBadMatch(org)) continue;
      if (org.toUpperCase().includes(a)) return org;
    }
  }

  // brand token(s) leading legal entity: "ESRI (UK) LTD", "OPTUM HEALTH..."
  const nt = tokens(needle);
  if (nt.length >= 1 && nt[0].length >= 4) {
    const candidates = pool.filter((org) => {
      if (isBadMatch(org)) return false;
      const ot = tokens(org);
      if (ot[0] !== nt[0]) return false;
      if (nt.length === 1) {
        // single brand: accept Brand + UK/Ireland/Limited style
        return (
          ot.length <= 5 &&
          /LIMITED|LTD|PLC|UC|DAC|UK|IRELAND|EUROPE|HEALTH|TECH|SOFTWARE|SYSTEMS|GROUP|INC/i.test(org)
        );
      }
      const inter = nt.filter((t) => ot.includes(t)).length;
      return inter >= Math.min(2, nt.length) && inter / nt.length >= 0.6;
    });
    if (candidates.length === 1) return candidates[0];
    // prefer ones containing UK / IRELAND / HEALTH / SYSTEMS
    const preferred = candidates.find((c) =>
      /UK|IRELAND|HEALTH|SYSTEMS|TECHNOLOGIES|TALENT|EUROPE/i.test(c)
    );
    if (preferred) return preferred;
    if (candidates.length > 0 && candidates.length <= 3) return candidates[0];
  }

  return null;
}

function legalVariants(brand: string): string[] {
  const clean = brand
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+by\s+.*/i, '')
    .replace(/[^A-Za-z0-9&.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 3) return [];
  return [
    clean,
    `${clean} Limited`,
    `${clean} Ltd`,
    `${clean} UK Limited`,
    `${clean} UK Ltd`,
    `${clean} (UK) Limited`,
    `${clean} (UK) Ltd`,
    `${clean} Ireland Limited`,
    `${clean} Ireland Ltd`,
  ];
}

function brandAligned(brand: string, org: string): boolean {
  const bt = tokens(brand);
  const ot = tokens(org);
  if (!bt.length || !ot.length) return false;
  // Alias-driven legal names may start with different words (Globoforce for Workhuman,
  // Themis for Clio, Synopsys for Black Duck, Take-Two for 2K, Appen for CrowdGen)
  const key = brandKey(brand);
  if (ALIASES[key]?.length) {
    // still require at least one distinctive token overlap OR alias needle substring
    for (const needle of ALIASES[key]) {
      const nt = tokens(needle);
      if (nt[0] && ot[0] === nt[0]) return true;
      if (normalize(org).includes(normalize(needle)) || normalize(needle).includes(normalize(org).slice(0, 20)))
        return true;
    }
  }
  if (bt[0].length < 4) return ot[0] === bt[0] || normalize(org).includes(bt[0]);
  return ot[0] === bt[0] || (bt.length >= 2 && bt.filter((t) => ot.includes(t)).length >= 2);
}

function rejected(brand: string, org: string): boolean {
  if (isBadMatch(org)) return true;
  if (REJECT_PAIRS.some((p) => p.brand.test(brand.trim()) && p.org.test(org))) return true;
  if (!brandAligned(brand, org) && !ALIASES[brandKey(brand)]?.length) return true;
  return false;
}

function matchCompany(
  name: string,
  ukIndex: ReturnType<typeof buildIndex>,
  ieIndex: ReturnType<typeof buildIndex>
): { uk: string | null; ie: string | null } {
  const key = brandKey(name);
  // Explicit empty alias list = do not auto-match this brand
  if (Object.prototype.hasOwnProperty.call(ALIASES, key) && ALIASES[key].length === 0) {
    return { uk: null, ie: null };
  }
  const aliasNeedles = [...(ALIASES[key] || [])];

  // parent after "by "
  const byParent = name.match(/\s+by\s+(.+)$/i)?.[1];
  if (byParent) {
    aliasNeedles.push(...(ALIASES[brandKey(byParent)] || []));
    aliasNeedles.push(...legalVariants(byParent));
  }

  // Auto legal-name variants only for distinctive multi-word / long brands
  const nt = tokens(name);
  const allowAuto =
    !ALIASES[key]?.length &&
    ((nt.length >= 2 && nt[0].length >= 4) || (nt.length === 1 && nt[0].length >= 6));
  const needles = allowAuto
    ? [...aliasNeedles, ...legalVariants(name)]
    : aliasNeedles.length
      ? aliasNeedles
      : [];

  let uk: string | null = null;
  let ie: string | null = null;
  for (const needle of needles) {
    if (!uk) {
      const hit = findNeedle(needle, ukIndex);
      if (hit && !rejected(name, hit)) uk = hit;
    }
    if (!ie) {
      const hit = findNeedle(needle, ieIndex);
      if (hit && !rejected(name, hit)) ie = hit;
    }
    if (uk && ie) break;
  }
  return { uk, ie };
}

async function setFlags(id: string, patch: Record<string, boolean>) {
  let { error } = await sb.from('companies').update(patch).eq('id', id);
  if (error) {
    const alt: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) alt[k] = v ? 'true' : 'false';
    ({ error } = await sb.from('companies').update(alt).eq('id', id));
  }
  if (error) {
    const num = Number(id);
    if (Number.isFinite(num)) {
      ({ error } = await sb.from('companies').update(patch).eq('id', num));
    }
  }
  return error;
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN' : 'LIVE — fix unsponsored licence gaps');

  const [companies, ukOrgs] = await Promise.all([
    pageAll<{
      id: any;
      trading_name: string;
      companies_house_name: string | null;
      licensed_sponsor: any;
      ireland_permit_employer: any;
    }>(
      'companies',
      'id, trading_name, companies_house_name, licensed_sponsor, ireland_permit_employer'
    ),
    downloadUkRegister(),
  ]);

  const permitRaw = JSON.parse(fs.readFileSync(PERMITS_JSON, 'utf8'));
  const permitNames = (permitRaw.employers || [])
    .map((e: any) => String(e.employerName || '').trim())
    .filter(Boolean);

  const ukIndex = buildIndex(ukOrgs, true);
  const ieIndex = buildIndex(permitNames, false);
  console.log(`UK orgs ${ukOrgs.length} | IE employers ${permitNames.length}`);

  const unsponsored = companies.filter(
    (c) => !isTrue(c.licensed_sponsor) && !isTrue(c.ireland_permit_employer)
  );
  console.log(`Unsponsored to rematch: ${unsponsored.length}`);

  const results: any[] = [];
  let ukSet = 0;
  let ieSet = 0;

  for (const c of unsponsored) {
    const id = String(c.id).trim();
    const skipBrands = /^(wizinc|ashby|ai\.io|psl|chi|alo|jwb|stage|mako|sona|unify|pmg)$/i;
    if (skipBrands.test(String(c.trading_name || '').trim())) continue;

    const names = [c.trading_name, c.companies_house_name].filter(Boolean) as string[];
    let uk: string | null = null;
    let ie: string | null = null;
    for (const n of names) {
      if (skipBrands.test(n.trim())) continue;
      const m = matchCompany(n, ukIndex, ieIndex);
      if (!uk && m.uk) uk = m.uk;
      if (!ie && m.ie) ie = m.ie;
    }

    if (!uk && !ie) continue;

    const patch: Record<string, boolean> = {};
    if (uk) {
      patch.licensed_sponsor = true;
      ukSet++;
    }
    if (ie) {
      patch.ireland_permit_employer = true;
      ieSet++;
    }

    results.push({
      id,
      name: c.trading_name,
      ukMatch: uk,
      ieMatch: ie,
      applied: patch,
    });

    console.log(
      `OK ${id} ${c.trading_name} → uk=${uk || '-'} ie=${ie || '-'}`
    );

    if (!DRY_RUN) {
      const err = await setFlags(id, patch);
      if (err) console.warn(`  DB fail ${id}: ${err.message}`);
    }
  }

  const summary = {
    dryRun: DRY_RUN,
    unsponsoredBefore: unsponsored.length,
    fixed: results.length,
    ukFlagsSet: ukSet,
    irelandFlagsSet: ieSet,
    stillUnsponsoredEstimate: unsponsored.length - results.length,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log('\n======== SUMMARY ========');
  console.log(`Fixed companies: ${results.length}`);
  console.log(`UK flags: ${ukSet} | IE flags: ${ieSet}`);
  console.log(`Still unsponsored (est.): ${summary.stillUnsponsoredEstimate}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
