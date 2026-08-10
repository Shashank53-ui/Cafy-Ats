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
    'Leamington Spa', 'Newmarket', 'Canary Wharf', 'Paddington',
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

function findCityInText(text: string, cities: string[]): string | null {
    const lower = text.toLowerCase();
    for (const city of cities) {
        const re = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (re.test(lower)) return city;
    }
    return null;
}

/** If location is country-only, lift a city from title/url when confidently present. */
export function refineVagueLocation(
    location: string | null | undefined,
    title?: string | null,
    url?: string | null,
    market: 'uk' | 'ireland' = 'uk',
): string {
    const loc = String(location || '').trim();
    if (!loc) return loc;

    const isCountryOnly =
        market === 'uk' ? UK_COUNTRY_ONLY.test(loc) : IE_COUNTRY_ONLY.test(loc);
    if (!isCountryOnly) return loc;

    const haystack = `${title || ''} ${url || ''}`;
    const city = findCityInText(haystack, market === 'uk' ? UK_CITIES : IE_CITIES);
    if (!city) return loc;

    // Avoid lifting when the match is clearly a non-target country context in the URL path.
    if (market === 'uk' && /\b(united-states|usa|australia|canada)\b/i.test(String(url || ''))) {
        return loc;
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
