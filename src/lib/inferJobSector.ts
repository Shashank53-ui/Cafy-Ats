const IT_ARCHITECT_CUES =
    /\b(software|solution|solutions|cloud|enterprise|data|security|systems?|technical|platform|it|application|infrastructure|network|aws|azure|saas|salesforce|sap|workday|identity|cyber|ai|ml)\b/;

/** Patient-facing pharmacy / clinical care — keep under Healthcare, not industry Pharmaceutical. */
const PATIENT_FACING_PHARMACY_OR_CARE =
    /\b(pharmacist|pharmacy technician|pharmacy accuracy|gp practice pharmacist|retail pharmacy|inpatient pharmacy|outpatient pharmacy|nurse|doctor|physician|midwife|paramedic|dentist|\bgp\b)\b/;

/** Roles that should not inherit a company's Pharmaceutical label. */
const NON_PHARMA_ROLE_OVERRIDE =
    /\b(chef|commis|barista|food service|catering|cleaner|housekeeping|security guard|software|developer|frontend|backend|fullstack|devops|sre)\b/;

const PHARMA_INDUSTRY_SIGNAL =
    /\b(pharmaceuticals?|pharma|biotech|biotechnology|biopharma|biopharmaceutical|life\s*sciences?|pharmacovigilance|drug discovery|drug development|medicinal chemistry|bioprocess|biomanufacturing|biotechnician|formulation scientist|process development|clinical research associate|\bcra\b|gxp|\bgmp\b|cmc)\b/;

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
    [/\b(finance|accounting|tax|audit|financial|quant|trading|traders?|investment|treasury|actuary|actuarial|underwriter|insurance|wealth|risk|banking|accountant|accounts|regulatory reporting)\b/, 'Finance'],
    // Healthcare (clinical/medical) — patient-facing care; before Healthcare & Social Care
    // Includes NHS "Consultant [Specialty]" clinical grade titles — without these,
    // titles like "Consultant Psychiatrist" fall through to the bare `consultant`
    // catch-all below and land in Business & Strategy (found via audit, ~400+ jobs).
    [/\b(health|medical|clinical|nurse|doctor|physician|therapist|pharmacist|pharmacy|physiotherapist|radiographer|midwife|midwifery|paramedic|dentist|dental|optometrist|surgeon|surgery|gp|psychiatr(?:y|ist|ists|ic)|gastroenterolog(?:y|ist)|histopatholog(?:y|ist)|cardiolog(?:y|ist)|radiolog(?:y|ist)|rheumatolog(?:y|ist)|dermatolog(?:y|ist)|anaesthe(?:tics|tist|sia)|oncolog(?:y|ist)|neurolog(?:y|ist)|urolog(?:y|ist)|endocrinolog(?:y|ist)|haematolog(?:y|ist)|nephrolog(?:y|ist)|gynaecolog(?:y|ist)|obstetric(?:s|ian)?|ophthalmolog(?:y|ist)|geriatric(?:ian)?|emergency medicine|stroke medicine|acute medicine|intensive care medicine|respiratory medicine|rehabilitation medicine|general medicine|pain management|paediatric(?:ian)?|neurophysiology|immunolog(?:y|ist)|microbiolog(?:y|ist)|virolog(?:y|ist)|clinical psycholog(?:y|ist))\b/, 'Healthcare'],
    // Healthcare & Social Care
    [/\b(dietitian|social worker|ward manager|carer|care worker|care home|social care|community care|matron|sonographer|podiatrist|care assistant|general practitioner|veterinary|practice manager)\b/, 'Healthcare & Social Care'],
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
    // Sales & Partnerships
    [/\b(sales|partnerships|business development|account executive|bdr|sdr|revenue|client advisor|account director)\b/, 'Sales & Partnerships'],
    // Customer Success
    [/\b(customer success|customer support|account manager|client success)\b/, 'Customer Success'],
    // HR / People — \bpeople\b catches ATS depts named "People"
    [/\b(hr|human resources|people ops|talent|recruiter|recruiting|people partner|payroll|compensation|reward|learning.development|l&d|diversity|inclusion|dei|employee relations|people)\b/, 'HR / People'],
    // Construction & Infrastructure — includes bare "Architect" without IT cues (handled in inferJobSector)
    // bim/hydraulic/flood/highways/vertical transportation added from audit
    // samples that were falling through to the Engineering (Other)/Other catch-alls.
    [/\b(quantity surveyor|cost manager|cost management|estimator|estimating|contract manager|electrician|surveyor|construction|civil engineer|civil engineering|structural|plumber|carpenter|bricklayer|joiner|project controls|project planner|fabric technician|built environment|urban design|town planning|\bbim\b|hydraulic|flood (risk|model)|vertical transportation|highways?)\b/, 'Construction & Infrastructure'],
    // Retail & Hospitality
    [/\b(beauty|chef|retail|store manager|hospitality|barista|restaurant|hotel|catering|cook|merchandiser|buyer)\b/, 'Retail & Hospitality'],
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

    // P3: Company sector fallback (normalize pharma compound labels)
    if (companySector) {
        if (
            isPharmaCompanySector(companySector) &&
            !PATIENT_FACING_PHARMACY_OR_CARE.test(combined) &&
            !NON_PHARMA_ROLE_OVERRIDE.test(combined)
        ) {
            return 'Pharmaceutical';
        }
        return companySector;
    }

    // P4: Unclassifiable
    return null;
}
