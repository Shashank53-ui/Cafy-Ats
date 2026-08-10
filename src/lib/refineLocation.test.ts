import test from 'node:test';
import assert from 'node:assert';
import { refineVagueLocation, pickMostSpecificLocation } from './refineLocation';
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

test('pickMostSpecificLocation prefers city over country', () => {
    assert.strictEqual(
        pickMostSpecificLocation(['United Kingdom', 'Manchester'], 'uk'),
        'Manchester',
    );
});

test('inferJobLevel maps frontline roles to Junior', () => {
    assert.strictEqual(inferJobLevel('Care Assistant - Bank'), 'Junior');
    assert.strictEqual(inferJobLevel('Retail Sales Assistant'), 'Junior');
    assert.strictEqual(inferJobLevel('Barista'), 'Junior');
    assert.strictEqual(inferJobLevel('Senior Engineer'), 'Senior');
    assert.strictEqual(inferJobLevel('Operations Associate'), 'Mid-level');
});
