/**
 * Workday/ATS locale prefixes (`/en-US/`, `/en-GB/`) are not job geography.
 */
function pathForGeo(url: string): string {
    try {
        const u = new URL(url);
        return `${u.pathname} ${u.search}`
            .toLowerCase()
            .replace(/\/[a-z]{2}-[a-z]{2}(?=\/|$)/gi, '/');
    } catch {
        return '';
    }
}

/**
 * Job URL path names a US/CA/AU worksite (not a UK/Ireland office).
 * Used at ingest so "Durham, NC" cannot be stored as bare "Durham".
 */
export function urlSignalsForeignWorkLocation(url: string | null | undefined): boolean {
    const path = pathForGeo(String(url || ''));
    if (!path.trim()) return false;
    return (
        /(united[-_]?states|\busa\b|north[-_]?carolina|south[-_]?carolina|durham[-_]?nc|menlo[-_]?park|research[-_]?triangle|new[-_]?south[-_]?wales|british[-_]?columbia)/i.test(
            path,
        ) ||
        /[-_/](nc|ny|nj|ca|tx|fl|il|wa|ga|ma|va|md|pa|oh|al|nh)[-_/]/i.test(path) ||
        /(california|massachusetts|pennsylvania|ontario)\b/i.test(path)
    );
}

const COLLISION_CITY =
    /^(durham|east durham|birmingham|manchester|plymouth|cambridge|oxford|reading|bedford|new bedford|richmond|washington|newcastle|perth|chester|gloucester)$/i;

const TITLE_OR_URL_US =
    /\b(north carolina|south carolina|\bn\.?c\.?\b|east durham|research triangle|\brtp\b|united states|\busa\b|u\.s\.a?|menlo park|california|new york|\bnew bedford\b|massachusetts|ontario|canada|australia|nsw|british columbia|,\s*(al|ny|nc|va|tx|ma|oh|pa|ca|ga|fl|il|wa|md|nj|nh|ct|sc|tn|az|wi)\b|[-_/](al|ny|nc|va|tx|ma|oh|pa|ca|ga|fl|il|wa|md|nj|nh)[-_/])/i;

function haystack(location: string, title?: string | null, url?: string | null): string {
    const path = pathForGeo(String(url || '')).replace(/[-_/]/g, ' ');
    return `${location || ''} ${title || ''} ${path}`.toLowerCase();
}

function locationIsExplicitlyForeign(location: string): boolean {
    const l = location.toLowerCase().trim();
    if (!l) return false;
    if (/^(multiple locations?|\d+\s+locations?)$/i.test(l)) return false;
    if (/^(van|mtl|tor)$/i.test(l)) return true;
    if (
        /\b(united states|\busa\b|u\.s\.a?|north carolina|california|menlo park|ontario|canada|australia|netherlands|germany|france|spain|singapore|india|jamaica|manchester parish|abbotsford|\bvic,?\s*au\b)\b/i.test(
            l,
        )
    ) {
        return true;
    }
    // US state codes after a comma. Omit CO/MO — Irish "Co. Kildare" / "Westport, Mo".
    if (/,\s*(al|ny|nc|va|tx|ma|oh|pa|ca|ga|fl|il|wa|md|nj|nh|sc|ct|mi|mn|or|tn|az|wi)\b/i.test(l)) {
        return true;
    }
    return false;
}

/**
 * True when a stored/ATS row is a foreign worksite that slipped through as a
 * UK/Ireland namesake city (Durham NC, Cambridge MA, Dublin OH, …).
 *
 * Does not treat "Multiple locations" / "Global" / "(UK/US)" titles as foreign.
 */
export function isForeignLocationLeak(
    input: { location?: string | null; title?: string | null; url?: string | null },
    market: 'uk' | 'ireland',
): boolean {
    const location = String(input.location || '').trim();
    const title = input.title || '';
    const url = input.url || '';
    const combined = haystack(location, title, url);

    if (locationIsExplicitlyForeign(location)) return true;

    // North America office-code dumps (LON/VAN/MTL/TOR) and CIS+Remote hybrids.
    if (/\b(lon|van|mtl|tor)\s*\/\s*(lon|van|mtl|tor)/i.test(title)) return true;
    if (/\b(kyiv|kiev|dnipro)\b/i.test(title) && /\bremote\b/i.test(location)) return true;

    if (market === 'uk') {
        if (
            COLLISION_CITY.test(location) &&
            (urlSignalsForeignWorkLocation(url) || TITLE_OR_URL_US.test(`${title} ${url} ${combined}`)) &&
            !/\b(united kingdom|great britain|\buk\b|england|scotland|wales)\b/i.test(location)
        ) {
            return true;
        }
        return false;
    }

    if (
        /\b(dublin|cork|galway|westport|limerick)\b/i.test(location) &&
        (urlSignalsForeignWorkLocation(url) || /[-_/](ca|oh|ct|ny)[-_/]/i.test(String(url || '').toLowerCase()))
    ) {
        return true;
    }
    // Recruiter ads that park an Australia/Canada role on an Irish city.
    if (
        /\b(dublin|cork|galway|limerick|ireland)\b/i.test(location) &&
        ((/\baustralia\b/i.test(title) &&
            /\b(gp|general practitioner|anaesthetist|anesthetist|paediatrician|pediatrician|fast[-\s]?track|pathway)\b/i.test(
                title,
            )) ||
            (/\bcanada\b/i.test(title) && /\b(construction worker|roads and bridges)\b/i.test(title)))
    ) {
        return true;
    }
    return false;
}
