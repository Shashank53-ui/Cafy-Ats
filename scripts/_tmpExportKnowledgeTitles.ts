import dotenv from 'dotenv';
dotenv.config({ path: '.env', quiet: true });

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function norm(t: string): string {
  return String(t || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function csv(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Bucket = {
  count: number;
  title: string;
  norm: string;
  levels: Map<string, number>;
  tables: Set<string>;
  sectors: Set<string>;
  locations: Set<string>;
  samples: string[];
  urls: string[];
};

async function main() {
  const buckets = new Map<string, Bucket>();

  for (const table of ['jobs', 'jobs_IR'] as const) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from(table)
        .select('title,level,sector,location,description,url')
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      if (!data?.length) break;

      for (const r of data as Array<Record<string, unknown>>) {
        const title = String(r.title || '').trim();
        const key = norm(title);
        const hit: Bucket = buckets.get(key) ?? {
          count: 0,
          title,
          norm: key,
          levels: new Map(),
          tables: new Set(),
          sectors: new Set(),
          locations: new Set(),
          samples: [],
          urls: [],
        };

        hit.count++;
        if (!hit.title && title) hit.title = title;
        const level = String(r.level || '');
        hit.levels.set(level, (hit.levels.get(level) || 0) + 1);
        hit.tables.add(table);
        if (r.sector) hit.sectors.add(String(r.sector));
        if (r.location && hit.locations.size < 5) hit.locations.add(String(r.location));
        if (r.description && hit.samples.length < 2) {
          hit.samples.push(String(r.description).replace(/\s+/g, ' ').trim().slice(0, 180));
        }
        if (r.url && hit.urls.length < 2) hit.urls.push(String(r.url));
        buckets.set(key, hit);
      }

      if (data.length < 1000) break;
    }
  }

  const rows = [...buckets.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  const lines = [
    [
      'rank',
      'count',
      'title',
      'norm_title',
      'stored_levels',
      'tables',
      'sample_sectors',
      'sample_locations',
      'sample_urls',
      'description_preview',
    ].join(','),
  ];

  rows.forEach((r, i) => {
    const stored = [...r.levels.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k || '(blank)'}:${n}`)
      .join(' | ');

    lines.push(
      [
        i + 1,
        r.count,
        csv(r.title),
        csv(r.norm),
        csv(stored),
        csv([...r.tables].join('|')),
        csv([...r.sectors].slice(0, 5).join(' | ')),
        csv([...r.locations].join(' | ')),
        csv(r.urls.join(' | ')),
        csv(r.samples[0] || ''),
      ].join(','),
    );
  });

  fs.writeFileSync('logs/knowledge_unique_titles.csv', lines.join('\n'));
  console.log(
    JSON.stringify(
      {
        unique_titles: rows.length,
        total_rows: rows.reduce((s, r) => s + r.count, 0),
        top20: rows.slice(0, 20).map((r) => ({
          count: r.count,
          title: r.title,
          stored_levels: [...r.levels.entries()],
        })),
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
