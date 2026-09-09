/**
 * Smoke tests for Phase 1 title-reject reason codes.
 * Run: npx tsx src/scripts/syncAll.titleReject.test.ts
 */
import { getJobTitleRejectReason, inferAtsFromCareersUrl, isValidJobTitle, parseAstraZenecaResultsHtml, parseHseJobSearchHtml, parseNhsSearchHtml, parseRadancyResultsHtml, resolveProviderAndToken } from './syncAll';

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(msg);
}

assert(getJobTitleRejectReason('') === 'title_too_short', 'empty → title_too_short');
assert(getJobTitleRejectReason('ab') === 'title_too_short', 'short → title_too_short');
assert(getJobTitleRejectReason('Careers') === 'title_junk', 'junk → title_junk');
assert(getJobTitleRejectReason('Edinburgh') === 'title_junk', 'city-only → title_junk');
assert(getJobTitleRejectReason('jobs in greenwich, london') === 'title_junk', 'jobs in → title_junk');
assert(getJobTitleRejectReason('Retail Assistant') === 'title_low_profile', 'retail → title_low_profile');
assert(getJobTitleRejectReason('Warehouse Operative') === 'title_low_profile', 'warehouse → title_low_profile');
assert(getJobTitleRejectReason('Join our Talent Pool') === 'title_junk', 'talent pool → title_junk');
assert(getJobTitleRejectReason('Future Talent Pool') === 'title_junk', 'future talent pool → title_junk');
assert(getJobTitleRejectReason('Sales Talent Pool') === 'title_junk', 'sales talent pool → title_junk');
assert(getJobTitleRejectReason('Lift Engineers in Southern England') === null, 'lift engineer → null');
assert(getJobTitleRejectReason('Relocate to Australia: Principal Engineer') === 'title_relocate_abroad', 'relocate → title_relocate_abroad');
assert(getJobTitleRejectReason('General Practitioner | Fast-Track Your Move to Australia') === 'title_relocate_abroad', 'fast-track AU → title_relocate_abroad');
assert(isValidJobTitle('Staff Nurse - London') === true, 'nurse is valid');
assert(isValidJobTitle('Security Guard') === false, 'isValid false for low profile');

{
    const az = resolveProviderAndToken('pinpoint', 'astrazeneca', 'https://careers.astrazeneca.com');
    assert(az?.provider === 'astrazeneca', `AZ pinpoint routes to astrazeneca, got ${az?.provider}`);
    const pf = resolveProviderAndToken('workday', 'pfizer', 'https://pfizer.wd1.myworkdayjobs.com/PfizerCareers/');
    assert(pf?.token === 'pfizer/PfizerCareers', `Pfizer token from URL, got ${pf?.token}`);
    const parsed = parseAstraZenecaResultsHtml(`
        <ul id="search-results-list">
          <li><a href="/job/cambridge/medical-affairs-manager/7684/1">
            <h2>Medical Affairs Manager</h2>
            <span class="job-location">Cambridge, England, United Kingdom</span>
          </a></li>
        </ul>`);
    assert(parsed.length === 1, `AZ html parse count ${parsed.length}`);
    assert(parsed[0].title === 'Medical Affairs Manager', parsed[0].title);
    assert(parsed[0].location.includes('Cambridge'), parsed[0].location);
    assert(parsed[0].url.includes('careers.astrazeneca.com/job/cambridge'), parsed[0].url);
}

{
    const tk = resolveProviderAndToken('avature', 'takeda', 'https://www.takedajobs.com');
    assert(tk?.provider === 'takeda', `Takeda avature routes to takeda, got ${tk?.provider}`);
    const parsed = parseRadancyResultsHtml(`
        <ul id="search-results-list">
          <li><a href="/job/london/market-research-lead/1113/1">
            <h2>Market Research Lead</h2>
            <span class="job-location">London, England</span>
          </a></li>
        </ul>`, 'https://jobs.takeda.com', 'takeda');
    assert(parsed.length === 1, `Takeda html parse count ${parsed.length}`);
    assert(parsed[0].url.includes('jobs.takeda.com/job/london'), parsed[0].url);
}

{
    const hse = parseHseJobSearchHtml(`
        <div>
          <a href="/jobs/job-search/staff-nurse-limerick-hsemw25926/">Staff Nurse - Limerick HSEMW25926</a>
          Category: Nursing and Midwifery County: Limerick Date posted: 1 September 2026
        </div>
        <div>
          <a href="/jobs/job-search/grade-vi-internal-nrs15574/">Grade VI Data Analyst NRS15574</a>
          Advertisement Type: Confined competition Category: Management County: Dublin Date posted: 1 September 2026
        </div>`);
    assert(hse.length === 1, `HSE parse should skip confined, got ${hse.length}`);
    assert(hse[0].location.includes('Limerick'), hse[0].location);
    assert(hse[0].url.includes('about.hse.ie/jobs/job-search/staff-nurse'), hse[0].url);
}

{
    const nhs = parseNhsSearchHtml(`
        <ul>
          <li>
            <a href="/candidate/jobadvert/C1234-26-0001">Staff Nurse - A&amp;E</a>
            NHS Professionals Limited Torquay TQ2 7AA
          </li>
        </ul>`);
    assert(nhs.length === 1, `NHS parse count ${nhs.length}`);
    assert(nhs[0].title.includes('Staff Nurse'), nhs[0].title);
    assert(nhs[0].url.includes('/candidate/jobadvert/C1234-26-0001'), nhs[0].url);
}

{
    const gh = inferAtsFromCareersUrl('https://job-boards.greenhouse.io/fanduel');
    assert(gh?.provider === 'greenhouse' && gh.token === 'fanduel', `greenhouse infer ${JSON.stringify(gh)}`);
    const wk = inferAtsFromCareersUrl('https://apply.workable.com/resi');
    assert(wk?.provider === 'workable' && wk.token === 'resi', `workable infer ${JSON.stringify(wk)}`);
    const as = inferAtsFromCareersUrl('https://jobs.ashbyhq.com/altruistiq');
    assert(as?.provider === 'ashby' && as.token === 'altruistiq', `ashby infer ${JSON.stringify(as)}`);
}

console.log('syncAll.titleReject.test.ts — all passed');
