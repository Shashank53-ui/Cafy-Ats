import test from 'node:test';
import assert from 'node:assert';
import { refineVagueLocation, pickMostSpecificLocation, sanitizeJobLocation } from './refineLocation';
import { inferJobLevel } from './inferJobLevel';

test('refineVagueLocation lifts city from title when location is United Kingdom', () => {
    assert.strictEqual(
        refineVagueLocation('United Kingdom', 'Software Engineer - London', 'https://example.com/job'),
        'London',
    );
    assert.strictEqual(
        refineVagueLocation('United Kingdom', 'Warehouse Manager', 'https://example.com/job'),
        'United Kingdom',
    );
});

test('sanitizeJobLocation maps codes and strips N/A', () => {
    assert.strictEqual(sanitizeJobLocation('GBR', 'uk'), 'United Kingdom');
    assert.strictEqual(sanitizeJobLocation('R062179', 'ireland'), 'Ireland');
    assert.strictEqual(sanitizeJobLocation('Co Kildare, N/A', 'ireland'), 'Co Kildare');
    assert.strictEqual(sanitizeJobLocation('Finland; Ireland', 'ireland'), 'Ireland');
    assert.strictEqual(sanitizeJobLocation('USA; Remote, UK; Remote, Sweden; Stockholm', 'uk'), 'Remote, UK');
    assert.strictEqual(sanitizeJobLocation('Ireland; United Kingdom', 'ireland'), 'Ireland');
});

test('inferJobLevel maps frontline roles to Junior', () => {
    assert.strictEqual(inferJobLevel('Care Assistant - Bank'), 'Junior');
    assert.strictEqual(inferJobLevel('Retail Sales Assistant'), 'Junior');
    assert.strictEqual(inferJobLevel('Barista'), 'Junior');
    assert.strictEqual(inferJobLevel('Deli Staff (Full & Part Time)'), 'Junior');
    assert.strictEqual(inferJobLevel('Floor Staff (Full & Part Time)'), 'Junior');
    assert.strictEqual(inferJobLevel('Kitchen Staff - Part Time'), 'Junior');
    assert.strictEqual(inferJobLevel('Waiting Staff'), 'Junior');
    assert.strictEqual(inferJobLevel('Deli Assistant'), 'Junior');
    assert.strictEqual(inferJobLevel('Senior Engineer'), 'Senior');
    assert.strictEqual(inferJobLevel('Staff Engineer'), 'Staff');
    assert.strictEqual(inferJobLevel('Staff Mechanical Design Engineer, R&D'), 'Staff');
    assert.strictEqual(inferJobLevel('Staff Project Engineer'), 'Staff');
    assert.strictEqual(inferJobLevel('Staff Nurse - CT'), 'Staff');
    assert.strictEqual(inferJobLevel('Operations Associate'), 'Mid-level');
});
