const cheerio = require('cheerio');
const fetchWithTimeout = async (url, opts) => fetch(url, opts);
function cleanInlineJD(rawHtmlOrText) {
    if (!rawHtmlOrText || typeof rawHtmlOrText !== 'string') return undefined;
    if (rawHtmlOrText.trim().length < 300) return undefined;
    if (rawHtmlOrText.includes('<') && rawHtmlOrText.includes('>')) {
        const $ = cheerio.load(rawHtmlOrText);
        $('script, style, iframe, noscript, svg, nav, footer, header').remove();
        const cleanText = $.text().replace(/\s+/g, ' ').trim();
        if (cleanText.length < 300) return undefined;
        return $('body').html()?.trim() || undefined;
    }
    return rawHtmlOrText.trim();
}

async function fetchCapgemini() {
    const jobs = [];
    const targetUrl = `https://cg-jobstream-api.azurewebsites.net/api/job-search?country_code=en-gb%2Cgb-en%2Cen-gb%2Cgb-en&page=1&size=500`;
    const res = await fetchWithTimeout(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        }
    });
    const result = await res.json();
    const items = result.data || [];
    for (const job of items) {
        if (job.title && (job.apply_job_url || job.wp_url)) {
            jobs.push({
                title: job.title,
                url: job.apply_job_url || job.wp_url,
                description: cleanInlineJD(job.job_description || job.description)
            });
        }
    }
    console.log("Jobs logic found:", jobs.length);
    console.log("First job JD length:", jobs[0]?.description?.length);
}
fetchCapgemini();
