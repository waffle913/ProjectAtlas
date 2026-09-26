import type { Country } from '../types';
const label = (name: string, value?: string | number) => <div className="field" key={name}><span>{name}</span><b>{value ?? 'Not yet sourced'}</b></div>;
export function CountryPanel({ country }: {country?: Country}) {
  if (!country) return <aside className="panel empty"><p>Select a country to inspect its initial record.</p><small>Map entities are territories; ownership is held in simulation state so borders can evolve.</small></aside>;
  const source = country.sources.identity;
  return <aside className="panel">
    <div className="title">{country.flagUrl && <img src={country.flagUrl} alt=""/>}<div><span className="eyebrow">{country.kind}</span><h1>{country.commonName}</h1><p>{country.officialName}</p></div></div>
    <section>{label('ISO alpha-2', country.iso2)}{label('ISO alpha-3', country.iso3)}{label('UN M49', country.unM49)}{label('Capital', country.capital)}{label('Continent', country.continent)}{label('Subregion', country.subregion)}</section>
    <section><h2>Initial indicators</h2>{['Population','Land / total area','Currency','Languages','Head of state','Head of government','Government type','GDP nominal','GDP per capita'].map(x => label(x))}</section>
    {source && <footer>Identity source: <a href={source.sourceUrl} target="_blank">{source.source}</a> ({source.asOf}). Statistical values remain blank until an authoritative dated source is imported.</footer>}
  </aside>;
}
