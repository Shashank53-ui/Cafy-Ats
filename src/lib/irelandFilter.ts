/**
 * Returns true only when a job has an explicit Republic of Ireland location.
 *
 * This deliberately does not inspect the title or department. Those fields can
 * mention a sales territory, team, or customer market without describing where
 * the role is based. Northern Ireland is part of the UK and is excluded.
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

const IRELAND_LOCATION_PHRASES = [
    'ireland', 'republic of ireland', 'eire', 'éire', ...IRELAND_CITIES,
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

export function isIrelandJob(location: string | null | undefined, locations: string[] = []): boolean {
    const candidates = (location ? [location] : locations)
        .map(value => normalizeLocation(value || ''))
        .filter(Boolean);

    return candidates.some(candidate => {
        if (containsLocationPhrase(candidate, 'northern ireland')) return false;
        return IRELAND_LOCATION_PHRASES.some(phrase => containsLocationPhrase(candidate, phrase));
    });
}
