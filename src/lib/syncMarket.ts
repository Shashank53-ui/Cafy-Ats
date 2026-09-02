/**
 * Sync market resolution — UK vs Ireland vs both.
 * Keep this out of syncAll.ts so it can be unit-tested without loading env/DB.
 *
 * Recurrence guards:
 * - Ireland id range (900000–959999) is Ireland-only by default.
 * - UK licensed sponsors in that range still write UK jobs (`both`).
 * - An explicit `ireland` backfill must not hide UK jobs for licensed sponsors.
 * - LinkedIn companies stay Ireland-only (jobs_IR pipeline).
 */

export type SyncMarket = 'uk' | 'ireland' | 'both';

export function isLicenceTruthy(v: unknown): boolean {
    return v === true || v === 'true' || v === 't' || v === 1 || v === '1';
}

export function inferDefaultSyncMarket(
    id: number | string,
    company?: { licensed_sponsor?: unknown; ats_provider?: string | null },
): SyncMarket {
    const n = Number(id);
    if (String(company?.ats_provider || '').toLowerCase() === 'linkedin') {
        return 'ireland';
    }
    if (n >= 900000 && n < 960000) {
        if (company && isLicenceTruthy(company.licensed_sponsor)) return 'both';
        return 'ireland';
    }
    return 'uk';
}

/**
 * Canonical market for a company row.
 * Licensed UK sponsors are never Ireland-only, even when sync_market was
 * backfilled to `ireland` from the Ireland id-range migration.
 */
export function resolveSyncMarket(company: {
    id: number | string;
    sync_market?: string | null;
    licensed_sponsor?: unknown;
    ats_provider?: string | null;
}): SyncMarket {
    const provider = String(company.ats_provider || '').toLowerCase();
    if (provider === 'linkedin') return 'ireland';

    const explicit = String(company.sync_market || '').toLowerCase();
    if (explicit === 'uk' || explicit === 'ireland' || explicit === 'both') {
        if (explicit === 'ireland' && isLicenceTruthy(company.licensed_sponsor)) {
            return 'both';
        }
        return explicit;
    }
    return inferDefaultSyncMarket(company.id, company);
}
