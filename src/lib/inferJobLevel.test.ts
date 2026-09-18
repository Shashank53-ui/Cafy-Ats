/**
 * Precision tests for 4-level cascade. Every match must be confidently correct;
 * ambiguous titles must return null (manual review), never Mid Level by default.
 */
import assert from 'node:assert/strict';
import { inferJobLevel, inferJobLevelFromTitle, inferJobLevelFromArchetype } from './inferJobLevel';
import { inferJobLevelFromJD } from './inferJobLevelFromJD';
import { inferJobLevelFromYears } from './inferJobLevelFromYears';
import {
  aggregateChunkClassifications,
  resolveJobLevel,
  resolveJobLevelRulesOnly,
} from './resolveJobLevel';
import { buildTitleChunkEmbedTexts, chunkJobDescription } from './levelJdChunks';
import type { LevelEmbeddingClassifyResult } from './classifyLevelByEmbedding';
import { mapLegacyJobLevel } from './levelConfig';

// ── Legacy map ──────────────────────────────────────────────────────────────

assert.equal(mapLegacyJobLevel('Internship'), 'Entry Level');
assert.equal(mapLegacyJobLevel('Graduate'), 'Entry Level');
assert.equal(mapLegacyJobLevel('Mid-level'), 'Mid Level');
assert.equal(mapLegacyJobLevel('Staff'), 'Senior');
assert.equal(mapLegacyJobLevel('Director'), 'Senior');

// ── Stage 1: confident title hits ───────────────────────────────────────────

assert.equal(inferJobLevel('Senior Engineer'), 'Senior');
assert.equal(inferJobLevel('Snr Software Engineer'), 'Senior');
assert.equal(inferJobLevel('Sr. Data Analyst'), 'Senior');
assert.equal(inferJobLevel('Junior Developer'), 'Junior');
assert.equal(inferJobLevel('Staff Engineer'), 'Senior');
assert.equal(inferJobLevel('Principal Engineer'), 'Senior');
assert.equal(inferJobLevel('VP Engineering'), 'Senior');
assert.equal(inferJobLevel('Vice President of Sales'), 'Senior');
assert.equal(inferJobLevel('CTO'), 'Senior');
assert.equal(inferJobLevel('Managing Director'), 'Senior');
assert.equal(inferJobLevel('Head of Engineering'), 'Senior');
assert.equal(inferJobLevel('Software Engineering Manager'), 'Senior');
assert.equal(inferJobLevel('Senior Software Engineering Manager'), 'Senior');
assert.equal(inferJobLevel('Graduate Software Engineer'), 'Entry Level');
assert.equal(inferJobLevel('Software Engineering Intern'), 'Entry Level');
assert.equal(inferJobLevel('Care Assistant - Bank'), 'Junior');
assert.equal(inferJobLevel('Barista'), 'Junior');
assert.equal(inferJobLevel('Deli Staff (Full & Part Time)'), 'Junior');
assert.equal(inferJobLevel('Staff Nurse - CT'), 'Mid Level');
assert.equal(inferJobLevel('Senior Staff Nurse'), 'Senior');
assert.equal(inferJobLevel('Senior Staff Engineer'), 'Senior');
assert.equal(inferJobLevel('Mid-level Engineer'), 'Mid Level');
assert.equal(inferJobLevel('Mid Level Engineer'), 'Mid Level');
assert.equal(
  inferJobLevel('2027 BNY Summer Internship Program – Office of the COO (Manchester)'),
  'Entry Level',
);
assert.equal(inferJobLevel('Capital Markets COO - Junior Business Manager'), 'Junior');
assert.equal(inferJobLevel('Mid-level to Senior Software Engineer'), 'Senior');
assert.equal(inferJobLevel('Junior or Mid-level Associate, Competition Disputes'), 'Junior');
assert.equal(
  inferJobLevel('QA Automation Engineer Team Lead, Charles River Development , AVP'),
  'Senior',
);
assert.equal(inferJobLevel('Partner Principal Architect, GSI CTO, Google Cloud'), 'Senior');
assert.equal(inferJobLevel('SVP, Head of Marketing Performance'), 'Senior');
assert.equal(inferJobLevel('Chief of Staff'), 'Senior');
assert.equal(inferJobLevel('Senior Insurance Placement Broker'), 'Senior');
assert.equal(
  inferJobLevel('Senior Consultant, Control Tester x3 - Chief Control Office'),
  'Senior',
);
assert.equal(inferJobLevel('EMEA Chief Compliance Officer'), 'Senior');
assert.equal(inferJobLevel('A350 Family Chief Engineer\'s Team Placement (12.5 months)'), 'Entry Level');
assert.equal(inferJobLevel('Solution Architect'), 'Senior');
assert.equal(inferJobLevel('Solutions Architect'), 'Senior');
assert.equal(inferJobLevel('Account Executive'), 'Junior');
assert.equal(inferJobLevel('Associate Director of Finance'), 'Senior');
assert.equal(
  inferJobLevel('Director of Software Engineering (AIOps) - Executive Director'),
  'Senior',
);
assert.equal(inferJobLevel('Executive Director of Public Health'), 'Senior');
assert.equal(inferJobLevel('EMEA Commodities Legal Counsel – Markets - Executive Director'), 'Senior');
assert.equal(inferJobLevel('Executive Director - Pensions Actuary'), 'Senior');
assert.equal(inferJobLevel('Team Leader - Information Security Incident Response'), 'Senior');
assert.equal(inferJobLevel('Assistant Director of Nursing'), 'Senior');
assert.equal(inferJobLevel('Assistant Manager'), 'Mid Level');
assert.equal(inferJobLevel('Shift Lead'), 'Junior');
assert.equal(inferJobLevel('Senior Business Development Executive'), 'Senior');
assert.equal(inferJobLevel('Senior Project Manager (Campus)'), 'Senior');
assert.equal(inferJobLevel('Software Engineer'), 'Mid Level');
assert.equal(inferJobLevel('Project Manager'), 'Mid Level');
assert.equal(inferJobLevel('Registered Nurse'), 'Mid Level');
assert.equal(inferJobLevel('Data Scientist'), 'Mid Level');
assert.equal(inferJobLevel('Chef'), 'Mid Level');
assert.equal(inferJobLevel('Assistant Chef'), 'Mid Level');
assert.equal(inferJobLevel('Caterlink - Assistant Chef'), 'Mid Level');
assert.equal(inferJobLevel('Head Chef'), 'Senior');
assert.equal(inferJobLevel('Chief Engineer'), 'Senior');
assert.equal(inferJobLevel('Chief Project Engineer'), 'Senior');
assert.equal(inferJobLevel('Deputy Chief Nurse'), 'Senior');
assert.equal(inferJobLevel('Assistant Chief Engineer'), 'Senior');
assert.equal(inferJobLevel('Executive Chief Digital Information Officer'), 'Senior');
assert.equal(inferJobLevel('Vice President, Scrum Leader'), 'Senior');
assert.equal(
  inferJobLevel('Corporate Tax Senior Associate / Assistant Manager'),
  'Senior',
);
assert.equal(inferJobLevel('Graduate - Junior AI / ML Software Engineer'), 'Junior');
assert.equal(inferJobLevel('Software Development Manager'), 'Senior');
assert.equal(inferJobLevel('Kitchen Leader'), 'Junior');
assert.equal(inferJobLevel('Kitchen Leader - John Lewis, Stratford'), 'Junior');
assert.equal(inferJobLevel('Home Care Supervisor'), 'Mid Level');
assert.equal(inferJobLevel('Junior Executive Assistant - EMEA'), 'Junior');
assert.equal(inferJobLevel('HGV Mechanic'), 'Mid Level');
assert.equal(inferJobLevel('Team Leader'), 'Junior');
assert.equal(inferJobLevel('Kitchen Team Leader'), 'Junior');
assert.equal(inferJobLevel('Lymphoedema Team Leader'), 'Mid Level');
assert.equal(inferJobLevel('Specialist Clinical Leader – Theatres (MaxFax)'), 'Mid Level');
assert.equal(inferJobLevel('Specialist Clinical Leader - Theatres (MaxFax)'), 'Mid Level');
assert.equal(inferJobLevel('Clinical Team Leader - Ward'), 'Mid Level');
assert.equal(inferJobLevel('NHS Team Leader - Community Nursing'), 'Mid Level');
assert.equal(inferJobLevel('Social Care Team Leader'), 'Mid Level');
assert.equal(inferJobLevel('Retail Team Leader'), 'Junior');
assert.equal(inferJobLevel('Shift Leader'), 'Junior');
assert.equal(inferJobLevel('Engineering Leader'), 'Senior');
assert.equal(inferJobLevel('Technology Leader, RF Systems'), 'Senior');
assert.equal(inferJobLevel('Product Leader - Data'), 'Senior');
assert.equal(inferJobLevel('Public Sector Practice Leader'), 'Senior');
assert.equal(inferJobLevel('Presales Engineering Team Leader'), 'Senior');
assert.equal(inferJobLevel('Business Development Leader'), 'Mid Level');
assert.equal(inferJobLevel('Global Desalination Leader'), 'Mid Level');
assert.equal(inferJobLevel('Growth Leader (Loyverse Pay)'), 'Mid Level');
assert.equal(inferJobLevel('Activity Leader - Bedford'), 'Junior');
assert.equal(inferJobLevel('Holiday Club Activity Leader - Grantham'), 'Junior');
assert.equal(inferJobLevel('Sales Advisor'), 'Junior');
assert.equal(inferJobLevel('Beauty Advisor Edinburgh St James Quarter 16 hours'), 'Junior');
assert.equal(inferJobLevel('Field Sales Advisor (Energy)'), 'Junior');
assert.equal(inferJobLevel('Service Advisor'), 'Junior');
assert.equal(inferJobLevel('HR Advisor'), 'Mid Level');
assert.equal(inferJobLevel('Warehouse Supervisor'), 'Junior');
assert.equal(inferJobLevel('Shift Supervisor'), 'Junior');
assert.equal(inferJobLevel('Part-Time Store Supervisor'), 'Junior');
assert.equal(inferJobLevel('Restaurant Supervisor'), 'Junior');
assert.equal(inferJobLevel('Asbestos Supervisor'), 'Mid Level');
assert.equal(inferJobLevel('Theatres Senior Team Leader'), 'Senior');
assert.equal(inferJobLevel('Tesco Shift Leader - Days - The Forum Exp Maternity Cover'), 'Junior');
assert.equal(inferJobLevel('Lymphoedema Team Leader'), 'Mid Level');
assert.equal(inferJobLevel('Class 2 Driver'), 'Junior');
assert.equal(inferJobLevel('Veterinary Surgeon - Small Animal'), 'Mid Level');
assert.equal(inferJobLevelFromTitle('Technology Leader')?.source, 'trap:professional_leader_senior');
assert.equal(inferJobLevelFromTitle('Sales Advisor')?.source, 'trap:frontline_advisor_junior');
assert.equal(inferJobLevelFromTitle('Warehouse Supervisor')?.source, 'trap:frontline_supervisor_junior');
assert.equal(inferJobLevelFromTitle('Business Development Leader')?.source, 'trap:professional_leader_mid');

assert.equal(inferJobLevelFromTitle('Senior Engineer')?.source, 'title:senior_word');
assert.equal(inferJobLevelFromTitle('Staff Nurse')?.source, 'trap:staff_clinical_or_admin');
assert.equal(inferJobLevelFromTitle('Solution Architect')?.source, 'title:architect');
assert.equal(inferJobLevelFromTitle('Chief of Staff')?.source, 'trap:chief_of_staff');
assert.equal(inferJobLevelFromTitle('Software Engineer'), null);
assert.equal(inferJobLevelFromArchetype('Software Engineer')?.source, 'archetype:professional_mid');
assert.equal(inferJobLevel('Software Engineer'), 'Mid Level');

// ── Stage 1: must NOT guess junk / talent-pool ──────────────────────────────

assert.equal(inferJobLevel('Register your interest'), null);
assert.equal(inferJobLevel('Operations Associate'), 'Mid Level'); // associate archetype
assert.equal(inferJobLevel('Executive Assistant'), 'Mid Level');
assert.equal(inferJobLevel('Sales Lead Generation Executive'), 'Junior');
assert.equal(inferJobLevel('Platform Engineer'), 'Mid Level');
assert.equal(inferJobLevel('Paralegal'), 'Mid Level');
assert.equal(inferJobLevel('Customer Success Manager'), 'Mid Level');
assert.equal(inferJobLevel('Home Manager'), 'Mid Level');
assert.equal(inferJobLevel('General Assistant'), 'Junior');
assert.equal(inferJobLevel('Service Colleague'), 'Junior');
assert.equal(inferJobLevel('Sales Development Representative'), 'Junior');
assert.equal(inferJobLevel('Electrician'), 'Mid Level');
assert.equal(inferJobLevel('Legal Counsel'), 'Mid Level');
assert.equal(inferJobLevel('Adult Acute Speech and Language Therapist'), 'Mid Level');
assert.equal(inferJobLevel('Risk Management - all levels'), 'Mid Level');
assert.equal(inferJobLevel('Fitness Coach'), 'Mid Level');
assert.equal(inferJobLevel('SEO Executive'), 'Junior');
assert.equal(inferJobLevel('Register Your Interest – Veterinary Surgeon Opportunities Across Scotland'), 'Mid Level');
assert.equal(inferJobLevel('Band 7 Sonographer'), 'Senior');
assert.equal(inferJobLevel('Legal Secretary'), 'Junior');
assert.equal(inferJobLevel('Register Your Interest'), null);
assert.equal(inferJobLevel('Transmission and Distribution Opportunities'), null);
assert.equal(inferJobLevel("Join AECOM's Growing Ground Engineering Team!"), 'Mid Level');
assert.equal(inferJobLevel('Keyholder'), 'Junior');
assert.equal(inferJobLevel('Upcoming Opportunities 2026'), null);
assert.equal(inferJobLevel('Electrical Lineman'), 'Mid Level');
assert.equal(inferJobLevel('Plasterer'), 'Mid Level');

// ── Stage 2a: labeled JD only ───────────────────────────────────────────────

assert.equal(
  inferJobLevelFromJD('About the role\nCareer Level: Senior\nWe offer benefits')?.level,
  'Senior',
);
assert.equal(
  inferJobLevelFromJD('Seniority: Mid-level\nJoin our team')?.level,
  'Mid Level',
);
assert.equal(
  inferJobLevelFromJD('Experience Level: Junior')?.source,
  'jd:label:junior',
);

assert.equal(inferJobLevelFromJD('5+ years experience required'), null);
assert.equal(inferJobLevelFromJD('Join our senior leadership team'), null);
assert.equal(inferJobLevelFromJD('Nice to have: senior mentoring skills'), null);

// ── Stage 2b: soft years ────────────────────────────────────────────────────

assert.equal(
  inferJobLevelFromYears('Requirements:\n5+ years of experience required')?.level,
  'Senior',
);
assert.equal(
  inferJobLevelFromYears('Requirements:\n2-4 years experience')?.level,
  'Mid Level',
);
assert.equal(
  inferJobLevelFromYears('Requirements:\nno experience required, we train you')?.level,
  'Entry Level',
);
assert.equal(inferJobLevelFromYears('Nice to have: 10 years experience'), null);

// ── Cascade rules-only ──────────────────────────────────────────────────────

const archTitle = resolveJobLevelRulesOnly({
  title: 'Solution Architect',
  description: 'We need someone great with 5+ years.',
});
assert.equal(archTitle.level, 'Senior');
assert.match(archTitle.source, /architect/);

const archJd = resolveJobLevelRulesOnly({
  title: 'Open Role',
  description: 'Career Level: Senior\nBuild systems',
});
assert.equal(archJd.level, 'Senior');
assert.match(archJd.source, /^jd:label:/);

const yearsOnly = resolveJobLevelRulesOnly({
  title: 'Open Role',
  description: 'Requirements:\n5+ years of experience',
});
assert.equal(yearsOnly.level, 'Senior');
assert.match(yearsOnly.source, /^years:/);

const midYears = resolveJobLevelRulesOnly({
  title: 'Open Role',
  description: 'Requirements:\n2-4 years experience',
});
assert.equal(midYears.level, 'Mid Level');

// Title strict rules win; years beat archetype for unmarked titles
const titleBeatsYears = resolveJobLevelRulesOnly({
  title: 'Junior Developer',
  description: 'Requirements:\n5+ years of experience',
});
assert.equal(titleBeatsYears.level, 'Junior');
assert.match(titleBeatsYears.source, /^title:/);

const yearsBeatArchetype = resolveJobLevelRulesOnly({
  title: 'Software Developer',
  description: 'Requirements:\n5+ years of experience',
});
assert.equal(yearsBeatArchetype.level, 'Senior');
assert.match(yearsBeatArchetype.source, /^years:/);

const archetypeOnly = resolveJobLevelRulesOnly({
  title: 'Software Developer',
  description: null,
});
assert.equal(archetypeOnly.level, 'Mid Level');
assert.match(archetypeOnly.source, /^archetype:/);

const ae = resolveJobLevelRulesOnly({
  title: 'Account Executive',
  description: 'Requirements:\n2+ years sales experience',
});
assert.equal(ae.level, 'Junior'); // title trap wins over years

const review = resolveJobLevelRulesOnly({
  title: 'Register your interest',
  description: 'We need someone great.',
});
assert.equal(review.level, null);
assert.equal(review.needsManualReview, true);
assert.equal(review.source, 'manual_review');

const unmarkedMid = resolveJobLevelRulesOnly({
  title: 'Software Engineer',
  description: null,
});
assert.equal(unmarkedMid.level, 'Mid Level');
assert.match(unmarkedMid.source, /^archetype:/);

const titleWins = resolveJobLevelRulesOnly({
  title: 'Junior Analyst',
  description: 'Career Level: Senior',
});
assert.equal(titleWins.level, 'Junior');
assert.match(titleWins.source, /^title:/);

// ── JD chunking + multi-chunk aggregate ─────────────────────────────────────

const words = Array.from({ length: 320 }, (_, i) => `w${i}`).join(' ');
const chunks = chunkJobDescription(words);
assert.equal(chunks.length, 3);
assert.equal(chunks[0]!.split(' ').length, 150);

const texts = buildTitleChunkEmbedTexts('Platform Engineer', 'About the role. Mentors juniors.');
assert.equal(texts.length, 1);
assert.match(texts[0]!, /^Platform Engineer\n\n/);
assert.deepEqual(buildTitleChunkEmbedTexts('Platform Engineer', null), ['Platform Engineer']);

const hit = (
  level: LevelEmbeddingClassifyResult['level'],
  score: number,
  confident: boolean,
): LevelEmbeddingClassifyResult => ({
  level,
  score,
  secondLevel: 'Junior',
  secondScore: score - 0.1,
  margin: 0.1,
  confident,
  matchKind: 'cosine',
});
const agreed = aggregateChunkClassifications([
  hit('Mid Level', 0.95, true),
  hit('Mid Level', 0.93, true),
  hit('Junior', 0.5, false),
]);
assert.equal(agreed.level, 'Mid Level');
assert.equal(agreed.needsManualReview, false);
assert.match(agreed.source!, /^embedding:multi:/);

const clash = aggregateChunkClassifications([
  hit('Mid Level', 0.95, true),
  hit('Junior', 0.94, true),
]);
assert.equal(clash.level, null);
assert.equal(clash.needsManualReview, true);

const weak = aggregateChunkClassifications([hit('Mid Level', 0.5, false)]);
assert.equal(weak.level, null);
assert.equal(weak.needsManualReview, true);

// ── Stage 3 (optional MiniLM) ───────────────────────────────────────────────

async function runEmbeddingChecks() {
  const { isEmbeddingRuntimeAvailable } = await import('./embedText');
  if (!(await isEmbeddingRuntimeAvailable())) {
    console.log('inferJobLevel tests passed (embedding runtime skipped)');
    return;
  }

  // Bare Software Engineer maps via archetype (role-family knowledge)
  const exactHit = await resolveJobLevel({ title: 'Software Engineer' });
  assert.equal(exactHit.level, 'Mid Level');
  assert.match(exactHit.source, /^(archetype:|embedding:exact:)/);

  const sem = await resolveJobLevel({
    title: 'Open Role',
    description: 'Requirements:\n5+ years of experience. Mentors junior engineers on the team.',
  });
  // Years stage should already resolve before embedding
  assert.equal(sem.level, 'Senior');
  assert.match(sem.source, /^years:/);

  const senior = await resolveJobLevel({ title: 'Senior Engineer' });
  assert.equal(senior.level, 'Senior');
  assert.match(senior.source, /^title:/);

  console.log('inferJobLevel / resolveJobLevel 4-level precision tests passed');
}

runEmbeddingChecks().catch((e) => {
  console.error(e);
  process.exit(1);
});
