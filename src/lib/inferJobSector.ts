import { ALLOWED_SECTORS } from './constants';

/** Patient-facing pharmacy / clinical care — keep under Healthcare, not industry Pharmaceutical. */
const PATIENT_FACING_PHARMACY_OR_CARE =
    /\b(pharmacist|pharmacy technician|pharmacy accuracy|gp practice pharmacist|retail pharmacy|inpatient pharmacy|outpatient pharmacy|nurse|doctor|physician|midwife|paramedic|dentist|\bgp\b)\b/;

/** Roles that should not inherit a company's Pharmaceutical label. */
const NON_PHARMA_ROLE_OVERRIDE =
    /\b(chef|commis|barista|food service|catering|cleaner|housekeeping|security guard|software|developer|frontend|backend|fullstack|devops|sre)\b/;

/** Job *functions* that are pharmaceutical (lab / GMP / drug development). */
const PHARMA_ROLE_SIGNAL =
    /\b(pharmacovigilance|drug discovery|drug development|drug substance|drug product|medicinal chemistry|organic chemists?|production chemists?|process chemists?|medicinal chemists?|bioprocess|biomanufacturing|biotechnician|formulation scientists?|process development|pharmaceutical development|clinical research associate|\bcra\b|gxp|\bgmp\b|cmc|toxicolog(y|ist)?)\b/;

/** Industry domain tags — must not beat sales/engineering/finance job functions. */
const PHARMA_DOMAIN_TAG =
    /\b(pharmaceuticals?|pharma|biotech|biotechnology|biopharma|biopharmaceutical|life\s*sciences?)\b/;

const TECH_DOMAIN =
    /\b(cloud|digital|cyber|cybersecurity|infosec|aws|azure|saas|technology|technologies|information systems?|soc)\b|\bit\b/;

const BUILD_ROLE =
    /\b(software|esoftware|developers?|engineers?|devops|sre|programmers?|architects?|scientists?|mlops|frontend|backend|fullstack)\b/;

const PHARMA_COMPANY_SECTOR =
    /\b(pharmaceuticals?|pharma|biotech|biotechnology|biopharma|life\s*sciences?)\b/;

// Exported (read-only use) so audit tooling can report which rule fired for
// a given job without re-implementing/duplicating the match logic.
export const RULES: [RegExp, string][] = [
    // Built-environment architecture — BEFORE software "architect" catch-all
    [/\b(architectural (assistant|technologist|designer|coordinator|technician|manager)|landscape architects?|landscape architecture|part\s*[123]\s+architect|riba|architecture practice)\b/, 'Construction & Infrastructure'],
    // Engineering (Software) — IT architects + developers (not building architects).
    // Bare "technology" deliberately excluded — IB/coverage titles like
    // "Investment Banking - EMEA Technology" are Finance, not SWE.
    // Bare "qa" / "quality assurance" excluded — NHS/ops QA is not software testing
    // (handled in inferJobSectorUnclamped with software-context cues).
    // IT service desk / app support / IT support are ops — not SWE (see overrides).
    [/\b(software|esoftware|developer|frontend|backend|fullstack|full.stack|ios|android|devops|devsecops|mlops|sre|machine learning|ml engineer|ai engineer|cybersecurity|cyber security|infosec|information security|penetration test|pen test|qa engineers?|quality assurance engineers?|sdet|test automation)\b/, 'Engineering (Software)'],
    [/\b(software|solution|solutions|cloud|enterprise|data|security|systems?|technical|platform|platforms?|application|infrastructure|network|salesforce|sap|servicenow|cybersecurity|devsecops|full[\s-]?stack|kubernetes|observability|migration|integration|information|test|digital|domain|cluster|deployment|transformation|hosting|aiops|cobol|e2e|viva|agentic|service)\s+architects?\b/, 'Engineering (Software)'],
    // Pharmaceutical — specific lab/GMP/drug-development *roles* only (not "Life Sciences" BD tags).
    [PHARMA_ROLE_SIGNAL, 'Pharmaceutical'],
    // Engineering (Hardware) — plant maintenance / reliability (not SRE)
    [/\b(hardware|electrical|electronics|mechanical|manufacturing|firmware|embedded|machine operators?|factory automation|energy storage|shipbuild|packaging technicians?|maintenance technicians?|maintenance reliability|reliability managers?|plant (maintenance|reliability)|wind turbine|plant fitters?)\b|\bcomposite laminat\w*|\bpackaging technolog\w*/, 'Engineering (Hardware)'],
    // Data — after Legal "data protection" override in inferJobSectorUnclamped
    [/\b(data(?!\s*cent)|analytics|statistics|sql|python|bi|business intelligence|dba|database administrator|customer targeting)\b/, 'Data'],
    // Finance
    // `trader`/`traders` added — \btrading\b didn't match "Index Trader" etc.
    // Bare "trading"/"trader" deliberately excluded — UK grocery retail uses
    // "Trading Assistant" / "Customer and Trading Manager" for shop-floor
    // staff (found via audit, 155 jobs), which isn't financial trading at
    // all. Require a specific financial-trading phrase instead.
    [/\b(finance|accounting|tax|\bvat\b|audit(?:or|ors|ing)?|financial|quant|investment|treasury|actuary|actuarial|underwriter|insurance|wealth|risk|banking|bankers?|accountant|accounts|regulatory reporting|trading (floor|desk|strategy|systems?)|(equities?|fx|commodit(y|ies)|quantitative|electronic|algo(rithmic)?|proprietary|derivatives?|credit|securities) trading|\btraders?\b|cost analysts?|\bkyc\b|\baml\b|payments? analysts?|transfer pricing|transfer agency|private bankers?|claims handlers?|asset (management|servicing)|asset custody|mid-?market funds?|\bfunds?\b)\b/, 'Finance'],
    // Healthcare (clinical/medical) — patient-facing care; before Healthcare & Social Care
    // Includes NHS "Consultant [Specialty]" clinical grade titles — without these,
    // titles like "Consultant Psychiatrist" fall through to the bare `consultant`
    // catch-all below and land in Business & Strategy (found via audit, ~400+ jobs).
    [/\b(health|medical|clinical|biomedical|nurses?|nursing|doctor|physician|therapist|pharmacist|pharmacy|physiotherapist|physiologists?|radiographer|midwife|midwifery|paramedic|dentist|dental|optometrist|surgeon|surgery|gp|psychiatr(?:y|ist|ists|ic)|gastroenterolog(?:y|ist)|histopatholog(?:y|ist)|histolog(?:y|ist)|cardiolog(?:y|ist)|radiolog(?:y|ist)|rheumatolog(?:y|ist)|dermatolog(?:y|ist)|anaesthe(?:tics|tist|sia)|oncolog(?:y|ist)|neurolog(?:y|ist)|urolog(?:y|ist)|endocrinolog(?:y|ist)|haematolog(?:y|ist)|hematolog(?:y|ist)|nephrolog(?:y|ist)|gynaecolog(?:y|ist)|obstetric(?:s|ian)?|ophthalmolog(?:y|ist)|geriatric(?:ian)?|emergency medicine|stroke medicine|acute medicine|intensive care medicine|respiratory medicine|rehabilitation medicine|general medicine|pain management|paediatric(?:ian)?|neurophysiology|immunolog(?:y|ist)|microbiolog(?:y|ist)|virolog(?:y|ist)|serolog(?:y|ist)|biochemistr(?:y|ies)|blood sciences?|blood transfusions?|clinical psycholog(?:y|ist)|echocardiograph(?:er|y)|audiolog(?:y|ist)|pathology|dosimetrists?|healthcare scientists?|clinical scientists?|\ba\s*&\s*e\b|accident\s*&\s*emergency|home managers?|computed tomography|prescribers?|theatre practitioners?|scrub practitioners?|clinicians?)\b/, 'Healthcare'],
    // Healthcare & Social Care
    [/\b(dietitian|social worker|ward manager|carer|care worker|care home|social care|community care|matron|sonographer|podiatrist|care assistant|general practitioner|veterinary|practice manager|nursery|early years|after.?school|breakfast club|holiday club|childcare|childminder)\b/, 'Healthcare & Social Care'],
    // Legal
    [/\b(legal|counsel|lawyer|attorney|solicitor|compliance|paralegal|data protection|gdpr|privacy analysts?|\bprivacy\b)\b/, 'Legal'],
    // Marketing & PR
    [/\b(marketing|marketers?|brand|content|social media|communications|seo|search engine optimization|organic search|growth|public relations|pr|copywriter|copywriting)\b/, 'Marketing & PR'],
    // Design — interior / UX / graphic. Org design is strategy (handled before matchRules).
    [/\b(interior architect|interior design|ui|ux|product designer|graphic|creative|art directors?)\b/, 'Design'],
    [/\bdesign\b/, 'Design'],
    // Product Management — \bproduct\b catches ATS depts named "Product"
    [/\b(product manager|product management|product owner|product lead|head of product|product)\b/, 'Product Management'],
    // Project Management
    [/\b(project manager|programme|program manager|scrum|agile|delivery manager|project portfolio|portfolio (&|and) governance|client delivery|project controllers?|project coordinators?|project schedulers?|project administrators?)\b/, 'Project Management'],
    // Sales & Partnerships — include GTM / go-to-market ATS team labels
    [/\b(sales|partnerships|business development|account executive|bdr|sdr|revenue|client advisor|account director|partner manager|partnership manager|alliance managers?|client partners?|commercial managers?|go[\s-]*to[\s-]*market|goto\s*market|\bgtm\b)\b/, 'Sales & Partnerships'],
    // Customer Success
    [/\b(customer success|customer support|customer service|account manager|client success|call handlers?)\b/, 'Customer Success'],
    // HR / People — \bpeople\b catches ATS depts named "People".
    // Do not treat "talent pool/community/network/pipeline/bank" as HR (open-role headlines).
    [/\b(hr|human resources|people ops|talent(?![\s-]+(pool|community|network|pipeline|bank))|recruiter|recruiting|resourcer|people partner|payroll|compensation|reward|learning.development|l&d|diversity|inclusion|dei|employee relations|people|workday analysts?|training advisors?)\b/, 'HR / People'],
    // Construction & Infrastructure
    [/\b(quantity surveyor|cost manager|cost management|estimator|estimating|contracts? managers?|contract management|electrician|surveyor|construction|civil engineer|civil engineering|structural|plumber|carpenter|bricklayer|joiner|project controls|project planner|fabric technician|built environment|urban design|town plann(?:er|ers|ing)|site managers?|building inspectors?|groundworkers?|\bbim\b|bms (service|controls?|consultants?|engineers?|technicians?|leads?|managers?)|building management systems?|\bmep\b|hydraulic|flood (risk|model|modeller|modeler|forecast)|vertical transportation|lift engineers?|escalator engineers?|door engineers?|lift installers?|highways?|hydrologist|hydrogeologists?|wastewater|arborist|ecologists?|ornithologists?|climate resilience)\b/, 'Construction & Infrastructure'],
    // Retail & Hospitality
    [/\b(beauty|chef|retail|store manager|hospitality|barista|restaurant|hotel|catering|cook|merchandisers?|buyer|nandoca|back of house|front of house|fitness coach|fitness manager|gym instructor|personal trainer|padel coach|online trading|trading assistant|trading manager|stores? operative|fashion assistant|customer service agent|customer care agent|deli assistant|\brunners?\b|receptionist|housekeeping|concierge|area manager|butchers?|\bcafe\b|kitchen (managers?|team leaders?|team)|skincare|sommeliers?|leisure|bar (&|and)? waiting|waiting staff|stock managers?|shift lead.{0,30}food|lounge managers?|breakfast (&|and) afternoon|visual.?commercial|\bgap\b.{0,20}team members?)\b/, 'Retail & Hospitality'],
    // Logistics & Transport — before Operations to claim warehouse/logistics/supply chain
    [/\b(hgv|driver|warehouse|logistics|supply chain|transport|freight|courier|distribution|\bloaders?\b|material handlers?)\b/, 'Logistics & Transport'],
    // Operations — after Logistics to avoid overlap
    // Service desk / IT support are workplace IT ops, not Engineering (Software).
    [/\b(operations|facilities|admin|procurement|purchasing|executive assistant|branch manager|deputy manager|assistant managers?|operational trainer|client processing|prisoner custody|production planners?|siam|workplace experience|events?.{0,20}operative|night painters?|\bpainters?\b|pick up and return|\behs\b|health and safety|workshop instructors?|service desk|it (onsite )?support|application support|application analysts?|applications? analysts?)\b/, 'Operations'],
    // Research (Non-technical) — specific phrases before generic research
    [/\b(market research|user research|consumer insights|insights analyst|ux research)\b/, 'Research (Non-technical)'],
    // Research (Technical)
    [/\b(research|scientist|r&d|phd|investigator|physicists?|researchers?)\b/, 'Research (Technical)'],
    // Media & Journalism
    [/\b(media|journalism|writer|editor|reporter|news|broadcast)\b/, 'Media & Journalism'],
    // Engineering (Other) — generic catch-all after all specific engineering types
    // C&Q / CQV = commissioning & qualification (plant/process engineers, not pharma-industry copy).
    [/\b(c&q|cqv|commissioning (and|&) qualification|commissioning qualification)\b/, 'Engineering (Other)'],
    [/\b(engineers?|engineering|it technicians?)\b/, 'Engineering (Other)'],
    // Business & Strategy — broadest catch-all last
    // `pursuit` (bid/pursuit management — BD terminology at consultancies) added.
    [/\b(business|strategy|consultant|consulting|analyst|corporate|planning|pursuit|bid managers?|managing directors?)\b/, 'Business & Strategy'],
];

function matchRules(text: string): string | null {
    for (const [regex, sector] of RULES) {
        if (regex.test(text)) return sector;
    }
    return null;
}

/** Same as matchRules, but also returns which rule (index + pattern) fired — for audit tooling only. */
export function matchRuleDebug(text: string): { sector: string; ruleIndex: number; pattern: string } | null {
    for (let i = 0; i < RULES.length; i++) {
        const [regex, sector] = RULES[i];
        if (regex.test(text)) return { sector, ruleIndex: i, pattern: regex.source };
    }
    return null;
}

const ALLOWED_SECTOR_SET = new Set<string>(ALLOWED_SECTORS);

const COMPANY_SECTOR_MAP: Record<string, string> = {
    'facilities services': 'Operations',
    'manufacturing / engineering': 'Engineering (Hardware)',
    'financial technology / wealth management': 'Finance',
    'healthcare / clinical research': 'Healthcare',
    'entertainment / recreation': 'Retail & Hospitality',
    'software / it management': 'Engineering (Software)',
    'financial services / banking': 'Finance',
    'engineering / architecture': 'Construction & Infrastructure',
    'semiconductors / manufacturing': 'Engineering (Hardware)',
};

function normalizeCompanySectorLabel(companySector: string): string | null {
    const raw = companySector.trim();
    if (!raw) return null;
    if (ALLOWED_SECTOR_SET.has(raw)) return raw;
    const mapped = COMPANY_SECTOR_MAP[raw.toLowerCase()];
    if (mapped) return mapped;
    const fromRules = matchRules(raw.toLowerCase());
    if (fromRules) return fromRules;
    return 'Other';
}

function isPharmaCompanySector(companySector: string | null | undefined): boolean {
    if (!companySector) return false;
    return PHARMA_COMPANY_SECTOR.test(companySector.toLowerCase());
}

/** Company industry labels that must not become job.sector when the title is unclear. */
const WEAK_COMPANY_SECTOR_FALLBACK = new Set([
    'Engineering (Software)',
    'Engineering (Hardware)',
    'Engineering (Other)',
    'Other',
    'Data',
    'Product Management',
]);

/**
 * Only untitled / Other leftovers may inherit company Pharmaceutical.
 * Never remap a job-function sector (engineer, nurse, PM, …) from the employer.
 */
const COMPANY_PHARMA_OVERRIDE_FROM = new Set(['Other']);

export function inferJobSector(
    title: string,
    department?: string | null,
    companySector?: string | null
): string | null {
    const result = inferJobSectorUnclamped(title, department, companySector);
    if (!result) return null;
    return ALLOWED_SECTOR_SET.has(result) ? result : 'Other';
}

/** ATS org labels that are NOT job functions — never use alone for sector. */
const WEAK_DEPARTMENTS =
    /^(digital|technology|technologies|tech|it|information technology|corporate|general|company|other|various|all|central|group|uk|emea|global|enterprise|innovation|transformation|platform|platforms|solutions|shared services|business unit|bu)$/i;

const BUILDING_ARCHITECT_TITLE =
    /\b(architectural (assistant|technologist|designer|coordinator|technician|manager)|landscape architects?|landscape architecture|part\s*[123]\s+architect|riba|architecture practice)\b/;

function isNonBuildingArchitectTitle(title: string): boolean {
    if (!title) return false;
    if (BUILDING_ARCHITECT_TITLE.test(title)) return false;
    return /\barchitects?\b/.test(title) || /\bplatform architecture\b/.test(title);
}

function isWeakDepartment(department: string): boolean {
    const d = department.toLowerCase().trim();
    if (!d) return true;
    if (WEAK_DEPARTMENTS.test(d)) return true;
    // Multi-word weak buckets, e.g. "Digital, Data and Cloud", "Technology Services"
    if (
        /^(digital|technology|tech|it|corporate)\b/.test(d) &&
        !/\b(legal|finance|pharmacy|marketing|sales|hr|people|engineering software|software engineering)\b/.test(d)
    ) {
        // "Digital Marketing" is strong → Marketing; "Digital" alone / "Digital Data Cloud" weak
        if (/\b(marketing|sales|finance|legal|pharmacy|recruit|people|hr)\b/.test(d)) return false;
        return true;
    }
    return false;
}

function applyPharmaCompanyOverride(
    sector: string,
    companySector: string | null | undefined,
    combined: string,
): string {
    if (
        isPharmaCompanySector(companySector) &&
        COMPANY_PHARMA_OVERRIDE_FROM.has(sector) &&
        !PATIENT_FACING_PHARMACY_OR_CARE.test(combined) &&
        !NON_PHARMA_ROLE_OVERRIDE.test(combined)
    ) {
        return 'Pharmaceutical';
    }
    return sector;
}

/** Open-application headlines are not HR jobs — keep the real role words. */
function stripTalentPoolBoilerplate(text: string): string {
    return text
        .replace(/\bjoin(?:ing)? our talent[\s-]+(pool|community|network|pipeline|bank)\b:?/g, ' ')
        .replace(/\btalent[\s-]+(pool|community|network|pipeline|bank)\b:?/g, ' ')
        .replace(/\bjoin(?:ing)? our team\b:?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function inferJobSectorUnclamped(
    title: string,
    department?: string | null,
    companySector?: string | null
): string | null {
    const t = stripTalentPoolBoilerplate((title || '').toLowerCase().trim());
    const d = (department || '').toLowerCase().trim();
    const combined = `${d} ${t}`.trim();

    // Applied AI / ML / ERP systems titles (avoid bare "ERP" NHS band noise like "*ERP*").
    if (
        /\b(applied ai|ai\/ml|ai & ml|machine learning|mlops|erp (transformation|consultant|specialist|analyst|manager|developer|implement))\b/.test(t) ||
        (/\b(ai|ml)\b/.test(t) && /\b(engineer|director|scientist|developer)\b/.test(t))
    ) {
        return 'Engineering (Software)';
    }

    // Common SWE abbreviations
    if (/\b(sde|swe|sre)\b/.test(t)) {
        return 'Engineering (Software)';
    }

    // Cloud/AWS as a domain only counts as Software when the function is building it.
    if (
        /\b(cloud|aws|azure|gcp|oracle cloud)\b/.test(t) &&
        /\b(engineers?|developers?|architects?|devops|sre|programmers?)\b/.test(t)
    ) {
        return 'Engineering (Software)';
    }

    // QA / Quality Assurance: software testing ≠ clinical or operational QA (NHS etc.).
    // "QA Auditor" is assurance/audit — handled below, not this block.
    if (
        /\b(quality assurance|\bqa\b|quality governance|quality improvement)\b/.test(t) &&
        !/\bauditors?\b/.test(t)
    ) {
        if (
            /\b(software|sdet|test automation|automation test|cypress|selenium|playwright)\b/.test(t) ||
            /\b(qa|quality assurance)\s+(engineers?|developers?|testers?|analysts?)\b/.test(t) ||
            (/\b(engineers?|developers?|testers?)\b/.test(t) && /\b(qa|quality assurance)\b/.test(t))
        ) {
            return 'Engineering (Software)';
        }
        if (
            /\b(clinical|patient|nursing|hospital|\bnhs\b|medical|care quality|\bcqc\b|medicines? quality)\b/.test(
                t,
            ) ||
            /\boperational\b/.test(t)
        ) {
            return 'Healthcare';
        }
        // Factory / ops QA managers without software cues
        if (/\b(managers?|leads?|directors?|officers?|specialists?|coordinators?)\b/.test(t)) {
            return 'Operations';
        }
    }

    // Data centres are built environment, not the Data job family.
    if (/\bdata\s*cent(re|er)s?\b/.test(t)) {
        return 'Construction & Infrastructure';
    }

    // Tax / R&D tax advisory beats a trailing "(Software)" domain tag — not SWE.
    if (
        /\b(r&d tax|research and development tax|tax (assistant|manager|advisor|adviser|consultant|specialist)|transfer pricing|\btax\b|\bvat\b|accountants?)\b/.test(
            t,
        ) &&
        !/\b(software engineers?|software developers?|developers?|devops|sre)\b/.test(t)
    ) {
        return 'Finance';
    }

    // Plant / maintenance reliability is Hardware — not Software (SRE).
    if (
        /\b(maintenance reliability|reliability managers?|plant (maintenance|reliability)|maintenance managers?)\b/.test(
            t,
        ) &&
        !/\b(site reliability|software|devops|\bsre\b)\b/.test(t)
    ) {
        return 'Engineering (Hardware)';
    }

    // IT service desk / app support — ops, not Engineering (Software).
    // Keep "Customer Service Desk" (retail) out — that is Customer Success.
    if (
        /\b(service desk|application support|applications? analysts?|application analysts?|it (onsite )?support|it support analysts?)\b/.test(
            t,
        ) &&
        !/\b(software engineers?|developers?|devops|customer service)\b/.test(t)
    ) {
        return 'Operations';
    }

    // Job function beats technology-domain modifiers ("Senior Auditor – Cloud"
    // is IT assurance advisory, not Engineering (Software)).
    if (!BUILD_ROLE.test(t)) {
        if (/\b(auditors?|it audit|technology (audit|risk)|cyber audit|cloud audit)\b/.test(t)) {
            // Cloud/IT/cyber audit = advisory assurance. Statutory audit = Finance.
            // Either way it is not Engineering (Software) (`qa` / `cloud` used to steal it).
            return TECH_DOMAIN.test(t) ? 'Business & Strategy' : 'Finance';
        }
        if (/\b(sales|account executives?|\bbdr\b|\bsdr\b)\b/.test(t)) {
            return 'Sales & Partnerships';
        }
        if (/\b(recruiters?|talent acquisition)\b/.test(t)) {
            return 'HR / People';
        }
        if (/\b(tax|accountants?)\b/.test(t)) {
            return 'Finance';
        }
        if (/\b(marketing|seo|brand managers?)\b/.test(t) && !/\bdata\s*cent/.test(t)) {
            return 'Marketing & PR';
        }
    }

    // Unambiguous legal-practitioner titles stay Legal (even "Finance Lawyer").
    if (/\b(lawyer|solicitor|attorney)\b/.test(combined)) {
        return 'Legal';
    }

    // Privacy / GDPR roles — before bare "data" → Data.
    if (/\b(data protection|gdpr|privacy (analyst|officer|manager|counsel))\b/.test(t)) {
        return 'Legal';
    }

    // SWE titles beat financial-domain modifiers ("Equities Algo Trading").
    if (
        /\b(java|esoftware|e-?software|golang|typescript|kotlin)\b/.test(t) &&
        /\b(engineers?|developers?|programmers?)\b/.test(t)
    ) {
        return 'Engineering (Software)';
    }
    if (/\b(software engineers?|software developers?)\b/.test(t)) {
        return 'Engineering (Software)';
    }

    // Merchandising: brand/field "Sales Merchandiser" is Sales; shop-floor
    // visual/creative merchandiser is Retail.
    if (/\bmerchandisers?\b/.test(t)) {
        if (/\bsales\b/.test(t)) return 'Sales & Partnerships';
        return 'Retail & Hospitality';
    }

    // Glued ATS titles sometimes drop spaces ("Customer ServiceHaslingden").
    {
        const compact = t.replace(/[^a-z0-9]+/g, '');
        if (compact.startsWith('customerservice')) {
            return 'Customer Success';
        }
    }

    // Store colleague titles often lack "retail" but are clearly shop-floor.
    if (
        /\b(team members?|shift leads?)\b/.test(t) &&
        (/\b(outlet|simply food|store|retail|food|zara|gap|silverburn)\b/.test(t) ||
            /\bteam members?\s*-/.test(t))
    ) {
        return 'Retail & Hospitality';
    }
    if (/^\s*shift leads?\s*$/i.test(title || '')) {
        return 'Retail & Hospitality';
    }

    // IB internal technology function ("Investment Banking Technology, Senior Analyst")
    // vs coverage bankers ("Investment Banking - EMEA Technology - VP") which stay Finance.
    if (
        /\binvestment banking technology\b/.test(t) &&
        !/\binvestment banking\s*[-–—]/.test(t)
    ) {
        return 'Engineering (Software)';
    }

    // Visual/commercial shop-floor (Zara etc.) before Sales "commercial manager".
    if (
        /\bvisual\s*[\/&-]?\s*commercial\b/.test(t) ||
        (/\bzara\b/.test(t) && /\b(manager|assistant|advisor|associate)\b/.test(t))
    ) {
        return 'Retail & Hospitality';
    }

    // AECOM-style infrastructure transportation teams (not warehouse logistics).
    if (/\btransportation (team|engineer|planner|planning)\b/.test(t)) {
        return 'Construction & Infrastructure';
    }

    // Talent-pool / new-site opening headlines.
    if (
        /\bregister (your )?interest\b/.test(t) &&
        /\b(new site|site start|start.?up)\b/.test(t)
    ) {
        return 'Operations';
    }

    // Bare people-manager titles — too thin for Business catch-all / company fallback.
    if (/^\s*team managers?\s*$/i.test(title || '')) {
        return 'Operations';
    }
    if (/^\s*unit managers?\s*$/i.test(title || '')) {
        return 'Healthcare';
    }

    // Org / operating-model design is strategy, not UX/graphic design.
    if (/\borg(anisational|anizational)? design\b/.test(t)) {
        return 'Business & Strategy';
    }

    // Product marketers (including those targeting "Enterprise Architects").
    if (/\b(product marketing|performance marketers?|marketers?)\b/.test(t)) {
        return 'Marketing & PR';
    }

    // Field regulatory affairs (ads/promo, pharma, medtech) — clinical-adjacent.
    if (/\bregulatory affairs\b/.test(t)) {
        return 'Healthcare';
    }

    // Installer/trainer product roles without a clearer function cue.
    if (/\b(trainer and installer|installer and trainer)\b/.test(t)) {
        return 'Engineering (Other)';
    }

    // C&Q / CQV engineers — job is engineering even at a pharma CQV consultancy.
    if (/\b(c&q|cqv|commissioning (and|&) qualification)\b/.test(t)) {
        return 'Engineering (Other)';
    }

    if (/\bmedical devices?\b.*\b(regulatory|quality|compliance|engineer(ing)?|manufactur|design assurance)\b|\b(regulatory|quality|compliance|engineer(ing)?|manufactur|design assurance)\b.*\bmedical devices?\b/.test(combined)) {
        // Cyber / product-security on a device is software, not pharma manufacturing.
        if (!/\b(cyber|cybersecurity|infosec|product security|software)\b/.test(t)) {
            return 'Pharmaceutical';
        }
    }

    if (/\bproduct design(er|ers)?\b/.test(t)) {
        return 'Design';
    }

    // Product Manager / Owner before bare "data"/"product" collisions in RULES
    if (/\b(product manager|product owner|product lead|head of product|principal product manager)\b/.test(t)) {
        return 'Product Management';
    }

    // Retail trading / shop-floor (before Finance / Software catch-alls)
    if (
        /\b(online trading manager|trading assistant|customer and trading|stores? operative|fashion assistant|materials operator|deli assistant|\brunners?\b|receptionist|soho house)\b/.test(
            t,
        )
    ) {
        return 'Retail & Hospitality';
    }

    if (
        /\b(architectural (assistant|technologist|designer|coordinator|technician|manager)|landscape architects?|landscape architecture|part\s*[123]\b.*architect|riba)\b/.test(
            combined
        )
    ) {
        if (/\binterior\b/.test(combined)) return 'Design';
        return 'Construction & Infrastructure';
    }
    if (
        /\barchitecture\b/.test(t) &&
        !/\b(platform|enterprise|solution|solutions|software|data|security|cloud|systems?|information|domain|digital|gpu) architecture\b/.test(t)
    ) {
        return 'Construction & Infrastructure';
    }

    if (/\bnaval architects?\b/.test(t)) {
        return 'Engineering (Other)';
    }
    if (
        /\b(gpu|processor|graphics|photonics|micro-architects?)\b/.test(t) &&
        /\barchitect/.test(t)
    ) {
        return 'Engineering (Hardware)';
    }
    if (/\bsoc\b/.test(t) && /\b(compute|memory|subsystem)\b/.test(t)) {
        return 'Engineering (Hardware)';
    }
    if (
        /\b(outcomes|forward deployed|chief client|chief strategic|deal)\s+architects?\b/.test(t) ||
        (/\bmanaging architect\b/.test(t) && /\b(emea|uki|sales|french)\b/.test(t))
    ) {
        return 'Sales & Partnerships';
    }
    if (/\bprocess architects?\b/.test(t)) {
        return 'Business & Strategy';
    }
    if (/\bemployee experience\b/.test(t) && /\barchitects?\b/.test(t)) {
        return 'HR / People';
    }
    if (/\b(ms lead architects?|platform architecture)\b/.test(t)) {
        return 'Engineering (Software)';
    }
    if (/\barchitects?\b/.test(t) && /\baiops\b/.test(t)) {
        return 'Engineering (Software)';
    }
    if (/\barchitects?\b/.test(t) && /\bsecurities\b/.test(t)) {
        return 'Finance';
    }
    // Do not stamp remaining "Architect" titles as buildings — solutions /
    // business / cyber architects fall through to title rules.

    if (/\b(anti-?doping|sports anti-?doping)\b/.test(combined)) {
        return 'Research (Technical)';
    }

    // NHS laboratory BMS (biomedical scientist) — not building-management BMS.
    const BUILDING_BMS =
        /\b(elv|bms (service|controls?|consultants?|engineers?|technicians?|leads?|managers?)|building management systems?|controls engineers?)\b/;
    const LAB_BMS_CONTEXT =
        /\b(histolog|haematolog|hematolog|biochem|blood sciences?|blood transfusions?|serolog|cytolog|microbiolog|virolog|immunolog|patholog|coagulation|locum|band\s*[4-8])\b/;
    if (
        (/\b(biomedical scientists?|clinical scientists?|healthcare scientists?)\b/.test(t) ||
            (/\bbms\b/.test(t) && LAB_BMS_CONTEXT.test(t))) &&
        !BUILDING_BMS.test(t)
    ) {
        return 'Healthcare';
    }

    // Clinical nursing — beats Finance "insurance", HR "people", Ops.
    if (
        /\bnurs(?:e|es|ing)\b/.test(t) &&
        !/\bnursery\b/.test(t)
    ) {
        return 'Healthcare';
    }
    if (
        /\b(nursing associates?|nursing services?|registered nursing|audit nurses?|nurse auditors?)\b/.test(t) ||
        (/\b(rmn|rgn|rnld)\b/.test(t) && /\b(director|manager|hospital|nurse|nursing)\b/.test(t))
    ) {
        return 'Healthcare';
    }

    // Hospital/healthcare *building* architects — not software, not clinical.
    if (
        /\barchitects?\b/.test(t) &&
        /\bhealthcare\b/.test(t) &&
        !/\b(software|solution|data|cloud|systems?|platform|security|technical|enterprise)\s+architects?\b/.test(t)
    ) {
        return 'Construction & Infrastructure';
    }

    // EHS / H&S / warehouse WHS is workplace safety, not clinical Healthcare (`\bhealth\b`
    // in department "Workplace Health and Safety", or title "Safety Technician").
    if (
        (/\b(\behs\b|health and safety|health & safety|occupational health and safety|workplace health)\b/.test(
            combined,
        ) ||
            /\bsafety technicians?\b/.test(t)) &&
        !/\bnurs(?:e|es|ing)\b/.test(t) &&
        !/\bpatient safety\b/.test(t)
    ) {
        return 'Operations';
    }

    // Insurance / employee-benefits brokers — not clinical Healthcare.
    if (
        /\b(healthcare brokers?|employee benefits)\b/.test(t) &&
        /\b(brokers?|consultants?|advisers?|advisors?|account executives?)\b/.test(t)
    ) {
        return 'Finance';
    }

    // Spa / members-club wellness is hospitality, not clinical.
    if (/\b(head of spa|spa (supervisors?|managers?|therapists?)|assistant spa)\b/.test(t)) {
        return 'Retail & Hospitality';
    }

    // Game / media audio is not audiology.
    if (/\baudio designers?\b/.test(t) || (/\baudio\b/.test(t) && /\b(games?|sound|foley|composer)\b/.test(t))) {
        return 'Media & Journalism';
    }

    // Industry scientists at pharma/biopharma — not Research (Technical).
    if (
        /\bscientists?\b/.test(t) &&
        /\b(biopharma|biopharmaceutical|pharmaceutical development|pharmaceuticals?)\b/.test(t) &&
        !/\b(data scientists?|computer scientists?|engineers?|developers?)\b/.test(t) &&
        !PATIENT_FACING_PHARMACY_OR_CARE.test(combined)
    ) {
        return 'Pharmaceutical';
    }

    if (PHARMA_ROLE_SIGNAL.test(combined) && !PATIENT_FACING_PHARMACY_OR_CARE.test(combined)) {
        return 'Pharmaceutical';
    }

    // P1: TITLE first (business-correct function from the job name)
    if (t) {
        const fromTitle = matchRules(t);
        if (fromTitle) {
            return applyPharmaCompanyOverride(fromTitle, companySector, combined);
        }
        // Domain-only tags ("Life Sciences Graduate") with no job function.
        // Skip when the title is a generic manager/consultant/sales role.
        if (
            PHARMA_DOMAIN_TAG.test(t) &&
            !PATIENT_FACING_PHARMACY_OR_CARE.test(t) &&
            !/\b(managers?|consultants?|directors?|partners?|principals?|sales|account executives?|cost managers?|custodians?)\b/.test(t)
        ) {
            return 'Pharmaceutical';
        }
    }

    // Vague "Architect" titles must not inherit company Construction / Media.
    if (isNonBuildingArchitectTitle(t)) {
        return null;
    }

    // P2: Strong department only (never Digital/Technology/IT/Corporate alone)
    if (d && !isWeakDepartment(d)) {
        const fromDept = matchRules(d);
        if (fromDept) {
            return applyPharmaCompanyOverride(fromDept, companySector, combined);
        }
        if (/\b(infrastructure|real estate|energy)\b/.test(d)) return 'Construction & Infrastructure';
    }

    // P3: Company sector fallback — only for clear industry signals.
    // Never copy Engineering/Data/Product from company_sector onto vague titles
    // (LSEG/Molten were poisoning "Senior Auditor" / "Private Banker" → Software).
    // Talent-pool / one-word titles also must not inherit company industry.
    if (/^(lateral|mtm|tbc|tba)$/i.test(t)) {
        return null;
    }
    if (companySector) {
        const raw = companySector.trim();
        // Pharma/life-sciences *company* industry is not the job function
        // ("Inventory Coordinator" at a lab-equipment firm is not Pharmaceutical).
        if (isPharmaCompanySector(raw) || /\bmedical devices?\b/i.test(raw)) {
            return null;
        }
        // If someone stuffed a job-function label into company_sector (LSEG/Molten),
        // do not copy it onto unclear titles.
        if (WEAK_COMPANY_SECTOR_FALLBACK.has(raw)) {
            return null;
        }
        return normalizeCompanySectorLabel(companySector);
    }

    return null;
}
