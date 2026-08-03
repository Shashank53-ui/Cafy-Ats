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
