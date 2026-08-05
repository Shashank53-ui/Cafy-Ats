import test from 'node:test';
import assert from 'node:assert';
import { isUKJob, JobLocationInput } from './ukFilter';

/**
 * ukFilter.test.ts — Unit tests for the UK Filter logic.
 * Run with: npx tsx src/lib/ukFilter.test.ts
 */

test('UK Filter: Trusted source', () => {
    const input: JobLocationInput = {
        isTrustedSource: true,
        locations: [],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), true, 'Trusted source should return true');
});

test('UK Filter: Remote flag', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: [],
        isRemote: true
    };
    assert.strictEqual(isUKJob(input), true, 'isRemote true should return true');
});

test('UK Filter: UK city', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["London"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), true, 'London should return true');
});

test('UK Filter: UK country term', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["United Kingdom"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), true, 'United Kingdom should return true');
});

test('UK Filter: Multi-location with UK', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["New York", "London", "Singapore"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), true, 'Multi-location with London should return true');
});

test('UK Filter: Multi-location no UK', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["New York", "Singapore", "Dubai"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), false, 'Multi-location without UK should return false');
});

test('UK Filter: Hard block only', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["California"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), false, 'California should return false');
});

test('UK Filter: Global signal alone blocked', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["Global"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), false, 'Bare "Global" with no UK term should return false');
});

test('UK Filter: EMEA signal alone blocked', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["EMEA"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), false, 'Bare "EMEA" with no UK term should return false');
});

test('UK Filter: EMEA with London passes', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["EMEA - London"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), true, '"EMEA - London" should return true');
});

test('UK Filter: EMEA Remote blocked', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["EMEA Remote"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), false, '"EMEA Remote" with no UK term should return false');
});

test('UK Filter: Europe with London passes', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["Europe - London"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), true, '"Europe - London" should return true');
});

test('UK Filter: broad region terms blocked alone', () => {
    for (const loc of ["APAC", "Worldwide", "Asia", "Europe", "East Coast", "NAMER", "Int'l", "International"]) {
        const input: JobLocationInput = { isTrustedSource: false, locations: [loc], isRemote: false };
        assert.strictEqual(isUKJob(input), false, `"${loc}" with no UK term should return false`);
    }
});

test('UK Filter: Crown Dependencies blocked', () => {
    for (const loc of ["Jersey", "Guernsey", "Isle of Man"]) {
        const input: JobLocationInput = { isTrustedSource: false, locations: [loc], isRemote: false };
        assert.strictEqual(isUKJob(input), false, `"${loc}" (Crown Dependency) should return false`);
    }
});

test('UK Filter: bare US blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["US"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'Bare "US" should return false');
});

test('UK Filter: Empty everything', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: [],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), false, 'Empty everything should return false');
});

test('UK Filter: Northern Ireland safety', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["Northern Ireland"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), true, 'Northern Ireland should return true and not be blocked by Ireland');
});

test('UK Filter: Remote UK string', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["Remote UK"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), true, 'Remote UK string should return true');
});

test('UK Filter: Dublin hard block', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["Dublin"],
        isRemote: false
    };
    assert.strictEqual(isUKJob(input), false, 'Dublin should return false');
});

test('UK Filter: Ambiguous remote', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ["Remote"],
        isRemote: false
    };
    // "Remote" in locations string should pass via GLOBAL_SIGNALS
    assert.strictEqual(isUKJob(input), true, 'Bare "Remote" in locations string should return true');
});

test('UK Filter: Remote flag bare (no location)', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: [], isRemote: true };
    assert.strictEqual(isUKJob(input), true, 'isRemote with no location should pass');
});

test('UK Filter: Remote - United States blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Remote - United States"], isRemote: true };
    assert.strictEqual(isUKJob(input), false, 'Remote - United States should be blocked');
});

test('UK Filter: Remote - India blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Remote - India"], isRemote: true };
    assert.strictEqual(isUKJob(input), false, 'Remote - India should be blocked');
});

test('UK Filter: Remote (USA) blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Remote (USA)"], isRemote: true };
    assert.strictEqual(isUKJob(input), false, 'Remote (USA) should be blocked');
});

test('UK Filter: Remote UK passes', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Remote UK"], isRemote: true };
    assert.strictEqual(isUKJob(input), true, 'Remote UK with isRemote flag should pass');
});

test('UK Filter: Remote with London passes', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Remote", "London"], isRemote: true };
    assert.strictEqual(isUKJob(input), true, 'Remote + London should pass');
});

test('UK Filter: U.S. Travelling blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["U.S. Travelling"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'U.S. Travelling should be blocked');
});

test('UK Filter: U.S. abbreviation blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["U.S."], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'Bare U.S. should be blocked');
});

test('UK Filter: United States blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["New York, NY, United States"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'United States should be blocked');
});

test('UK Filter: UK city namesake in US blocked (Bedford MA etc)', () => {
    for (const loc of [
        'Bedford, MA, United States',
        'Bedford, NH, United States',
        'Bedford, OH, United States',
        'Bedford, TX, United States',
        'Bedford, MA',
        'Birmingham, AL, United States',
        'Manchester, NH, United States',
    ]) {
        const input: JobLocationInput = { isTrustedSource: false, locations: [loc], isRemote: false };
        assert.strictEqual(isUKJob(input), false, `${loc} must be blocked`);
    }
});

test('UK Filter: UK Bedford without US signal still accepted', () => {
    for (const loc of ['Bedford', 'Bedfordshire, United Kingdom', 'Bedford, United Kingdom']) {
        const input: JobLocationInput = { isTrustedSource: false, locations: [loc], isRemote: false };
        assert.strictEqual(isUKJob(input), true, `${loc} must stay UK`);
    }
});

test('UK Filter: Dual UK + US still accepted when UK country explicit', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ['London, United Kingdom | New York, NY, United States'],
        isRemote: false,
    };
    assert.strictEqual(isUKJob(input), true, 'Explicit UK + US dual should stay UK');
});

test('UK Filter: New South Wales Australia blocked (wales false positive)', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Sydney-New South Wales-Australia"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'NSW Australia must not pass via wales');
});

test('UK Filter: North Wales Pennsylvania blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["USA - Pennsylvania - North Wales (Upper Gwynedd)"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'US North Wales PA must be blocked');
});

test('UK Filter: Porto Portugal blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Porto, Portugal"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'Portugal must be blocked');
});

test('UK Filter: Amsterdam blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Amsterdam"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'Amsterdam must be blocked');
});

test('UK Filter: Singapore blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Singapore"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'Singapore must be blocked');
});

test('UK Filter: bare Dublin Ireland blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Dublin, Ireland"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'Dublin ROI must not be UK');
});

test('UK Filter: Dublin with only United Kingdom blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Dublin, , United Kingdom"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'Dublin + bare UK label must not pass');
});

test('UK Filter: Dublin + London dual location allowed', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Dublin, Ireland | London, United Kingdom"], isRemote: false };
    assert.strictEqual(isUKJob(input), true, 'Dublin+London dual should stay UK');
});

test('UK Filter: Hoofddorp England Netherlands blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Hoofddorp, ENGLAND, Netherlands"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'Netherlands row with ENGLAND junk must be blocked');
});

test('UK Filter: Denmark Hill London NHS still UK', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["South London and Maudsley NHS Foundation Trust, , , Denmark Hill SE5 8AZ"], isRemote: false };
    assert.strictEqual(isUKJob(input), true, 'Denmark Hill is a London address');
});

test('UK Filter: Newcastle NSW Australia blocked', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ["Newcastle-New South Wales-Australia"], isRemote: false };
    assert.strictEqual(isUKJob(input), false, 'AU Newcastle must not match UK Newcastle');
});

test('UK Filter: N Locations placeholder alone rejected', () => {
    for (const loc of ['2 Locations', '3 Locations', '10 Locations']) {
        const input: JobLocationInput = { isTrustedSource: false, locations: [loc], isRemote: false };
        assert.strictEqual(isUKJob(input), false, `"${loc}" alone must be rejected`);
    }
});

test('UK Filter: Multiple Locations canonical label allowed', () => {
    const input: JobLocationInput = { isTrustedSource: false, locations: ['Multiple Locations'], isRemote: false };
    assert.strictEqual(isUKJob(input), true, 'Normalizer "Multiple Locations" must pass');
});

test('UK Filter: UI junk placeholders rejected', () => {
    for (const loc of ['+2 More…', '+1 More...', 'All Roles', '#Li']) {
        const input: JobLocationInput = { isTrustedSource: false, locations: [loc], isRemote: false };
        assert.strictEqual(isUKJob(input), false, `"${loc}" must be rejected`);
    }
});

test('UK Filter: Americas / Guatemala / Quebec / Abidjan blocked', () => {
    for (const loc of ['Americas', 'Amer/Latam', 'Amer', '(Guatemala)', '(Quebec)', 'Abidjan']) {
        const input: JobLocationInput = { isTrustedSource: false, locations: [loc], isRemote: false };
        assert.strictEqual(isUKJob(input), false, `"${loc}" must be blocked`);
    }
});

test('UK Filter: placeholder stripped but London kept', () => {
    const input: JobLocationInput = {
        isTrustedSource: false,
        locations: ['3 Locations', 'London'],
        isRemote: false,
    };
    assert.strictEqual(isUKJob(input), true, 'London alongside placeholder must pass');
});

test('UK Filter: Washington Tyne & Wear vs US Washington', () => {
    assert.strictEqual(
        isUKJob({ isTrustedSource: false, locations: ['Washington, United Kingdom'], isRemote: false }),
        true,
        'Washington UK must pass',
    );
    assert.strictEqual(
        isUKJob({ isTrustedSource: false, locations: ['Washington'], isRemote: false }),
        false,
        'Bare Washington must not pass',
    );
    assert.strictEqual(
        isUKJob({ isTrustedSource: false, locations: ['Washington, DC'], isRemote: false }),
        false,
        'Washington DC must not pass',
    );
});

test('UK Filter: UK counties and Winnersh', () => {
    for (const loc of ['Gloucestershire', 'Winnersh', 'Wiltshire']) {
        assert.strictEqual(
            isUKJob({ isTrustedSource: false, locations: [loc], isRemote: false }),
            true,
            `${loc} must pass`,
        );
    }
});

test('UK Filter: production foreign leaks stay blocked', () => {
    for (const loc of [
        'Espoo',
        'Kyiv',
        'United Arab Emirates',
        'Location Negotiable',
        'United-States',
        'Br',
        'Ny',
        'Korea',
        'Ontario',
        'Mapbox Minsk',
    ]) {
        assert.strictEqual(
            isUKJob({ isTrustedSource: false, locations: [loc], isRemote: false }),
            false,
            `${loc} must stay blocked`,
        );
    }
});
