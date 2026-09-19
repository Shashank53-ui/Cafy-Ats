const https = require('https');
https.get('https://logicallyai.bamboohr.com/careers/list', (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => console.log(raw.substring(0, 100)));
});
