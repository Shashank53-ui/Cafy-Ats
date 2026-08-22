/**
 * Targeted fix for Mid-level + Software preference noise.
 * Updates sector / department / level for known weak title patterns.
 *
 *   npx tsx src/scripts/fixPreferredNoise.ts --dry-run
 *   npx tsx src/scripts/fixPreferredNoise.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { classifyJobTaxonomy } from '../lib/classifyJobTaxonomy';
import { inferJobLevel } from '../lib/inferJobLevel';
import { ALLOWED_SECTORS } from '../lib/constants';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

const TITLE_PATTERNS = [
  '%Head of Software%',
  '%Head of Engineering%',
  '%Software Engineering Manager%',
  '%Engineering Manager%',
  '%R&D Tax%',
  '%Tax Assistant Manager%',
  '%Service Desk%',
  '%Application Support%',
  '%IT Support%',
  '%Maintenance Reliability%',
  '%Reliability Manager%',
  '%C&Q%',
  '%CQV%',
];

const TABLES = ['jobs', 'jobs_IR'] as const;

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'APPLY' : 'DRY-RUN');

  let wouldTotal = 0;
  let updatedTotal = 0;

  for (const table of TABLES) {
    const seen = new Set<number>();
    const rows: {
      id: number;
      title: string;
      sector: string | null;
      department: string | null;
      level: string | null;
      sector_embedding: string | null;
    }[] = [];

    for (const pat of TITLE_PATTERNS) {
      const { data, error } = await sb
        .from(table)
        .select('id, title, sector, department, level, sector_embedding')
        .ilike('title', pat)
        .limit(2000);
      if (error) throw error;
      for (const r of data || []) {
        if (seen.has(Number(r.id))) continue;
        seen.add(Number(r.id));
        rows.push({
          id: Number(r.id),
          title: String(r.title ?? ''),
          sector: r.sector,
          department: r.department,
          level: r.level,
          sector_embedding: r.sector_embedding,
        });
      }
    }

    console.log(`\n── ${table} ── matched ${rows.length}`);

    let would = 0;
    let updated = 0;
    const samples: string[] = [];

    for (const row of rows) {
      const deptForClassification =
        row.department && (ALLOWED_SECTORS as readonly string[]).includes(row.department.trim())
          ? null
          : row.department;
      const { sector, department } = classifyJobTaxonomy(
        row.title,
        deptForClassification,
        null,
        row.sector_embedding,
      );
      const level = inferJobLevel(row.title);
      if (
        row.sector === sector &&
        row.department === department &&
        row.level === level
      ) {
        continue;
      }
      would++;
      const line = `${row.title}\n  was: ${row.level} / ${row.sector}\n  now: ${level} / ${sector}`;
      if (samples.length < 12) samples.push(line);

      if (apply) {
        const { error } = await sb
          .from(table)
          .update({ sector, department, level })
          .eq('id', row.id);
        if (error) throw error;
        updated++;
      }
    }

    if (samples.length) console.log(samples.join('\n\n'));
    console.log(`Would update: ${would}; updated: ${updated}`);
    wouldTotal += would;
    updatedTotal += updated;
  }

  console.log(`\nTotal would=${wouldTotal} updated=${updatedTotal}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
