/**
 * Read-only audit: location quality + broader data gaps on jobs / jobs_IR.
 * Run: npx tsx src/scripts/auditLocationQuality.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import { isUKJob } from '../lib/ukFilter';
import { isIrelandJob } from '../lib/irelandFilter';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type JobRow = {
  id: number | string;
  title: string | null;
  location: string | null;
  url: string | null;
  level: string | null;
  sector: string | null;
  department: string | null;
  company_id: number | string | null;
  last_seen_at: string | null;
  created_at?: string | null;
};

const VAGUE_RE =
  /^(remote|emea|europe|global|worldwide|multiple\s+locations?|\d+\s+locations?|various|tbd|n\/?a|not\s+specified|location\s+negotiable|homebased|home\s+office|uk|united\s+kingdom|ireland|republic\s+of\s+ireland)$/i;

const STALE_DAYS = 30;

function ukInput(location: string | null, title: string | null) {
  const raw = String(location || '').trim();
  const parts = raw
    ? raw.split(/\s*[|;/]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean)
    : [];
  return {
    locations: parts.length ? parts : raw ? [raw] : [],
    isRemote: /\bremote\b/i.test(raw),
    isTrustedSource: false,
  };
}

function bucketKey(loc: string | null): string {
  const t = String(loc || '').trim();
  if (!t) return '(empty)';
  if (t.length > 80) return t.slice(0, 77) + '...';
  return t;
}

async function fetchAll(table: 'jobs' | 'jobs_IR'): Promise<JobRow[]> {
  const rows: JobRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from(table)
      .select('id, title, location, url, level, sector, department, company_id, last_seen_at, created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as JobRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function topN(map: Map<string, number>, n: number) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function pct(n: number, total: number) {
  if (!total) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

function auditUK(rows: JobRow[]) {
  const failFilter: JobRow[] = [];
  const emptyLoc: JobRow[] = [];
  const vagueOnly: JobRow[] = [];
  const dublinRoiLike: JobRow[] = []; // Dublin/Ireland without Northern Ireland / UK
  const emeaGlobal: JobRow[] = [];
  const multiPipe: JobRow[] = [];
  const locCounts = new Map<string, number>();
  const failLocCounts = new Map<string, number>();

  for (const r of rows) {
    const loc = (r.location || '').trim();
    locCounts.set(bucketKey(r.location), (locCounts.get(bucketKey(r.location)) || 0) + 1);

    if (!loc) {
      emptyLoc.push(r);
      failFilter.push(r);
      continue;
    }

    const ok = isUKJob(ukInput(r.location, r.title));
    if (!ok) {
      failFilter.push(r);
      failLocCounts.set(bucketKey(r.location), (failLocCounts.get(bucketKey(r.location)) || 0) + 1);
    }

    if (VAGUE_RE.test(loc)) vagueOnly.push(r);
    if (/\b(emea|europe|global|worldwide)\b/i.test(loc) && !/\b(london|manchester|birmingham|edinburgh|glasgow|bristol|leeds|uk|united kingdom|england|scotland|wales)\b/i.test(loc)) {
      emeaGlobal.push(r);
    }

    const lower = loc.toLowerCase();
    if (
      (/\bdublin\b/.test(lower) || (/\bireland\b/.test(lower) && !/\bnorthern ireland\b/.test(lower))) &&
      !/\b(united kingdom|england|scotland|wales|northern ireland|\buk\b)\b/.test(lower)
    ) {
      dublinRoiLike.push(r);
    }

    if ((loc.match(/\|/g) || []).length >= 1 || (loc.match(/;/g) || []).length >= 2) {
      multiPipe.push(r);
    }
  }

  return {
    failFilter,
    emptyLoc,
    vagueOnly,
    dublinRoiLike,
    emeaGlobal,
    multiPipe,
    locCounts,
    failLocCounts,
  };
}

function auditIR(rows: JobRow[]) {
  const failFilter: JobRow[] = [];
  const emptyLoc: JobRow[] = [];
  const vagueOnly: JobRow[] = [];
  const northernIreland: JobRow[] = [];
  const ukCities: JobRow[] = [];
  const usNamesake: JobRow[] = [];
  const locCounts = new Map<string, number>();
  const failLocCounts = new Map<string, number>();

  for (const r of rows) {
    const loc = (r.location || '').trim();
    locCounts.set(bucketKey(r.location), (locCounts.get(bucketKey(r.location)) || 0) + 1);

    if (!loc) {
      emptyLoc.push(r);
      failFilter.push(r);
      continue;
    }

    const ok = isIrelandJob(r.location);
    if (!ok) {
      failFilter.push(r);
      failLocCounts.set(bucketKey(r.location), (failLocCounts.get(bucketKey(r.location)) || 0) + 1);
    }

    if (VAGUE_RE.test(loc)) vagueOnly.push(r);
    if (/\bnorthern ireland\b|\bbelfast\b|\bderry\b|\blisburn\b/i.test(loc)) northernIreland.push(r);

    if (
      /\b(london|manchester|birmingham|edinburgh|glasgow|bristol|leeds|cardiff|united kingdom|\buk\b|england|scotland|wales)\b/i.test(loc) &&
      !/\b(ireland|dublin|cork|galway|limerick|waterford|éire|eire)\b/i.test(loc)
    ) {
      ukCities.push(r);
    }

    if (/\b(dublin|cork|galway|limerick|waterford|ennis|westport|tralee)\b/i.test(loc) &&
      /\b(CA|CT|TX|NY|MA|OH|GA|FL|United States|USA)\b/.test(loc)) {
      usNamesake.push(r);
    }
  }

  return {
    failFilter,
    emptyLoc,
    vagueOnly,
    northernIreland,
    ukCities,
    usNamesake,
    locCounts,
    failLocCounts,
  };
}

function qualityGaps(rows: JobRow[], label: string) {
  const now = Date.now();
  const staleCutoff = now - STALE_DAYS * 24 * 60 * 60 * 1000;

  let nullSector = 0;
  let nullLevel = 0;
  let nullDept = 0;
  let nullCompany = 0;
  let stale = 0;
  let noUrl = 0;
  const sectorCounts = new Map<string, number>();
  const levelCounts = new Map<string, number>();
  const companyJobCounts = new Map<string, number>();

  for (const r of rows) {
    if (!r.sector || !String(r.sector).trim()) nullSector++;
    else sectorCounts.set(String(r.sector), (sectorCounts.get(String(r.sector)) || 0) + 1);

    if (!r.level || !String(r.level).trim()) nullLevel++;
    else levelCounts.set(String(r.level), (levelCounts.get(String(r.level)) || 0) + 1);

    if (!r.department || !String(r.department).trim()) nullDept++;
    if (r.company_id == null) nullCompany++;
    if (!r.url || !String(r.url).trim()) noUrl++;

    const seen = r.last_seen_at ? Date.parse(r.last_seen_at) : NaN;
    if (!Number.isFinite(seen) || seen < staleCutoff) stale++;

    const cid = String(r.company_id ?? 'null');
    companyJobCounts.set(cid, (companyJobCounts.get(cid) || 0) + 1);
  }

  // concentration: top companies share
  const topCompanies = topN(companyJobCounts, 15);
  const top15Jobs = topCompanies.reduce((s, [, n]) => s + n, 0);

  console.log(`\n======== DATA QUALITY GAPS — ${label} (${rows.length} jobs) ========`);
  console.log(`null/blank sector:     ${nullSector} (${pct(nullSector, rows.length)})`);
  console.log(`null/blank level:      ${nullLevel} (${pct(nullLevel, rows.length)})`);
  console.log(`null/blank department: ${nullDept} (${pct(nullDept, rows.length)})`);
  console.log(`null company_id:       ${nullCompany}`);
  console.log(`missing url:           ${noUrl}`);
  console.log(`stale last_seen (>${STALE_DAYS}d): ${stale} (${pct(stale, rows.length)})`);
  console.log(`unique companies:      ${companyJobCounts.size}`);
  console.log(`top-15 companies share:${top15Jobs} (${pct(top15Jobs, rows.length)})`);

  console.log('\nTop sectors:');
  for (const [k, v] of topN(sectorCounts, 12)) console.log(`  ${v}\t${k}`);
  console.log('\nTop levels:');
  for (const [k, v] of topN(levelCounts, 12)) console.log(`  ${v}\t${k}`);
  console.log('\nMost job-heavy company_ids:');
  for (const [k, v] of topCompanies) console.log(`  ${v}\tcompany_id=${k}`);
}

function printSamples(label: string, rows: JobRow[], n = 8) {
  console.log(`\n${label} — samples (${Math.min(n, rows.length)} of ${rows.length}):`);
  for (const r of rows.slice(0, n)) {
    console.log(`  - [${r.id}] ${(r.title || '').slice(0, 70)} | loc="${(r.location || '').slice(0, 90)}"`);
  }
}

async function companyCoverage() {
  // Companies with licensed_sponsor or ireland_permit but 0 jobs
  const PAGE = 1000;
  const cos: Array<{
    id: any;
    trading_name: string;
    licensed_sponsor: boolean | null;
    ireland_permit_employer?: boolean | null;
    ats_provider: string | null;
    ats_board_token: string | null;
  }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('companies')
      .select('id, trading_name, licensed_sponsor, ireland_permit_employer, ats_provider, ats_board_token')
      .range(from, from + PAGE - 1);
    if (error) {
      // ireland_permit_employer may be missing on some envs
      const { data: d2, error: e2 } = await sb
        .from('companies')
        .select('id, trading_name, licensed_sponsor, ats_provider, ats_board_token')
        .range(from, from + PAGE - 1);
      if (e2) throw new Error(e2.message);
      if (!d2?.length) break;
      cos.push(...(d2 as any));
      if (d2.length < PAGE) break;
      from += PAGE;
      continue;
    }
    if (!data?.length) break;
    cos.push(...(data as any));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Count jobs per company from both tables (lightweight)
  const jobCounts = new Map<string, number>();
  for (const table of ['jobs', 'jobs_IR'] as const) {
    let f = 0;
    while (true) {
      const { data, error } = await sb.from(table).select('company_id').range(f, f + 999);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const r of data) {
        const id = String(r.company_id);
        jobCounts.set(id, (jobCounts.get(id) || 0) + 1);
      }
      if (data.length < 1000) break;
      f += 1000;
    }
  }

  const sponsors = cos.filter((c) => c.licensed_sponsor);
  const sponsorsNoJobs = sponsors.filter((c) => !jobCounts.get(String(c.id)));
  const sponsorsNoAts = sponsors.filter((c) => !c.ats_provider || !c.ats_board_token);
  const sponsorsAtsNoJobs = sponsors.filter(
    (c) => c.ats_provider && c.ats_board_token && !jobCounts.get(String(c.id))
  );

  console.log(`\n======== COMPANY COVERAGE GAPS ========`);
  console.log(`companies total:                 ${cos.length}`);
  console.log(`licensed sponsors:               ${sponsors.length}`);
  console.log(`sponsors with 0 jobs:            ${sponsorsNoJobs.length} (${pct(sponsorsNoJobs.length, sponsors.length)})`);
  console.log(`sponsors missing ATS token:      ${sponsorsNoAts.length}`);
  console.log(`sponsors WITH ATS but 0 jobs:    ${sponsorsAtsNoJobs.length}`);

  console.log('\nSample sponsors with ATS but 0 jobs:');
  for (const c of sponsorsAtsNoJobs.slice(0, 15)) {
    console.log(`  - [${c.id}] ${c.trading_name} | ${c.ats_provider} | token=${String(c.ats_board_token).slice(0, 40)}`);
  }

  console.log('\nSample sponsors with no ATS:');
  for (const c of sponsorsNoAts.slice(0, 15)) {
    console.log(`  - [${c.id}] ${c.trading_name}`);
  }

  return { sponsorsNoJobs: sponsorsNoJobs.length, sponsorsAtsNoJobs: sponsorsAtsNoJobs.length, sponsorsNoAts: sponsorsNoAts.length };
}

async function main() {
  console.log('Fetching jobs + jobs_IR...');
  const [uk, ir] = await Promise.all([fetchAll('jobs'), fetchAll('jobs_IR')]);
  console.log(`UK jobs: ${uk.length} | IR jobs: ${ir.length}`);

  const aUK = auditUK(uk);
  console.log(`\n======== LOCATION AUDIT — jobs (UK) ========`);
  console.log(`fail current isUKJob filter: ${aUK.failFilter.length} (${pct(aUK.failFilter.length, uk.length)})`);
  console.log(`empty location:              ${aUK.emptyLoc.length}`);
  console.log(`vague-only location:         ${aUK.vagueOnly.length}`);
  console.log(`Dublin/RoI-like (no UK):     ${aUK.dublinRoiLike.length}`);
  console.log(`EMEA/Global without UK city: ${aUK.emeaGlobal.length}`);
  console.log(`multi-location pipes:        ${aUK.multiPipe.length}`);

  console.log('\nTop UK locations:');
  for (const [k, v] of topN(aUK.locCounts, 20)) console.log(`  ${v}\t${k}`);

  console.log('\nTop failing UK locations:');
  for (const [k, v] of topN(aUK.failLocCounts, 20)) console.log(`  ${v}\t${k}`);

  printSamples('UK fail-filter', aUK.failFilter);
  printSamples('UK Dublin/RoI-like', aUK.dublinRoiLike);
  printSamples('UK EMEA/Global vague', aUK.emeaGlobal);
  printSamples('UK vague-only', aUK.vagueOnly);

  const aIR = auditIR(ir);
  console.log(`\n======== LOCATION AUDIT — jobs_IR ========`);
  console.log(`fail current isIrelandJob:   ${aIR.failFilter.length} (${pct(aIR.failFilter.length, ir.length)})`);
  console.log(`empty location:              ${aIR.emptyLoc.length}`);
  console.log(`vague-only location:         ${aIR.vagueOnly.length}`);
  console.log(`Northern Ireland / Belfast:  ${aIR.northernIreland.length}`);
  console.log(`UK-only cities (no IE):      ${aIR.ukCities.length}`);
  console.log(`US namesake risk:            ${aIR.usNamesake.length}`);

  console.log('\nTop IR locations:');
  for (const [k, v] of topN(aIR.locCounts, 20)) console.log(`  ${v}\t${k}`);

  console.log('\nTop failing IR locations:');
  for (const [k, v] of topN(aIR.failLocCounts, 20)) console.log(`  ${v}\t${k}`);

  printSamples('IR fail-filter', aIR.failFilter);
  printSamples('IR Northern Ireland', aIR.northernIreland);
  printSamples('IR UK-only cities', aIR.ukCities);
  printSamples('IR US namesake', aIR.usNamesake);

  qualityGaps(uk, 'jobs (UK)');
  qualityGaps(ir, 'jobs_IR');

  await companyCoverage();

  console.log('\n======== PRIORITY SUMMARY ========');
  console.log(
    JSON.stringify(
      {
        uk: {
          total: uk.length,
          failFilter: aUK.failFilter.length,
          empty: aUK.emptyLoc.length,
          vague: aUK.vagueOnly.length,
          dublinRoi: aUK.dublinRoiLike.length,
          emeaGlobal: aUK.emeaGlobal.length,
        },
        ir: {
          total: ir.length,
          failFilter: aIR.failFilter.length,
          empty: aIR.emptyLoc.length,
          vague: aIR.vagueOnly.length,
          ni: aIR.northernIreland.length,
          ukOnly: aIR.ukCities.length,
          usNamesake: aIR.usNamesake.length,
        },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
