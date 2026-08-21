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
  { title: 'Mystery Role XYZ', companySector: 'Facilities Services', expect: 'Operations' },
  { title: 'Mystery Role XYZ', companySector: 'Financial Technology / Wealth Management', expect: 'Finance' },
  { title: 'Mystery Role XYZ', companySector: 'Software / IT Management', expect: 'Engineering (Software)' },
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

  // Mined from the "Other" / "Engineering (Other)" catch-all buckets.
  { title: 'Back of House Nandoca', expect: 'Retail & Hospitality' },
  { title: 'Fitness Coach', department: 'Store Colleague', expect: 'Retail & Hospitality' },
  { title: 'Senior Regulatory Toxicologist', expect: 'Pharmaceutical' },
  { title: 'Principal Hydrologist', expect: 'Construction & Infrastructure' },
  { title: 'Senior Process Engineer - Water / Wastewater', expect: 'Construction & Infrastructure' },

  // Nursery/childcare cluster — no dedicated sector exists, mapped to the
  // closest fit (caregiving overlap) per product decision.
  { title: 'Early Years Level 3 Qualified Casual Activity Leader', expect: 'Healthcare & Social Care' },
  { title: 'Breakfast Club & After School Club Manager', expect: 'Healthcare & Social Care' },
  { title: 'Afterschool Club Manager', expect: 'Healthcare & Social Care' },

  // Bare "trading" false-positived Finance; retail trading titles → Retail.
  { title: 'Customer and Trading Manager - Nightshift', expect: 'Retail & Hospitality' },
  { title: 'Trading Assistant - Shift', expect: 'Retail & Hospitality' },
  { title: 'Online Trading Manager', department: 'Digital', expect: 'Retail & Hospitality' },
  { title: 'Fashion Assistant', department: 'Technology', expect: 'Retail & Hospitality' },
  { title: 'Stores Operative', department: 'Digital, Data and Cloud', expect: 'Retail & Hospitality' },
  { title: 'Senior Software Engineer', department: 'Digital', expect: 'Engineering (Software)' },
  { title: 'Trader', expect: 'Finance' },
  { title: 'Quantitative Trading & Research Analyst', expect: 'Finance' },
  { title: 'Trading Floor Support Engineer', expect: 'Finance' },

  // Finance Lawyer stays Legal even under Finance dept
  { title: 'Finance Lawyer - General Finance', department: 'Finance', expect: 'Legal' },
  { title: 'Structured Finance Lawyer', department: 'Digital', expect: 'Legal' },

  // "Partner Manager" is a recognizable BD/sales title — should resolve via
  // title regardless of the posting company's own industry (e.g. a legal-tech
  // company's Partner Manager isn't doing legal work).
  { title: 'Strategic Partner Manager (Ecosystem & Frontier Alliances)', companySector: 'Legal', expect: 'Sales & Partnerships' },

  // "Medical Device [function]" is medtech, even under a generic department —
  // but bare "medical device" alone shouldn't hijack a genuine engineering role.
  { title: 'Medical Device Regulatory and Quality Consultant', department: 'Corporate', expect: 'Pharmaceutical' },
  { title: 'Medical Device Engineer', department: 'Corporate', expect: 'Pharmaceutical' },
  { title: 'Product Security Specialist for Medical Devices (Cyber Security)', expect: 'Engineering (Software)' },
  { title: 'Medical Device Advisor', expect: 'Healthcare' },

  // ATS team labels must not poison display / classification
  { title: 'Quantity Surveyor', department: 'Recruitment Manila', expect: 'Construction & Infrastructure' },
  { title: 'GTM Operator', department: 'Go to Market', expect: 'Sales & Partnerships' },
  { title: 'Community & Events Lead', department: 'Go-To-Market', expect: 'Sales & Partnerships' },
  { title: 'Account Executive, Mid Market', department: 'Go to Market', expect: 'Sales & Partnerships' },

  // Golden-set regressions (sector_golden_set_1.csv, Aug 2026)
  { title: 'Investment Banking - EMEA Technology - Vice President - London', expect: 'Finance' },
  { title: 'Visual & Creative Merchandiser- Home', expect: 'Retail & Hospitality' },
  { title: 'Retail Sales Merchandiser', expect: 'Sales & Partnerships' },
  { title: 'Sales Merchandiser - Suntory', expect: 'Sales & Partnerships' },
  { title: 'Composite Laminating Technician - Contract (2027 Build)', expect: 'Engineering (Hardware)' },
  { title: 'Device and Packaging Technologist', expect: 'Engineering (Hardware)' },
  { title: 'Customer ServiceHaslingden, Great BritainFull-TimePermanentOnsiteApply now', expect: 'Customer Success' },
  { title: 'Java Sr Lead eSoftware Engineer - Equities Algo Trading - VP', expect: 'Engineering (Software)' },
  { title: 'Application Analyst', expect: 'Engineering (Software)' },
  { title: 'Cost Analyst', expect: 'Finance' },
  { title: 'KYC Analyst', expect: 'Finance' },
  { title: 'Data Protection Analyst', expect: 'Legal' },
  { title: 'Search Engine Optimization Analyst', expect: 'Marketing & PR' },
  { title: 'Senior Workday Analyst', expect: 'HR / People' },
  { title: 'Bar & Waiting Staff', expect: 'Retail & Hospitality' },
  { title: 'Butcher', expect: 'Retail & Hospitality' },
  { title: 'Band 7 Locum Echocardiographer - Preston', expect: 'Healthcare' },
  { title: 'A&E (Accident & Emergency) Nurses, Merseyside', expect: 'Healthcare' },
  { title: 'Principal Ecologist', expect: 'Construction & Infrastructure' },
  { title: 'Contracts Manager', expect: 'Construction & Infrastructure' },
  { title: 'Site Manager', expect: 'Construction & Infrastructure' },
  { title: 'Transfer Pricing Senior Manager, 6-Month FTC', expect: 'Finance' },
  { title: 'Prisoner Custody Officer', expect: 'Operations' },
  { title: 'Resourcer - London', expect: 'HR / People' },

  // Golden-set misses (sector_golden_set_1.csv, Aug 2026)
  { title: 'Investment Banking Technology, Senior Analyst', expect: 'Engineering (Software)' },
  { title: "Join AECOM's growing Transportation Team in Ireland", expect: 'Construction & Infrastructure' },
  { title: 'Register Your Interest - New Site Start Up Derby', expect: 'Operations' },
  { title: 'Lateral', expect: null },
  { title: 'Lateral', companySector: 'Construction & Infrastructure', expect: null },
  { title: 'ZARA READING VISUAL/COMMERCIAL MANAGER', expect: 'Retail & Hospitality' },
  { title: 'TEAM MANAGER', expect: 'Operations' },
  { title: 'TEAM MANAGER', companySector: 'Business & Strategy', expect: 'Operations' },
  { title: 'Unit Manager', expect: 'Healthcare' },

  // Auditor/banker — \baudit\b alone does not match "auditor"; company Soft must not win.
  { title: 'Senior Manager QA Auditor GCP Strategy', expect: 'Finance' },
  { title: 'Senior Auditor', expect: 'Finance' },
  { title: 'Senior Auditor', companySector: 'Engineering (Software)', expect: 'Finance' },
  { title: 'Senior Theatre Practitioner - Scrub', expect: 'Healthcare' },
  { title: 'Senior Pain Clinician', expect: 'Healthcare' },
  { title: 'Director, VAT UK & Europe (London)', expect: 'Finance' },
  { title: 'Senior Auditor - Cloud', expect: 'Business & Strategy' },
  { title: 'Senior Auditor – Cloud', expect: 'Business & Strategy' },
  { title: 'Cloud Auditor', expect: 'Business & Strategy' },
  { title: 'IT Auditor', expect: 'Business & Strategy' },
  { title: 'Cyber Security Auditor', expect: 'Business & Strategy' },
  { title: 'Cloud Sales Executive', expect: 'Sales & Partnerships' },
  { title: 'Google Cloud Sales Director', expect: 'Sales & Partnerships' },
  { title: 'Cloud Recruiter', expect: 'HR / People' },
  { title: 'Cloud Consultant', expect: 'Business & Strategy' },
  { title: 'AWS Cloud Engineer', expect: 'Engineering (Software)' },
  { title: 'Cloud Architect', expect: 'Engineering (Software)' },
  { title: 'Tax Data Analyst, Global Tax Services', expect: 'Finance' },
  { title: 'CSA Senior Cost Consultant - Data Centres (Site Based)', expect: 'Construction & Infrastructure' },
  { title: 'Technical Design Lead- Data Centres', expect: 'Construction & Infrastructure' },
  { title: 'Junior Private Banker', expect: 'Finance' },
  { title: 'Junior Private Banker Remote', companySector: 'Engineering (Software)', expect: 'Finance' },
  { title: 'Mystery Role XYZ', companySector: 'Engineering (Software)', expect: null },
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
