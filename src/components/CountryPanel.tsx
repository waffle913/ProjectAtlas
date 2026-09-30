import type { ReactNode } from 'react';
import type { Country, LimitedWar, TerritorialClaim } from "../types";
import type { AvailableCasusBelli } from "../simulation/diplomacy";
import type { CountryFactsRecord, FactValue, Officeholder, PoliticalOffice } from "../data/countryData";
import type { PopulationObservation } from "../data/populationData";
const label = (name: string, value?: string | number) => (
  <div className="field" key={name}>
    <span>{name}</span>
    <b>{value ?? "Not yet sourced"}</b>
  </div>
);
const flagEmoji = (iso2?: string) =>
  iso2
    ? [...iso2.toUpperCase()]
        .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
        .join("")
    : "◇";
const formatValue = (value: unknown) => {
  if (typeof value === "number")
    return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(
      value,
    );
  if (Array.isArray(value))
    return value
      .map((item) =>
        typeof item === "string"
          ? item
          : ((item as { code?: string; name?: string }).code ??
            (item as { name?: string }).name),
      )
      .filter(Boolean)
      .join(", ");
  return String(value);
};
const fact = (name: string, observation?: FactValue) => (
  <div className="fact" key={name}>
    <div className="field">
      <span>{name}</span>
      <b>{observation?.status === "available" ? formatValue(observation.value) : "Unavailable"}</b>
    </div>
    {observation?.status === "available" && (
      <small>
        <a href={observation.source.url} target="_blank">
          {observation.source.name}
        </a>{" "}
        · {observation.referenceDate}
        {observation.isEstimate ? " · estimate" : ""}
      </small>
    )}
    {observation?.status === "unavailable" && <small title={observation.reason}><a href={observation.source.url} target="_blank">{observation.source.name}</a> · checked {observation.checkedAt}</small>}
  </div>
);
const formatUsd = (value?: number) => value === undefined ? undefined : new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
export function CountryPanel({ fiscalDebug, politicalDebug, country, factsRecord, officeholders = [], nationalPopulation, simulatedPopulation, simulatedMonthlyOutput, controlledBaselinePopulation, controlledBaselinePopulationComplete = false, controlledBaselineAnnualOutput, controlledBaselineAnnualOutputComplete = false, activeClaimsMade = [], foreignClaims = [], availableCasusBelli = [], activeWars = [] }: { fiscalDebug?: ReactNode; politicalDebug?: ReactNode; country?: Country; factsRecord?: CountryFactsRecord; officeholders?: Array<{office:PoliticalOffice;holder:Officeholder}>; nationalPopulation?: PopulationObservation; simulatedPopulation?: number; simulatedMonthlyOutput?: number; controlledBaselinePopulation?: number; controlledBaselinePopulationComplete?: boolean; controlledBaselineAnnualOutput?: number; controlledBaselineAnnualOutputComplete?: boolean; activeClaimsMade?: Array<{claim: TerritorialClaim; regionName: string}>; foreignClaims?: Array<{claim: TerritorialClaim; claimantName: string; regionName: string}>; availableCasusBelli?: Array<{cb: AvailableCasusBelli; targetName: string}>; activeWars?: Array<{war: LimitedWar; attackerName: string; defenderName: string; targetRegionName: string; objectiveSatisfied: boolean}> }) {
  if (!country)
    return (
      <aside className="panel empty">
        <p>Select a country to inspect its initial record.</p>
        <small>
          Map entities are territories; ownership is held in simulation state so
          borders can evolve.
        </small>
      </aside>
    );
  const facts = factsRecord?.facts ?? {};
  return (
    <aside className="panel">
      {fiscalDebug}
      {politicalDebug}
      <div className="title">
        <span className="flag" aria-label={`${country.commonName} flag`}>
          {flagEmoji(country.externalIds.isoAlpha2)}
        </span>
        <div>
          <span className="eyebrow">
            {country.entityType.replaceAll("_", " ")}
          </span>
          <h1>{country.commonName}</h1>
          <p>{country.officialName}</p>
        </div>
      </div>
      <section>
        {label("ISO alpha-2", country.externalIds.isoAlpha2)}
        {label("ISO alpha-3", country.externalIds.isoAlpha3)}
        {label("UN M49", country.externalIds.unM49)}
        {label("UN status", country.unMembership.replace("_", " "))}
        {label("Capital", country.capital)}
        {label("Continent", country.continent)}
        {label("UN subregion", country.unSubregion)}
      </section>
      <section>
        <h2>Wars</h2>
        {activeWars.length ? activeWars.map(({ war, attackerName, defenderName, targetRegionName, objectiveSatisfied }) => <div className="fact" key={war.id}>{label('Belligerents', `${attackerName} → ${defenderName}`)}<small>Target: {targetRegionName} · since {war.startDate} · objective {objectiveSatisfied ? 'satisfied' : 'not satisfied'}</small></div>) : <small>No active bilateral wars.</small>}
      </section>
      <section>
        <h2>Diplomacy</h2>
        {label('Active territorial claims', activeClaimsMade.length)}
        {activeClaimsMade.map(({ claim, regionName }) => <small key={claim.id}>{regionName} · {claim.type.replace('_', ' ')} · since {claim.creationDate}<br /></small>)}
        {label('Foreign claims on controlled Regions', foreignClaims.length)}
        {foreignClaims.map(({ claim, claimantName, regionName }) => <small key={claim.id}>{claimantName} → {regionName} · {claim.type.replace('_', ' ')}<br /></small>)}
        {label('Available casus belli', availableCasusBelli.length)}
        {availableCasusBelli.map(({ cb, targetName }) => <small key={cb.id}>{targetName} · {cb.type.replaceAll('_', ' ')}{cb.targetRegionIds?.length ? ` · ${cb.targetRegionIds.length} Region` : ''}<br /></small>)}
        {!activeClaimsMade.length && !foreignClaims.length && !availableCasusBelli.length && <small>No active claims or available casus belli. The reviewed baseline is intentionally empty.</small>}
      </section>
      <section>
        <h2>Current socioeconomic simulation</h2>
        {label("Simulated population controlled", simulatedPopulation === undefined ? "Unavailable — incomplete simulation data" : simulatedPopulation.toLocaleString("en"))}
        {label("Simulated output / month", simulatedMonthlyOutput === undefined ? "Unavailable — incomplete simulation data" : formatUsd(simulatedMonthlyOutput))}
        <h2>Economic references</h2>
        <div className="fact">
          {label("Annual reference controlled", controlledBaselineAnnualOutputComplete ? formatUsd(controlledBaselineAnnualOutput) : "Unavailable — incomplete Region data")}
          <small>{controlledBaselineAnnualOutputComplete ? "Saved annual baseline · complete sum of currently controlled Regions; monthly dynamics are in Region diagnostics" : "One or more currently controlled Regions lacks an economic baseline; no partial total is shown."}</small>
        </div>
        {fact("Statistical national GDP (USD)", facts.nominalGdpUsd)}
      </section>
      <section>
        <h2>Initial indicators</h2>
        <div className="fact">
          {label("Baseline population controlled", controlledBaselinePopulationComplete ? controlledBaselinePopulation?.toLocaleString("en") : "Unavailable — incomplete Region data")}
          <small>{controlledBaselinePopulationComplete ? "Saved population reference · complete sum of currently controlled Regions; modelled initialization is in Region diagnostics" : "One or more currently controlled Regions lacks a demographic baseline; no partial total is shown."}</small>
        </div>
        <div className="fact">
          {label("National baseline", nationalPopulation?.value.toLocaleString("en"))}
          {nationalPopulation && <small><a href={nationalPopulation.source.url} target="_blank">{nationalPopulation.source.name}</a> · {nationalPopulation.referenceDate}{nationalPopulation.isEstimate ? " · estimate" : ""}{nationalPopulation.isProjection ? " · projection" : ""}</small>}
        </div>
        {fact("Total area (km²)", facts.totalAreaKm2)}
        {fact("Land area (km²)", facts.landAreaKm2)}
        {fact("GDP per capita (USD)", facts.gdpPerCapitaUsd)}
        {fact("Currencies", facts.currencies)}
        {fact("Languages", facts.languages)}
        {fact("Government type", facts.governmentType)}
      </section>
      <section>
        <h2>Political offices · 1 Jan 2026</h2>
        {officeholders.length ? (
          officeholders.map(({ office, holder }) => (
            <div className="fact" key={office.id}>
              {label(office.title, holder.status === "available" ? holder.person.name : "Unavailable")}
              <small>
                <a href={holder.source.url} target="_blank">
                  {holder.source.name}
                </a>
                {holder.status === "available" && holder.startDate ? ` · since ${holder.startDate}` : holder.status === "unavailable" ? ` · checked ${holder.checkedAt}` : ""}
              </small>
            </div>
          ))
        ) : (
          <small>No officeholder record for this entity type.</small>
        )}
      </section>
      <footer>
        Identity:{" "}
        {country.sources.identity?.map((item, index) => (
          <span key={item.datasetId}>
            {index ? ", " : ""}
            <a href={item.url} target="_blank">
              {item.name}
            </a>
          </span>
        ))}
        . Facts retain their published reference dates.
      </footer>
    </aside>
  );
}
