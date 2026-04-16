import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type CsvRow = {
  'Company ID'?: string;
  'Company Name'?: string;
  'ATS Provider'?: string;
  'ATS Board Token'?: string;
  URL?: string;
  Virefication?: string;
  Verification?: string;
  Status?: string;
};

type CompanyRecord = {
  id: number;
  ats_provider: string | null;
  ats_board_token: string | null;
  url: string | null;
};

const providerAliases: Record<string, string> = {
  ashby: 'ashby',
  greenhouse: 'greenhouse',
  lever: 'lever',
  workable: 'workable',
  teamtailor: 'teamtailor',
  bamboohr: 'bamboohr',
  smartrecruiters: 'smartrecruiters',
  pinpoint: 'pinpoint',
  breezy: 'breezy',
  breezyhr: 'breezyhr',
  personio: 'personio',
  workday: 'workday',
  workday_enterprise: 'workday_enterprise',
  oracle_cloud: 'oracle_cloud',
  successfactors: 'successfactors',
  icims: 'icims',
  hibob: 'hibob',
  rippling: 'rippling',
  recruitee: 'recruitee',
  eightfold: 'eightfold',
  linkedin: 'linkedin',
  custom: 'custom',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    file: 'ATS compnies - industry_grade_ats_database_fixed.csv',
    dryRun: false,
    replaceEmpty: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--file' && args[i + 1]) {
      opts.file = args[i + 1];
      i += 1;
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--replace-empty') {
      opts.replaceEmpty = true;
    }
  }

  return opts;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value
    .replace(/\uFEFF/g, '')
    .replace(/â€”/g, '-')
    .trim();

  if (!cleaned) return null;

  const lowered = cleaned.toLowerCase();
  if (lowered === '-' || lowered === '__' || lowered === 'n/a' || lowered === 'na') {
    return null;
  }

  return cleaned;
}

function normalizeProvider(value: string | null | undefined): string | null {
  const cleaned = normalizeText(value);
  if (!cleaned) return null;
  const key = cleaned.toLowerCase().replace(/\s+/g, '_');
  return providerAliases[key] || cleaned.toLowerCase();
}

function normalizeUrl(value: string | null | undefined): string | null {
  const cleaned = normalizeText(value);
  if (!cleaned) return null;

  if (/^https?:\/\//i.test(cleaned)) return cleaned;

  if (cleaned.startsWith('www.')) return `https://${cleaned}`;
  if (cleaned.startsWith('jobs.') || cleaned.startsWith('apply.')) return `https://${cleaned}`;

  return cleaned;
}

function inferProviderFromUrl(url: string | null | undefined): string | null {
  const cleaned = normalizeUrl(url);
  if (!cleaned) return null;

  const host = (() => {
    try {
      return new URL(cleaned).hostname.toLowerCase();
    } catch {
      return cleaned.toLowerCase();
    }
  })();

  if (host.includes('ashbyhq.com')) return 'ashby';
  if (host.includes('lever.co')) return 'lever';
  if (host.includes('greenhouse.io')) return 'greenhouse';
  if (host.includes('workable.com')) return 'workable';
  if (host.includes('teamtailor.com')) return 'teamtailor';
  if (host.includes('bamboohr.com')) return 'bamboohr';
  if (host.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (host.includes('pinpointhq.com')) return 'pinpoint';
  if (host.includes('breezy.hr')) return 'breezy';
  if (host.includes('recruitee.com')) return 'recruitee';
  if (host.includes('personio.de')) return 'personio';
  if (host.includes('myworkdayjobs.com') || host.includes('workdayjobs.com')) return 'workday';
  if (host.includes('oraclecloud')) return 'oracle_cloud';
  if (host.includes('successfactors.com')) return 'successfactors';
  if (host.includes('hibob.com')) return 'hibob';
  if (host.includes('rippling.com')) return 'rippling';
  if (host.includes('icims.com')) return 'icims';

  return null;
}

async function main() {
  const opts = parseArgs();
  const filePath = path.resolve(process.cwd(), opts.file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const csvText = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    const preview = parsed.errors.slice(0, 5).map(e => `${e.code}:${e.message}`).join(' | ');
    throw new Error(`CSV parse errors: ${preview}`);
  }

  const rows = parsed.data;
  const idSet = new Set<number>();

  for (const row of rows) {
    const idRaw = normalizeText(row['Company ID']);
    if (!idRaw) continue;
    const id = Number(idRaw);
    if (Number.isFinite(id) && id > 0) idSet.add(id);
  }

  const ids = Array.from(idSet);
  if (ids.length === 0) {
    throw new Error('No valid Company ID values found in CSV.');
  }

  const existingById = new Map<number, CompanyRecord>();
  const pageSize = 500;
  for (let i = 0; i < ids.length; i += pageSize) {
    const chunk = ids.slice(i, i + pageSize);
    const { data, error } = await supabase
      .from('companies')
      .select('id, ats_provider, ats_board_token, url')
      .in('id', chunk);

    if (error) throw new Error(`Failed to load companies: ${error.message}`);

    for (const row of (data || []) as CompanyRecord[]) {
      existingById.set(row.id, row);
    }
  }

  const updates: Array<{ id: number; ats_provider: string | null; ats_board_token: string | null; url: string | null }> = [];
  const auditRows: Array<{
    company_id: number;
    source_file: string;
    source_company_name: string | null;
    sync_provider: string | null;
    provider_raw: string | null;
    board_token_raw: string | null;
    careers_url_raw: string | null;
    verification: string | null;
    status: string | null;
    imported_at: string;
  }> = [];

  for (const row of rows) {
    const idRaw = normalizeText(row['Company ID']);
    if (!idRaw) continue;

    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) continue;

    const existing = existingById.get(id);
    if (!existing) continue;

    const providerRaw = normalizeText(row['ATS Provider']);
    const boardTokenRaw = normalizeText(row['ATS Board Token']);
    const urlRaw = normalizeText(row.URL);

    const provider = normalizeProvider(providerRaw);
    const inferredProvider = inferProviderFromUrl(urlRaw);
    const syncProvider = provider && provider !== 'custom' ? provider : (inferredProvider || provider);
    const boardToken = normalizeText(boardTokenRaw);
    const url = normalizeUrl(urlRaw);

    const nextProvider = provider ?? (opts.replaceEmpty ? null : existing.ats_provider);
    const nextToken = boardToken ?? (opts.replaceEmpty ? null : existing.ats_board_token);
    const nextUrl = url ?? (opts.replaceEmpty ? null : existing.url);

    updates.push({
      id,
      ats_provider: nextProvider,
      ats_board_token: nextToken,
      url: nextUrl,
    });

    auditRows.push({
      company_id: id,
      source_file: path.basename(filePath),
      source_company_name: normalizeText(row['Company Name']),
      sync_provider: syncProvider,
      provider_raw: providerRaw,
      board_token_raw: boardTokenRaw,
      careers_url_raw: urlRaw,
      verification: normalizeText(row.Verification ?? row.Virefication),
      status: normalizeText(row.Status),
      imported_at: new Date().toISOString(),
    });
  }

  const uniqueUpdates = new Map<number, (typeof updates)[number]>();
  for (const row of updates) uniqueUpdates.set(row.id, row);
  const finalUpdates = Array.from(uniqueUpdates.values());

  console.log(`CSV rows parsed: ${rows.length}`);
  console.log(`Company IDs in CSV: ${ids.length}`);
  console.log(`Matching companies in DB: ${existingById.size}`);
  console.log(`Rows to update: ${finalUpdates.length}`);
  console.log(`Mode: ${opts.dryRun ? 'dry-run' : 'write'}`);

  if (opts.dryRun) return;

  const updateBatchSize = 100;
  for (let i = 0; i < finalUpdates.length; i += updateBatchSize) {
    const chunk = finalUpdates.slice(i, i + updateBatchSize);

    await Promise.all(chunk.map(async (row) => {
      const { error } = await supabase
        .from('companies')
        .update({
          ats_provider: row.ats_provider,
          ats_board_token: row.ats_board_token,
          url: row.url,
        })
        .eq('id', row.id);

      if (error) {
        throw new Error(`Failed updating company ${row.id}: ${error.message}`);
      }
    }));
  }

  // Optional: save raw metadata if the audit table exists.
  if (auditRows.length > 0) {
    const { error } = await supabase
      .from('ats_import_audit')
      .upsert(auditRows, { onConflict: 'company_id' });

    if (error) {
      const legacyAuditRows = auditRows.map(({ sync_provider, ...rest }) => rest);
      const retry = await supabase
        .from('ats_import_audit')
        .upsert(legacyAuditRows, { onConflict: 'company_id' });

      if (retry.error) {
        console.warn(`Warning: could not write ats_import_audit (${retry.error.message}). Continuing.`);
      } else {
        console.log(`Audit rows upserted: ${legacyAuditRows.length} (legacy fallback)`);
      }
    } else {
      console.log(`Audit rows upserted: ${auditRows.length}`);
    }
  }

  console.log('ATS CSV import finished successfully.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
