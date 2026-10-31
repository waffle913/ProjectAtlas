import { formatCatalogValue, factAvailableAtStart } from '../../app/countryPresentation';
import { sourcedExecutiveSystem } from '../../simulation/governance/officeEvidence';
import { useMemo, useState } from 'react';
import type { SimulationState, Territory } from '../../types';
import type { LoadedCountryData } from '../../data/countryData';
import { countryStartingOptions, selectableStartingCountryIds, type PoliticalStartPath } from '../../simulation/governance/selection';
import { AtlasMark, Icon } from '../MainMenu';
import { CountryGlobe } from './CountryGlobe';
import { countryCenter, globePolygons } from './globeGeometry';
import './NewGameSetup.css';
export interface NewGameDraft { countryId: string; path: PoliticalStartPath; personId: string; step: number; visited: number; query: string; tab: string }
export const initialNewGameDraft = (countries: LoadedCountryData['registry']['countries']): NewGameDraft => ({countryId:countries.find(c=>c.externalIds.isoAlpha2==='FR')?.id??countries[0]?.id??'',path:'national_leader',personId:'',step:0,visited:0,query:'',tab:'Aperçu'});
const pathLabels:Record<PoliticalStartPath,string>={national_leader:'Dirigeant national',opposition_party_leader:'Chef de parti d’opposition'};
const steps=[['Pays','Sélection du pays'],['Rôle','Choix de départ'],['Configuration','Paramètres de partie'],['Récapitulatif','Vérification et lancement']];
export function NewGameSetup({ data, territories, selectionState, draft, onDraftChange, onConfirm, onBack, onLoad, onSettings, onCredits, onExit, uiScale=1 }: {
  data:LoadedCountryData;territories:readonly Territory[];selectionState:SimulationState;draft:NewGameDraft;onDraftChange:(draft:NewGameDraft)=>void;onConfirm:(countryId:string,path:PoliticalStartPath,personId:string)=>void;
  onBack:()=>void;onLoad:()=>void;onSettings:()=>void;onCredits:()=>void;onExit:()=>void;uiScale?:number;
}) {
  const [error,setError]=useState('');const [catalogOpen,setCatalogOpen]=useState(false);
  const countries=data.registry.countries;
  const country=countries.find(c=>c.id===draft.countryId);
  const names=useMemo(()=>new Map(countries.map(c=>[c.id,c.commonName])),[countries]);
  const available=useMemo(()=>selectableStartingCountryIds(selectionState),[selectionState]);
  const options=useMemo(()=>countryStartingOptions(selectionState,draft.countryId),[selectionState,draft.countryId]);
  const candidates=options.paths[draft.path].candidates;
  const person=candidates.find(p=>p.personId===draft.personId);
  const update=(patch:Partial<NewGameDraft>)=>{setError('');onDraftChange({...draft,...patch});};
  const chooseCountry=(countryId:string)=>{setCatalogOpen(false);update({countryId,personId:'',path:'national_leader',step:0,visited:0,query:''});};
  const matches=countries.filter(c=>`${c.commonName} ${c.officialName??''} ${c.externalIds.isoAlpha2??''}`.toLocaleLowerCase().includes(draft.query.trim().toLocaleLowerCase()));
  const canContinue=draft.step===0?Boolean(country):Boolean(person);
  const next=()=>{if(canContinue)update({step:Math.min(3,draft.step+1),visited:Math.max(draft.visited,Math.min(3,draft.step+1))});};
  const system=sourcedExecutiveSystem(draft.countryId);
  const systemTitle=({presidential:'Régime présidentiel',parliamentary:'Régime parlementaire',semi_presidential:'Régime semi-présidentiel',collective:'Exécutif collectif',monarchy_parliamentary:'Monarchie parlementaire',other:'Autre système institutionnel',unavailable:'Régime indisponible'} as const)[system];
  const politicalFact=<div className="ng-fact"><dt>Régime politique</dt><dd>{systemTitle}<small>Registre institutionnel canonique · 1er janvier 2026</small></dd></div>;
  const facts=data.factsByCountryId.get(draft.countryId)?.facts;
  const fact=(key:string,label:string)=>{const f=facts?.[key];return <div className="ng-fact" key={key}><dt>{label}</dt><dd>{factAvailableAtStart(f)?<>{formatCatalogValue(f.value)}<small>{f.referenceDate} · {f.isEstimate?'estimation · ':''}{f.source.name}</small></>:<span title={f?.status==='unavailable'?f.reason:undefined}>Indisponible</span>}</dd></div>;};
  const silhouette=useMemo(()=>{const polygons=globePolygons(territories).filter(p=>p.countryId===draft.countryId).sort((a,b)=>b.area-a.area);const ring=polygons[0]?.rings[0];if(!ring?.length)return '';const center=countryCenter(polygons,draft.countryId)!;const span=Math.max(...ring.map(p=>Math.abs(p[0]-center[0])),...ring.map(p=>Math.abs(p[1]-center[1])))||1;return ring.map((p,i)=>`${i?'L':'M'}${200+(p[0]-center[0])/span*75},${90-(p[1]-center[1])/span*75}`).join(' ')+' Z';},[territories,draft.countryId]);
  return <main className={`new-game-setup${uiScale>1.1?' ng-large-ui':''}`} lang="fr" style={{'--ng-scale':uiScale} as React.CSSProperties}>
    <CountryGlobe territories={territories} selectedId={draft.countryId} onSelect={chooseCountry} names={names}/>
    <aside className="ng-sidebar"><div className="ng-brand"><AtlasMark/><span>PROJECT</span><strong>ATLAS</strong></div><nav aria-label="Navigation de campagne"><button onClick={onBack}>← Retour au menu</button><button className="active" onClick={()=>update({step:0})}><Icon name="globe"/>Nouvelle partie</button><button onClick={onLoad}><Icon name="folder"/>Charger une partie</button><button onClick={onSettings}><Icon name="settings"/>Paramètres</button><button onClick={onCredits}><Icon name="book"/>Crédits</button><button onClick={onExit}><Icon name="power"/>Quitter</button></nav></aside>
    <nav className="ng-steps" aria-label="Étapes de nouvelle partie">{steps.map(([title,description],i)=><button key={title} onClick={()=>update({step:i})} disabled={i>draft.visited} aria-current={i===draft.step?'step':undefined}><b>{i+1}</b><span><strong>{title}</strong><small>{description}</small></span>{i<3 && <i aria-hidden="true">›</i>}</button>)}</nav>
    <div className="ng-country-panel">
      <div className="ng-search"><label htmlFor="ng-search">Rechercher un pays</label><span aria-hidden="true">⌕</span><input id="ng-search" type="search" placeholder="Rechercher un pays…" value={draft.query} onChange={e=>update({query:e.target.value})} onKeyDown={e=>{if(e.key==='Enter' && matches[0])chooseCountry(matches[0].id);}}/></div>
      {draft.query.trim() && <div className="ng-search-results" aria-label="Résultats de recherche">{matches.length?matches.slice(0,12).map(c=><button key={c.id} onClick={()=>chooseCountry(c.id)}>{c.commonName}{!available.has(c.id)&&<small>Démarrage indisponible</small>}</button>):<p>Aucun pays correspondant.</p>}</div>}
      <section className="ng-card" aria-label="Préparation de campagne">
        <div className="ng-country-title"><span className={`ng-country-code${country?.externalIds.isoAlpha2==='FR'?' ng-flag-fr':''}`} aria-hidden="true">{country?.externalIds.isoAlpha2==='FR'?'':country?.externalIds.isoAlpha2??'—'}</span><div><h1>{country?.commonName??'Choisir un pays'}</h1><p>{systemTitle}</p></div></div>
        {draft.step===0 && <><div className="ng-country-banner"><svg viewBox="0 0 400 180" aria-label="Contour du territoire principal"><path d={silhouette}/></svg><small>{silhouette?'Géométrie du catalogue · Natural Earth':'Géométrie indisponible — sélection par le catalogue'}</small></div>
          <div className="ng-tabs" role="tablist" aria-label="Informations du pays">{['Aperçu','Économie','Politique','Société','Relations'].map(tab=><button role="tab" aria-selected={draft.tab===tab} key={tab} onClick={()=>update({tab})}>{tab}</button>)}</div>
          <div className="ng-information" role="tabpanel" aria-label={draft.tab}><dl>
            {draft.tab==='Aperçu' && <><div className="ng-fact"><dt>Capitale</dt><dd>{country?.capital??'Indisponible'}</dd></div>{fact('population','Population')}{fact('nominalGdpUsd','PIB nominal (USD)')}{fact('gdpPerCapitaUsd','PIB par habitant (USD)')}{politicalFact}<div className="ng-fact"><dt>Région</dt><dd>{country?.unSubregion??'Indisponible'}</dd></div></>}
            {draft.tab==='Économie' && <>{fact('nominalGdpUsd','PIB nominal (USD)')}{fact('gdpPerCapitaUsd','PIB par habitant (USD)')}{fact('currencies','Monnaies')}<div className="ng-fact"><dt>Croissance</dt><dd>Indisponible</dd></div></>}
            {draft.tab==='Politique' && <>{politicalFact}<div className="ng-fact"><dt>Voies de départ</dt><dd>{options.playable?'Consulter l’étape Rôle':'Indisponibles'}</dd></div></>}
            {draft.tab==='Société' && <>{fact('population','Population')}{fact('languages','Langues')}</>}
            {draft.tab==='Relations' && <div className="ng-fact"><dt>Relations diplomatiques</dt><dd>Indisponibles avant le lancement</dd></div>}
          </dl><small className="ng-note">Données datées du catalogue, sans valeur illustrative. {country?.sources.details?.[0]?.name}</small></div>
          <details className="ng-catalog" open={catalogOpen} onToggle={e=>setCatalogOpen(e.currentTarget.open)}><summary>Catalogue complet des pays</summary><label className="ng-catalog-label">Tous les pays<select aria-label="Catalogue complet des pays" value={draft.countryId} onChange={e=>chooseCountry(e.target.value)}>{countries.slice().sort((a,b)=>a.commonName.localeCompare(b.commonName)).map(c=><option key={c.id} value={c.id}>{c.commonName}{available.has(c.id)?'':' — démarrage indisponible'}</option>)}</select></label></details>
        </>}
        {draft.step===1 && <div className="ng-role-panel"><h2>Choisir votre rôle</h2><p className="ng-note">La fonction réellement occupée détermine les pouvoirs. Aucun poste n’est attribué par cet écran.</p><div className="ng-paths">{(['national_leader','opposition_party_leader'] as const).map(path=><button key={path} aria-pressed={draft.path===path} disabled={!options.paths[path].candidates.length} onClick={()=>update({path,personId:''})}>{pathLabels[path]}<small>{options.paths[path].candidates.length?`${options.paths[path].candidates.length} choix admissible(s)`:'Indisponible'}</small></button>)}</div>
          {!candidates.length && <p className="ng-unavailable">Aucun personnage admissible pour cette voie.</p>}
          {candidates.map(p=><button key={p.personId} className="ng-person" aria-pressed={person?.personId===p.personId} onClick={()=>update({personId:p.personId})}><strong>{p.displayName}</strong><span>{p.partyId?options.parties.find(party=>party.partyId===p.partyId)?.displayName??'Parti indisponible':'Affiliation indisponible'}</span><small>{p.office?.title??'Aucune fonction publique'} · {p.provenanceBasis==='modelled_fallback'?'Personnage fictif modélisé':'Personnage fictif du jeu'}</small></button>)}
          <details><summary>Indisponibilités et limites institutionnelles</summary>{options.unavailableReasons.map(r=><p key={r}>{r}</p>)}{options.paths[draft.path].unavailable.map(p=><p key={p.personId}><strong>{p.displayName}</strong> — {p.reasons.join(' ')}</p>)}{options.parties.filter(p=>!p.leaderPersonIds.length).map(p=><p key={p.partyId}>{p.displayName} — {p.status} · {p.limitation}</p>)}</details>
          <p className="ng-note">Diriger un parti d’opposition n’accorde ni l’initiative législative gouvernementale ni l’accès aux informations du gouvernement.</p>
        </div>}
        {draft.step===2 && <div className="ng-configuration"><h2>Configuration</h2><dl><div className="ng-fact"><dt>Date de départ</dt><dd>1er janvier 2026 — fixe</dd></div><div className="ng-fact"><dt>Scénario</dt><dd>Monde canonique</dd></div><div className="ng-fact"><dt>État initial</dt><dd>En pause</dd></div></dl><p>Aucun scénario historique ni niveau de difficulté supplémentaire n’est disponible.</p></div>}
        {draft.step===3 && <div className="ng-recap"><h2>Récapitulatif</h2><dl><div className="ng-fact"><dt>Pays</dt><dd>{country?.commonName}</dd></div><div className="ng-fact"><dt>Parcours</dt><dd>{pathLabels[draft.path]}</dd></div><div className="ng-fact"><dt>Personnage</dt><dd>{person?.displayName??'Indisponible'}</dd></div><div className="ng-fact"><dt>Fonction</dt><dd>{person?.office?.title??'Aucune fonction publique'}</dd></div><div className="ng-fact"><dt>Départ</dt><dd>1er janvier 2026 · en pause</dd></div></dl><h3>Limites institutionnelles</h3><p>{person?.office?.limitations.join(' ')||'Cette voie ne crée aucun pouvoir exécutif.'}</p>{person?.provenanceLimitation && <p className="ng-note">{person.provenanceLimitation}</p>}</div>}
        {error && <p role="alert" className="ng-unavailable">{error}</p>}
        <div className="ng-step-actions">{draft.step>0 && <button className="ng-back" onClick={()=>update({step:draft.step-1})}>← Précédent</button>}<button className="ng-continue" disabled={!canContinue} onClick={()=>{if(draft.step<3)next();else if(person){try{onConfirm(draft.countryId,draft.path,person.personId);}catch(e){setError(e instanceof Error?e.message:String(e));}}}}>{draft.step===3?'Lancer la campagne':'Continuer'} <span>→</span></button></div>
      </section>
    </div>
    <div className="ng-attribution">Texture nocturne historique NASA (2016) · décor hors ligne, pas une observation 2026</div>
  </main>;
}
