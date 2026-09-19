const { isUKJob } = require('./src/lib/ukFilter');

const testCases = [
    { locations: ["London"], isRemote: false, isTrustedSource: false },
    { locations: ["Woking"], isRemote: false, isTrustedSource: false },
    { locations: ["Paris"], isRemote: false, isTrustedSource: false },
];

testCases.forEach(tc => {
    console.log(tc.locations[0], "->", isUKJob(tc));
});
