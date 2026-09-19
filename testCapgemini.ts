import { fetchCustom } from './src/scripts/customScrapers'; async function run() { console.log(await fetchCustom('https://careers.capgemini.com/', {id: 1774, name: 'Capgemini'} as any)); } run();
