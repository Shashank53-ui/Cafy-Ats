/**
 * Phase 0: remap clinical sectors, fix pharma company_sector, delete leftover
 * foreign worksites, rewrite junk locations.
 *
 *   npx tsx src/scripts/fixClinicalAndGeo.ts
 *   npx tsx src/scripts/fixClinicalAndGeo.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

import { createClient } from '@supabase/supabase-js';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';
import { isForeignLocationLeak } from '../lib/foreignLocationLeak';
import { isRelocateAbroadTitle, sanitizeCompanySectorForInference } from '../lib/jobIngestGuards';
import { sanitizeJobLocation } from '../lib/refineLocation';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const APPLY = process.argv.includes('--apply');

const CLINICAL_FROM = new Set([
  'Construction & Infrastructure',
  'Research (Technical)',
  'HR / People',
  'Operations',
  'Finance',
  'Research (Non-technical)',
]);

const PHARMA_COMPANIES: Array<{ match: string; sector: string }> = [
  { match: 'GSK', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'AstraZeneca', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Pfizer', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Roche', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Johnson & Johnson', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'AbbVie', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Amgen', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Gilead', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Sanofi', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Haleon', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Eli Lilly', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Novartis', sector: 'Pharmaceuticals / Biotechnology' },
  { match: 'Bayer', sector: 'Pharmaceuticals / Biotechnology' },
];

type JobRow = {
  id: number;
  title: string;
  location: string | null;
  url: string | null;
  sector: string | null;
  department: string | null;
  company_id: string | null;
};

type CoRow = { id: string; trading_name: string | null; company_sector: string | null };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as T[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function deleteIds(table: string, ids: number[]) {
  for (const part of chunk(ids, 200)) {
    const { error } = await sb.from(table).delete().in('id', part);
    if (error) throw new Error(`${table} delete: ${error.message}`);
  }
}

async function main() {
  const companies = await fetchAll<CoRow>('companies', 'id, trading_name, company_sector');
  const coMap = new Map(companies.map((c) => [String(c.id), c]));

  const summary: Record<string, unknown> = { apply: APPLY };

  const companyUpdates: Array<{ id: string; from: string; to: string; name: string }> = [];
  for (const spec of PHARMA_COMPANIES) {
    const hits = companies.filter((c) =>
      new RegExp(spec.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(c.trading_name || ''),
    );
    for (const hit of hits) {
      const current = String(hit.company_sector || '').trim();
      if (current === spec.sector) continue;
      // Skip the hospitality false-positive from a bare "HSE" style match — names are explicit.
      companyUpdates.push({
        id: String(hit.id),
        from: current || '(blank)',
        to: spec.sector,
        name: (hit.trading_name || spec.match).replace(/\s+/g, ' ').trim(),
      });
    }
  }
  summary.companySector = companyUpdates;
  if (APPLY) {
    for (const u of companyUpdates) {
      const { error } = await sb.from('companies').update({ company_sector: u.to }).eq('id', u.id);
      if (error) throw new Error(`company ${u.id}: ${error.message}`);
    }
  }

  for (const table of ['jobs', 'jobs_IR'] as const) {
    const market = table === 'jobs_IR' ? 'ireland' : 'uk';
    const rows = await fetchAll<JobRow>(
      table,
      'id, title, location, url, sector, department, company_id',
    );

    const remap: Array<{ id: number; sector: string; department: string; sample: string }> = [];
    const toDelete: Array<{ id: number; sample: string }> = [];
    const locRewrite = new Map<string, number[]>();
    const locSamples: string[] = [];

    for (const r of rows) {
      if (
        isRelocateAbroadTitle(r.title) ||
        isForeignLocationLeak({ location: r.location, title: r.title, url: r.url }, market)
      ) {
        if (toDelete.length < 25) {
          toDelete.push({ id: r.id, sample: `${r.title} | ${r.location}` });
        } else {
          toDelete.push({ id: r.id, sample: '' });
        }
        continue;
      }

      const from = String(r.location || '').trim();
      const nextLoc = sanitizeJobLocation(from, market, r.title, r.url);
      if (from && nextLoc !== from) {
        const list = locRewrite.get(nextLoc) || [];
        list.push(r.id);
        locRewrite.set(nextLoc, list);
        if (locSamples.length < 12) locSamples.push(`${from} → ${nextLoc} | ${r.title}`);
      }

      const co = coMap.get(String(r.company_id || ''));
      const { sector, department } = classifyJobTaxonomy(
        r.title,
        r.department,
        sanitizeCompanySectorForInference(co?.company_sector),
      );
      const FORCE_RECLASS =
        /\bnurs(?:e|es|ing)\b/i.test(r.title) ||
        /\b(\behs\b|health and safety|health & safety)\b/i.test(r.title) ||
        /\baudio designers?\b/i.test(r.title) ||
        (/\barchitects?\b/i.test(r.title) && /\bhealthcare\b/i.test(r.title)) ||
        /\bdrug substance\b/i.test(r.title);

      const stored = String(r.sector || '').trim();
      if (
        sector !== stored &&
        (FORCE_RECLASS ||
          ((sector === 'Healthcare' || sector === 'Pharmaceutical') && CLINICAL_FROM.has(stored)))
      ) {
        remap.push({
          id: r.id,
          sector,
          department,
          sample: remap.length < 20 ? `${r.title} | ${stored} → ${sector}` : '',
        });
      }
    }

    summary[table] = {
      total: rows.length,
      remap: remap.length,
      remapSamples: remap.map((x) => x.sample).filter(Boolean),
      delete: toDelete.length,
      deleteSamples: toDelete.map((x) => x.sample).filter(Boolean),
      locRewrite: [...locRewrite.values()].reduce((n, ids) => n + ids.length, 0),
      locSamples,
    };

    if (!APPLY) continue;

    const byPair = new Map<string, number[]>();
    for (const r of remap) {
      const key = `${r.sector}\t${r.department}`;
      const list = byPair.get(key) || [];
      list.push(r.id);
      byPair.set(key, list);
    }
    for (const [key, ids] of byPair) {
      const [sector, department] = key.split('\t');
      for (const part of chunk(ids, 200)) {
        const { error } = await sb.from(table).update({ sector, department }).in('id', part);
        if (error) throw new Error(`${table} remap: ${error.message}`);
      }
    }

    const deleteIdsOnly = toDelete.map((d) => d.id);
    if (deleteIdsOnly.length) await deleteIds(table, deleteIdsOnly);

    for (const [location, ids] of locRewrite) {
      for (const part of chunk(ids, 200)) {
        const { error } = await sb.from(table).update({ location }).in('id', part);
        if (error) throw new Error(`${table} loc: ${error.message}`);
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
