import { beforeAll, describe, expect, it } from 'vitest';
import { loadFixtures, canada, usa, maine } from '../../../tests/load-game/fixture';
import { readCampaignSummary } from '../campaignSummary';
import { savedCampaignNews } from '../loadNews';
import type { SimulationState } from '../../types';

let fixtures: ReturnType<typeof loadFixtures>;
const names = new Map([[canada, 'Canada'], [usa, 'États-Unis'], [maine.id, 'Maine']]);
beforeAll(() => { fixtures = loadFixtures(); }, 60000);
const news = (state: SimulationState) =>
  savedCampaignNews(state, canada, names, readCampaignSummary(JSON.stringify(state)));

describe('save-preview campaign news from persisted dated history', () => {
  it('shows the declaration and ongoing occupation; does not leak a future settlement', () => {
    const occupied = news(fixtures.occupied);
    expect(occupied.national.some(item => item.title.includes('Déclaration de guerre'))).toBe(true);
    expect(occupied.national.some(item => item.title.includes('occupe Maine'))).toBe(true);
    expect(occupied.national.some(item => item.title.includes('Fin de la guerre'))).toBe(false);
    expect(occupied.national.every(item => item.date <= fixtures.occupied.date)).toBe(true);
  });
  it('shows the recorded ending and transferred region without inventing a treaty', () => {
    const ceded = news(fixtures.ceded);
    const ending = ceded.national.find(item => item.title.includes('Fin de la guerre'));
    expect(ending?.detail).toContain('transféré Maine');
    expect(ending?.detail).toContain('aucun traité distinct');
    expect(ceded.national.some(item => item.title.includes('occupe Maine'))).toBe(false);
    expect(news(fixtures.occupied).national.some(item => item.title.includes('Fin de la guerre'))).toBe(false);
  });
  it('projects actual foreign war history as international news and excludes future dates', () => {
    const s = structuredClone(fixtures.occupied);
    const foreign = { ...s.wars[0], id:'test.foreign.war', attackerCountryId: 'foreign.a', defenderCountryId: 'foreign.b',
      startDate:s.date, status:'active' as const };
    s.wars.push(foreign);
    expect(news(s).international.some(item => item.id === 'war:start:test.foreign.war')).toBe(true);
    foreign.startDate = '2040-01-01';
    expect(news(s).international.some(item => item.id === 'war:start:test.foreign.war')).toBe(false);
  });
  it('keeps national treaties and international restrictions dated, with no invented peace treaty', () => {
    const s = structuredClone(fixtures.ceded);
    s.multilateral.treaties.test = {
      id:'test',title:'Accord commercial Canada–États-Unis',parties:[canada,usa],proposalDate:s.date,
      signatories:{},ratifications:{},entryIntoForce:{kind:'signature',requiredRatifications:0},
      withdrawal:{noticeDays:0},withdrawals:{},status:'active',activeOn:s.date,clauses:[],
      provenance:{status:'modelled',limitation:'Test synthétique'},
      history:[{date:s.date,kind:'entered_into_force',detail:'Entrée en vigueur enregistrée.'}],
    };
    s.international.actions.foreign = {
      id:'foreign',actorCountryId:'foreign.a',targetCountryId:'foreign.b',kind:'export_restriction',
      categories:[],declaredOn:s.date,effectiveOn:s.date,status:'active',
      declaredByPersonId:'test',provenance:'synthetic',limitation:'Fixture synthétique',
    };
    expect(news(s).national.some(item => item.title.includes('Accord commercial'))).toBe(true);
    expect(news(s).international.some(item => item.title.includes('Restrictions sur les exportations'))).toBe(true);
    expect(news(s).national.some(item => item.title.includes('Traité de paix'))).toBe(false);
  });
  it('retains only accessible, dated international assessments, without exposing hidden drivers', () => {
    const state = fixtures.occupied;
    const briefing = {
      pairKey: 'canada-usa', countryAId: canada, countryBId: usa,
      phase: 'ACTIVE' as const, severity: 'severe' as const, pressure: 27000,
      drivers: [{ kind: 'hidden-internal-signal', weightBps: 27000, detail: 'Secret intelligence' }],
      lastEvaluatedOn: state.date, stale: false,
    };
    const withoutReport = news(state);
    expect(withoutReport.international.some(item => item.sourceLabel === 'Rapport international daté')).toBe(false);
    const withReport = savedCampaignNews(state, canada, names,
      readCampaignSummary(JSON.stringify(state)), [briefing]);
    expect(withReport.international.some(item => item.title.includes('Tensions diplomatiques'))).toBe(true);
    expect(JSON.stringify(withReport)).not.toContain('Secret intelligence');
    expect(JSON.stringify(withReport)).not.toContain('hidden-internal-signal');
    expect(savedCampaignNews(state, canada, names, readCampaignSummary(JSON.stringify(state)),
      [{...briefing,lastEvaluatedOn:'2032-01-01'}]).international
      .some(item => item.sourceLabel === 'Rapport international daté')).toBe(false);
  });

  it('does not project classified facts or unavailable economics as public news', () => {
    const a = news(fixtures.opposition!);
    expect(JSON.stringify(a)).not.toMatch(/enemyStrength|recordedEnemyPersonnelLosses|deployment/);
    expect(a.national.every(item => item.date <= fixtures.opposition!.date)).toBe(true);
  });
});
