const https = require('https');
function test(size) {
    console.time('fetch');
    const start = Date.now();
    fetch(`https://cg-jobstream-api.azurewebsites.net/api/job-search?country_code=en-gb&page=1&size=${size}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    }).then(r => r.json()).then(d => {
        console.timeEnd('fetch');
        console.log(`Size ${size} fetched ${d.data?.length} jobs. JD length: ${d.data?.[0]?.description?.length} `);
    }).catch(e => {
        console.log(`Failed at size ${size}:`, e.message);
    });
}
test(10);
