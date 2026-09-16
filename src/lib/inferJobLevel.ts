/**
 * Cascade stage 1 — infer seniority from the job title.
 *
 * 4 levels: Entry Level | Junior | Mid Level | Senior
 *
 * Priority:
 *   traps/overrides → structural Senior → seniority words → Entry/Junior keywords
 *   → knowledge archetypes (role-family defaults for unmarked titles)
 *
 * Still abstains for junk / talent-pool titles with no real role signal.
 */
import { ALLOWED_JOB_LEVELS, type AllowedJobLevel } from './constants';

export type { AllowedJobLevel };

export type JobLevelMatch = {
  level: AllowedJobLevel;
  /** Trace id, e.g. `title:senior` or `archetype:professional_mid` */
  source: string;
};

const ALLOWED = new Set<string>(ALLOWED_JOB_LEVELS);

function normalizeTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+.#/\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip talent-pool / band wrappers so the underlying role can still be classified.
 * e.g. "Register Your Interest – Veterinary Surgeon…" → "veterinary surgeon…"
 *      "Procurement Consultant - All Levels" → "procurement consultant"
 */
function stripTitleNoise(t: string): string {
  let s = t;
  s = s.replace(/^\s*\[\s*expression of interest\s*\]\s*/i, ' ');
  s = s.replace(/\bexpression of interest\b/gi, ' ');
  s = s.replace(/\bregister your interest\b(?:\s*[:\-–—]\s*|\s+for\s+our\s+)?/gi, ' ');
  s = s.replace(/\bregister your interest\b/gi, ' ');
  s = s.replace(/\btalent pool\b/gi, ' ');
  // Keep the role/discipline: "Join AECOM's Growing Ground Engineering Team!" → "Ground Engineering"
  s = s.replace(
    /^\s*join\b.{0,50}?\b(?:growing\s+)?(.+?)\s+team[!?.]*\s*$/i,
    '$1',
  );
  s = s.replace(/\bgrow your career\b(?:\s+in\b.*)?$/gi, ' ');
  s = s.replace(/\bgrow your career\s+in\b/gi, ' ');
  s = s.replace(/\b(?:all levels?|any levels?|all grades?|various levels?)\b/gi, ' ');
  s = s.replace(/\bopportunities?\b/gi, ' ');
  s = s.replace(/\bacross\b.+$/i, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Pure non-roles after noise strip — nothing left to classify. */
function isNonRoleTitle(t: string): boolean {
  if (!t || t.length < 3) return true;
  // Bare years / programme banners with no role noun
  if (/^(19|20)\d{2}$/.test(t)) return true;
  if (/^upcoming\b/.test(t) && !/\b(engineer|manager|analyst|nurse|chef)\b/.test(t)) return true;
  return (
    /^(general application|open application|general opportunity|apply now|register your interest)$/.test(t) ||
    /\bcan'?t find anything\b/.test(t) ||
    /\bare you interested\b/.test(t) ||
    /\bcleared permanent\b/.test(t) ||
    (/^\bwork at\b/.test(t) && !/\b(manager|engineer|nurse|chef|analyst)\b/.test(t)) ||
    /^(tax|technology|engineering|business management|investment management|water|scotland|infrastructure|cyber transformation)$/.test(
      t,
    ) ||
    /\brenewable energy professionals\b/.test(t) ||
    (/\btransmission and distribution\b/.test(t) && !/\b(manager|engineer|officer)\b/.test(t)) ||
    // Marketing / nonsense fragments that are not job titles
    /\bfortune\s*100\b/.test(t) ||
    /\bnight buses?\b/.test(t) ||
    /\bfirewalls?\b/.test(t) && !/\b(engineer|architect|specialist|analyst)\b/.test(t)
  );
}

/** True internship / apprenticeship / graduate scheme — not location "Campus". */
function isEntryTrainingTitle(t: string): boolean {
  if (/\bplacement brokers?\b/.test(t)) return false;
  if (/\b(interns?|internships?|apprentices?|apprenticeships?|vacation schemes?|freshers?)\b/.test(t)) {
    return true;
  }
  if (/\b(industrial|work|student|undergraduate|graduate)\s+placements?\b/.test(t)) return true;
  if (/\byear in industry\b/.test(t)) return true;
  if (
    /\bplacements?\b/.test(t) &&
    /\b(months?|weeks?|scheme|programmes?|programs?|student|team placement)\b/.test(t)
  ) {
    return true;
  }
  if (/\b(graduates?|grad schemes?|graduate schemes?|entry[\s-]?level|early careers?|new grads?|undergraduates?|digital academy|academy programme|academy program)\b/.test(t)) {
    return true;
  }
  // "campus" only as early-careers programme — not "Senior PM (Campus)" site label
  if (/\bcampus\s+(recruit|recruiting|programme|program|hire|hiring|grads?|graduates?|scheme)\b/.test(t)) {
    return true;
  }
  if (/\b(university|grad)\s+campus\b/.test(t)) return true;
  if (/\btrainees?\b/.test(t) && !/\btrainers?\b/.test(t)) return true;
  return false;
}

function hasSeniorityWord(t: string): boolean {
  return (
    /\b(seniors?|snr\.?|sr\.?)\b/.test(t) ||
    /\bprincipals?\b/.test(t) ||
    /\b(juniors?|jr\.?)\b/.test(t) ||
    /\b(mid[\s-]?level|intermediate)\b/.test(t)
  );
}

/** C-suite / top leadership → Senior in the 4-level taxonomy. */
function isStructuralSeniorTitle(t: string): boolean {
  if (/\bexecutive assistants?\b/.test(t)) return false;
  if (/\bchief of staff\b/.test(t)) return false;
  if (/\bchief\s+\w+(?:\s+\w+)?\s+office\b/.test(t)) return false;
  if (/\boffice of the\s+(coo|cfo|ceo|cto|cpo)\b/.test(t)) return false;

  if (/\b(cto|ceo|cfo|coo|cpo|ciso)\b/.test(t)) return true;
  if (/\bmanaging directors?\b/.test(t)) return true;
  if (/\b(vice presidents?|avp|svp|evp)\b/.test(t) || /(^|[^a-z])vp([^a-z]|$)/.test(t)) return true;
  if (/\bdirectors?\b/.test(t) && !/\bassistant directors?\b/.test(t)) return true;
  if (/\bhead of\b/.test(t)) return true;
  if (
    /\bchief\s+(executive|technology|financial|operating|product|information|marketing|people|revenue|compliance|medical|clinical)\s+officers?\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bchief\s+[a-z]+\s+officers?\b/.test(t)) return true;
  if (/\bpresidents?\b/.test(t) && !/\bvice presidents?\b/.test(t)) return true;
  if (/\b(founders?|co-founders?)\b/.test(t)) return true;
  if (/\b(managing|equity|founding)\s+partners?\b/.test(t)) return true;
  return false;
}

/** Architect family — senior by convention. */
function isArchitectSenior(t: string): boolean {
  if (
    /\b(solutions?|software|enterprise|cloud|security|data|technical|system|systems|application|platform|network|infrastructure)\s+architects?\b/.test(
      t,
    )
  ) {
    return true;
  }
  return (
    /\barchitects?\b/.test(t) &&
    /\b(solutions?|software|enterprise|cloud|security|data|technical|platform)\b/.test(t)
  );
}

/** School / youth club activity leaders — frontline Junior, not professional Mid. */
function isSchoolActivityLeaderTitle(t: string): boolean {
  return (
    /\bleaders?\b/.test(t) &&
    /\b(activity|activities|after[\s-]?school|breakfast club|holiday club|nursery activity|eyfs|soft play)\b/.test(t)
  );
}

/** Frontline hospitality / retail shift leads — Junior, not NHS clinical leads. */
function isFrontlineTeamLeaderTitle(t: string): boolean {
  if (isSchoolActivityLeaderTitle(t)) return true;
  // Professional/domain Team Leaders are not frontline (e.g. Presales Engineering Team Leader)
  if (
    /\bteam leaders?\b/.test(t) &&
    /\b(presales|pre-sales|engineering|technology|technical|product|software|platform|security|data|ai|practice|market)\b/.test(
      t,
    ) &&
    !isClinicalHealthcareLeaderContext(t)
  ) {
    return false;
  }
  if (/\b(kitchen|shift|crew|section)\s+team leaders?\b/.test(t)) return true;
  if (/\b(shift|crew|section)\s+leaders?\b/.test(t)) return true;
  if (
    /\bteam leaders?\b/.test(t) &&
    /\b(kitchen|retail|store|shop|bar|restaurant|hospitality|pub|hotel|warehouse|sales floor|customer service|tesco|nandos|pret|greene)\b/.test(
      t,
    )
  ) {
    return true;
  }
  // Bare "Team Leader" with no clinical/NHS signal → junior shift lead
  if (/\bteam leaders?\b/.test(t) && !isClinicalHealthcareLeaderContext(t)) {
    return true;
  }
  return false;
}

/**
 * NHS / clinical "leader" or "team leader" → Mid (Band 6–7 style), never Junior.
 * Catches Lymphoedema Team Leader, Specialist Clinical Leader – Theatres, etc.
 */
function isClinicalHealthcareLeaderContext(t: string): boolean {
  if (/\b(clinical leaders?|specialist clinical leaders?|nurse leaders?|matron leaders?)\b/.test(t)) {
    return true;
  }
  if (!/\b(leaders?|team leaders?)\b/.test(t)) return false;
  // "Maternity cover" / leave cover is not a clinical specialty signal
  const clinicalText = t
    .replace(/\bmaternity\s+(cover|leave|returner)s?\b/gi, ' ')
    .replace(/\b(paternity|parental)\s+(cover|leave)\b/gi, ' ');
  return (
    /\b(nhs|health board|foundation trust|\btrust\b|social care)\b/.test(clinicalText) ||
    /\b(clinical|theatres?|wards?|nurs(?:e|ing)|midwi[fv]e?|hcas?|healthcare|social care)\b/.test(clinicalText) ||
    /\b(lymphoedema|oncology|cardiology|paediatric|pediatric|mental health|maxill?ofacial|maxfax|icu|a\s*&\s*e|emergency department|radiology|physiotherap|occupational therap|speech and language|community (?:nurs|health|midwif)|care home|hospice|neonatal|dialysis|renal|respiratory|dermatology|endocrin|haematol|hematol|orthop|ophthalm|anaesth|anesth|surgical|acute medicine|primary care|gp practice|camhs|cqc|disability|coronary|radiographer|substance use)\b/.test(
      clinicalText,
    )
  );
}

/**
 * Professional / domain "Leader" titles (Product, Technology, Practice, BD, …).
 * Not frontline team leaders and not NHS clinical leaders.
 */
function isProfessionalLeaderTitle(t: string): boolean {
  if (!/\bleaders?\b/.test(t)) return false;
  if (isFrontlineTeamLeaderTitle(t) || isClinicalHealthcareLeaderContext(t)) return false;
  if (isSchoolActivityLeaderTitle(t)) return false;
  return true;
}

/** Senior-grade professional leaders by UK hiring convention. */
function isSeniorProfessionalLeaderTitle(t: string): boolean {
  return (
    /\b(technology|technical|product|engineering|practice|market|presales|pre-sales|principal|platform|ai)\s+leaders?\b/.test(
      t,
    ) ||
    (/\bteam leaders?\b/.test(t) &&
      /\b(presales|pre-sales|engineering|technology|technical|product|software|platform|security|information security|cyber|incident)\b/.test(
        t,
      ))
  );
}

/** Retail / beauty / sales advisors — Junior, not Mid professional advisors. */
function isFrontlineAdvisorTitle(t: string): boolean {
  return /\b(sales advisors?|beauty advisors?|service advisors?|retail advisors?|customer (?:service )?advisors?|membership sales advisors?|field sales advisors?|outbound sales advisors?|inside sales advisors?)\b/.test(
    t,
  );
}

/** Warehouse / store / hospitality supervisors — Junior. */
function isFrontlineSupervisorTitle(t: string): boolean {
  if (!/\bsupervisors?\b/.test(t)) return false;
  return /\b(warehouse|store|shop|retail|shift|restaurant|hotel|pub|bar|kitchen|hospitality|tesco|asda|nandos|sortation|fleet|maintenance)\b/.test(
    t,
  );
}

type OverrideResult = JobLevelMatch | 'defer';

function applyTitleOverrides(t: string): OverrideResult | null {
  // Executive / Personal Assistant — professional admin → Mid (not C-suite, not blank)
  if (/\bexecutive assistants?\b/.test(t) || (/\bea\b/.test(t) && /\b(executive|personal)\b/.test(t)) || /\bpersonal assistants?\b/.test(t)) {
    return { level: 'Mid Level', source: 'trap:executive_assistant_mid' };
  }

  // Entry training beats C-suite tokens — but not when an explicit Senior grade is also present
  // e.g. "Trainee Senior Staff Nurse" stays Entry; "Senior PM (Campus)" must NOT become Entry
  if (isEntryTrainingTitle(t) && !/\b(seniors?|snr\.?|sr\.?)\b/.test(t)) {
    return { level: 'Entry Level', source: 'override:entry_beats_exec' };
  }
  // True trainee/intern even with "senior" in the title (Trainee Senior Staff Nurse)
  if (
    /\b(interns?|internships?|apprentices?|trainees?|graduates?|entry[\s-]?level)\b/.test(t) &&
    isEntryTrainingTitle(t)
  ) {
    return { level: 'Entry Level', source: 'override:entry_training' };
  }

  if (/\blead\s*gen(eration)?\b/.test(t) || /\bgeneration\s+lead\b/.test(t)) {
    // Marketing function — if also "executive", treat as Junior; else abstain
    if (/\bexecutives?\b/.test(t) && !hasSeniorityWord(t)) {
      return { level: 'Junior', source: 'trap:lead_gen_executive' };
    }
    return 'defer';
  }

  // Trap: UK "… Executive" (non C-suite) → Junior unless seniority word present
  // Covers Account/SEO/Events/Tax/Client Services Executive etc.
  // NEVER treat "Executive Director" / Director / VP / Head of as junior UK-executive titles.
  if (
    !hasSeniorityWord(t) &&
    /\bexecutives?\b/.test(t) &&
    !/\b(chief|managing)\b/.test(t) &&
    !/\bexecutive assistants?\b/.test(t) &&
    !/\bexecutive directors?\b/.test(t) &&
    !/\b(non[\s-]?executive directors?|directors?|vice presidents?|\bvps?\b|head of)\b/.test(t) &&
    !isStructuralSeniorTitle(t)
  ) {
    return { level: 'Junior', source: 'trap:uk_executive_junior' };
  }

  if (/\bassociate directors?\b/.test(t)) {
    return { level: 'Senior', source: 'trap:associate_director' };
  }

  // Assistant Director (NHS / corporate) — senior leadership grade, not frontline assistant
  if (/\bassistant directors?\b/.test(t)) {
    return { level: 'Senior', source: 'trap:assistant_director' };
  }

  if (/\bassistant managers?\b/.test(t)) {
    return { level: 'Mid Level', source: 'trap:assistant_manager' };
  }

  if (/\b(shift|sales)\s+leads?\b/.test(t) && !/\bsales\s+lead\s*gen/.test(t)) {
    return { level: 'Junior', source: 'trap:shift_or_sales_lead' };
  }

  if (/\bchief of staff\b/.test(t)) {
    return { level: 'Senior', source: 'trap:chief_of_staff' };
  }

  if (/\bstaff\s+(nurses?|midwives|midwife|hcas?|healthcare assistants?|accountants?|attorneys?|solicitors?)\b/.test(t)) {
    if (/\b(seniors?|snr\.?|sr\.?)\b/.test(t)) {
      return { level: 'Senior', source: 'override:senior_staff_clinical' };
    }
    return { level: 'Mid Level', source: 'trap:staff_clinical_or_admin' };
  }

  if (/\bmid[\s-]?level\b/.test(t) && /\b(seniors?|snr\.?|sr\.?)\b/.test(t)) {
    return { level: 'Senior', source: 'override:mid_to_senior_range' };
  }
  if (/\b(juniors?|jr\.?)\b/.test(t) && /\bmid[\s-]?level\b/.test(t)) {
    return { level: 'Junior', source: 'override:junior_mid_range' };
  }

  if (/\b(mid[\s-]?level|intermediate)\b/.test(t)) {
    return { level: 'Mid Level', source: 'title:mid_level' };
  }

  if (/\b(juniors?|jr\.?)\b/.test(t) && (isStructuralSeniorTitle(t) || /\b(chief|cto|ceo|cfo|coo|cpo|ciso|president)\b/.test(t))) {
    return { level: 'Junior', source: 'override:junior_beats_exec_token' };
  }

  if (isArchitectSenior(t)) {
    return { level: 'Senior', source: 'title:architect' };
  }

  if (
    /\b(seniors?|snr\.?|sr\.?)\b/.test(t) &&
    (/\bchief\s+\w+(?:\s+\w+)?\s+office\b/.test(t) || /\boffice of the\s+(coo|cfo|ceo|cto)\b/.test(t))
  ) {
    return { level: 'Senior', source: 'override:senior_beats_chief_office' };
  }

  // Head Chef / Executive Chef — kitchen leadership → Senior
  if (/\b(head|executive)\s+chefs?\b/.test(t) || /\bhead\s+(fitness\s+)?coach(?:es)?\b/.test(t)) {
    return { level: 'Senior', source: 'archetype:head_role' };
  }

  // NHS band 7+ ≈ Senior; band 5–6 ≈ Mid
  if (/\bband\s*([89]|1[0-9])\b/.test(t) || /\bband\s*7\b/.test(t)) {
    return { level: 'Senior', source: 'title:nhs_band_senior' };
  }
  if (/\bband\s*[56]\b/.test(t)) {
    return { level: 'Mid Level', source: 'title:nhs_band_mid' };
  }

  // NHS / clinical leaders → Mid, but never override an explicit Senior/Principal grade
  if (isClinicalHealthcareLeaderContext(t) && !hasSeniorityWord(t)) {
    return { level: 'Mid Level', source: 'trap:nhs_clinical_leader_mid' };
  }

  // Retail / beauty / sales advisors → Junior (before professional Mid archetype)
  if (isFrontlineAdvisorTitle(t) && !hasSeniorityWord(t)) {
    return { level: 'Junior', source: 'trap:frontline_advisor_junior' };
  }

  // Warehouse / store / shift supervisors → Junior
  if (isFrontlineSupervisorTitle(t) && !hasSeniorityWord(t)) {
    return { level: 'Junior', source: 'trap:frontline_supervisor_junior' };
  }

  // School / youth activity leaders → Junior
  if (isSchoolActivityLeaderTitle(t) && !hasSeniorityWord(t)) {
    return { level: 'Junior', source: 'trap:school_activity_leader_junior' };
  }

  // Professional domain Leaders (Product/Technology/Practice/BD…) — not frontline
  if (isProfessionalLeaderTitle(t) && !hasSeniorityWord(t)) {
    if (isSeniorProfessionalLeaderTitle(t)) {
      return { level: 'Senior', source: 'trap:professional_leader_senior' };
    }
    return { level: 'Mid Level', source: 'trap:professional_leader_mid' };
  }

  return null;
}

type Tier = { level: AllowedJobLevel; source: string; test: (t: string) => boolean };

const KEYWORD_TIERS: Tier[] = [
  {
    level: 'Senior',
    source: 'title:structural_senior',
    test: (t) => isStructuralSeniorTitle(t),
  },
  {
    level: 'Senior',
    source: 'title:senior_word',
    test: (t) =>
      /\b(seniors?|snr\.?|sr\.?)\b/.test(t) ||
      /\bprincipals?\b/.test(t) ||
      (/\bstaff\b/.test(t) &&
        !/\bstaff\s+(nurses?|midwives|midwife|hcas?|healthcare assistants?|accountants?|attorneys?|solicitors?)\b/.test(t) &&
        !/\b(deli|floor|kitchen|waiting|bar|shop|store|retail|sales|warehouse|support)\s+staff\b/.test(t)) ||
      (/\bleads?\b/.test(t) && !/\blead\s*gen(eration)?\b/.test(t) && !/\b(shift|sales)\s+leads?\b/.test(t)) ||
      (/\b(software|engineering)\s+managers?\b/.test(t) && !/\bassistant managers?\b/.test(t)) ||
      /\b(senior managers?|general managers?|regional managers?|engineering managers?)\b/.test(t),
  },
  {
    level: 'Junior',
    source: 'title:shop_staff_junior',
    test: (t) =>
      /\b(deli|floor|kitchen|waiting|bar|shop|store|retail|sales|warehouse|support)\s+staff\b/.test(t) ||
      /\bstaff\s*\([^)]*(full|part)\s*time/.test(t),
  },
  {
    level: 'Entry Level',
    source: 'title:entry',
    test: (t) => isEntryTrainingTitle(t),
  },
  {
    level: 'Junior',
    source: 'title:junior',
    test: (t) => /\b(juniors?|jr\.?)\b/.test(t),
  },
  {
    level: 'Junior',
    source: 'title:frontline_junior',
    test: (t) =>
      /\b(care assistants?|healthcare assistants?|\bhcas?\b|support workers?|care workers?|\bcarers?\b|home care)\b/.test(t) ||
      /\b(kitchen assistants?|kitchen porters?|catering assistants?|dishwashers?|commis chefs?|deli assistants?)\b/.test(t) ||
      /\b(cashiers?|sales assistants?|shop assistants?|store assistants?|retail assistants?|team members?)\b/.test(t) ||
      /\b(sales associates?|retail associates?|store associates?|fragrance associates?|warehouse associates?)\b/.test(t) ||
      /\b(waiters?|waitresses?|waiting staff|baristas?|bartenders?|bar staff|room attendants?|housekeep(?:er|ing)?|cleaners?|chambermaids?)\b/.test(t) ||
      /\b(warehouse operatives?|order pickers?|picker\s*[/&]?\s*packers?|\bpackers?\b)\b/.test(t) ||
      /\b(security guards?|security officers?|delivery drivers?|van drivers?)\b/.test(t),
  },
];

/**
 * Knowledge archetypes for unmarked titles (no seniority word).
 * Role-family defaults from common UK/IE hiring conventions.
 */
const ARCHETYPE_TIERS: Tier[] = [
  {
    level: 'Junior',
    source: 'archetype:team_leader_junior',
    // Hospitality / retail shift leads only — never NHS or clinical leaders
    test: (t) => isFrontlineTeamLeaderTitle(t) && !isClinicalHealthcareLeaderContext(t),
  },
  {
    level: 'Junior',
    source: 'archetype:frontline_service',
    test: (t) =>
      /\b(retail customer service|customer service advisors?|customer advisors?|customer assistants?|service assistants?)\b/.test(t) ||
      /\b(postpersons?|postal workers?|postmen|postwomen|mail carriers?|mail sorters?|sorters?)\b/.test(t) ||
      /\b(class\s*[12]\s+drivers?|hgv drivers?|lgv drivers?|truck drivers?|bus drivers?|taxi drivers?|service drivers?|drivers?|couriers?|shunters?|loaders?)\b/.test(
        t,
      ) ||
      /\b(field sales representatives?|sales representatives?|sales reps?|brand ambassadors?)\b/.test(t) ||
      /\b(sales development representatives?|business development representatives?|sdrs?\b|bdrs?\b|representatives?|\breps?\b)\b/.test(t) ||
      /\b(activities co-?ordinators?|receptionists?|porters?|secretar(?:y|ies)|lifeguards?|gardeners?|handlers?|merchandisers?)\b/.test(
        t,
      ) ||
      /\b(prisoner custody officers?|custody officers?|parking attendants?)\b/.test(t) ||
      /\b(chef de partie|commis|kitchen hands?|cake-?a-?tiers?|boh team mates?|team mates?|teammates?)\b/.test(t) ||
      /\b(colleagues?|nandocas?|crew members?|hosts?|hostesses|stewards?|attendants?|key[\s-]?holders?)\b/.test(t) ||
      /\b(general assistants?|online assistants?|trading assistants?|activities assistants?|service assistants?|sales assi[st]ants?|sales assiatants?)\b/.test(
        t,
      ) ||
      /\b(foh|boh|front of house|back of house|maintenance persons?)\b/.test(t) ||
      /\b(paint sprayers?|sprayers?)\b/.test(t) ||
      (/\b(agents?|clerks?|operatives?|workers?)\b/.test(t) && !/\b(knowledge workers?|social workers?)\b/.test(t)) ||
      (/\bassistants?\b/.test(t) && !/\b(executive|personal)\s+assistants?\b/.test(t)),
  },
  {
    level: 'Mid Level',
    source: 'archetype:professional_mid',
    test: (t) =>
      /\bmanagers?\b/.test(t) ||
      /\b(engineers?|developers?|programmers?|testers?|machinists?|technologists?|packagers?|wirers?)\b/.test(t) ||
      /\banalysts?\b/.test(t) ||
      /\b(scientists?|physicists?|economists?|researchers?|ecologists?|hydrogeologists?|geologists?)\b/.test(t) ||
      /\b(product owners?|process owners?|platform owners?|scrum masters?|delivery leads?)\b/.test(t) ||
      /\b(registered nurses?|\brgns?\b|\brmns?\b|dental nurses?|veterinary nurses?|practice nurses?|nurses?|matrons?)\b/.test(t) ||
      /\b(veterinary surgeons?|\bvets?\b|pharmacists?|physiotherapists?|occupational therapists?|radiographers?|sonographers?|mammographers?|paramedics?|midwives|dentists?|orthodontists?|periodontists?|optometrists?|hygienists?|dietitians?|dieticians?|gps?\b|doctors?|physicians?|clinicians?|practitioners?|therapists?|physiologists?|psychologists?|counsell?ors?|assessors?|phlebotomists?)\b/.test(
        t,
      ) ||
      /\b(sous chefs?|chefs?|cooks?|butchers?)\b/.test(t) ||
      /\b(personal trainers?|fitness coach(?:es)?|coach(?:es)?|trainers?|beauty experts?)\b/.test(t) ||
      /\b(consultants?|specialists?|technicians?|surveyors?|solicitors?|paralegals?|accountants?|bookkeepers?|auditors?|underwriters?|actuaries?|architects?|counsels?|barristers?|lawyers?|advocates?|fee earners?|paraplanners?|negotiators?|adjusters?|investigators?|generalists?|professionals?|contractors?)\b/.test(
        t,
      ) ||
      /\b(designers?|writers?|copywriters?|translators?|producers?|editors?|strategists?|estimators?|inspectors?|sourcers?|recruiters?|experts?|modellers?|modelers?|draftsmen|draughtsmen|animators?|riggers?|artists?|schedulers?)\b/.test(
        t,
      ) ||
      /\b(co-?ordinators?|coordinators?|administrators?|officers?|associates?|partners?)\b/.test(t) ||
      // Professional advisors only — frontline sales/beauty/service advisors handled by trap
      (/\b(advisors?|advisers?)\b/.test(t) && !isFrontlineAdvisorTitle(t)) ||
      /\b(teachers?|tutors?|lecturers?|instructors?)\b/.test(t) ||
      // Professional supervisors only — warehouse/store/shift handled by trap
      (/\b(buyers?|planners?|controllers?|forepersons?|foremen|foreman)\b/.test(t) ||
        (/\bsupervisors?\b/.test(t) && !isFrontlineSupervisorTitle(t))) ||
      /\b(electricians?|mechanics?|plumbers?|carpenters?|joiners?|roofers?|roof tilers?|installers?|fitters?|pipefitters?|operators?|welders?|fabricators?|builders?|bricklayers?|painters?|decorators?|groundworkers?|plasterers?|panel beaters?|linem[ae]n|linesm[ae]n|lineworkers?)\b/.test(
        t,
      ) ||
      /\b(bankers?|traders?|brokers?|underwriters?|claims handlers?|file handlers?)\b/.test(t) ||
      /\b(vfx|lookdev|groom)\b/.test(t) ||
      (/\btds?\b/.test(t) && /\b(facial|rigging|groom|lookdev|vfx|anim)\b/.test(t)) ||
      /\b(project controls|cost management|risk management|project management|cost and commercial management|customer success|ground engineering|software engineering|transportation|cost intelligence)\b/.test(
        t,
      ) ||
      /\b(social workers?|legal secretar(?:y|ies)|legal pas?)\b/.test(t) ||
      /\boperations support\b/.test(t) ||
      /\b\d+(?:st|nd|rd|th)\s+line\s+support\b/.test(t),
  },
];

/**
 * Stage 1: title only. null = no match (pass to JD / years / embedding / review).
 */
export function inferJobLevelFromTitle(title: string): JobLevelMatch | null {
  if (!title?.trim()) return null;
  const t = stripTitleNoise(normalizeTitle(title));
  if (isNonRoleTitle(t)) return null;

  const override = applyTitleOverrides(t);
  if (override === 'defer') return null;
  if (override) return ALLOWED.has(override.level) ? override : null;

  for (const tier of KEYWORD_TIERS) {
    if (tier.test(t) && ALLOWED.has(tier.level)) {
      return { level: tier.level, source: tier.source };
    }
  }

  return null;
}

/**
 * Knowledge archetypes for unmarked titles (no seniority word).
 * Intended to run AFTER JD labels / soft years in the cascade.
 */
export function inferJobLevelFromArchetype(title: string): JobLevelMatch | null {
  if (!title?.trim()) return null;
  const t = stripTitleNoise(normalizeTitle(title));
  if (isNonRoleTitle(t)) return null;

  for (const tier of ARCHETYPE_TIERS) {
    if (tier.test(t) && ALLOWED.has(tier.level)) {
      return { level: tier.level, source: tier.source };
    }
  }
  return null;
}

/**
 * Title-only helper including archetypes (tests / scrapers that skip JD).
 */
export function inferJobLevel(title: string): AllowedJobLevel | null {
  return inferJobLevelFromTitle(title)?.level ?? inferJobLevelFromArchetype(title)?.level ?? null;
}
