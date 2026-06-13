export function inferJobSector(title: string, department?: string | null): string | null {
    if (!title?.trim()) return null;
    const t = title.toLowerCase();
    const d = (department || '').toLowerCase();
    const text = `${t} ${d}`.trim();

    const rules: [RegExp, string][] = [
        [/\b(software|developer|frontend|backend|fullstack|full.stack|ios|android|devops|cloud|sre|machine learning|ml engineer|ai engineer)\b/, 'Engineering (Software)'],
        [/\b(hardware|electrical|electronics|mechanical|manufacturing|firmware|embedded)\b/, 'Engineering (Hardware)'],
        [/\b(data|analytics|statistics|sql|python|bi|business intelligence)\b/, 'Data'],
        [/\b(finance|accounting|tax|audit|financial|quant|trading|investment|treasury)\b/, 'Finance'],
        [/\b(health|medical|clinical|nurse|doctor|pharma|biotech|physician|therapist)\b/, 'Healthcare'],
        [/\b(legal|counsel|lawyer|attorney|solicitor|compliance|paralegal)\b/, 'Legal'],
        [/\b(marketing|brand|content|social media|communications|seo|growth|public relations)\b/, 'Marketing & PR'],
        [/\b(design|ui|ux|product designer|graphic|creative)\b/, 'Design'],
        [/\b(product manager|product management|product owner)\b/, 'Product Management'],
        [/\b(project manager|programme|program manager|scrum|agile|delivery manager)\b/, 'Project Management'],
        [/\b(sales|partnerships|business development|account executive|bdr|sdr|revenue)\b/, 'Sales & Partnerships'],
        [/\b(customer success|customer support|account manager|client success)\b/, 'Customer Success'],
        [/\b(hr|human resources|people ops|talent|recruiter|recruiting|people partner)\b/, 'HR / People'],
        [/\b(operations|logistics|supply chain|facilities|admin)\b/, 'Operations'],
        [/\b(market research|user research|insights analyst)\b/, 'Research (Non-technical)'],
        [/\b(research|scientist|r&d|phd|investigator)\b/, 'Research (Technical)'],
        [/\b(media|journalism|writer|editor|reporter|news|broadcast)\b/, 'Media & Journalism'],
        [/\b(engineer|engineering)\b/, 'Engineering (Other)'],
        [/\b(business|strategy|consultant|analyst|corporate|planning)\b/, 'Business & Strategy'],
    ];

    for (const [regex, sector] of rules) {
        if (regex.test(text)) return sector;
    }
    return null;
}
