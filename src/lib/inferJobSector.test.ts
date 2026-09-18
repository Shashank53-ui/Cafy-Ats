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
  { title: 'Biotech Process Engineer', expect: 'Engineering (Other)' },
  { title: 'Bioprocess Technician', department: 'Business & Strategy', expect: 'Pharmaceutical' },
  { title: 'Process Engineer', companySector: 'Healthcare / Life Sciences', expect: 'Engineering (Other)' },
  { title: 'Lead C&Q Engineer', expect: 'Engineering (Other)' },
  { title: 'Lead C&Q Engineer', companySector: 'Pharmaceutical', expect: 'Engineering (Other)' },
  { title: 'CQV Engineer', companySector: 'Pharmaceuticals / Biotechnology', expect: 'Engineering (Other)' },
  { title: 'Software Engineer', companySector: 'Pharmaceuticals / Biotechnology', expect: 'Engineering (Software)' },
  { title: 'Account Director, Large Enterprise | Life Sciences', expect: 'Sales & Partnerships' },
  { title: 'Cost Manager / Senior Cost Manager - Life Sciences', expect: 'Construction & Infrastructure' },
  { title: 'Manager, Business Consulting, Life Sciences, Belfast', expect: 'Business & Strategy' },
  { title: 'Inventory Coordinator', companySector: 'Pharmaceuticals / Biotechnology', expect: null },
  { title: 'Lead Credit & Collections Representative (German speaker)', companySector: 'Life Sciences / Laboratory Equipment', expect: null },
  { title: 'Production Technician', companySector: 'Medical Devices / Healthcare', expect: null },
  { title: 'Life Sciences Manager, Management Consulting', expect: 'Business & Strategy' },
  { title: 'Healthcare & Life Sciences Principal, EMEA', expect: null },
  { title: 'Custodian, Life Science', expect: null },
  { title: 'Analytical Chemist - Sports Anti-Doping', expect: 'Research (Technical)' },
  { title: 'Quantity Surveyor', expect: 'Construction & Infrastructure' },
  { title: 'Landscape Architect', expect: 'Construction & Infrastructure' },
  { title: 'Associate Director - Landscape Architecture', expect: 'Construction & Infrastructure' },
  { title: 'Associate Director - Architecture', expect: 'Construction & Infrastructure' },
  { title: 'Deputy Head of Architecture', expect: 'Construction & Infrastructure' },
  { title: 'GPU Internship - Platform Architecture', expect: 'Engineering (Hardware)' },
  { title: 'Solutions Architect', expect: 'Engineering (Software)' },
  { title: 'ServiceNow Architect', expect: 'Engineering (Software)' },
  { title: 'Observability Architect - 12 Month FTC', expect: 'Engineering (Software)' },
  { title: 'Naval Architect', expect: 'Engineering (Other)' },
  { title: 'Outcomes Architect, UKI', expect: 'Sales & Partnerships' },
  { title: 'Senior Process Architect', expect: 'Business & Strategy' },
  { title: 'Employee Experience Innovation Architect', expect: 'HR / People' },
  { title: 'Senior GPU Top Micro-Architect', expect: 'Engineering (Hardware)' },
  { title: 'Lead Architect, Automation & AIOps', expect: 'Engineering (Software)' },
  { title: 'Lead Architect - Securities Services', expect: 'Finance' },
  { title: 'Architect', companySector: 'Media & Journalism', expect: null },
  { title: 'Cybersecurity Architect', expect: 'Engineering (Software)' },
  { title: 'Principal Cybersecurity Architect', expect: 'Engineering (Software)' },
  { title: 'Business Architect', expect: 'Business & Strategy' },
  { title: 'Business Architect & Org Design Lead', expect: 'Business & Strategy' },
  { title: 'Pre Sales Architect', expect: 'Sales & Partnerships' },
  { title: 'Analytics Architect', expect: 'Data' },
  { title: 'Lead Architect Insurance', expect: 'Finance' },
  { title: 'Electrical Design Architect, EMEA', expect: 'Engineering (Hardware)' },
  { title: 'Product Security Specialist for Medical Devices (Cyber Security)', department: 'Engineering', expect: 'Engineering (Software)' },
  { title: 'Organic Chemist', expect: 'Pharmaceutical' },
  { title: 'Production Chemist', expect: 'Pharmaceutical' },
  { title: 'Lead Project Controller', expect: 'Project Management' },
  { title: 'Performance Marketer', expect: 'Marketing & PR' },
  { title: 'Product Marketing Manager – Enterprise Architects, EMEA', expect: 'Marketing & PR' },
  { title: 'Senior Organic Search Executive', expect: 'Marketing & PR' },
  { title: 'Consumer Insights Manager - Innovation and Campaign Development (mat cover FTC)', expect: 'Research (Non-technical)' },
  { title: 'Product Manager', expect: 'Product Management' },
  { title: 'Financial Analyst', expect: 'Finance' },
  { title: 'Talent Acquisition Partner', department: 'People', expect: 'HR / People' },
  { title: 'Join Our Talent Pool: Lift Engineers in Southern England', expect: 'Construction & Infrastructure' },
  { title: 'Join Our Talent Pool: Escalator Engineers in London', expect: 'Construction & Infrastructure' },
  { title: 'Join Our Talent Pool: Door Engineers in Scotland & North East', expect: 'Construction & Infrastructure' },
  { title: 'Join Our Talent Pool: Lift Installers (Major Projects) in London', expect: 'Construction & Infrastructure' },
  { title: 'Join Our Talent Pool: Sales Executives in London and South (Lift & Escalator Industry)', expect: 'Sales & Partnerships' },
  { title: 'Join Our Talent Bank: Electrician', expect: 'Construction & Infrastructure' },
  { title: 'Join Our Talent Network: Software Engineers', expect: 'Engineering (Software)' },
  { title: 'Join Our Team: Lift Engineers', expect: 'Construction & Infrastructure' },
  { title: 'Head of Talent', expect: 'HR / People' },
  { title: 'Join Our Talent Pool: Lift Engineers in Southern England', expect: 'Construction & Infrastructure' },
  { title: 'Join Our Talent Pool: Escalator Engineers in London', expect: 'Construction & Infrastructure' },
  { title: 'Join Our Talent Pool: Lift Engineers in Northern England', expect: 'Construction & Infrastructure' },
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
  { title: 'Legal Counsel, Financial Regulatory & Product', expect: 'Legal' },
  { title: 'Wills, Probate, Tax & Trusts Solicitor', expect: 'Legal' },
  { title: 'Senior Paralegal - Asset Servicing', expect: 'Legal' },
  // Bare "legal" stays out of this pre-check — too ambiguous
  // ("Legal Entity Risk" is a genuine Finance/risk term).
  { title: 'VP, Enterprise Risk Management & Legal Entity Risk', expect: 'Finance' },

  // Veterinary clinical / practice roles — not retail reception or finance package text
  { title: 'Veterinary Receptionist', expect: 'Healthcare & Social Care' },
  { title: 'Veterinary Receptionist (Part-Time)', expect: 'Healthcare & Social Care' },
  { title: 'Lead Veterinary Surgeon - Financial Package up to £100,000!', expect: 'Healthcare & Social Care' },

  // People Partner before partnership/sales GTM patterns
  { title: 'People Partner Manager (Europe) - 12 Month FTC', expect: 'HR / People' },

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
  { title: 'Application Analyst', expect: 'Operations' },
  { title: 'Cost Analyst', expect: 'Finance' },
  { title: 'KYC Analyst', expect: 'Finance' },
  { title: 'Data Protection Analyst', expect: 'Legal' },
  { title: 'Search Engine Optimization Analyst', expect: 'Marketing & PR' },
  { title: 'Senior Workday Analyst', expect: 'HR / People' },
  { title: 'Bar & Waiting Staff', expect: 'Retail & Hospitality' },
  { title: 'Butcher', expect: 'Retail & Hospitality' },
  { title: 'Band 7 Locum Echocardiographer - Preston', expect: 'Healthcare' },
  { title: 'A&E (Accident & Emergency) Nurses, Merseyside', expect: 'Healthcare' },

  // Biomedical scientist vs building-management BMS (production audit)
  { title: 'Specialist Biomedical Scientist', expect: 'Healthcare' },
  { title: 'Band 6 - Biomedical Scientist - Histology - Manchester', expect: 'Healthcare' },
  { title: 'Histology BMS - West Sussex', expect: 'Healthcare' },
  { title: 'Blood Sciences BMS - Carlisle', expect: 'Healthcare' },
  { title: 'Locum Biochemistry BMS - London', expect: 'Healthcare' },
  { title: 'Serology/Quality BMS - Bedfordshire', expect: 'Healthcare' },
  { title: 'Dosimetrist Healthcare Scientist', expect: 'Healthcare' },
  { title: 'ELV Lead / BMS Controls Engineer', expect: 'Construction & Infrastructure' },
  { title: 'BMS Service Team Leader', expect: 'Construction & Infrastructure' },
  { title: 'BMS Consultant', expect: 'Construction & Infrastructure' },
  { title: 'Registered Nursing Associate with Children & Young People', expect: 'Healthcare' },
  { title: 'Operations Manager – Nursing Services', expect: 'Healthcare' },
  { title: 'Audit Nurse', expect: 'Healthcare' },
  { title: 'Nurse – Private Health Insurance', expect: 'Healthcare' },
  { title: 'Architect - Healthcare', expect: 'Construction & Infrastructure' },
  { title: 'EHS Advisor - 12 Month FTC/Secondment', expect: 'Operations' },
  { title: 'Safety Technician', department: 'Workplace Health and Safety', expect: 'Operations' },
  { title: 'Safety Technician, UKIE WHS AMZL', expect: 'Operations' },
  { title: 'Senior Healthcare Broker (Employee Benefits)', expect: 'Finance' },
  { title: 'Head of Spa - Soho Farmhouse', expect: 'Retail & Hospitality' },
  { title: 'Spa Supervisor - Soho Farmhouse', expect: 'Retail & Hospitality' },
  { title: 'Audio Designer - 12 Month FTC', expect: 'Media & Journalism' },
  { title: 'Assoc. Director, Drug Substance Commercialisation', expect: 'Pharmaceutical' },
  { title: 'Deputy Hospital Director (RMN)', expect: 'Healthcare' },
  { title: 'Scientist II, Biopharma - Core or evening shift', expect: 'Pharmaceutical' },
  { title: 'Principal Scientist, Pharmaceutical Development', expect: 'Pharmaceutical' },
  { title: 'Research Scientist, Biopharma (Core Shift)', expect: 'Pharmaceutical' },
  { title: 'Nursery Manager', expect: 'Healthcare & Social Care' },
  { title: 'Packaging SME Engineer - West Dublin - Biopharma Client', expect: 'Engineering (Other)' },
  { title: 'Principal Ecologist', expect: 'Construction & Infrastructure' },
  { title: 'Contracts Manager', expect: 'Construction & Infrastructure' },
  { title: 'Site Manager', expect: 'Construction & Infrastructure' },
  { title: 'Transfer Pricing Senior Manager, 6-Month FTC', expect: 'Finance' },
  { title: 'Transfer Agency - Registration Services, Associate 2', expect: 'Finance' },
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
  { title: 'Account Executive – Private Markets Software Sales (SaaS)', expect: 'Sales & Partnerships' },
  { title: 'Account Executive - Private Markets Software Sales (SaaS)', expect: 'Sales & Partnerships' },
  { title: 'Software Sales Executive', expect: 'Sales & Partnerships' },
  { title: 'SaaS Account Executive', expect: 'Sales & Partnerships' },
  { title: 'Enterprise Software Account Executive', expect: 'Sales & Partnerships' },
  { title: 'Business Development Manager - Cybersecurity', expect: 'Sales & Partnerships' },
  { title: 'Business Development Manager - Experian Data Quality (EDQ)', expect: 'Sales & Partnerships' },
  { title: 'Senior Business Development Manager, Data & Measurement Partnerships (12 month contract)', expect: 'Sales & Partnerships' },
  { title: 'Head of Embedded Finance Enterprise Partnerships', expect: 'Sales & Partnerships' },
  { title: 'Technical Implementation Manager - Embedded Finance', expect: 'Business & Strategy' },
  { title: 'Director, Group AI, Partnerships & Engagement', expect: 'Sales & Partnerships' },
  { title: 'Principal Executive AI Strategist - Business Development, Amazon Connect Applied AI Solutions', expect: 'Sales & Partnerships' },
  { title: 'Senior Director, EMEA Data Partnerships Lead : Data & Tech Solutions', expect: 'Sales & Partnerships' },
  { title: 'Junior Data Scientist - Sales & Marketing', expect: 'Data' },
  { title: 'Sales Engineer', expect: 'Sales & Partnerships' },
  { title: 'Manager, UK Product Partnerships', expect: 'Product Management' },
  { title: 'AI Recruiter', expect: 'HR / People' },
  { title: 'Cloud Recruiter', expect: 'HR / People' },
  { title: 'Cloud Consultant', expect: 'Business & Strategy' },
  { title: 'AWS Cloud Engineer', expect: 'Engineering (Software)' },
  { title: 'Cloud Architect', expect: 'Engineering (Software)' },
  { title: 'AACC Quality Assurance Operational Senior Manager', expect: 'Healthcare' },
  { title: 'Clinical Quality Assurance Manager', expect: 'Healthcare' },
  { title: 'Quality Assurance Manager', expect: 'Operations' },
  { title: 'QA Engineer', expect: 'Engineering (Software)' },
  { title: 'Software QA Analyst', expect: 'Engineering (Software)' },
  { title: 'Head of Software Engineering', expect: 'Engineering (Software)' },
  { title: 'R&D Tax Assistant Manager', expect: 'Finance' },
  { title: 'R&D Tax Assistant Manager (Software)', expect: 'Finance' },
  { title: 'Service Desk Analyst', expect: 'Operations' },
  { title: 'Tesco Colleague - Customer Service Desk', expect: 'Customer Success' },
  { title: 'Maintenance Reliability Manager', expect: 'Engineering (Hardware)' },
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
