/**
 * Web-research unmatched imported companies for UK sponsor / Ireland permit status.
 *
 * For each unmatched company:
 *  1. Web search (Serper → Tavily fallback) for UK legal name + sponsor signals
 *  2. Web search for Ireland permit / Dublin entity
 *  3. Re-match discovered legal names against local UK register + Ireland permits
 *  4. Optionally accept strong snippet evidence
 *
 * Run:
 *   npx tsx src/scripts/webMatchUnmatchedLicences.ts
 *   npx tsx src/scripts/webMatchUnmatchedLicences.ts --dry-run
 *   npx tsx src/scripts/webMatchUnmatchedLicences.ts --limit 20
 */
import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Number(process.argv[process.argv.indexOf('--limit') + 1]) || 0;

const SERPER_API_KEY = process.env.SERPER_API_KEY || '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
let serperDisabled = false;

if (!SERPER_API_KEY && !TAVILY_API_KEY) {
  console.error('SERPER_API_KEY or TAVILY_API_KEY required');
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MATCH_JSON = path.resolve(process.cwd(), 'tmp-imported-licence-match.json');
const PERMITS_JSON = path.resolve(
  process.cwd(),
  'data/ireland/raw/ireland-employment-permits-merged.json'
);
const OUT_JSON = path.resolve(process.cwd(), 'tmp-web-licence-match.json');

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTrue(v: unknown) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function normalize(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set([
  'LIMITED', 'LTD', 'PLC', 'LLP', 'GROUP', 'UK', 'IRELAND', 'INTERNATIONAL',
  'COMPANY', 'HOLDINGS', 'SERVICES', 'THE', 'AND', 'OF', 'INC', 'CORP',
  'TECHNOLOGY', 'TECHNOLOGIES', 'SOLUTIONS', 'UC', 'DAC', 'EUROPE',
]);

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t) && t.length > 1);
}

function isBadUkMatch(org: string): boolean {
  const u = org.toUpperCase();
  return (
    /\bNHS\b/.test(u) ||
    /FOUNDATION TRUST/.test(u) ||
    /CARE HOME/.test(u) ||
    /RESTAURANT|\bT\/A\b|TAKEAWAY|CUISINE/.test(u)
  );
}

async function downloadUkRegister(): Promise<string[]> {
  const page = await fetch(
    'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers'
  ).then((r) => r.text());
  const links = [...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/g)].map(
    (m) => m[0]
  );
  const csvUrl = links.find((l) => /SP_|Worker|Register/i.test(l)) || links[0];
  if (!csvUrl) throw new Error('UK register CSV not found');
  const csv = await fetch(csvUrl).then((r) => r.text());
  const orgs: string[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const org = line.startsWith('"')
      ? line.match(/^"([^"]*)"/)?.[1] || ''
      : line.split(',')[0];
    if (org.trim()) orgs.push(org.trim());
  }
  return orgs;
}

function buildIndex(orgs: string[], filterBad = false) {
  const byNorm = new Map<string, string>();
  const byFirst = new Map<string, string[]>();
  for (const org of orgs) {
    if (filterBad && isBadUkMatch(org)) continue;
    const n = normalize(org);
    if (!byNorm.has(n)) byNorm.set(n, org);
    const first = tokens(org)[0];
    if (first && first.length >= 4) {
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first)!.push(org);
    }
  }
  return { byNorm, byFirst };
}

function matchName(name: string, index: ReturnType<typeof buildIndex>): string | null {
  const n = normalize(name);
  if (!n) return null;
  if (index.byNorm.has(n)) return index.byNorm.get(n)!;

  const nt = tokens(name);
  if (!nt.length) return null;
  const first = nt[0];
  if (first.length < 4) return null;
  const pool = index.byFirst.get(first) || [];

  if (nt.length === 1) {
    if (first.length < 6) return null;
    return (
      pool.find((org) => {
        const ot = tokens(org);
        return ot[0] === first && (ot.length <= 4 || /LIMITED|LTD|PLC|UC|DAC|IRELAND|UK/i.test(org));
      }) || null
    );
  }

  let best: { org: string; score: number } | null = null;
  for (const org of pool) {
    const ot = tokens(org);
    if (!ot.length || ot[0] !== first) continue;
    const inter = nt.filter((t) => ot.includes(t)).length;
    const score = inter / nt.length;
    if (score >= 0.75 && inter >= 2 && (!best || score > best.score)) best = { org, score };
  }
  return best?.org || null;
}

type SearchHit = { title: string; link: string; snippet: string };

const JUNK_HOST =
  /uksponsors\.com|ukjobhunters\.com|applywave\.app|immigrationbarrister|vanessaganguin|rippling\.com\/blog|youtube\.com|wise\.com\/gb\/blog|legal500\.com|gov\.uk\/government\/publications\/register-of-licensed-sponsors/i;

function isJunkHit(h: SearchHit): boolean {
  return JUNK_HOST.test(h.link || '');
}

function hitMentionsBrand(h: SearchHit, brand: string): boolean {
  const text = `${h.title} ${h.snippet}`.toLowerCase();
  const toks = tokens(brand);
  if (!toks.length) return false;
  // Short brands (2K, 10X): require whole-word style mention of the brand string
  if (toks[0].length < 4 || toks.length === 1 && toks[0].length < 5) {
    const brandRe = new RegExp(
      `(^|[^a-z0-9])${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
      'i'
    );
    return brandRe.test(`${h.title} ${h.snippet}`);
  }
  return toks.every((t) => t.length < 4 || text.includes(t.toLowerCase()));
}

function brandRelatedName(candidate: string, brand: string): boolean {
  const bt = tokens(brand);
  const ct = tokens(candidate);
  if (!bt.length || !ct.length) return false;
  if (bt[0].length < 4) {
    return normalize(candidate).includes(normalize(brand)) || ct.includes(bt[0]);
  }
  const inter = bt.filter((t) => ct.includes(t)).length;
  if (bt.length === 1) return ct[0] === bt[0] || ct.includes(bt[0]);
  return inter >= Math.min(2, bt.length) || (inter >= 1 && ct[0] === bt[0]);
}

async function serperSearch(query: string, num = 5): Promise<SearchHit[]> {
  if (!SERPER_API_KEY || serperDisabled) return [];
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 400 && /credits|quota/i.test(t)) {
      serperDisabled = true;
      console.warn('Serper disabled (no credits) — using Tavily');
    } else {
      console.warn(`Serper ${res.status}: ${t.slice(0, 120)}`);
    }
    return [];
  }
  const data = await res.json();
  return (data.organic || []).map((o: any) => ({
    title: String(o.title || ''),
    link: String(o.link || ''),
    snippet: String(o.snippet || ''),
  }));
}

async function tavilySearch(query: string, num = 5): Promise<SearchHit[]> {
  if (!TAVILY_API_KEY) return [];
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: num,
      include_answer: false,
      search_depth: 'basic',
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn(`Tavily ${res.status}: ${t.slice(0, 120)}`);
    return [];
  }
  const data = await res.json();
  return (data.results || []).map((o: any) => ({
    title: String(o.title || ''),
    link: String(o.url || ''),
    snippet: String(o.content || o.snippet || ''),
  }));
}

async function webSearch(query: string, num = 5): Promise<SearchHit[]> {
  const serper = await serperSearch(query, num);
  if (serper.length > 0) return serper;
  return tavilySearch(query, num);
}

/** Pull plausible UK/IE legal entity names from search text. */
function extractLegalNames(text: string, brand: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /([A-Z][A-Za-z0-9&'. -]{2,80}?\s(?:Limited|Ltd\.?|PLC|LLP|UC|DAC|Inc\.?))\b/g,
    /([A-Z][A-Za-z0-9&'. -]{2,80}?\s(?:Ireland|UK)\s(?:Limited|Ltd\.?))\b/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const name = m[1].replace(/\s+/g, ' ').trim();
      if (name.length < 5 || name.length > 90) continue;
      if (!brandRelatedName(name, brand)) continue;
      out.add(name);
    }
  }
  return [...out];
}

function snippetSaysUkSponsor(text: string, brand: string): boolean {
  const tok = tokens(brand)[0]?.toLowerCase() || brand.toLowerCase();
  if (tok.length >= 3 && !text.toLowerCase().includes(tok.toLowerCase())) return false;
  return (
    (/licensed sponsor|sponsor licence|sponsor license|skilled worker sponsor|home office.*sponsor|on the.*sponsor register/i.test(
      text
    ) &&
      /\buk\b|united kingdom|britain/i.test(text)) ||
    (/sponsor/i.test(text) && /skilled worker/i.test(text) && /\buk\b|united kingdom/i.test(text))
  );
}

function snippetSaysIrelandPermit(text: string, brand: string): boolean {
  const tok = tokens(brand)[0]?.toLowerCase() || brand.toLowerCase();
  if (tok.length >= 3 && !text.toLowerCase().includes(tok.toLowerCase())) return false;
  return (
    /employment permit|critical skills|general employment permit|hosting agreement|ireland.*permit|permit.*ireland/i.test(
      text
    ) && /ireland|dublin|irish/i.test(text)
  );
}

async function researchCompany(
  name: string,
  ukIndex: ReturnType<typeof buildIndex>,
  ieIndex: ReturnType<typeof buildIndex>
) {
  const queries = [
    `"${name}" ("Limited" OR Ltd OR "UK Ltd") (sponsor OR "Companies House" OR London OR Manchester)`,
    `"${name}" (Ireland OR Dublin) ("Limited" OR Ltd OR DAC OR UC) (permit OR careers OR employer)`,
  ];

  const allHits: SearchHit[] = [];
  for (const q of queries) {
    const hits = await webSearch(q, 5);
    allHits.push(...hits);
    await sleep(250);
  }

  const useful = allHits.filter((h) => !isJunkHit(h) && hitMentionsBrand(h, name));
  const blob = useful.map((h) => `${h.title}\n${h.snippet}`).join('\n');
  const legalNames = extractLegalNames(blob, name);

  let ukMatch: string | null = null;
  let ieMatch: string | null = null;
  // Only try brand itself if it's long enough to be a reliable register key
  const tried = [
    ...(tokens(name)[0]?.length >= 4 ? [name] : []),
    ...legalNames,
  ].filter((c) => brandRelatedName(c, name) || normalize(c) === normalize(name));

  for (const candidate of tried) {
    if (!ukMatch) {
      const m = matchName(candidate, ukIndex);
      if (m && brandRelatedName(m, name)) ukMatch = m;
    }
    if (!ieMatch) {
      const m = matchName(candidate, ieIndex);
      if (m && brandRelatedName(m, name)) ieMatch = m;
    }
  }

  const ukSnippet = useful.some((h) =>
    snippetSaysUkSponsor(`${h.title} ${h.snippet}`, name)
  );
  const ieSnippet = useful.some((h) =>
    snippetSaysIrelandPermit(`${h.title} ${h.snippet}`, name)
  );

  return {
    legalNames,
    ukMatch,
    ieMatch,
    ukSnippetEvidence: ukSnippet,
    ieSnippetEvidence: ieSnippet,
    evidence: useful.slice(0, 6).map((h) => ({
      title: h.title,
      link: h.link,
      snippet: h.snippet.slice(0, 220),
    })),
  };
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN' : 'LIVE — web-match unmatched companies');
  console.log(
    `Search: Serper=${SERPER_API_KEY ? 'yes' : 'no'} Tavily=${TAVILY_API_KEY ? 'yes' : 'no'}`
  );

  if (!fs.existsSync(MATCH_JSON)) {
    console.error(`Missing ${MATCH_JSON} — run matchImportedCompanyLicences.ts first`);
    process.exit(1);
  }

  const prior = JSON.parse(fs.readFileSync(MATCH_JSON, 'utf8'));
  const unmatchedRaw: string[] = prior.unmatched || [];
  let targets = unmatchedRaw.map((line) => {
    const m = line.match(/^(\d+)\s+(.+)$/);
    return m ? { id: m[1], name: m[2].trim() } : null;
  }).filter(Boolean) as Array<{ id: string; name: string }>;

  // Also include companies from CSV range that still have neither flag
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);
  console.log(`Targets: ${targets.length}`);

  const [ukOrgs, permitRaw] = await Promise.all([
    downloadUkRegister(),
    Promise.resolve(JSON.parse(fs.readFileSync(PERMITS_JSON, 'utf8'))),
  ]);
  const permitNames = (permitRaw.employers || [])
    .map((e: any) => String(e.employerName || '').trim())
    .filter(Boolean);
  const ukIndex = buildIndex(ukOrgs, true);
  const ieIndex = buildIndex(permitNames, false);
  console.log(`UK orgs ${ukOrgs.length} | IE employers ${permitNames.length}`);

  const results: any[] = [];
  let ukNew = 0;
  let ieNew = 0;

  for (let i = 0; i < targets.length; i++) {
    const { id, name } = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${id} ${name} ... `);

    let research: Awaited<ReturnType<typeof researchCompany>>;
    try {
      research = await researchCompany(name, ukIndex, ieIndex);
    } catch (e: any) {
      console.log(`ERR ${e.message}`);
      results.push({ id, name, error: e.message });
      continue;
    }

    // Snippet-only evidence is weaker — only accept if we also found a register match,
    // OR snippet is strong AND we found a legal name that almost matches.
    const setUk = !!research.ukMatch;
    const setIe = !!research.ieMatch;

    const patch: Record<string, boolean> = {};
    if (setUk) patch.licensed_sponsor = true;
    if (setIe) patch.ireland_permit_employer = true;

    if (Object.keys(patch).length) {
      if (setUk) ukNew++;
      if (setIe) ieNew++;
      console.log(
        `OK uk=${research.ukMatch || '-'} ie=${research.ieMatch || '-'} legal=${research.legalNames.slice(0, 2).join('; ') || '-'}`
      );
      if (!DRY_RUN) {
        let { error } = await sb.from('companies').update(patch).eq('id', id);
        if (error) {
          const alt: Record<string, string> = {};
          for (const [k, v] of Object.entries(patch)) alt[k] = v ? 'true' : 'false';
          ({ error } = await sb.from('companies').update(alt).eq('id', id));
        }
        if (error) console.warn(`  DB fail: ${error.message}`);
      }
    } else {
      const weak =
        research.ukSnippetEvidence || research.ieSnippetEvidence
          ? ` weak(ukSnap=${research.ukSnippetEvidence},ieSnap=${research.ieSnippetEvidence})`
          : '';
      console.log(`no match${weak}`);
    }

    results.push({
      id,
      name,
      ...research,
      applied: patch,
    });

    // gentle rate limit
    await sleep(150);
  }

  const summary = {
    dryRun: DRY_RUN,
    targets: targets.length,
    ukFlagsSet: ukNew,
    irelandFlagsSet: ieNew,
    stillUnmatched: results.filter((r) => !r.applied || !Object.keys(r.applied).length).length,
    results,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
  console.log('\n======== SUMMARY ========');
  console.log(`UK flags set: ${ukNew}`);
  console.log(`Ireland flags set: ${ieNew}`);
  console.log(`Still unmatched: ${summary.stillUnmatched}`);
  console.log(`Wrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
