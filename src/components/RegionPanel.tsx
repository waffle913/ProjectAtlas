import type { inspectSocioeconomy } from '../simulation/socioeconomy/model';
import type { DataSource, LimitedWar, RegionEntity, RegionOccupation } from '../types';
import type { RegionDemographicRecord } from '../data/populationData';
import type { EconomicBaselineRecord } from '../data/economicData';
import type { TerritorialClaim } from '../types';

const row = (label: string, value?: string | number) => (
  <div className="field" key={label}><span>{label}</span><b>{value ?? 'Unavailable'}</b></div>
);
const usd = (value?: number) => value === undefined ? undefined : new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export function RegionPanel({ region, currentOwner, parentCountry, source, onBack, demographic, currentPopulation, economic, currentEconomicOutput, activeClaims = [], occupation, objectiveWars = [], socioeconomic, onCapacityShock }: {
  socioeconomic?: ReturnType<typeof inspectSocioeconomy>;
  onCapacityShock?: (capacityBps: number) => void;
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
  occupation?: RegionOccupation & { occupierName: string; war?: LimitedWar };
  objectiveWars?: Array<{ war: LimitedWar; attackerName: string; defenderName: string }>;
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
        <h2>War status</h2>
        {row('Sovereign owner', currentOwner?.commonName)}
        {row('Occupier', occupation?.occupierName)}
        {occupation && <small>Occupation under {occupation.war?.id ?? occupation.warId} · since {occupation.startDate}. Sovereignty, population and economic output are unchanged.</small>}
        {objectiveWars.length ? objectiveWars.map(({ war, attackerName, defenderName }) => <small key={war.id}><br />Objective of {war.id}: {attackerName} → {defenderName}</small>) : <small><br />Not a current war objective.</small>}
      </section>
      <section>
        <h2>Territorial claims</h2>
        {activeClaims.length ? activeClaims.map(({ claim, claimantName }) => <div className="fact" key={claim.id}>{row('Claimant', claimantName)}<small>{claim.type.replace('_', ' ')} · active since {claim.creationDate}{claim.reason ? ` · ${claim.reason}` : ''}</small></div>) : <small>No active claims on this Region.</small>}
      </section>
      {socioeconomic && <section>
        <h2>Socioeconomic simulation · 0.10</h2>
        {row('Population / quality', `${socioeconomic.population?.toLocaleString('en') ?? 'Unavailable'} / ${socioeconomic.populationProvenance.status}`)}
        {row('Output input quality', socioeconomic.outputProvenance.status)}
        <small>Modelled monthly economy. Political split is a noninformative prior and has no economic effect.</small>
        {socioeconomic.economy ? <>
          {row('Employed persons', socioeconomic.economy.employed.toLocaleString('en'))}
          {row('Unemployed persons', socioeconomic.economy.unemployed.toLocaleString('en'))}
          {row('Production / month', usd(socioeconomic.economy.output))}
          {row('Household income / month', usd(socioeconomic.economy.householdIncome))}
          {row('Consumption / month', usd(socioeconomic.economy.consumption))}
          {row('Residual demand / month', usd(socioeconomic.economy.otherDemandResidual))}
          {row('Basic needs coverage', `${(socioeconomic.economy.basicNeedsCoverageBps / 100).toFixed(2)}%`)}
          <details><summary>Diagnostics and test shock</summary>
            <p>Shock is queued during pause; capacity updates on the next day, flows on the next month.</p>
            <button onClick={() => onCapacityShock?.(8000)}>Capacity −20%</button>{' '}
            <button onClick={() => onCapacityShock?.(10000)}>Remove shock</button>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11 }}>{JSON.stringify(socioeconomic, null, 2)}</pre>
          </details>
        </> : <small><br />Economy unavailable: insufficient population or production inputs.</small>}
      </section>}
      <section>
        <h2>Annual economic baseline</h2>
        {row('Saved annual reference', usd(currentEconomicOutput))}
        {row('Baseline', economic?.status === 'unavailable' ? undefined : usd(economic?.baselineAnnualOutputUsd))}
        {economic?.status === 'unavailable' ? (
          <small title={economic.reason}><a href={economic.source.url} target="_blank">{economic.source.name}</a> · unavailable, checked {economic.checkedAt}</small>
        ) : economic ? (
          <small><a href={economic.nationalSourceObservation.source.url} target="_blank">National GDP source</a> · {economic.nationalSourceObservation.referenceDate}{economic.nationalSourceObservation.isEstimate ? ' · estimate' : ''}{economic.isDerived ? ' · modelled regional allocation' : ' · direct single-Region baseline'}<br />{economic.allocationMethod}</small>
        ) : <small>No economic record loaded.</small>}
      </section>
      <section>
        <h2>Population</h2>
        {row('Saved population reference', currentPopulation?.toLocaleString('en'))}
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
