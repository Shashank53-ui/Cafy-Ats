/**
 * Knowledge-based level audit on unique production titles.
 * Uses UK/IE hiring-market heuristics — NOT current cascade rules.
 *
 *   npx tsx scripts/_tmpKnowledgeAuditLevels.ts
 *
 * Writes:
 *   logs/knowledge_level_verdicts.csv
 *   logs/knowledge_level_fix_candidates.csv
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', quiet: true });

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

type Level = 'Entry Level' | 'Junior' | 'Mid Level' | 'Senior';
type Verdict = 'correct' | 'wrong' | 'mixed' | 'manual_review';

const LEVELS = new Set<Level>(['Entry Level', 'Junior', 'Mid Level', 'Senior']);

function norm(t: string): string {
  return String(t || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStoredLevels(s: string): { level: string; count: number }[] {
  if (!s) return [];
  return s.split('|').map((part) => {
    const m = part.trim().match(/^(.+?):(\d+)$/);
    if (!m) return { level: part.trim(), count: 0 };
    return { level: m[1]!.trim(), count: Number(m[2]) };
  });
}

function dominantLevel(stored: { level: string; count: number }[]): string {
  const sorted = [...stored].sort((a, b) => b.count - a.count);
  return sorted[0]?.level || '';
}

function isMixed(stored: { level: string; count: number }[], total: number): boolean {
  const meaningful = stored.filter((s) => s.level && s.level !== '(blank)' && s.count > 0);
  if (meaningful.length <= 1) return false;
  const top = meaningful[0]!;
  return top.count / total < 0.85;
}

function isNonRoleTitle(t: string): boolean {
  const n = norm(t);
  return (
    !n ||
    n === 'register your interest' ||
    /^register your interest\b/.test(n) ||
    /\bexpression of interest\b/.test(n) ||
    /\bupcoming opportunities?\b/.test(n) ||
    /\btalent pool\b/.test(n)
  );
}

function isClinicalLeaderContext(t: string): boolean {
  const n = norm(t);
  if (/\b(clinical leaders?|specialist clinical leaders?|nurse leaders?|social care leaders?)\b/.test(n)) {
    return true;
  }
  if (!/\b(leaders?|team leaders?)\b/.test(n)) return false;
  const x = n
    .replace(/\bmaternity\s+(cover|leave|returner)s?\b/g, ' ')
    .replace(/\b(paternity|parental)\s+(cover|leave)\b/g, ' ');
  return (
    /\b(nhs|health board|foundation trust|social care|clinical|theatres?|wards?|nurs(?:e|ing)|midwi[fv]e?|hcas?|healthcare|lymphoedema|maxfax|maxill?ofacial|audiolog|paediatric|oncology|camhs|disability)\b/.test(
      x,
    )
  );
}

function isFrontlineLeaderContext(t: string): boolean {
  const n = norm(t);
  if (isClinicalLeaderContext(n)) return false;
  return (
    /\b(team leaders?|kitchen team leaders?|shift leaders?|crew leaders?|section leaders?|store leaders?|bar team leaders?|cafe team leaders?|hotel team leaders?|warehouse team leaders?|foh team leaders?|boh team leaders?|reception team leaders?|kitchen leaders?)\b/.test(
      n,
    ) ||
    (/\bteam leaders?\b/.test(n) &&
      /\b(kitchen|retail|store|shop|bar|restaurant|hospitality|pub|hotel|warehouse|tesco|nandos|pret|greene|shift|front of house|back of house|customer service)\b/.test(
        n,
      )) ||
    (/\bshift leaders?\b/.test(n) && !/\bmaternity\b/.test(n))
  );
}

function isProfessionalLeaderContext(t: string): boolean {
  const n = norm(t);
  if (isFrontlineLeaderContext(n) || isClinicalLeaderContext(n)) return false;
  return (
    /\b(product|technology|technical|engineering|software|platform|practice|market|growth|sales|presales|pre-sales|global|desalination|service desk|ai|data|security|transformation|consulting|business development|hr|finance|operations|programme|project|delivery|alliances?|partnerships?)\s+leaders?\b/.test(
      n,
    ) ||
    /\bleaders?\b/.test(n)
  );
}

function knowledgeLevel(title: string): { level: Level | null; note: string } {
  const n = norm(title);
  if (isNonRoleTitle(n)) return { level: null, note: 'non_role_talent_pool' };

  if (/\b(intern|internship|apprentice|apprenticeship|graduate scheme|grad scheme|trainee|placement student|year in industry|digital academy|academy programme)\b/.test(n)) {
    return { level: 'Entry Level', note: 'entry_training' };
  }

  if (/\b(seniors?|snr\.?|sr\.?|principal|director|head of|vp|vice president|chief|managing director|\bmd\b)\b/.test(n)) {
    if (/\bexecutive assistants?\b/.test(n)) return { level: 'Mid Level', note: 'executive_assistant' };
    if (/\b(head|executive)\s+chefs?\b/.test(n)) return { level: 'Senior', note: 'head_chef' };
    if (/\bassociate directors?\b/.test(n)) return { level: 'Senior', note: 'associate_director' };
    return { level: 'Senior', note: 'explicit_seniority' };
  }

  if (/\b(juniors?|jr\.?)\b/.test(n)) return { level: 'Junior', note: 'explicit_junior' };

  if (isClinicalLeaderContext(n)) return { level: 'Mid Level', note: 'clinical_leader_mid' };

  if (isFrontlineLeaderContext(n)) return { level: 'Junior', note: 'frontline_leader_junior' };

  if (isProfessionalLeaderContext(n)) {
    if (/\b(global|practice|market|principal|director|presales|pre-sales|technology|product|engineering)\s+leaders?\b/.test(n)) {
      return { level: 'Senior', note: 'professional_leader_senior' };
    }
    return { level: 'Mid Level', note: 'professional_leader_mid' };
  }

  if (/\bexecutive assistants?\b/.test(n) || /\bpersonal assistants?\b/.test(n)) {
    return { level: 'Mid Level', note: 'executive_assistant' };
  }

  // UK "Executive" sales/admin titles without seniority → Junior
  if (/\bexecutives?\b/.test(n) && !/\b(chief|managing)\b/.test(n)) {
    return { level: 'Junior', note: 'uk_functional_executive' };
  }

  if (/\b(care assistants?|support workers?|healthcare assistants?|\bhcas?\b|postpersons?|postmen|postwomen|couriers?|drivers?|class\s*[12]\s+drivers?|hgv|lgv|retail assistants?|sales assistants?|shop assistants?|store assistants?|customer assistants?|service assistants?|cashiers?|bar staff|waiters?|waitresses?|kitchen porters?|commis|chef de partie|stewards?|attendants?|lifeguards?|merchandisers?|receptionists?|activities assistants?|night care assistants?|bank support workers?|prisoner custody officers?|custody officers?|field sales representatives?|field sales executives?|sales development representatives?|business development representatives?)\b/.test(n)) {
    return { level: 'Junior', note: 'frontline_junior' };
  }

  if (/\b(sales advisors?|customer service advisors?|customer advisors?|retail advisors?|beauty advisors?|service advisors?)\b/.test(n)) {
    return { level: 'Junior', note: 'advisor_junior' };
  }

  if (/\b(supervisors?|team leaders?)\b/.test(n) && /\b(hospitality|retail|store|shop|warehouse|hotel|pub|restaurant|kitchen|shift|tesco|asda|nandos)\b/.test(n)) {
    return { level: 'Junior', note: 'frontline_supervisor_junior' };
  }

  if (/\b(supervisors?|duty managers?)\b/.test(n) && !/\b(senior|principal|director)\b/.test(n)) {
    return { level: 'Mid Level', note: 'operational_supervisor_mid' };
  }

  if (/\b(registered nurses?|\brgns?\b|\brmns?\b|dental nurses?|veterinary nurses?|vets?|veterinary surgeons?|surgeons?|pharmacists?|physiotherapists?|occupational therapists?|radiographers?|sonographers?|paramedics?|midwives|dentists?|associate dentists?|optometrists?|clinical research associates?|matrons?|consultants?|solicitors?|barristers?|lawyers?|accountants?|architects?|engineers?|developers?|scientists?|analysts?|managers?|project managers?|product managers?|nurses?|chefs?|maintenance technicians?|electricians?|mechanics?|technicians?|bookkeepers?|underwriters?|actuaries?|surveyors?|designers?|coordinators?|administrators?|officers?|advisors?|advisers?|associates?)\b/.test(n)) {
    if (/\bassociate directors?\b/.test(n)) return { level: 'Senior', note: 'associate_director' };
    if (/\b(christmas retail associate|warehouse associate|sales associate|retail associate)\b/.test(n)) {
      return { level: 'Junior', note: 'associate_frontline' };
    }
    if (/\bassociate\b/.test(n) && /\b(engineer|consultant|manager|hydrologist|cost manager|project manager|dentist|programme manager|structural engineer|mechanical engineer|electrical engineer|civil engineer|process engineer|flood|ecologist|surveyor|architect)\b/.test(n)) {
      return { level: 'Mid Level', note: 'associate_professional_mid' };
    }
    if (/\b(chef de partie|commis)\b/.test(n)) return { level: 'Junior', note: 'kitchen_junior' };
    if (/\b(head chefs?|executive chefs?|general managers?)\b/.test(n)) return { level: 'Senior', note: 'kitchen_or_gm_senior' };
    if (/\b(chefs?|sous chefs?)\b/.test(n)) return { level: 'Mid Level', note: 'chef_mid' };
    return { level: 'Mid Level', note: 'professional_mid_default' };
  }

  if (/\b(account executives?|enterprise account executives?|account managers?|business development managers?|customer success managers?|operations associates?)\b/.test(n)) {
    return { level: 'Mid Level', note: 'commercial_mid_default' };
  }

  return { level: null, note: 'ambiguous_manual_review' };
}

function verdictFor(title: string, stored: { level: string; count: number }[], total: number): {
  verdict: Verdict;
  knowledge_level: Level | null;
  knowledge_note: string;
  stored_dominant: string;
  confidence: 'high' | 'medium' | 'low';
} {
  const { level, note } = knowledgeLevel(title);
  const dominant = dominantLevel(stored);
  const mixed = isMixed(stored, total);

  if (level === null) {
    return {
      verdict: 'manual_review',
      knowledge_level: null,
      knowledge_note: note,
      stored_dominant: dominant,
      confidence: 'high',
    };
  }

  if (mixed) {
    return {
      verdict: 'mixed',
      knowledge_level: level,
      knowledge_note: note,
      stored_dominant: dominant,
      confidence: 'medium',
    };
  }

  if (dominant === level || (dominant === '(blank)' && level)) {
    return {
      verdict: 'correct',
      knowledge_level: level,
      knowledge_note: note,
      stored_dominant: dominant,
      confidence: 'high',
    };
  }

  const conf =
    total >= 10 || /\b(leader|executive|advisor|supervisor|associate)\b/i.test(title) ? 'high' : 'medium';

  return {
    verdict: 'wrong',
    knowledge_level: level,
    knowledge_note: note,
    stored_dominant: dominant,
    confidence: conf,
  };
}

function csv(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const uniquePath = path.join('logs', 'knowledge_unique_titles.csv');
  if (!fs.existsSync(uniquePath)) throw new Error('Missing logs/knowledge_unique_titles.csv — run export first');

  const unique = fs.readFileSync(uniquePath, 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  const verdictRows: string[] = [
    [
      'rank',
      'count',
      'title',
      'stored_levels',
      'stored_dominant',
      'knowledge_level',
      'verdict',
      'confidence',
      'knowledge_note',
      'description_preview',
    ].join(','),
  ];

  let correct = 0;
  let wrong = 0;
  let mixed = 0;
  let manual = 0;
  let wrongJobs = 0;
  const fixTitles = new Map<
    string,
    { count: number; from: string; to: Level; note: string; confidence: string }
  >();

  for (const line of unique) {
    const cols: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cols.push(cur);
        cur = '';
      } else cur += ch;
    }
    cols.push(cur);

    const rank = cols[0] || '';
    const count = Number(cols[1] || 0);
    const title = cols[2] || '';
    const stored = cols[4] || '';
    const preview = cols[9] || '';
    const storedParsed = parseStoredLevels(stored);
    const v = verdictFor(title, storedParsed, count);

    if (v.verdict === 'correct') correct += count;
    else if (v.verdict === 'wrong') {
      wrong += count;
      wrongJobs += count;
      const key = norm(title);
      fixTitles.set(key, {
        count,
        from: v.stored_dominant,
        to: v.knowledge_level!,
        note: v.knowledge_note,
        confidence: v.confidence,
      });
    } else if (v.verdict === 'mixed') mixed += count;
    else manual += count;

    verdictRows.push(
      [
        rank,
        count,
        csv(title),
        csv(stored),
        csv(v.stored_dominant),
        csv(v.knowledge_level || ''),
        v.verdict,
        v.confidence,
        csv(v.knowledge_note),
        csv(preview.slice(0, 120)),
      ].join(','),
    );
  }

  fs.writeFileSync(path.join('logs', 'knowledge_level_verdicts.csv'), verdictRows.join('\n'));

  const fixList = [...fixTitles.entries()]
    .map(([normTitle, v]) => ({ normTitle, ...v }))
    .sort((a, b) => b.count - a.count);

  const fixLines = [
    ['norm_title', 'job_count', 'stored_dominant', 'knowledge_level', 'confidence', 'knowledge_note'].join(','),
    ...fixList.map((f) =>
      [csv(f.normTitle), f.count, csv(f.from), f.to, f.confidence, csv(f.note)].join(','),
    ),
  ];
  fs.writeFileSync(path.join('logs', 'knowledge_level_fix_candidates.csv'), fixLines.join('\n'));

  const topWrong = fixList.slice(0, 40).map((f) => ({
    count: f.count,
    from: f.from,
    to: f.to,
    note: f.note,
    title: f.normTitle,
  }));

  console.log(
    JSON.stringify(
      {
        unique_titles: unique.length,
        job_rows_reviewed: correct + wrong + mixed + manual,
        by_verdict_jobs: { correct, wrong, mixed, manual_review: manual },
        pct_knowledge_correct: Number(((correct / Math.max(1, correct + wrong + mixed + manual)) * 100).toFixed(2)),
        high_confidence_fix_titles: fixList.filter((f) => f.confidence === 'high').length,
        top_wrong: topWrong,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
