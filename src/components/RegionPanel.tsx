import type { DataSource, RegionEntity } from '../types';

const row = (label: string, value?: string | number) => (
  <div className="field" key={label}><span>{label}</span><b>{value ?? 'Unavailable'}</b></div>
);

const GEOMETRY_STATUS_LABELS: Record<string, string> = {
  mapped: 'Mapped',
  fallback_admin0: 'Admin-0 fallback',
  unavailable: 'Unavailable',
};
const geometryStatusLabel = (status: string) => GEOMETRY_STATUS_LABELS[status] ?? status.replaceAll('_', ' ');

export function RegionPanel({ region, currentOwner, parentCountry, source, onBack, showProvenance = false }: {
  region: RegionEntity;
  currentOwner?: { commonName: string };
  parentCountry?: { commonName: string };
  source: DataSource;
  onBack: () => void;
  showProvenance?: boolean;
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
        {row('Geometry mapping', geometryStatusLabel(region.geographyMapping.status))}
        {showProvenance && row('ProjectAtlas Region ID', region.id)}
      </section>
      <section>
        <h2>Regional public information</h2>
        <p>Regional economic and service reports are not available to this role through the government information system.</p>
        <p>Internal employment, production, household and service simulation values are intentionally not shown here.</p>
      </section>
      <section>
        <h2>Geography source</h2>
        {row('Source features', region.geographyMapping.status === 'mapped' ? region.geographyMapping.sourceFeatureIds.length : undefined)}
        <small className="source-note"><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>{showProvenance && <> · {source.datasetId}</>} · retrieved {source.retrievedAt}</small>
      </section>
    </aside>
  );
}
