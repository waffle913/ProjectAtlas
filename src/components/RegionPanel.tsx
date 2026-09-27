import type { DataSource, RegionEntity } from '../types';
import type { RegionDemographicRecord } from '../data/populationData';
import type { EconomicBaselineRecord } from '../data/economicData';
import type { TerritorialClaim } from '../types';

const row = (label: string, value?: string | number) => (
  <div className="field" key={label}><span>{label}</span><b>{value ?? 'Unavailable'}</b></div>
);
const usd = (value?: number) => value === undefined ? undefined : new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export function RegionPanel({ region, currentOwner, parentCountry, source, onBack, demographic, currentPopulation, economic, currentEconomicOutput, activeClaims = [] }: {
  region: RegionEntity;
  currentOwner?: { commonName: string };
  parentCountry?: { commonName: string };
  source: DataSource;
  onBack: () => void;
  demographic?: RegionDemographicRecord;
  currentPopulation?: number;
  economic?: EconomicBaselineRecord;
  currentEconomicOutput?: number;
  activeClaims?: Array<{ claim: TerritorialClaim; claimantName: string }>;
}) {
  return (
    <aside className="panel">
      <button className="back-button" onClick={onBack}>← {parentCountry?.commonName ?? 'Country profile'}</button>
      <div className="title region-title">
        <div>
          <span className="eyebrow">Admin level {region.administrativeLevel}</span>
          <h1>{region.commonName}</h1>
          <p>{region.localAdministrativeType ?? 'Administrative region'}</p>
        </div>
      </div>
      <section>
        {row('Current owner', currentOwner?.commonName)}
        {row('Initial country', parentCountry?.commonName)}
        {row('ISO 3166-2', region.iso31662)}
        {row('Geometry', region.geographyMapping.status.replaceAll('_', ' '))}
      </section>
      <section>
        <h2>Territorial claims</h2>
        {activeClaims.length ? activeClaims.map(({ claim, claimantName }) => <div className="fact" key={claim.id}>{row('Claimant', claimantName)}<small>{claim.type.replace('_', ' ')} · active since {claim.creationDate}{claim.reason ? ` · ${claim.reason}` : ''}</small></div>) : <small>No active claims on this Region.</small>}
      </section>
      <section>
        <h2>Annual economic output</h2>
        {row('Current simulated', usd(currentEconomicOutput))}
        {row('Baseline', economic?.status === 'unavailable' ? undefined : usd(economic?.baselineAnnualOutputUsd))}
        {economic?.status === 'unavailable' ? (
          <small title={economic.reason}><a href={economic.source.url} target="_blank">{economic.source.name}</a> · unavailable, checked {economic.checkedAt}</small>
        ) : economic ? (
          <small><a href={economic.nationalSourceObservation.source.url} target="_blank">National GDP source</a> · {economic.nationalSourceObservation.referenceDate}{economic.nationalSourceObservation.isEstimate ? ' · estimate' : ''}{economic.isDerived ? ' · modelled regional allocation' : ' · direct single-Region baseline'}<br />{economic.allocationMethod}</small>
        ) : <small>No economic record loaded.</small>}
      </section>
      <section>
        <h2>Population</h2>
        {row('Current simulated', currentPopulation?.toLocaleString('en'))}
        {row('Baseline', demographic?.status === 'unavailable' ? undefined : demographic?.baselinePopulation.toLocaleString('en'))}
        {demographic?.status === 'unavailable' ? (
          <small title={demographic.reason}><a href={demographic.source.url} target="_blank">{demographic.source.name}</a> · unavailable, checked {demographic.checkedAt}</small>
        ) : demographic ? (
          <small><a href={demographic.sourceObservations[0].source.url} target="_blank">{demographic.sourceObservations[0].source.name}</a> · {demographic.baselineDate} · {demographic.isProjection ? 'projection' : 'estimate'}{demographic.isDerived ? ' · spatially derived' : ''}<br />{demographic.allocationMethod}</small>
        ) : <small>No demographic record loaded.</small>}
      </section>
      <section>
        <h2>Source and identity</h2>
        {row('ProjectAtlas ID', region.id)}
        {row('Source features', region.geographyMapping.status === 'mapped' ? region.geographyMapping.sourceFeatureIds.length : undefined)}
        <small className="source-note">
          <a href={source.url} target="_blank">{source.name}</a> · {source.datasetId} · retrieved {source.retrievedAt}
        </small>
      </section>
      <footer>Region ownership is simulation state. A transfer changes who controls this population and output without changing either value, identity, or source geometry.</footer>
    </aside>
  );
}
