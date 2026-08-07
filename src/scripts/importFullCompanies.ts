/**
 * importFullCompanies.ts
 *
 * Upserts company rows from a full-schema CSV (id, trading_name, ATS, careers_url, …).
 *
 * Run:
 *   npm run import:full "main compnies cafy - detailes of compnies.csv"
 *   npx tsx src/scripts/importFullCompanies.ts --dry-run "path/to.csv"
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import Papa from 'papaparse';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const DRY_RUN = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const fileName = args[0] || 'my_companies_data.csv';
const CSV_PATH = path.resolve(process.cwd(), fileName);

function parseBoolean(val: string | undefined): boolean | null {
  if (val == null || String(val).trim() === '') return null;
  const lower = String(val).toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return null;
}

function cleanUrl(val: string | undefined | null): string | null {
  if (!val) return null;
  let s = String(val).trim();
  // CSV quirk: "[https://logo.clearbit.com/..."
  if (s.startsWith('[')) s = s.slice(1);
  if (!s || s === 'null' || s === 'undefined') return null;
  return s;
}

function normalizeProvider(raw: string | undefined | null): string | null {
  if (!raw || !String(raw).trim()) return null;
  return String(raw).trim().toLowerCase();
}

function optionalNumber(val: string | undefined | null): number | null {
  if (val == null || String(val).trim() === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found at: ${CSV_PATH}`);
    console.log(`Usage: npm run import:full "path/to/your/file.csv"`);
    process.exit(1);
  }

  console.log(`${DRY_RUN ? 'DRY RUN — ' : ''}Importing from: ${CSV_PATH}`);
  console.log('Connecting to:', SUPABASE_URL);

  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const parsed = Papa.parse<Record<string, any>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    console.error('❌ CSV parse errors:', parsed.errors[0].message);
    process.exit(1);
  }

  const rows = parsed.data;
  console.log(`Parsed ${rows.length} rows from CSV`);

  const records: Record<string, unknown>[] = [];
  let skippedNoName = 0;
  let skippedNoId = 0;
  let withAts = 0;
  let blankLicence = 0;

  for (const r of rows) {
    const trading_name = String(r.trading_name || '').trim();
    if (!trading_name) {
      skippedNoName++;
      continue;
    }
    const id = optionalNumber(r.id);
    if (id == null) {
      skippedNoId++;
      continue;
    }

    const row: Record<string, unknown> = {
      id,
      trading_name,
      companies_house_name: r.companies_house_name || null,
      url: cleanUrl(r.url),
      url_linkedin: cleanUrl(r.url_linkedin),
      description: r.description || null,
      policy: r.policy || null,
      open_to_sponsorship: optionalNumber(r.open_to_sponsorship) ?? 0,
      active_jobs_count: optionalNumber(r.active_jobs_count) ?? 0,
      url_favicon: cleanUrl(r.url_favicon),
      estimated_num_employees_label: r.estimated_num_employees_label || null,
      ats_provider: normalizeProvider(r.ats_provider),
      ats_board_token: r.ats_board_token ? String(r.ats_board_token).trim() : null,
      careers_url: cleanUrl(r.careers_url),
      linkedin_id: r.linkedin_id || null,
      ats_status: r.ats_status ? String(r.ats_status).trim().toLowerCase() : null,
      ats_failure_count: optionalNumber(r.ats_failure_count) ?? 0,
      company_sector: r.company_sector || null,
      updated_at: r.updated_at || new Date().toISOString(),
    };

    if (r.created_at) row.created_at = r.created_at;

    // Only set licence flags when CSV provides a value — never wipe existing true with null.
    const licensed = parseBoolean(r.licensed_sponsor);
    if (licensed !== null) row.licensed_sponsor = licensed;
    else blankLicence++;

    const ireland = parseBoolean(r.ireland_permit_employer);
    if (ireland !== null) row.ireland_permit_employer = ireland;

    const badge = parseBoolean(r.show_recently_added_badge);
    if (badge !== null) row.show_recently_added_badge = badge;

    if (r.ats_last_validated) row.ats_last_validated = r.ats_last_validated;
    if (optionalNumber(r.cos_used_count_2025) != null) {
      row.cos_used_count_2025 = optionalNumber(r.cos_used_count_2025);
    }
    if (optionalNumber(r.sponsored_employees_count) != null) {
      row.sponsored_employees_count = optionalNumber(r.sponsored_employees_count);
    }
    if (r.added_to_register) row.added_to_register = r.added_to_register;
    if (r.favicon_id) row.favicon_id = r.favicon_id;

    if (row.ats_provider) withAts++;
    records.push(row);
  }

  console.log(
    `Ready: ${records.length} | skipped no-name: ${skippedNoName} | skipped no-id: ${skippedNoId}`
  );
  console.log(`With ATS: ${withAts} | blank licensed_sponsor in CSV: ${blankLicence}`);

  if (records.length === 0) {
    console.log('No valid records to import.');
    return;
  }

  if (DRY_RUN) {
    console.log('Sample row:', JSON.stringify(records[0], null, 2));
    console.log('Dry-run complete — no DB writes.');
    return;
  }

  const BATCH = 100;
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const { error } = await supabase.from('companies').upsert(chunk, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Batch ${i}-${i + chunk.length - 1} FAILED:`, error.message);
      // Retry one-by-one to isolate bad rows
      for (const row of chunk) {
        const { error: oneErr } = await supabase.from('companies').upsert(row, { onConflict: 'id' });
        if (oneErr) {
          console.error(`  fail id=${row.id} ${row.trading_name}: ${oneErr.message}`);
          failed++;
        } else {
          inserted++;
        }
      }
    } else {
      inserted += chunk.length;
      console.log(`✓ Upserted rows ${i + 1} to ${i + chunk.length}`);
    }
  }

  console.log(`\nDone. Upserted: ${inserted} | Failed: ${failed}`);

  // Best-effort sequence reset (ignore if RPC missing)
  const { error: seqErr } = await supabase.rpc('reset_companies_sequence');
  if (seqErr) {
    console.warn(`Sequence reset skipped: ${seqErr.message}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
