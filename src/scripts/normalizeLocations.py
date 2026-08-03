#!/usr/bin/env python3
"""
normalizeLocations.py
Standardise raw job-board location strings into structured geographic components.

Input  (stdin):  JSON list of {location: str} objects
Output (stdout): JSON list of NormalizedLocation objects

Schema:
  raw_string      str           original unchanged string
  is_remote       bool
  is_hybrid       bool
  is_multi_location bool        "N Locations" / "Multiple locations"
  city            str | null    primary city (UK-preferred when multi-hub)
  state_province  str | null    US state abbrev / CA province / UK postcode area
  country         str | null    standardised country name
  is_uk_job       bool          True = UK or ambiguous-remote (no explicit non-UK)
"""

import sys
import json
import re
from typing import Optional

# ── UK Geography ──────────────────────────────────────────────────────────────

UK_CITIES: set[str] = {
    "london", "manchester", "birmingham", "leeds", "edinburgh", "glasgow",
    "bristol", "cardiff", "belfast", "liverpool", "sheffield", "newcastle",
    "nottingham", "leicester", "coventry", "brighton", "oxford", "cambridge",
    "bath", "york", "reading", "southampton", "portsmouth", "exeter",
    "plymouth", "derby", "stoke", "wolverhampton", "hull", "sunderland",
    "middlesbrough", "durham", "carlisle", "chester", "peterborough",
    "northampton", "luton", "swindon", "bournemouth", "poole", "basingstoke",
    "guildford", "woking", "slough", "watford", "hemel hempstead", "st albans",
    "chelmsford", "ipswich", "norwich", "lincoln", "worcester", "gloucester",
    "hereford", "shrewsbury", "telford", "warrington", "bolton", "rochdale",
    "wigan", "oldham", "stockport", "salford", "huddersfield", "bradford",
    "wakefield", "halifax", "doncaster", "rotherham", "barnsley", "grimsby",
    "aberdeen", "dundee", "inverness", "stirling", "paisley",
    "derry", "lisburn", "swansea", "newport", "wrexham", "truro", "yeovil",
    "taunton", "salisbury", "winchester", "chichester", "crawley",
    "eastbourne", "hastings", "maidstone", "colchester", "southend",
    "basildon", "milton keynes", "aylesbury", "leamington spa",
    "gateshead", "hartlepool", "teesside", "stockton", "canary wharf",
    "croydon", "richmond", "twickenham", "wimbledon", "stratford",
    "shoreditch", "islington", "hackney", "hammersmith", "fulham",
    "chelsea", "kensington", "whitechapel", "greenwich", "lewisham",
    "bromley", "sutton", "kingston", "radbroke", "paddington",
    "waterloo", "euston", "king's cross", "london bridge",
    # regions / counties used as locations
    "midlands", "west midlands", "east midlands", "yorkshire", "lancashire",
    "cornwall", "devon", "somerset", "dorset", "east anglia", "suffolk",
    "norfolk", "home counties", "south east", "south west", "north east",
    "north west", "highlands", "borders",
    # crown dependencies
    "jersey", "guernsey", "isle of man",
}

UK_NATIONS: set[str] = {"england", "scotland", "wales", "northern ireland"}

UK_COUNTRY_TERMS: set[str] = {
    "united kingdom", "great britain", "uk", "u.k.", "gb", "gbr",
    "remote uk", "hybrid uk",
}

UK_POSTCODE_RE = re.compile(
    r'\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b', re.IGNORECASE
)

# ── Remote / Hybrid ───────────────────────────────────────────────────────────

REMOTE_RE = re.compile(
    r'\b(remote|work[\s_-]from[\s_-]home|wfh|telework(?:er|ing)?|home[\s_-]based|virtual|anywhere)\b',
    re.IGNORECASE,
)
HYBRID_RE = re.compile(
    r'\b(hybrid|flex(?:ible)?[\s_-]work(?:ing)?|partly[\s_-]remote|blended)\b',
    re.IGNORECASE,
)

# ── Multi-location ────────────────────────────────────────────────────────────

MULTI_LOC_RE = re.compile(r'^(\d+)\s+locations?$', re.IGNORECASE)
MULTI_LOC_PHRASE_RE = re.compile(
    r'\b(multiple|various|several)\s+locations?\b', re.IGNORECASE
)

# ── Country aliases ───────────────────────────────────────────────────────────

COUNTRY_ALIASES: dict[str, str] = {
    # UK
    "uk": "United Kingdom", "u.k.": "United Kingdom",
    "united kingdom": "United Kingdom", "great britain": "United Kingdom",
    "gb": "United Kingdom", "gbr": "United Kingdom",
    "england": "United Kingdom", "scotland": "United Kingdom",
    "wales": "United Kingdom", "northern ireland": "United Kingdom",
    # US
    "united states": "United States", "united states of america": "United States",
    "usa": "United States", "u.s.": "United States", "u.s.a.": "United States",
    "us": "United States",   # bare "US" in location strings (word-boundary matched)
    # Canada
    "canada": "Canada",
    # Australia
    "australia": "Australia",
    # Ireland
    "ireland": "Ireland", "eire": "Ireland", "éire": "Ireland",
    "republic of ireland": "Ireland",
    "ie": "Ireland", "irl": "Ireland",
    # Germany
    "germany": "Germany", "deutschland": "Germany",
    # France
    "france": "France",
    # Netherlands
    "netherlands": "Netherlands", "holland": "Netherlands",
    # India
    "india": "India",
    # Singapore
    "singapore": "Singapore",
    # Spain
    "spain": "Spain",
    # Poland
    "poland": "Poland",
    # UAE
    "uae": "United Arab Emirates",
    "united arab emirates": "United Arab Emirates",
    # Switzerland
    "switzerland": "Switzerland",
    # Sweden
    "sweden": "Sweden",
    # Norway
    "norway": "Norway",
    # Denmark
    "denmark": "Denmark",
    # Finland
    "finland": "Finland",
    # Belgium
    "belgium": "Belgium",
    # Austria
    "austria": "Austria",
    # Italy
    "italy": "Italy",
    # Portugal
    "portugal": "Portugal",
    # Czech Republic
    "czech republic": "Czech Republic", "czechia": "Czech Republic",
    # Hungary
    "hungary": "Hungary",
    # Romania
    "romania": "Romania",
    # South Korea
    "south korea": "South Korea",
    # Japan
    "japan": "Japan",
    # China
    "china": "China",
    # Hong Kong
    "hong kong": "Hong Kong",
    # Malaysia
    "malaysia": "Malaysia",
    # Thailand
    "thailand": "Thailand",
    # New Zealand
    "new zealand": "New Zealand",
    # South Africa
    "south africa": "South Africa",
    # Brazil
    "brazil": "Brazil",
    # Argentina
    "argentina": "Argentina",
    # Mexico
    "mexico": "Mexico",
    # Colombia
    "colombia": "Colombia",
    # Ukraine
    "ukraine": "Ukraine",
    # Russia
    "russia": "Russia",
    # Israel
    "israel": "Israel",
    # Saudi Arabia
    "saudi arabia": "Saudi Arabia",
    # Qatar
    "qatar": "Qatar",
    # Caucasus / Eastern Europe
    "armenia": "Armenia", "azerbaijan": "Azerbaijan", "cyprus": "Cyprus",
    "serbia": "Serbia", "bulgaria": "Bulgaria", "slovakia": "Slovakia",
    "slovenia": "Slovenia", "lithuania": "Lithuania", "latvia": "Latvia",
    "estonia": "Estonia", "greece": "Greece", "iceland": "Iceland",
    "malta": "Malta", "bosnia": "Bosnia", "montenegro": "Montenegro",
    "north macedonia": "North Macedonia", "albania": "Albania",
    "moldova": "Moldova", "belarus": "Belarus", "kazakhstan": "Kazakhstan",
    # APAC / South Asia / Africa / LATAM
    "philippines": "Philippines", "vietnam": "Vietnam",
    "indonesia": "Indonesia", "pakistan": "Pakistan",
    "bangladesh": "Bangladesh", "sri lanka": "Sri Lanka", "nepal": "Nepal",
    "egypt": "Egypt", "nigeria": "Nigeria", "kenya": "Kenya",
    "ghana": "Ghana", "morocco": "Morocco",
    "chile": "Chile", "peru": "Peru", "ecuador": "Ecuador",
    "venezuela": "Venezuela", "costa rica": "Costa Rica", "panama": "Panama",
}

# ── US states ─────────────────────────────────────────────────────────────────

US_STATES: dict[str, str] = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    "DC": "District of Columbia",
}
US_STATE_NAMES_LOWER: dict[str, str] = {v.lower(): k for k, v in US_STATES.items()}

# ── City → (country, state_province) map ──────────────────────────────────────

_UK = "United Kingdom"
_US = "United States"
_IE = "Ireland"

CITY_COUNTRY_MAP: dict[str, tuple[str, Optional[str]]] = {
    # UK cities
    **{city: (_UK, None) for city in UK_CITIES},
    # Explicit UK overrides for ambiguous names
    "york": (_UK, None),
    "bath": (_UK, None),
    "richmond": (_UK, None),   # prefer UK over US Virginia
    "perth": (_UK, None),      # prefer UK over AUS

    # Ireland
    "dublin": ("Ireland", None),
    "cork": ("Ireland", None),
    "galway": ("Ireland", None),
    "limerick": ("Ireland", None),

    # US
    "new york": (_US, "NY"), "new york city": (_US, "NY"), "nyc": (_US, "NY"),
    "san francisco": (_US, "CA"), "los angeles": (_US, "CA"),
    "chicago": (_US, "IL"), "boston": (_US, "MA"),
    "seattle": (_US, "WA"), "austin": (_US, "TX"),
    "dallas": (_US, "TX"), "houston": (_US, "TX"),
    "atlanta": (_US, "GA"), "miami": (_US, "FL"),
    "denver": (_US, "CO"), "portland": (_US, "OR"),
    "phoenix": (_US, "AZ"), "las vegas": (_US, "NV"),
    "minneapolis": (_US, "MN"),
    "washington dc": (_US, "DC"), "washington d.c.": (_US, "DC"),
    "san jose": (_US, "CA"), "san diego": (_US, "CA"),
    "nashville": (_US, "TN"), "charlotte": (_US, "NC"),
    "raleigh": (_US, "NC"), "detroit": (_US, "MI"),
    "pittsburgh": (_US, "PA"), "philadelphia": (_US, "PA"),
    "salt lake city": (_US, "UT"), "orlando": (_US, "FL"),
    "tampa": (_US, "FL"), "sacramento": (_US, "CA"),
    "kansas city": (_US, "MO"), "st louis": (_US, "MO"),
    "new orleans": (_US, "LA"), "baltimore": (_US, "MD"),
    "columbus": (_US, "OH"), "cleveland": (_US, "OH"),
    "indianapolis": (_US, "IN"), "milwaukee": (_US, "WI"),
    "whippany": (_US, "NJ"), "mclean": (_US, "VA"),
    "plano": (_US, "TX"), "wilmington": (_US, "DE"),
    "bay area": (_US, "CA"), "silicon valley": (_US, "CA"),
    "research triangle": (_US, "NC"),

    # Canada
    "toronto": ("Canada", "ON"), "vancouver": ("Canada", "BC"),
    "montreal": ("Canada", "QC"), "calgary": ("Canada", "AB"),
    "ottawa": ("Canada", "ON"), "edmonton": ("Canada", "AB"),
    "winnipeg": ("Canada", "MB"),

    # Australia
    "sydney": ("Australia", "NSW"), "melbourne": ("Australia", "VIC"),
    "brisbane": ("Australia", "QLD"), "adelaide": ("Australia", "SA"),

    # New Zealand
    "auckland": ("New Zealand", None), "wellington": ("New Zealand", None),

    # Europe
    "amsterdam": ("Netherlands", None), "berlin": ("Germany", None),
    "munich": ("Germany", None), "hamburg": ("Germany", None),
    "frankfurt": ("Germany", None), "paris": ("France", None),
    "lyon": ("France", None), "madrid": ("Spain", None),
    "barcelona": ("Spain", None), "rome": ("Italy", None),
    "milan": ("Italy", None), "brussels": ("Belgium", None),
    "vienna": ("Austria", None), "zurich": ("Switzerland", None),
    "geneva": ("Switzerland", None), "stockholm": ("Sweden", None),
    "oslo": ("Norway", None), "copenhagen": ("Denmark", None),
    "helsinki": ("Finland", None), "warsaw": ("Poland", None),
    "krakow": ("Poland", None), "prague": ("Czech Republic", None),
    "budapest": ("Hungary", None), "bucharest": ("Romania", None),
    "lisbon": ("Portugal", None), "porto": ("Portugal", None),
    "luxembourg": ("Luxembourg", None), "belgrade": ("Serbia", None),
    "zagreb": ("Croatia", None), "athens": ("Greece", None),
    "sofia": ("Bulgaria", None), "vilnius": ("Lithuania", None),
    "riga": ("Latvia", None), "tallinn": ("Estonia", None),

    # APAC
    "tokyo": ("Japan", None), "osaka": ("Japan", None),
    "beijing": ("China", None), "shanghai": ("China", None),
    "shenzhen": ("China", None), "guangzhou": ("China", None),
    "hong kong": ("Hong Kong", None), "seoul": ("South Korea", None),
    "taipei": ("Taiwan", None), "singapore": ("Singapore", None),
    "bangkok": ("Thailand", None), "jakarta": ("Indonesia", None),
    "manila": ("Philippines", None), "kuala lumpur": ("Malaysia", None),
    "ho chi minh": ("Vietnam", None), "hanoi": ("Vietnam", None),

    # India
    "mumbai": ("India", "MH"), "delhi": ("India", "DL"),
    "bangalore": ("India", "KA"), "bengaluru": ("India", "KA"),
    "hyderabad": ("India", "TS"), "chennai": ("India", "TN"),
    "pune": ("India", "MH"), "kolkata": ("India", "WB"),
    "noida": ("India", "UP"), "gurugram": ("India", "HR"),
    "gurgaon": ("India", "HR"), "ahmedabad": ("India", "GJ"),

    # Middle East
    "dubai": ("United Arab Emirates", None),
    "abu dhabi": ("United Arab Emirates", None),
    "riyadh": ("Saudi Arabia", None), "doha": ("Qatar", None),
    "tel aviv": ("Israel", None),

    # Africa
    "johannesburg": ("South Africa", None),
    "cape town": ("South Africa", None),
    "nairobi": ("Kenya", None), "lagos": ("Nigeria", None),

    # LATAM
    "sao paulo": ("Brazil", "SP"), "rio de janeiro": ("Brazil", "RJ"),
    "buenos aires": ("Argentina", None), "bogota": ("Colombia", None),
    "mexico city": ("Mexico", None), "santiago": ("Chile", None),
    "lima": ("Peru", None),
}

# Sort keys by length descending for greedy longest-match
_CITY_KEYS_SORTED = sorted(CITY_COUNTRY_MAP.keys(), key=len, reverse=True)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _norm_ws(s: str) -> str:
    """Collapse all whitespace variants to single space and strip."""
    s = re.sub(r'[\r\n\t ​]+', ' ', s)
    s = re.sub(r' {2,}', ' ', s)
    return s.strip()


def _extract_postcode(s: str) -> Optional[str]:
    m = UK_POSTCODE_RE.search(s)
    if m:
        raw = m.group(1).upper()
        # normalise spacing: ensure one space between outward and inward
        parts = raw.split()
        if len(parts) == 1 and len(raw) >= 5:
            raw = raw[:-3] + ' ' + raw[-3:]
        return raw.strip()
    return None


def _extract_nhs_city(s: str) -> tuple[Optional[str], Optional[str]]:
    """
    Handle patterns like:
      "Active Care Group, , , Shrewsbury SY1 1AD"
      "Barts Health NHS Trust, , , London E1 1BB"
    Returns (city, postcode) or (None, None).
    """
    parts = [p.strip() for p in s.split(',')]
    # Work from the end: last non-empty segment likely has "City POSTCODE"
    for segment in reversed(parts):
        if not segment:
            continue
        postcode = _extract_postcode(segment)
        if postcode:
            city_raw = UK_POSTCODE_RE.sub('', segment).strip().strip('-').strip()
            if city_raw and len(city_raw) < 40:
                return city_raw.title(), postcode
        break
    return None, None


def _detect_remote_hybrid(s: str) -> tuple[bool, bool]:
    lower = s.lower()
    is_hybrid = bool(HYBRID_RE.search(lower))
    is_remote = is_hybrid or bool(REMOTE_RE.search(lower))
    return is_remote, is_hybrid


def _find_geo(segment: str) -> dict:
    """
    Identify city / state_province / country from one location segment.
    Returns dict with those three keys (all may be None).
    """
    result: dict = {"city": None, "state_province": None, "country": None}
    s = _norm_ws(segment)
    if not s:
        return result

    # Strip remote/hybrid tokens and bare numbers for geo lookup
    clean = REMOTE_RE.sub('', s)
    clean = HYBRID_RE.sub('', clean)
    clean = re.sub(r'\b\d{4,}\b', '', clean)   # strip job codes like "6314"
    clean = clean.strip(' /-,')
    cl = clean.lower().strip()

    if not cl:
        return result

    # UK address false positives that contain foreign country/city tokens
    if re.search(r'\bdenmark\s+hill\b', cl):
        result["city"] = "Denmark Hill"
        result["country"] = _UK
        pc = _extract_postcode(s)
        if pc:
            result["state_province"] = pc
        return result
    if re.search(r'\bwashington\b', cl) and not re.search(
        r'\b(washington\s+(d\.?c\.?|state|dc)|wa,?\s*united states|united states)\b',
        cl,
    ):
        # UK town (Tyne and Wear) unless clearly US
        result["city"] = "Washington"
        result["country"] = _UK
        return result

    # 0. "City - GB" / "City - UK" / "Uxbridge - GB" ATS shorthand
    m_city_cc = re.match(
        r'^(.+?)\s*[-–]\s*(gb|uk|gbr|ie|irl|ireland)\s*$',
        cl,
        re.IGNORECASE,
    )
    if m_city_cc:
        city_raw = m_city_cc.group(1).strip(' ,-/')
        cc = m_city_cc.group(2).lower()
        if city_raw and len(city_raw) < 60:
            result["city"] = city_raw.title()
            result["country"] = _IE if cc in ('ie', 'irl', 'ireland') else _UK
            return result

    # 1. NHS / healthcare format: "Trust, , , City PC"
    nhs_city, nhs_pc = _extract_nhs_city(s)
    if nhs_city:
        result["city"] = nhs_city
        result["country"] = _UK
        result["state_province"] = nhs_pc
        return result

    # 2. Direct country alias
    if cl in COUNTRY_ALIASES:
        result["country"] = COUNTRY_ALIASES[cl]
        return result

    # 3. Longest-match city lookup
    for city_key in _CITY_KEYS_SORTED:
        pat = r'\b' + re.escape(city_key) + r'\b'
        if not re.search(pat, cl):
            continue
        country, state = CITY_COUNTRY_MAP[city_key]
        result["city"] = city_key.title()
        result["country"] = country
        result["state_province"] = state
        # Prefer UK postcode as state for UK jobs
        pc = _extract_postcode(s)
        if pc and country == _UK:
            result["state_province"] = pc
        return result

    # 4. UK country terms
    for term in UK_COUNTRY_TERMS:
        if re.search(r'\b' + re.escape(term) + r'\b', cl):
            result["country"] = _UK
            return result

    # 5. UK nation names
    for nation in UK_NATIONS:
        if nation in cl:
            result["country"] = _UK
            return result

    # 6. UK postcode alone → UK
    pc = _extract_postcode(s)
    if pc:
        result["country"] = _UK
        result["state_province"] = pc
        return result

    # 7. Country alias substring scan (multi-word first)
    for alias in sorted(COUNTRY_ALIASES.keys(), key=len, reverse=True):
        if re.search(r'\b' + re.escape(alias) + r'\b', cl):
            result["country"] = COUNTRY_ALIASES[alias]
            # "Navan, Ie" / "Dublin, Ireland" — keep leading city when alias is trailing
            if not result["city"]:
                m_trail = re.match(
                    r'^(.+?)[,\s]+' + re.escape(alias) + r'\s*$',
                    cl,
                )
                if m_trail:
                    city_part = m_trail.group(1).strip(' ,-/')
                    if city_part and len(city_part) < 50 and city_part not in COUNTRY_ALIASES:
                        result["city"] = city_part.title()
            return result

    # 8. "City, ST" US pattern
    us_abbrev_match = re.search(r',\s*([A-Z]{2})\s*$', clean)
    if us_abbrev_match:
        abbrev = us_abbrev_match.group(1)
        if abbrev in US_STATES:
            result["state_province"] = abbrev
            result["country"] = _US
            city_part = clean[: us_abbrev_match.start()].strip(' ,')
            if city_part:
                result["city"] = city_part.title()
            return result

    # 9. US state name in segment
    for state_name, abbrev in US_STATE_NAMES_LOWER.items():
        if re.search(r'\b' + re.escape(state_name) + r'\b', cl):
            result["state_province"] = abbrev
            result["country"] = _US
            break

    # 10. Fallback city: use cleaned segment if short and plausible
    if not result["city"] and clean and len(clean) < 50:
        result["city"] = clean.title()

    return result


# ── Public API ────────────────────────────────────────────────────────────────

def clean_location_entry(raw: str, market: str = "uk") -> dict:
    """
    Normalise one raw location string into a structured record.

    `market` picks which target table this record is being built for ("uk" or
    "ireland"). A single multi-office posting (e.g. "Armenia | Cyprus | ... |
    United Kingdom") can legitimately be written to both jobs and jobs_IR, but
    each row needs its OWN preferred country/city — otherwise a job that is
    only being written because it has a UK office would show a random other
    office's name (or vice-versa for jobs_IR). See _find_geo's per-segment
    output: only a segment whose own country matches the target market is
    eligible to supply the displayed city.
    """
    out: dict = {
        "raw_string": raw,
        "is_remote": False,
        "is_hybrid": False,
        "is_multi_location": False,
        "city": None,
        "state_province": None,
        "country": None,
        "is_uk_job": False,
    }

    if not raw or not raw.strip():
        return out

    normalized = _norm_ws(raw)

    # Multi-location count string
    if MULTI_LOC_RE.match(normalized) or MULTI_LOC_PHRASE_RE.search(normalized):
        out["is_multi_location"] = True
        out["is_uk_job"] = True   # assume potentially UK (pipeline already passed it)
        return out

    out["is_remote"], out["is_hybrid"] = _detect_remote_hybrid(normalized)

    # Split on pipe / bullet / em-dash separators
    segments = [s.strip() for s in re.split(r'\s*[|·•]\s*', normalized) if s.strip()]
    if not segments:
        segments = [normalized]

    target_country = _IE if market == "ireland" else _UK

    # Collect geo from all segments — keep each segment's city/country paired
    # together instead of two separately-deduped lists (that mismatch in
    # length whenever some segments resolve to a city and others to a bare
    # country, silently breaking any "prefer city from the target country"
    # lookup based on zipping them back together).
    segment_geos = [_find_geo(seg) for seg in segments]

    def _dedup(lst: list) -> list:
        seen: set = set()
        return [x for x in lst if not (x in seen or seen.add(x))]  # type: ignore[func-returns-value]

    all_cities = _dedup([g["city"] for g in segment_geos if g["city"]])
    all_countries = _dedup([g["country"] for g in segment_geos if g["country"]])
    all_states = _dedup([g["state_province"] for g in segment_geos if g["state_province"]])

    # Primary country: the target market wins if any segment matches it
    out["country"] = target_country if target_country in all_countries else (
        all_countries[0] if all_countries else None
    )

    # Primary city: only pull from a segment whose OWN resolved country
    # matches the primary country just picked above. A segment that fell
    # back to "city = raw text" because it didn't match any known city or
    # country (e.g. an unrecognised country name) has country=None, so it
    # is correctly excluded here rather than being mistaken for the
    # displayed city of a UK/Ireland row.
    if out["country"] is not None:
        matching_cities = [
            g["city"] for g in segment_geos
            if g["city"] and g["country"] == out["country"]
        ]
        out["city"] = matching_cities[0] if matching_cities else None
    else:
        out["city"] = all_cities[0] if all_cities else None

    # State: first found (only meaningful when country is US/CA)
    out["state_province"] = all_states[0] if all_states else None

    # is_uk_job determination (always UK-specific regardless of `market`):
    #   - country is UK
    #   - OR remote with no identified country (bare "Remote" → potentially UK)
    #   - OR remote AND UK present in the segments
    out["is_uk_job"] = (
        out["country"] == _UK
        or (out["is_remote"] and out["country"] is None)
        or (out["is_remote"] and _UK in all_countries)
    )

    return out


def clean_locations(data: list) -> list:
    """
    Process a list of {location: str, market?: str} objects (or plain strings).
    Returns a list of normalised location records in the same order.
    """
    results = []
    for item in data:
        if isinstance(item, dict):
            raw = item.get("location", "")
            market = item.get("market", "uk")
        else:
            raw = str(item)
            market = "uk"
        results.append(clean_location_entry(str(raw) if raw is not None else "", market))
    return results


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        sys.stderr.write(f"normalizeLocations: invalid JSON input: {e}\n")
        sys.exit(1)

    output = clean_locations(payload)
    sys.stdout.write(json.dumps(output, ensure_ascii=False))
