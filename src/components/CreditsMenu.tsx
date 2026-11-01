import {useState} from 'react';
import { AtlasMark } from './MainMenu';
import './MenuTheme.css';
export function CreditsMenu({onBack}:{onBack:()=>void}){
  const [notice,setNotice]=useState<{title:string;text:string}>();
  async function showNotice(title:string,path:string){
    try{const response=await fetch(path);if(!response.ok)throw Error(String(response.status));setNotice({title,text:await response.text()});}
    catch(error){setNotice({title,text:'Notice indisponible : '+String(error)});}
  }
  return <main className="menu-page credits-screen" lang="fr"><section className="menu-frame">
    <header className="menu-heading"><div className="menu-wordmark"><AtlasMark small/><span>PROJECT ATLAS</span></div><button onClick={onBack}>← Back / Retour</button></header>
    <h1>Crédits et sources</h1><p>ProjectAtlas — simulation géopolitique. Les notices du dépôt et la provenance des données font référence.</p>
    <div className="credits-grid">
      <section><h2>Globe et interface</h2><p>Three.js — licence MIT.</p><button onClick={()=>void showNotice('Three.js — MIT','/globe/three-LICENSE.txt')}>Notice Three.js embarquée</button>
        <p>Icône Settings : Lucide Icons and Contributors — licence ISC.</p><button onClick={()=>void showNotice('Lucide Settings — ISC','/menu/lucide-settings-LICENSE.txt')}>Notice Lucide embarquée</button>
        <p>Texture nocturne historique 2016 : NASA Earth Observatory, Joshua Stevens ; données VIIRS de Miguel Román, NASA GSFC. Décor, pas observation de campagne.</p>
        <a href="https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps" target="_blank" rel="noreferrer">Source Black Marble</a> · <a href="https://www.nasa.gov/nasa-brand-center/images-and-media/" target="_blank" rel="noreferrer">Conditions NASA</a></section>
      <section><h2>Données et attributions</h2><p>Natural Earth : géométries existantes, Admin0 et Admin1. Les identifiants de ProjectAtlas restent permanents.</p>
        <p>Les catalogues documentent notamment IPU Parline, World Bank, UN World Population Prospects et WorldPop, avec dates, licences, sources et limites propres à chaque jeu de données.</p>
        <p>La licence d'un outil ne vaut pas licence de ses données. Les couvertures indisponibles et les confirmations de droits encore nécessaires restent signalées dans l'audit.</p>
        <a href="https://github.com/waffle913/ProjectAtlas/blob/main/docs/data-audit.md" target="_blank" rel="noreferrer">Audit des données</a><br/>
        <a href="https://github.com/waffle913/ProjectAtlas/blob/main/docs/new-game-globe.md" target="_blank" rel="noreferrer">Provenance des ressources du globe</a></section>
    </div>{notice && <section className="credits-notice"><h2>{notice.title}</h2><pre>{notice.text}</pre><button onClick={()=>setNotice(undefined)}>Fermer la notice</button></section>}<p className="menu-note">Les noms de sources ci-dessus ne constituent pas une approbation de ProjectAtlas. Aucune licence universelle des données n'est présumée.</p>
  </section></main>;
}
