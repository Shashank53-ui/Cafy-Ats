export function parseJobType(raw?: any): string {
    if (!raw) return 'Others';
    let l = '';
    if (typeof raw === 'string') l = raw.toLowerCase().trim().replace(/_/g, ' ');
    else if (Array.isArray(raw)) l = raw.join(' ').toLowerCase().trim().replace(/_/g, ' ');
    else l = String(raw).toLowerCase().trim().replace(/_/g, ' ');

    if (l.includes('full time') || l.includes('full-time') || l === 'ft' || l === 'fulltime' || l.includes('permanent')) return 'Full-time';
    if (l.includes('part time') || l.includes('part-time') || l === 'pt' || l === 'parttime') return 'Part-time';
    if (l.includes('contract') || l.includes('temporary') || l.includes('fixed-term') || l.includes('fixed term')) return 'Contract';
    if (l.includes('freelance') || l.includes('contractor')) return 'Freelance';
    if (l.includes('internship') || /\bintern\b/.test(l) || l.includes('student') || l.includes('co-op')) return 'Internship';
    return 'Others';
}
