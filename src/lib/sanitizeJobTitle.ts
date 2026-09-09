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

/** Open-application / talent-pool marketing tokens (not real HR roles). */
const TALENT_BUCKET = 'pool|community|network|pipeline|bank';

/** Open-application / talent-pool marketing prefixes — keep the real role name. */
const TALENT_POOL_PREFIX = new RegExp(
  `^(?:join(?:ing)?\\s+(?:our\\s+)?|extend\\s+)?talent[\\s-]+(?:${TALENT_BUCKET})\\b\\s*[:\\-–|]?\\s*`,
  'i',
);

const TALENT_POOL_SUFFIX = new RegExp(
  `\\s*(?:[\\(\\[|\\-–,]|extend)\\s*(?:extend\\s+)?(?:join(?:ing)?\\s+(?:our\\s+)?)?talent[\\s-]+(?:${TALENT_BUCKET})(?:\\s*\\([^)]*\\))?\\s*[\\)\\]]?\\s*$`,
  'i',
);

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

  // Decorative emoji / stars on marketing banners
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}⭐️⭐]/gu, ' ').replace(/\s+/g, ' ').trim();

  // "Join AECOM's Quantity Surveyor Talent Network" → "Quantity Surveyor"
  t = t
    .replace(
      new RegExp(
        `^join\\s+.+?['’]s\\s+(.+?)\\s+talent[\\s-]+(?:${TALENT_BUCKET})\\s*$`,
        'i',
      ),
      '$1',
    )
    .trim();
  // "Join Scissero's Talent Network" / "Join AlphaSense + Tegus Waterford Talent Community"
  t = t
    .replace(new RegExp(`^join\\s+.+\\s+talent[\\s-]+(?:${TALENT_BUCKET})\\s*$`, 'i'), '')
    .trim();

  // "Join Our Talent Pool/Network/Bank: Lift Engineers" → "Lift Engineers"
  t = t
    .replace(
      new RegExp(
        `^join(?:ing)?\\s+our\\s+talent[\\s-]+(?:${TALENT_BUCKET})\\b\\s*[:\\-–|]?\\s*`,
        'i',
      ),
      '',
    )
    .trim();
  t = t
    .replace(new RegExp(`^(?:future\\s+)?talent[\\s-]+(?:${TALENT_BUCKET})\\b\\s*[:\\-–|]?\\s*`, 'i'), '')
    .trim();
  t = t.replace(TALENT_POOL_PREFIX, '').trim();
  // "Join Our Team: Lift Engineers" → "Lift Engineers"
  t = t.replace(/^join(?:ing)?\s+our\s+team\b\s*[:\-–|]?\s*/i, '').trim();
  // "Candidate Pool: Nurses London" → "Nurses London"
  t = t.replace(/^candidate\s+pool\b\s*[:\-–|]?\s*/i, '').trim();
  // Trailing marketing first: "Game Producer - Talent Pool (EU)" / "... - Join Our Talent Network"
  t = t.replace(TALENT_POOL_SUFFIX, '').trim();
  // "H beauty Chester - Join our Talent Community: Assistant Managers"
  t = t
    .replace(
      new RegExp(
        `\\s*[-–|]\\s*join(?:ing)?\\s+our\\s+talent[\\s-]+(?:${TALENT_BUCKET})\\b\\s*[:\\-–|]?\\s*`,
        'i',
      ),
      ': ',
    )
    .trim();
  t = t
    .replace(
      new RegExp(`\\bjoin(?:ing)?\\s+our\\s+talent[\\s-]+(?:${TALENT_BUCKET})\\b\\s*[:\\-–|]?\\s*`, 'i'),
      '',
    )
    .trim();
  // "We are growing - join our Tax Talent Community - Midlands"
  t = t
    .replace(
      new RegExp(
        `^.+\\bjoin(?:ing)?\\s+our\\s+[\\w&/.,\\s-]{0,40}talent[\\s-]+(?:${TALENT_BUCKET})\\b.*$`,
        'i',
      ),
      '',
    )
    .trim();
  // "Your next opportunity at Flipdish – UK Talent Community"
  t = t
    .replace(
      new RegExp(
        `^.+\\b(next opportunity|always-?on|talent leaders?)\\b.+\\btalent[\\s-]+(?:${TALENT_BUCKET})\\b.*$`,
        'i',
      ),
      '',
    )
    .trim();
  // "… Always-On Talent Pipeline for Paid Media Professionals"
  t = t
    .replace(
      new RegExp(`^.+\\btalent[\\s-]+(?:${TALENT_BUCKET})\\s+for\\b.+$`, 'i'),
      '',
    )
    .trim();
  // "… Talent Leaders Pipeline" / open-application pipeline banners
  t = t.replace(/^.*\btalent\s+leaders?\s+pipeline\b.*$/i, '').trim();
  if (/^future$/i.test(t)) t = '';

  return t.replace(/\s+/g, ' ').trim();
}

/** True when sanitizing leaves nothing usable to store. */
export function isUnusableJobTitle(title: string): boolean {
  const raw = String(title || '').replace(/\s+/g, ' ').trim();
  // "Sales Talent Pool" / "Programming Talent Pool" — marketing buckets, not roles
  if (new RegExp(`^[a-z0-9&/.,\\s-]{1,40}\\s+talent[\\s-]+(?:${TALENT_BUCKET})\\s*$`, 'i').test(raw)) {
    return true;
  }
  const t = sanitizeJobTitle(title);
  if (t.length < 3) return true;
  if (
    new RegExp(
      `^(talent[\\s-]+(?:${TALENT_BUCKET})|future talent[\\s-]+(?:${TALENT_BUCKET})|join(?:ing)? our talent[\\s-]+(?:${TALENT_BUCKET})|join(?:ing)? our team|sales)$`,
      'i',
    ).test(t)
  ) {
    return true;
  }
  if (
    /^(speculative application|general application|open application|cv library|keep in touch|submit your cv|candidate pool)$/i.test(
      t,
    )
  ) {
    return true;
  }
  // Leftover open-application banners that still mention a talent bucket
  if (
    new RegExp(`\\btalent[\\s-]+(?:${TALENT_BUCKET})\\b`, 'i').test(t) &&
    /\b(join|community|opportunity|we are growing|always-?on|pipeline|network)\b/i.test(t) &&
    !/\b(manager|lead|director|partner|specialist|coordinator|head of|acquisition|recruiter)\b/i.test(t)
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
