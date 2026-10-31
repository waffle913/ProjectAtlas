import type { FactValue } from '../data/countryData';
/** No generic object coercion: catalog values include named language/currency records. */
export function formatCatalogValue(value:unknown):string {
 if(typeof value==='number')return Number.isFinite(value)?value.toLocaleString('fr-FR',{maximumFractionDigits:1}):'Indisponible';
 if(typeof value==='string')return value.trim()||'Indisponible';
 if(Array.isArray(value))return value.length?value.map(formatCatalogValue).join(', '):'Indisponible';
 if(value && typeof value==='object' && 'name' in value && typeof value.name==='string')return value.name;
 return 'Indisponible';
}
export function factAvailableAtStart(fact:FactValue|undefined):fact is Extract<FactValue,{status:'available'}> {
 if(fact?.status!=='available')return false;
 const d=fact.referenceDate;
 return /^\d{4}$/.test(d)?d<'2026':/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && d<='2026-01-01';
}
