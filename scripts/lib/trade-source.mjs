export const tradeSourceGroups = [
  [2, 'food', 'Farm, fishing and intermediate food products'],
  [3, 'energy', 'Energy products'], [4, 'raw_materials', 'Metal ores and non-metallic minerals'],
  [5, 'industrial_goods', 'Metal and non-metallic mineral products'],
  [6, 'chemicals_pharmaceuticals', 'Basic and industrial chemical, plastic and rubber products'],
  [7, 'industrial_goods', 'Forestry products and building and packaging materials'],
  [8, 'capital_goods', 'Industrial machinery, equipment and parts'],
  [9, 'electronics', 'Electronic and electrical equipment and parts'],
  [10, 'transport_equipment', 'Motor vehicles and parts'],
  [11, 'transport_equipment', 'Aircraft and other transportation equipment and parts'],
  [12, 'consumer_goods', 'Consumer goods'], [13, 'unclassified_goods', 'Special transactions trade'],
];
export const tradeSourcePartners = [[2, 'USA', 'United States'], [3, 'CHN', 'China'], [5, 'GBR', 'United Kingdom']];
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function validateInput(input, retrievedAt) {
  for (const field of ['publisher', 'dataset', 'url', 'licence', 'attribution', 'limitation'])
    if (typeof input[field] !== 'string' || !input[field].trim()) throw new Error(`Missing historical source ${field}.`);
  if (!validDate(input.referenceDate) || !validDate(input.retrievedAt) || input.referenceDate !== '2024-12-31'
    || input.retrievedAt !== retrievedAt || input.referenceDate > input.retrievedAt
    || input.publishedOn !== null && (!validDate(input.publishedOn) || input.publishedOn > input.retrievedAt)) throw new Error('Invalid historical input reference/publication/retrieval chronology.');
}
export function normalizeTradeSnapshot(snapshot, registry) {
  const { rows, source, fxSource, retrievedAt, fx } = snapshot;
  const input = { publisher: 'Bank of Canada', publishedOn: null, ...fxSource };
  validateInput({ publishedOn: null, ...source }, retrievedAt); validateInput(input, retrievedAt);
  if (!source.licence.includes('https://www.statcan.gc.ca/en/terms-conditions/open-licence')
    || !input.licence.includes('https://www.bankofcanada.ca/terms/')
    || input.publishedOn !== null || !input.limitation.includes('prospective purchasers')) throw new Error('Source licence/publication/pre-sale attribution changed: requires review.');
  if (rows.length !== 72 || retrievedAt !== '2026-10-03' || fx.observations.length !== 1
    || fx.observations[0].d !== '2024-01-01' || fx.observations[0].FXAUSDCAD.v !== '1.3698') throw new Error('Trade source/FX envelope changed: requires review.');
  const countryId = iso => {
    const matches = registry.countries.filter(c => c.externalIds.isoAlpha3 === iso);
    if (matches.length !== 1) throw new Error(`Ambiguous permanent Country mapping for ${iso}`);
    return matches[0].id;
  };
  const grouped = new Map(), seenCoordinates = new Set(), seenVectors = new Set();
  for (const r of rows) {
    const group = tradeSourceGroups.find(([member, category, name]) => r.category === category && r.name === name
      && r.coordinate.split('.')[2] === String(member));
    const partner = tradeSourcePartners.find(([member, iso]) => r.iso === iso && r.coordinate.split('.')[3] === String(member));
    if (!group || !partner || ![1, 2].includes(r.trade) || r.productId !== 12100175
      || r.coordinate !== `1.${r.trade}.${group[0]}.${partner[0]}.0.0.0.0.0.0`
      || seenCoordinates.has(r.coordinate) || seenVectors.has(r.vectorId) || !Number.isSafeInteger(r.vectorId)
      || r.points.length !== 12 || new Set(r.points.map(p => p.refPer)).size !== 12
      || r.points.some(p => !/^2024-(0[1-9]|1[0-2])-01$/.test(p.refPer)
        || p.statusCode !== 0 || p.securityLevelCode !== 0 || p.scalarFactorCode !== 3 || p.frequencyCode !== 6
        || !Number.isSafeInteger(p.value) || p.value < 0 || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(p.releaseTime)
        || !validDate(p.releaseTime.slice(0, 10)) || p.refPer > p.releaseTime.slice(0, 10)
        || p.releaseTime.slice(0, 10) > retrievedAt)) throw new Error(`Missing, suppressed, duplicated or mismapped historical trade row ${r.coordinate}`);
    seenCoordinates.add(r.coordinate); seenVectors.add(r.vectorId);
    const key = `${r.iso}:${r.trade}:${r.category}`;
    const g = grouped.get(key) ?? { iso: r.iso, trade: r.trade, category: r.category, vectors: [], value: 0n, publicationDates: [] };
    g.vectors.push(r.vectorId);
    for (const p of r.points) { g.value += BigInt(p.value) * 1000n; g.publicationDates.push(p.releaseTime.slice(0, 10)); }
    grouped.set(key, g);
  }
  return [...grouped.values()].map(g => {
    const originalAnnualValue = Number(g.value), annualValueUsd = Number((g.value * 10000n + 6849n) / 13698n);
    if (!Number.isSafeInteger(originalAnnualValue) || !Number.isSafeInteger(annualValueUsd)) throw new Error('Unsafe annual trade normalization.');
    const publication = g.publicationDates.sort().at(-1);
    return { id: `statcan.2024.${g.iso}.${g.trade}.${g.category}`,
      exporterId: countryId(g.trade === 1 ? g.iso : 'CAN'), importerId: countryId(g.trade === 1 ? 'CAN' : g.iso),
      category: g.category, annualValueUsd, originalCurrency: 'CAD', originalAnnualValue,
      temporalStatus: 'historical_prior', coverage: 'partial', availableOn: retrievedAt,
      inputs: [input],
      source: { ...source, status: 'derived', publishedOn: publication,
        transformation: `Sum all twelve 2024 months for vectors ${g.vectors.join(',')} in thousand CAD, multiply by1000, combine disjoint NAPCS groups, divide by annual average1.3698CAD/USD using BigInt half-up rounding. Trade revision published ${publication}; complete transformed evidence is conservatively government-accessible only at retrieval.`,
        synthetic: false } };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
