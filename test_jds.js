const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function testAmpa() {
    console.log("Testing Ampa...");
    try {
        const data = await fetchUrl('https://careers.ampa.co.uk/postings.json');
        const json = JSON.parse(data);
        const first = json.data[0];
        console.log("Ampa keys:", Object.keys(first || {}));
        if(first && first.description) console.log("Ampa has description!");
    } catch(e) { console.error(e.message); }
}

async function testSerco() {
    console.log("Testing Serco...");
    try {
        const data = await fetchUrl('https://careers.serco.com/gb/en/search-results?from=0&s=1');
        const match = data.match(/"eagerLoadRefineSearch"\s*:\s*(\{[\s\S]*?\})\s*,\s*"jobwidgetsettings"/);
        if(match) {
            const json = JSON.parse(match[1]);
            const first = json.data.jobs[0];
            console.log("Serco keys:", Object.keys(first || {}));
            if(first && first.description) console.log("Serco has description!");
        }
    } catch(e) { console.error(e.message); }
}

async function testSumup() {
    console.log("Testing Sumup HTML...");
    // Just html, we'd need page scrape.
    console.log("Sumup is HTML list, usually requires detail page.");
}

async function run() {
    await testAmpa();
    await testSerco();
    await testSumup();
}
run();
