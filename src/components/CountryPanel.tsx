import type { Country } from "../types";
import type { CountryFactsRecord, FactValue, Officeholder, PoliticalOffice } from "../data/countryData";
import type { PopulationObservation } from "../data/populationData";

const label = (name: string, value?: string | number) => (
  <div className="field" key={name}>
    <span>{name}</span>
    <b>{value ?? "Not yet sourced"}</b>
  </div>
);
const flagEmoji = (iso2?: string) => iso2
  ? [...iso2.toUpperCase()].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("")
  : "◇";
const ENTITY_TYPE_LABELS: Record<string, string> = {
  sovereign_state: 'Sovereign state',
  dependency: 'Dependency',
  disputed: 'Disputed entity',
  partially_recognized: 'Partially recognized state',
  special_status: 'Special-status entity',
};
const UN_MEMBERSHIP_LABELS: Record<string, string> = {
  member: 'UN member',
  observer: 'UN observer',
  non_member: 'UN non-member',
};
const entityTypeLabel = (t: string) => ENTITY_TYPE_LABELS[t] ?? t.replaceAll('_', ' ');
const unMembershipLabel = (m: string) => UN_MEMBERSHIP_LABELS[m] ?? m.replace('_', ' ');
const formatValue = (value: unknown) => {
  if (typeof value === "number") return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
  if (Array.isArray(value)) return value.map(item => typeof item === "string" ? item : ((item as { code?: string; name?: string }).code ?? (item as { name?: string }).name)).filter(Boolean).join(", ");
  return String(value);
};
const fact = (name: string, observation: FactValue | undefined, showProvenance: boolean) => (
  <div className="fact" key={name}>
    <div className="field">
      <span>{name}</span>
      <b>{observation?.status === "available" ? formatValue(observation.value) : "Unavailable"}</b>
    </div>
    {showProvenance && observation?.status === "available" && <small><a href={observation.source.url} target="_blank" rel="noreferrer">{observation.source.name}</a> · {observation.referenceDate}{observation.isEstimate ? " · estimate" : ""}</small>}
    {showProvenance && observation?.status === "unavailable" && <small title={observation.reason}><a href={observation.source.url} target="_blank" rel="noreferrer">{observation.source.name}</a> · checked {observation.checkedAt}</small>}
  </div>
);

export function CountryPanel({ country, factsRecord, officeholders = [], nationalPopulation, showProvenance = false }: {
  country?: Country;
  factsRecord?: CountryFactsRecord;
  officeholders?: Array<{ office: PoliticalOffice; holder: Officeholder }>;
  nationalPopulation?: PopulationObservation;
  showProvenance?: boolean;
}) {
  if (!country) return <aside className="panel empty"><p>Select a Country to inspect its public source record.</p></aside>;
  const facts = factsRecord?.facts ?? {};
  return (
    <aside className="panel">
      <div className="title">
        <span className="flag" aria-label={`${country.commonName} flag`}>{flagEmoji(country.externalIds.isoAlpha2)}</span>
        <div><span className="eyebrow">{entityTypeLabel(country.entityType)}</span><h1>{country.commonName}</h1><p>{country.officialName}</p></div>
      </div>
      <section>
        {label("ISO alpha-2", country.externalIds.isoAlpha2)}
        {label("ISO alpha-3", country.externalIds.isoAlpha3)}
        {label("UN M49", country.externalIds.unM49)}
        {label("UN status", unMembershipLabel(country.unMembership))}
        {label("Capital", country.capital)}
        {label("Continent", country.continent)}
        {label("UN subregion", country.unSubregion)}
      </section>
      <section>
        <h2>Published country information</h2>
        {fact("Statistical national GDP (USD)", facts.nominalGdpUsd, showProvenance)}
        {fact("Total area (km²)", facts.totalAreaKm2, showProvenance)}
        {fact("Land area (km²)", facts.landAreaKm2, showProvenance)}
        {fact("GDP per capita (USD)", facts.gdpPerCapitaUsd, showProvenance)}
        {fact("Currencies", facts.currencies, showProvenance)}
        {fact("Languages", facts.languages, showProvenance)}
        {fact("Government type", facts.governmentType, showProvenance)}
        {nationalPopulation && <div className="fact">{label("Population source record", nationalPopulation.value.toLocaleString("en"))}{showProvenance && <small><a href={nationalPopulation.source.url} target="_blank" rel="noreferrer">{nationalPopulation.source.name}</a> · {nationalPopulation.referenceDate}{nationalPopulation.isEstimate ? " · estimate" : ""}{nationalPopulation.isProjection ? " · projection" : ""}</small>}</div>}
        <small>These are dated public source records; they are not live internal simulation reports.</small>
      </section>
      <section>
        <h2>Public officeholder records · 1 Jan 2026</h2>
        {officeholders.length ? officeholders.map(({ office, holder }) => (
          <div className="fact" key={office.id}>
            {label(office.title, holder.status === "available" ? "Source record available; real identity retained in provenance" : "Unavailable")}
            {showProvenance && <small><a href={holder.source.url} target="_blank" rel="noreferrer">{holder.source.name}</a>{holder.status === "available" && holder.startDate ? ` · since ${holder.startDate}` : holder.status === "unavailable" ? ` · checked ${holder.checkedAt}` : ""}</small>}
          </div>
        )) : <small>No officeholder record for this entity type.</small>}
      </section>
      {showProvenance ? (
        <footer>
          Identity: {country.sources.identity?.map((item, index) => <span key={item.datasetId}>{index ? ", " : ""}<a href={item.url} target="_blank" rel="noreferrer">{item.name}</a></span>)}. Source reference dates are retained.
        </footer>
      ) : (
        <footer className="muted">Detailed source, licence and retrieval records are available in Credits / Data Sources and the "Show provenance details" setting.</footer>
      )}
    </aside>
  );
}
