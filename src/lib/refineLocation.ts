/**
 * Prefer a specific UK/Ireland city when the stored location is country-only
 * but the title or URL clearly names a known city.
 */
const UK_CITIES = [
    'London', 'Manchester', 'Birmingham', 'Bristol', 'Leeds', 'Glasgow', 'Edinburgh',
    'Liverpool', 'Sheffield', 'Nottingham', 'Newcastle', 'Cardiff', 'Belfast',
    'Cambridge', 'Oxford', 'Reading', 'Southampton', 'Plymouth', 'Brighton',
    'Coventry', 'Leicester', 'York', 'Aberdeen', 'Dundee', 'Swansea', 'Bath',
    'Exeter', 'Norwich', 'Derby', 'Slough', 'Guildford', 'Watford', 'Croydon',
    'Milton Keynes', 'Basingstoke', 'Warrington', 'Chester', 'Hatfield',
    'Leamington Spa', 'Newmarket', 'Canary Wharf', 'Paddington', 'Newbury',
    'Bracknell', 'Maidenhead', 'Woking', 'Crawley', 'Ipswich', 'Peterborough',
    'Stoke-on-Trent', 'Wolverhampton', 'Sunderland', 'Hull', 'Middlesbrough',
];

const IE_CITIES = [
    'Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford', 'Kilkenny', 'Sligo',
    'Athlone', 'Letterkenny', 'Dundalk', 'Drogheda', 'Wexford', 'Killarney',
    'Swords', 'Tallaght', 'Blanchardstown', 'Sandyford', 'Maynooth', 'Celbridge',
];

const UK_COUNTRY_ONLY =
    /^(united kingdom|uk|u\.k\.|great britain|britain|england|scotland|wales|northern ireland)$/i;
const IE_COUNTRY_ONLY =
    /^(ireland|republic of ireland|eire|éire)$/i;

/** ATS count placeholders and scraped junk — not a real worksite. */
const PLACEHOLDER_LOCATION =
    /^(\d+\s+locations?|multiple locations?|multi[- ]?locations?|home|n|\d{1,3})$/i;

/** Regions / area labels longer than a single city — checked before London etc. */
const UK_REGIONS = [
    'East London', 'West London', 'North London', 'South London', 'Greater London',
    'West Midlands', 'East Midlands', 'Midlands',
    'Northern England', 'Southern England', 'North & Midlands', 'North and Midlands', 'North&Midlands',
    'Scotland', 'Wales', 'Northern Ireland',
    'South East', 'South West', 'North East', 'North West',
];

function isPlaceholderLocation(loc: string): boolean {
    return PLACEHOLDER_LOCATION.test(loc.trim());
}

function findCityInText(text: string, cities: string[]): string | null {
    const lower = text.toLowerCase();
    let best: { label: string; index: number; length: number } | null = null;
    for (const city of cities) {
        const re = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const match = re.exec(lower);
        if (!match) continue;
        const candidate = { label: city, index: match.index, length: city.length };
        if (
            !best ||
            candidate.index < best.index ||
            (candidate.index === best.index && candidate.length > best.length)
        ) {
            best = candidate;
        }
    }
    return best?.label ?? null;
}

function placeLabels(market: 'uk' | 'ireland'): string[] {
    return market === 'uk' ? [...UK_REGIONS, ...UK_CITIES] : IE_CITIES;
}

/** If location is country-only or an ATS placeholder, lift a city/region from title/url/description. */
export function refineVagueLocation(
    location: string | null | undefined,
    title?: string | null,
    url?: string | null,
    market: 'uk' | 'ireland' = 'uk',
    description?: string | null,
): string {
    const loc = String(location || '').trim();
    if (!loc) return loc;

    const isCountryOnly =
        market === 'uk' ? UK_COUNTRY_ONLY.test(loc) : IE_COUNTRY_ONLY.test(loc);
    if (!isCountryOnly && !isPlaceholderLocation(loc)) return loc;

    const labels = placeLabels(market);
    // Prefer an explicit "Location: City" line in the JD when present.
    const desc = String(description || '');
    const locLine = desc.match(/^\s*location\s*:\s*([^\n\r]+)/im)?.[1] || '';
    // Title is the job's geography; JD location line next; URLs often name HQ / board cities.
    const city =
        findCityInText(String(title || ''), labels) ||
        findCityInText(locLine, labels) ||
        findCityInText(desc.slice(0, 600), labels) ||
        findCityInText(String(url || ''), labels);
    if (!city) {
        return isPlaceholderLocation(loc)
            ? (market === 'ireland' ? 'Ireland' : 'United Kingdom')
            : loc;
    }

    // Avoid lifting when the match is clearly a non-target country context in the URL path.
    if (market === 'uk' && /\b(united-states|usa|australia|canada)\b/i.test(String(url || ''))) {
        return isPlaceholderLocation(loc) ? 'United Kingdom' : loc;
    }

    return city;
}

/** Prefer the most specific candidate among raw ATS location parts. */
export function pickMostSpecificLocation(parts: string[], market: 'uk' | 'ireland' = 'uk'): string {
    const cleaned = parts.map((p) => String(p || '').trim()).filter(Boolean);
    if (!cleaned.length) return '';
    if (cleaned.length === 1) return cleaned[0];

    const countryRe = market === 'uk' ? UK_COUNTRY_ONLY : IE_COUNTRY_ONLY;
    const cities = market === 'uk' ? UK_CITIES : IE_CITIES;

    const withCity = cleaned.filter((p) => findCityInText(p, cities));
    if (withCity.length) {
        // Prefer shortest city-bearing string (usually "London" over long multi-office dumps)
        return withCity.sort((a, b) => a.length - b.length)[0];
    }

    const nonCountry = cleaned.filter((p) => !countryRe.test(p) && !/^remote$/i.test(p));
    if (nonCountry.length) return nonCountry.sort((a, b) => a.length - b.length)[0];

    return cleaned[0];
}

/**
 * Clean ATS location dumps: country codes, requisition IDs, N/A suffixes,
 * and multi-country lists. Never returns empty — falls back to a country label.
 */
export function sanitizeJobLocation(
    location: string | null | undefined,
    market: 'uk' | 'ireland' = 'uk',
    title?: string | null,
    url?: string | null,
    description?: string | null,
): string {
    const fallback = market === 'ireland' ? 'Ireland' : 'United Kingdom';
    let loc = String(location || '').trim();
    if (!loc) return fallback;

    if (isPlaceholderLocation(loc)) {
        return refineVagueLocation(fallback, title, url, market, description);
    }

    const firstLine = loc.split(/\n/)[0].replace(/\+\s*\d+\s+more\b[.…]* /gi, '').trim();
    if (firstLine && isTargetMarketPart(firstLine, market) && firstLine.length <= 80) {
        loc = firstLine;
    }

    loc = loc
        .replace(/\+\s*\d+\s+more\b[.…]* /gi, ' ')
        .replace(/(?:,\s*)?multiple locations?/gi, ' ')
        .replace(/\n+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^,+|,+$/g, '')
        .trim();

    if (/^(gbr|gb)$/i.test(loc)) return 'United Kingdom';
    if (/^(irl|ie)$/i.test(loc)) return 'Ireland';
    if (/^r\d{5,}$/i.test(loc)) return fallback;

    loc = loc.replace(/,?\s*n\/a\s*$/i, '').trim();
    if (!loc) return fallback;

    const parts = loc
        .split(/\s*[|;/]\s*/)
        .map((p) => p.trim())
        .filter(Boolean);

    const targetParts = parts.filter((p) => isTargetMarketPart(p, market));
    if (targetParts.length) {
        loc = pickMostSpecificLocation(targetParts, market) || targetParts[0];
    } else if (parts.length > 1) {
        // Multi-country dump with no usable target fragment — keep original so
        // foreign-leak deletion can see IND/Palwal/etc. instead of rewriting to UK/Ireland.
        return loc;
    }

    loc = collapseForeignDump(loc, market, fallback);
    loc = refineVagueLocation(loc, title, url, market, description);
    if (!loc || loc.length > 80) return fallback;
    if (/\+\s*\d+\s+more/i.test(loc)) return fallback;
    return loc;
}

/** Non-UK/Ireland geography that marks an ATS multi-office dump. */
const FOREIGN_GEO =
    /\b(united states|\busa\b|canada|australia|singapore|germany|france|spain|sweden|netherlands|portugal|czechia|czech|finland|india|belgium|croatia|greece|iceland|estonia|bulgaria|latvia|lithuania|austria|switzerland|italy|denmark|colombia|brazil|sao paulo|melbourne|sydney|new york|san francisco|amsterdam|berlin|paris|toronto|dubai|maryland|california|boston|stockholm|tallinn|erlangen|tuerkiye|turkey)\b/i;

/**
 * Space-separated dumps like "London San Francisco Boston" don't split on `;`.
 * If both a target-market signal and foreign geography are present, keep only
 * the local city / remote label / country fallback.
 */
function collapseForeignDump(
    loc: string,
    market: 'uk' | 'ireland',
    fallback: string,
): string {
    if (!FOREIGN_GEO.test(loc)) return loc;
    if (!isTargetMarketPart(loc, market)) return loc;

    const city = findCityInText(loc, market === 'uk' ? UK_CITIES : IE_CITIES);
    if (city) return city;

    if (/\bremote\b/i.test(loc)) {
        return market === 'ireland' ? 'Ireland (Remote)' : 'Remote, UK';
    }
    return fallback;
}

function isTargetMarketPart(part: string, market: 'uk' | 'ireland'): boolean {
    if (market === 'uk') {
        if (UK_COUNTRY_ONLY.test(part)) return true;
        if (/\b(united kingdom|\buk\b|\bgb\b|gbr|england|scotland|wales|northern ireland)\b/i.test(part)) return true;
        return Boolean(findCityInText(part, UK_CITIES));
    }
    if (IE_COUNTRY_ONLY.test(part)) return true;
    if (/\b(ireland|éire|eire|dublin|cork|galway|limerick)\b/i.test(part) && !/\bnorthern ireland\b/i.test(part)) {
        return true;
    }
    return Boolean(findCityInText(part, IE_CITIES));
}
