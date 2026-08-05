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
