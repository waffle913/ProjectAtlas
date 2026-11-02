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


## Rapport de la passe corrective finale — arrêt à la vérification GitHub

Date : 2026-11-01. Départ : `66a658f096e6601915b111154fedcedf35527896`. SHA des correctifs : `6dd891f559762fee959220aa329bee4e98c3f34d`. Le commit documentaire qui contient ce rapport est le HEAD de livraison ; son SHA exact est fourni dans le relais utilisateur et les vérifications de la PR. Le contenu de production est identique au SHA des correctifs.

### A. Défauts corrigés dans le code et preuves disponibles

- **Audio (A)** : l'ancien artefact `13089939601` contient un DOM `<fieldset disabled>` et un instantané accessible avec quatre sliders et une checkbox `[disabled]`. Le matcher Playwright sur ce conteneur ne représente pas l'état des cinq contrôles. Il est remplacé par cinq assertions sémantiques, des tentatives réelles de clic souris/clavier et la comparaison des valeurs. Les instantanés accessibles seront exportés en `audio-accessibility-{résolution}-ui{échelle}.txt`. Aucun contrôle Audio activé.
- **Sélecteurs (B)** : les labels enveloppent les selects et leurs options ; la recherche du texte intégral du label n'est pas équivalente au nom accessible du combobox. Les instantanés de l'ancien artefact montrent bien `combobox "Display mode"` et `combobox "UI scale"`. Noms explicites et `getByRole('combobox', {name, exact:true})` remplacent ces recherches fragiles. Assertions des valeurs, lecture du stockage natif synthétique, reload et nouveau document avec nouveau pont IPC partageant seulement le stockage persistant.
- **Application native (C)** : auparavant App sauvegardait le mode demandé avant de recevoir la réponse native. Le mode affiché/persisté reste désormais le précédent pendant l'opération et en cas d'échec ; la tentative échouée reste disponible pour réessai. Seule une réponse native réussie publie et sauvegarde le nouveau mode, fusionné avec les autres préférences les plus récentes. Sélecteur, réessai et restauration des valeurs par défaut protégés contre les demandes concurrentes. Le test couvre deux rejets, une modification indépendante qui ne masque pas l'erreur, puis une réponse de succès explicitement retenue/libérée par la fixture ; aucune temporisation ne simule le succès.
- **Sans WebGL (D)** : les quatre combinaisons 1920×1080/1366×768 à 100/150 % doivent toutes atteindre la fin de la boucle (assertion de la liste exacte). Chaque combinaison sélectionne Canada au clavier, consulte l'aperçu sans écriture de campagne, charge réellement la campagne, retourne au menu, consulte Nouvelle partie et reprend la session à date inchangée. Captures distinctes nouvelle partie/chargement.
- **Cadrage (E)** : l'ancienne capture `focused-france-1920x1080.png` a été examinée ; le canvas s'étendait sous les panneaux et jusqu'à 19 % sous le bas du viewport pourtant coupé. Le rectangle de rendu est maintenant dans la zone utile, avec largeur adaptée aux panneaux agrandis ; la formule de distance existante utilise ses dimensions réelles. Assertions des limites projetées des sommets (marge de 5 % par rapport aux bords du canvas) et captures France/Canada/Luxembourg sur les quatre combinaisons. Les géométries ne changent pas.
- **Animations (F)** : l'assertion sur une transition de 650 ms pouvait arriver après sa fin ; elle est remplacée par une lecture synchrone du passage transition → vue libre lors d'une interruption clavier, plus les interactions souris existantes. L'arrêt de rotation pendant l'interaction attend plusieurs images réellement rendues. Le marqueur était limité à une mise à jour toutes les 40 ms même sur la dernière image du focus : la pose finale est maintenant publiée sans cette limitation. Nouvelle partie attend le focus terminé avant de cliquer son marqueur. Trois répétitions indépendantes du scénario complet sont ajoutées au workflow, sans augmenter les timeouts. Les deux observations de 900 ms restent des tests d'absence de mouvement, pas des attentes de fin d'animation.

Ces preuves de lecture du code et des anciens artefacts ne constituent pas une réussite des nouveaux tests.

### B. Défauts restant ouverts

BUG-001 demeure hors périmètre et inchangé. Les défauts A–F sont implémentés mais **restent bloquants tant que les nouveaux tests et captures n'ont pas été vérifiés**. Aucune acceptation technique ou humaine n'est déclarée à ce stade.

### C. Risques non vérifiés et validation demandée

Aucun build, suite npm, test Rust ou capture nouvelle n'a été exécuté localement : validation par les runners existants, conformément au contrat de ce chantier. Commandes effectivement exécutées localement : inspection Git/branche/diff, lecture des sources et artefacts, `git diff --check` (réussi), recherche `Math.random|setInterval` dans les fichiers de production concernés (aucun Math.random ; deux timers App préexistants inchangés). Revue séparée du diff réel effectuée avant commit : aucun fichier de simulation, de données, de sérialisation, de migration, de stockage de campagne ou Rust changé ; aucune nouvelle horloge/RNG.

| Vérification sur le nouveau HEAD | Commande du runner | État au relais |
|---|---|---|
| Unités UI/session/préférences/caméra et permissions | commande ciblée du workflow menu | NON VÉRIFIÉ |
| Build frontend | `npm run build` | NON VÉRIFIÉ |
| Menus (5 scénarios) | `npx playwright test --config=playwright.menu-integrity.config.ts` | NON VÉRIFIÉ |
| Animation (3 répétitions supplémentaires) | `npx playwright test --config=playwright.menu-integrity.config.ts --grep "free idle" --repeat-each=3 --output=artifacts/menu-integrity/animation-repetitions --reporter=list` | NON VÉRIFIÉ |
| Charger (2 scénarios) | `npx playwright test --config=playwright.load-game.config.ts` | NON VÉRIFIÉ |
| Nouvelle partie (2 scénarios) | `npx playwright test --config=playwright.new-game.config.ts` | NON VÉRIFIÉ |
| Linux et Windows, audits et régressions globaux | `npm run verify -- -- --maxWorkers=1` | NON VÉRIFIÉ |
| Tests natifs Windows | `cargo test` dans `src-tauri` | NON VÉRIFIÉ |
| Installateur Windows | `npm run tauri:build` | NON VÉRIFIÉ |

Captures attendues dans l'artefact menu du nouveau HEAD : `framing-{france,canada,luxembourg}-{1920x1080,1366x768}-ui{100,150}.png`, `no-webgl-{new,load}-{résolution}-ui{100,150}.png`, écrans home/settings/credits/new/load et catégories de paramètres pour ces quatre configurations. Les anciennes captures ne prouvent pas le correctif. Le zoom manuel supplémentaire peut volontairement dépasser le cadrage automatique ; les captures `framing-*` sont prises avant ce zoom.

Règle géographique existante conservée : centre de la plus grande composante, prise en compte des sommets dans un voisinage angulaire de 60°. Les composantes ultramarines éloignées ne forcent pas un dézoom mondial ; le Canada inclut son voisinage continental et arctique selon cette même règle. Une seule face ne garantit pas la visibilité simultanée de territoires dispersés sur toute la planète. Ni extension de cette règle ni modification géographique.

Le redémarrage de la fixture prouve la réinitialisation du document/pont IPC, pas un vrai redémarrage du processus Windows. L'application effective du mode par le gestionnaire de fenêtres, les éventuels échecs partiels natifs et le confort visuel final exigent le test personnel Windows. Les sommets projetés sont calculés seulement lors des rendus en focus ; pas de reconstruction de géométrie par image, pas de recalcul du monde. Aucun benchmark de simulation requis pour ce périmètre de présentation.

Sources historiques consultées : [menus](https://github.com/waffle913/ProjectAtlas/actions/runs/41324642476), [verify Linux/Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41324642469), [artefact visuel examiné](https://github.com/waffle913/ProjectAtlas/actions/runs/41324642476/artifacts/13089939601). Sur cette ancienne exécution seulement : 2/5 menus, 2/2 Charger, 2/2 Nouvelle partie ; verify Linux/Windows réussis. L'ancien installateur [13090539794](https://github.com/waffle913/ProjectAtlas/actions/runs/41324642479/artifacts/13090539794) n'est pas un binaire corrigé.

Pour le nouveau HEAD : [vérifications PR #3](https://github.com/waffle913/ProjectAtlas/pull/3/checks), [menu-integrity-ui](https://github.com/waffle913/ProjectAtlas/actions/workflows/menu-integrity-ui.yml), [verify](https://github.com/waffle913/ProjectAtlas/actions/workflows/verify.yml), [desktop-windows et installateur à générer](https://github.com/waffle913/ProjectAtlas/actions/workflows/desktop-windows.yml). Contrôler le SHA du run avant d'utiliser ses résultats ; les URLs exactes de lancement sont fournies dans le relais de publication. Aucun nouvel identifiant d'artefact n'est inventé avant génération.

### D. Améliorations facultatives hors périmètre

Pas de nouvelle fonctionnalité ni de refonte. Les écrans étroits sous 1101 px conservent leur disposition existante ; ils ne font pas partie de la matrice obligatoire. Aucun changement de BUG-001, des autres branches/PR ou des systèmes géopolitiques.

### E. Verdict de préparation à l'acceptation humaine

**EN ATTENTE DE VÉRIFICATION GITHUB, PAS ACCEPTÉ.** Arrêt au lancement/contrôle des vérifications du nouveau HEAD à la demande de l'utilisateur. La PR #3 reste en brouillon vers `ui/load-game-globe`. Ne pas fusionner, fermer ou approuver. Tout échec nouveau conserve un statut bloquant ; l'exécutable et les captures doivent être contrôlés avant le test humain explicite.

## Plan ciblé — deux échecs E2E restants (2026-11-01, avant code)

HEAD local/distant vérifié : `500f42ea998e5ac924380d5a7384988c34398ed5`. Ancienne CI `41341716842` : unités 211/211, menus 3/5, animations 0/3, Charger et Nouvelle partie 2/2. Nouvelle autorisation : corriger les deux causes puis attendre les résultats GitHub, contrairement au relais précédent qui s'arrêtait au lancement.

Contrats : changements limités à l'observation de la caméra et aux sélecteurs/assertions de préférences. Examiner la chronologie OrbitControls/pointerdown/RAF et le throttling du marqueur avant de modifier l'animation ; mesurer deux poses après confirmation de l'interaction. Maintien prolongé, reprise après relâchement, mouvement réduit et trois répétitions. Autosave interval : combobox par nom accessible ; vérifier 30 minutes et l'ensemble des préférences dans le stockage, après reload et nouveau document/pont. Examiner les captures existantes des trois pays/quatre configurations ; aucune modification de cadrage sans défaut visuel constaté. Risques : mesure périmée prise avant l'arrêt, assertion jamais atteinte, autres labels exacts similaires. Aucune migration, donnée, identité, mécanique de simulation ou sauvegarde de campagne concernée. Revue séparée du diff avant commit/push ; tests et build via les workflows existants, puis audit des résultats du nouveau SHA. BUG-001 inchangé, PR #3 en brouillon sans fusion.

## Audit ciblé des deux derniers échecs — résultats en consolidation

Référence auditée : `500f42ea998e5ac924380d5a7384988c34398ed5`. Nouveau code : `652d02383d19fa65494f26ea4700c88688abb460`. Fichiers modifiés : `globeRenderer.ts`, `tests/menu-integrity/flow.e2e.ts`, ce rapport. Aucun autre fichier de production modifié ; cadrage, préférences de production, géographie et moteur inchangés.

Causes établies : OrbitControls r187 publie `start` synchroniquement après l'initialisation du geste, sans déplacer la caméra au simple bouton enfoncé. Notre handler met immédiatement `interacting=true` et rend l'image ; l'autorotation est exclue des RAF suivantes tant que ce drapeau est vrai. Mais le même rendu publiait le drapeau et le compteur d'images AVANT la limite de 40 ms, et la longitude APRÈS. Le test pouvait comparer une longitude antérieure au pointerdown avec la vraie pose arrêtée. La trace ancienne situe mouseDown vers 99040–99046 ms, lecture 20.091675 vers 99049–99055 ms, confirmation interactive vers 99059–99063 ms, puis lecture 20.103123 vers 99966–99969 ms. Le correctif publie maintenant la longitude sur la même pose que le drapeau ; seul le marqueur React reste limité. Aucune tolérance, vitesse ou temporisation de l'animation n'est augmentée.

Le test observe les min/max à chaque RAF sur 1100 ms après confirmation interactive, avec la tolérance 0.005° existante et plusieurs rendus effectifs. La reprise est observée sur la dernière partie d'une fenêtre de 2300 ms, après le délai préexistant 1200 + 600 ms. Mouvement réduit : absence d'autorotation puis geste manuel suivi d'une observation sans inertie. La répétition indépendante est conservée trois fois.

Autosave interval : l'ancien instantané accessible contient bien `combobox "Autosave interval"` avec 15 minutes sélectionné et 30 disponible. Son label enveloppe les options : la recherche par texte exact du label échoue. Le balisage fonctionnel n'est pas défectueux ; correction minimale du test par rôle/nom accessible, ainsi que Default simulation speed dans le même scénario. Assertion de sélection à 30, comparaison structurée du stockage natif synthétique, contrôle de tous les réglages après reload ET nouveau document/pont IPC : affichage, échelle Graphics/Accessibility, vitesse, autosave, intervalle, pause urgente, provenance, contraste et mouvement réduit. Les rejets/réessais natifs précédents restent testés intégralement.

Les douze captures de cadrage de l'artefact `13097691735` (ancien HEAD 500f42e, run `41341716842`) ont été ouvertes : France métropolitaine et Corse dans le rectangle utile, Canada continental/arctique dans le voisinage documenté, Luxembourg visible avec contexte. Aucun pays masqué par les panneaux, aucune nouvelle modification du cadrage. Certaines captures 1920×1080 à 150 % montrent des fragments de rendu UI dupliqués dans leur partie inférieure ; cela n'est pas une preuve de clipping du pays ni d'un défaut de caméra. Comparer les nouvelles captures et confirmer le rendu Windows humain ; ne pas présenter ces artefacts comme une validation visuelle parfaite de tous les panneaux.

Vérifications locales réellement exécutées : lecture des contrats, sources, logs et traces ; revue séparée du diff ; `git diff --check` et `git diff HEAD^ HEAD --check` réussis. Aucun npm/build/Rust local. La modification de production ne change que les observations de présentation ; pas d'impact sur RNG, conservation, sauvegardes, migrations ou identités. Les deux fichiers `.reasonix` non suivis sont préservés.

CI du code 652d023 : [menus/répétitions/régressions](https://github.com/waffle913/ProjectAtlas/actions/runs/41343863850), [verify Linux/Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41343863621), [Windows/Rust](https://github.com/waffle913/ProjectAtlas/actions/runs/41343863748). Build Windows et tests natifs réussis ; [installateur et exécutable](https://github.com/waffle913/ProjectAtlas/actions/runs/41343863748/artifacts/13098915217) générés pour 652d023. Autres résultats encore en attente au moment de cette rédaction ; ils seront consolidés ci-dessous sans les inventer.

### Résultat intermédiaire 652d023 et correction du parcours aval

CI menus `41343863850` : **4/5**, **3/3 animations**, **2/2 Charger**, **2/2 Nouvelle partie** ; unités 211/211 et build frontend réussis. Les deux défauts demandés sont franchis : maintien/reprise/mouvement réduit et persistance/restauration de tous les paramètres. Seul échec à la ligne 129 : aucune voie admissible pour France lors du lancement de campagne après restauration.

Cause constatée dans l'instantané accessible : France est affichée, les deux voies sont explicitement Indisponible. Le snapshot de sélection est construit après `initializeNewGame(...)`, et France n'est qu'une présélection informative : elle ne garantit pas la disponibilité d'un personnage admissible. Le test ne peut déduire cette disponibilité du nom du pays ou de sa géométrie. Plan de correction strictement test : choisir une option réellement admissible du catalogue, comme le parcours Nouvelle partie existant, puis conserver toutes les assertions de vitesse et d'abandon. Ne pas modifier l'état simulé, les droits ni la disponibilité des offices. Aucun ajustement supplémentaire de caméra ou de seuil. Ce résultat intermédiaire reste globalement bloquant jusqu'au nouveau run complet.

### Synchronisation de la restauration — preuve 5bba3ce

Run `41345056599` : unités 211/211, build frontend réussi, menus 4/5, animations 3/3, Charger 2/2, Nouvelle partie 2/2. Échec avant le parcours de création : classe high-contrast encore vide au contrôle immédiat après reload (5 secondes), ligne 135 → helper restoredSettings ligne 26. L'initialisation native lit le cache de sauvegardes avant de libérer les préférences ; le test vérifiait un effet avant cet acquittement. La validation structurée du stockage avait déjà réussi. Sur 652d023, les restaurations avaient été franchies, établissant le caractère dépendant de la durée de démarrage de ce contrôle prématuré.

Correction du protocole, sans production : ouvrir Paramètres, attendre le combobox d'échelle effectivement activé (`:enabled`, fieldset libéré après lecture), puis contrôler classes et toutes les valeurs sans mutation. Le nouveau document utilise le même protocole ; aucune attente fixe ni augmentation de timeout. La sélection d'une voie admissible reste à valider jusqu'au bout sur le prochain run. Le build Windows et Rust de 5bba3ce sont réussis, artefact `13098723413`, run `41345056690`. Aucune acceptation de la PR à ce résultat intermédiaire.

## Plan ciblé — initialisation Playwright (avant code, 2026-11-01)

HEAD local/distant : `5e0ba7e3e6969408c3ad23bf49cb24ac154b0f6c`. Audit AtlasMemory `AUDIT-2026-11-01-05` relu et logs `41346001672` confirmés : deux scénarios principaux et trois répétitions s'arrêtent dans setup sur le garde disabled à 5 s. La réussite de Charger/Nouvelle partie ne prouve pas les assertions non atteintes de ces scénarios.

Périmètre : helper setup et diagnostics du test, plus ce rapport. Attendre le vrai bouton activé (`dataReady && storageReady`), avec une borne d'initialisation dédiée de 60 s, sans changer les timeouts globaux ni ceux des assertions métier. Cette borne réserve au moins 180 s du budget de scénario de 240 s aux parcours ; elle est volontairement distincte de la borne serveur 120 s et de l'assertion standard 5 s, face à des fetch locaux et calculs mondiaux variables. Mesurer chaque démarrage et joindre requêtes/durées, console, erreurs visibles, état du stockage et état observable de chargement ; en dépassement, conserver un échec explicite et un artefact JSON. Ne jamais affirmer connaître une étape interne non exposée : préciser les ressources en cours et cette limite. Pas de retry, sleep fixe, networkidle ou contournement de ready.

Revue séparée du diff avant commit. Validation : cinq scénarios menus, trois répétitions animation, Charger 2/2, Nouvelle partie 2/2, unités/build/verify Linux et Windows, Rust/build Windows via les workflows existants. Aucun fichier de production, moteur, données, droit, sauvegarde ou migration à modifier sans défaut prouvé. BUG-001, les autres branches/PR et la conception inchangés. Risques : lecture prématurée, initialisation CPU après fin du réseau, erreur persistante masquée par une attente ; la borne finie et les diagnostics doivent les distinguer.

### Preuves et implémentation du garde d'initialisation

Les cinq traces de démarrage en échec de l'artefact `13099262232` ont été lues (run `41346001672`, HEAD 5e0ba7e). Chacune contient 26 réponses réseau, aucune réponse HTTP ≥400 ni `_failureText` dans les enregistrements disponibles. La lecture de `synthetic.ceded.json` prend environ 2,48–2,87 s ; celle de `synthetic.occupied.json` jusqu'à 1,86 s, et un registre démographique jusqu'à 1,06 s. Ces mesures ne donnent pas le temps total prêt : le test interrompait la scène au seuil de 5 s, et la fin des calculs/lectures n'était pas mesurée. Aucun défaut de données ou de production n'est démontré par ces traces.

Le seul fichier exécutable modifié est le test `tests/menu-integrity/flow.e2e.ts`. setup observe requêtes/réponses/échecs, console et pageerror avant navigation ; le budget commun navigation + readiness est borné à 60 s. La réussite exige toujours le vrai bouton Nouvelle partie activé. Chaque setup joint `initialization.json` au rapport Playwright, avec durée réelle, borne, requêtes individuelles, durées/états HTTP, requêtes encore en cours, erreurs console/page, erreurs et textes visibles, bouton et indicateurs de stockage synthétique. En dépassement : échec explicite avec cause et sortie JSON ; lecture diagnostique du DOM elle-même bornée à 3 s, avec erreur indiquée si inaccessible. Les écouteurs sont retirés avant le parcours fonctionnel. Aucun sleep d'initialisation, retry ou modification de la configuration globale.

Revue du diff : tous les parcours et assertions fonctionnels sont conservés. Aucun changement de `src`, workflow, schéma, format, migration, stockage de campagne, données ou droits ; garde produit `ready={dataReady && storageReady}` inchangé. `git diff --check` réussi. Les résultats du nouveau SHA resteront NON VÉRIFIÉS jusqu'aux runs correspondants ; les métriques de startup ne prouvent pas seules les animations ou la persistance.

### Validation mesurée du correctif d'initialisation — SHA 5dd681a

Code testé : `5dd681a432df5ab03a7818ac37071a6dd377f365` (départ `5e0ba7e3e6969408c3ad23bf49cb24ac154b0f6c`). [Run menus complet](https://github.com/waffle913/ProjectAtlas/actions/runs/41353500128) **réussi**. Les sept `initialization.json` de l'[artefact 13102707550](https://github.com/waffle913/ProjectAtlas/actions/runs/41353500128/artifacts/13102707550) ont été ouverts : bouton effectivement activé, six lectures synthétiques, zéro écriture de campagne au setup, aucune erreur console/page ni requête échouée pour les sept démarrages.

| Démarrage | Disponibilité réelle |
|---|---|
| Session active | 4 978 ms |
| Matrice menus | 4 754 ms |
| Animation principale | 5 544 ms |
| Persistance | 5 663 ms |
| Répétition animation 1 | 5 842 ms |
| Répétition animation 2 | 5 547 ms |
| Répétition animation 3 | 5 759 ms |

Cinq mesures dépassent l'ancienne borne 5 s. La plage 4,75–5,84 s confirme la cause de l'échec : attente du test trop courte, sans défaut d'initialisation de production démontré. Les scénarios animation et persistance ont cette fois réellement parcouru leurs assertions jusqu'au bout : maintien/reprise/focus/mouvement réduit ; erreurs natives/réessais ; intervalle 30 minutes et autres préférences dans le stockage, après reload et recréation IPC ; lancement d'une campagne admissible à vitesse 5 et protection contre remplacement. Aucun test fonctionnel supprimé ou neutralisé.

| Vérification du SHA 5dd681a | Résultat constaté |
|---|---|
| Unités ciblées UI/session/caméra/permissions | 211/211, 27 fichiers |
| Build frontend | RÉUSSI |
| `npx playwright test --config=playwright.menu-integrity.config.ts` | 5/5, 4,3 min |
| Même configuration, `--grep "free idle" --repeat-each=3` | 3/3, 1,9 min |
| `npx playwright test --config=playwright.load-game.config.ts` | 2/2 |
| `npx playwright test --config=playwright.new-game.config.ts` | 2/2 |
| Rust et build Windows | RÉUSSIS, [run 41353500197](https://github.com/waffle913/ProjectAtlas/actions/runs/41353500197) |
| `npm run verify -- -- --maxWorkers=1` Linux/Windows | EN COURS, [run 41353500441](https://github.com/waffle913/ProjectAtlas/actions/runs/41353500441) |

[Installateur/exécutable du SHA 5dd681a](https://github.com/waffle913/ProjectAtlas/actions/runs/41353500197/artifacts/13102381910). Les métriques proviennent des runners, aucun npm/build/Rust local exécuté. La branche garde la PR #3 ouverte en brouillon vers ui/load-game-globe ; aucune fusion ou acceptation. Le changement exécuté est exclusivement le helper de test ; le commit documentaire ultérieur éventuel ne modifie pas ce code testé.

Limites : la branche d'erreur au dépassement 60 s n'a pas été déclenchée artificiellement dans ce run réussi ; ne pas la présenter comme exercée en CI. Les risques visuels antérieurs à 150 % et le test humain Windows restent à vérifier indépendamment ; ils ne sont pas corrigés par une attente de démarrage. BUG-001 reste hors périmètre. Verdict actuel : défaut de synchronisation initiale corrigé avec preuve E2E, CI générale encore attendue, aucune acceptation humaine.

## Plan — retour humain Windows BUG-UI-002 / BUG-UI-003 (2026-11-01, avant code)

Départ local/distant confirmé : `d0cade4978b46db9121aef9a60bafd17cd6bf240`, branche existante et PR #3 vers ui/load-game-globe. Audit AtlasMemory -07 relu. Périmètre strict : présentation des références, Crédits et fiabilité des annulations de gestes du globe. Aucun état canonique, donnée, format, migration, droit ou mécanique simulée concerné.

002 : inventorier chaque référence ; déplacer les légendes/footer documentaires Natural Earth/NASA vers Crédits, conserver le caractère historique/décoratif du fond et les dates/incertitudes des faits. Mettre les détails techniques de géographie du panneau Région derrière l'option de provenance existante. Retirer seulement le préfixe documentaire Leaflet, conserver le contrôle capable d'afficher les attributions de couches ; embarquer la notice BSD complète dans Crédits. Ne pas modifier les licences ni les données. Les provenances matérielles/militaires/commerciales et les origines des actualités sauvegardées restent inchangées.

003 : inventaire CSS, survols, capture OrbitControls r187, transitions, focus et configuration native. Aucune fenêtre ProjectAtlas ni application installée n'est exposée par l'inventaire Windows ; seule une archive WinRAR est ouverte. Le curseur natif figé n'est donc pas reproduit. Ne pas installer/lancer un nouveau binaire, masquer le pointeur ou couper le GPU pour inventer une solution. Défaut de gestion distinct identifié par lecture : le wrapper du globe conserve son point de départ sur pointercancel/lostpointercapture, alors qu'OrbitControls traite l'annulation ; un pointerup ultérieur peut devenir une sélection indue. Ajouter une régression d'annulation suivie de relâchement et de reprise du drag ; correction minimale du wrapper, sans prétendre réparer le rendu du curseur Windows.

Validation via workflows existants : unités ciblées, menus avec nouvelles assertions crédits et événements, répétitions animation 3 fois, Charger/Nouvelle partie, matrice 1920/1366 à 100/150 et sans WebGL, verify Linux/Windows et Rust/installateur. Revue séparée du diff et de la provenance/absence de fuite d'information. Documenter les limites et protocole Windows dans BUGS_CONNUS ; aucun bug visuel natif déclaré corrigé sans preuve. Arrêt à la vérification GitHub selon la préférence utilisateur antérieure, résultats non obtenus explicitement NON VÉRIFIÉS.

### Inventaire, justification et revue de la passe Windows

Voir les deux entrées détaillées [BUG-UI-002/003](BUGS_CONNUS.md) : classification des références et sources des obligations, limites de reproduction, protocole Windows. Les mentions NASA/Natural Earth du décor et le préfixe Leaflet sont centralisés dans Crédits. Le support des attributions de couches de la carte reste actif, seules les références documentaires ciblées changent. Les détails de source géographique Région suivent la préférence existante ; faits datés, estimations, disponibilité, actualités et provenance des rapports métier sont conservés. Notice Leaflet complète ajoutée sans modification de licence.

Le symptôme de curseur Windows est NON REPRODUIT. Le seul changement d'événements est le nettoyage du départ de geste sur pointercancel/perte de capture ; il ne touche ni autorotation, inertie, focus ou GPU. Régressions ajoutées au scénario d'animation, avec journal borné des événements/capture/style de curseur. Le journal teste le DOM et ne mesure pas l'image du pointeur natif Windows. La matrice existante, fallback, protections de campagne et persistance sont conservés ; assertions supplémentaires Crédits/notice et légendes déplacées, tests Région opt-in.

Revue séparée avant publication : fichiers de présentation et tests seulement, aucune modification de src/simulation, src/data, public/data, src-tauri, save/migration ou droits. Les deux fichiers .reasonix non suivis restent intacts. Aucun nouveau moteur, RNG ou timer de simulation. Pas d'optimisation spéculative ni désactivation graphique. `git diff --check` réussi. Tests/runners encore NON VÉRIFIÉS pour le nouveau commit ; aucune anomalie native déclarée corrigée par lecture de code seule.

### Épreuve intermédiaire d'annulation

Run `41357923357`, code 8edae4e : unités 213/213 (28 fichiers) et build frontend réussis, menus 4/5, répétitions animation 0/3, Charger et Nouvelle partie 2/2. L'échec de la nouvelle assertion est un focus réapparu après un relâchement annulé/perte de capture, malgré l'absence de capture vérifiée avant pointerup. Le nettoyage événementiel seul ne suffit donc pas. Garde minimal ajouté : pointerup consomme le début de geste et exige encore la capture effective du même pointeur avant toute sélection. Le journal du test est rattaché au canvas courant après remontage et joint avant chaque assertion d'annulation pour garder la preuve en cas d'échec. Les clics ordinaires, drag/zoom/recentrage restent soumis aux régressions existantes. Aucun lien causal établi avec le curseur natif figé ; BUG-UI-003 reste NON REPRODUIT et ouvert.

### Livraison et preuves — passe UI après test humain

Départ : `d0cade4978b46db9121aef9a60bafd17cd6bf240`. Code final vérifié : `ef89b9c8038ffa0b5148573a2a3f53c92b1d98b5` ; étapes intermédiaires 8edae4e et 24c3785 conservées dans l'historique. Le commit documentaire de livraison ne change pas ce code testé.

Fichiers de production : `src/App.tsx` (préfixe Leaflet seulement), `src/components/CreditsMenu.tsx`, `RegionPanel.tsx`, `SaveManager.tsx`, `new-game/NewGameSetup.tsx`, `new-game/globeRenderer.ts`, `public/menu/leaflet-LICENSE.txt`. Tests : `src/components/__tests__/RegionPanel.test.ts`, `tests/menu-integrity/flow.e2e.ts`. Documentation : `docs/BUGS_CONNUS.md` et ce rapport. Aucun moteur, donnée, sauvegarde/migration, droit, Rust ou workflow modifié.

| Commande / contrôle du code ef89b9c | Résultat réel |
|---|---|
| Unités ciblées UI/session/permissions | 28 fichiers, 213/213 |
| `npm run build` | RÉUSSI |
| `npx playwright test --config=playwright.menu-integrity.config.ts` | 5/5, 4,4 min |
| Même configuration `--grep "free idle" --repeat-each=3` | 3/3, 2,0 min |
| `npx playwright test --config=playwright.load-game.config.ts` | 2/2, 56,1 s |
| `npx playwright test --config=playwright.new-game.config.ts` | 2/2, 34,4 s |
| `cargo test` et `npm run tauri:build` Windows | RÉUSSIS |
| `npm run verify -- -- --maxWorkers=1`, Linux/Windows | EN COURS au relais, NON VÉRIFIÉ jusqu'au résultat |

[Run menus](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034421), [artefact captures/rapport](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034421/artifacts/13103824519), [run Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034395), [installateur/exécutable](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034395/artifacts/13103908882), [verify général](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034380). Les pièces pointer-events-cancel, pointer-events-lost et pointer-events du rapport HTML ont été ouvertes. Le journal final décrit 18 événements, deux relâchements sans capture puis un drag avec capture ; les tests confirment absence de sélection indue, reprise du drag, zoom/recentrage et maintien de la sélection. Le style CSS est auto ; aucune conclusion sur la rasterisation du curseur natif.

La matrice 1920×1080/1366×768 × 100/150 %, les contrôles Audio désactivés, la persistance, la protection de session et les quatre fallbacks sans WebGL sont réellement parcourus. Contrôle visuel effectué sur les captures 8edae4e de Nouvelle partie 1920/100, Charger 1920/150, Crédits 1366/100 et Nouvelle partie 1366/150 : légendes documentaires déplacées, données datées lisibles et Crédits accessibles. Le même code de présentation est inchangé dans ef89b9c ; les nouveaux tests de ces surfaces passent. Ce contrôle de captures Chromium n'est pas un test humain du curseur Windows.

Bilan : BUG-UI-002 corrigé avec preuve automatisée des surfaces ciblées, notices et provenance conservées. BUG-UI-003 natif OUVERT / NON REPRODUIT ; défaut secondaire d'annulation corrigé et testé. Aucune désactivation d'accélération, aucun faux curseur, aucune refonte. Le protocole Windows et les limites sont dans BUGS_CONNUS. Aucun test/build/Rust local ; `git diff --check` et revue séparée du diff effectués. Arrêt à la vérification GitHub selon la préférence utilisateur antérieure ; CI générale non déclarée réussie, aucune acceptation ni fusion. PR #3 reste ouverte en brouillon vers ui/load-game-globe.

## BUG-UI-003 — instrumentation après signalement AUDIT-2026-11-01-09

Plan limité : vérifier HEAD et mémoire ; examiner Tauri/CSS/événements/performance hors globe puis avec globe ; faute de cause démontrée livrer un collecteur volontaire, borné et exportable ; revoir séparément le diff ; valider via GitHub les suites existantes et Windows. Aucun changement canonique, migration, invariant, moteur, données, droits, stockage ou BUG-001 nécessaire. Risques : perturbation de mesure active, API longues tâches partielle, absence de preuve de présentation GPU, téléchargement natif à valider humainement. BUG-UI-002 validé humainement, inchangé.

Implémentation : `src/app/uiDiagnostics.ts` (tampon circulaire, événements passifs, RAF agrégé, longues tâches optionnelles, arrêt/nettoyage), `src/components/UiDiagnostics.tsx` (activation explicite depuis Paramètres, marqueur/export/effacement), intégration isolée dans `src/App.tsx`, présentation dans `MenuTheme.css`, SHA injecté au build dans `vite.config.ts`. Aucun changement du backend natif ni de son comportement de fenêtre. Aucun contexte WebGL créé par la mesure, aucune donnée de campagne lue. Tests unitaires du bornage et test E2E supplémentaire d'activation hors globe, clic droit, stall JS synthétique connu, export réel et stockage inchangé ; les cinq scénarios historiques restent intacts.

Diagnostic : symptômes confirmés par l'utilisateur y compris menu principal avant globe. Aucun coupable démontré dans le code ; composition Windows/WebView2/GPU et longues tâches restent des hypothèses à départager. Inventaire Computer Use actuel : aucune fenêtre ProjectAtlas native ; pas de reproduction indépendante ni de test humain natif. Aucun correctif du symptôme revendiqué. Procédure de reproduction et interprétation du JSON dans `BUGS_CONNUS.md`. Références techniques primaires Microsoft dans ce document. Instrumentation inactive sans timer/RAF/observer/écouteur ; overhead React minimal non benchmarké, aucune promesse de coût zéro. Instrumentation active nécessairement perturbatrice, bornée et temporaire.

Validation de cette passe : EN ATTENTE de GitHub, aucune suite npm/build/Rust locale exécutée. `git diff --check` et revue réelle du diff avant publication ; les résultats historiques ef89b9c ci-dessus ne valident pas ce nouveau code. PR #3 reste en brouillon, aucune fusion ni validation humaine implicite.

Revue séparée de l'implémentation : lecture du diff complet et des imports, contrôle de l'absence d'accès à simulation/stockage/RNG, bornage des événements et nettoyage, copie chronologique du tampon, écoute passive sans interception des clics. Le JSON réel du run b458d7d a été ouvert : export JSON/coordonnées/clic droit/marqueur/frames fonctionnels, mais pas d'entrée longue tâche pour le stall exécuté directement par l'outil de test. Le scénario conserve son assertion et injecte maintenant une vraie tâche de navigateur, puis attend sa détection par l'API. Lecture du même journal : focus de boutons reçu en capture par window ; filtre ajouté pour ne journaliser que le focus dont la cible est réellement window, avec régression unitaire. Le champ tauriBridgePresent désigne seulement la présence du pont (également simulé dans les tests), jamais une preuve d'exécution native. Capture Chromium du bandeau arrêt/export consultée ; aucune preuve de curseur natif tirée de cette image.

Historique de validation de la passe : unités 215 puis 216 réussies ; erreur de typage React corrigée ; test de nettoyage EventTarget corrigé ; sur b458d7d, les cinq scénarios historiques, animations 3/3, Charger 2/2 et Nouvelle partie 2/2 ont réussi, tandis que le nouveau scénario de diagnostic échouait uniquement sur l'absence d'entrée longue tâche après injection via l'outil de test. Windows/Rust réussis sur b458d7d (artefact 13108276643), mais ce binaire précède le filtrage du focus ; ne pas le confondre avec la livraison finale. Les anciens runs encore actifs des seuls commits intermédiaires de cette passe ont été annulés pour libérer les runners. Aucun échec n'est requalifié en succès.

Initialisation : App construit et initialise le monde de façon synchrone après ses chargements ; elle peut produire des longues tâches au démarrage, sans lien causal démontré avec le symptôme intermittent. Activer le diagnostic ne mesure pas rétroactivement le démarrage. Les commandes d'horloge/autosave déjà présentes restent inchangées et suspendues par les menus selon leur contrat. Versions exactes WebView2/GPU/pilote à joindre manuellement au test humain ; aucun contournement spéculatif appliqué. AtlasMemory : AUDIT-2026-11-01-10.

### Livraison vérifiée de l'instrumentation — 2026-11-01 (Actions UTC 2026-11-02)

Code testé : `a68120b05a2988502d1bc612a59089aac62204ba`. Le commit documentaire de livraison ultérieur ne change pas ce code. Les résultats ci-dessous concernent ce SHA, pas les checks futurs du HEAD documentaire.

| Vérification réellement exécutée dans GitHub Actions | Résultat |
|---|---|
| `npm test -- src/app/__tests__ src/components/__tests__ src/simulation/__tests__/startSelection.test.ts src/simulation/__tests__/executiveAuthority.test.ts --maxWorkers=1` | 29 fichiers, **216/216** |
| `npm run build` | **RÉUSSI** |
| `npx playwright test --config=playwright.menu-integrity.config.ts` | **6/6**, dont les **5 scénarios historiques** et le diagnostic ; 5,0 min |
| Même configuration `--grep "free idle" --repeat-each=3 --output=artifacts/menu-integrity/animation-repetitions --reporter=list` | **3/3**, 2,2 min |
| `npx playwright test --config=playwright.load-game.config.ts` | **2/2**, 59,3 s |
| `npx playwright test --config=playwright.new-game.config.ts` | **2/2**, 37,2 s |
| `cargo test` Windows et `npm run tauri:build` | **RÉUSSIS** |
| `npm run verify -- -- --maxWorkers=1`, Linux et Windows | **EN COURS au dernier contrôle**, aucun succès global revendiqué |

[Run menus](https://github.com/waffle913/ProjectAtlas/actions/runs/41369698063), [rapport/captures/JSON](https://github.com/waffle913/ProjectAtlas/actions/runs/41369698063/artifacts/13108488254), [run Windows/Rust](https://github.com/waffle913/ProjectAtlas/actions/runs/41369697704), [nouvel exécutable et installateur](https://github.com/waffle913/ProjectAtlas/actions/runs/41369697704/artifacts/13108733861), [CI générale Linux/Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41369697669).

Le JSON final a été téléchargé et lu : 30 entrées, arrêt effectif, écran menu, clic droit, marqueur, 27 callbacks RAF sur 518 ms et intervalle maximum 83,3 ms ; l'API a observé la tâche synthétique connue de **90 ms**. Aucun faux changement de focus de fenêtre pendant les clics sur boutons. Le test confirme le stockage inchangé et la fermeture du panneau. Les unités couvrent tampon après plusieurs tours, arrêt après cinq minutes, nettoyage de chaque écouteur et absence d'écriture/reprise après arrêt. Cela prouve le fonctionnement du collecteur en Chromium, **pas une reproduction du curseur Windows**. Les cinq scénarios existants conservent protection de campagne, paramètres persistants, matrice des quatre tailles/échelles et fallback WebGL.

Artefact Windows téléchargé et contenu vérifié, sans exécution du binaire : archive SHA-256 `e9944e164f9bf25041c78eda03da01cdbb2bd6cb7cbbb81297c1969135305e9a` ; `projectatlas.exe` SHA-256 `de76c52575c9c90e6a235d51482689b7c1e487659bf1f10a45f37f25d445fa30` ; `bundle/nsis/ProjectAtlas_1.0.0_x64-setup.exe` SHA-256 `c46588c3a6dc50a866c2e695c49ed21763e2e897dc30686ca78cf6f0b633c4c8`. Métadonnées de l'artefact rattachées au SHA a68120b.

Bilan : instrumentation livrée avec preuves automatisées et protocole humain détaillé dans BUGS_CONNUS. **BUG-UI-003 OUVERT, cause non établie, aucun correctif du symptôme Windows revendiqué.** Aucun changement moteur/données/migrations/sauvegardes/droits/BUG-001 ; BUG-UI-002 reste validé. Aucun test/build/Rust local. Revue du diff et `git diff --check` effectués. Arrêt à la vérification GitHub selon la préférence utilisateur, CI générale encore en cours et test humain natif restant nécessaires. PR #3 reste en brouillon, aucune fusion, aucune acceptation humaine inférée.

## F9/F10 — capture clavier du symptôme (AUDIT-2026-11-01-12)

Départ local/origin/PR vérifié : 55aa7d0995cdf71fe8885d49524c63e2dd5e71a2, PR #3 ouverte en brouillon, non fusionnée. Plan : instrumentation UI uniquement, réception F9/F10 bornée à la session active, horodatage honnête en cas de traitement tardif, contexte antérieur borné avec couverture mesurée et compteurs de pertes ; tests unité/composant/clavier seul + suites existantes via GitHub. Aucun moteur/donnée/migration/sauvegarde/droit/BUG-001 ou BUG-UI-002 à modifier.

Contrat : les trois marqueurs humains précédents sont POSTÉRIEURS au symptôme ; leurs métriques normales ne décrivent pas le gel. Touches nues F9/F10 produisent symptom-start/symptom-end à réception, sans dater rétroactivement le problème. Pas d'écoute clavier hors session active. Répétition, modificateurs et IME ignorés, texte des champs préservé, défaut F10 neutralisé seulement en diagnostic actif. Recherche ciblée des raccourcis applicatifs : aucun F9/F10 ; commandes du globe flèches/Home/+/- intactes. Les réservations Windows/Fn/focus natif restent à vérifier humainement.

Conservation : tampon 2400 entrées, dernier contexte courant figé au marqueur pour les quatre derniers marqueurs (clavier ou bouton) au plus, maximum 4×2400 références d'entrées en plus du tampon. Copies à fréquence de marqueur seulement, aucun traitement clavier/mémoire de contextes hors activation. Couverture effective début/fin/durée/nombre exportée ; compteurs explicites d'entrées et de contextes perdus. Aucune garantie arbitraire de 30 secondes. RAF partiel vidé au marqueur, journal en ordre de réception ; timestamps d'origine des longues tâches restent des champs distincts. Export v2 sans contenu de campagne ni saisie clavier générale.

Fichiers : src/app/uiDiagnostics.ts, src/components/UiDiagnostics.tsx, src/components/__tests__/UiDiagnostics.test.ts, tests/menu-integrity/flow.e2e.ts, docs/BUGS_CONNUS.md et ce rapport. Tests : marqueurs/ordre/réception tardive, champs/modificateurs/IME/répétition, inactivité/arrêt/démontage, conservation avant écrasement et limites, parcours réel sans souris jusqu'à l'export et stockage inchangé. Aucun test existant supprimé. Validation GitHub à suivre ; pas de suite npm/build/Rust locale. BUG-UI-003 reste ouvert et aucune réparation causale Windows n'est revendiquée.

### Preuves F9/F10 — code 0a30925fa4a34963a57ed362b8539542e10d5ee3

Revue séparée : diff réel relu, collecte limitée aux touches nues F9/F10, aucune saisie générale ni accès moteur/stockage ; ordre des entrées par réception conservé (timestamp RAF de rendu distinct de la réception), contextes limités à quatre et compteurs de pertes explicites. Premier run : deux échecs de tests, charge resize non observée comme une fenêtre native dans happy-dom puis session non nettoyée après l'échec contaminant le test suivant. Charge changée en événements de visibilité document, nettoyage systématique ajouté, assertions conservées. Contexte du bouton historique inclus et testé également. Runs obsolètes encore actifs des commits intermédiaires annulés pour libérer les runners, pas requalifiés en succès.

| Vérification GitHub sur 0a30925 | Résultat réel |
|---|---|
| `npm test -- src/app/__tests__ src/components/__tests__ src/simulation/__tests__/startSelection.test.ts src/simulation/__tests__/executiveAuthority.test.ts --maxWorkers=1` | **30 fichiers, 220/220** |
| `npm run build` | **RÉUSSI** |
| `npx playwright test --config=playwright.menu-integrity.config.ts` | **7/7**, cinq scénarios historiques + deux diagnostics, 3,5 min |
| Même configuration `--grep "free idle" --repeat-each=3 --output=artifacts/menu-integrity/animation-repetitions --reporter=list` | **3/3**, 1,6 min |
| `npx playwright test --config=playwright.load-game.config.ts` | **2/2**, 39,9 s |
| `npx playwright test --config=playwright.new-game.config.ts` | **2/2**, 25,1 s |
| `cargo test` Windows et `npm run tauri:build` | **RÉUSSIS** |
| `npm run verify -- -- --maxWorkers=1` Linux/Windows | **EN COURS au relais**, aucun succès global revendiqué |

[Run menus](https://github.com/waffle913/ProjectAtlas/actions/runs/41385323110), [preuves et JSON](https://github.com/waffle913/ProjectAtlas/actions/runs/41385323110/artifacts/13115133245), [run Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41385323094), [exécutable et installateur](https://github.com/waffle913/ProjectAtlas/actions/runs/41385323094/artifacts/13114938642), [CI générale Linux/Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41385323193).

JSON exporté réel téléchargé et ouvert : schema v2 / build 0a30925 ; symptom-start reçu à 33 ms, symptom-end à 51 ms, chronologie respectée, aucun événement souris (counts vide). Contexte du premier marqueur : 5 entrées / 33 ms ; second : 7 entrées / 51 ms ; tampon final : 10 entrées / 80 ms ; aucune perte dans ce test court. Les unités vérifient aussi réception retardée simulée de 250 ms sans antidater, champs/IME/modificateurs/répétition, fonctionnement inactif, arrêt/démontage, conservation des mouvements antérieurs après écrasement du tampon et retrait des contextes au-delà de quatre. L'export E2E conserve les préférences et sauvegardes inchangées ; les scénarios historiques de protection de campagne et d'animations sont intacts. Pas de simulation d'un vrai gel natif Windows revendiquée.

Artefact Windows téléchargé et inspecté, jamais lancé : archive SHA256 `f0d7a76ff2c07eacc62ecd325bef3ebaee5ebd3041aa4f8cf3c71ec102302f98`, `projectatlas.exe` `a0d8fbbee71ca70b986534625a125130f0a9649069264f6f76c0745f6360dfcb`, installateur `bundle/nsis/ProjectAtlas_1.0.0_x64-setup.exe` `ac9ca6fe0935affceb9383af33abc0133e73a2248b025a05945391698c7b0618`. Métadonnées liées au SHA 0a30925. Le commit documentaire de livraison suivant ne change pas le code testé ; ses propres checks ne sont pas annoncés validés.

Instruction humaine : activer le diagnostic, garder la fenêtre au premier plan, appuyer une fois sur F9 dès perception du symptôme puis F10 au retour normal ; exporter après reprise, au clavier Tab/Entrée si nécessaire. Noter toute touche non reçue, perte de focus ou recours à Fn et joindre la vidéo lorsque possible. Le JSON ne reconstitue pas un début inconnu et ne prouve pas la rasterisation du curseur Windows. BUG-UI-003 reste **OUVERT**, BUG-UI-002 reste validé ; aucune modification graphique/moteur/données/sauvegarde/migration/droit/BUG-001. Aucun test/build/Rust local ; `git diff --check` réussi. Arrêt à la vérification GitHub selon préférence antérieure, PR #3 toujours en brouillon, aucune fusion ni acceptation humaine déduite.

## Investigation causale — suite AUDIT-2026-11-01-14 et addendum

### État examiné et méthode

Départ local et origin identiques : `c22df5b23722e80258fe0c9e953a7e4aaaddbabd`. PR #3 ouverte, draft=true, merged=false, base ui/load-game-globe. Au contrôle initial : menus et Windows/Rust de ce HEAD réussis ; verify général Linux/Windows encore en cours (41386159277). Aucun résultat en cours requalifié en succès. Deux fichiers reasonix non suivis préexistants conservés.

Plan ciblé : exploiter les deux analyses antérieures, relire le second fichier brut disponible, inspecter configuration et dépendances réellement compilées, confronter les incidents officiels à leurs conditions, puis ajouter uniquement une observation native externe bornée et une base de corrélation temporelle. Aucun changement de rendu, paramètre WebView2, animation, curseur, moteur, donnée, sauvegarde/migration/droit ou BUG-001/BUG-UI-002. Le journal natif ne prétend pas mesurer les frames présentées.

### Chronologie et observations

Premier diagnostic : build a68120b, environ79,464 s ; marqueurs65,800/68,784/74,864 s dans Paramètres, tous APRÈS disparition du symptôme selon l'utilisateur. Pas d'inférence sur le gel à partir des mesures normales autour d'eux. Longue tâche755 ms à l'ouverture de Nouvelle partie : problème de latence distinct, causalité avec le curseur non démontrée. Cette chronologie provient d'AUDIT-12 et du témoignage ; le premier original n'a pas été retrouvé pour une nouvelle analyse brute pendant cette passe.

Second original effectivement retrouvé dans Downloads sous le nom projectatlas-ui-diagnostic.json (nom utilisateur initial suffixé(1)), relu : build0a30925, schema v2,31440 ms,222 entrées,dropped=0 ; SHA256 `7327f172415d55902bc2855b4e994381ee53e67c674630dbdeafa66b1cf64cd4`. Aucun fichier utilisateur brut publié dans le dépôt.

| Réception relative | Fait brut / interprétation autorisée |
|---|---|
| 0 | Écran settings |
| 7218 ms | Écran menu, avant toute ouverture du globe dans ce journal |
| 8184 ms | F9, symptôme signalé ; pas heure physique exacte |
| 12584 ms | F10, retour normal signalé ; intervalle nominal4400 ms |
| 15337 ms | Écran settings |
| 16128 ms | F9, nouveau symptôme signalé |
| 18680 ms | F10 probablement accidentel selon correction utilisateur ; NE PAS clôturer automatiquement l'épisode |
| 26513 ms | pointerdown et mousedown droits, x627/y910, capture DOM false |
| 26616 ms | contextmenu aux mêmes coordonnées ; hors premier épisode, dans le second prolongé hypothétique |
| 29056 ms | F10, fin possible non confirmée |
| 31440 ms | Fin d'enregistrement |

Premier intervalle8184–12584 : dix échantillons de mouvement, x315–1140/y498–788 ; six résumés RAF, maximum17 ms. Second nominal INCERTAIN16128–18680 : six mouvements, x817–1307/y499–594, quatre résumés, maximum17 ms. Hypothèse prolongée16128–29056 :54 mouvements, x582–1919/y497–1079 ;15 résumés, maximum17 ms. Les résumés peuvent chevaucher les bornes : ne pas diviser naïvement leurs totaux pour déduire une fréquence exacte de l'intervalle. Aucun événement focus/blur/visibility/resize, aucune longue tâche, aucun got/lostpointercapture/pointercancel ni captured=true dans les222 lignes. Cela décrit les événements JS reçus, pas le focus/capture natifs ou le rafraîchissement DWM.

### Inspection native et versions

Tauri crée une seule fenêtre normale1280×800, minimum1024×640, redimensionnable, initialement non plein écran ; pas de transparent/alwaysOnTop/window-effects ou arguments navigateur configurés. set_display_mode change décorations/plein écran par les API existantes ; aucune commande de déplacement/confinement/masquage du curseur. Pas de commande Win32 personnalisée ni de ProcessFailed/CursorChanged natif instrumenté. Les menus React changent les vues, sans détruire/recréer des fenêtres WebView2. Contexte CSS : fond statique du menu, entrée180 ms, dialogues avec backdrop blur ; pas de preuve de défaut causal CSS.

Les logs du build0a30925 Windows, job125084767749/run41385323094, ont été relus : tauri2.12.5, tauri-runtime-wry2.12.3, tao0.37.2, wry0.57.1, webview2-com et webview2-com-sys0.39.1. Ces bindings SDK ne sont PAS la version du runtime installé. Cargo.toml utilise version2 et aucun Cargo.lock n'est suivi/retrouvé : ne pas attribuer ces versions à tous les builds futurs. Aucune dépendance changée ici.

Le [source Wry0.57.1](https://raw.githubusercontent.com/tauri-apps/wry/wry-v0.57.1/src/webview2/mod.rs) utilise ICoreWebView2Controller et CreateCoreWebView2Controller[WithOptions], hébergé dans un HWND. Ce n'est pas le chemin de l'hôte composition personnalisé avec SendMouseInput décrit dans l'incident5695. Cela n'exclut pas la composition interne Chromium/DWM. Le JSON utilisateur expose seulement Chrome/Edge156.0.0.0, pas le numéro exact WebView2. Aucun processus ProjectAtlas actuellement ouvert trouvé lors du contrôle ciblé : pas de mesure native indépendante ni de reproduction locale du symptôme.

### Incidents officiels comparés, sans assimilation causale

| Source primaire | Versions et conditions rapportées | Concordance / différence ProjectAtlas |
|---|---|---|
| [WebView2#5788](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5788) | Runtime156.0.4314.50, Tauri2.12.2/Wry0.57, Intel Arc iGPU + écrans virtuels, argument force-high-performance-gpu ; CSS animé figé mais UI interactive ;155.0.4283.45 témoin | Famille156 et interactivité compatibles ; pas un curseur double documenté. Aucun argument forcé dans notre code, GPU et arguments effectifs du poste inconnus. Piste conditionnelle, pas diagnostic. |
| [WebView2#5687](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5687) |152.0.4191.53, WPF Windows11 ; fermeture d'une WebView pendant curseur masqué avec une autre ouverte ;151 témoin | Curseur invisible/app interactive apparentés, mais une fenêtre chez nous, pas de fermeture WebView au changement de menu, famille156. Conditions non établies. |
| [WebView2#5695](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5695) |152.0.4191.x, hôte Win32 composition et SendMouseInput, glisser répété hors écran ;151 témoin | Entrées devenant inactives différentes de notre journal ; chemin hôte différent. Pas de raison de copier son contournement. |
| [WebView2#3509](https://github.com/MicrosoftEdge/WebView2Feedback/issues/3509) | SDK1.0.1774.30, WinUI3/MAUI/UWP Windows11 ; cursor:none/curseur non supporté déclenche un hang initial | Notre CSS utilise curseurs système, pas cursor:none, pas cet hôte. Faible correspondance. |
| [Tauri#14764](https://github.com/tauri-apps/tauri/issues/14764) | Tauri2.9.5/Wry0.53.5, WebView2144.0.3719.67 ; fenêtre transparente, traînée de barre de titre au déplacement/focus | Notre fenêtre n'est pas transparente ; symptôme et versions différents. Ne justifie pas une modification de transparence ou un refresh forcé. |

Hypothèses classées : (1) gel JS global prolongé moins probable pendant les fenêtres signalées, pas exclusion d'une pause brève ou hors échantillons ; (2) capture DOM défectueuse non étayée dans ce journal, capture/focus natifs encore inconnus ; (3) état de visibilité du curseur système, surface résiduelle, composition Windows/WebView2/pilote restent plausibles mais non départagés ; (4) lien causal Three/OrbitControls non nécessaire, aucun globe ouvert dans ce second journal. Aucune cause suffisamment démontrée pour appliquer un correctif.

### Instrumentation externe retenue et limites

Nouveau compagnon scripts/windows/Collect-AtlasCursorDiagnostic.ps1, livré dans l'artefact Windows. Lancement explicite, processus séparé du jeu : échantillonne par défaut100 ms pendant90 s, durées10–300 s/intervalles50–500 ms bornés par paramètres, nombre maximum de lignes calculé, aucune collecte tant qu'il n'est pas lancé. Pas d'installation/hook/tâche persistante, pas d'entrée injectée, SetCursor/ShowCursor/rafraîchissement/message forcé ou changement GPU. À la fin il exporte un JSON horodaté dans le dossier choisi ; fermeture anormale du terminal peut empêcher l'export. Ce compagnon reste indépendant du diagnostic JS : sa durée propre ne s'arrête pas au bouton d'arrêt JS, attendre son échéance ou quitter le processus ; aucune ressource persistante après sa fin.

Données : [GetCursorInfo/CURSORINFO](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-cursorinfo) donne la position native logique et les flags showing/suppressed, **pas l'image réellement présentée** ; [GetGUIThreadInfo](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getguithreadinfo) du thread GUI cible donne focus/capture/menu ; visibilité/minimisation, dimensions client et DPI. Position exportée uniquement lorsque la racine de fenêtre ProjectAtlas est au premier plan et le point dans son client. Racine d'un popup distinct peut être classée hors racine : foreground=false ne prouve pas une autre application. Données de focus/capture concernent le thread interrogé, pas tous les threads WebView2.

[GetAsyncKeyState](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate) lit seulement F9/F10 lorsque cette racine est au premier plan, bit haut uniquement : observation d'une touche maintenue, pas réception d'un message natif ni horodatage physique du début. Un appui court peut être manqué, UIPI/desktop peuvent rendre0 ; aucune conclusion à partir d'une absence seule. Versions de fichiers msedgewebview2.exe descendants du jeu et présence de deux arguments connus (force-high-performance-gpu/disable-gpu) sont relevées si accessibles ; aucun argument n'est appliqué. Les lignes de commande/chemins/titres/PID/noms de compte et informations des autres applications ne sont pas exportés ; pas de contenu de campagne ou saisie générale.

JS exporte désormais clock.startedUnixMs = performance.timeOrigin + début monotone ; pour une ligne JS, UTC estimée = startedUnixMs + row.ms. Natif exporte UTC et temps Stopwatch au début ET à la fin de chaque échantillon. Comparer ces horloges et leur dérive avant d'aligner ; utiliser les observations de F9/F10 comme points de rapprochement. Incertitude au moins liée à l'écart réel entre échantillons/à leur durée, à la précision des horloges et à toute correction UTC ; ce n'est pas une synchronisation subframe. Les anciens journaux sans clock ne se réalignent pas rétroactivement sur un futur relevé natif. Coordonnées Win32 du collecteur dans son contexte DPI, pas pixels CSS : comparer continuité et calibrer, pas égalité brute. Un sampler ponctuellement retardé n'est pas une preuve de gel du jeu.

### Prochain test humain discriminant

1. Extraire le nouvel artefact ; ouvrir une seule instance ProjectAtlas. Ne pas utiliser une autre fenêtre/sauvegarde pour reproduire.
2. Depuis le dossier extrait, lancer explicitement : `powershell.exe -NoProfile -File .\Collect-AtlasCursorDiagnostic.ps1 -DurationSeconds 90 -IntervalMs 100`. Aucune élévation ni modification de stratégie d'exécution demandée ; si une stratégie bloque le script, conserver l'erreur et utiliser une exécution autorisée sur le poste, sans contournement.
3. Revenir au jeu, activer son diagnostic et garder d'abord le menu sans globe. Filmer avec caméra externe ou capture incluant réellement le pointeur. Presser F9 dès perception puis F10 à la fin certaine, en les maintenant environ0,3 s pour augmenter la chance de lecture par le sampler ; expliquer tout appui accidentel. Reproduire le clic droit seulement comme observation, pas comme réparation.
4. Exporter le JSON JS après reprise puis attendre la fin du collecteur. Fournir les deux JSON et la vidéo ; relever GPU/pilote/Windows, mode, écrans/DPI et session locale/distante sans identifiant matériel ou compte. Refaire une session témoin sans compagnon puis avec lui pour repérer un coût de mesure, puis si nécessaire une session globe distincte. Ne changer aucun paramètre GPU/WebView2 pendant cette première comparaison.
5. Si les points natifs et JS bougent mais une ancienne flèche reste visible en vidéo, la piste présentation/plan du curseur se renforce sans désigner le pilote. Si showing devient false/suppressed malgré souris, examiner la gestion native de visibilité. Si focus/capture/menu natif change sans équivalent DOM, examiner popup/activation/hôte. Si F9 est échantillonné nativement mais reçu tard en JS et RAF montre une pause, examiner la file JS/hôte ; ne pas appeler l'écart « début du bug ». Si tous les relevés continuent normalement, les flags ne peuvent trancher image résiduelle contre composition : vidéo et trace de présentation deviennent nécessaires.
6. Escalade proposée seulement ensuite : [diagnostics Microsoft WebView2](https://github.com/MicrosoftEdge/WebView2Feedback/blob/main/diagnostics/README.md) et [profil ETW officiel](https://raw.githubusercontent.com/MicrosoftEdge/WebView2Feedback/main/diagnostics/etw.md), fenêtre très courte avant/pendant/après symptôme. Cette trace n'est ni activée ni téléversée ici ; elle peut contenir des données système sensibles et réclame une analyse privée et une configuration adaptée à la présentation/GPU. Le profil CPU n'est pas à lui seul une preuve des frames présentées. Aucun ETW/dump mémoire général ajouté au produit.

Validation de cette passe à suivre via GitHub : suites existantes inchangées, horloge de corrélation vérifiée en E2E ; compagnon compilé et structures Win32 contrôlées par -ValidateOnly sur Windows, ce contrôle ne simule pas une reproduction native. Aucun test/build lourd local. BUG-UI-003 reste OUVERT, PR #3 en brouillon, aucun merge/approbation/acceptation.

### Livraison de l'investigation causale — code 0c07e02719ea8c807cd77d28c086775ec47ab98e

Fichiers modifiés : src/app/uiDiagnostics.ts (base de corrélation UTC ajoutée à l'export uniquement), scripts/windows/Collect-AtlasCursorDiagnostic.ps1 (compagnon natif volontaire), tests/menu-integrity/flow.e2e.ts (deux assertions de corrélation), .github/workflows/desktop-windows.yml (validation et mise dans l'artefact), docs/BUGS_CONNUS.md et ce rapport. Aucun Rust, réglage Tauri/WebView2 ou rendu modifié. Revue séparée du diff effectuée : API natives de lecture seulement, borne durée/nombre de lignes, aucune saisie générale ou contenu de campagne exporté, pas de ressource/hook persistant. Durées natives des échantillons et espaces DPI explicités. Dernier durcissement : arguments entre guillemets/avec valeur reconnus sans confondre --disable-gpu-compositing et --disable-gpu ; cas contrôlés en -ValidateOnly.

| Vérification exécutée via GitHub sur 0c07e02 | Résultat réel |
|---|---|
| `npm test -- src/app/__tests__ src/components/__tests__ src/simulation/__tests__/startSelection.test.ts src/simulation/__tests__/executiveAuthority.test.ts --maxWorkers=1` | 30 fichiers, **220/220** |
| `npm run build` | **RÉUSSI** |
| `npx playwright test --config=playwright.menu-integrity.config.ts` | **7/7**, 3,0 min ; F9/F10, nettoyage, session et paramètres préservés |
| Même configuration `--grep "free idle" --repeat-each=3 --output=artifacts/menu-integrity/animation-repetitions --reporter=list` | **3/3**, 1,5 min |
| `npx playwright test --config=playwright.load-game.config.ts` | **2/2**, 33,8 s |
| `npx playwright test --config=playwright.new-game.config.ts` | **2/2**, 21,3 s |
| `cargo test` Windows | **4 tests réussis**, aucun échec |
| `./scripts/windows/Collect-AtlasCursorDiagnostic.ps1 -ValidateOnly` Windows | **RÉUSSI** : C# compilé, tailles Win32 et frontières de switches validées, aucune collecte démarrée |
| `npm run tauri:build`, staging compagnon et archive Windows | **RÉUSSIS** |
| `npm run verify -- -- --maxWorkers=1`, Linux et Windows | **EN COURS au dernier contrôle**, pas de succès global déclaré |

[Run menus](https://github.com/waffle913/ProjectAtlas/actions/runs/41389413977), [rapport/JSON/captures](https://github.com/waffle913/ProjectAtlas/actions/runs/41389413977/artifacts/13116544811), [run Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41389414010), [nouvel exécutable/installeur/compagnon](https://github.com/waffle913/ProjectAtlas/actions/runs/41389414010/artifacts/13116554750), [CI générale Linux/Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41389413957). Les checks du commit documentaire ultérieur ne sont pas déclarés validés.

Les deux JSON E2E ont été téléchargés et ouverts : clock.startedUnixMs présent et égal à l'origine performance + démarrage monotone ; diagnostic arrêté et deux marqueurs clavier reçus dans le parcours sans souris. Cela valide le format de corrélation, pas son alignement avec une collecte native humaine encore inexistante. La validation Windows du script ne parcourt pas une reproduction GUI réelle. Les logs du nouveau build confirment encore Tauri2.12.5/Wry0.57.1/Tao0.37.2/bindings0.39.1 ; aucun numéro de runtime installé supposé.

Archive Windows téléchargée et inspectée sans lancer son contenu : SHA256 `00b0d7dcb9835816fff0209f7424913ac2e9b1127ae365b662c43319ad2a8c5d` ; projectatlas.exe `7fab1d9b57a49463a7ffce5b05392d1aa3d2c3dbe2039b62c9da49d34c396d3f` ; bundle/nsis/ProjectAtlas_1.0.0_x64-setup.exe `3a98c3b464a53e09332f3c939bece02ff5524e921fc72ada4e881cb93863f55e` ; Collect-AtlasCursorDiagnostic.ps1 `4945dcd79c673131e76fdc3fed1d045711bab4b2799f326642235c321ffd0417`. Le compagnon correspond au source après normalisation des fins de ligne et reste à côté de l'exécutable dans le ZIP ; il n'est pas installé/démarré automatiquement par l'installeur.

Aucune campagne de tests lourde, compilation ou collecte Win32 locale effectuée ; git diff --check réussi. Conclusion de cette passe : hypothèse d'un gel JS global prolongé réduite sur les épisodes documentés, aucune cause précise établie, outil et protocole plus discriminants livrés pour le prochain essai. Aucun correctif du curseur revendiqué. **BUG-UI-003 OUVERT**, PR #3 brouillon sans fusion/approbation/acceptation. La poursuite dépend d'une reproduction humaine native et des deux traces synchronisables, pas d'une CI verte. Arrêt au contrôle GitHub selon préférence utilisateur antérieure ; CI générale encore en cours.
