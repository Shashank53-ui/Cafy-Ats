/**
 * Clean ATS / aggregator junk glued onto job titles.
 * e.g. "Revolut Junior Private Banker Remote added 14-08-2026 View job"
 *      "FieldDeployed GxP DirectorMenlo Park, CaliforniaView role→"
 *      "Join Our Talent Pool: Lift Engineers in London"
 */
const CTA_SUFFIX =
  /(?:view\s*(?:role|job|details|opening|vacancy)|apply\s*now|read\s*more|learn\s*more)\s*[→↗»]?\s*$/i;

const US_CITY_STATE_TAIL =
  /((?:Menlo Park|Palo Alto|Mountain View|Redwood City|Santa Clara|Sunnyvale|San Francisco|Los Angeles|San Diego|New York City|New York|Boston|Chicago|Seattle|Austin|Dallas|Houston|Atlanta|Miami|Denver|Portland|Phoenix|Raleigh|Durham|Cambridge|McLean|Reston)\s*,\s*(?:California|New York|Texas|Massachusetts|North Carolina|Virginia|Florida|Illinois|Washington|Colorado|Georgia|Pennsylvania|Ohio|Michigan|Arizona|Oregon|Maryland|New Jersey|Connecticut|CA|NY|TX|MA|NC|VA|FL|IL|WA|CO|GA|PA|OH|MI|AZ|OR|MD|NJ|CT))\s*$/i;

/** Open-application / talent-pool marketing prefixes — keep the real role name. */
const TALENT_POOL_PREFIX =
  /^(?:join(?:ing)?\s+(?:our\s+)?|extend\s+)?talent[\s-]+(?:pool|community)\b\s*[:\-–|]?\s*/i;

const TALENT_POOL_SUFFIX =
  /\s*(?:[\(\[|\-–,]|extend)\s*(?:extend\s+)?(?:join(?:ing)?\s+(?:our\s+)?)?talent[\s-]+(?:pool|community|network|pipeline)(?:\s*\([^)]*\))?\s*[\)\]]?\s*$/i;

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

  // "Join Our Talent Pool: Lift Engineers" → "Lift Engineers"
  t = t.replace(/^join(?:ing)?\s+our\s+talent[\s-]+(?:pool|community)\b\s*[:\-–|]?\s*/i, '').trim();
  t = t.replace(/^(?:future\s+)?talent[\s-]+(?:pool|community)\b\s*[:\-–|]?\s*/i, '').trim();
  t = t.replace(TALENT_POOL_PREFIX, '').trim();
  // "H beauty Chester - Join our Talent Community: Assistant Managers"
  t = t.replace(/\s*[-–|]\s*join(?:ing)?\s+our\s+talent[\s-]+(?:pool|community)\b\s*[:\-–|]?\s*/i, ': ').trim();
  t = t.replace(/\bjoin(?:ing)?\s+our\s+talent[\s-]+(?:pool|community)\b\s*[:\-–|]?\s*/i, '').trim();
  // "Game Producer - Talent Pool (EU)" → "Game Producer"
  t = t.replace(TALENT_POOL_SUFFIX, '').trim();
  if (/^future$/i.test(t)) t = '';

  return t.replace(/\s+/g, ' ').trim();
}

/** True when sanitizing leaves nothing usable to store. */
export function isUnusableJobTitle(title: string): boolean {
  const raw = String(title || '').replace(/\s+/g, ' ').trim();
  // "Sales Talent Pool" / "Programming Talent Pool" — marketing buckets, not roles
  if (/^[a-z0-9&/.,\s-]{1,40}\s+talent[\s-]+(?:pool|community)\s*$/i.test(raw)) {
    return true;
  }
  const t = sanitizeJobTitle(title);
  if (t.length < 3) return true;
  if (
    /^(talent[\s-]+(?:pool|community)|future talent[\s-]+(?:pool|community)|join(?:ing)? our talent[\s-]+(?:pool|community)|sales)$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /we[’']ll help accelerate|learning opportunities so you can|career growthwe/i.test(
      title,
    )
  ) {
    return true;
  }
  return false;
}
