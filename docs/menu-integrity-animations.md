# Plan — intégrité et animations des menus

## Plan de la passe corrective finale (avant code, 2026-11-01)

Départ vérifié : `66a658f096e6601915b111154fedcedf35527896`, PR #3 ouverte en brouillon, cible inchangée. Préserver les fichiers locaux `.reasonix` non suivis. Périmètre : sélecteurs accessibles et contrôles Audio, application native avant persistance du mode, cadrage dans le rectangle réellement visible, synchronisation observable des animations et couverture fallback/persistance. Aucun état canonique, format de campagne, migration, identifiant ou mécanisme de simulation modifié.

Dépendances : SettingsMenu/App/adaptateur natif existant, globe Three.js/OrbitControls et CSS partagés, fixtures IPC et workflows existants. Risques : réponses natives tardives, réglages concurrents, panneaux masquant le canvas, inertie résiduelle et assertions sur une transition déjà terminée. Tests : cinq scénarios menus renforcés, répétition indépendante animation, deux Charger et deux Nouvelle partie, unités caméra, verify Linux/Windows et Rust/build Windows via Actions. Revue séparée du diff avant publication. Arrêt demandé à la vérification GitHub : les résultats non encore obtenus resteront NON VÉRIFIÉS, sans fusion ni acceptation.

Parent : ui/load-game-globe ace4f7aac71d549c43762c5707f5070e36182245. Branche ui/menu-integrity-animations. PR vers ui/load-game-globe ; aucune modification de main, aucune fusion de la PR 2.

## Contrats et bloc d'implémentation

1. Session active : suivi de révision UI hors SimulationState, avec identité de session et accusé de sauvegarde après succès réel seulement. Continuer reprend cette session (date/tick/personne inchangés), charger la dernière sauvegarde devient une action séparée. Remplacement par nouvelle campagne/chargement et sortie nécessitent abandon explicite si progression non sauvegardée. Une ancienne écriture asynchrone ne peut pas marquer propre une autre session. Aucune sauvegarde implicite liée aux animations/navigation.
2. Navigation : conserver le brouillon Nouvelle partie et l'instantané d'aperçu sélectionné dans App lors d'un aller-retour Paramètres/Crédits. Les menus suspendent toujours l'unique horloge. Confirmation du remplacement au moment de l'installation finale, pas lors d'une simple consultation.
3. Présentation : thème commun Paramètres/Crédits/Pause/dialogues et transitions courtes purement CSS. Crédits issus des notices déjà documentées et ressources embarquées ; distinguer licences connues et données encore soumises aux limitations de provenance.
4. Paramètres : une seule échelle effective, champs v1 synchronisés pour compatibilité ; mouvement réduit = préférence utilisateur OU système. Auditer chaque réglage, désactiver explicitement audio, densité/temporisations/confirmations génériques non raccordées. Vitesse de départ parmi les vitesses réellement autorisées 1/2/5. Afficher échecs de persistance et d'application du mode natif.
5. Globe partagé : séparation sélection informative / focus caméra. France initialement présélectionnée en vue libre ; sélection explicite et recentrage demandent un focus. RAF de présentation uniquement, rotation libre lente, arrêt pendant interaction, inertie légère, trajet sphérique interpolé annulable et zoom selon l'étendue géographique. Glisser rend explicitement la caméra à la vue libre, sans effacer les informations du pays ; zoom en focus conserve son centre. Bouton Vue libre. Géométries et limites calculées/cachées uniquement à la sélection/montage, jamais reconstruites par image. Mouvement réduit = pas d'auto-rotation, inertie ou transition. Nettoyage RAF/observateurs/événements sur démontage.
6. Validation uniquement runners : unités session/préférences/caméra, E2E intégrité/navigation/rotation/interruption/mouvement réduit/persistance/sortie, régressions Charger et Nouvelle partie, captures 1920/1366 à 100/150 et sans WebGL. Build Windows installable + tests natifs via Actions.
7. REVIEW du diff réel après implémentation : frontières/occupations/actualités et droits inchangés, pas de moteur/données/schéma/sauvegarde modifiés. Mettre à jour UX-001 (obligatoire avant validation humaine), rapport consolidé, publier et PR sans fusion. Validation définitive et veto restent à l'utilisateur sur build Windows.

## Risques et choix de compatibilité

Le drapeau de pause posé par les menus n'est pas une modification de progression. Les ticks/commandes et changements explicites du contrôle d'horloge sont suivis ; l'accusé d'une sauvegarde concerne exclusivement la révision capturée et sa session. La fermeture native standard est interceptée et protégée par la modale ; une fermeture forcée du processus ne peut pas afficher de modale React. Le navigateur conserve son avertissement beforeunload. Une session nouvelle non encore sauvegardée est protégée dès sa création. Pas de comparaison quotidienne par sérialisation complète. Aucun second état mondial/horloge/RNG.

Audit initial des réglages : audio sans ressources/système ; tooltipDelay, mapLabelDensity, confirmHighImpact et notificationDuration non consommés ; showProvenance, pauseOnUrgent, autosave et intervalle réellement raccordés ; uiScale accessibilité contradictoire avec graphics ; highContrast/reducedMotion appliquent seulement une classe sans couverture des nouveaux menus/globe ; defaultSpeed propose 3 alors que l'horloge accepte 1/2/5 et n'est pas appliqué à la création ; mode natif avale actuellement ses erreurs. Ces écarts seront corrigés ou explicitement désactivés, sans simuler de fonctionnalités.

## Audit de l'implémentation (avant résultats CI)

| Réglage | Effet et persistance | Limite affichée |
|---|---|---|
| Mode fenêtre | Commande Tauri existante, requêtes ordonnées ; erreur visible et bouton réessayer ; valeur v1 persistée | Désactivé dans le navigateur ; le test humain doit confirmer le comportement du gestionnaire de fenêtres Windows |
| Échelle Graphics / Accessibility | Une valeur effective 0,75–1,5 ; les deux champs v1 sont synchronisés, tous les menus et dialogues consomment l'échelle | Les sauvegardes de campagne ne contiennent aucun réglage UI |
| Volumes maître / musique / interface / notification, muet hors focus | Anciennes valeurs persistées sans modification | Tous désactivés, aucun système audio raccordé |
| Délai infobulle | Valeur historique conservée | Désactivé, aucun effet implémenté |
| Confirmation générique d'action importante | Valeur historique conservée | Désactivé ; la protection obligatoire de session ne dépend jamais de cette option |
| Provenance | CountryPanel et RegionPanel existants ; préférence persistée | Ne modifie pas les droits d'accès à l'information |
| Densité de libellés | Valeur historique conservée | Désactivée, aucun effet implémenté |
| Vitesse par défaut | 1/2/5, appliquée seulement à la création confirmée ; valeur persistée | Ne réécrit pas la vitesse d'une sauvegarde chargée ; ancienne valeur 3 invalide ramenée à 1 |
| Pause urgente | Consommée par le contrôleur existant des notifications graves ; persistée | Aucune pause automatique pour adoption/rejet d'une loi ordinaire |
| Autosauvegarde et intervalle | Mécanisme existant, 5/10/15/30 minutes ; persistance réelle, erreurs visibles ; révision capturée avant sérialisation | Aucun déclenchement à cause d'un écran ou d'une animation |
| Contraste élevé | Classes CSS des menus et contrôles ; persisté | Pas de refonte visuelle gameplay |
| Mouvement réduit | Préférence persistée OU système ; CSS et globe partagés | Sans rotation au repos, transition ou inertie ; interaction directe maintenue |
| Durée de notification | Valeur historique conservée | Désactivée : notifications persistantes, aucun système de toast temporaire |

Les notices MIT Three.js et ISC Lucide sont consultables dans l'application à partir des fichiers réellement embarqués. Les liens externes restent des références documentaires, sans nouvelle permission native. Aucune nouvelle dépendance.

## Revue du diff et invariants de périmètre

- Pas de modification de `src/simulation`, `src/data`, `public/data`, Rust, schéma, migration, sérialisation ou stockage de campagne. `savedGeography`, `loadNews`, les droits gouvernementaux et la restauration validée restent inchangés.
- Un seul état canonique et une seule horloge : les révisions de session sont des nombres UI hors sauvegarde, pas une copie de monde. Les menus suspendent synchroniquement cette horloge ; ils restaurent son ancien drapeau de pause en retournant au jeu.
- Continuer n'appelle ni `loadSave`, ni `restoreSimulationState`, ni `saveGame`. La dernière sauvegarde est un bouton distinct. Les parcours Nouvelle partie et Charger restent consultables avant la confirmation de remplacement, sans perdre la session active.
- Nouvelle campagne non sauvegardée protégée immédiatement. Une écriture asynchrone antérieure ne peut pas nettoyer une nouvelle session ; la suppression ou le remplacement effectif du fichier de référence invalide le point sauvegardé.
- La fermeture native standard est interceptée via `onCloseRequested`, avec `preventDefault` synchrone puis le même garde de session que Quitter. Le bouton explicite d'abandon appelle seulement ensuite la commande `exit_app` existante. Le navigateur utilise aussi `beforeunload`. Aucun système ne peut empêcher une terminaison forcée du processus ou une panne électrique.
- Retour Paramètres/Crédits : brouillon Nouvelle partie et instantané d'aperçu Charger retenus dans App ; aucune restauration de monde actif. Le pose/zoom de caméra et le défilement peuvent être réinitialisés au remontage, ce n'est pas une nouvelle sélection.
- Globe : la rotation et les transitions sont uniquement des RAF de présentation, jamais une horloge de simulation. Les géométries sont construites au montage/sélection, les bornes de focus sont cachées par pays. La vue masquée annule les RAF. Dispose libère contrôles, listeners, observateur, GPU et texture.
- UX-001 est maintenant une exigence obligatoire de cette mission ; BUG-001 n'est pas modifié. Aucune fusion ni acceptation automatique.

## Commandes de validation prévues — Actions uniquement

`npm test -- src/app/__tests__ src/components/__tests__ src/simulation/__tests__/startSelection.test.ts src/simulation/__tests__/executiveAuthority.test.ts --maxWorkers=1`

`npm run build`

`npx playwright test --config=playwright.menu-integrity.config.ts`

`npx playwright test --config=playwright.load-game.config.ts`

`npx playwright test --config=playwright.new-game.config.ts`

Windows : `cargo test` après build frontend, et `npm run tauri:build`, artefact `projectatlas-windows` contenant l'installateur NSIS et l'exécutable. La vérification générale du dépôt reste dans `verify` sur Actions. Aucun test/build/capture lancé localement.

Les sauvegardes des tests sont synthétiques, nommées explicitement, produites par les fixtures existantes et validées par les invariants. Leur IPC de test passe par l'adaptateur natif de production ; les fichiers mondiaux restent servis hors du produit et ne sont pas placés dans le localStorage limité du navigateur. Cela ne remplace pas le test humain de l'exécutable Windows.

Revue complémentaire : les contrôles Paramètres restent provisoirement désactivés pendant la lecture initiale du stockage natif pour éviter de perdre une modification sous le résultat tardif de cette lecture. Retour reste accessible. Un chargement réussi libère l’aperçu détaché, qui n’est conservé que dans le parcours de consultation.

## Relais utilisateur
À la demande de l'utilisateur, la mission s'arrête après publication et lancement des vérifications GitHub. Les résultats, captures et artefacts Windows doivent être contrôlés par l'équipe ; aucune réussite finale ni acceptation n'est déclarée. Les erreurs éventuelles seront examinées par l'utilisateur avant une nouvelle demande de correction. PR #3 en brouillon vers ui/load-game-globe, aucune fusion.

