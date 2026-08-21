/**
 * Clean ATS / aggregator junk glued onto job titles.
 * e.g. "Revolut Junior Private Banker Remote added 14-08-2026 View job"
 */
export function sanitizeJobTitle(title: string): string {
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;

  // Aggregator date + CTA (allow truncated "Vie" / glued "LondonView job")
  t = t.replace(
    /\s+added\s+\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s+Vie(?:w)?(?:\s*job)?\s*$/i,
    '',
  );
  t = t.replace(/\s+added\s+\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s*$/i, '');
  t = t.replace(/\s*View\s*job\s*$/i, '');
  // Truncated CTA only when it is clearly the end token (not "Assurance Vie")
  t = t.replace(/\s+Vie\s*$/i, '');

  return t.replace(/\s+/g, ' ').trim();
}
