import { ALLOWED_SECTORS } from './constants';

const IT_ARCHITECT_CUES =
    /\b(software|solution|solutions|cloud|enterprise|data|security|systems?|technical|platform|it|application|infrastructure|network|aws|azure|saas|salesforce|sap|workday|identity|cyber|ai|ml)\b/;

/** Patient-facing pharmacy / clinical care — keep under Healthcare, not industry Pharmaceutical. */
const PATIENT_FACING_PHARMACY_OR_CARE =
    /\b(pharmacist|pharmacy technician|pharmacy accuracy|gp practice pharmacist|retail pharmacy|inpatient pharmacy|outpatient pharmacy|nurse|doctor|physician|midwife|paramedic|dentist|\bgp\b)\b/;

/** Roles that should not inherit a company's Pharmaceutical label. */
const NON_PHARMA_ROLE_OVERRIDE =
    /\b(chef|commis|barista|food service|catering|cleaner|housekeeping|security guard|software|developer|frontend|backend|fullstack|devops|sre)\b/;

const PHARMA_INDUSTRY_SIGNAL =
    /\b(pharmaceuticals?|pharma|biotech|biotechnology|biopharma|biopharmaceutical|life\s*sciences?|pharmacovigilance|drug discovery|drug development|medicinal chemistry|bioprocess|biomanufacturing|biotechnician|formulation scientist|process development|clinical research associate|\bcra\b|gxp|\bgmp\b|cmc|toxicolog(y|ist)?)\b/;

const PHARMA_COMPANY_SECTOR =
    /\b(pharmaceuticals?|pharma|biotech|biotechnology|biopharma|life\s*sciences?)\b/;

// Exported (read-only use) so audit tooling can report which rule fired for
// a given job without re-implementing/duplicating the match logic.
export const RULES: [RegExp, string][] = [
    // Built-environment architecture — BEFORE software "architect" catch-all
    [/\b(architectural (assistant|technologist|designer|coordinator|technician|manager)|landscape architect|part\s*[123]\s+architect|riba|architecture practice)\b/, 'Construction & Infrastructure'],
    // Engineering (Software) — IT architects + developers (not building architects)
    [/\b(software|developer|frontend|backend|fullstack|full.stack|ios|android|devops|devsecops|mlops|cloud|sre|machine learning|ml engineer|ai engineer|cybersecurity|cyber security|infosec|information security|penetration test|pen test|technology|qa|quality assurance)\b/, 'Engineering (Software)'],
    [/\b(software|solution|solutions|cloud|enterprise|data|security|systems?|technical|platform|application|infrastructure|network|salesforce|sap)\s+architect\b/, 'Engineering (Software)'],
    // Pharmaceutical / life sciences industry — before Hardware "manufacturing" and Healthcare
    [PHARMA_INDUSTRY_SIGNAL, 'Pharmaceutical'],
    // Engineering (Hardware)
    [/\b(hardware|electrical|electronics|mechanical|manufacturing|firmware|embedded)\b/, 'Engineering (Hardware)'],
    // Data
    [/\b(data|analytics|statistics|sql|python|bi|business intelligence|dba|database administrator)\b/, 'Data'],
    // Finance
    // `trader`/`traders` added — \btrading\b didn't match "Index Trader" etc.
    // Bare "trading"/"trader" deliberately excluded — UK grocery retail uses
    // "Trading Assistant" / "Customer and Trading Manager" for shop-floor
    // staff (found via audit, 155 jobs), which isn't financial trading at
    // all. Require a specific financial-trading phrase instead.
    [/\b(finance|accounting|tax|audit|financial|quant|investment|treasury|actuary|actuarial|underwriter|insurance|wealth|risk|banking|accountant|accounts|regulatory reporting|trading (floor|desk|strategy|systems?)|(equities?|fx|commodit(y|ies)|quantitative|electronic|algo(rithmic)?|proprietary|derivatives?|credit|securities) trading|\btraders?\b)\b/, 'Finance'],
    // Healthcare (clinical/medical) — patient-facing care; before Healthcare & Social Care
    // Includes NHS "Consultant [Specialty]" clinical grade titles — without these,
    // titles like "Consultant Psychiatrist" fall through to the bare `consultant`
    // catch-all below and land in Business & Strategy (found via audit, ~400+ jobs).
    [/\b(health|medical|clinical|nurse|doctor|physician|therapist|pharmacist|pharmacy|physiotherapist|radiographer|midwife|midwifery|paramedic|dentist|dental|optometrist|surgeon|surgery|gp|psychiatr(?:y|ist|ists|ic)|gastroenterolog(?:y|ist)|histopatholog(?:y|ist)|cardiolog(?:y|ist)|radiolog(?:y|ist)|rheumatolog(?:y|ist)|dermatolog(?:y|ist)|anaesthe(?:tics|tist|sia)|oncolog(?:y|ist)|neurolog(?:y|ist)|urolog(?:y|ist)|endocrinolog(?:y|ist)|haematolog(?:y|ist)|nephrolog(?:y|ist)|gynaecolog(?:y|ist)|obstetric(?:s|ian)?|ophthalmolog(?:y|ist)|geriatric(?:ian)?|emergency medicine|stroke medicine|acute medicine|intensive care medicine|respiratory medicine|rehabilitation medicine|general medicine|pain management|paediatric(?:ian)?|neurophysiology|immunolog(?:y|ist)|microbiolog(?:y|ist)|virolog(?:y|ist)|clinical psycholog(?:y|ist))\b/, 'Healthcare'],
    // Healthcare & Social Care
    [/\b(dietitian|social worker|ward manager|carer|care worker|care home|social care|community care|matron|sonographer|podiatrist|care assistant|general practitioner|veterinary|practice manager|nursery|early years|after.?school|breakfast club|holiday club|childcare|childminder)\b/, 'Healthcare & Social Care'],
    // Legal
    [/\b(legal|counsel|lawyer|attorney|solicitor|compliance|paralegal)\b/, 'Legal'],
    // Marketing & PR
    [/\b(marketing|brand|content|social media|communications|seo|growth|public relations|pr|copywriter|copywriting)\b/, 'Marketing & PR'],
    // Design — include interior architecture
    [/\b(interior architect|interior design|ui|ux|product designer|graphic|creative)\b/, 'Design'],
    [/\b(design)\b/, 'Design'],
    // Product Management — \bproduct\b catches ATS depts named "Product"
    [/\b(product manager|product management|product owner|product lead|head of product|product)\b/, 'Product Management'],
    // Project Management
    [/\b(project manager|programme|program manager|scrum|agile|delivery manager)\b/, 'Project Management'],
    // Sales & Partnerships — include GTM / go-to-market ATS team labels
    [/\b(sales|partnerships|business development|account executive|bdr|sdr|revenue|client advisor|account director|partner manager|partnership manager|go[\s-]*to[\s-]*market|goto\s*market|\bgtm\b)\b/, 'Sales & Partnerships'],
    // Customer Success
    [/\b(customer success|customer support|account manager|client success)\b/, 'Customer Success'],
    // HR / People — \bpeople\b catches ATS depts named "People"
    [/\b(hr|human resources|people ops|talent|recruiter|recruiting|people partner|payroll|compensation|reward|learning.development|l&d|diversity|inclusion|dei|employee relations|people)\b/, 'HR / People'],
    // Construction & Infrastructure — includes bare "Architect" without IT cues (handled in inferJobSector)
    // bim/hydraulic/flood/highways/vertical transportation added from audit
    // samples that were falling through to the Engineering (Other)/Other catch-alls.
    [/\b(quantity surveyor|cost manager|cost management|estimator|estimating|contract manager|electrician|surveyor|construction|civil engineer|civil engineering|structural|plumber|carpenter|bricklayer|joiner|project controls|project planner|fabric technician|built environment|urban design|town planning|\bbim\b|hydraulic|flood (risk|model|modeller|modeler|forecast)|vertical transportation|highways?|hydrologist|wastewater|arborist)\b/, 'Construction & Infrastructure'],
    // Retail & Hospitality
    [/\b(beauty|chef|retail|store manager|hospitality|barista|restaurant|hotel|catering|cook|merchandiser|buyer|nandoca|back of house|front of house|fitness coach|fitness manager|gym instructor|personal trainer|padel coach|online trading|trading assistant|trading manager|stores? operative|fashion assistant|customer service agent|customer care agent|deli assistant|\brunners?\b|receptionist|housekeeping|concierge|area manager)\b/, 'Retail & Hospitality'],
    // Logistics & Transport — before Operations to claim warehouse/logistics/supply chain
    [/\b(hgv|driver|warehouse|logistics|supply chain|transport|freight|courier|distribution)\b/, 'Logistics & Transport'],
    // Operations — after Logistics to avoid overlap
    [/\b(operations|facilities|admin|procurement|purchasing|executive assistant|branch manager|deputy manager|operational trainer)\b/, 'Operations'],
    // Research (Non-technical) — specific phrases before generic research
    [/\b(market research|user research|insights analyst|ux research)\b/, 'Research (Non-technical)'],
    // Research (Technical)
    [/\b(research|scientist|r&d|phd|investigator)\b/, 'Research (Technical)'],
    // Media & Journalism
    [/\b(media|journalism|writer|editor|reporter|news|broadcast)\b/, 'Media & Journalism'],
    // Engineering (Other) — generic catch-all after all specific engineering types
    [/\b(engineer|engineering)\b/, 'Engineering (Other)'],
    // Business & Strategy — broadest catch-all last
    // `pursuit` (bid/pursuit management — BD terminology at consultancies) added.
    [/\b(business|strategy|consultant|analyst|corporate|planning|pursuit)\b/, 'Business & Strategy'],
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
    'medical devices / healthcare': 'Pharmaceutical',
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

/** Ambiguous sectors that should yield to a clear pharma company context. */
const COMPANY_PHARMA_OVERRIDE_FROM = new Set([
    'Healthcare',
    'Healthcare & Social Care',
    'Business & Strategy',
    'Engineering (Other)',
    'Engineering (Hardware)',
    'Research (Technical)',
    'Operations',
    'Project Management',
    'Other',
]);

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

function inferJobSectorUnclamped(
    title: string,
    department?: string | null,
    companySector?: string | null
): string | null {
    const t = (title || '').toLowerCase().trim();
    const d = (department || '').toLowerCase().trim();
    const combined = `${d} ${t}`.trim();

    // Unambiguous legal-practitioner titles stay Legal (even "Finance Lawyer").
    if (/\b(lawyer|solicitor|attorney)\b/.test(combined)) {
        return 'Legal';
    }

    if (/\bmedical devices?\b.*\b(regulatory|quality|compliance|engineer(ing)?|manufactur|design assurance)\b|\b(regulatory|quality|compliance|engineer(ing)?|manufactur|design assurance)\b.*\bmedical devices?\b/.test(combined)) {
        return 'Pharmaceutical';
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
        /\b(architectural (assistant|technologist|designer|coordinator|technician|manager)|landscape architect|part\s*[123]\b.*architect|riba)\b/.test(
            combined
        )
    ) {
        if (/\binterior\b/.test(combined)) return 'Design';
        return 'Construction & Infrastructure';
    }
    if (/\barchitects?\b/.test(combined) && !IT_ARCHITECT_CUES.test(combined)) {
        if (/\binterior\b/.test(combined)) return 'Design';
        return 'Construction & Infrastructure';
    }

    if (PHARMA_INDUSTRY_SIGNAL.test(combined) && !PATIENT_FACING_PHARMACY_OR_CARE.test(combined)) {
        return 'Pharmaceutical';
    }

    // P1: TITLE first (business-correct function from the job name)
    if (t) {
        const fromTitle = matchRules(t);
        if (fromTitle) {
            return applyPharmaCompanyOverride(fromTitle, companySector, combined);
        }
    }

    // P2: Strong department only (never Digital/Technology/IT/Corporate alone)
    if (d && !isWeakDepartment(d)) {
        const fromDept = matchRules(d);
        if (fromDept) {
            return applyPharmaCompanyOverride(fromDept, companySector, combined);
        }
        if (/\b(infrastructure|real estate|energy)\b/.test(d)) return 'Construction & Infrastructure';
    }

    // P3: Company sector fallback
    if (companySector) {
        if (
            isPharmaCompanySector(companySector) &&
            !PATIENT_FACING_PHARMACY_OR_CARE.test(combined) &&
            !NON_PHARMA_ROLE_OVERRIDE.test(combined)
        ) {
            return 'Pharmaceutical';
        }
        return normalizeCompanySectorLabel(companySector);
    }

    return null;
}
