import fs from 'fs';
import path from 'path';

const jsonPath = path.resolve(process.cwd(), 'companies.json');
const outPath = path.resolve(process.cwd(), 'data/csv/companies_json_ats.csv');

try {
    const content = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(content);
    
    // Sometimes it's { data: { companies: [...] } } or just an array
    const companies = Array.isArray(data) ? data : (data.data?.companies || []);
    
    console.log(`Loaded ${companies.length} companies from companies.json`);
    
    const atsCompanies = companies.filter((c: any) => c.ats_provider && c.ats_board_token);
    console.log(`Found ${atsCompanies.length} companies with ATS provider in companies.json`);
    
    if (atsCompanies.length > 0) {
        let csv = 'Company ID,Company Name,ATS Provider,ATS Board Token\n';
        for (const c of atsCompanies) {
            csv += `"${c.id}","${c.trading_name || c.companies_house_name || ''}","${c.ats_provider}","${c.ats_board_token}"\n`;
        }
        fs.writeFileSync(outPath, csv);
        console.log(`Wrote to ${outPath}`);
    }
} catch (e) {
    console.error('Error parsing JSON:', e);
}
