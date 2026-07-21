/**
 * Returns true only when a job has an explicit Republic of Ireland location.
 *
 * This deliberately does not inspect the title or department. Those fields can
 * mention a sales territory, team, or customer market without describing where
 * the role is based. Northern Ireland is part of the UK and is excluded.
 *
 * A bare Irish city name is not sufficient on its own once a non-Ireland
 * country/US-state/major-city term is also present in the same string (e.g.
 * "Dublin, Ohio, United States of America", "Dublin, CA") — those cases require
 * an explicit Ireland signal (Ireland/Éire/an Eircode) to be accepted.
 */

const IRELAND_CITIES = [
    'dublin', 'cork', 'limerick', 'galway', 'waterford', 'drogheda', 'kilkenny', 'wexford', 'sligo', 'clonmel',
    'dundalk', 'bray', 'navan', 'ennis', 'tralee', 'carlow', 'naas', 'athlone', 'letterkenny', 'tullamore',
    'killarney', 'arklow', 'cobh', 'castlebar', 'midleton', 'mallow', 'ballina', 'enniscorthy', 'wicklow', 'cavan',
    'athy', 'longford', 'dungarvan', 'nenagh', 'trim', 'new ross', 'thurles', 'youghal', 'monaghan', 'buncrana',
    'ballinasloe', 'fermoy', 'westport', 'carrick on suir', 'kells', 'birr', 'tipperary', 'carrickmacross', 'kinsale', 'listowel',
    'clonakilty', 'cashel', 'macroom', 'castleblayney', 'kilrush', 'skibbereen', 'bundoran', 'templemore', 'clones', 'newbridge',
    'portlaoise', 'mullingar', 'balbriggan', 'greystones', 'leixlip', 'tramore', 'shannon', 'gorey', 'tuam', 'edenderry',
    'bandon', 'passage west', 'loughrea', 'ardee', 'mountmellick', 'bantry', 'muine bheag', 'boyle', 'ballyshannon', 'cootehill',
    'ballybay', 'belturbet', 'lismore', 'kilkee', 'granard',
];

const IRELAND_COUNTRY_TERMS = ['ireland', 'republic of ireland', 'eire', 'éire'];

const IRELAND_LOCATION_PHRASES = [...IRELAND_COUNTRY_TERMS, ...IRELAND_CITIES];

// Non-Ireland countries, US states, and major world cities that share a name with
// (or commonly appear alongside) an Irish town. If any of these appear in the
// combined location string, a bare city match is not trusted on its own — an
// explicit Ireland signal must also be present. Ported from the equivalent
// hard-block list in ukFilter.ts.
const HARD_BLOCKS = [
    // Countries / UK
    'united kingdom', 'england', 'scotland', 'wales', 'great britain', 'uk', 'u.k.', 'gbr',
    'india', 'canada', 'australia', 'singapore', 'germany', 'france', 'netherlands', 'spain',
    'poland', 'uae', 'dubai', 'israel', 'sweden', 'norway', 'denmark', 'finland', 'switzerland',
    'austria', 'belgium', 'italy', 'portugal', 'czech republic', 'hungary', 'romania', 'croatia',
    'south korea', 'japan', 'china', 'hong kong', 'malaysia', 'thailand', 'new zealand',
    'south africa', 'brazil', 'argentina', 'mexico', 'ukraine', 'russia',
    'united states', 'usa', 'u.s.a.',
    // US states (Dublin, Cork, etc. all have namesake towns in several of these)
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
    'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
    'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
    'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
    'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas',
    'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
    // Major non-Ireland cities
    'london', 'manchester', 'birmingham', 'leeds', 'edinburgh', 'glasgow', 'bristol', 'cardiff',
    'belfast', 'liverpool', 'sheffield', 'newcastle',
    'san francisco', 'los angeles', 'chicago', 'boston', 'seattle', 'austin',
    'dallas', 'houston', 'atlanta', 'miami', 'denver', 'portland', 'phoenix', 'las vegas',
    'minneapolis', 'bay area', 'silicon valley',
    'amsterdam', 'berlin', 'munich', 'paris', 'madrid', 'barcelona', 'bordeaux', 'rome', 'milan',
    'brussels', 'vienna', 'zurich', 'geneva', 'stockholm', 'oslo', 'copenhagen', 'helsinki',
    'warsaw', 'prague', 'budapest', 'bucharest', 'lisbon', 'luxembourg',
    'tokyo', 'beijing', 'shanghai', 'seoul', 'taipei', 'bangkok', 'zagreb', 'jakarta', 'manila',
    'kuala lumpur', 'ho chi minh',
    'mumbai', 'delhi', 'bangalore', 'bengaluru', 'pune', 'chennai', 'hyderabad', 'kolkata',
    'toronto', 'vancouver', 'montreal', 'sydney', 'melbourne', 'brisbane', 'auckland',
    'johannesburg', 'cape town', 'abu dhabi', 'riyadh', 'doha', 'tel aviv',
];

function normalizeLocation(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[()\[\]]/g, '')
        .replace(/[\/\-_|,;]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsLocationPhrase(value: string, phrase: string): boolean {
    const normalizedPhrase = normalizeLocation(phrase);
    return new RegExp(`(?:^|\\s)${normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`).test(value);
}

// Eircode routing key + unique identifier, e.g. "D02 XY01", "A65F4E2"
const EIRCODE_RE = /\b[a-z]\d{2}\s?[a-z\d]{4}\b/i;

function hasDefinitiveIrelandSignal(combined: string): boolean {
    if (EIRCODE_RE.test(combined)) return true;
    return IRELAND_COUNTRY_TERMS.some(term => containsLocationPhrase(combined, term));
}

function isHardBlocked(combined: string): boolean {
    return HARD_BLOCKS.some(term => containsLocationPhrase(combined, term));
}

export function isIrelandJob(location: string | null | undefined, locations: string[] = []): boolean {
    const candidates = (location ? [location] : locations)
        .map(value => normalizeLocation(value || ''))
        .filter(Boolean);

    if (!candidates.length) return false;

    const combined = candidates.join(' ');

    if (containsLocationPhrase(combined, 'northern ireland')) return false;

    if (isHardBlocked(combined)) {
        return hasDefinitiveIrelandSignal(combined);
    }

    return candidates.some(candidate => IRELAND_LOCATION_PHRASES.some(phrase => containsLocationPhrase(candidate, phrase)));
}
