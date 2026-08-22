import assert from 'node:assert/strict';
import test from 'node:test';
import { isForeignLocationLeak, urlSignalsForeignWorkLocation } from './foreignLocationLeak';

test('URL: Workday en-US locale + London is not foreign', () => {
    assert.equal(
        urlSignalsForeignWorkLocation(
            'https://acme.wd1.myworkdayjobs.com/en-US/External/job/London/Software-Engineer',
        ),
        false,
    );
});

test('URL: Durham-NC Workday path is foreign', () => {
    assert.equal(
        urlSignalsForeignWorkLocation(
            'https://sbm.wd1.myworkdayjobs.com/en-US/External/job/Durham-NC/GMP-Technician',
        ),
        true,
    );
});

test('Leak: Durham NC stored as Durham + US URL', () => {
    assert.equal(
        isForeignLocationLeak(
            {
                location: 'Durham',
                title: 'GMP Technician',
                url: 'https://sbm.wd1.myworkdayjobs.com/en-US/jobs/Durham-NC/GMP-Technician',
            },
            'uk',
        ),
        true,
    );
});

test('Leak: East Durham blocked', () => {
    assert.equal(
        isForeignLocationLeak({ location: 'East Durham', title: 'GMP Technician' }, 'uk'),
        true,
    );
});

test('Keep: County Durham UK', () => {
    assert.equal(
        isForeignLocationLeak(
            {
                location: 'Durham',
                title: 'GMP Technician',
                url: 'https://careers.fujifilm.com/uk/job/durham',
            },
            'uk',
        ),
        false,
    );
});

test('Leak: Menlo Park California in title', () => {
    assert.equal(
        isForeignLocationLeak(
            {
                location: 'Durham',
                title: 'FieldDeployed GxP DirectorMenlo Park, California',
            },
            'uk',
        ),
        true,
    );
});

test('Keep: London', () => {
    assert.equal(
        isForeignLocationLeak(
            { location: 'London', title: 'Software Engineer', url: 'https://boards.greenhouse.io/acme/jobs/1' },
            'uk',
        ),
        false,
    );
});

test('Keep: UK Birmingham with Global in title', () => {
    assert.equal(
        isForeignLocationLeak(
            {
                location: 'Birmingham',
                title: 'Internal Audit, Global Banking & Markets - Equities, Associate, Birmingham',
                url: 'https://higher.gs.com/roles/179863',
            },
            'uk',
        ),
        false,
    );
});

test('Keep: Ireland county Co. is not Colorado', () => {
    assert.equal(
        isForeignLocationLeak(
            {
                location: 'Crosshaven, Co',
                title: 'Programme Assistant Crosshaven Boys',
                url: 'https://jobs.smartrecruiters.com/junioradventuresgroup/1',
            },
            'ireland',
        ),
        false,
    );
    assert.equal(
        isForeignLocationLeak(
            { location: 'Westport, Mo', title: 'Technical Shift Lead', url: 'https://jobs.smartrecruiters.com/abbvie/1' },
            'ireland',
        ),
        false,
    );
});
