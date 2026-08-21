# Sector golden set

## How to label

1. Open `sector_golden_set.csv` in Excel / Google Sheets.
2. Fill **expected_sector** with exactly one of:

- `Business & Strategy`
- `Construction & Infrastructure`
- `Customer Success`
- `Data`
- `Design`
- `Engineering (Hardware)`
- `Engineering (Other)`
- `Engineering (Software)`
- `Finance`
- `Healthcare`
- `Healthcare & Social Care`
- `HR / People`
- `Legal`
- `Logistics & Transport`
- `Marketing & PR`
- `Media & Journalism`
- `Operations`
- `Other`
- `Pharmaceutical`
- `Product Management`
- `Project Management`
- `Research (Non-technical)`
- `Research (Technical)`
- `Retail & Hospitality`
- `Sales & Partnerships`

3. Leave blank only if you cannot decide (skipped when scoring).
4. Score:

```bash
npx tsx src/scripts/scoreSectorGoldenSet.ts
npx tsx src/scripts/scoreSectorGoldenSet.ts --refresh-db
```

Aim for **≥95%** hybrid accuracy on labeled rows (toward 99% on clear titles).
