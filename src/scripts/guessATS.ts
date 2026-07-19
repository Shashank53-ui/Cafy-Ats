import fs from 'fs';
import path from 'path';

// Known ATS endpoints to probe
const ENDPOINTS = [
    { provider: 'greenhouse', url: (slug: string) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs` },
    { provider: 'lever', url: (slug: string) => `https://api.lever.co/v0/postings/${slug}` },
    { provider: 'ashby', url: (slug: string) => `https://api.ashbyhq.com/posting-api/job-board/${slug}` }
];

function generateSlugs(name: string): string[] {
    const slugs = new Set<string>();
    
    let clean = name.toLowerCase()
        .replace(/limited|ltd|uc|dac|plc|inc|llp|gmbh|co\.|company/g, '')
        .replace(/ireland|uk|emea|europe/g, '')
        .replace(/[^a-z0-9]/g, '');

    if (clean) slugs.add(clean);

    let cleanWithIreland = name.toLowerCase()
        .replace(/limited|ltd|uc|dac|plc|inc|llp|gmbh|co\.|company/g, '')
        .replace(/[^a-z0-9]/g, '');

    if (cleanWithIreland && cleanWithIreland !== clean) slugs.add(cleanWithIreland);

    // Some companies just use first word
    const firstWord = name.toLowerCase().split(/[ \-]/)[0].replace(/[^a-z0-9]/g, '');
    if (firstWord && firstWord.length > 2) slugs.add(firstWord);

    return Array.from(slugs);
}

async function checkUrl(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (res.status === 200) {
            const data = await res.json().catch(() => null);
            // Verify it's actually an array of jobs or an object with jobs
            if (data && (Array.isArray(data) || Array.isArray(data.jobs) || Array.isArray(data.postings))) {
                return true;
            }
        }
    } catch (e) {
        // ignore
    }
    return false;
}

async function main() {
    console.log('Loading permits data...');
    const permitsPath = path.resolve(process.cwd(), 'data/ireland/raw/ireland-employment-permits-merged.json');
    const permitsData = JSON.parse(fs.readFileSync(permitsPath, 'utf8'));
    
    const employers = permitsData.employers
        .sort((a: any, b: any) => b.totalPermits - a.totalPermits)
        .slice(2000, 12000); // Next 10000 employers

    console.log(`Loaded next ${employers.length} employers.`);

    const foundATS: any[] = [];
    let processed = 0;

    const chunkSize = 50; // increased chunk size for speed
    for (let i = 0; i < employers.length; i += chunkSize) {
        const chunk = employers.slice(i, i + chunkSize);
        
        await Promise.all(chunk.map(async (emp: any) => {
            const name = emp.employerName;
            const slugs = generateSlugs(name);
            
            for (const slug of slugs) {
                for (const endpoint of ENDPOINTS) {
                    const url = endpoint.url(slug);
                    const exists = await checkUrl(url);
                    if (exists) {
                        foundATS.push({
                            'Company Name': name,
                            'ATS Provider': endpoint.provider,
                            'ATS Board Token': slug,
                        });
                        console.log(`[HIT] ${name} -> ${endpoint.provider} (${slug})`);
                        return; // Found one, stop checking other slugs/providers for this company
                    }
                }
            }
        }));

        processed += chunk.length;
        console.log(`Processed ${processed}/${employers.length} employers... Found: ${foundATS.length}`);
    }

    const outPath = path.resolve(process.cwd(), 'data/ireland/raw/ireland_guessed_ats_2.csv');
    const csvHeader = 'Company ID,Company Name,ATS Provider,ATS Board Token,URL\n';
    const csvLines = foundATS.map((a, i) => `999${i},"${a['Company Name']}",${a['ATS Provider']},${a['ATS Board Token']},`).join('\n');
    
    fs.writeFileSync(outPath, csvHeader + csvLines);
    console.log(`\nWrote ${foundATS.length} found ATS boards to ${outPath}`);
}

main().catch(console.error);
