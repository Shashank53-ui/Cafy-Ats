import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
}

const supabase = createClient(supabaseUrl, serviceRole);

const ALLOWED_COLUMNS = new Set([
  'id',
  'trading_name',
  'companies_house_name',
  'url',
  'url_linkedin',
  'description',
  'policy',
  'open_to_sponsorship',
  'active_jobs_count',
  'url_favicon',
  'licensed_sponsor',
  'estimated_num_employees_label',
  'created_at',
  'updated_at',
  'ats_provider',
  'ats_board_token',
]);

function parseColumns(sql: string): string[] {
  const insertPrefix = 'INSERT INTO "public"."companies"';
  const start = sql.indexOf(insertPrefix);
  if (start === -1) throw new Error('Could not find INSERT INTO public.companies statement');

  const colsStart = sql.indexOf('(', start);
  const valuesKeyword = sql.indexOf(') VALUES', colsStart);
  if (colsStart === -1 || valuesKeyword === -1) {
    throw new Error('Could not parse column list from SQL');
  }

  const colsRaw = sql.slice(colsStart + 1, valuesKeyword);
  return colsRaw
    .split(',')
    .map((c) => c.trim().replace(/^"|"$/g, ''));
}

function extractValuesBlock(sql: string): string {
  const valuesToken = ') VALUES';
  const valuesPos = sql.indexOf(valuesToken);
  if (valuesPos === -1) throw new Error('Could not find VALUES block');

  const start = valuesPos + valuesToken.length;
  let end = sql.lastIndexOf(');');
  if (end === -1) end = sql.lastIndexOf(';');
  if (end === -1 || end <= start) throw new Error('Could not determine end of VALUES block');

  return sql.slice(start, end).trim();
}

function splitTuples(valuesBlock: string): string[] {
  const tuples: string[] = [];
  let inString = false;
  let depth = 0;
  let current = '';

  for (let i = 0; i < valuesBlock.length; i++) {
    const ch = valuesBlock[i];
    const next = valuesBlock[i + 1];

    if (inString) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i++;
        continue;
      }
      if (ch === "'") inString = false;
      continue;
    }

    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }

    if (ch === '(') {
      depth++;
      if (depth === 1) {
        current = '';
        continue;
      }
    }

    if (ch === ')') {
      depth--;
      if (depth === 0) {
        tuples.push(current);
        current = '';
        continue;
      }
    }

    if (depth >= 1) {
      current += ch;
    }
  }

  return tuples;
}

function splitFields(tupleBody: string): string[] {
  const fields: string[] = [];
  let inString = false;
  let current = '';

  for (let i = 0; i < tupleBody.length; i++) {
    const ch = tupleBody[i];
    const next = tupleBody[i + 1];

    if (inString) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i++;
        continue;
      }
      if (ch === "'") inString = false;
      continue;
    }

    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }

    if (ch === ',') {
      fields.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    fields.push(current.trim());
  }

  return fields;
}

function parseValue(token: string): string | number | boolean | null {
  const t = token.trim();
  if (t.toLowerCase() === 'null') return null;

  if (/^(true|false)$/i.test(t)) {
    return t.toLowerCase() === 'true';
  }

  if (/^-?\d+$/.test(t)) {
    return Number(t);
  }

  if (t.startsWith("'") && t.endsWith("'")) {
    const inner = t.slice(1, -1);
    return inner.replace(/''/g, "'");
  }

  return t;
}

function toRow(columns: string[], tupleBody: string): Record<string, any> {
  const fields = splitFields(tupleBody);
  if (fields.length !== columns.length) {
    throw new Error(`Field count mismatch. Expected ${columns.length}, got ${fields.length}`);
  }

  const row: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (!ALLOWED_COLUMNS.has(col)) continue;
    row[col] = parseValue(fields[i]);
  }

  return row;
}

async function run() {
  const sqlPath = path.resolve(process.cwd(), 'companies_rows.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const columns = parseColumns(sql);
  const valuesBlock = extractValuesBlock(sql);
  const tuples = splitTuples(valuesBlock);

  console.log(`Parsed columns: ${columns.length}`);
  console.log(`Parsed tuples: ${tuples.length}`);

  const rows = tuples.map((t) => toRow(columns, t));

  const batchSize = 200;
  let processed = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('companies')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      throw new Error(`Batch ${i / batchSize + 1} failed: ${error.message}`);
    }

    processed += batch.length;
    console.log(`Upserted ${processed}/${rows.length}`);
  }

  console.log('Import completed successfully.');
}

run().catch((e) => {
  console.error('Import failed:', e.message);
  process.exit(1);
});
