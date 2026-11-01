import { useEffect, useMemo, useState } from 'react';
import { deleteSave, inspectSaveCatalog, type SaveEntry } from '../app/saveStorage';
import type { Country, SimulationState, Territory } from '../types';
import type { LoadedRegionData } from '../data/regionData';
import { campaignPresentation } from '../app/loadCampaign';
import { savedGeography, type SavedGeography } from '../app/savedGeography';
import { CountryGlobe } from './new-game/CountryGlobe';
import { politicalRegistry } from '../simulation/politics/registry';
import { Icon, AtlasMark } from './MainMenu';
import './new-game/NewGameSetup.css';
import './SaveManager.css';


const dateText=(date:string)=>new Date(date+'T00:00:00Z').toLocaleDateString('fr-FR',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'});
export function SaveManager({onLoad,onBack,error,onPreview,territories=[],regions,countries=[],uiScale=1,onNewGame,onSettings,onCredits,onExit}:{
  onLoad:(id:string)=>void; onBack:()=>void; error?:string;
  onPreview:(id:string)=>SimulationState; territories?:readonly Territory[]; regions?:LoadedRegionData; countries?:readonly Pick<Country,'id'|'commonName'|'externalIds'>[]; uiScale?:number;
  onNewGame:()=>void;onSettings:()=>void;onCredits:()=>void;onExit:()=>void;
}) {
  const [catalog,setCatalog]=useState(inspectSaveCatalog);
  const [selection,setSelection]=useState<{entry:SaveEntry;state:SimulationState}>();
  const [readError,setReadError]=useState<string>();
  const [pendingDelete,setPendingDelete]=useState<string>();
  const [busy,setBusy]=useState(false);
  const [geography,setGeography]=useState<SavedGeography>();
  const [mapError,setMapError]=useState<string>();
  const [detail,setDetail]=useState<string>();
  const presentation=useMemo(()=>selection?campaignPresentation(selection.state):undefined,[selection]);
  const mapOptions=useMemo(()=>({saved:true,regionPicking:true,focusCountryId:presentation?.countryId}),[presentation?.countryId]);
  const names=useMemo(()=>new Map([...countries.map(c=>[c.id,c.commonName] as const),...(regions?.registry.regions??[]).map(r=>[r.id,r.commonName] as const)]),[countries,regions]);
  useEffect(()=>{
    setGeography(undefined);setMapError(undefined);setDetail(undefined);
    if(!selection || !regions)return;
    const abort=new AbortController();
    savedGeography(selection.state,regions,territories,abort.signal).then(value=>{if(!abort.signal.aborted)setGeography(value);}).catch(e=>{if(!abort.signal.aborted)setMapError(String(e));});
    return()=>abort.abort();
  },[selection,regions,territories]);
  const choose=(entry:SaveEntry)=>{
    try {const state=onPreview(entry.id);setSelection({entry,state});setPendingDelete(undefined);setReadError(undefined);}
    catch(e){setReadError('Sauvegarde inaccessible ou incompatible : '+(e instanceof Error?e.message:String(e)));}
  };
  const remove=async(id:string)=>{
    setBusy(true);try{await deleteSave(id);setCatalog(inspectSaveCatalog());setPendingDelete(undefined);setSelection(current=>current?.entry.id===id?undefined:current);setReadError(undefined);}
    catch(e){setReadError('Suppression impossible : '+(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}
  };
  const deletion=(id:string)=>pendingDelete===id?<div className="lg-confirm" role="alertdialog" aria-label="Confirmer la suppression"><p>Supprimer définitivement cette sauvegarde ?</p><button disabled={busy} onClick={()=>void remove(id)}>Confirmer la suppression</button><button disabled={busy} onClick={()=>setPendingDelete(undefined)}>Annuler</button></div>:<button className="lg-delete" onClick={()=>setPendingDelete(id)}><span aria-hidden="true">⌫</span> Supprimer</button>;
  const clear=()=>{setSelection(undefined);setPendingDelete(undefined);setReadError(undefined);};
  const person=presentation?.person;
  const countryId=presentation?.countryId;
  const country=countryId?names.get(countryId):undefined;
  const countryCode=countries.find(c=>c.id===countryId)?.externalIds.isoAlpha2;
  const national=presentation?[...presentation.summary.events,...presentation.summary.decisions,...presentation.summary.situations]:[];
  const current=selection?.state.date;
  const military=presentation?.operations;
  return <main className={`new-game-setup load-game-setup${uiScale>1.1?' ng-large-ui':''}`} lang="fr" style={{'--ng-scale':uiScale} as React.CSSProperties}>
    {selection && geography && <CountryGlobe territories={territories} selectedId={countryId??''} onSelect={setDetail} names={names} savedPolygons={geography.polygons} renderOptions={mapOptions}/>}
    <aside className="ng-sidebar"><div className="ng-brand"><AtlasMark/><span>PROJECT</span><strong>ATLAS</strong></div><nav aria-label="Navigation de campagne">
      <button onClick={onBack}>← Retour au menu</button>
      <button onClick={onNewGame}><Icon name="globe"/>Nouvelle partie</button>
      <button className="active" onClick={clear}><Icon name="folder"/>Charger une partie</button>
      <button onClick={onSettings}><Icon name="settings"/>Paramètres</button>
      <button onClick={onCredits}><Icon name="book"/>Crédits</button>
      <button onClick={onExit}><Icon name="power"/>Quitter</button>
    </nav></aside>
    {!selection?<section className="lg-list-panel" aria-label="Liste des sauvegardes"><header><Icon name="folder"/><h1>Charger une partie</h1></header>
      <p>Choisissez une sauvegarde pour consulter son aperçu.</p>
      {catalog.warnings.map((w,i)=><p key={i} className="save-error" role="alert">{w}</p>)}
      {!catalog.entries.length && <p className="save-empty">Aucune sauvegarde disponible.</p>}
      <ul>{catalog.entries.map(entry=><li key={entry.id}><button className="lg-save-name" onClick={()=>choose(entry)}><strong>{entry.metadata.name}</strong><small>{entry.id==='__autosave__'?'Sauvegarde automatique':'Sauvegarde manuelle'}</small></button>{deletion(entry.id)}</li>)}</ul>
      {readError && <p className="save-error" role="alert">{readError}</p>}
      {error && <p className="save-error" role="alert">{error}</p>}
      <button onClick={()=>setCatalog(inspectSaveCatalog())}>Actualiser la liste</button>
    </section>:<>
      <header className="lg-heading"><span>CHARGER UNE PARTIE</span><h1>{selection.entry.metadata.name}</h1><p>Instantané du {dateText(current!)} · lecture seule</p></header>
      <section className="lg-map-notice" aria-label="Couverture de la carte">
        {!geography && !mapError && <p role="status">Préparation des géométries de la sauvegarde…</p>}
        {mapError && <p role="alert">Carte indisponible : {mapError}</p>}
        <p>Souveraineté enregistrée · Or : {country??'pays indisponible'} · Rayures : occupation connue · Orange : contesté</p>
        <p>Contrôle militaire limité aux rapports accessibles et datés ; les zones sans rapport ne sont pas déclarées pacifiées.</p>
        {geography && geography.warnings.length>0 && <details><summary>Couverture géographique partielle ({geography.warnings.length})</summary>{geography.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
        {detail && <p role="status"><strong>{names.get(detail)??detail}</strong>{regions?.regionsById.has(detail)?` · Souverain : ${names.get(selection.state.regionOwnership[detail]??'')??'indisponible'}`:' · vue du pays'}{geography?.polygons.find(p=>p.regionId===detail)?.control==='occupied'?` · Occupation connue : ${names.get(geography.polygons.find(p=>p.regionId===detail)?.controllerId??'')??'indisponible'}`:geography?.polygons.find(p=>p.regionId===detail)?.control==='contested'?' · Contrôle contesté':''}</p>}
      </section>
      <section className="lg-campaign-panel" aria-label="Aperçu de campagne"><div className="lg-panel-scroll">
        <header className="lg-country"><span className="lg-country-code" aria-label="Code du pays">{countryCode??'—'}</span><div><h2>{selection.entry.metadata.name}</h2><p>{country??'Pays joué indisponible'}</p></div></header>
        <dl className="lg-facts"><div><dt>Date de la partie</dt><dd>{dateText(current!)}</dd></div><div><dt>Personnage</dt><dd>{person?.displayName??'Indisponible'}</dd></div><div><dt>Fonction occupée</dt><dd>{person?.office?.title??'Aucune fonction enregistrée'}</dd></div><div><dt>Mode</dt><dd>{selection.entry.id==='__autosave__'?'Sauvegarde automatique':'Sauvegarde manuelle'}</dd></div></dl>
        <section><h3>Aperçu</h3><p>État enregistré à la date de la sauvegarde. Consulter cet aperçu ne remplace pas la campagne active.</p><p>Population actuelle : indisponible dans les rapports accessibles.</p>
          {presentation?.economicReports.length?presentation.economicReports.map(r=><p key={r.id}>Chômage : {r.valueBps!==undefined && r.status!=='unavailable'?(r.valueBps/100).toLocaleString('fr-FR')+' %':'indisponible'} · {r.asOfDate} · {r.status} · couverture {r.coverage}<small>{r.limitation}</small></p>):<p>Indicateurs économiques : aucun rapport actuel accessible. Les statistiques initiales ne sont pas substituées.</p>}
          <p>Situation politique : {person?.isPartyLeader?'direction de parti enregistrée':'aucune direction de parti enregistrée'}{person?.partyId?' · '+(politicalRegistry.parties[person.partyId]?.displayName??person.partyId):''}.</p>
        </section>
        <section><h3>Actualités nationales</h3>{national.length?<ul>{national.map(item=><li key={item.id}><strong>{item.title}</strong><p>{item.detail}</p>{item.date && <small>{dateText(item.date)}</small>}</li>)}</ul>:<p>Aucune actualité nationale disponible.</p>}</section>
        <section><h3>Situation militaire</h3>{military?<><p>Rapport du {dateText(military.asOfDate)}{military.stale?' — daté, ne décrit pas le contrôle actuel':''} · {military.status}</p>{military.wars.map(w=><p key={w.warId}>{names.get(w.targetRegionId)??w.targetRegionId} · {({sovereign_controlled:'contrôle souverain',foreign_controlled:'contrôle étranger',contested:'contesté'})[w.control]} · {names.get(w.enemyCountryId)??w.enemyCountryId}</p>)}<small>{military.limitation}</small></>:<p>Aucun rapport militaire accessible. Aucun contrôle ennemi révélé.</p>}</section>
        <section><h3>Actualités internationales</h3>{presentation?.international.length?presentation.international.map(a=><p key={a.pairKey}>Rapport du {a.lastEvaluatedOn} · {names.get(a.countryAId)??a.countryAId} / {names.get(a.countryBId)??a.countryBId} · {a.phase} · {a.severity}{a.stale?' · rapport daté':''}</p>):<p>Aucune actualité internationale disponible.</p>}<small>La sauvegarde ne fournit pas de journal international exhaustif accessible. Aucun récit n’est reconstruit depuis l’état caché.</small></section>
        {readError && <p className="save-error" role="alert">{readError}</p>}{error && <p className="save-error" role="alert">{error}</p>}
      </div><footer><button className="lg-load" onClick={()=>onLoad(selection.entry.id)}>Charger la campagne →</button><div><button onClick={clear}>← Retour à la liste</button>{deletion(selection.entry.id)}</div></footer></section>
    </>}
    <small className="lg-attribution">Texture NASA Earth Observatory (2016), décor historique · géométries Natural Earth existantes</small>
  </main>;
}
