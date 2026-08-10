/**
 * Infer seniority from a job title.
 * Priority order matters — check most specific/senior first.
 */
export function inferJobLevel(title: string): string | null {
    if (!title) return null;
    const t = title.toLowerCase();

    // Executive / C-Suite
    if (/\b(chief|cto|ceo|cfo|coo|cpo|president|managing director|md)\b/.test(t)) return 'Executive';

    // Vice President
    if (/\bvp\b|vice president/.test(t)) return 'VP';

    // Director
    if (/\bdirector\b/.test(t)) return 'Director';

    // Principal
    if (/\bprincipal\b/.test(t)) return 'Principal';

    // Lead
    if (/\blead\b/.test(t)) return 'Lead';

    // Senior / Sr
    if (/\b(senior|sr\.?)\b/.test(t)) return 'Senior';

    // Staff
    if (/\bstaff\b/.test(t)) return 'Staff';

    // Internship / Placement
    if (/\b(intern|internship|placement|apprentice|apprenticeship)\b/.test(t)) return 'Internship';

    // Graduate / Entry (avoid bare "associate" — often retail/warehouse mid titles)
    if (/\b(graduate|entry.?level|early career|new grad|grad scheme|graduate scheme)\b/.test(t)) {
        return 'Graduate';
    }

    // Junior / Jr
    if (/\b(junior|jr\.?)\b/.test(t)) return 'Junior';

    // Frontline / entry service roles that were over-labelled Mid-level
    if (
        /\b(care assistant|healthcare assistant|\bhca\b|support worker|care worker|\bcarer\b|home care)\b/.test(t) ||
        /\b(kitchen assistant|kitchen porter|catering assistant|dishwasher|commis chef)\b/.test(t) ||
        /\b(cashier|sales assistant|shop assistant|store assistant|retail assistant|team member)\b/.test(t) ||
        /\b(sales associate|retail associate|store associate|fragrance associate|warehouse associate)\b/.test(t) ||
        /\b(waiter|waitress|barista|bartender|bar staff|room attendant|housekeep|cleaner|chambermaid)\b/.test(t) ||
        /\b(warehouse operative|order picker|picker\s*[/&]?\s*packer|\bpacker\b)\b/.test(t) ||
        /\b(security guard|security officer|delivery driver|van driver)\b/.test(t)
    ) {
        return 'Junior';
    }

    // Mid-level fallback
    return 'Mid-level';
}
