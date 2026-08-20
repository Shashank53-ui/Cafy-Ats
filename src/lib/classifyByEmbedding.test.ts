/**
 * Tests for embedding-based sector mapping.
 *
 * Fast (no model download):
 *   npx tsx --test src/lib/classifyByEmbedding.test.ts
 *
 * With live MiniLM (downloads ~25–80MB once):
 *   RUN_EMBEDDING_MODEL_TESTS=1 npx tsx --test src/lib/classifyByEmbedding.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSectorVectors,
  classifyTitleByEmbedding,
  classifyTitleVector,
  rankSectors,
  resetSectorVectorsCache,
} from './classifyByEmbedding';
import { cosineSimilarity, normalizeTitleForEmbedding, resetEmbeddingPipeline } from './embedText';
import { ALLOWED_SECTORS } from './constants';
import { getSectorPrototypeEntries, SECTOR_PROTOTYPES } from './sectorPrototypes';

test('every ALLOWED_SECTOR has a prototype', () => {
  for (const s of ALLOWED_SECTORS) {
    const p = SECTOR_PROTOTYPES[s];
    assert.ok(p?.base?.length > 20, `missing/short base: ${s}`);
    assert.ok(p.examples.length >= 1, `no examples: ${s}`);
  }
  assert.equal(getSectorPrototypeEntries().length, ALLOWED_SECTORS.length);
});

test('normalizeTitleForEmbedding collapses case and whitespace', () => {
  assert.equal(normalizeTitleForEmbedding('  Senior  Software   Engineer '), 'senior software engineer');
  assert.equal(normalizeTitleForEmbedding('ONLINE TRADING MANAGER'), 'online trading manager');
});

test('cosineSimilarity is 1 for identical unit vectors', () => {
  const a = new Float32Array([0.6, 0.8]);
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-6);
});

test('classifyTitleVector picks nearest sector from synthetic vectors', () => {
  // 2-d toy space: software near [1,0], retail near [0,1]
  const software = 'Engineering (Software)' as const;
  const retail = 'Retail & Hospitality' as const;
  const map = {} as Record<(typeof ALLOWED_SECTORS)[number], Float32Array>;
  for (const s of ALLOWED_SECTORS) {
    map[s] = new Float32Array(384);
  }
  map[software][0] = 1;
  map[retail][1] = 1;

  const softTitle = new Float32Array(384);
  softTitle[0] = 0.95;
  softTitle[1] = 0.05;
  const r1 = classifyTitleVector(softTitle, map, { minScore: 0.1, minMargin: 0.01 });
  assert.equal(r1.sector, software);
  assert.ok(r1.confident);

  const retailTitle = new Float32Array(384);
  retailTitle[0] = 0.1;
  retailTitle[1] = 0.9;
  const r2 = classifyTitleVector(retailTitle, map, { minScore: 0.1, minMargin: 0.01 });
  assert.equal(r2.sector, retail);
});

test('rankSectors orders by descending score', () => {
  const map = {} as Record<(typeof ALLOWED_SECTORS)[number], Float32Array>;
  for (const s of ALLOWED_SECTORS) {
    map[s] = new Float32Array(384);
  }
  map['Finance'][0] = 1;
  map['Legal'][0] = 0.5;
  const title = new Float32Array(384);
  title[0] = 1;
  const ranked = rankSectors(title, map);
  assert.equal(ranked[0]!.sector, 'Finance');
  assert.ok(ranked[0]!.score >= ranked[1]!.score);
});

const runModel = process.env.RUN_EMBEDDING_MODEL_TESTS === '1';

test(
  'live MiniLM maps clear titles to expected sectors',
  { skip: !runModel },
  async () => {
    resetEmbeddingPipeline();
    resetSectorVectorsCache();
    const sectorVectors = await buildSectorVectors();

    const cases: { title: string; expect: (typeof ALLOWED_SECTORS)[number] | (typeof ALLOWED_SECTORS)[number][] }[] = [
      { title: 'Senior Software Engineer', expect: 'Engineering (Software)' },
      { title: 'Frontend Developer', expect: 'Engineering (Software)' },
      { title: 'DevOps Engineer', expect: 'Engineering (Software)' },
      { title: 'Staff Nurse', expect: 'Healthcare' },
      { title: 'Clinical Pharmacist', expect: 'Healthcare' },
      { title: 'Solicitor', expect: 'Legal' },
      { title: 'Financial Analyst', expect: 'Finance' },
      { title: 'Investment Banking Analyst', expect: 'Finance' },
      { title: 'Store Manager', expect: 'Retail & Hospitality' },
      { title: 'Fashion Assistant', expect: 'Retail & Hospitality' },
      { title: 'Online Trading Manager', expect: 'Retail & Hospitality' },
      { title: 'Warehouse Operative', expect: 'Logistics & Transport' },
      { title: 'Supply Chain Manager', expect: ['Logistics & Transport', 'Operations'] },
      { title: 'HGV Driver', expect: 'Logistics & Transport' },
      { title: 'Product Manager', expect: 'Product Management' },
      { title: 'UX Designer', expect: 'Design' },
      { title: 'Marketing Manager', expect: 'Marketing & PR' },
      { title: 'Recruiter', expect: 'HR / People' },
      { title: 'Quantity Surveyor', expect: 'Construction & Infrastructure' },
      { title: 'Sales Executive', expect: ['Sales & Partnerships', 'Business & Strategy'] },
      { title: 'Account Executive', expect: ['Sales & Partnerships', 'Customer Success', 'Finance'] },
      { title: 'Data Analyst', expect: ['Data', 'Business & Strategy'] },
    ];

    for (const c of cases) {
      const result = await classifyTitleByEmbedding(c.title, { sectorVectors });
      const allowed = Array.isArray(c.expect) ? c.expect : [c.expect];
      assert.ok(
        allowed.includes(result.sector),
        `"${c.title}" → ${result.sector} (score=${result.score.toFixed(3)}); expected one of ${allowed.join(' | ')}`,
      );
    }
  },
);

test(
  'live MiniLM: retail trading beats software for Online Trading Manager',
  { skip: !runModel },
  async () => {
    resetEmbeddingPipeline();
    resetSectorVectorsCache();
    const result = await classifyTitleByEmbedding('Online Trading Manager');
    assert.notEqual(
      result.sector,
      'Engineering (Software)',
      `Online Trading Manager should not be Software (got ${result.sector}, score=${result.score})`,
    );
    // Prefer retail; allow Operations as soft second if margin is close
    assert.ok(
      ['Retail & Hospitality', 'Operations', 'Sales & Partnerships'].includes(result.sector),
      `got ${result.sector}`,
    );
  },
);
