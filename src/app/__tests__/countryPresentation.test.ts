import {describe,it,expect} from 'vitest';
import {formatCatalogValue,factAvailableAtStart} from '../countryPresentation';
import type {FactValue} from '../../data/countryData';
describe('dated new-game country presentation',()=>{
 it('formats structured catalog values without exposing object coercions',()=>{expect(formatCatalogValue([{id:'Q',name:'semi-presidential system'}])).toBe('semi-presidential system');expect(formatCatalogValue([{code:'EUR',name:'Euro'}])).toBe('Euro');expect(formatCatalogValue({unknown:5})).toBe('Indisponible');expect(formatCatalogValue(0)).toBe('0');});
 it('does not retroactively expose post-start snapshots or fabricate dates',()=>{const fact={status:'available',value:'test',referenceDate:'2026-09-26'} as FactValue;expect(factAvailableAtStart(fact)).toBe(false);expect(factAvailableAtStart({...fact,referenceDate:'2026-01-01'} as FactValue)).toBe(true);expect(factAvailableAtStart({...fact,referenceDate:'2025'} as FactValue)).toBe(true);expect(factAvailableAtStart(undefined)).toBe(false);});
});
