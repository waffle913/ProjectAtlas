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
        <div><span className="eyebrow">Admin level {region.administrativeLevel}</span><h1>{region.commonName}</h1><p>{region.localAdministrativeType ?? 'Administrative region'}</p></div>
      </div>
      <section>
        {row('Current sovereign owner', currentOwner?.commonName)}
        {row('Parent Country', parentCountry?.commonName)}
        {row('ISO 3166-2', region.iso31662)}
        {row('Geometry mapping', region.geographyMapping.status.replaceAll('_', ' '))}
        {row('ProjectAtlas Region ID', region.id)}
      </section>
      <section>
        <h2>Regional public information</h2>
        <p>Regional economic and service reports are not yet published through the 0.15 information system.</p>
        <p>Internal employment, production, household and service simulation values are intentionally not shown here.</p>
      </section>
      <section>
        <h2>Geography source</h2>
        {row('Source features', region.geographyMapping.status === 'mapped' ? region.geographyMapping.sourceFeatureIds.length : undefined)}
        <small className="source-note"><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> · {source.datasetId} · retrieved {source.retrievedAt}</small>
      </section>
    </aside>
  );
}
