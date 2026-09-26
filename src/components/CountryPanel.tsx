import type { Country, SourceValue } from "../types";
import {
  countryFactsById,
  officeholdersByCountryId,
} from "../data/countryData";
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
const fact = (name: string, observation?: SourceValue<unknown>) => (
  <div className="fact" key={name}>
    <div className="field">
      <span>{name}</span>
      <b>{observation ? formatValue(observation.value) : "Not yet sourced"}</b>
    </div>
    {observation && (
      <small>
        <a href={observation.source.url} target="_blank">
          {observation.source.name}
        </a>{" "}
        · {observation.referenceDate}
        {observation.isEstimate ? " · estimate" : ""}
      </small>
    )}
  </div>
);
export function CountryPanel({ country }: { country?: Country }) {
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
  const facts = countryFactsById.get(country.id)?.facts ?? {};
  const officeholders = officeholdersByCountryId.get(country.id) ?? [];
  return (
    <aside className="panel">
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
        {label("Capital", country.capital)}
        {label("Continent", country.continent)}
        {label("UN subregion", country.unSubregion)}
      </section>
      <section>
        <h2>Initial indicators</h2>
        {fact("Population", facts.population)}
        {fact("Total area (km²)", facts.totalAreaKm2)}
        {fact("Land area (km²)", facts.landAreaKm2)}
        {fact("Nominal GDP (USD)", facts.nominalGdpUsd)}
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
              {label(office.title, holder.person.name)}
              <small>
                <a href={holder.source.url} target="_blank">
                  {holder.source.name}
                </a>
                {holder.startDate ? ` · since ${holder.startDate}` : ""}
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
