import type { DataSource, RegionEntity } from '../types';

const row = (label: string, value?: string | number) => (
  <div className="field" key={label}><span>{label}</span><b>{value ?? 'Unavailable'}</b></div>
);
export function RegionPanel({ region, currentOwner, parentCountry, source, onBack }: {
  region: RegionEntity;
  currentOwner?: { commonName: string };
  parentCountry?: { commonName: string };
  source: DataSource;
  onBack: () => void;
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
