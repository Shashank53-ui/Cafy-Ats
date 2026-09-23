/**
 * replaceCompanies.ts
 *
 * 1. Deletes ALL rows from the `companies` table in small batches (avoids statement timeout).
 * 2. Reads companies_rows.csv and inserts every row back in batches of 200.
 *
 * Run: npx tsx src/scripts/replaceCompanies.ts
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);

// ---------- CSV parser (no extra dep needed) ----------

function parseCSV(raw: string): Record<string, string>[] {
    const lines: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '"') {
            if (inQuote && raw[i + 1] === '"') { cur += '"'; i++; }
            else { inQuote = !inQuote; }
        } else if ((ch === "\n" || ch === "\r") && !inQuote) {
            if (ch === "\r" && raw[i + 1] === "\n") i++;
            lines.push(cur);
            cur = "";
        } else {
            cur += ch;
        }
    }
    if (cur.length) lines.push(cur);

    function splitLine(line: string): string[] {
        const fields: string[] = [];
        let f = "";
        let iq = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                if (iq && line[i + 1] === '"') { f += '"'; i++; }
                else { iq = !iq; }
            } else if (c === "," && !iq) { fields.push(f); f = ""; }
            else { f += c; }
        }
        fields.push(f);
        return fields;
    }

    const headers = splitLine(lines[0]);
    const records: Record<string, string>[] = [];
    for (let r = 1; r < lines.length; r++) {
        if (!lines[r].trim()) continue;
        const vals = splitLine(lines[r]);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h.trim()] = vals[i] ?? ""; });
        records.push(obj);
    }
    return records;
}

// ---------- Type helpers ----------

function toNull(v: string | undefined): string | null {
    if (!v || v.toLowerCase() === "null") return null;
    return v;
}
function toBool(v: string | undefined): boolean | null {
    if (!v || v.toLowerCase() === "null") return null;
    const s = v.trim().toLowerCase();
    if (["true","t","1","yes"].includes(s)) return true;
    if (["false","f","0","no"].includes(s)) return false;
    return null;
}
function toInt(v: string | undefined): number | null {
    if (!v || v.toLowerCase() === "null") return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
}

function mapRow(raw: Record<string, string>): Record<string, unknown> {
    return {
        id:                            toInt(raw["id"]),
        trading_name:                  toNull(raw["trading_name"]),
        companies_house_name:          toNull(raw["companies_house_name"]),
        url:                           toNull(raw["url"]),
        url_linkedin:                  toNull(raw["url_linkedin"]),
        description:                   toNull(raw["description"]),
        policy:                        toNull(raw["policy"]),
        open_to_sponsorship:           toBool(raw["open_to_sponsorship"]),
        active_jobs_count:             toInt(raw["active_jobs_count"]),
        url_favicon:                   toNull(raw["url_favicon"]),
        licensed_sponsor:              toBool(raw["licensed_sponsor"]),
        estimated_num_employees_label: toNull(raw["estimated_num_employees_label"]),
        ats_provider:                  toNull(raw["ats_provider"]),
        ats_board_token:               toNull(raw["ats_board_token"]),
        careers_url:                   toNull(raw["careers_url"]),
        linkedin_id:                   toNull(raw["linkedin_id"]),
        ats_status:                    toNull(raw["ats_status"]),
        ats_last_validated:            toNull(raw["ats_last_validated"]),
        ats_failure_count:             toInt(raw["ats_failure_count"]),
        created_at:                    toNull(raw["created_at"]),
        updated_at:                    toNull(raw["updated_at"]),
        cos_used_count_2025:           toInt(raw["cos_used_count_2025"]),
        sponsored_employees_count:     toInt(raw["sponsored_employees_count"]),
        show_recently_added_badge:     toBool(raw["show_recently_added_badge"]),
        added_to_register:             toBool(raw["added_to_register"]),
        favicon_id:                    toInt(raw["favicon_id"]),
        company_sector:                toNull(raw["company_sector"]),
        sync_market:                   toNull(raw["sync_market"]),
    };
}

// ---------- Delete ALL rows in batches of 500 (by id range) ----------

async function deleteAllInBatches() {
    // First fetch all IDs so we know what to delete
    let allIds: number[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
        const { data, error } = await supabase
            .from("companies")
            .select("id")
            .range(from, from + PAGE - 1);
        if (error) throw new Error("Failed to fetch IDs: " + error.message);
        if (!data || data.length === 0) break;
        allIds = allIds.concat(data.map((r: { id: number }) => r.id));
        if (data.length < PAGE) break;
        from += PAGE;
    }

    console.log(`Found ${allIds.length} existing rows to delete`);
    if (allIds.length === 0) return;

    const DEL_BATCH = 100;
    let deleted = 0;
    for (let i = 0; i < allIds.length; i += DEL_BATCH) {
        const ids = allIds.slice(i, i + DEL_BATCH);
        const { error } = await supabase.from("companies").delete().in("id", ids);
        if (error) throw new Error(`Delete batch failed: ${error.message}`);
        deleted += ids.length;
        process.stdout.write(`\rDeleted ${deleted}/${allIds.length}...`);
        await new Promise(r => setTimeout(r, 200));
    }
    console.log(`\nAll ${deleted} rows deleted.`);
}

// ---------- Main ----------

async function main() {
    const csvPath = path.resolve(process.cwd(), "companies_rows.csv");
    console.log("Reading CSV:", csvPath);
    const raw = fs.readFileSync(csvPath, "utf-8");
    const records = parseCSV(raw);
    console.log(`Parsed ${records.length} rows from CSV`);
    const rows = records.map(mapRow);

    // Step 1: delete all existing rows in batches
    console.log("\nDeleting all existing companies (batched)...");
    await deleteAllInBatches();

    // Step 2: insert in batches of 200
    console.log("\nUploading new rows...");
    const BATCH = 200;
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from("companies").insert(batch);
        if (error) {
            console.error(`\nBatch ${Math.floor(i / BATCH) + 1} FAILED (rows ${i + 1}-${i + batch.length}):`, error.message);
            // Print first failing row for debugging
            console.error("First row in batch:", JSON.stringify(batch[0]).slice(0, 300));
            failed += batch.length;
        } else {
            inserted += batch.length;
            process.stdout.write(`\rUploaded ${inserted}/${rows.length}...`);
        }
    }

    console.log(`\n\nDone! Inserted: ${inserted}  |  Failed: ${failed}`);
    if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });




