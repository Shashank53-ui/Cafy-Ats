/**
 * Durable ingest guards — keep bad titles / geo / cross-company URLs out of sync.
 * Used by syncAll (and tests). Keep logic here so scrapers can't bypass it.
 */
import { ALLOWED_SECTORS } from './constants';

const ALLOWED = new Set<string>(ALLOWED_SECTORS as readonly string[]);

/** Job-function labels that must never be stored/used as company industry. */
export const WEAK_COMPANY_SECTOR_LABELS = new Set([
  'Engineering (Software)',
  'Engineering (Hardware)',
  'Engineering (Other)',
  'Data',
  'Product Management',
  'Other',
]);

const SHARED_ATS_HOST_RE =
  /(greenhouse\.io|ashbyhq\.com|lever\.co|workable\.com|myworkdayjobs\.com|smartrecruiters\.com|teamtailor\.com|bamboohr\.com|pinpointhq\.com|breezy\.hr|recruitee\.com|icims\.com|jobvite\.com|personio\.(de|com)|oraclecloud\.com|successfactors\.com|rippling-ats\.com|avature\.net)/i;

const RELOCATE_ABROAD_RE =
  /\brelocate to (australia|singapore|usa|united states|canada|india|germany|france|spain|poland|netherlands|dubai|uae|hong kong|japan|china)\b/i;

export function isRelocateAbroadTitle(title: string): boolean {
  return RELOCATE_ABROAD_RE.test(String(title || ''));
}

/** Strip weak function labels so they cannot poison sector inference. */
export function sanitizeCompanySectorForInference(
  companySector: string | null | undefined,
): string | null {
  const raw = String(companySector || '').trim();
  if (!raw) return null;
  if (WEAK_COMPANY_SECTOR_LABELS.has(raw)) return null;
  // Also block if someone stored an allowlisted function sector as "industry"
  if (ALLOWED.has(raw) && WEAK_COMPANY_SECTOR_LABELS.has(raw)) return null;
  if (
    ALLOWED.has(raw) &&
    /^(Engineering|Data|Product Management|Other)\b/.test(raw)
  ) {
    return null;
  }
  return raw;
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function isSharedAtsHost(host: string): boolean {
  return SHARED_ATS_HOST_RE.test(host);
}

function extractSharedAtsBoardSlug(jobUrl: string): string | null {
  try {
    const u = new URL(jobUrl);
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    if (host.includes('greenhouse.io')) return (parts[0] || '').toLowerCase() || null;
    if (host.includes('ashbyhq.com')) return (parts[0] || '').toLowerCase() || null;
    if (host.includes('lever.co')) return (parts[0] || '').toLowerCase() || null;
    if (host.includes('workable.com')) {
      // apply.workable.com/company or company.workable.com
      const sub = host.split('.')[0];
      if (sub && sub !== 'apply' && sub !== 'jobs') return sub;
      return (parts[0] || '').toLowerCase() || null;
    }
    if (host.includes('smartrecruiters.com')) return (parts[0] || '').toLowerCase() || null;
    return null;
  } catch {
    return null;
  }
}

function roughNameSlug(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * True when the job URL clearly belongs to another employer than `company`
 * (e.g. Molten portfolio page → revolut.com / greenhouse.io/graphcore links).
 */
export function isForeignEmployerJobUrl(
  jobUrl: string,
  company: {
    trading_name?: string | null;
    url?: string | null;
    careers_url?: string | null;
    ats_board_token?: string | null;
  },
): boolean {
  let jobHost: string;
  try {
    const u = new URL(jobUrl);
    jobHost = u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return false;
  }

  const companyHosts = [company.url, company.careers_url]
    .map(hostnameOf)
    .filter((h): h is string => !!h);

  const rawToken = String(company.ats_board_token || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '');
  const token =
    rawToken
      .split('/')[0]
      ?.replace(/\.com$/, '')
      .split('.')[0] || '';

  if (isSharedAtsHost(jobHost)) {
    const boardSlug = extractSharedAtsBoardSlug(jobUrl);
    if (token && boardSlug) {
      if (boardSlug === token || boardSlug.includes(token) || token.includes(boardSlug)) {
        return false;
      }
      return true;
    }
    if (boardSlug) {
      const nameSlug = roughNameSlug(company.trading_name || '');
      if (
        nameSlug &&
        boardSlug.length >= 3 &&
        nameSlug.length >= 3 &&
        boardSlug !== nameSlug &&
        !nameSlug.includes(boardSlug) &&
        !boardSlug.includes(nameSlug)
      ) {
        return true;
      }
    }
    return false;
  }

  if (!companyHosts.length) return false;

  const sameFamily = companyHosts.some(
    (ch) => jobHost === ch || jobHost.endsWith(`.${ch}`) || ch.endsWith(`.${jobHost}`),
  );
  if (sameFamily) return false;

  if (
    /(^|\.)linkedin\.com$|(^|\.)indeed\./i.test(jobHost) ||
    /(^|\.)glassdoor\./i.test(jobHost)
  ) {
    return true;
  }

  return true;
}

export type IngestRejectReason =
  | 'title_relocate_abroad'
  | 'foreign_employer_url'
  | null;

/** Single gate used by sync after title sanitize. */
export function getIngestRejectReason(
  job: { title?: string | null; url?: string | null },
  company: {
    trading_name?: string | null;
    url?: string | null;
    careers_url?: string | null;
    ats_board_token?: string | null;
  },
): IngestRejectReason {
  if (isRelocateAbroadTitle(job.title || '')) return 'title_relocate_abroad';
  if (job.url && isForeignEmployerJobUrl(job.url, company)) return 'foreign_employer_url';
  return null;
}
