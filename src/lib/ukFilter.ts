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
    "hatfield", "harlow", "chelmsford", "ipswich", "norwich", "lincoln",
    "worcester", "gloucester", "hereford", "shrewsbury", "telford",
    "warrington", "bolton", "rochdale", "wigan", "oldham", "stockport",
    "salford", "huddersfield", "bradford", "wakefield", "halifax",
    "doncaster", "rotherham", "barnsley", "grimsby", "scunthorpe",
    "aberdeen", "dundee", "inverness", "stirling", "perth", "paisley",
    "derry", "lisburn", "swansea", "newport", "wrexham",
    "truro", "yeovil", "taunton", "barnstaple", "torquay", "salisbury",
    "winchester", "chichester", "crawley", "horsham", "haywards heath",
    "eastbourne", "hastings", "folkestone", "dover", "maidstone", "tunbridge wells",
    "colchester", "southend", "basildon",
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
    // Channel Islands / Crown dependencies (UK-adjacent for employment purposes)
    "jersey", "guernsey", "isle of man",
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
    "south korea", "japan", "china", "hong kong", "malaysia", "thailand",
    "new zealand", "south africa", "brazil", "argentina", "mexico",
    "ukraine", "russia",
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
    "tokyo", "beijing", "shanghai", "seoul", "taipei", "bangkok",
    "jakarta", "manila", "kuala lumpur", "ho chi minh",
    "mumbai", "delhi", "bangalore", "bengaluru", "pune", "chennai",
    "hyderabad", "kolkata", "noida", "gurugram", "gurgaon", "ahmedabad",
    "toronto", "vancouver", "montreal", "sydney", "melbourne", "brisbane",
    "auckland", "johannesburg", "cape town", "dubai", "abu dhabi",
    "riyadh", "doha", "tel aviv",
    // US‑specific terms
    "whippany", "mclean", "plano", "wilmington",
];

const GLOBAL_SIGNALS = ["global", "worldwide", "international", "emea", "remote"];

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
        // "washington" in UK context is rare — block if it looks like US state
        if (term === 'washington' && /\bwashington\s+(d\.?c\.?|state|dc)\b/.test(l)) return false;
        return re.test(l);
    });
}

function isBlockedTerm(loc: string): boolean {
    const l = normalize(loc);
    return HARD_BLOCKS_LOWER.some(block => {
        // Never block "northern ireland" via the "ireland" entry
        if (block === 'ireland' && l.includes('northern ireland')) return false;
        if (block.includes(' ')) return l.includes(block);
        const re = new RegExp(`\\b${block}\\b`);
        return re.test(l);
    });
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function isUKJob(input: JobLocationInput): boolean {
    const { locations, isRemote, isTrustedSource } = input;

    // 1. Trust the source (e.g. facet-filtered Workday results, NHS)
    if (isTrustedSource) return true;

    // 2. Trust an explicit remote flag
    if (isRemote) return true;

    const locs = locations.map(normalize).filter(Boolean);

    // 3. Ambiguous multi-location text ("3 locations", "multiple locations") — allow
    for (const loc of locs) {
        if (/\d+\s+locations?/i.test(loc) || /multiple\s+locations?/i.test(loc)) return true;
    }

    // 4. UK geography check — FIRST pass (before hard blocks)
    //    A job with offices in London AND New York is still a UK job.
    //    So if ANY location segment is UK, accept it.
    for (const loc of locs) {
        if (isUKTerm(loc)) return true;
    }

    // 5. Hard block — only if NO UK term was found above
    for (const loc of locs) {
        if (isBlockedTerm(loc)) {
            if (!loc.includes('northern ireland')) return false;
        }
    }

    // 6. Global/EMEA signals (treat as potentially UK — don't reject outright)
    for (const loc of locs) {
        if (GLOBAL_SIGNALS.some(s => loc.includes(s))) return true;
    }

    // Default: reject
    return false;
}
