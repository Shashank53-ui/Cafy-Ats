import test from 'node:test';
import assert from 'node:assert';
import { isIrelandJob } from './irelandFilter';

test('Ireland Filter: accepts explicit Republic of Ireland locations', () => {
    for (const location of ['Dublin, Ireland', 'Republic of Ireland', 'Galway', 'IE-Dublin']) {
        assert.strictEqual(isIrelandJob(location), true, `${location} should be accepted`);
    }
});

test('Ireland Filter: rejects Northern Ireland and non-Ireland locations', () => {
    for (const location of ['Northern Ireland', 'London, United Kingdom', 'New York, United States', 'Remote', 'EMEA']) {
        assert.strictEqual(isIrelandJob(location), false, `${location} should be rejected`);
    }
});

test('Ireland Filter: ignores title and department-like values', () => {
    assert.strictEqual(isIrelandJob('New York, United States'), false);
    assert.strictEqual(isIrelandJob('New York, United States', ['Ireland Sales']), false);
});

test('Ireland Filter: accepts an ATS-provided Ireland location candidate', () => {
    assert.strictEqual(isIrelandJob('', ['Dublin', 'Ireland']), true);
});

test('Ireland Filter: rejects bare UK and US cities', () => {
    for (const location of ['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Bay Area, CA, United States', 'New York, NY, United States']) {
        assert.strictEqual(isIrelandJob(location), false, `${location} should be rejected`);
    }
});

test('Ireland Filter: rejects foreign city with only Ireland country label', () => {
    assert.strictEqual(isIrelandJob('Bordeaux, Ireland'), false, 'Bordeaux + Ireland must not pass');
    assert.strictEqual(isIrelandJob('London, Ireland'), false, 'London + Ireland must not pass');
});

test('Ireland Filter: accepts multi-loc with foreign city plus Irish city', () => {
    assert.strictEqual(
        isIrelandJob('Berlin, Germany | Dublin, Ireland | Remote - Ireland'),
        true,
        'Berlin+Dublin dual should stay Ireland'
    );
});

test('Ireland Filter: still rejects Dublin Ohio USA', () => {
    assert.strictEqual(isIrelandJob('Dublin, Ohio, United States of America'), false);
});

test('Ireland Filter: accepts RoI counties, Co. forms, and common towns', () => {
    for (const location of [
        'Ashbourne, County Meath',
        'Co. Clare',
        'Co. Offaly, Leinster',
        'Carrickmacross, County Monaghan',
        'Blanchardstown',
        'Park West',
        'Ireland (Remote)',
        'Athlone, Westmeath',
        'Portlaoise, Co. Laois',
        'Cavan, Ulster',
        'Belview Port, County Kilkenny',
        'Ballyphehane',
    ]) {
        assert.strictEqual(isIrelandJob(location), true, `${location} should be accepted`);
    }
});

test('Ireland Filter: rejects foreign / UK / NI leaks', () => {
    for (const location of [
        'Amsterdam, Netherlands',
        'Barcelona, Spain',
        'Bulgaria',
        'Europe',
        'London',
        'Montenegro',
        'New York, NY, United States',
        'Portugal',
        'San Francisco, CA, United States',
        'Belfast',
        'Omagh',
        'United Kingdom',
        '',
    ]) {
        assert.strictEqual(isIrelandJob(location), false, `${location || '(empty)'} should be rejected`);
    }
});

test('Ireland Filter: rejects US state abbrev collisions (MO/KY/MN)', () => {
    for (const location of [
        'Cape Girardeau Mo',
        'Sysco Memphis - Shuttle Yard Cape Girardeau Mo',
        'Louisville, KY',
        'Minneapolis, MN',
        'Atlanta, GA, United States',
    ]) {
        assert.strictEqual(isIrelandJob(location), false, `${location} should be rejected`);
    }
    // Still accept Irish town + county abbrev
    assert.strictEqual(isIrelandJob('Dunboyne, Mh'), true);
    assert.strictEqual(isIrelandJob('Castlebar, Mo'), true);
});

test('Ireland Filter: accepts previously missed RoI towns', () => {
    for (const location of [
        'Sallynoggin',
        'Kenmare, Ky',
        'Kenmare Old, Ky',
        'Crosshaven, Co',
        'Carrigtohill, Co',
        'Summerhill, Mh',
        'Carrickmines',
        'Gaillimh',
        'Roscrea, Ta',
        'Aghada, Co',
        'Ballinspittle, Co',
        'Belgooly, Co',
        'Ratoath, Mh',
        'Lahinch, Ce',
        'Abbeyleix, Ls',
        'Ballygarvan, Co',
        'Donacarney, Mh',
        'Carrigaline, Co',
        'Ballyphehane',
    ]) {
        assert.strictEqual(isIrelandJob(location), true, `${location} should be accepted`);
    }
});

test('Ireland Filter: rejects Colorado US towns using trailing CO', () => {
    for (const location of [
        'Boulder, CO',
        'Boulder,  CO',
        'Breckenridge, CO',
        'Fort Collins, CO',
        'Springs, CO',
        'Collins, CO',
    ]) {
        assert.strictEqual(isIrelandJob(location), false, `${location} must be rejected`);
    }
});

test('Ireland Filter: rejects ATS ISO country prefixes (CN/US/…)', () => {
    for (const location of [
        'CN - Shenzhen',
        'CN-Shenzhen',
        'Shenzhen, CN',
        'CN',
        'CN-SC-CHENGDU-001 ~ No 8 Kexin Rd ~ CHENGDU HI TECH ZONE, Chengdu Hi-Tech Zone (West Park)',
        'US - New York',
        'IN - Mumbai',
        'LS - Maseru',
        'CW - Willemstad',
    ]) {
        assert.strictEqual(isIrelandJob(location), false, `${location} should be rejected`);
    }
    // Still accept real RoI county-abbrev uses
    assert.strictEqual(isIrelandJob('Cavan, Cn'), true);
    assert.strictEqual(isIrelandJob('Bailieborough, Cn'), true);
    assert.strictEqual(isIrelandJob('IE - Dublin'), true);
    assert.strictEqual(isIrelandJob('CK - Cork'), true);
});

test('Ireland Filter: rejects US state-code namesakes', () => {
    for (const location of [
        'Dublin, CA',
        'Dublin, OH',
        'Waterford, MI',
        'Cork, GA',
        'Westport, CT',
        'New York, Ireland',
    ]) {
        assert.strictEqual(isIrelandJob(location), false, `${location} should be rejected`);
    }
    // Real RoI county abbrevs that collide with US states still work
    assert.strictEqual(isIrelandJob('Westport, Mo'), true);
    assert.strictEqual(isIrelandJob('Kenmare, Ky'), true);
    assert.strictEqual(isIrelandJob('Carrigaline, Co'), true);
    // Multi-loc with Irish city still ok (no US country term)
    assert.strictEqual(isIrelandJob('Detroit, MI; Dublin, Ireland'), true);
    assert.strictEqual(isIrelandJob('SF, New York, Seattle, Dublin'), true);

    // US-addressed Irish namesakes must not pass
    for (const location of [
        'Ennis, TX, United States',
        'Westport-Mertztown, PA, United States',
        'Store -Waterford Park-Lanebryant-Clarksville, IN, United States',
        'Store -Parkwest-Ann-Peoria, AZ, United States',
        'Waterford Works, NJ, United States',
    ]) {
        assert.strictEqual(isIrelandJob(location), false, `${location} should be rejected`);
    }
    // Multi-loc that includes Dublin alongside US offices still OK
    assert.strictEqual(
        isIrelandJob('United Kingdom Dublin United States New York Sofia Germany Poland Boston Remote'),
        true,
    );
});

test('Ireland Filter: rejects WW/worldwide and NI typos; accepts Eircode', () => {
    assert.strictEqual(isIrelandJob('WW Remote'), false);
    assert.strictEqual(isIrelandJob('Worldwide'), false);
    assert.strictEqual(isIrelandJob('Nothern Ireland, United Kingdom'), false);
    assert.strictEqual(isIrelandJob('Au-Sa-Cavan 1 Month Ago(2.7. 10:29 Pm)'), false);
    assert.strictEqual(isIrelandJob('D02 XY01'), true);
    assert.strictEqual(isIrelandJob('D02XY01'), true);
});

test('Ireland Filter: rejects Canada Workday site codes (false Eircode J01 BLDG)', () => {
    const longueuil = 'CA-QC-LONGUEUIL-J01 ~ 1000 Blvd Marie-Victorin ~ J01 BLDG';
    assert.strictEqual(isIrelandJob(longueuil), false, 'Longueuil QC must not pass as Ireland');
    assert.strictEqual(isIrelandJob('CA-ON-TORONTO-A01 ~ Some Street'), false);
    assert.strictEqual(isIrelandJob('J01 BLDG'), false, 'Invalid routing key J must not match Eircode');
    assert.strictEqual(isIrelandJob('Longueuil, Quebec, Canada'), false);
});
