/**
 * Parse stored ATS apply URLs and fetch live posting IDs from public board APIs.
 * Used to drop closed jobs that still 200 on the apply page.
 */

export type AtsProvider =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'smartrecruiters'
  | 'pinpoint'
  | 'breezy'
  | 'recruitee'
  | 'bamboohr'
  | 'personio'
  | 'teamtailor'
  | 'jobvite';

export type ParsedAtsUrl = {
  provider: AtsProvider;
  board: string;
  jobId: string;
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export const ATS_URL_LIKE: Record<AtsProvider, string> = {
  greenhouse: '%greenhouse.io%',
  lever: '%lever.co%',
  ashby: '%ashbyhq.com%',
  workable: '%workable.com%',
  smartrecruiters: '%smartrecruiters.com%',
  pinpoint: '%pinpointhq.com%',
  breezy: '%breezy.hr%',
  recruitee: '%recruitee.com%',
  bamboohr: '%bamboohr.com%',
  personio: '%personio%',
  teamtailor: '%teamtailor.com%',
  jobvite: '%jobvite.com%',
};

export function parseAtsJobUrl(url: string): ParsedAtsUrl | null {
  const u = String(url || '').trim();
  if (!u) return null;

  let m = u.match(/greenhouse\.io\/(?:embed\/job_board\?for=)?([^/?#]+)\/jobs\/(\d+)/i);
  if (m) return { provider: 'greenhouse', board: m[1].toLowerCase(), jobId: m[2] };

  m = u.match(/jobs(?:\.eu)?\.lever\.co\/([^/?#]+)\/([0-9a-f-]{8,})/i);
  if (m) return { provider: 'lever', board: m[1].toLowerCase(), jobId: m[2].toLowerCase() };

  m = u.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{8,})/i);
  if (m) return { provider: 'ashby', board: m[1].toLowerCase(), jobId: m[2].toLowerCase() };

  m = u.match(/apply\.workable\.com\/j\/([A-Za-z0-9]+)/i);
  if (m) return { provider: 'workable', board: '', jobId: m[1].toUpperCase() };
  m = u.match(/apply\.workable\.com\/([^/?#]+)\/j\/([A-Za-z0-9]+)/i);
  if (m && m[1].toLowerCase() !== 'j') {
    return { provider: 'workable', board: m[1].toLowerCase(), jobId: m[2].toUpperCase() };
  }

  m = u.match(/jobs\.smartrecruiters\.com\/([^/?#]+)\/(\d+)/i);
  if (m) return { provider: 'smartrecruiters', board: m[1], jobId: m[2] };

  m = u.match(/https?:\/\/([^./]+)\.pinpointhq\.com\/(?:[a-z]{2}\/)?postings\/([0-9a-f-]{8,})/i);
  if (m) return { provider: 'pinpoint', board: m[1].toLowerCase(), jobId: m[2].toLowerCase() };

  m = u.match(/https?:\/\/([^./]+)\.breezy\.hr\/p\/([^/?#]+)/i);
  if (m) return { provider: 'breezy', board: m[1].toLowerCase(), jobId: m[2].toLowerCase() };

  m = u.match(/https?:\/\/([^./]+)\.recruitee\.com\/o\/([^/?#]+)/i);
  if (m) return { provider: 'recruitee', board: m[1].toLowerCase(), jobId: m[2].toLowerCase() };

  m = u.match(/https?:\/\/([^./]+)\.bamboohr\.com\/(?:careers|jobs)\/(\d+)/i);
  if (m) return { provider: 'bamboohr', board: m[1].toLowerCase(), jobId: m[2] };

  m = u.match(/https?:\/\/([^./]+)\.jobs\.personio\.(?:de|com)\/job\/(\d+)/i);
  if (m) return { provider: 'personio', board: m[1].toLowerCase(), jobId: m[2] };

  m = u.match(/https?:\/\/([^./]+)\.teamtailor\.com\/jobs\/(\d+)/i);
  if (m) return { provider: 'teamtailor', board: m[1].toLowerCase(), jobId: m[2] };

  m = u.match(/jobs\.jobvite\.com\/([^/?#]+)\/job\/([^/?#]+)/i);
  if (m) return { provider: 'jobvite', board: m[1].toLowerCase(), jobId: m[2] };

  return null;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any | null> {
  const got = await fetchStatus(url, init);
  if (!got || got.status < 200 || got.status >= 300) return null;
  return got.data;
}

async function fetchStatus(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; data: any | null } | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    let data: any = null;
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        data = null;
      }
    }
    return { status: res.status, data };
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<{ ok: boolean; text: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return { ok: true, text: await res.text() };
  } catch {
    return null;
  }
}

function setOf(ids: Array<string | number | null | undefined>): Set<string> {
  return new Set(ids.map((id) => String(id || '').trim()).filter(Boolean).map((id) => id.toLowerCase()));
}

async function liveGreenhouse(board: string): Promise<Set<string> | null> {
  for (const sub of ['boards-api', 'boards-api.eu']) {
    const data = await fetchJson(`https://${sub}.greenhouse.io/v1/boards/${board}/jobs`);
    if (data && Array.isArray(data.jobs)) {
      return setOf(data.jobs.map((j: any) => j.id));
    }
  }
  return null;
}

async function liveLever(board: string): Promise<Set<string> | null> {
  for (const base of ['https://api.eu.lever.co/v0/postings', 'https://api.lever.co/v0/postings']) {
    const data = await fetchJson(`${base}/${board}?mode=json`);
    if (!Array.isArray(data)) continue;
    const ids: string[] = [];
    if (data[0]?.postings) {
      for (const group of data) {
        for (const p of group.postings || []) ids.push(String(p.id || ''));
      }
    } else {
      for (const p of data) ids.push(String(p.id || ''));
    }
    return setOf(ids);
  }
  return null;
}

async function liveAshby(board: string): Promise<Set<string> | null> {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${board}`);
  if (data && Array.isArray(data.jobs)) return setOf(data.jobs.map((j: any) => j.id));
  return null;
}

async function liveWorkable(board: string): Promise<Set<string> | null> {
  const detail = await fetchJson(`https://www.workable.com/api/accounts/${board}?detail=true`);
  if (dataIsWorkableJobs(detail)) return setOf(detail.jobs.map((j: any) => j.shortcode));
  try {
    const res = await fetch(`https://apply.workable.com/api/v3/accounts/${board}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (Array.isArray(data?.results)) return setOf(data.results.map((j: any) => j.shortcode));
  } catch {
    /* ignore */
  }
  return null;
}

function dataIsWorkableJobs(data: any): data is { jobs: any[] } {
  return data && Array.isArray(data.jobs);
}

async function liveSmartRecruiters(board: string, needed?: Set<string>): Promise<Set<string> | null> {
  const first = await fetchJson(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings?limit=100&offset=0&status=PUBLISHED`,
  );
  if (!first || !Array.isArray(first.content)) return null;
  const totalFound = typeof first.totalFound === 'number' ? first.totalFound : first.content.length;
  if (totalFound === 0) return null;

  const neededNorm = new Set([...(needed || [])].map((id) => id.toLowerCase()));
  const useIdProbe = neededNorm.size > 0 && (totalFound > 400 || neededNorm.size < totalFound);

  if (useIdProbe) {
    const live = new Set<string>();
    const ids = [...neededNorm];
    const concurrency = 10;
    for (let i = 0; i < ids.length; i += concurrency) {
      const slice = ids.slice(i, i + concurrency);
      const rows = await Promise.all(
        slice.map(async (id) => {
          const got = await fetchStatus(
            `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings/${id}`,
          );
          return { id, got };
        }),
      );
      for (const { id, got } of rows) {
        if (!got || got.status !== 404) live.add(id);
      }
    }
    return live;
  }

  const ids: string[] = first.content.map((j: any) => String(j.id));
  if (first.content.length < 100 || ids.length >= totalFound) return setOf(ids);
  let offset = 100;
  for (let pages = 1; pages < 80; pages++) {
    const data = await fetchJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings?limit=100&offset=${offset}&status=PUBLISHED`,
    );
    if (!data || !Array.isArray(data.content)) return null;
    ids.push(...data.content.map((j: any) => String(j.id)));
    if (data.content.length < 100 || ids.length >= totalFound) return setOf(ids);
    offset += 100;
  }
  return null;
}

async function livePinpoint(board: string): Promise<Set<string> | null> {
  const data = await fetchJson(`https://${board}.pinpointhq.com/postings.json`);
  if (!data || !Array.isArray(data.data)) return null;
  const ids: string[] = [];
  for (const j of data.data) {
    if (j.id) ids.push(String(j.id));
    for (const raw of [j.url, j.path, j.absolute_url]) {
      const uuid = String(raw || '').match(/postings\/([0-9a-f-]{8,})/i)?.[1];
      if (uuid) ids.push(uuid);
    }
  }
  return setOf(ids);
}

async function liveBreezy(board: string): Promise<Set<string> | null> {
  const data = await fetchJson(`https://${board}.breezy.hr/json`);
  if (!Array.isArray(data)) return null;
  const ids: string[] = [];
  for (const j of data) {
    const url = String(j.url || '');
    const slug = url.match(/\/p\/([^/?#]+)/i)?.[1];
    if (slug) ids.push(slug);
    if (j.id) ids.push(String(j.id));
    if (j._id) ids.push(String(j._id));
  }
  return setOf(ids);
}

async function liveRecruitee(board: string): Promise<Set<string> | null> {
  const data = await fetchJson(`https://${board}.recruitee.com/api/offers/?state=published`);
  if (!data || !Array.isArray(data.offers)) return null;
  const ids: string[] = [];
  for (const j of data.offers) {
    if (j.slug) ids.push(String(j.slug));
    const url = String(j.careers_url || '');
    const slug = url.match(/\/o\/([^/?#]+)/i)?.[1];
    if (slug) ids.push(slug);
  }
  return setOf(ids);
}

async function liveBamboo(board: string): Promise<Set<string> | null> {
  const data = await fetchJson(`https://${board}.bamboohr.com/careers/list`);
  if (data && Array.isArray(data.result)) return setOf(data.result.map((j: any) => j.id));
  return null;
}

async function livePersonio(board: string): Promise<Set<string> | null> {
  for (const host of [`${board}.jobs.personio.de`, `${board}.jobs.personio.com`]) {
    const got = await fetchText(`https://${host}/xml?language=en`);
    if (!got) continue;
    const ids = [...got.text.matchAll(/<id>(\d+)<\/id>/gi)].map((m) => m[1]);
    return setOf(ids);
  }
  return null;
}

async function liveTeamtailor(board: string): Promise<Set<string> | null> {
  const data = await fetchJson(`https://${board}.teamtailor.com/jobs.json`);
  if (data && Array.isArray(data.data)) return setOf(data.data.map((j: any) => j.id));
  if (data && Array.isArray(data.items)) {
    const ids: string[] = [];
    for (const j of data.items) {
      const url = String(j.url || '');
      const id = url.match(/\/jobs\/(\d+)/i)?.[1];
      if (id) ids.push(id);
    }
    return setOf(ids);
  }
  const rss = await fetchText(`https://${board}.teamtailor.com/jobs.rss`);
  if (rss) {
    const ids = [...rss.text.matchAll(/\/jobs\/(\d+)/gi)].map((m) => m[1]);
    return setOf(ids);
  }
  return null;
}

async function liveJobvite(board: string): Promise<Set<string> | null> {
  const data = await fetchJson(`https://jobs.jobvite.com/api/company/${board}/jobs`);
  if (data && Array.isArray(data.jobs)) {
    return setOf(data.jobs.map((j: any) => j.id || j.jobId));
  }
  return null;
}

const LIVE_FETCHERS: Record<AtsProvider, (board: string) => Promise<Set<string> | null>> = {
  greenhouse: liveGreenhouse,
  lever: liveLever,
  ashby: liveAshby,
  workable: liveWorkable,
  smartrecruiters: liveSmartRecruiters,
  pinpoint: livePinpoint,
  breezy: liveBreezy,
  recruitee: liveRecruitee,
  bamboohr: liveBamboo,
  personio: livePersonio,
  teamtailor: liveTeamtailor,
  jobvite: liveJobvite,
};

export async function fetchLiveJobIds(
  provider: AtsProvider,
  board: string,
  needed?: Set<string>,
): Promise<Set<string> | null> {
  if (!board) return null;
  if (provider === 'smartrecruiters') return liveSmartRecruiters(board, needed);
  return LIVE_FETCHERS[provider](board);
}

export function normalizeJobId(id: string): string {
  return String(id || '').trim().toLowerCase();
}
