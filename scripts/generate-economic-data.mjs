import { readFileSync, writeFileSync } from 'node:fs';
import { buildEconomicArtifacts, stableJson } from './economic-model.mjs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const result = buildEconomicArtifacts({ countries: read('src/data/entity-registry.json').countries, regions: read('src/data/region-registry.json').regions, countryFacts: read('src/data/country-facts.json').countries, demographics: read('src/data/region-demographics.json').records });
writeFileSync('src/data/region-economic-baselines.json', stableJson(result.baselines)); writeFileSync('src/data/economic-coverage-report.json', stableJson(result.coverage));
console.log(`Generated ${result.baselines.records.length} Region economic records.`);
