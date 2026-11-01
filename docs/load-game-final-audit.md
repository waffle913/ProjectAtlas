# Audit final groupé — Charger une partie

Parent conservé : ce4cea59608fa7ef0100c64f3172051de439ef1c. Branche existante ui/load-game-globe, aucune réinitialisation depuis main. Mission de finalisation UI, pas de nouveau jalon moteur.

## Plan sans code

1. Relire le diff récent, les contrats opérations/information/multilatéral et BUGS_CONNUS. Confirmer les deux CI du parent et rechercher la PR existante.
2. Audit territorial : propriété/contrôle/occupation distincts, indépendant des rapports et du personnage conformément à la direction explicite de l'utilisateur ; maintien du filtrage pour les détails militaires. Examiner transferts, contesté étranger, correspondances régionales, couverture partielle, frontières internes, sauvegardes A/B/A et absence de mutation.
3. Audit actualités : préserver le projecteur existant ; corriger uniquement les anomalies démontrées de dates, formulation, tri, doublons et importance. Pas de nouvelle chronologie canonique ni d'événement reconstruit sans preuve enregistrée.
4. Compléter les régressions unitaires ciblées et la fixture navigateur : guerre étrangère via les commandes existantes et IDs canoniques, jamais donnée de production ; captures dédiées aux actualités nationales/internationales sur les deux viewports et à 150 %, plus sans WebGL.
5. IMPLEMENTATION puis REVIEW séparée du diff réel. Aucune migration/schema/économie/règle militaire/sauvegarde modifiés. Contrôler particulièrement informations secrètes, dates futures, inconnues, référence historique de cession, fin de guerre != traité.
6. Exécuter exclusivement GitHub Actions : tests ciblés, build, parcours Charger, régression Nouvelle partie et verify Linux/Windows. Lire les journaux, récupérer les nouvelles images du runner et les examiner. Aucun test/build/benchmark/application locale.
7. Rapport unique des anomalies/correctifs/limites, mise à jour documentaire et galerie, commit/push puis PR vers main sans fusion.

## Constats initiaux

- Verify parent 41268584176 : success ; load-game-ui 41268584225 annoncé vert, à recouper avec les jobs.
- Aucune PR ouverte de ui/load-game-globe trouvée au début.
- Contrôle territorial actuel global correctement indépendant des rapports : conserver ce correctif.
- Tri importance avant date : la liste affichée peut être non chronologique ; conserver la priorité pour sélectionner les événements puis trier les éléments retenus par date.
- Briefing de résultat et décision correspondante peuvent se répéter ; dédupliquer à partir de leurs références enregistrées déjà accessibles.
- Une restriction à effet différé est formulée comme une entrée en application enregistrée ; distinguer déclaration et applicabilité présente, sans annoncer l'événement futur comme accompli.
- Une composante manquante d'une région multi-feature peut être silencieusement acceptée ; vérifier les sourceFeatureIds déjà canoniques et signaler le repli.
- Texte de refus des renseignements militaires devenu contradictoire avec la carte mondiale : corriger le libellé, pas les droits.

Risques : couverture historique bornée, absence d'historique d'occupations achevées, contours généralisés, coût des grandes fixtures, chronologie intrajournalière limitée aux preuves enregistrées. Ces limites doivent rester explicites.

## Revue du diff après implémentation

| Sujet audité | Constat / décision | Preuve ou validation attendue |
|---|---|---|
| Cadence des rapports / opposition | Correctif récent conservé : statut régional global sauvegardé, rapports tactiques détaillés filtrés | Tests occupation entre rapports et sans fonction, contrôle étranger contesté |
| Cession et frontières | Aucun nouveau transfert ; source exclusive regionOwnership, suppression des segments partagés du même souverain | Test réel contours Canada/Maine et reprise A/B/A |
| Géométrie partielle | Corrigé : une région n'est complète que si tous ses sourceFeatureIds uniques sont présents et polygonaux, fermés, finis et géographiquement admissibles | Test composante manquante et coordonnées invalides ; repli explicite |
| Aperçu / campagne active | Aucun changement du chemin de restauration détachée ni de l'horloge | Comparaison par resauvegarde via l'interface du jeu ; date, tick, seed, pause, personne, propriété et occupation |
| Chronologie | Corrigé : sélectionner les 12 événements majeurs puis afficher les éléments retenus par date décroissante, importance et ID comme départages stables | Test ordre et priorité des faits majeurs sur événements mineurs |
| Doublons | Corrigé : résultat parlementaire accessible avec référence explicite à la proposition et même date remplace l'entrée de décision correspondante | Test briefing/résultat de loi ; aucune suppression déduite d'une simple similarité de titres |
| Événements futurs | Déclarations futures ignorées ; restriction différée présentée comme non encore applicable, levée future non annoncée | Test déclaration/application/levée ; contrôles existants des briefings et évaluations |
| Crises et droits | Ne pas convertir les épisodes cachés en actualités ; seuls les briefings accessibles existants sont projetés | Test crise publique visible et briefing gouvernemental exclu pour le personnage sans fonction |
| Diplomatie | Conservation des évaluations accessibles et datées, sans exposer leurs drivers cachés | Tests existants conservés ; traités, restrictions et guerre étrangère projetés depuis les enregistrements |
| Libellé militaire | Corrigé : le refus concerne les rapports détaillés, pas la carte régionale publique globale | Libellé aligné avec le correctif territorial antérieur |
| Visuel | Composition existante conservée ; nouvelles captures dédiées à chaque rubrique, aux deux tailles et à 150 %, plus sans WebGL | Nouveau parcours navigateur ; images à relire après run |
| Périmètre | Aucune règle moteur, migration, donnée canonique, stockage, BUG-001 ou animation UX-001 modifié | Diff contre le parent ce4cea59 et contre main pour les chemins protégés |

La nouvelle guerre étrangère des captures est une fixture synthétique Allemagne–France, ajoutée par createClaim et declareLimitedWar avec des IDs canoniques. Elle n'est pas une observation de 2031 ni une simulation historique revendiquée. Les trois sauvegardes du test passent la sérialisation/restauration et les invariants sur le runner avant utilisation par le navigateur.

## Limites restantes, explicites

- La sauvegarde conserve les déclarations et issues des guerres, mais pas un journal exhaustif des occupations déjà levées. Aucune occupation passée n'est reconstruite.
- Une victoire territoriale enregistrée établit le transfert appliqué par cette guerre ; elle n'établit jamais une signature de traité de paix distincte. Un transfert ultérieur éventuel ne réécrit pas le récit historique de cette guerre.
- Seuls les événements de traités réellement conservés dans history apparaissent, pas des signatures inférées depuis status ; les historiques sont bornés par le moteur. Les crises sans briefing accessible restent absentes.
- Une date au jour ne fournit pas toujours un ordre intrajournalier : les égalités sont résolues par importance puis ID stable, sans inventer d'heure ou de séquence historique.
- Douze nouvelles au maximum par rubrique : la sélection donne priorité à l'importance enregistrée/interprétée par type, puis le rendu reste chronologique. Il ne s'agit pas d'un nouveau journal canonique.
- Les décisions dépourvues de date ne deviennent pas des actualités datées fictivement. Les données économiques absentes restent indisponibles, les zéros réels restent des valeurs.
- Les statuts régionaux sont affichés globalement conformément à la demande ; cela ne révèle pas les unités, forces ou renseignements gouvernementaux. L'absence de rayures ne signifie pas absence de conflit.
- Les contours Natural Earth sont généralisés. Les zones non mappées restent explicitement indisponibles ; aucune frontière nationale entière n'est recolorée pour remplacer une région manquante.
- Les rapports diplomatiques conservent leur ancienneté et leur qualité ; les valeurs réelles internes ne sont pas automatiquement transmises au personnage.
- Le panneau se parcourt par défilement, notamment à 150 %. Le retour de Paramètres/Crédits revient à la liste. Certains noms et sources canoniques restent anglais.
- Les captures sont celles de Chromium/SwiftShader et du build réel avec IPC natif de test simulé : elles ne valident pas le webview/Rust Tauri. Le quota du stockage web n'est pas modifié. Aucune fixture synthétique n'est distribuée dans les données du produit.

## Validation

Parent ce4cea59 : les deux jobs Linux/Windows de verify 41268584176 sont success. Aucun correctif moteur n'est justifié par ce résultat. La CI dédiée du parent et les validations de cette passe sont recensées ci-dessous ; les contrôles de la PR portent aussi sur la livraison documentaire finale. Aucun test, build, benchmark ou lancement applicatif local.

### Résultats de la passe de finalisation

- Code audité : `8ebde066751f933fad4c6d3baa4b47d91ad8db46`, extension minimale de `ce4cea59608fa7ef0100c64f3172051de439ef1c`.
- [load-game-ui 41271227366](https://github.com/waffle913/ProjectAtlas/actions/runs/41271227366) : **success**. Commande ciblée inchangée : `npm test -- src/app/__tests__ src/components/__tests__ src/simulation/__tests__/startSelection.test.ts src/simulation/__tests__/executiveAuthority.test.ts --maxWorkers=1` : **23 fichiers, 196 tests réussis**.
- `npm run build` : type-check/compilation réussis, Vite 706 ms.
- `npx playwright test --config=playwright.load-game.config.ts` : **2 scénarios réussis**, 54,5 s, incluant les nouvelles captures des deux rubriques.
- `npx playwright test --config=playwright.new-game.config.ts` : **2 régressions existantes réussies**, 35,4 s.
- [verify général 41271227358](https://github.com/waffle913/ProjectAtlas/actions/runs/41271227358) : résultat consultable dans le run et dans le bilan de la [PR nº 2](https://github.com/waffle913/ProjectAtlas/pull/2), qui recense les contrôles généraux après leur achèvement.
- Captures : artefact **13069009170**, source exacte `8ebde066751f933fad4c6d3baa4b47d91ad8db46`, [galerie](load-game-captures/README.md). Inspection des deux tailles, de 150 %, de l'état cédé et du repli sans WebGL : textes accessibles par défilement, bouton de chargement fixe et utilisable, légende/aide distinctes, dates/provenances visibles. La guerre étrangère provient de la fixture validée, pas d'un récit ajouté à l'interface.
- Le diff des chemins protégés `src/simulation`, `src/data`, `public/data`, `src-tauri` contre le parent reste vide. Aucun système canonique n'a changé.

## Révision conjointe

[PR nº 2 vers main](https://github.com/waffle913/ProjectAtlas/pull/2). Le corps de la PR regroupe les liens de validation généraux et desktop avec leur statut final ; ses contrôles GitHub restent directement consultables. La branche est conservée et aucune fusion automatique n’est autorisée. Les captures proviennent exclusivement du run 41271227366 et reflètent le code audité 8ebde066 ; les commits documentaires suivants ne changent pas ce code.
