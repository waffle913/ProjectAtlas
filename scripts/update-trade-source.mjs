import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeTradeSnapshot, tradeSourceGroups as groups, tradeSourcePartners as partners } from './lib/trade-source.mjs';

const retrievedAt = '2026-10-03';
const api = 'https://www150.statcan.gc.ca/t1/wds/rest/';
const registry = JSON.parse(await readFile('src/data/entity-registry.json', 'utf8'));
const previous = JSON.parse(await readFile('src/data/trade-observations.json', 'utf8'));
const request = async (url, body) => {
  const response = await fetch(url, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
};
const metadata = (await request(`${api}getCubeMetadata`, [{ productId: 12100175 }]))[0];
if (metadata.status !== 'SUCCESS' || metadata.object.productId !== '12100175') throw new Error('Unexpected Statistics Canada cube');
const codes = await request(`${api}getCodeSets`);
if (codes.status !== 'SUCCESS' || !codes.object.scalar.some(s => s.scalarFactorCode === 3 && s.scalarFactorDescEn === 'thousands')) throw new Error('Unexpected scalar codes');
const currencyUnit = codes.object.unitOfMeasure?.find(u => u.memberUomCode === 81 || u.unitOfMeasureCode === 81);
for (const [memberId, , name] of groups) {
  if (!metadata.object.dimension[2].member.some(m => m.memberId === memberId && m.memberNameEn === name && m.parentMemberId === 1)) throw new Error(`Changed NAPCS group ${memberId}`);
}
for (const [memberId, , name] of partners) {
  if (!metadata.object.dimension[3].member.some(m => m.memberId === memberId && m.memberNameEn === name)) throw new Error(`Changed trading partner ${memberId}`);
}
const coordinates = partners.flatMap(([partner, iso]) => [1, 2].flatMap(trade =>
  groups.map(([member, category, name]) => ({
    productId: 12100175, coordinate: `1.${trade}.${member}.${partner}.0.0.0.0.0.0`,
    iso, trade, category, name,
  }))));
const info = await request(`${api}getSeriesInfoFromCubePidCoord`, coordinates.map(({ productId, coordinate }) => ({ productId, coordinate })));
if (info.length !== coordinates.length || info.some(r => r.status !== 'SUCCESS' || r.object.scalarFactorCode !== 3 || r.object.memberUomCode !== 81 || r.object.frequencyCode !== 6)) throw new Error('Invalid national trade series metadata');
const vectors = info.map(r => r.object.vectorId);
const vectorUrl = `${api}getDataFromVectorByReferencePeriodRange?vectorIds=${vectors.map(v => `%22${v}%22`).join(',')}&startRefPeriod=2024-01-01&endReferencePeriod=2024-12-01`;
const data = await request(vectorUrl);
const fxUrl = 'https://www.bankofcanada.ca/valet/observations/FXAUSDCAD/json?start_date=2024-01-01&end_date=2024-12-31';
const fx = await request(fxUrl);
if (fx.observations.length !== 1 || fx.observations[0].d !== '2024-01-01' || fx.observations[0].FXAUSDCAD.v !== '1.3698') throw new Error('Changed annual FX observation: requires review');
const rows = coordinates.map(c => {
  const series = data.find(r => r.status === 'SUCCESS' && r.object.coordinate === c.coordinate)?.object;
  if (!series || series.vectorDataPoint.length !== 12) throw new Error(`Incomplete historical series ${c.coordinate}`);
  const points = series.vectorDataPoint;
  if (new Set(points.map(p => p.refPer)).size !== 12 || points.some(p =>
    !/^2024-(0[1-9]|1[0-2])-01$/.test(p.refPer) || p.statusCode !== 0 || p.securityLevelCode !== 0
    || p.scalarFactorCode !== 3 || p.frequencyCode !== 6 || !Number.isSafeInteger(p.value) || p.value < 0)) throw new Error(`Unknown/suppressed/noninteger data in ${c.coordinate}`);
  return { ...c, vectorId: series.vectorId, points };
});
const source = { publisher: 'Statistics Canada', dataset: 'Table 12-10-0175-01, International merchandise trade by province, commodity, and Principal Trading Partners',
  url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1210017501', referenceDate: '2024-12-31', retrievedAt,
  licence: 'Statistics Canada Open Licence: https://www.statcan.gc.ca/en/terms-conditions/open-licence',
  attribution: 'Adapted from Statistics Canada, Table 12-10-0175-01, 2024. This does not constitute an endorsement by Statistics Canada of this product.',
  limitation: 'Canada national level only. Imports use customs-clearance geography; domestic exports exclude re-exports. Selected three partners, mutually exclusive top-level NAPCS groups; services and other balance-of-payments adjustments excluded. No physical quantity, production, stock or tariff observation.' };
const fxSource = { dataset: 'Bank of Canada FXAUSDCAD annual average 2024: 1 USD = 1.3698 CAD', url: fxUrl,
  referenceDate: '2024-12-31', retrievedAt, licence: 'Bank of Canada permission to reproduce, attribution and paid-product notice: https://www.bankofcanada.ca/terms/',
  attribution: 'Bank of Canada. Annual average exchange rate used for approximate CAD-to-USD conversion.',
  limitation: 'Annual average conversion is not transaction-level USD valuation. Bank of Canada content is available free of charge on its website; prospective purchasers must be informed before sale. Original annual-series publication date unavailable; government admission is no earlier than retrieval.' };
const snapshot = { retrievedAt, source, fxSource, fx, metadata: {
  title: metadata.object.cubeTitleEn, releaseTime: metadata.object.releaseTime,
  currencyUnit: currencyUnit ?? { code: 81, checkedTableUnit: 'Canadian dollars' },
  codesDigest: createHash('sha256').update(JSON.stringify(codes)).digest('hex'),
}, rows };
const records = normalizeTradeSnapshot(snapshot, registry);
await writeFile('src/data/source-snapshots/statcan-trade-2024-2026-10-03.json', JSON.stringify(snapshot, null, 2) + '\n');
const census = previous.records.filter(r => r.id.startsWith('census.')).map(r => ({
  ...r, aggregateOnly: true, availableOn: r.source.publishedOn ?? r.source.retrievedAt,
}));
await writeFile('src/data/trade-observations.json', JSON.stringify({ version: previous.version, scenarioDate: previous.scenarioDate, records: [...census, ...records] }, null, 2) + '\n');
console.info(JSON.stringify({ records: records.length, series: rows.length, observations: rows.length * 12, countries: 4, source, fxSource }));
