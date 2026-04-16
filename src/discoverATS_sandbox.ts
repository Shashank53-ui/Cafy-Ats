import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import dotenv from 'dotenv'
import path from 'path'
import * as cheerio from 'cheerio'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// ─── Clients ──────────────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// ─── Types ────────────────────────────────────────────────────────────────────
interface Company {
    id: string
    name: string
    website?: string | null
    linkedin_url?: string | null
}

interface Detection {
    ats_provider: string | null
    ats_board_token: string | null
    verified: boolean
    careers_url?: string | null
    confidence: 'high' | 'medium' | 'low' | 'none'
    notes?: string
    discovery_method?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const VALID_PROVIDERS = [
    'greenhouse', 'greenhouse_eu', 'lever', 'lever_eu', 'ashby',
    'workable', 'recruitee', 'smartrecruiters', 'teamtailor',
    'bamboohr', 'personio', 'jobvite', 'workday', 'oracle',
    'icims', 'custom', 'none',
]

const SUSPICIOUS_TOKENS = [
    'data', 'uk', 'jobs', 'careers', 'hire', 'work', 'team',
    'company', 'corp', 'ltd', 'group', 'solutions', 'services',
    'global', 'international', 'tech', 'digital', 'media',
]

const GENERIC_TOKENS = new Set([
    ...SUSPICIOUS_TOKENS,
    'www',
    'app',
    'careersite',
    'job',
])

const GEMINI_TIMEOUT = 60000
const CONCURRENCY = 8
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const FETCH_TIMEOUT = 10000

// ─── Logger ───────────────────────────────────────────────────────────────────
const ts = () => new Date().toTimeString().slice(0, 8)
const log = {
    info:  (m: string) => console.log(`[${ts()}]         ${m}`),
    ok:    (m: string) => console.log(`[${ts()}] ✅      ${m}`),
    warn:  (m: string) => console.log(`[${ts()}] ⚠️       ${m}`),
    block: (m: string) => console.log(`[${ts()}] ✗ BLOCK  ${m}`),
    done:  (company: string, provider: string, token: string, verified: boolean, confidence: string) =>
        console.log(`[${ts()}] ✔ DONE   ${company} → ${provider}/${token} [verified:${verified} conf:${confidence}]`),
}

// ─── Utilities ────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function normalizeWebsiteUrl(raw?: string | null): string | null {
    if (!raw) return null
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
        return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`).toString()
    } catch {
        return null
    }
}

function normalizeTokenSlug(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function isGenericToken(token?: string | null): boolean {
    if (!token) return true
    const normalized = normalizeTokenSlug(token)
    if (!normalized) return true
    return GENERIC_TOKENS.has(normalized)
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
    let done = false
    const result = await Promise.race([
        promise.catch(() => null).then(v => { done = true; return v }),
        sleep(ms).then(() => null as T | null),
    ])
    if (!done && result === null) log.warn(`Timeout after ${ms}ms: ${label}`)
    return result
}

// ─── Token variants ───────────────────────────────────────────────────────────
// Generate likely token slugs from a company name and website
function tokenVariants(name: string, website?: string | null): string[] {
    const variants = new Set<string>()

    // From company name
    const lower = name.toLowerCase()
    const noSpaces = normalizeTokenSlug(lower.replace(/\s+/g, ''))
    const hyphenated = normalizeTokenSlug(lower.replace(/\s+/g, '-'))
    const camel = normalizeTokenSlug(name.replace(/\s+(.)/g, (_, c) => c.toUpperCase()).replace(/^./, c => c.toUpperCase()).replace(/\s/g, ''))
    const firstWord = lower.split(/\s+/)[0]

    variants.add(noSpaces)          // "hitachisolutions"
    variants.add(hyphenated)        // "hitachi-solutions"
    variants.add(camel)             // "HitachiSolutions"
    variants.add(normalizeTokenSlug(firstWord))         // "hitachi"
    variants.add(normalizeTokenSlug(name.replace(/\s/g, '')))  // original case no spaces

    // From website domain
    if (website) {
        try {
            const normalized = normalizeWebsiteUrl(website)
            if (!normalized) throw new Error('invalid website')
            const hostname = new URL(normalized).hostname.replace(/^www\./, '')
            const domainRoot = hostname.split('.')[0]
            variants.add(normalizeTokenSlug(domainRoot))      // "deliveroo"
            variants.add(normalizeTokenSlug(domainRoot.charAt(0).toUpperCase() + domainRoot.slice(1))) // "Deliveroo"
        } catch { /* skip */ }
    }

    // Remove very short or generic tokens
    return [...variants].filter(v => v.length > 2 && !SUSPICIOUS_TOKENS.includes(v.toLowerCase()))
}

// ─── ATS URL matcher ──────────────────────────────────────────────────────────
interface AtsMatch {
    provider: string
    token: string
    careersUrl: string
}

function matchAtsUrl(url: string): AtsMatch | null {
    try {
        const u = new URL(url)
        const host = u.hostname.toLowerCase()
        const parts = u.pathname.split('/').filter(Boolean)

        if (host === 'boards.greenhouse.io') {
            const embedToken = u.searchParams.get('for')
            if (embedToken && !isGenericToken(embedToken)) return { provider: 'greenhouse', token: embedToken, careersUrl: `https://boards.greenhouse.io/${embedToken}` }
            const t = parts[0]; return t && !isGenericToken(t) ? { provider: 'greenhouse', token: t, careersUrl: url } : null
        }
        if (host === 'job-boards.eu.greenhouse.io') {
            const t = parts[0]; return t && !isGenericToken(t) ? { provider: 'greenhouse_eu', token: t, careersUrl: url } : null
        }
        if (host === 'jobs.lever.co') {
            const t = parts[0]; return t && !isGenericToken(t) ? { provider: 'lever', token: t, careersUrl: url } : null
        }
        if (host === 'jobs.eu.lever.co') {
            const t = parts[0]; return t && !isGenericToken(t) ? { provider: 'lever_eu', token: t, careersUrl: url } : null
        }
        if (host === 'jobs.ashbyhq.com') {
            const t = parts[0]; return t && !isGenericToken(t) ? { provider: 'ashby', token: t, careersUrl: url } : null
        }
        if (host === 'apply.workable.com') {
            const t = parts[0]; return t && !isGenericToken(t) ? { provider: 'workable', token: t, careersUrl: url } : null
        }
        if (host.endsWith('.workable.com') && host !== 'apply.workable.com') {
            const token = host.split('.')[0]
            return !isGenericToken(token) ? { provider: 'workable', token, careersUrl: url } : null
        }
        if (host === 'careers.smartrecruiters.com') {
            const t = parts[0]; return t && !isGenericToken(t) ? { provider: 'smartrecruiters', token: t, careersUrl: url } : null
        }
        if (host.endsWith('.smartrecruiters.com') && host !== 'careers.smartrecruiters.com' && !host.startsWith('api.')) {
            const token = host.split('.')[0]
            return !isGenericToken(token) ? { provider: 'smartrecruiters', token, careersUrl: `https://careers.smartrecruiters.com/${token}` } : null
        }
        if (host.endsWith('.recruitee.com')) {
            const token = host.split('.')[0]
            return !isGenericToken(token) ? { provider: 'recruitee', token, careersUrl: url } : null
        }
        if (host.endsWith('.teamtailor.com')) {
            const token = host.split('.')[0]
            return !isGenericToken(token) ? { provider: 'teamtailor', token, careersUrl: url } : null
        }
        if (host.endsWith('.bamboohr.com')) {
            const token = host.split('.')[0]
            return !isGenericToken(token) ? { provider: 'bamboohr', token, careersUrl: url } : null
        }
        if (host.endsWith('.jobs.personio.com') || host.endsWith('.jobs.personio.de')) {
            const token = host.split('.')[0]
            return !isGenericToken(token) ? { provider: 'personio', token, careersUrl: url } : null
        }
        if (host.endsWith('.myworkdayjobs.com') && host !== 'www.myworkdayjobs.com' && host !== 'myworkdayjobs.com') {
            const site = parts[0]
            if (!site) return null
            return { provider: 'workday', token: `${u.protocol}//${u.host}/${site}`, careersUrl: url }
        }
        if (host.endsWith('.taleo.net') || (host.endsWith('.oraclecloud.com') && u.pathname.includes('hcmUI'))) {
            return { provider: 'oracle', token: `${u.protocol}//${u.host}`, careersUrl: url }
        }
        if (host.endsWith('.icims.com')) {
            return { provider: 'icims', token: `${u.protocol}//${u.host}`, careersUrl: url }
        }
        return null
    } catch { return null }
}

async function fetchHtml(url: string): Promise<{ finalUrl: string; html: string } | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
            redirect: 'follow',
        })
        if (!res.ok) return null
        const html = await res.text().catch(() => '')
        return { finalUrl: res.url || url, html }
    } catch {
        return null
    }
}

function extractCandidateUrls(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html)
    const urls = new Set<string>()

    const pushUrl = (raw?: string | null): void => {
        if (!raw) return
        const trimmed = raw.trim()
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return
        try {
            const normalized = new URL(trimmed, baseUrl).toString()
            urls.add(normalized)
        } catch {
            // skip bad URL
        }
    }

    $('a[href]').each((_, el) => pushUrl($(el).attr('href')))
    $('iframe[src], script[src], link[href]').each((_, el) => {
        pushUrl($(el).attr('src') || $(el).attr('href'))
    })

    // Include raw HTML for escaped URLs (some ATS embeds appear only in JS config)
    const rawUrlRegex = /https?:\/\/[^\s"'<>]+/gi
    for (const m of html.match(rawUrlRegex) || []) {
        pushUrl(m)
    }

    return [...urls]
}

async function detectFromWebsite(company: Company): Promise<AtsMatch | null> {
    const home = normalizeWebsiteUrl(company.website)
    if (!home) return null

    const baseCandidates = new Set<string>([
        home,
        new URL('/careers', home).toString(),
        new URL('/jobs', home).toString(),
    ])

    for (const candidate of baseCandidates) {
        const fetched = await fetchHtml(candidate)
        if (!fetched) continue

        const direct = matchAtsUrl(fetched.finalUrl)
        if (direct) return direct

        const urls = extractCandidateUrls(fetched.html, fetched.finalUrl)
        for (const u of urls) {
            const hit = matchAtsUrl(u)
            if (hit) return hit
        }
    }

    return null
}

// ─── Layer 1: Direct ATS API probing ─────────────────────────────────────────
// Checks each ATS API with likely token variants. Returns on first confirmed hit.
async function probeAtsApis(company: Company): Promise<AtsMatch | null> {
    const tokens = tokenVariants(company.name, company.website)

    // Only probe ATS platforms where the API response is company-specific
    // (i.e. returns 404 for non-existent boards, not just a generic subdomain 200).
    // TeamTailor, BambooHR, Recruitee, Personio use subdomains — any slug returns 200
    // making it impossible to tell if it's the right company. Use Gemini for those.
    for (const token of tokens) {
        const checks = await Promise.all([
            checkAshby(token),
            checkGreenhouse(token),
            checkGreenhouseEu(token),
            checkLever(token),
            checkWorkable(token),
            checkSmartRecruiters(token),
        ])

        const hit = checks.find(c => c !== null)
        if (hit) return hit
    }

    return null
}

async function httpOk(url: string, options?: RequestInit): Promise<boolean> {
    try {
        const res = await fetch(url, {
            ...options,
            headers: { 'User-Agent': UA, ...(options?.headers ?? {}) },
            signal: AbortSignal.timeout(6000),
            redirect: 'follow',
        })
        return res.ok
    } catch { return false }
}

async function checkAshby(token: string): Promise<AtsMatch | null> {
    // Ashby public API: returns job board info if token exists
    const ok = await httpOk(`https://api.ashbyhq.com/posting-api/job-board/${token}`)
    if (ok) return { provider: 'ashby', token, careersUrl: `https://jobs.ashbyhq.com/${token}` }
    return null
}

async function checkGreenhouse(token: string): Promise<AtsMatch | null> {
    const ok = await httpOk(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`)
    if (ok) return { provider: 'greenhouse', token, careersUrl: `https://boards.greenhouse.io/${token}` }
    return null
}

async function checkGreenhouseEu(token: string): Promise<AtsMatch | null> {
    const ok = await httpOk(`https://job-boards.eu.greenhouse.io/${token}`)
    if (ok) return { provider: 'greenhouse_eu', token, careersUrl: `https://job-boards.eu.greenhouse.io/${token}` }
    return null
}

async function checkLever(token: string): Promise<AtsMatch | null> {
    const ok = await httpOk(`https://api.lever.co/v0/postings/${token}?mode=json`)
    if (ok) return { provider: 'lever', token, careersUrl: `https://jobs.lever.co/${token}` }
    return null
}

async function checkWorkable(token: string): Promise<AtsMatch | null> {
    try {
        const res = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${token}`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(6000),
        })
        if (!res.ok) return null

        const j = await res.json().catch(() => null)
        const account = j?.account
        const subdomain = (account?.subdomain || '').toString().trim()

        if (subdomain && !isGenericToken(subdomain)) {
            return { provider: 'workable', token: normalizeTokenSlug(subdomain), careersUrl: `https://apply.workable.com/${normalizeTokenSlug(subdomain)}/` }
        }

        if (!isGenericToken(token)) {
            return { provider: 'workable', token, careersUrl: `https://apply.workable.com/${token}/` }
        }
    } catch {
        // skip
    }
    return null
}

async function checkSmartRecruiters(token: string): Promise<AtsMatch | null> {
    try {
        const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${token}`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(6000),
        })
        // 200 + has identifier = real company. 404 = not found.
        if (res.ok) {
            const j = await res.json().catch(() => null)
            if (j?.identifier) return { provider: 'smartrecruiters', token: j.identifier, careersUrl: `https://careers.smartrecruiters.com/${j.identifier}` }
        }
    } catch { /* skip */ }
    return null
}


// ─── Layer 2: Gemini Google Search ────────────────────────────────────────────
function buildGeminiPrompt(company: Company): string {
    return `Find the ATS job board for this company.

Company: ${company.name}
Website: ${company.website ?? 'unknown'}

Search: "${company.name} site:jobs.ashbyhq.com OR site:boards.greenhouse.io OR site:job-boards.eu.greenhouse.io OR site:jobs.lever.co OR site:jobs.eu.lever.co OR site:apply.workable.com OR site:careers.smartrecruiters.com OR site:myworkdayjobs.com OR site:bamboohr.com OR site:recruitee.com OR site:teamtailor.com OR site:personio.com"

Also search: "${company.name} careers workday oracle icims taleo"

Return the ATS URL and provider you find. Token = the slug from the URL path (or full URL for workday/oracle/icims/custom).

Providers:
  jobs.ashbyhq.com/{token}                  → ashby
  boards.greenhouse.io/{token}              → greenhouse
  job-boards.eu.greenhouse.io/{token}       → greenhouse_eu
  jobs.lever.co/{token}                     → lever
  jobs.eu.lever.co/{token}                  → lever_eu
  apply.workable.com/{token}                → workable
  {token}.workable.com                      → workable
  careers.smartrecruiters.com/{token}       → smartrecruiters
  {token}.recruitee.com                     → recruitee
  {token}.teamtailor.com                    → teamtailor
  {token}.bamboohr.com                      → bamboohr
  {token}.jobs.personio.com                 → personio
  {tenant}.wd{N}.myworkdayjobs.com/{SITE}   → workday (token = FULL URL e.g. https://company.wd3.myworkdayjobs.com/Careers, MUST have tenant subdomain)
  *.taleo.net / *.oraclecloud.com/hcmUI     → oracle (token = full URL)
  *.icims.com                               → icims (token = full URL)
  only careers on own domain               → custom (token = full careers URL)
  nothing found                            → none

Return ONLY valid JSON:
{"ats_provider":"...","ats_board_token":"...","verified":true,"careers_url":"...","confidence":"high","notes":""}`
}

async function geminiDetection(company: Company): Promise<Detection | null> {
    const p = (async () => {
        try {
            const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                tools: [{ googleSearch: {} } as any],
            })
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: buildGeminiPrompt(company) }] }],
            })
            const text = result.response.text()
            if (!text?.trim()) return null

            const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
            const jsonMatch = clean.match(/\{[\s\S]*\}/)
            if (!jsonMatch) return null

            let parsed: any
            try { parsed = JSON.parse(jsonMatch[0]) } catch { return null }

            const provider = parsed.ats_provider ?? null
            let token = parsed.ats_board_token ?? null

            // If Gemini returned a full ATS URL as the token, extract the slug
            if (token?.startsWith('http') && provider && !['workday', 'oracle', 'icims', 'custom'].includes(provider)) {
                const m = matchAtsUrl(token)
                if (m) token = m.token
            }

            return {
                ats_provider:     provider,
                ats_board_token:  token,
                verified:         parsed.verified   ?? false,
                careers_url:      parsed.careers_url ?? null,
                confidence:       parsed.confidence  ?? 'none',
                notes:            parsed.notes       ?? '',
                discovery_method: 'gemini_search',
            } as Detection
        } catch (err: any) {
            log.warn(`Gemini error for ${company.name}: ${err?.message ?? String(err)}`)
            return null
        }
    })()
    return withTimeout(p, GEMINI_TIMEOUT, `Gemini for ${company.name}`)
}

// ─── Main discovery pipeline ──────────────────────────────────────────────────
async function discoverAts(company: Company): Promise<Detection | null> {

    // Layer 1: Probe ATS APIs directly with token variants — fast & accurate
    log.info(`   L1: probing ATS APIs...`)
    const probe = await withTimeout(probeAtsApis(company), 20000, `probe for ${company.name}`)
    if (probe) {
        log.info(`   L1 hit: ${probe.provider}/${probe.token}`)
        return {
            ats_provider:     probe.provider,
            ats_board_token:  probe.token,
            verified:         true,
            careers_url:      probe.careersUrl,
            confidence:       'high',
            discovery_method: 'api_probe',
        }
    }

    // Layer 2: Crawl company pages for embedded ATS URLs
    log.info(`   L2: website crawl...`)
    const crawl = await withTimeout(detectFromWebsite(company), 15000, `crawl for ${company.name}`)
    if (crawl) {
        log.info(`   L2 hit: ${crawl.provider}/${crawl.token}`)
        return {
            ats_provider:     crawl.provider,
            ats_board_token:  crawl.token,
            verified:         true,
            careers_url:      crawl.careersUrl,
            confidence:       'high',
            discovery_method: 'website_crawl',
        }
    }

    // Layer 3: Gemini Google Search — catches unusual tokens, workday, oracle, icims
    log.info(`   L3: Gemini search...`)
    const gemini = await geminiDetection(company)
    if (gemini) return gemini

    return null
}

// ─── Validation Guard ─────────────────────────────────────────────────────────
function shouldWriteToDB(result: Detection, companyName: string): boolean {
    if (result.ats_provider === 'unknown') {
        log.block(`"unknown" provider for ${companyName}`); return false
    }
    if (result.ats_provider && !VALID_PROVIDERS.includes(result.ats_provider)) {
        log.block(`"${result.ats_provider}" not in valid providers for ${companyName}`); return false
    }
    if (!result.verified) {
        log.block(`verified:false for ${companyName}`); return false
    }
    if (!result.ats_provider || result.ats_provider === 'none') {
        if (!result.careers_url) {
            log.block(`none result with no careers_url for ${companyName}`); return false
        }
    }
    if (result.ats_provider && result.ats_provider !== 'none') {
        if (!result.ats_board_token) {
            log.block(`provider "${result.ats_provider}" but no token for ${companyName}`); return false
        }
        if (result.ats_provider === 'custom' && !result.ats_board_token.startsWith('http')) {
            log.block(`custom token must be a full URL for ${companyName}`); return false
        }
    }
    if (result.ats_board_token && result.ats_board_token.length <= 2) {
        log.block(`token "${result.ats_board_token}" too short for ${companyName}`); return false
    }
    if (result.ats_board_token && isGenericToken(result.ats_board_token)) {
        log.block(`token "${result.ats_board_token}" is a generic word for ${companyName}`); return false
    }
    if (result.verified && result.confidence === 'none') {
        log.block(`verified:true but confidence:none for ${companyName}`); return false
    }
    if (result.ats_provider === 'workday') {
        if (!result.ats_board_token?.startsWith('http')) {
            log.block(`Workday token must be full URL for ${companyName}`); return false
        }
        if (!result.ats_board_token.includes('myworkdayjobs.com')) {
            log.block(`Workday token must contain myworkdayjobs.com for ${companyName}`); return false
        }
        try {
            const h = new URL(result.ats_board_token).hostname
            if (h === 'www.myworkdayjobs.com' || h === 'myworkdayjobs.com') {
                log.block(`Workday token has no tenant subdomain for ${companyName}`); return false
            }
        } catch { /* fall through */ }
    }
    if (['oracle', 'icims'].includes(result.ats_provider ?? '') && !result.ats_board_token?.startsWith('http')) {
        log.block(`${result.ats_provider} token must be full URL for ${companyName}`); return false
    }
    return true
}

// ─── Write to Supabase ────────────────────────────────────────────────────────
async function writeToSupabase(company: Company, detection: Detection): Promise<void> {
    const { error } = await supabase
        .from('dummy_companies')
        .update({
            ats_provider:    detection.ats_provider,
            ats_board_token: detection.ats_board_token ?? null,
        })
        .eq('id', company.id)

    if (error) {
        log.warn(`Supabase write failed for ${company.name}: ${error.message}`)
    } else {
        log.ok(`Written: ${company.name} → ${detection.ats_provider}/${detection.ats_board_token}`)
    }
}

// ─── Process one company ──────────────────────────────────────────────────────
async function processCompany(company: Company): Promise<void> {
    log.info(`Processing: ${company.name}`)

    const detection = await discoverAts(company)
    if (!detection) {
        log.warn(`No result for ${company.name}`)
        return
    }

    log.done(
        company.name,
        detection.ats_provider ?? 'none',
        detection.ats_board_token ?? '',
        detection.verified,
        detection.confidence
    )

    if (!shouldWriteToDB(detection, company.name)) {
        log.info(`   → Not written (failed validation)`)
        return
    }

    if (company.id === 'test') {
        log.info('   → Test mode: skipping DB write')
        return
    }

    await writeToSupabase(company, detection)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    const args = process.argv.slice(2)

    if (args[0] === '--single' && args[1]) {
        const company: Company = { id: 'test', name: args[1], website: args[2] ?? undefined }
        log.info(`Single test: "${company.name}"`)
        await processCompany(company)
        return
    }

    log.info('Loading companies from Supabase...')

    let allCompanies: Company[] = []
    let from = 0
    const PAGE = 1000

    while (true) {
        const { data, error } = await supabase
            .from('dummy_companies')
            .select('id, trading_name, url, url_linkedin')
            .is('ats_provider', null)
            .range(from, from + PAGE - 1)

        if (error) { log.warn(`Supabase load error: ${error.message}`); break }
        if (!data || data.length === 0) break

        allCompanies.push(...data.map((r: any) => ({
            id:           r.id,
            name:         r.trading_name,
            website:      r.url          ?? null,
            linkedin_url: r.url_linkedin ?? null,
        })))

        if (data.length < PAGE) break
        from += PAGE
    }

    log.info(`Loaded ${allCompanies.length} companies`)

    let processed = 0
    for (let i = 0; i < allCompanies.length; i += CONCURRENCY) {
        const batch = allCompanies.slice(i, i + CONCURRENCY)
        await Promise.all(batch.map(async (company) => {
            await processCompany(company)
            processed++
            if (processed % 25 === 0) log.info(`Progress: ${processed}/${allCompanies.length}`)
        }))
    }

    const { data: stillNull } = await supabase
        .from('dummy_companies')
        .select('trading_name, url, url_linkedin')
        .is('ats_provider', null)

    if (stillNull && stillNull.length > 0) {
        const csv = [
            'name,website,linkedin_url',
            ...stillNull.map((c: any) =>
                `"${c.trading_name}","${c.url ?? ''}","${c.url_linkedin ?? ''}"`
            ),
        ].join('\n')
        fs.writeFileSync('needs_manual_review.csv', csv)
        log.info(`${stillNull.length} companies need manual review → needs_manual_review.csv`)
    }

    log.ok(`Done. Processed ${processed} companies.`)
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1) })
