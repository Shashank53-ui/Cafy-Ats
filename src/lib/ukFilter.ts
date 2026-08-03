/**
 * ukFilter.ts — Deterministic UK Job Filter
 *
 * Implements a 3-layer pipeline for filtering jobs based on structured location data.
 * Priority: Trusted Source > Remote Flag > UK Geography > Hard Block > Global Signal.
 */

export type JobLocationInput = {
    locations: string[];
    isRemote: boolean;
    isTrustedSource: boolean;
};

// ─── UK Geography ─────────────────────────────────────────────────────────────

const UK_NATIONS = [
    "england", "scotland", "wales", "northern ireland",
];

const UK_COUNTRY_TERMS = [
    "united kingdom", "great britain", "remote uk", "hybrid uk",
    "uk", "u.k.", "gb", "gbr",
];

const UK_CITIES = [
    // Major cities
    "london", "manchester", "birmingham", "leeds", "edinburgh", "glasgow",
    "bristol", "cardiff", "belfast", "liverpool", "sheffield", "newcastle",
    "nottingham", "leicester", "coventry", "brighton", "oxford", "cambridge",
    "bath", "york", "reading", "southampton", "portsmouth",
    // Second-tier cities & towns
    "exeter", "plymouth", "derby", "stoke", "wolverhampton", "hull",
    "sunderland", "middlesbrough", "durham", "carlisle", "chester",
    "peterborough", "northampton", "luton", "swindon", "bournemouth",
    "poole", "basingstoke", "guildford", "woking", "slough", "watford",
    "hemel hempstead", "st albans", "st. albans", "welwyn", "stevenage",
    "hatfield", "harlow", "chelmsford", "ipswich", "norwich", "lincoln", "haverhill",
    "worcester", "gloucester", "hereford", "shrewsbury", "telford",
    "warrington", "bolton", "rochdale", "wigan", "oldham", "stockport",
    "salford", "huddersfield", "bradford", "wakefield", "halifax",
    "doncaster", "rotherham", "barnsley", "grimsby", "scunthorpe",
    "aberdeen", "dundee", "inverness", "stirling", "perth", "paisley",
    "derry", "lisburn", "swansea", "newport", "wrexham",
    "truro", "yeovil", "taunton", "barnstaple", "torquay", "salisbury",
    "winchester", "chichester", "crawley", "horsham", "haywards heath",
    "eastbourne", "hastings", "folkestone", "dover", "maidstone", "tunbridge wells",
    "colchester", "southend", "basildon", "haverhill",
    "wokingham", "bracknell", "farnborough", "aldershot",
    "milton keynes", "aylesbury", "oxford", "banbury",
    "knutsford", "macclesfield", "crewe", "nantwich",
    "leamington spa", "coventry", "rugby", "nuneaton",
    "gateshead", "sunderland", "south shields", "hartlepool",
    "teesside", "stockton",
    // London boroughs and well-known areas
    "canary wharf", "city of london", "croydon", "richmond", "twickenham",
    "wimbledon", "stratford", "shoreditch", "islington", "hackney",
    "hammersmith", "fulham", "chelsea", "kensington", "whitechapel",
    "greenwich", "lewisham", "bromley", "sutton", "kingston",
    // Finance hubs / postcodes commonly seen in job data
    "london ec", "london wc", "london e1", "london e14", "london se1",
    "london n1", "london w1",
    // Regions
    "midlands", "west midlands", "east midlands", "yorkshire", "lancashire",
    "cornwall", "devon", "somerset", "dorset", "east anglia", "suffolk", "norfolk",
    "home counties", "south east", "south west", "north east", "north west",
    "cotswolds", "chilterns", "pennines", "highlands", "lowlands", "borders",
    "east of england",
    // Other specific locations that appear in Workday / ATS data
    "radbroke", "canary wharf", "paddington", "victoria", "waterloo",
    "euston", "king's cross", "kings cross", "london bridge",
];

// ─── Hard Blocks (definitely not UK) ─────────────────────────────────────────

const HARD_BLOCKS = [
    // Countries
    "india", "canada", "australia", "singapore", "germany", "france",
    "netherlands", "spain", "poland", "uae", "dubai", "israel",
    "sweden", "norway", "denmark", "finland", "switzerland", "austria",
    "belgium", "italy", "portugal", "czech republic", "hungary", "romania",
    "croatia",
    "south korea", "japan", "china", "hong kong", "malaysia", "thailand",
    "new zealand", "south africa", "brazil", "argentina", "mexico",
    "ukraine", "russia",
    "armenia", "azerbaijan", "cyprus", "serbia", "bulgaria", "slovakia",
    "slovenia", "lithuania", "latvia", "estonia", "greece", "iceland",
    "malta", "bosnia", "montenegro", "north macedonia", "albania",
    "moldova", "belarus", "kazakhstan",
    "philippines", "vietnam", "indonesia", "pakistan", "bangladesh",
    "sri lanka", "nepal", "egypt", "nigeria", "kenya", "ghana", "morocco",
    "chile", "peru", "ecuador", "venezuela", "colombia", "costa rica", "panama",
    // Ireland (must NOT block "Northern Ireland")
    "dublin", "ireland",
    // US States (full names)
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
    "maine", "maryland", "massachusetts", "michigan", "minnesota",
    "mississippi", "missouri", "montana", "nebraska", "nevada",
    "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
    "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
    "rhode island", "south carolina", "south dakota", "tennessee", "texas",
    "utah", "vermont", "virginia", "washington", "west virginia",
    "wisconsin", "wyoming",
    // Major non-UK cities that could be confused
    "new york", "san francisco", "los angeles", "chicago", "boston",
    "seattle", "austin", "dallas", "houston", "atlanta", "miami",
    "denver", "portland", "phoenix", "las vegas", "minneapolis",
    "amsterdam", "berlin", "munich", "paris", "madrid", "barcelona",
    "rome", "milan", "brussels", "vienna", "zurich", "geneva",
    "stockholm", "oslo", "copenhagen", "helsinki", "warsaw", "prague",
    "budapest", "bucharest", "lisbon", "luxembourg",
    "tokyo", "beijing", "shanghai", "seoul", "taipei", "bangkok", "zagreb",
    "jakarta", "manila", "kuala lumpur", "ho chi minh",
    "mumbai", "delhi", "bangalore", "bengaluru", "pune", "chennai",
    "hyderabad", "kolkata", "noida", "gurugram", "gurgaon", "ahmedabad",
    "toronto", "vancouver", "montreal", "sydney", "melbourne", "brisbane",
    "auckland", "johannesburg", "cape town", "dubai", "abu dhabi",
    "riyadh", "doha", "tel aviv",
    // Extra cities / regions seen in polluted job data
    "porto", "lisboa", "eindhoven", "hoofddorp", "rotterdam", "utrecht", "the hague",
    "philippines", "manila", "sao paulo", "mexico city", "shenzhen", "wellington",
    "new south wales", "nsw",
    // US‑specific terms
    "whippany", "mclean", "plano", "wilmington",
    // US country abbreviations in location strings (e.g. "US - CA - Bay Area")
    "bay area", "silicon valley", "research triangle", "twin cities",
    "united states", "usa", "u.s.a.", "u.s.a", "u.s.", "u.s", "us",
    // Crown Dependencies (not part of the UK for visa-sponsorship purposes)
    "jersey", "guernsey", "isle of man",
    // Broad regional terms — must not pass without an explicit UK term alongside them
    "emea", "apac", "worldwide", "global", "int'l", "international",
    "asia", "europe", "east coast", "namer",
];

// Kept separate from HARD_BLOCKS: a bare "Remote" text signal remains an
// ambiguous pass (unlike EMEA/Global/etc, which are now hard-blocked above).
const AMBIGUOUS_REMOTE_SIGNALS = ["remote"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
    return s.toLowerCase().trim();
}

const UK_GEOGRAPHY_LOWER = [
    ...UK_NATIONS,
    ...UK_COUNTRY_TERMS,
    ...UK_CITIES,
].map(normalize);

const HARD_BLOCKS_LOWER = HARD_BLOCKS.map(normalize);

function isUKTerm(loc: string): boolean {
    const l = normalize(loc);
    // UK postcode pattern: e.g. "EC2V 8RF", "W1A 1AA", "SW1 4RH"
    if (/\b[a-z]{1,2}\d[a-z\d]?\s?\d[a-z]{2}\b/.test(l)) return true;
    // Word-boundary match against full UK geography list
    return UK_GEOGRAPHY_LOWER.some(term => {
        // Use includes for multi-word terms, word boundary regex for single words
        if (term.includes(' ')) return l.includes(term);
        const re = new RegExp(`\\b${term.replace(/\./g, '\\.')}\\b`);
        // Special case: "york" must not match "new york"
        if (term === 'york' && /\bnew\s+york\b/.test(l)) return false;
        // "wales" must not match "New South Wales" (Australia) or US "North Wales, PA"
        if (term === 'wales') {
            if (/\bnew\s+south\s+wales\b/.test(l)) return false;
            if (/\bnorth\s+wales\b/.test(l) && /\b(pennsylvania|\bpa\b|united states|\busa\b|u\.s)/.test(l)) return false;
        }
        // "washington" in UK context is rare — block if it looks like US state
        if (term === 'washington' && /\bwashington\s+(d\.?c\.?|state|dc)\b/.test(l)) return false;
        // "wales" must not match Australia's "New South Wales"
        if (term === 'wales' && /\bnew\s+south\s+wales\b/.test(l)) return false;
        // "england" must not match the US "New England" region
        if (term === 'england' && /\bnew\s+england\b/.test(l)) return false;
        return re.test(l);
    });
}

function isBlockedTerm(loc: string): boolean {
    const l = normalize(loc);
    // Bare US abbreviations — "U.S. Travelling" normalizes to "u.s. travelling"
    // and does not match HARD_BLOCKS word-boundary checks on "usa".
    if (/(^|[^a-z])u\.?s\.?a?(?:[^a-z]|$)/i.test(l) && !/\buk\b|\bu\.k\b|united kingdom|great britain/.test(l)) {
        return true;
    }
    return HARD_BLOCKS_LOWER.some(block => {
        // Never block "northern ireland" via the "ireland" entry
        if (block === 'ireland' && l.includes('northern ireland')) return false;
        // London address "Denmark Hill" is UK, not Denmark
        if (block === 'denmark' && /\bdenmark\s+hill\b/.test(l)) return false;
        // Multi-word OR dotted abbreviations (u.s. / u.s.a.) — includes() is safer than \b
        if (block.includes(' ') || block.includes('.')) return l.includes(block);
        const re = new RegExp(`\\b${block}\\b`);
        return re.test(l);
    });
}

// Checks for unambiguous UK country/nation terms only — NOT generic city names.
// Used when a hard-block is present to avoid false positives like "London, Ontario, Canada".
function hasDefinitiveUKSignal(combined: string): boolean {
    // Strip phrases that embed UK nation names as false positives
    // (New South Wales, US North Wales, New England).
    const c = combined
        .replace(/\bnew\s+south\s+wales\b/g, ' ')
        .replace(/\bnorth\s+wales\b/g, ' ')
        .replace(/\bnew\s+england\b/g, ' ');

    if (/\b[a-z]{1,2}\d[a-z\d]?\s?\d[a-z]{2}\b/.test(c)) return true;
    const definitive = [
        'england', 'scotland', 'wales', 'northern ireland',
        'united kingdom', 'great britain', 'remote uk', 'hybrid uk',
        'uk', 'u\\.k\\.', 'gbr',
    ];
    if (definitive.some(term => new RegExp(`\\b${term}\\b`).test(c))) return true;
    // "London" alone (not "London, Ontario" / "London, Canada") is sufficiently unambiguous
    if (/\blondon\b/.test(c) && !/\blondon[\s,]+(ontario|canada|ohio)\b/.test(c)) return true;
    return false;
}

/** UK city-level signal — used when a foreign hard-block is present so bare "UK"/"England" is not enough */
function hasUkCitySignal(combined: string): boolean {
    const c = combined
        .replace(/\bnew\s+south\s+wales\b/g, ' ')
        .replace(/\bnorth\s+wales\b/g, ' ');

    // Australia shares city names with the UK (Newcastle, Perth, Richmond…).
    // If AU/NSW is present, only accept unambiguous UK hubs.
    if (/\b(australia|\bnsw\b)\b/.test(combined) || /\bnew\s+south\s+wales\b/.test(combined)) {
        return /\b(london|manchester|birmingham|leeds|edinburgh|glasgow|bristol|cardiff|belfast)\b/.test(c);
    }

    // Do NOT treat bare england/scotland/wales/uk as enough here — those appear in polluted foreign rows
    // (e.g. "Hoofddorp, ENGLAND, Netherlands", "New South Wales").
    if (/\blondon\b/.test(c) && !/\blondon[\s,]+(ontario|canada|ohio)\b/.test(c)) return true;
    if (/\bnorthern ireland\b/.test(c)) return true;
    return UK_CITIES.some((city) => {
        const term = normalize(city);
        if (term === 'london') return false; // already handled with ontario carve-out
        // Crown dependencies are hard-blocked above — never treat as UK city signals.
        if (term === 'jersey' || term === 'guernsey' || term === 'isle of man') return false;
        if (term === 'york' && /\bnew\s+york\b/.test(c)) return false;
        if (term.includes(' ')) return c.includes(term);
        return new RegExp(`\\b${term.replace(/\./g, '\\.')}\\b`).test(c);
    });
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function isUKJob(input: JobLocationInput): boolean {
    const { locations, isRemote, isTrustedSource } = input;

    // 1. Trust the source (e.g. facet-filtered Workday results, NHS)
    if (isTrustedSource) return true;

    // 2. Trust an explicit remote flag — but only if no non-UK country is specified.
    // "Remote" or "Remote UK" → accept. "Remote (USA)" / "Remote - Germany" → fall through.
    if (isRemote) {
        const combined = locations.join(' ').toLowerCase();
        const hasNonUKCountry = isBlockedTerm(combined);
        if (!hasNonUKCountry) return true;
        // Has non-UK signal — fall through to geography checks below
    }

    const locs = locations.map(normalize).filter(Boolean);

    // 3. Ambiguous multi-location text ("3 locations", "multiple locations") — allow
    for (const loc of locs) {
        if (/\d+\s+locations?/i.test(loc) || /multiple\s+locations?/i.test(loc)) return true;
    }

    // 4-5. Hard block vs UK geography
    // Check the FULL combined string for hard blocks first. If any hard block is present,
    // city names alone are not sufficient — "London, Ontario, Canada" and "Jersey City, New Jersey"
    // both contain UK city terms but are clearly not UK. Require a definitive nation/country signal.
    const allCombined = locs.join(' ');
    if (isBlockedTerm(allCombined)) {
        // Foreign country / Dublin / NSW present → require a real UK *city* (or Northern Ireland).
        // Bare "United Kingdom" / "England" is not enough (fixes NSW "wales", North Wales PA,
        // "Hoofddorp, ENGLAND, Netherlands", "Dublin, United Kingdom").
        return hasUkCitySignal(allCombined);
    }

    // No hard block — any UK geography term is sufficient
    for (const loc of locs) {
        if (isUKTerm(loc)) return true;
    }

    // 6. Bare "remote" text is still ambiguous — don't reject outright.
    // (EMEA/Global/Worldwide/etc are handled above via HARD_BLOCKS + hasUkCitySignal.)
    for (const loc of locs) {
        if (AMBIGUOUS_REMOTE_SIGNALS.some(s => loc.includes(s))) return true;
    }

    // Default: reject
    return false;
}
