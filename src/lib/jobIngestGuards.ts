/**
 * Durable ingest guards — keep bad titles / geo / cross-company URLs out of sync.
 * Used by syncAll (and tests). Keep logic here so scrapers can't bypass it.
 */
import { ALLOWED_SECTORS } from './constants';
import { urlSignalsForeignWorkLocation } from './foreignLocationLeak';

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

/** Recruiter headlines that place the worksite abroad without "relocate to". */
const RELOCATE_ABROAD_EXTRA =
  /\b(fast[-\s]?track.{0,50}australia|move to australia|australia.{0,40}(fast[-\s]?track|pathway)|(?:gp|general practitioners?|anaesthetists?|anesthetists?|paediatricians?|pediatricians?).{0,40}australia|construction worker.{0,80}canada|roads and bridges.{0,40}canada)\b/i;

export function isRelocateAbroadTitle(title: string): boolean {
  const t = String(title || '');
  return RELOCATE_ABROAD_RE.test(t) || RELOCATE_ABROAD_EXTRA.test(t);
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

/**
 * Board slug from ats_board_token. Full careers URLs (Wix, etc.) must not
 * collapse to "www" / a hostname fragment — that is not an ATS board slug.
 */
function companyAtsBoardSlug(raw: string | null | undefined): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || SHARED_ATS_HOST_RE.test(trimmed)) {
    const urlish = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return extractSharedAtsBoardSlug(urlish) || '';
  }
  return trimmed.toLowerCase().split('/')[0]?.split('?')[0] || '';
}

const GENERIC_ATS_PATH_SLUGS = new Set([
  'j',
  'job',
  'jobs',
  'company',
  'careers',
  'career',
  'role',
  'roles',
  'posting',
  'postings',
  'en',
  'en-gb',
  'uk',
  'apply',
]);

function usableBoardSlug(raw: string | null | undefined): string | null {
  const slug = String(raw || '').toLowerCase().trim();
  if (!slug || slug.length < 2) return null;
  if (GENERIC_ATS_PATH_SLUGS.has(slug)) return null;
  return slug;
}

export function extractSharedAtsBoardSlug(jobUrl: string): string | null {
  try {
    const u = new URL(jobUrl);
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    if (host.includes('greenhouse.io')) {
      const fromQuery = u.searchParams.get('gh_board') || u.searchParams.get('for');
      return usableBoardSlug(fromQuery) || usableBoardSlug(parts[0]);
    }
    if (host.includes('ashbyhq.com')) return usableBoardSlug(parts[0]);
    if (host.includes('lever.co')) return usableBoardSlug(parts[0]);
    if (host.includes('workable.com')) {
      // apply.workable.com/company/j/CODE  or company.workable.com
      // apply.workable.com/j/CODE is a short link — not a board slug.
      const sub = host.split('.')[0];
      if (sub && sub !== 'apply' && sub !== 'jobs' && sub !== 'www') return usableBoardSlug(sub);
      return usableBoardSlug(parts[0]);
    }
    if (host.includes('smartrecruiters.com')) return usableBoardSlug(parts[0]);
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

  const token = companyAtsBoardSlug(company.ats_board_token);

  if (isSharedAtsHost(jobHost)) {
    const boardSlug = extractSharedAtsBoardSlug(jobUrl);
    if (token && boardSlug) {
      if (
        boardSlug === token ||
        (token.length >= 3 && boardSlug.includes(token)) ||
        (boardSlug.length >= 3 && token.includes(boardSlug))
      ) {
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
  | 'foreign_url_geo'
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
  if (urlSignalsForeignWorkLocation(job.url)) return 'foreign_url_geo';
  return null;
}
