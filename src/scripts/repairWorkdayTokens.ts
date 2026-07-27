/**
 * repairWorkdayTokens.ts
 *
 * Probes Workday APIs to find the correct slug for every company whose
 * ats_board_token is missing a slug (has no '/'). Outputs SQL UPDATE
 * statements ready to paste into Supabase SQL editor.
 *
 * Run: npx tsx src/scripts/repairWorkdayTokens.ts
 */

// Company data extracted from data/sql/companies_rows.sql
// Format: { id, name, board }  (board = current broken token, no slug)
const BROKEN_COMPANIES: Array<{ id: number; name: string; board: string }> = [
    { id: 1700, name: 'Barclays',            board: 'External_Career_Site_Barclays' },
    { id: 1703, name: 'Lloyds',              board: 'LBG_Careers' },
    { id: 943,  name: 'NatWest',             board: 'natwestgroup' },    // has slug but 422
    { id: 1738, name: 'Diageo',              board: 'Diageo_Careers' },
    { id: 312,  name: 'Zendesk-broken',      board: 'CheckoutCareers' },  // placeholder
];

// Full broken list from companies_rows.sql — (id, name, board)
const ALL_BROKEN: Array<{ id: number; name: string; board: string }> = [];

// Known correct slugs discovered from careers pages / manual testing
const KNOWN: Record<string, string> = {
    'External_Career_Site_Barclays': 'barclays',
    'LBG_Careers':                   'lbg',
    'Diageo_Careers':                'diageo',
    'Centrica':                      'centrica',
    'CheckoutCareers':               'checkout',
    'Cisco_Careers':                 'cisco',
    'CoStarCareers':                 'costar',
    'Liberty_Global_Careers':        'libertyglobal',
    'Harrods_External1':             'harrods',
    'CareersGrantThornton':          'grantthornton',
    'CMC_Markets_Careers':           'cmcmarkets',
    'Landseccareers':                'landsec',
    'Linklaters':                    'linklaters',
    'AQA':                           'aqa',
    'Intapp':                        'intapp',
    'KANTAR':                        'kantar',
    'Railpen':                       'railpen',
    'InterDigital_Career':           'interdigital',
    'DarktaceExternal':              'darktrace',
    'LNExternalSite':                'livenation',
    'HVP':                           'hvp',
    'Apollo_Careers':                'apollogroup',
    'Alphawave_External':            'alphawave',
    'CanadaGooseCareers':            'canadagoose',
    'Deluxe_External':               'deluxe',
    'External_Career_Site':          'external',   // placeholder
    'External_Careers':              'external',   // placeholder
    'External':                      'external',   // placeholder
    'Careers':                       'careers',    // placeholder
    'careers':                       'careers',    // placeholder
    'external_careers':              'external_careers',  // placeholder
    'external_experienced':          'external_experienced',  // placeholder
    'gileadcareers':                 'gilead',
    'hcacareers':                    'hca',
    'jobs':                          'jobs',       // placeholder
    'jupiter_careers':               'jupiteram',
    'nVent':                         'nvent',
};

// All broken tokens from our analysis of companies_rows.sql
// id → looked up from grep results. Where id is unknown, use 0 (won't be in SQL output).
const TOKENS_TO_FIX: Array<{ id: number; name: string; board: string }> = [
    { id: 1700, name: 'Barclays',              board: 'External_Career_Site_Barclays' },
    { id: 0,    name: 'Lloyds',                board: 'LBG_Careers' },
    { id: 0,    name: 'Diageo',                board: 'Diageo_Careers' },
    { id: 0,    name: 'Centrica',              board: 'Centrica' },
    { id: 0,    name: 'Checkout.com',          board: 'CheckoutCareers' },
    { id: 0,    name: 'Cisco',                 board: 'Cisco_Careers' },
    { id: 0,    name: 'CoStar',                board: 'CoStarCareers' },
    { id: 0,    name: 'Liberty Global',        board: 'Liberty_Global_Careers' },
    { id: 0,    name: 'Harrods',              board: 'Harrods_External1' },
    { id: 0,    name: 'Grant Thornton',        board: 'CareersGrantThornton' },
    { id: 0,    name: 'CMC Markets',           board: 'CMC_Markets_Careers' },
    { id: 0,    name: 'Landsec',               board: 'Landseccareers' },
    { id: 0,    name: 'Linklaters',            board: 'Linklaters' },
    { id: 0,    name: 'AQA',                   board: 'AQA' },
    { id: 0,    name: 'Intapp',                board: 'Intapp' },
    { id: 0,    name: 'Kantar',                board: 'KANTAR' },
    { id: 0,    name: 'Railpen',               board: 'Railpen' },
    { id: 0,    name: 'InterDigital',          board: 'InterDigital_Career' },
    { id: 0,    name: 'Darktrace',             board: 'DarktaceExternal' },
    { id: 0,    name: 'Live Nation (broken)',   board: 'LNExternalSite' },
    { id: 0,    name: 'Unknown-HVP',           board: 'HVP' },
    { id: 0,    name: 'Apollo',                board: 'Apollo_Careers' },
    { id: 0,    name: 'Alphawave',             board: 'Alphawave_External' },
    { id: 0,    name: 'Canada Goose',          board: 'CanadaGooseCareers' },
    { id: 0,    name: 'Deluxe',                board: 'Deluxe_External' },
    { id: 0,    name: 'Gilead',                board: 'gileadcareers' },
    { id: 0,    name: 'HCA',                   board: 'hcacareers' },
    { id: 0,    name: 'Jupiter AM',            board: 'jupiter_careers' },
    { id: 0,    name: 'nVent',                 board: 'nVent' },
];

const WDS = ['wd3', 'wd1', 'wd5', 'wd103', 'wd107', 'wd108', 'wd12', 'wd2', 'wd10', 'wd8', 'wd6', 'wd4', 'wd9'];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function probe(slug: string, board: string): Promise<boolean> {
    for (const wd of WDS) {
        const domain = `${slug}.${wd}.myworkdayjobs.com`;
        const apiUrl = `https://${domain}/wday/cxs/${slug}/${board}/jobs`;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 7000);
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }),
                signal: ctrl.signal,
            });
            clearTimeout(t);
            if (res.ok) {
                const d = await res.json();
                if (Array.isArray(d.jobPostings)) return true;
            }
        } catch { /* try next */ }
    }
    return false;
}

function candidateSlugs(board: string, name: string): string[] {
    const candidates = new Set<string>();
    if (KNOWN[board]) candidates.add(KNOWN[board]);
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanName.length > 2) candidates.add(cleanName);
    const words = name.toLowerCase().split(/[\s&,]+/).filter(w => w.length > 2).map(w => w.replace(/[^a-z0-9]/g, ''));
    if (words[0]) candidates.add(words[0]);
    if (words.length >= 2) candidates.add(words[0] + words[1]);
    // From board: strip common suffixes
    const fromBoard = board.toLowerCase().replace(/[_-]/g, '').replace(/careers|external|site|jobs|group/g, '');
    if (fromBoard.length > 2) candidates.add(fromBoard);
    return [...candidates].filter(Boolean);
}

async function main() {
    console.log('=== WORKDAY TOKEN REPAIR — PROBE PHASE ===\n');
    const sqlLines: string[] = [];
    const fixed: Array<{ name: string; old: string; new: string }> = [];
    const failed: Array<{ name: string; board: string }> = [];

    for (const { id, name, board } of TOKENS_TO_FIX) {
        const slugs = candidateSlugs(board, name);
        process.stdout.write(`[${name}] board="${board}" → testing: ${slugs.join(', ')} ...`);

        let foundSlug: string | null = null;
        for (const slug of slugs) {
            if (KNOWN[board] === slug || await probe(slug, board)) {
                // Still verify even known ones
                const ok = await probe(slug, board);
                if (ok) { foundSlug = slug; break; }
            }
            await sleep(100);
        }

        if (foundSlug) {
            const newToken = `${foundSlug}/${board}`;
            console.log(` ✓  →  "${newToken}"`);
            fixed.push({ name, old: board, new: newToken });
            if (id > 0) {
                sqlLines.push(`UPDATE companies SET ats_board_token = '${newToken}' WHERE id = ${id}; -- ${name}`);
            } else {
                sqlLines.push(`UPDATE companies SET ats_board_token = '${newToken}' WHERE ats_board_token = '${board}' AND ats_provider IN ('workday','workday_enterprise'); -- ${name}`);
            }
        } else {
            console.log(` ✗  no working endpoint`);
            failed.push({ name, board });
        }
        await sleep(200);
    }

    console.log('\n=== SQL TO APPLY IN SUPABASE ===');
    console.log(sqlLines.join('\n'));

    console.log(`\n=== SUMMARY ===`);
    console.log(`Fixed: ${fixed.length}/${TOKENS_TO_FIX.length}`);
    if (failed.length) {
        console.log(`\nStill needs manual fix:`);
        for (const f of failed) console.log(`  ${f.name}: "${f.board}"`);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
