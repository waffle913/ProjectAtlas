import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RegionPanel} from '../RegionPanel';
import type {RegionEntity} from '../../types';
const region={id:'test-region',commonName:'Test Region',administrativeLevel:1,geographyMapping:{status:'mapped',sourceFeatureIds:['source-feature']}} as unknown as RegionEntity;
const source={name:'Test geography publisher',url:'https://example.com/geography',datasetId:'test-dataset',retrievedAt:'2026-01-01'};
describe('Region geography provenance presentation',()=>{
 it('keeps ownership and geometry availability visible without documentary source details',()=>{
  const html=renderToStaticMarkup(createElement(RegionPanel,{region,source,onBack:()=>{},currentOwner:{commonName:'Test Sovereign'}}));
  expect(html).toContain('Test Sovereign');expect(html).toContain('Mapped');expect(html).not.toContain(source.name);expect(html).not.toContain(source.url);
 });
 it('retains the exact source, date and feature count on explicit provenance request',()=>{
  const html=renderToStaticMarkup(createElement(RegionPanel,{region,source,onBack:()=>{},showProvenance:true}));
  expect(html).toContain(source.name);expect(html).toContain(source.url);expect(html).toContain(source.retrievedAt);expect(html).toContain('Source features');expect(html).toContain(source.datasetId);
 });
});
