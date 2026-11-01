# Charger une partie — architecture et limites

Branche : ui/load-game-globe, depuis main bf6b7b2 (menu Nouvelle partie déjà intégré). Référence fournie : maquette Canada, inspiration de composition, jamais donnée de campagne. Pas de bandeau des quatre étapes, pas de liste flottante sur le globe.

## Lecture et restauration

SaveManager utilise exclusivement le backend de saveStorage existant. inspectSaveCatalog ajoute une lecture diagnostique : erreurs du stockage, index illisible, fichiers orphelins et entrées indexées dont le fichier manque restent visibles, au lieu de masquer les autres sauvegardes. Aucun second index, format ou stockage. Les noms sont principalement affichés ; __autosave__ conserve son identité automatique. Supprimer nécessite une confirmation explicite et attend la réponse du backend.

Sélection : App relit loadSave et appelle restoreSimulationState dans un instantané détaché pour appliquer les migrations compatibles et vérifier les invariants. Ce n'est pas une installation dans le monde actif : aucun applyState, SimulationClock, tick, commande, écriture, ni progression. Chargement : le bouton explicite relit et valide à nouveau, puis seulement installe l'état par le chemin applyState existant. Le changement éventuel du fichier depuis l'aperçu est donc soumis à une nouvelle validation. Les migrations ne sont pas réenregistrées automatiquement.

Quitter l'aperçu conserve la campagne active. Paramètres/Crédits ouverts depuis Charger reviennent à la liste, et le retour final retrouve l'écran d'origine (menu, jeu ou Nouvelle partie). Le maintien de l'aperçu à travers Paramètres est une finition non implémentée ; aucune campagne n'est chargée implicitement.

## Géopolitique et accès à l'information

savedGeography est une projection graphique éphémère de regionOwnership, sans deuxième source d'appartenance. Le catalogue mondial sert aux noms et aux géométries ; aucune statistique de départ n'est utilisée comme donnée actuelle. Les pays de départ non modifiés gardent leur couche de navigation Admin0 ; le pays joué, les pays parents de régions transférées, les nouveaux souverains et les pays couverts par un rapport opérationnel accessible utilisent les actifs Admin1 déjà liés aux IDs permanents. Aucun identifiant n'est créé depuis ISO ou un nom.

Le Maine possède une géométrie admissible : region.48cfa977-7483-4227-9ae0-f1d1ad3cff07, actif local des États-Unis, source Natural Earth Admin1 déjà embarquée. Les arêtes communes entre polygones de même souverain sont retirées des frontières internationales ; les couleurs n'attribuent jamais la souveraineté. Les triangles/rayures portent sur la région précise, jamais sur tout le pays national.

Souveraineté, contrôle effectif et occupation restent distincts. Une rayure exige un rapport opérationnel gouvernemental accessible, à la date exacte de sauvegarde, un contrôle étranger enregistré cohérent et un occupant conforme aux composantes décisives canoniques. Le contesté accessible est orange. Aucun détail de force ennemi ou installation cachée n'est exposé. Une guerre terminée ne signifie pas cession : seule l'appartenance enregistrée détermine le contour souverain.

Limite importante : le contrat existant ne fournit pas une carte omnisciente accessible à tous. Les rapports ne couvrent que les objectifs de guerre connus et peuvent être périmés. L'opposition n'obtient pas l'accès gouvernemental ; les occupations non connues ne sont pas révélées. Le globe indique explicitement cette restriction et ne prétend pas que toutes les zones sans rayures sont pacifiées. Une souveraineté affichée en or ne constitue pas une affirmation de contrôle militaire observé. Les régions sans géométrie sont listées comme indisponibles, sans polygone inventé. Les contours sont généralisés Natural Earth, pas un relevé cadastral ; les raccords avec les pays de contexte Admin0 ont cette précision moindre.

## Informations de campagne

Identité/personnage/fonction proviennent de la sauvegarde validée. Les agrégats existants simulatedPopulationByCountry et simulatedMonthlyOutputByCountry sont utilisés seulement avec accès gouvernemental ; ils restent des dérivations simulées, sous souveraineté, pas des observations ou un PIB annuel. La production n'est affichée qu'avec un dernier relevé mensuel daté, étiqueté avec sa date. Les valeurs absentes restent indisponibles et zéro reste une valeur légitime.

Les événements/décisions/situations nationales réutilisent campaignSummary (dates, statut de preuve et droits d'accès). Les évaluations internationales existantes accessibles sont affichées comme rapports datés, non comme récit inventé. En leur absence : Aucune actualité internationale disponible. Il n'existe pas de journal international exhaustif et aucun historique de traité/guerre n'est reconstruit artificiellement. Les données moteur brutes ne deviennent pas automatiquement des informations gouvernementales.

## Rendu partagé et périmètre

CountryGlobe et globeRenderer sont étendus par options facultatives ; Nouvelle partie conserve ses paramètres par défaut. Même texture NASA 2016 hors ligne, mêmes licences/crédits, rendu à la demande, commandes souris/clavier, destruction des ressources et repli WebGL honnête. Les rayures sont un shader graphique, sans changement d'état. Aucun nouvel asset mondial ni dépendance.

BUG-001 (contrôle des installations) et UX-001 (animations) sont inchangés. Aucun moteur, donnée mondiale, schéma, migration, règle de guerre, transfert ou système économique n'est modifié. Seule une lecture diagnostique additive touche saveStorage ; listSaves/loadSave/deleteSave et la chaîne de mutation restent conservés.

## Validation distante

Tests/build/compilation exclusivement GitHub Actions. Les fixtures de tests Canada 2031 sont des instantanés synthétiques explicitement nommés TEST SYNTHÉTIQUE, avec date future mise en scène, sans histoire simulée revendiquée. Elles utilisent les fonctions existantes (initialisation, claim, guerre, recomputeControl, endWar, rapports et sérialisation), passent les invariants et ne sont jamais importées par le produit. Le Canada ne dispose pas d'une voie d'opposition de départ admissible dans le registre : le cas sans accès utilise donc un personnage de test sans fonction explicitement créé, sans inventer une éligibilité.

Résultats finaux ci-dessous. Aucun test/build/benchmark local.

Le test navigateur utilise le build réel et l'adaptateur natif existant avec une frontière IPC de test explicitement simulée : les instantanés complets dépassent le quota localStorage. Ils sont servis seulement dans le dist éphémère du runner, jamais dans le build livré ni les données du dépôt. Cela ne valide pas le webview/Rust Tauri natif ; le rendu est Chromium/SwiftShader. Le quota du stockage navigateur demeure une limite existante, hors modification du stockage demandée. Les assertions finales resauvegardent via l'interface du jeu et comparent date/tick/seed/pause/personne/souveraineté/occupation pour vérifier que l'aperçu d'une autre sauvegarde n'a pas remplacé la campagne active.

Relecture : une évaluation opérationnelle peut précéder une paix décidée le même jour. Le panneau l'identifie comme archivée si la guerre est terminée, et précise qu'elle ne remplace pas l'appartenance souveraine sauvegardée. La couche de rayures exige en plus la cohérence avec le contrôle/occupation actuels de cet instantané. Les styles des en-têtes et actions sont isolés des règles globales de l'interface en jeu.

## Résultats de livraison

Code et tests validés : `13598aa8400e7178b374f8fac83df3fad9f835cc`. [Workflow load-game-ui réussi](https://github.com/waffle913/ProjectAtlas/actions/runs/41266820581) :
- `npm test -- src/app/__tests__ src/components/__tests__ src/simulation/__tests__/startSelection.test.ts src/simulation/__tests__/executiveAuthority.test.ts --maxWorkers=1` : **22 fichiers, 184 tests réussis**. Tests réels de géométrie Maine/Canada, retrait des anciennes frontières internes après cession, A/B/A indépendants, occupation/contesté, refus de données militaires à un personnage sans fonction, dates futures, absence != zéro, index et sauvegardes défectueux, sélection/chargement/suppression distincts.
- `npm run build` : type-check et compilation de production réussis (Vite : 525 ms).
- `npx playwright test --config=playwright.load-game.config.ts` : **2 scénarios réussis**, 33,8 s. Liste/aperçu, erreurs corrompue/incompatible/introuvable, sauvegardes indépendantes, véritable restauration finale, absence d'écriture pendant les aperçus, resauvegarde comparative de la campagne active, suppression confirmée, absence de WebGL, deux viewports et 150 %. La légende et l'aide ne se chevauchent plus à grande échelle.
- `npx playwright test --config=playwright.new-game.config.ts` : **2 scénarios existants réussis**, 23,3 s (globe, parcours Nouvelle partie, menu principal et repli).
- [Verify général Linux/Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41266820585) encore en cours lors de la publication : aucune réussite globale revendiquée. La PR reste destinée à la révision, sans fusion automatique.
- [Galerie des captures réelles](load-game-captures/README.md), artefact `13068051009`, SHA `13598aa8400e7178b374f8fac83df3fad9f835cc`. Téléchargement et inspection locale des images du runner uniquement ; aucune application, compilation, suite de tests ou benchmark exécuté sur le PC local.
- Relecture du diff contre main : aucun fichier de `src/simulation`, `src/data`, `public/data` ou `src-tauri` modifié. Aucun schéma ou migration ajouté.

Les premiers échecs CI ont permis de corriger la fixture d'opposition canadienne indisponible, le type du catalogue, puis le transport de gros instantanés via la frontière IPC native de test. Les protections moteur n'ont pas été relâchées pour faire passer ces tests. Les captures Canada 2031 représentent exclusivement cette fixture synthétique, pas une campagne réelle de l'utilisateur.

Inventaire principal : `src/App.tsx` (routage/aperçu détaché), `src/components/SaveManager.tsx` et `.css`, `src/app/loadCampaign.ts`, `src/app/savedGeography.ts`, lecture diagnostique de `saveStorage.ts`, options du globe partagé, tests unitaires, `tests/load-game/*`, `playwright.load-game.config.ts`, workflow dédié, documentation et captures. Pas de nouvelle dépendance ou ressource mondiale.

Limites à réviser : données géographiques manquantes avec repli explicite ; limites de précision Admin0/Admin1 ; contrôle militaire uniquement connu dans les rapports accessibles (pas une carte omnisciente) ; rapports possibles avant une décision du même jour ; journal international non exhaustif ; fonctions/noms de sources parfois en anglais ; aperçu réinitialisé vers la liste après Paramètres/Crédits ; défilement vertical à 150 % et dans le panneau ; rendu natif Tauri/Rust non exécuté par ces tests Chromium ; quota du stockage web inchangé. BUG-001 et UX-001 différés inchangés.
