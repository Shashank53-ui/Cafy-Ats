/**
 * Match recently imported companies (CSV IDs) against:
 *   - UK Home Office licensed sponsor register → licensed_sponsor
 *   - Ireland employment permits history → ireland_permit_employer
 *
 * Does NOT delete jobs.
 *
 * Run:
 *   npx tsx src/scripts/matchImportedCompanyLicences.ts "main compnies cafy - detailes of compnies.csv"
 * Dry:
 *   npx tsx src/scripts/matchImportedCompanyLicences.ts --dry-run "main compnies cafy - detailes of compnies.csv"
 */
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const CSV_PATH = path.resolve(
  process.cwd(),
  args[0] || 'main compnies cafy - detailes of compnies.csv'
);
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
  'FOUNDATION', 'TRUST', 'NHS',
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
    /RESTAURANT|\bT\/A\b|TAKEAWAY|CUISINE/.test(u)
  );
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
  console.log('UK register CSV:', csvUrl);
  const csv = await fetch(csvUrl).then((r) => r.text());
  const orgs: string[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const org = line.startsWith('"')
      ? line.match(/^"([^"]*)"/)?.[1] || ''
      : line.split(',')[0];
    if (org.trim()) orgs.push(org.trim());
  }
  console.log(`UK register orgs: ${orgs.length}`);
  return orgs;
}

function buildIndex(orgs: string[], filterBad = false) {
  const byNorm = new Map<string, string>();
  const byFirst = new Map<string, string[]>();
  for (const org of orgs) {
    if (filterBad && isBadUkMatch(org)) continue;
    const n = normalize(org);
    if (!byNorm.has(n)) byNorm.set(n, org);
    const first = tokens(org)[0];
    if (first && first.length >= 4) {
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first)!.push(org);
    }
  }
  return { byNorm, byFirst };
}

function matchName(
  name: string,
  index: ReturnType<typeof buildIndex>,
  opts?: { singleTokenMinLen?: number }
): string | null {
  const n = normalize(name);
  if (!n) return null;
  if (index.byNorm.has(n)) return index.byNorm.get(n)!;

  const nt = tokens(name);
  if (!nt.length) return null;
  const first = nt[0];
  if (first.length < 4) return null;
  const pool = index.byFirst.get(first) || [];

  if (nt.length === 1) {
    const minLen = opts?.singleTokenMinLen ?? 6;
    if (first.length < minLen) return null;
    const hit = pool.find((org) => {
      const ot = tokens(org);
      return (
        ot[0] === first &&
        (ot.length <= 4 || /LIMITED|LTD|PLC|UC|DAC|IRELAND|UK/i.test(org))
      );
    });
    return hit || null;
  }

  let best: { org: string; score: number } | null = null;
  for (const org of pool) {
    const ot = tokens(org);
    if (!ot.length || ot[0] !== first) continue;
    const inter = nt.filter((t) => ot.includes(t)).length;
    const score = inter / nt.length;
    if (score >= 0.75 && inter >= 2 && (!best || score > best.score)) {
      best = { org, score };
    }
  }
  return best?.org || null;
}

function loadPermitNames(): string[] {
  const raw = JSON.parse(fs.readFileSync(PERMITS_JSON, 'utf8'));
  return (raw.employers || [])
    .map((e: any) => String(e.employerName || '').trim())
    .filter(Boolean);
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(PERMITS_JSON)) {
    console.error(`Ireland permits JSON not found: ${PERMITS_JSON}`);
    process.exit(1);
  }

  console.log(DRY_RUN ? 'DRY RUN' : 'LIVE — set UK + Ireland licence flags');
  console.log('CSV:', CSV_PATH);

  const parsed = Papa.parse<Record<string, string>>(fs.readFileSync(CSV_PATH, 'utf8'), {
    header: true,
    skipEmptyLines: true,
  });
  const csvIds = [
    ...new Set(
      parsed.data
        .map((r) => String(r.id || '').trim())
        .filter((id) => id && Number.isFinite(Number(id)))
    ),
  ];
  console.log(`CSV company IDs: ${csvIds.length}`);

  // Load company rows for these IDs
  const companies: Array<{
    id: string;
    trading_name: string;
    companies_house_name: string | null;
    licensed_sponsor: unknown;
    ireland_permit_employer: unknown;
  }> = [];
  for (let i = 0; i < csvIds.length; i += 100) {
    const chunk = csvIds.slice(i, i + 100);
    const { data, error } = await sb
      .from('companies')
      .select('id, trading_name, companies_house_name, licensed_sponsor, ireland_permit_employer')
      .in('id', chunk);
    if (error) {
      const nums = chunk.map(Number);
      const retry = await sb
        .from('companies')
        .select('id, trading_name, companies_house_name, licensed_sponsor, ireland_permit_employer')
        .in('id', nums);
      if (retry.error) throw new Error(retry.error.message);
      companies.push(
        ...(retry.data || []).map((r) => ({ ...r, id: String(r.id).trim() }))
      );
    } else {
      companies.push(...(data || []).map((r) => ({ ...r, id: String(r.id).trim() })));
    }
  }
  console.log(`Loaded from DB: ${companies.length}`);

  const [ukOrgs, permitNames] = await Promise.all([
    downloadUkRegister(),
    Promise.resolve(loadPermitNames()),
  ]);
  console.log(`Ireland permit employers: ${permitNames.length}`);

  const ukIndex = buildIndex(ukOrgs, true);
  const ieIndex = buildIndex(permitNames, false);

  const ukHits: Array<{ id: string; name: string; match: string }> = [];
  const ieHits: Array<{ id: string; name: string; match: string }> = [];
  const neither: string[] = [];

  for (const c of companies) {
    const names = [c.trading_name, c.companies_house_name].filter(Boolean) as string[];
    let ukMatch: string | null = null;
    let ieMatch: string | null = null;
    for (const name of names) {
      if (!ukMatch) ukMatch = matchName(name, ukIndex, { singleTokenMinLen: 6 });
      if (!ieMatch) ieMatch = matchName(name, ieIndex, { singleTokenMinLen: 6 });
    }

    const patch: Record<string, boolean> = {};
    if (ukMatch && !isTrue(c.licensed_sponsor)) {
      patch.licensed_sponsor = true;
      ukHits.push({ id: c.id, name: c.trading_name, match: ukMatch });
    } else if (ukMatch) {
      ukHits.push({ id: c.id, name: c.trading_name, match: `${ukMatch} (already set)` });
    }

    if (ieMatch && !isTrue(c.ireland_permit_employer)) {
      patch.ireland_permit_employer = true;
      ieHits.push({ id: c.id, name: c.trading_name, match: ieMatch });
    } else if (ieMatch) {
      ieHits.push({ id: c.id, name: c.trading_name, match: `${ieMatch} (already set)` });
    }

    if (!ukMatch && !ieMatch) neither.push(`${c.id} ${c.trading_name}`);

    if (Object.keys(patch).length && !DRY_RUN) {
      let { error } = await sb.from('companies').update(patch).eq('id', c.id);
      if (error) {
        const alt: Record<string, string> = {};
        for (const [k, v] of Object.entries(patch)) alt[k] = v ? 'true' : 'false';
        ({ error } = await sb.from('companies').update(alt).eq('id', c.id));
      }
      if (error) console.error(`FAIL ${c.id} ${c.trading_name}: ${error.message}`);
    }
  }

  const ukNew = ukHits.filter((h) => !h.match.includes('already set'));
  const ieNew = ieHits.filter((h) => !h.match.includes('already set'));

  console.log('\n======== RESULTS ========');
  console.log(`UK register matches: ${ukHits.length} (new flags: ${ukNew.length})`);
  console.log(`Ireland permit matches: ${ieHits.length} (new flags: ${ieNew.length})`);
  console.log(`No UK and no Ireland match: ${neither.length}`);

  console.log('\nUK sample:');
  for (const h of ukHits.slice(0, 15)) {
    console.log(`  ${h.id} ${h.name} → ${h.match}`);
  }
  console.log('\nIreland sample:');
  for (const h of ieHits.slice(0, 15)) {
    console.log(`  ${h.id} ${h.name} → ${h.match}`);
  }
  if (neither.length) {
    console.log('\nUnmatched (first 30):');
    for (const line of neither.slice(0, 30)) console.log(`  ${line}`);
  }

  fs.writeFileSync(
    'tmp-imported-licence-match.json',
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        csvIds: csvIds.length,
        ukMatches: ukHits,
        irelandMatches: ieHits,
        unmatched: neither,
      },
      null,
      2
    )
  );
  console.log('\nWrote tmp-imported-licence-match.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
