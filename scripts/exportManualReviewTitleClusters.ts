/**
 * Build a frequency-ranked unique-title sheet from jobs that still need
 * level review (level IS NULL or level_source = manual_review).
 *
 * Label `your_level` for the top rows (highest count first), then we can
 * turn approved clusters into rules / prototypes and re-backfill.
 *
 *   npx tsx scripts/exportManualReviewTitleClusters.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { mapLegacyJobLevel } from '../src/lib/levelConfig';

/** Old Mid-default hint only — for comparison in the sheet, not truth. */
function oldApproachHint(title: string): string {
  if (!title) return '';
  const t = title.toLowerCase();
  let level = 'Mid-level';
  if (/\b(chief|cto|ceo|cfo|coo|cpo|president|managing director|md)\b/.test(t)) level = 'Executive';
  else if (/\bvp\b|vice president|\b(avp|svp)\b/.test(t)) level = 'VP';
  else if (/\bdirector\b/.test(t) || /\bhead of\b/.test(t)) level = 'Director';
  else if (/\bprincipal\b/.test(t)) level = 'Principal';
  else if (/\b(senior|sr\.?|snr)\b/.test(t)) level = 'Senior';
  else if (/\blead\b/.test(t)) level = 'Lead';
  else if (/\bstaff\b/.test(t)) level = 'Staff';
  else if (/\b(intern|internship|placement|apprentice)\b/.test(t)) level = 'Internship';
  else if (/\b(graduate|entry.?level|junior|jr\.?)\b/.test(t)) level = 'Junior';
  return mapLegacyJobLevel(level) || 'Mid Level';
}

type Row = {
  table: string;
  id: number;
  title: string;
  url: string | null;
  location: string | null;
  company_id: string | null;
  description: string | null;
};

function normTitle(t: string): string {
  return String(t || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function csvEscape(v: string | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function previewDesc(d: string | null): string {
  if (!d) return '';
  return String(d).replace(/\s+/g, ' ').trim().slice(0, 160);
}

async function fetchReviewRows(table: 'jobs' | 'jobs_IR'): Promise<Row[]> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const out: Row[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    // Prefer null level; also catch source=manual_review if level somehow set
    const { data, error } = await sb
      .from(table)
      .select('id,title,url,location,company_id,description,level,level_source')
      .or('level.is.null,level_source.eq.manual_review')
      .order('id')
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      // Skip if somehow assigned a real level with non-manual source
      if (r.level && r.level_source && r.level_source !== 'manual_review') continue;
      out.push({
        table,
        id: Number(r.id),
        title: String(r.title || ''),
        url: r.url ?? null,
        location: r.location ?? null,
        company_id: r.company_id != null ? String(r.company_id) : null,
        description: r.description ?? null,
      });
    }
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function loadCompanyNames(
  ids: string[],
): Promise<Map<string, string>> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const map = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    const { data, error } = await sb
      .from('companies')
      .select('id,trading_name,companies_house_name')
      .in('id', chunk);
    if (error) {
      console.warn('companies lookup:', error.message);
      break;
    }
    for (const c of data || []) {
      map.set(String(c.id), String(c.trading_name || c.companies_house_name || '').trim());
    }
  }
  return map;
}

type Cluster = {
  norm_title: string;
  example_title: string;
  count: number;
  tables: Set<string>;
  sample_ids: number[];
  sample_urls: string[];
  sample_companies: string[];
  sample_locations: string[];
  description_preview: string;
};

async function main() {
  const uk = await fetchReviewRows('jobs');
  const ie = await fetchReviewRows('jobs_IR');
  const rows = [...uk, ...ie];
  console.log(`review_rows=${rows.length} (uk=${uk.length} ie=${ie.length})`);

  const companyMap = await loadCompanyNames(rows.map((r) => r.company_id || ''));

  const clusters = new Map<string, Cluster>();
  for (const r of rows) {
    const key = normTitle(r.title);
    if (!key) continue;
    let c = clusters.get(key);
    if (!c) {
      c = {
        norm_title: key,
        example_title: r.title,
        count: 0,
        tables: new Set(),
        sample_ids: [],
        sample_urls: [],
        sample_companies: [],
        sample_locations: [],
        description_preview: '',
      };
      clusters.set(key, c);
    }
    c.count++;
    c.tables.add(r.table);
    if (c.sample_ids.length < 5) c.sample_ids.push(r.id);
    if (r.url && c.sample_urls.length < 3) c.sample_urls.push(r.url);
    const co = r.company_id ? companyMap.get(r.company_id) || '' : '';
    if (co && c.sample_companies.length < 5 && !c.sample_companies.includes(co)) {
      c.sample_companies.push(co);
    }
    if (r.location && c.sample_locations.length < 3 && !c.sample_locations.includes(r.location)) {
      c.sample_locations.push(r.location);
    }
    if (!c.description_preview && r.description) {
      c.description_preview = previewDesc(r.description);
    }
  }

  const ranked = [...clusters.values()].sort((a, b) => b.count - a.count || a.norm_title.localeCompare(b.norm_title));
  const totalJobs = ranked.reduce((s, c) => s + c.count, 0);

  // Coverage if you label top N clusters
  const coverageAt: { top_n: number; jobs_covered: number; pct: number }[] = [];
  let cum = 0;
  for (const n of [50, 100, 200, 300, 500, 1000, 2000]) {
    cum = ranked.slice(0, n).reduce((s, c) => s + c.count, 0);
    coverageAt.push({
      top_n: n,
      jobs_covered: cum,
      pct: totalJobs ? Math.round((cum / totalJobs) * 1000) / 10 : 0,
    });
  }

  const logDir = path.resolve('logs');
  fs.mkdirSync(logDir, { recursive: true });
  const csvPath = path.join(logDir, 'manual_review_title_clusters.csv');

  const header = [
    'rank',
    'count',
    'pct_of_review',
    'cumulative_pct',
    'example_title',
    'norm_title',
    'your_level',
    'old_approach_hint',
    'tables',
    'sample_companies',
    'sample_locations',
    'sample_ids',
    'sample_urls',
    'description_preview',
    'notes',
  ];

  let running = 0;
  const lines = [header.join(',')];
  ranked.forEach((c, i) => {
    running += c.count;
    const pct = totalJobs ? Math.round((c.count / totalJobs) * 10000) / 100 : 0;
    const cumPct = totalJobs ? Math.round((running / totalJobs) * 1000) / 10 : 0;
    const hint = oldApproachHint(c.example_title);
    lines.push(
      [
        String(i + 1),
        String(c.count),
        String(pct),
        String(cumPct),
        csvEscape(c.example_title),
        csvEscape(c.norm_title),
        '', // your_level — fill this
        csvEscape(hint),
        csvEscape([...c.tables].join('|')),
        csvEscape(c.sample_companies.join(' | ')),
        csvEscape(c.sample_locations.join(' | ')),
        csvEscape(c.sample_ids.join('|')),
        csvEscape(c.sample_urls.join(' | ')),
        csvEscape(c.description_preview),
        '',
      ].join(','),
    );
  });

  fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');

  // Also a short “start here” sheet: top 300 only
  const topPath = path.join(logDir, 'manual_review_title_clusters_TOP300.csv');
  const topLines = [header.join(','), ...lines.slice(1, 301)];
  fs.writeFileSync(topPath, topLines.join('\n') + '\n', 'utf8');

  console.log(
    JSON.stringify(
      {
        review_job_rows: totalJobs,
        unique_titles: ranked.length,
        coverage_if_you_label_top_n: coverageAt,
        full_csv: csvPath,
        start_here_csv: topPath,
        how_to:
          'Fill your_level on TOP300 (or more). Allowed: Entry Level|Junior|Mid Level|Senior. Leave blank to skip. Then ask to import clusters → rules/prototypes + repair.',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
