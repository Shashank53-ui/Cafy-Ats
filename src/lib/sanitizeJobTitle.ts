/**
 * Clean ATS / aggregator junk glued onto job titles.
 * e.g. "Revolut Junior Private Banker Remote added 14-08-2026 View job"
 *      "FieldDeployed GxP DirectorMenlo Park, CaliforniaView role→"
 */
const CTA_SUFFIX =
  /(?:view\s*(?:role|job|details|opening|vacancy)|apply\s*now|read\s*more|learn\s*more)\s*[→↗»]?\s*$/i;

const US_CITY_STATE_TAIL =
  /((?:Menlo Park|Palo Alto|Mountain View|Redwood City|Santa Clara|Sunnyvale|San Francisco|Los Angeles|San Diego|New York City|New York|Boston|Chicago|Seattle|Austin|Dallas|Houston|Atlanta|Miami|Denver|Portland|Phoenix|Raleigh|Durham|Cambridge|McLean|Reston)\s*,\s*(?:California|New York|Texas|Massachusetts|North Carolina|Virginia|Florida|Illinois|Washington|Colorado|Georgia|Pennsylvania|Ohio|Michigan|Arizona|Oregon|Maryland|New Jersey|Connecticut|CA|NY|TX|MA|NC|VA|FL|IL|WA|CO|GA|PA|OH|MI|AZ|OR|MD|NJ|CT))\s*$/i;

export function sanitizeJobTitle(title: string): string {
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;

  t = t.replace(/[→↗»]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Aggregator date + CTA (allow truncated "Vie" / glued "LondonView job")
  t = t.replace(
    /\s+added\s+\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s+Vie(?:w)?(?:\s*job)?\s*$/i,
    '',
  );
  t = t.replace(/\s+added\s+\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s*$/i, '');

  // Glued CTA / role-family words: LondonView, MemberForward, FieldDeployed
  t = t.replace(/(?<=[a-z])(View)\b/g, ' $1');
  t = t.replace(/(?<=[a-z]{2})(Forward|Deployed)\b/g, ' $1');
  t = t.replace(/\bFieldDeployed\b/g, 'Field Deployed');
  t = t.replace(/\bForwardDeployed\b/g, 'Forward Deployed');

  t = t.replace(CTA_SUFFIX, '');
  t = t.replace(/\s*View\s*job\s*$/i, '');
  t = t.replace(/\s+Vie\s*$/i, '');

  t = t.replace(new RegExp(`([a-z])${US_CITY_STATE_TAIL.source}`, 'i'), '$1');
  t = t.replace(US_CITY_STATE_TAIL, '');

  return t.replace(/\s+/g, ' ').trim();
}

/** True when sanitizing leaves nothing usable to store. */
export function isUnusableJobTitle(title: string): boolean {
  const t = sanitizeJobTitle(title);
  if (t.length < 3) return true;
  if (
    /we[’']ll help accelerate|learning opportunities so you can|career growthwe/i.test(
      title,
    )
  ) {
    return true;
  }
  return false;
}
