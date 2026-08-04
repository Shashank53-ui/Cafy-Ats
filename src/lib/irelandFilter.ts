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

/** 26 counties of the Republic of Ireland (not NI). */
const IRELAND_COUNTIES = [
    'carlow', 'cavan', 'clare', 'cork', 'donegal', 'dublin', 'galway', 'kerry',
    'kildare', 'kilkenny', 'laois', 'leitrim', 'limerick', 'longford', 'louth',
    'mayo', 'meath', 'monaghan', 'offaly', 'roscommon', 'sligo', 'tipperary',
    'waterford', 'westmeath', 'wexford', 'wicklow',
];

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
    // Suburbs / towns commonly seen in ATS location strings
    'ashbourne', 'athenry', 'blanchardstown', 'tallaght', 'dundrum', 'sandyford', 'swords', 'lucan',
    'kilcullen', 'portarlington', 'carrigaline', 'oldcastle', 'stradbally', 'roundwood',
    'park west', 'parkwest', 'santry', 'clongriffin', 'citywest', 'cherrywood', 'rathfarnham', 'stillorgan',
    'blackrock', 'dun laoghaire', 'dún laoghaire', 'howth', 'malahide', 'portmarnock', 'balgriffin',
    'celbridge', 'maynooth', 'clonshaugh', 'finglas', 'cabra', 'phibsborough', 'rathmines',
    'ranelagh', 'ballsbridge', 'docklands', 'ifsc', 'silicon docks', 'duleek', 'belview',
    'dunboyne', 'skerries', 'ringaskiddy', 'mahon', 'cloughvalley', 'townparks',
    'carrick on shannon', 'carrick-on-shannon', 'carrigtwohill', 'carrigtohill',
    // Towns / suburbs seen in production that the filter previously missed
    'sallynoggin', 'kenmare', 'crosshaven', 'aghada', 'ballinspittle', 'belgooly',
    'dunmanway', 'loughbeg', 'summerhill', 'skryne', 'kildysart', 'carrickmines',
    'roscrea', 'killeagh', 'gaillimh', 'kenmare old', 'inch',
    'lahinch', 'donacarney', 'clonmellon', 'lismullen', 'kilmessan', 'screen',
    'kildalkey', 'ratoath', 'tang', 'abbeyleix', 'mount temple', 'ballygarvan',
];

/** RoI provinces — avoid bare "ulster" (includes NI). */
const IRELAND_PROVINCES = ['leinster', 'munster', 'connacht', 'connaught'];

const IRELAND_COUNTRY_TERMS = ['ireland', 'republic of ireland', 'eire', 'éire'];

const IRELAND_LOCATION_PHRASES = [
    ...IRELAND_COUNTRY_TERMS,
    ...IRELAND_PROVINCES,
    ...IRELAND_COUNTIES,
    ...IRELAND_CITIES,
];

/** Foreign cities only — used to reject typos like "Bordeaux, Ireland". */
const FOREIGN_CITIES = [
    'london', 'manchester', 'birmingham', 'leeds', 'edinburgh', 'glasgow', 'bristol', 'cardiff',
    'belfast', 'liverpool', 'sheffield', 'newcastle', 'oxford', 'norfolk', 'omagh', 'derry', 'londonderry',
    'lisburn', 'newry', 'armagh', 'craigavon', 'coleraine', 'bangor',
    'san francisco', 'los angeles', 'chicago', 'boston', 'seattle', 'austin',
    'dallas', 'houston', 'atlanta', 'miami', 'denver', 'portland', 'phoenix', 'las vegas',
    'minneapolis', 'bay area', 'silicon valley',
    'amsterdam', 'berlin', 'munich', 'paris', 'madrid', 'barcelona', 'bordeaux', 'rome', 'milan',
    'brussels', 'vienna', 'zurich', 'geneva', 'stockholm', 'oslo', 'copenhagen', 'helsinki',
    'warsaw', 'prague', 'budapest', 'bucharest', 'lisbon', 'luxembourg', 'frankfurt',
    'atlanta', 'memphis', 'nashville', 'charlotte', 'detroit', 'philadelphia', 'san diego',
    'tokyo', 'beijing', 'shanghai', 'seoul', 'taipei', 'bangkok', 'zagreb', 'jakarta', 'manila',
    'kuala lumpur', 'ho chi minh',
    'mumbai', 'delhi', 'bangalore', 'bengaluru', 'pune', 'chennai', 'hyderabad', 'kolkata',
    'toronto', 'vancouver', 'montreal', 'sydney', 'melbourne', 'brisbane', 'auckland',
    'johannesburg', 'cape town', 'abu dhabi', 'riyadh', 'doha', 'tel aviv',
];

// Non-Ireland countries, US states, and major world cities that share a name with
// (or commonly appear alongside) an Irish town. If any of these appear in the
// combined location string, a bare city match is not trusted on its own — an
// explicit Ireland signal must also be present. Ported from the equivalent
// hard-block list in ukFilter.ts.
const HARD_BLOCKS = [
    // Countries / UK
    'united kingdom', 'england', 'scotland', 'wales', 'great britain', 'uk', 'u.k.', 'gbr',
    'northern ireland', 'tyrone', 'antrim', 'fermanagh',
    'india', 'canada', 'australia', 'singapore', 'germany', 'france', 'netherlands', 'spain',
    'poland', 'uae', 'dubai', 'israel', 'sweden', 'norway', 'denmark', 'finland', 'switzerland',
    'austria', 'belgium', 'italy', 'portugal', 'czech republic', 'hungary', 'romania', 'croatia',
    'south korea', 'japan', 'china', 'hong kong', 'malaysia', 'thailand', 'new zealand',
    'south africa', 'brazil', 'argentina', 'mexico', 'ukraine', 'russia',
    'united states', 'usa', 'u.s.a.', 'u.s.a', 'u.s.', 'u.s', 'us',
    'porto', 'lisboa', 'holland', 'europe', 'emea', 'apac', 'latam',
    'armenia', 'azerbaijan', 'cyprus', 'serbia', 'bulgaria', 'slovakia',
    'slovenia', 'lithuania', 'latvia', 'estonia', 'greece', 'iceland',
    'malta', 'bosnia', 'montenegro', 'north macedonia', 'albania',
    'moldova', 'belarus', 'kazakhstan',
    'philippines', 'vietnam', 'indonesia', 'pakistan', 'bangladesh',
    'sri lanka', 'nepal', 'egypt', 'nigeria', 'kenya', 'ghana', 'morocco',
    'chile', 'peru', 'ecuador', 'venezuela', 'colombia', 'costa rica', 'panama',
    // US states (Dublin, Cork, etc. all have namesake towns in several of these)
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
    'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
    'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
    'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
    'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas',
    'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
    // Major non-Ireland cities
    ...FOREIGN_CITIES,
];

function normalizeLocation(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[()\[\]]/g, '')
        .replace(/\./g, ' ')
        .replace(/[\/\-_|,;:+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsLocationPhrase(value: string, phrase: string): boolean {
    const normalizedPhrase = normalizeLocation(phrase);
    return new RegExp(`(?:^|\\s)${normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`).test(value);
}

/** Common ATS county abbreviations (e.g. "Dunboyne, Mh" = Meath). */
const COUNTY_ABBREVS: Record<string, string> = {
    mh: 'meath',
    mn: 'monaghan',
    ke: 'kildare',
    kk: 'kilkenny',
    ls: 'laois',
    lm: 'leitrim',
    lk: 'limerick',
    ld: 'longford',
    lh: 'louth',
    mo: 'mayo',
    oy: 'offaly',
    rn: 'roscommon',
    so: 'sligo',
    ta: 'tipperary',
    wd: 'waterford',
    wh: 'westmeath',
    wx: 'wexford',
    ww: 'wicklow',
    cn: 'cavan',
    cw: 'carlow',
    ce: 'clare',
    ck: 'cork',
    dl: 'donegal',
    ky: 'kerry',
};

/** "County Meath", "Co. Clare", "Co Kildare", "Co.Kildare", "Mh" */
function hasIrishCountySignal(combined: string): boolean {
    if (IRELAND_COUNTIES.some(c =>
        containsLocationPhrase(combined, c) ||
        containsLocationPhrase(combined, `county ${c}`) ||
        containsLocationPhrase(combined, `co ${c}`)
    )) return true;

    // Trailing ATS "Town, Co" (= County, county name omitted) — not Colorado.
    if (/\bco$/.test(combined) && !hasForeignCity(combined) && !/\b(colorado|united states|usa|u\.s)\b/.test(combined)) {
        return true;
    }

    // Two-letter ATS abbreviations. MO/KY/MN collide with US states — only trust
    // those alongside a known Irish city/town. Other RoI abbrevs (Mh, Ce, Wh…)
    // are safe with any non-foreign place token.
    const colliding = new Set(['mo', 'ky', 'mn']);
    const matched = Object.keys(COUNTY_ABBREVS).filter(abbr => containsLocationPhrase(combined, abbr));
    if (!matched.length) return false;
    if (matched.some(abbr => colliding.has(abbr))) {
        return hasIrishCitySignal(combined);
    }
    return !hasForeignCity(combined);
}

// Eircode routing key + unique identifier, e.g. "D02 XY01", "A65F4E2"
const EIRCODE_RE = /\b[a-z]\d{2}\s?[a-z\d]{4}\b/i;

function hasDefinitiveIrelandSignal(combined: string): boolean {
    if (EIRCODE_RE.test(combined)) return true;
    return IRELAND_COUNTRY_TERMS.some(term => containsLocationPhrase(combined, term));
}

function hasIrishCitySignal(combined: string): boolean {
    return IRELAND_CITIES.some(city => containsLocationPhrase(combined, city));
}

function hasForeignCity(combined: string): boolean {
    return FOREIGN_CITIES.some(city => containsLocationPhrase(combined, city));
}

function isHardBlocked(combined: string): boolean {
    // Bare US abbreviations — "U.S. Travelling" normalizes to "u.s. travelling"
    // and does not match HARD_BLOCKS word-boundary checks on "usa".
    if (/(^|[^a-z])u\.?s\.?a?(?:[^a-z]|$)/i.test(combined) && !/\bireland\b|\béire\b|\beire\b/.test(combined)) {
        return true;
    }
    // NI counties (avoid bare "down" / "armagh" false positives via separate phrases)
    if (/\b(county\s+)?(tyrone|antrim|fermanagh)\b/.test(combined)) return true;
    if (/\bcounty\s+(armagh|down)\b/.test(combined)) return true;
    if (/\b(armagh|omagh)\b/.test(combined) && !hasDefinitiveIrelandSignal(combined)) return true;

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
        // Foreign city + bare "Ireland" (e.g. "Bordeaux, Ireland") is not enough —
        // require a real Irish city, county, or Eircode. Country/state hard-blocks still use
        // the definitive Ireland country/Eircode signal (covers "Dublin, Ohio, US").
        if (hasForeignCity(combined)) {
            return hasIrishCitySignal(combined) || EIRCODE_RE.test(combined) || hasIrishCountySignal(combined);
        }
        return hasDefinitiveIrelandSignal(combined);
    }

    return candidates.some(candidate =>
        IRELAND_LOCATION_PHRASES.some(phrase => containsLocationPhrase(candidate, phrase)) ||
        hasIrishCountySignal(candidate)
    );
}
