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
    'ballyphehane',
    // Cavan / county-abbrev towns (CN collides with China ISO code)
    'bailieborough', 'kingscourt', 'ballyconnell', 'virginia town', 'cavan town',
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
    'tokyo', 'beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hangzhou', 'chengdu', 'wuhan',
    'nanjing', 'suzhou', 'tianjin', 'chongqing', 'dongguan', 'foshan', 'xian', "xi'an",
    'seoul', 'taipei', 'bangkok', 'zagreb', 'jakarta', 'manila',
    'kuala lumpur', 'ho chi minh',
    'mumbai', 'delhi', 'bangalore', 'bengaluru', 'pune', 'chennai', 'hyderabad', 'kolkata',
    'toronto', 'vancouver', 'montreal', 'sydney', 'melbourne', 'brisbane', 'auckland',
    'johannesburg', 'cape town', 'abu dhabi', 'riyadh', 'doha', 'tel aviv',
    // Colorado / US towns that leaked via trailing ", CO" county false positive
    'boulder', 'breckenridge', 'fort collins', 'colorado springs',
];

/**
 * ATS boards (esp. Workday) emit "CN - Shenzhen", "US - New York" as ISO 3166-1
 * alpha-2 + city. Several of those codes collide with RoI county abbrevs
 * (CN=Cavan, CK=Cork, CW=Carlow, LS=Laois). A leading non-IE ISO code without
 * an Irish place must not pass the county-abbrev path.
 */
const NON_IE_ISO2 = new Set([
    'cn', 'us', 'gb', 'uk', 'de', 'fr', 'nl', 'es', 'it', 'pt', 'pl', 'se', 'no', 'dk', 'fi',
    'ch', 'at', 'be', 'cz', 'hu', 'ro', 'hr', 'sk', 'si', 'lt', 'lv', 'ee', 'gr', 'is', 'mt',
    'bg', 'rs', 'ua', 'ru', 'tr', 'il', 'ae', 'sa', 'qa', 'eg', 'za', 'ng', 'ke', 'gh', 'ma',
    'in', 'pk', 'bd', 'lk', 'np', 'jp', 'kr', 'sg', 'hk', 'tw', 'my', 'th', 'vn', 'id', 'ph',
    'au', 'nz', 'ca', 'mx', 'br', 'ar', 'cl', 'pe', 'co', 'ec', 've', 'pa', 'cr',
    'ls', 'cw', 'ck', 'ky', 'mo', 'mn', // ISO collisions with RoI county abbrevs
]);

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
        .replace(/[()\[\]]/g, ' ')
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
    // Only trust when the town itself is a known Irish place (same stance as Mo/Ky).
    if (/\bco$/.test(combined) && !hasForeignCity(combined) && !/\b(colorado|united states|usa|u\.s)\b/.test(combined)) {
        return hasIrishCitySignal(combined);
    }

    // Two-letter ATS abbreviations. MO/KY/MN collide with US states; CN/LS/CW/CK
    // collide with ISO country codes (China, Lesotho, Curaçao, Cook Islands);
    // WW collides with "worldwide". Only trust those alongside a known Irish city/county.
    // Other RoI abbrevs (Mh, Ce, Wh…) are safe with any non-foreign place token.
    const colliding = new Set(['mo', 'ky', 'mn', 'cn', 'ls', 'cw', 'ck', 'ww']);
    const matched = Object.keys(COUNTY_ABBREVS).filter(abbr => containsLocationPhrase(combined, abbr));
    if (!matched.length) return false;
    if (matched.some(abbr => colliding.has(abbr))) {
        return hasIrishCitySignal(combined) || hasIrishCountyName(combined);
    }
    return !hasForeignCity(combined);
}

// Eircode routing key + unique identifier, e.g. "D02 XY01", "A65F4E2"
const EIRCODE_RE = /\b[a-z]\d{2}\s?[a-z\d]{4}\b/i;

/** US state full names — bare "Ireland" alongside these is not enough.
 *  Excludes "georgia" (collides with the country of Georgia in EMEA multi-loc lists).
 */
const US_STATE_NAMES = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
    'delaware', 'florida', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
    'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
    'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
    'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas',
    'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
];

/**
 * Comma-qualified US state codes on the RAW location string.
 * Excludes co/mo/ky/mn which collide with RoI county abbrevs (handled separately).
 */
const US_ONLY_STATE_CODES =
    'al|ak|az|ar|ca|ct|de|fl|ga|hi|id|il|in|ia|ks|la|md|ma|mi|ms|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc';

/** US state name or ", CA"/", CT" code — Irish city namesakes need extra proof. */
function hasUsStateSignal(combined: string, rawJoined: string): boolean {
    if (US_STATE_NAMES.some(s => containsLocationPhrase(combined, s))) return true;
    // Keep commas on raw so "Dublin, CA" / "Westport, CT" match (normalize strips them).
    if (new RegExp(`,\\s*(${US_ONLY_STATE_CODES})\\b`, 'i').test(rawJoined)) return true;
    return false;
}

/**
 * "Dublin, CA" / "Westport, CT" / "Dublin, Ohio" — Irish namesake immediately
 * qualified by a US state. Multi-loc like "SF, New York, Seattle, Dublin" must NOT match.
 */
const IRISH_US_NAMESAKES = 'dublin|cork|waterford|westport|newport|tralee|killarney|galway|limerick|athlone|sligo|drogheda|dundalk|wexford|carlow|kilkenny|clonmel|naas|navan|bray|shannon';

function isIrishNamesakeQualifiedByUsState(combined: string, rawJoined: string): boolean {
    if (new RegExp(
        `\\b(${IRISH_US_NAMESAKES})\\s*,\\s*(${US_ONLY_STATE_CODES})\\b`,
        'i',
    ).test(rawJoined)) return true;

    // Full state name after namesake with comma: "Dublin, Ohio, United States"
    if (US_STATE_NAMES.some(state =>
        new RegExp(
            `\\b(${IRISH_US_NAMESAKES})\\s*,\\s*${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            'i',
        ).test(rawJoined),
    )) return true;

    // Hyphen/space forms when US country is explicit: "Dublin-Ohio-United States of America"
    // (Do not match multi-loc lists like "Dublin New York London" without a US country term.)
    if (/\b(united states|usa|u\.s\.a?)\b/.test(combined)) {
        return US_STATE_NAMES.some(state =>
            new RegExp(
                `\\b(${IRISH_US_NAMESAKES})\\s+${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            ).test(combined),
        );
    }
    return false;
}

function hasUsCountrySignal(combined: string): boolean {
    return /\b(united states|usa|u\.s\.a?)\b/.test(combined) ||
        /(^|[^a-z])u\.?s\.?a?(?:[^a-z]|$)/i.test(combined);
}

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

function hasIrishCountyName(combined: string): boolean {
    return IRELAND_COUNTIES.some(c =>
        containsLocationPhrase(combined, c) ||
        containsLocationPhrase(combined, `county ${c}`) ||
        containsLocationPhrase(combined, `co ${c}`)
    );
}

/**
 * Workday-style "CN - Shenzhen" / "US - New York" → normalized "cn shenzhen".
 * Leading non-IE ISO2 without an Irish place is treated as foreign.
 * Site-code noise like "Au-Sa-Cavan 1 Month Ago" still counts as foreign ISO.
 */
function hasLeadingNonIeIsoPrefix(combined: string): boolean {
    const m = /^([a-z]{2})\s+(.+)$/.exec(combined);
    if (!m) return false;
    const [, code, rest] = m;
    if (code === 'ie') return false;
    if (!NON_IE_ISO2.has(code)) return false;
    if (hasDefinitiveIrelandSignal(combined)) return false;
    if (hasIrishCitySignal(combined)) return false;
    // County name inside an AU/US/… site code is only trusted without scraper noise.
    if (hasIrishCountyName(combined)) {
        return /\b(months?|weeks?|days?)\s+ago\b/.test(rest) || /\d/.test(rest);
    }
    return true;
}

function isHardBlocked(combined: string, rawJoined: string): boolean {
    // Bare US abbreviations — "U.S. Travelling" normalizes to "u.s. travelling"
    // and does not match HARD_BLOCKS word-boundary checks on "usa".
    if (hasUsCountrySignal(combined) && !/\bireland\b|\béire\b|\beire\b/.test(combined)) {
        return true;
    }
    // NI counties (avoid bare "down" / "armagh" false positives via separate phrases)
    if (/\b(county\s+)?(tyrone|antrim|fermanagh)\b/.test(combined)) return true;
    if (/\bcounty\s+(armagh|down)\b/.test(combined)) return true;
    if (/\b(armagh|omagh)\b/.test(combined) && !hasDefinitiveIrelandSignal(combined)) return true;
    // "CN - Shenzhen" / other ATS ISO-country prefixes
    if (hasLeadingNonIeIsoPrefix(combined)) return true;
    // "Dublin, CA" / "Westport, CT" / "New York, …"
    if (hasUsStateSignal(combined, rawJoined)) return true;
    // Worldwide (WW also collides with Wicklow county abbrev — handled in colliding set)
    if (/\bworldwide\b/.test(combined)) return true;

    return HARD_BLOCKS.some(term => containsLocationPhrase(combined, term));
}

export function isIrelandJob(location: string | null | undefined, locations: string[] = []): boolean {
    const rawCandidates = (location ? [location] : locations)
        .map(value => String(value || '').trim())
        .filter(Boolean);

    if (!rawCandidates.length) return false;

    const rawJoined = rawCandidates.join(' ');
    const candidates = rawCandidates.map(value => normalizeLocation(value)).filter(Boolean);
    if (!candidates.length) return false;

    const combined = candidates.join(' ');

    // Northern Ireland (incl. common typos) is UK — never RoI.
    if (containsLocationPhrase(combined, 'northern ireland')) return false;
    if (/\bnoth?ern?\s+ireland\b/.test(combined)) return false;

    // Scraped ATS garbage timestamps are never real locations.
    if (/\b(\d+\s+)?(months?|weeks?|days?)\s+ago\b/.test(combined)) return false;

    // Bare Eircode is a definitive RoI signal.
    if (EIRCODE_RE.test(combined)) return true;

    // Bare ISO / county codes alone ("CN", "US") are not Ireland locations.
    if (/^[a-z]{2}$/.test(combined) && combined !== 'ie') return false;

    if (isHardBlocked(combined, rawJoined)) {
        // US state name/code handling:
        // - "Dublin, CA" / "Westport, CT" (namesake + state code) → reject
        // - "New York, Ireland" (US state + Ireland word, no Irish place) → reject
        // - "SF, New York, Seattle, Dublin" (multi-loc with Irish city) → accept
        if (hasUsStateSignal(combined, rawJoined)) {
            if (isIrishNamesakeQualifiedByUsState(combined, rawJoined) && !hasDefinitiveIrelandSignal(combined)) {
                return false;
            }
            if (hasIrishCitySignal(combined) || hasIrishCountySignal(combined) || EIRCODE_RE.test(combined)) {
                return true;
            }
            // "New York, Ireland" — Ireland word alone is not enough with a US state
            return false;
        }
        // Foreign city + bare "Ireland" (e.g. "Bordeaux, Ireland") is not enough.
        if (hasForeignCity(combined)) {
            return hasIrishCitySignal(combined) || EIRCODE_RE.test(combined) || hasIrishCountySignal(combined);
        }
        // Leading ISO prefix with no Irish place — reject even if a county abbrev collides.
        if (hasLeadingNonIeIsoPrefix(combined)) return false;
        return hasDefinitiveIrelandSignal(combined);
    }

    return candidates.some(candidate =>
        IRELAND_LOCATION_PHRASES.some(phrase => containsLocationPhrase(candidate, phrase)) ||
        hasIrishCountySignal(candidate)
    );
}
