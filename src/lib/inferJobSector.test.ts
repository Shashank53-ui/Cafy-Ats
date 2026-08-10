/**
 * Smoke tests for Phase 3 sector inference.
 * Run: npx tsx src/lib/inferJobSector.test.ts
 */
import { inferJobSector } from './inferJobSector';
import { ALLOWED_SECTORS } from './constants';

type Case = {
  title: string;
  department?: string | null;
  companySector?: string | null;
  expect: string | null;
};

const cases: Case[] = [
  { title: 'Senior Software Engineer', expect: 'Engineering (Software)' },
  { title: 'Frontend Developer', expect: 'Engineering (Software)' },
  { title: 'Staff Nurse', expect: 'Healthcare' },
  { title: 'Clinical Pharmacist', expect: 'Healthcare' },
  { title: 'Pharmacovigilance Specialist', expect: 'Pharmaceutical' },
  { title: 'Biotech Process Engineer', expect: 'Pharmaceutical' },
  { title: 'Bioprocess Technician', department: 'Business & Strategy', expect: 'Pharmaceutical' },
  { title: 'Process Engineer', companySector: 'Healthcare / Life Sciences', expect: 'Pharmaceutical' },
  { title: 'Software Engineer', companySector: 'Pharmaceuticals / Biotechnology', expect: 'Engineering (Software)' },
  { title: 'Quantity Surveyor', expect: 'Construction & Infrastructure' },
  { title: 'Landscape Architect', expect: 'Construction & Infrastructure' },
  { title: 'Solutions Architect', expect: 'Engineering (Software)' },
  { title: 'Product Manager', expect: 'Product Management' },
  { title: 'Financial Analyst', expect: 'Finance' },
  { title: 'Talent Acquisition Partner', department: 'People', expect: 'HR / People' },
  { title: 'Account Executive', expect: 'Sales & Partnerships' },
  { title: 'Warehouse Operative', expect: 'Logistics & Transport' },
  { title: 'Barista', expect: 'Retail & Hospitality' },
  { title: 'Mystery Role XYZ', companySector: 'Legal', expect: 'Legal' },
  { title: 'Mystery Role XYZ', expect: null },
];

let failed = 0;
for (const c of cases) {
  const got = inferJobSector(c.title, c.department, c.companySector);
  if (got !== c.expect) {
    failed++;
    console.error(
      `FAIL: "${c.title}" dept=${c.department ?? '-'} co=${c.companySector ?? '-'} → got ${JSON.stringify(got)}, want ${JSON.stringify(c.expect)}`,
    );
  } else {
    console.log(`ok: ${c.title} → ${got}`);
  }
  if (got && !(ALLOWED_SECTORS as readonly string[]).includes(got)) {
    failed++;
    console.error(`FAIL: "${got}" not in ALLOWED_SECTORS`);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} sector smoke checks passed.`);
