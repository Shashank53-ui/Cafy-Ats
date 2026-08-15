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
    [/\b(quantity surveyor|cost manager|cost management|estimator|estimating|contract manager|electrician|surveyor|construction|civil engineer|civil engineering|structural|plumber|carpenter|bricklayer|joiner|project controls|project planner|fabric technician|built environment|urban design|town planning|\bbim\b|hydraulic|flood (risk|model|forecast)|vertical transportation|highways?|hydrologist|wastewater)\b/, 'Construction & Infrastructure'],
    // Retail & Hospitality
    [/\b(beauty|chef|retail|store manager|hospitality|barista|restaurant|hotel|catering|cook|merchandiser|buyer|nandoca|back of house|front of house|fitness coach|fitness manager|gym instructor|personal trainer|padel coach)\b/, 'Retail & Hospitality'],
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

function inferJobSectorUnclamped(
    title: string,
    department?: string | null,
    companySector?: string | null
): string | null {
    const t = (title || '').toLowerCase().trim();
    const d = (department || '').toLowerCase().trim();
    const combined = `${d} ${t}`.trim();

    // Unambiguous legal-practitioner titles ("Banking Lawyer", "Insurance
    // Lawyer", "Structured Finance Lawyer") stay Legal even when a finance-
    // domain modifier is present — Finance's broader word list (banking,
    // insurance, trading, ...) would otherwise win first on title order.
    // Deliberately narrow to lawyer/solicitor/attorney — bare "legal" is too
    // ambiguous (e.g. "Legal Entity Risk" is a genuine Finance/risk term).
    if (/\b(lawyer|solicitor|attorney)\b/.test(combined)) {
        return 'Legal';
    }

    // "Medical Device [regulatory/quality/engineering]" roles are medtech —
    // stay Pharmaceutical even under a generic department like "Corporate"
    // (which would otherwise win via the Business & Strategy catch-all).
    // Narrower than bare "medical device" so it doesn't swallow roles where
    // the device is just the product, not the job function (e.g. a cyber
    // security specialist who happens to secure medical devices).
    if (/\bmedical devices?\b.*\b(regulatory|quality|compliance|engineer(ing)?|manufactur|design assurance)\b|\b(regulatory|quality|compliance|engineer(ing)?|manufactur|design assurance)\b.*\bmedical devices?\b/.test(combined)) {
        return 'Pharmaceutical';
    }

    // "Product Designer" is a design discipline, not product management —
    // must win even when filed under a bare "Product" department (a common
    // ATS department name for cross-functional product orgs), which would
    // otherwise match Product Management's department-priority step first.
    // Checked against title only, deliberately — a department that says
    // "Product Design" is already unambiguous via the normal P1 rule match.
    if (/\bproduct design(er|ers)?\b/.test(t)) {
        return 'Design';
    }

    // Built-env architect titles (before department/title generic rules)
    if (
        /\b(architectural (assistant|technologist|designer|coordinator|technician|manager)|landscape architect|part\s*[123]\b.*architect|riba)\b/.test(
            combined
        )
    ) {
        if (/\binterior\b/.test(combined)) return 'Design';
        return 'Construction & Infrastructure';
    }
    // Bare "Architect" / "Senior Architect" without IT cues → built environment
    if (/\barchitects?\b/.test(combined) && !IT_ARCHITECT_CUES.test(combined)) {
        if (/\binterior\b/.test(combined)) return 'Design';
        return 'Construction & Infrastructure';
    }

    // Strong pharma industry signals on title/dept — before department labels like "Healthcare"
    if (PHARMA_INDUSTRY_SIGNAL.test(combined) && !PATIENT_FACING_PHARMACY_OR_CARE.test(combined)) {
        return 'Pharmaceutical';
    }

    // P1: Department matching
    if (d) {
        const fromDept = matchRules(d);
        if (fromDept) {
            if (
                isPharmaCompanySector(companySector) &&
                COMPANY_PHARMA_OVERRIDE_FROM.has(fromDept) &&
                !PATIENT_FACING_PHARMACY_OR_CARE.test(combined) &&
                !NON_PHARMA_ROLE_OVERRIDE.test(combined)
            ) {
                return 'Pharmaceutical';
            }
            return fromDept;
        }
        if (/\b(infrastructure|real estate|energy)\b/.test(d)) return 'Construction & Infrastructure';
        if (/\bdigital\b/.test(d)) return 'Engineering (Software)';
    }

    // P2: Title matching
    if (t) {
        const fromTitle = matchRules(t);
        if (fromTitle) {
            if (
                isPharmaCompanySector(companySector) &&
                COMPANY_PHARMA_OVERRIDE_FROM.has(fromTitle) &&
                !PATIENT_FACING_PHARMACY_OR_CARE.test(combined) &&
                !NON_PHARMA_ROLE_OVERRIDE.test(combined)
            ) {
                return 'Pharmaceutical';
            }
            return fromTitle;
        }
    }

    // P3: Company sector fallback (normalize pharma + map leaked company_sector labels)
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

    // P4: Unclassifiable
    return null;
}
