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

test('refineVagueLocation lifts city from JD Location line', () => {
    assert.strictEqual(
        refineVagueLocation(
            'United Kingdom',
            'VodafoneThree - SbD Security Architect - Networks',
            'https://jobs.vodafone.com/careers/job/123',
            'uk',
            'Location: Newbury + Hybrid\nSalary: Excellent basic salary',
        ),
        'Newbury',
    );
});

test('sanitizeJobLocation replaces N Locations / Multiple locations placeholders', () => {
    assert.strictEqual(
        sanitizeJobLocation('2 Locations', 'uk', 'Lift Service Engineer - East London'),
        'East London',
    );
    assert.strictEqual(
        sanitizeJobLocation('4 Locations', 'uk', 'Join Our Talent Pool: Lift Engineers in Scotland'),
        'Scotland',
    );
    assert.strictEqual(
        sanitizeJobLocation('Multiple locations', 'uk', 'Corporate Tax Manager - Midlands'),
        'Midlands',
    );
    assert.strictEqual(
        sanitizeJobLocation('Multiple locations', 'uk', 'Corporate Tax Manager - Milton Keynes or Watford'),
        'Milton Keynes',
    );
    assert.strictEqual(
        sanitizeJobLocation('7 Locations', 'uk', 'Data Science AI Strategy, UK'),
        'United Kingdom',
    );
    assert.strictEqual(
        sanitizeJobLocation('United Kingdom, Multiple Locations, Multiple Locations', 'uk', 'Analyst'),
        'United Kingdom',
    );
    assert.strictEqual(
        sanitizeJobLocation(
            '4 Locations',
            'uk',
            'Join Our Talent Pool: Lift Engineers in Midlands',
            'https://boards.greenhouse.io/otis/jobs/123?office=Birmingham',
        ),
        'Midlands',
    );
    assert.strictEqual(
        sanitizeJobLocation(
            'Multiple locations',
            'uk',
            'Manager - Audit & Accounting Related Tax Services - London or Birmingham',
        ),
        'London',
    );
});

test('sanitizeJobLocation treats Home / N / digits as placeholders', () => {
    assert.strictEqual(
        sanitizeJobLocation('Home', 'uk', 'Business Development Director - Invoice Finance - North West'),
        'North West',
    );
    assert.strictEqual(
        sanitizeJobLocation('N', 'uk', 'Neuromodulation Clinical Sales Representative Graduate - London'),
        'London',
    );
    assert.strictEqual(
        sanitizeJobLocation('28', 'uk', 'Customer Service Representative - Traveline Scotland'),
        'Scotland',
    );
});

test('sanitizeJobLocation maps codes and strips N/A', () => {
    assert.strictEqual(sanitizeJobLocation('GBR', 'uk'), 'United Kingdom');
    assert.strictEqual(sanitizeJobLocation('R062179', 'ireland'), 'Ireland');
    assert.strictEqual(sanitizeJobLocation('Co Kildare, N/A', 'ireland'), 'Co Kildare');
    assert.strictEqual(sanitizeJobLocation('Finland; Ireland', 'ireland'), 'Ireland');
    assert.strictEqual(sanitizeJobLocation('USA; Remote, UK; Remote, Sweden; Stockholm', 'uk'), 'Remote, UK');
    assert.strictEqual(sanitizeJobLocation('Ireland; United Kingdom', 'ireland'), 'Ireland');
    assert.strictEqual(
        sanitizeJobLocation('London San Francisco Boston New York', 'uk'),
        'London',
    );
    assert.strictEqual(
        sanitizeJobLocation('San Francisco London Stockholm', 'uk'),
        'London',
    );
    assert.strictEqual(
        sanitizeJobLocation('Maryland HQ + Boston Office + California - Remote - Bay Area + Ireland', 'ireland'),
        'Ireland (Remote)',
    );
    assert.strictEqual(
        sanitizeJobLocation('UK Edinburgh Manchester Ireland Stockholm Dublin Amsterdam Toronto', 'ireland'),
        'Dublin',
    );
});

test('inferJobLevel maps frontline roles to Junior (4-level taxonomy)', () => {
    assert.strictEqual(inferJobLevel('Care Assistant - Bank'), 'Junior');
    assert.strictEqual(inferJobLevel('Retail Sales Assistant'), 'Junior');
    assert.strictEqual(inferJobLevel('Barista'), 'Junior');
    assert.strictEqual(inferJobLevel('Deli Staff (Full & Part Time)'), 'Junior');
    assert.strictEqual(inferJobLevel('Floor Staff (Full & Part Time)'), 'Junior');
    assert.strictEqual(inferJobLevel('Kitchen Staff - Part Time'), 'Junior');
    assert.strictEqual(inferJobLevel('Waiting Staff'), 'Junior');
    assert.strictEqual(inferJobLevel('Deli Assistant'), 'Junior');
    assert.strictEqual(inferJobLevel('Senior Engineer'), 'Senior');
    assert.strictEqual(inferJobLevel('Staff Engineer'), 'Senior');
    assert.strictEqual(inferJobLevel('Staff Mechanical Design Engineer, R&D'), 'Senior');
    assert.strictEqual(inferJobLevel('Staff Project Engineer'), 'Senior');
    assert.strictEqual(inferJobLevel('Staff Nurse - CT'), 'Mid Level');
    assert.strictEqual(inferJobLevel('Operations Associate'), 'Mid Level');
    assert.strictEqual(inferJobLevel('Head of Software Engineering'), 'Senior');
    assert.strictEqual(inferJobLevel('Head of Engineering'), 'Senior');
    assert.strictEqual(inferJobLevel('Software Engineering Manager'), 'Senior');
    assert.strictEqual(inferJobLevel('Senior Software Engineering Manager'), 'Senior');
    assert.strictEqual(inferJobLevel('Assistant Manager'), 'Mid Level');
    assert.strictEqual(inferJobLevel('Solution Architect'), 'Senior');
    assert.strictEqual(inferJobLevel('Software Engineer'), 'Mid Level');
    assert.strictEqual(inferJobLevel('Project Manager'), 'Mid Level');
    assert.strictEqual(inferJobLevel('Team Leader'), 'Junior');
    assert.strictEqual(inferJobLevel('Chef'), 'Mid Level');
    assert.strictEqual(inferJobLevel('Register your interest'), null);
});

test('sanitizeJobLocation does not rewrite IND Palwal to Ireland', () => {
    assert.strictEqual(
        sanitizeJobLocation(
            'IND | Palwal | Building T06 Part C, Topline Logistics Park',
            'ireland',
            'Supervisor - Business Process Operations',
        ),
        'IND | Palwal | Building T06 Part C, Topline Logistics Park',
    );
});
