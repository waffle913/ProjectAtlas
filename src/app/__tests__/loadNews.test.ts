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

  it('keeps retained news chronological while reserving space for major events', () => {
    const summary={events:Array.from({length:15},(_,i)=>({id:'minor-'+i,date:'2031-06-18',title:'Minor '+i,detail:'Recorded'})),
      decisions:[],situations:[]};
    const state=structuredClone(fixtures.occupied);
    state.wars[0].startDate='2031-06-01';
    const result=savedCampaignNews(state,canada,names,summary);
    expect(result.national.some(n=>n.id==='war:start:'+state.wars[0].id)).toBe(true);
    expect(result.national).toHaveLength(12);
    const dates=result.national.map(n=>n.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
  it('does not duplicate a proposal outcome already covered by an accessible briefing', () => {
    const state=structuredClone(fixtures.occupied);
    state.information.briefings.push({id:'public-result',countryId:canada,portfolio:'finance',access:'public',eventType:'proposal_result',
      severity:'important',createdOn:state.date,sourceId:'p',headline:'Réforme enregistrée',
      fact:{kind:'parliamentary_result',proposalId:'p',outcome:'adopted',evidenceStatus:'modelled'},pauseRequested:false});
    const result=savedCampaignNews(state,canada,names,{events:[{id:'public-result',date:state.date,title:'Réforme enregistrée',detail:'Résultat'}],
      decisions:[{id:'p',date:state.date,title:'Réforme fiscale',detail:'Adoptée'}],situations:[]});
    expect(result.national.filter(n=>n.id==='briefing:p')).toEqual([]);
    expect(result.national.filter(n=>n.id==='briefing:public-result')).toHaveLength(1);
  });
  it('does not announce scheduled restrictions as already applied or their future lifting as past news', () => {
    const state=structuredClone(fixtures.occupied);
    state.international.actions.scheduled={id:'scheduled',actorCountryId:canada,targetCountryId:usa,kind:'import_restriction',categories:[],
      declaredOn:state.date,effectiveOn:'2031-06-19',ceasesOn:'2031-07-01',status:'lifted',declaredByPersonId:state.governance.player.controlledPersonId!,
      provenance:'synthetic',limitation:'Test only'};
    const result=news(state).national;
    expect(result.find(n=>n.id==='international:declared:scheduled')?.detail).toContain('non encore applicable');
    expect(result.some(n=>n.id==='international:lifted:scheduled')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('2031-07-01');
    state.international.actions.scheduled.declaredOn='2032-01-01';
    expect(news(state).national.some(n=>n.id.includes('scheduled'))).toBe(false);
  });
  it('filters private crisis briefings for opposition and preserves an available public crisis briefing', () => {
    const state=structuredClone(fixtures.opposition);
    const base={countryId:canada,portfolio:'interior_security' as const,eventType:'crisis_activation' as const,severity:'urgent' as const,
      createdOn:state.date,sourceId:'synthetic-crisis',fact:{kind:'crisis_activation' as const,evidenceStatus:'modelled' as const},pauseRequested:false};
    state.information.briefings.push({...base,id:'crisis-public',access:'public',headline:'Crise documentée publiquement'},
      {...base,id:'crisis-secret',access:'government',headline:'RENSEIGNEMENT SECRET'});
    const result=news(state);
    expect(result.national.some(n=>n.title==='Crise documentée publiquement')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('RENSEIGNEMENT SECRET');
  });

  it('does not project classified facts or unavailable economics as public news', () => {
    const a = news(fixtures.opposition!);
    expect(JSON.stringify(a)).not.toMatch(/enemyStrength|recordedEnemyPersonnelLosses|deployment/);
    expect(a.national.every(item => item.date <= fixtures.opposition!.date)).toBe(true);
  });
});
