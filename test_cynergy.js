const https = require('https');
https.get('https://careers.cynergybank.co.uk/jobs.json', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const json = JSON.parse(data);
        if (json.items[0]) {
            console.log(json.items[0].content_html.substring(0, 300));
        }
    });
});
