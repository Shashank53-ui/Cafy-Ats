/**
 * Infer seniority from a job title.
 * Priority order matters — check most specific/senior first.
 * Output is always one of ALLOWED_JOB_LEVELS (or null if title empty).
 */
import { ALLOWED_JOB_LEVELS } from './constants';

export type AllowedJobLevel = (typeof ALLOWED_JOB_LEVELS)[number];

const ALLOWED = new Set<string>(ALLOWED_JOB_LEVELS);

export function inferJobLevel(title: string): AllowedJobLevel | null {
    if (!title) return null;
    const t = title.toLowerCase();

    let level: AllowedJobLevel;

    // Executive / C-Suite
    if (/\b(chief|cto|ceo|cfo|coo|cpo|president|managing director|md)\b/.test(t)) {
        level = 'Executive';
    }
    // Vice President
    else if (/\bvp\b|vice president/.test(t)) {
        level = 'VP';
    }
    // Director — "Head of X" is director-tier in UK catalogs
    else if (/\bdirector\b/.test(t) || /\bhead of\b/.test(t)) {
        level = 'Director';
    }
    // Principal
    else if (/\bprincipal\b/.test(t)) {
        level = 'Principal';
    }
    // Senior / Sr — before eng-manager→Lead so "Senior Engineering Manager" stays Senior
    else if (/\b(senior|sr\.?)\b/.test(t)) {
        level = 'Senior';
    }
    // Lead — engineering/software managers (not assistant managers)
    else if (
        /\blead\b/.test(t) ||
        (/\b(software|engineering) managers?\b/.test(t) && !/\bassistant managers?\b/.test(t))
    ) {
        level = 'Lead';
    }
    // Shop-floor "X Staff" before IC "Staff Engineer" / NHS "Staff Nurse"
    else if (
        /\b(deli|floor|kitchen|waiting|bar|shop|store|retail|sales|warehouse|support)\s+staff\b/.test(t) ||
        /\bstaff\s*\([^)]*(full|part)\s*time/.test(t)
    ) {
        level = 'Junior';
    }
    // Staff (IC / clinical grade)
    else if (/\bstaff\b/.test(t)) {
        level = 'Staff';
    }
    // Internship / Placement (seniority — not employment type)
    else if (/\b(intern|internship|placement|apprentice|apprenticeship)\b/.test(t)) {
        level = 'Internship';
    }
    // Graduate / Entry (avoid bare "associate" — often retail/warehouse mid titles)
    else if (/\b(graduate|entry.?level|early career|new grad|grad scheme|graduate scheme)\b/.test(t)) {
        level = 'Graduate';
    }
    // Junior / Jr
    else if (/\b(junior|jr\.?)\b/.test(t)) {
        level = 'Junior';
    }
    // Frontline / entry service roles that were over-labelled Mid-level
    else if (
        /\b(care assistant|healthcare assistant|\bhca\b|support worker|care worker|\bcarer\b|home care)\b/.test(t) ||
        /\b(kitchen assistant|kitchen porter|catering assistant|dishwasher|commis chef|deli assistant)\b/.test(t) ||
        /\b(cashier|sales assistant|shop assistant|store assistant|retail assistant|team member)\b/.test(t) ||
        /\b(sales associate|retail associate|store associate|fragrance associate|warehouse associate)\b/.test(t) ||
        /\b(waiter|waitress|waiting staff|barista|bartender|bar staff|room attendant|housekeep|cleaner|chambermaid)\b/.test(t) ||
        /\b(warehouse operative|order picker|picker\s*[/&]?\s*packer|\bpacker\b)\b/.test(t) ||
        /\b(security guard|security officer|delivery driver|van driver)\b/.test(t)
    ) {
        level = 'Junior';
    } else {
        // Mid-level fallback
        level = 'Mid-level';
    }

    return ALLOWED.has(level) ? level : 'Mid-level';
}
