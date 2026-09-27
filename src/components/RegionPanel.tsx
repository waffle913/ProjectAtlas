import type { DataSource, RegionEntity } from '../types';
import type { RegionDemographicRecord } from '../data/populationData';

const row = (label: string, value?: string | number) => (
  <div className="field" key={label}><span>{label}</span><b>{value ?? 'Unavailable'}</b></div>
);
export function RegionPanel({ region, currentOwner, parentCountry, source, onBack, demographic, currentPopulation }: {
  region: RegionEntity;
  currentOwner?: { commonName: string };
  parentCountry?: { commonName: string };
  source: DataSource;
  onBack: () => void;
  demographic?: RegionDemographicRecord;
  currentPopulation?: number;
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
      <footer>Region ownership is simulation state. Changing it does not alter the country profile, permanent Region identity, or source geometry.</footer>
    </aside>
  );
}
