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

  // Regression cases from the Aug 2026 sector-quality pass — see
  // auditSectorQuality.ts / auditCompanySector.ts for how these were found.

  // NHS "Consultant [Specialty]" clinical grade titles were falling through
  // to the bare `consultant` catch-all → Business & Strategy (~400+ jobs).
  { title: 'Consultant Psychiatrist', department: 'NHS', expect: 'Healthcare' },
  { title: 'Consultant Psychiatrist in Old Age', department: 'NHS', expect: 'Healthcare' },
  { title: 'Gastroenterologist', expect: 'Healthcare' },
  { title: 'Consultant Cardiologist', expect: 'Healthcare' },
  // Non-clinical consultants must still resolve to Business & Strategy —
  // the specialty-term fix is additive, not a reorder.
  { title: 'Senior Sustainability Consultant', expect: 'Business & Strategy' },

  // Unambiguous legal-practitioner titles stay Legal even with a finance-
  // domain modifier ("Banking Lawyer") that would otherwise match Finance
  // first on title order.
  { title: 'Banking Lawyer', expect: 'Legal' },
  { title: 'Insurance lawyer', expect: 'Legal' },
  { title: 'Structured Finance Lawyer', department: 'Dublin - Talent Management', expect: 'Legal' },
  // Bare "legal" stays out of this pre-check — too ambiguous
  // ("Legal Entity Risk" is a genuine Finance/risk term).
  { title: 'VP, Enterprise Risk Management & Legal Entity Risk', expect: 'Finance' },

  // "Product Designer" is a design discipline, not product management —
  // Design must win this collision regardless of rule order.
  { title: 'Senior Product Designer', expect: 'Design' },
  { title: 'Staff Product Designer', department: 'Product', expect: 'Design' },

  // A department that's merely an echo of the sector column (the old
  // poisoning bug) is a caller-side concern (see reclassifyJobSectors.ts) —
  // inferJobSector itself still takes department at face value here.
  { title: 'Front Office Manager', companySector: 'Retail & Hospitality', expect: 'Retail & Hospitality' },
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
