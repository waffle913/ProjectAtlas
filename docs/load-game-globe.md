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

Résultats, captures et liens à compléter après les runners. Aucun test/build/benchmark local.
