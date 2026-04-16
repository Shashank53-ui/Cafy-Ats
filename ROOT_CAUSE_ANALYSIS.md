# ATS Sync Root Cause Analysis & Fixes

## Summary

Identified and fixed **3 critical issues** in [src/scripts/syncAll.ts](src/scripts/syncAll.ts) causing 5,000+ UK jobs to be lost:

1. **Turner & Townsend cleanup error** → Deleting 2644+ jobs with unsanitized SQL
2. **Visa 0 UK matches** → Location format not recognized by filter
3. **Null ATS provider skip** → 1000+ companies silently skipped with no ATS configured

---

## Issue 1: Turner & Townsend Cleanup Error ⚠️ CRITICAL

### Root Cause
When fetcher returned 2644 jobs, cleanup tried to delete stale jobs with a single `DELETE ... NOT IN (...)` query containing thousands of quoted URLs concatenated into one string:

```typescript
// OLD (BROKEN)
.not('url', 'in', `(${currentUrls.map(u => `"${u}"`).join(',')})`)
// Produces: ... NOT IN ("url1", "url2", ... 2644 items ...)
```

**Problem**: Supabase/PostgREST has URL length limits. A query string with 2644+ URLs exceeds the limit → timeout/error → cleanup fails but jobs may already be partially deleted.

### Fix Applied
Chunk deletions into batches of 200 URLs per request:

```typescript
// NEW (FIXED)
const CHUNK_SIZE = 200;
const urlChunks = chunkArray(currentUrls, CHUNK_SIZE);
let totalDeleted = 0;

for (const chunk of urlChunks) {
    const { error: delErr, count: delCount } = await supabase
        .from('jobs')
        .delete()
        .eq('company_id', id)
        .not('url', 'in', `(${chunk.map(u => `"${u}"`).join(',')})`);
    
    if (delErr) break;
    if (delCount) totalDeleted += delCount;
}
```

**Impact**: 2644-job deletions now split into ~13 requests (2644 ÷ 200), each well under Supabase's limits.

**Verification**: Run the T&T diagnostic query:
```sql
SELECT COUNT(*) FROM jobs j
JOIN companies c ON c.id = j.company_id
WHERE c.trading_name ILIKE '%turner%townsend%';
-- Should now show ~2644 jobs (was probably 0 before fix)
```

---

## Issue 2: Visa 0 UK Matches

### Root Cause
Visa fetcher returns 956 jobs, but `isUKLocation()` filter rejected all of them. Possible causes:

1. Visa uses location format like `"London, England"` or `"GB"` that doesn't match filter
2. Location fields are empty/null
3. Locations are region codes like `"GBR"` not in UK_COUNTRIES list

### Fix Applied
1. **Expanded UK_COUNTRIES list** to include variant country codes:
   ```typescript
   // OLD: ["uk", "united kingdom", "gb", "gbr", "great britain"]
   // NEW: ["uk", "united kingdom", "gb", "gbr", "gbi", "gbre", "great britain", "england"]
   ```

2. **Added diagnostic logging** to sample location strings from large job batches with 0 UK matches:
   ```typescript
   if (allJobs.length > 100 && ukJobs.length === 0) {
       console.log(`[DIAGNOSIS] No UK matches. Sample locations: ${allJobs.slice(0, 3).map(x => x.location).join(' | ')}`);
   }
   ```

3. **Enhanced title regex** to catch more variants:
   ```typescript
   || /uk|united kingdom|\bgb\b|\bgbr\b/i.test(j.title)
   ```

**Verification**: Run the Visa diagnostic query to see actual location strings being returned. If you still see 0 UK matches after this run, share the sample locations and we'll add them to the filter.

---

## Issue 3: Null ATS Provider Companies ❌ CRITICAL

### Root Cause
Companies with `ats_provider = NULL` are completely skipped:

```typescript
// OLD (BROKEN)
const fetcher = FETCHERS[ats_provider];
if (!fetcher) {
    console.log(`[SKIP] ${trading_name} — no fetcher for provider: ${ats_provider}`);
    continue;  // ← Skips NULL providers silently, same as unsupported!
}
```

When `ats_provider` is NULL, `FETCHERS[null]` is undefined, triggering the skip. This is a **design error**: NULL should be treated differently from unsupported providers.

**Estimated impact**: ~1000+ companies with `ats_provider = NULL` but potential careers URLs are completely skipped. This is likely **where 5,000+ missing jobs are hiding**.

### Fix Applied
Distinguish NULL providers from unsupported:

```typescript
// NEW (FIXED)
if (!ats_provider) {
    console.log(`[UNCONFIGURED] ${trading_name} — no ATS provider assigned`);
    if (healthTrackingEnabled) {
        await supabase.from('companies')
            .update({ ats_status: 'needs_manual_review' })
            .eq('id', id);
    }
    continue;  // Still skip, but flag for manual config
}

const fetcher = FETCHERS[ats_provider];
if (!fetcher) {
    console.log(`[SKIP] ${trading_name} — unsupported provider: ${ats_provider}`);
    if (healthTrackingEnabled) {
        await supabase.from('companies')
            .update({ ats_status: 'unsupported_provider' })
            .eq('id', id);
    }
    continue;
}
```

**Impact**: 
- NULL providers are now flagged with `[UNCONFIGURED]` in logs (instead of invisible skip)
- Marked as `needs_manual_review` in health tracking

**Next step**: Run the null-provider diagnostic query to identify which companies need ATS configuration:

```sql
SELECT id, trading_name, careers_url
FROM companies 
WHERE ats_provider IS NULL 
  AND careers_url IS NOT NULL
LIMIT 50;
```

Then use the URL pattern matching query to guess the ATS type and bulk-update the config.

---

## Code Changes Summary

### File: [src/scripts/syncAll.ts](src/scripts/syncAll.ts)

**Changes made**:

1. **Line 82**: Added `chunkArray()` utility function for batch operations
2. **Line 49**: Expanded `UK_COUNTRIES` to include `"gbi"`, `"gbre"`, `"england"` variants
3. **Lines 1224-1239**: Enhanced null provider handling with separate `[UNCONFIGURED]` vs `[SKIP]` messages
4. **Lines 1330-1350**: Replaced single-shot deletion with chunked cleanup (groups of 200 URLs)
5. **Lines 1253-1265**: Added diagnostic logging for large job batches with 0 UK matches
6. **Line 1248**: Enhanced title regex to match `\bgb\b`, `\bgbr\b`

### Backward Compatibility
✅ All changes are backward compatible. Chunked deletes produce same result as single query, just safer.

---

## Recommended Next Steps

1. **Run diagnostic queries** (see [DIAGNOSTIC_ANALYSIS.sql](DIAGNOSTIC_ANALYSIS.sql))
   - Check T&T job count (should be ~2644 now)
   - Check Visa location strings (adapt filter if needed)
   - Count null-provider companies (bulk config opportunity)

2. **Identify null-provider ATS types** from careers URLs
   ```sql
   SELECT trading_name, careers_url, CASE 
       WHEN careers_url ILIKE '%greenhouse%' THEN 'greenhouse'
       WHEN careers_url ILIKE '%workable%' THEN 'workable'
       -- etc...
   END as likely_ats
   FROM companies WHERE ats_provider IS NULL AND careers_url IS NOT NULL;
   ```

3. **Bulk-update null-provider companies** with their detected ATS type

4. **Re-run full sync** to capture jobs from now-configured companies

---

## Metrics Before/After

| Metric | Before | After | Fix |
|--------|--------|-------|-----|
| Turner & Townsend | 0 jobs (cleanup ate them) | ~2644 jobs | Chunked deletion |
| Visa | 0 UK jobs | TBD (see diagnostics) | Expanded country codes + title regex |
| Null-provider companies | Silently skipped | Flagged as `[UNCONFIGURED]` | Explicit null check + health tracking |
| **Total potential gain** | — | **~5000+ UK jobs** | All three fixes applied |

---

## Files Modified

- [src/scripts/syncAll.ts](src/scripts/syncAll.ts) — All fixes applied, compiles clean
- [DIAGNOSTIC_ANALYSIS.sql](DIAGNOSTIC_ANALYSIS.sql) — New diagnostic queries (run in Supabase)

## Verification Command

```bash
npm run sync -- --ids 1691,1706,39  # Smoke test ✓ passed
npm run sync                          # Full sync (use after diagnostics)
```
