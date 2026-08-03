const IT_ARCHITECT_CUES =
    /\b(software|solution|solutions|cloud|enterprise|data|security|systems?|technical|platform|it|application|infrastructure|network|aws|azure|saas|salesforce|sap|workday|identity|cyber|ai|ml)\b/;

const RULES: [RegExp, string][] = [
    // Built-environment architecture — BEFORE software "architect" catch-all
    [/\b(architectural (assistant|technologist|designer|coordinator|technician|manager)|landscape architect|part\s*[123]\s+architect|riba|architecture practice)\b/, 'Construction & Infrastructure'],
    // Engineering (Software) — IT architects + developers (not building architects)
    [/\b(software|developer|frontend|backend|fullstack|full.stack|ios|android|devops|devsecops|mlops|cloud|sre|machine learning|ml engineer|ai engineer|cybersecurity|cyber security|infosec|information security|penetration test|pen test|technology|qa|quality assurance)\b/, 'Engineering (Software)'],
    [/\b(software|solution|solutions|cloud|enterprise|data|security|systems?|technical|platform|application|infrastructure|network|salesforce|sap)\s+architect\b/, 'Engineering (Software)'],
    // Engineering (Hardware)
    [/\b(hardware|electrical|electronics|mechanical|manufacturing|firmware|embedded)\b/, 'Engineering (Hardware)'],
    // Data
    [/\b(data|analytics|statistics|sql|python|bi|business intelligence|dba|database administrator)\b/, 'Data'],
    // Finance
    [/\b(finance|accounting|tax|audit|financial|quant|trading|investment|treasury|actuary|actuarial|underwriter|insurance|wealth|risk|banking|accountant|accounts)\b/, 'Finance'],
    // Healthcare (clinical/medical) — before Healthcare & Social Care so nurse/doctor go here
    [/\b(health|medical|clinical|nurse|doctor|pharma|biotech|physician|therapist|pharmacist|pharmacy|physiotherapist|radiographer|midwife|midwifery|paramedic|dentist|dental|optometrist|surgeon|surgery|gp)\b/, 'Healthcare'],
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
    [/\b(quantity surveyor|cost manager|cost management|estimator|estimating|contract manager|electrician|surveyor|construction|civil engineer|civil engineering|structural|plumber|carpenter|bricklayer|joiner|project controls|project planner|fabric technician|built environment|urban design|town planning)\b/, 'Construction & Infrastructure'],
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
    [/\b(business|strategy|consultant|analyst|corporate|planning)\b/, 'Business & Strategy'],
];

function matchRules(text: string): string | null {
    for (const [regex, sector] of RULES) {
        if (regex.test(text)) return sector;
    }
    return null;
}

export function inferJobSector(
    title: string,
    department?: string | null,
    companySector?: string | null
): string | null {
    const t = (title || '').toLowerCase().trim();
    const d = (department || '').toLowerCase().trim();
    const combined = `${d} ${t}`.trim();

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

    // P1: Department matching
    if (d) {
        const fromDept = matchRules(d);
        if (fromDept) return fromDept;
        // Department keyword overrides not caught by main rules
        if (/\b(infrastructure|real estate|energy)\b/.test(d)) return 'Construction & Infrastructure';
        if (/\bdigital\b/.test(d)) return 'Engineering (Software)';
    }

    // P2: Title matching
    if (t) {
        const fromTitle = matchRules(t);
        if (fromTitle) return fromTitle;
    }

    // P3: Company sector fallback
    if (companySector) return companySector;

    // P4: Unclassifiable
    return null;
}
