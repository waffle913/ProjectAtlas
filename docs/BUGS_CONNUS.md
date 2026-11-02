# ProjectAtlas — Bugs connus et correctifs différés

Ce registre consigne les écarts **constatés** entre les contrats de simulation et leur intégration dans le moteur. Un correctif différé n'est pas une fonctionnalité abandonnée. Ne pas confondre un comportement actuellement implémenté, un contrat de données et une règle de conception.

## BUG-001 — Le contrôle d'une région attribue implicitement le contrôle de ses installations secondaires

- **État :** Confirmé par lecture du code ; correctif différé.
- **Gravité :** Importante pour la cohérence des simulations de guerre, de production et d'énergie.
- **Échéance :** Avant validation de l'intégration guerre × actifs × économie/énergie (jalons 0.24 / 0.27 / 0.31 et validation 0.34). Ne bloque pas l'interface « Charger une partie ».
- **Signalé :** 31 octobre 2026.
- **Dépôt étudié :** `waffle913/ProjectAtlas`, branche `main`, commit `8fcf8cc8eea830bbb3a443c76915afc00754e257`.

### Constat technique

Dans `src/simulation/assets/runtime.ts`, `assetController(...)` et `assetCountry(...)` retournent le contrôleur effectif de la **région** (`effectiveRegionControl(state, asset.regionId)`) pour décider qui contrôle un **actif individuel**. Cela assimile implicitement le contrôle de toutes les installations de la région au contrôle régional, même en l'absence de capture explicite de chaque site. Cette approximation affecte notamment certaines autorisations, l'entretien des actifs et leur consultation.

Le contrat `src/simulation/resources/control.ts` distingue déjà souverain, exploitant, contrôleur local et occupant, mais constitue pour l'instant une couche de contrat pure qui n'est pas raccordée de bout en bout aux opérations, à la production, aux réseaux et aux flux financiers. **Ne pas présenter les transferts automatiques de tous les revenus comme un bug déjà reproduit : cette intégration est encore incomplète.**

### Scénario de référence : Canada contre États-Unis — Maine

1. Pendant la guerre, le Canada s'empare des composantes stratégiques déterminantes du Maine. Le Maine passe sous contrôle effectif canadien, mais demeure occupé (rayures sur la carte) tant qu'il n'a pas été cédé. **Cette prise de contrôle régionale ne suppose pas la capture de chaque installation secondaire.**
2. Une centrale électrique américaine, située dans cette région mais non capturée, **reste sous contrôle local américain**. Si elle dispose encore de son personnel, de son combustible, de ses matières premières, de sa maintenance et de connexions intactes, elle peut continuer de produire et de fournir de l'électricité aux destinataires américains. Une ligne coupée ou un siège peut interrompre cette fourniture sans transférer pour autant la propriété ni le contrôle de la centrale.
3. Le Canada doit **capturer explicitement l'installation** (ou agir sur les accès et réseaux selon les systèmes disponibles) pour obtenir une capacité matérielle de contrôle sur celle-ci. Même une capture n'entraîne pas automatiquement la nationalisation de la société, la disponibilité de ses travailleurs, la réaffectation de sa production ou l'acquisition de ses profits.
4. Après un traité cédant effectivement le Maine au Canada, la souveraineté de la région change et le territoire apparaît canadien en couleur pleine. L'identité des installations et les droits des entreprises **ne sont pas automatiquement réécrits** ; leur contrôle opérationnel et les conséquences économiques suivent leurs propres événements et règles.
5. **Profits de l'entreprise ≠ recettes fiscales du gouvernement**. Les revenus, impôts, stocks, capacités et fournitures d'énergie doivent suivre leurs circuits explicites, sans bonus ni transfert national implicite.

### Règle non négociable

**Contrôle régional ≠ contrôle opérationnel individuel des installations ≠ propriété juridique ≠ droit d'exploitation.** Le basculement des composantes déterminantes peut attribuer une région à un contrôleur sans transférer l'ensemble de ses usines, fermes, mines, centrales, dépôts, postes électriques ou réseaux secondaires.

### Critères d'acceptation du correctif

- Chaque installation possède une identité persistante liée à sa région, un contrôleur local propre (ou état indisponible explicitement justifié), un propriétaire et un exploitant distincts selon le niveau de précision admissible.
- Changement de contrôle d'une région : **aucun transfert implicite** de contrôle individuel, de propriété, d'exploitation, de production ou de profits des installations non capturées.
- Capture, reprise, destruction, interruption logistique et réparation d'une installation ont des effets **explicites** et causalement attribués, sans fabrication de géolocalisation précise.
- La production et la distribution (électricité comprise) dépendent des acteurs habilités, des capacités, du personnel, des intrants et de la connexion physique réelle ; aucune activité gratuite, aucun double compte.
- Le traité de paix modifie la souveraineté et les autres statuts expressément établis par son contenu, pas la propriété privée de toutes les entreprises du territoire par défaut.
- Sauvegarde et rechargement préservent état régional, contrôle local des installations, opérateur, propriétaire, disponibilité de production et connexions dans la mesure où ces mécanismes existent.
- Tests d'intégration couvrant : Maine pris sans centrale capturée ; centrale continuant à livrer malgré occupation si les réseaux fonctionnent ; centrale capturée ou isolée ; traité de paix ; reprise de sauvegarde ancienne. **Tests et builds exclusivement dans GitHub Actions.**

### Contraintes de conception existantes

Le contrat 0.27.2 fournit actuellement une localisation à la région ; la localisation intra-régionale de précision supérieure reste soumise à décision de design et à provenance géographique. Ne pas inventer de coordonnées d'installation pour satisfaire ce bug.

### Sources à relire avant intervention

- `docs/operations-0.19.md` — contrôle régional par composantes décisives ; secondaires non décisives.
- `docs/roadmap-submilestones.md` — 0.24.8, 0.27.8, 0.31.8 et identités territoriales.
- `docs/resources-0.27.md` — contrat des installations, contrôle, énergie et réseaux.
- `src/simulation/assets/runtime.ts` — `assetCountry`, `assetController`, `runAssetMaintenance`.
- `src/simulation/assets/workforce.ts` — `effectiveRegionControl`.
- `src/simulation/resources/control.ts` — `InstallationControl`, `exploitAuthorized`.
- `src/simulation/resources/installation.ts` et `src/simulation/resources/network.ts` — contrats d'installations et réseaux.

**Suivi :** à soumettre à Reasonix lors du chantier de cohérence guerre/industrie/énergie. Ne pas lancer un patch isolé dans le cadre du menu « Charger une partie ».

---

## UX-001 — Animations et transitions obligatoires avant validation humaine des menus

Décision utilisateur, 1er novembre 2026 : les animations du globe partagé et les transitions de menus sont désormais obligatoires avant acceptation humaine. Le report facultatif du 31 octobre est remplacé par cette décision. Il ne s'agit pas d'un changement du moteur.

Implémentation sur `ui/menu-integrity-animations`, soumise à CI et revue : rotation libre très lente, interruption manuelle, inertie discrète, focus sphérique annulable, cadrage adapté et maintien du pays au centre. France présélectionnée informativement au départ ; le focus est explicite. Retour à la vue libre distinct. Mouvement réduit utilisateur OU système : pas de rotation automatique, transition ni inertie. Aucun rendu automatique en focus au repos ; géométries réutilisées. Transitions CSS courtes, sans écriture de sauvegarde ni progression de simulation.

Critères : tests Actions de sélection/interruption/changement de pays, navigation réversible, pause des menus, sans WebGL, 1920×1080 et 1366×768 à 100/150 %, captures réelles et exécutable Windows. Voir [le rapport de mission](menu-integrity-animations.md). **Implémentation et CI ne valent pas acceptation.** L'utilisateur conserve son test personnel Windows et son veto ; aucune fusion automatique.

## BUG-UI-002 — Références documentaires hors des Crédits

Signalement humain Windows du 1 novembre 2026, AtlasMemory `AUDIT-2026-11-01-07`, départ `d0cade4978b46db9121aef9a60bafd17cd6bf240`. **État : références documentaires corrigées avec preuve automatisée sur `ef89b9c8038ffa0b5148573a2a3f53c92b1d98b5` ; validation humaine confirmée par l’utilisateur (AUDIT-2026-11-01-09).** Le SHA exact du binaire testé par l'utilisateur n'a pas été communiqué ; ne pas lui attribuer automatiquement le HEAD.

Inventaire et traitement :

| Emplacement | Nature | Traitement |
|---|---|---|
| Carte 2D, préfixe Leaflet du contrôle d'attribution (`App/FitWorld`) | Crédit de bibliothèque | Préfixe retiré ; contrôle d'attribution des couches maintenu. Notice BSD 2-Clause complète embarquée et lisible dans Crédits. |
| Nouvelle partie, silhouette, pied de globe et note du catalogue (`NewGameSetup`) | Référence documentaire Natural Earth/NASA et duplication générique de source | Centralisée dans Crédits. Contour, géométrie indisponible et avertissement fond historique 2016 conservés. |
| Charger, pied de globe (`SaveManager`) | Référence documentaire aux ressources du décor | Centralisée dans Crédits ; caractère historique/non-observation conservé. |
| Panneau Région, section Geography source (`RegionPanel`) | Détails techniques de traçabilité | Consultables avec l'option existante Show provenance details, comme le panneau Pays. Souveraineté et état de couverture géographique restent visibles. |
| Faits Nouvelle partie et Pays | Date, estimation, disponibilité et provenance de faits publics | Conservés. Un fait ancien ne devient pas une observation courante. |
| Panneaux militaires/commerciaux et actualités sauvegardées | Origine des rapports, fraîcheur, limites, historique accessible | Conservés intégralement ; ce sont des informations de jeu, pas des crédits de moteur de rendu. |
| Pays, identité et détenteurs de fonctions | Provenance publique consultable sur demande | Réglage de provenance existant conservé, sans nouvelle exposition de réalité interne. |
| Liens Crédits/Documentation dans les menus | Accès à l'écran dédié | Conservés. |

Vérification des obligations, 2026-11-01 : [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) publie ses géométries dans le domaine public et n'exige pas d'attribution ; le crédit reste dans Crédits. Les [conditions NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/) demandent de reconnaître la source ; le crédit complet de la texture Black Marble (NASA Earth Observatory, Joshua Stevens ; VIIRS Miguel Román/NASA GSFC) reste visible dans Crédits, avec lien à la ressource et aux conditions. Aucune obligation de proximité n'a été identifiée dans ces conditions générales pour cette ressource ; aucune mention tierce spécifique n'a été supprimée. La [notice Leaflet 1.9.4](https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/LICENSE) exige la conservation du texte dans les sources et, pour les binaires, dans les documents/matériaux distribués : copie intégrale dans `public/menu/leaflet-LICENSE.txt`, consultable hors ligne depuis Crédits. Notices Three.js MIT et Lucide ISC inchangées. Aucun jeu de données requalifié juridiquement ; les limitations/licences non confirmées du projet restent inchangées.

Preuves attendues : tests d'accès aux Crédits et chargement de la notice complète dans les quatre configurations, absence des légendes documentaires déplacées, tests Région avec/sans provenance. La suppression d'un texte dans le code seule n'est pas une validation humaine de toutes les surfaces.

## BUG-UI-003 — Curseur visuellement figé sous Windows

**État : OUVERT — reproduit par l’utilisateur, NON REPRODUIT indépendamment par l’assistant.** Signalement humain intermittent : curseur figé ou doublé après clic droit, freezes apparents possibles, interactions parfois fonctionnelles, y compris au menu principal avant le globe. Aucun élément ne permet encore de conclure entre curseur natif immobilisé, image fantôme ou défaut de rafraîchissement. Aucun correctif du curseur natif n'est revendiqué.

Diagnostic de code : CSS utilise les curseurs natifs pointer/not-allowed et les contrôles de carte ; aucun curseur image personnalisé, cursor:none, déplacement ou confinement du pointeur dans le backend Rust examiné. Le texte de survol du globe et l'aide ont pointer-events:none. OrbitControls r187 capture le pointeur sur pointerdown, traite pointercancel et libère la capture sur fin de geste ; le wrapper avait son propre point de départ de sélection sans nettoyage sur annulation/perte de capture. Ce défaut distinct pouvait transformer un relâchement après annulation en sélection pays. Nettoyage minimal ajouté sur pointercancel/lostpointercapture et retiré au démontage, sans manipulation des internes d'OrbitControls. Le test a également montré un retour en focus après relâchement alors que la capture avait été explicitement perdue ; pointerup vérifie désormais la capture effective avant de convertir le geste en clic, sans dépendre du moment de livraison de lostpointercapture. Tests : annulation, perte de capture, absence de clic indu, nouveau glisser, recentrage et zoom ; journal pointer-events joint au test. **Cette correction d'annulation ne prouve pas la résolution du symptôme Windows.**

Environnement : l'inventaire Windows expose une archive `projectatlas-windows.zip` dans WinRAR, aucune fenêtre ProjectAtlas ni entrée installée correspondante. Aucun nouveau binaire installé/lancé pour cette investigation. Chromium/SwiftShader des runners n'est pas Tauri/WebView2 et ne valide pas le rendu matériel du curseur natif. Configuration GPU, accélération, curseur natif, versions Rust/Tauri et formats de sauvegarde laissés inchangés. Les fragments de rendu antérieurs à 150 % ne suffisent pas à attribuer le problème au GPU.

Protocole de reproduction Windows :

1. Relever SHA exact de l'artefact/installateur, version Windows/WebView2, GPU/pilote, souris et éventuel accès distant. Noter mode fenêtre et échelles UI/Windows, sans changer le système pour contourner le bug.
2. Utiliser une campagne de test ; ne pas abandonner une progression réelle. Ouvrir menu principal, Paramètres, Crédits, Nouvelle partie et aperçu Charger, puis revenir. Répéter à 1920×1080 et 1366×768, UI 100/150 %.
3. Faire vingt cycles souris libre → bouton survolé → clic → retour ; noter si l'état de survol suit la vraie souris alors qu'une ancienne image de pointeur reste visible.
4. Sur le globe : maintenir puis glisser, sortir du canvas avec le bouton enfoncé, relâcher, revenir ; zoomer et recentrer. Vérifier qu'un geste annulé ne sélectionne pas de pays et que le geste suivant fonctionne.
5. Interrompre un geste par Alt-Tab puis retour, et passer menus/clavier Tab/Entrée. Comparer avec mouvement réduit activé, sans désactiver globalement l'accélération.
6. En cas d'anomalie, noter écran/action/heure et si le clic, le survol et le clavier répondent ; distinguer position physique du pointeur et image résiduelle. Filmer avec inclusion explicite du pointeur, ou avec un appareil externe : une capture qui exclut le curseur natif ne démontre pas qu'il est invisible.
7. Joindre la séquence, les positions et le SHA pour diagnostic. Toute investigation GPU/WebView2 supplémentaire reste une hypothèse à vérifier ; ne pas masquer le curseur ni introduire de curseur artificiel.

Validation humaine et autorisation de fusion demeurent exclusivement à l'utilisateur. BUG-001 inchangé.

### Résultats de la passe UI du 1 novembre 2026

[Menus et régressions du code ef89b9c](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034421) : unités 213/213, build frontend réussi, menus 5/5, répétitions animation 3/3, Charger 2/2 et Nouvelle partie 2/2. Les contrôles des Crédits et de leur notice Leaflet sont effectivement parcourus dans les quatre configurations ; les provenances Région sont testées avec/sans demande explicite. Le journal du scénario d'animation contient 18 événements : 3 pointerdown, 3 pointerup, 1 pointercancel, 1 gotpointercapture, 1 lostpointercapture et 9 mouvements. Les états de capture au relâchement sont false/false/true pour les deux interruptions puis le nouveau drag. Le style CSS observé est auto. Ces données démontrent le parcours DOM, pas l'image du curseur Windows.

[Windows/Rust/build](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034395) réussi ; [nouvel installateur/exécutable du même code](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034395/artifacts/13103908882). [Captures, rapports et pièces jointes](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034421/artifacts/13103824519). [CI générale Linux/Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41359034380) encore en cours au relais : aucune réussite globale déclarée. Le code testé est ef89b9c ; le commit documentaire qui consigne ces résultats ne modifie aucun fichier exécutable.

BUG-UI-003 reste OUVERT / NON REPRODUIT sous Tauri/WebView2. Seul le défaut distinct de conversion d'un geste interrompu en clic est corrigé avec preuve navigateur. Ne pas annoncer que le curseur natif figé est réparé. La PR reste en brouillon ; test humain Windows et revue indépendante requis. Arrêt à la vérification GitHub selon la préférence utilisateur antérieure.

## BUG-UI-003 — diagnostic Windows, reprise après AUDIT-2026-11-01-09

**OUVERT — reproduit par l'utilisateur ; cause NON ÉTABLIE, reproduction native indépendante NON EFFECTUÉE.** Le curseur se fige parfois, un clic droit ailleurs peut montrer un deuxième curseur, et un freeze apparent peut coexister avec des interactions fonctionnelles. Le symptôme survient aussi au menu principal avant toute ouverture du globe. Le correctif antérieur des gestes n'a pas résolu ce symptôme ; OrbitControls n'est pas une condition nécessaire. BUG-UI-002 a été validé par l'utilisateur et n'est pas rouvert.

### Examen et limites

HEAD de départ local/distant vérifié : `77b417b8f80a3aabb5c1206224e71ca9c9829804`. Tauri : fenêtre redimensionnable 1280×800, pas de transparence configurée, pas de commande native de curseur/confinement ; les commandes de mode d'affichage sont conservées. CSS/React : fond du menu statique, calques décoratifs sans événements pointeur, animation d'entrée 180 ms, transform final none ; le flou backdrop concerne les dialogues. Aucune preuve que ces effets causent le bug. Les boucles de simulation/sauvegarde ne sont pas modifiées. Absence de fenêtre ProjectAtlas dans l'inventaire natif courant ; aucun binaire lancé ni symptôme natif capturé pendant cet examen. Aucun correctif causal revendiqué.

Hypothèses NON VÉRIFIÉES : ancienne surface contenant une trace du pointeur, curseur natif non rafraîchi, composition WebView2/DWM/GPU, pause du rendu ou longue tâche JavaScript. [Microsoft décrit plusieurs processus WebView2 dont le processus GPU](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model) : un journal DOM seul ne mesure pas leur présentation à l'écran. [Diagnostic officiel WebView2](https://github.com/MicrosoftEdge/WebView2Feedback/blob/main/diagnostics/README.md) pour une investigation native ultérieure. Ne pas modifier GPU, animations ou curseur sans preuve.

### Enregistrement temporaire volontaire

Paramètres → **Activer le diagnostic du curseur (5 min)** → Back pour observer d'abord le menu principal. Bandeau indépendant, bouton **Marquer le symptôme**, puis **Arrêter et exporter le diagnostic** : téléchargement JSON `projectatlas-ui-diagnostic.json`. Exportez après reproduction et avant fermeture de l'application. **Effacer et fermer le diagnostic** libère le journal. Aucune activation persistante, aucun envoi réseau, aucun contenu de campagne, chemin personnel, texte DOM, touche tapée ou donnée de sauvegarde collecté.

Maximum 2 400 entrées en tampon circulaire, compteur des entrées remplacées, arrêt après cinq minutes (livraison du timer différable si fenêtre suspendue). Écoute passive : pointer/mouse down/up/move, contextmenu, annulation/capture, coordonnées client, type de cible sans texte/ID, style de curseur, focus/visibilité/redimensionnement, écran et événements d'animation/transition. Tous les mouvements sont comptés, leurs coordonnées échantillonnées au plus à 10 Hz ensemble. RAF : résumé par seconde (nombre, moyenne, maximum, intervalles >50 ms), pas une entrée par image. Longues tâches si API disponible : début/durée, sans attribution de scripts. Aucun RAF, observer, écouteur d'entrée ou timer de diagnostic désactivé ; seul le composant inactif reste monté. Aucun accès aux sauvegardes, horloge canonique, RNG ou préférences.

Environnement : SHA de build GitHub, dimensions/DPR, présence Tauri, Windows, version Chromium/Edge exposée. Version exacte WebView2 et pilote/GPU explicitement indisponibles : les relever manuellement ; ne pas les déduire du user-agent. Le diagnostic ne crée aucun contexte WebGL afin de préserver la comparaison avant globe. Instrumentation active non neutre : coût borné, export alloue un petit JSON ; mesurer hors diagnostic également. RAF mesure les callbacks JavaScript, **pas la présentation GPU ni la rasterisation du curseur** ; une longue pause en arrière-plan n'est pas une preuve de freeze.

### Protocole de reproduction et lecture

1. Relever SHA exact du binaire, Windows, WebView2 installé, carte/pilote GPU, écran/taux de rafraîchissement, DPI Windows et UI 100/150 %, mode fenêtre/plein écran, souris, session locale/distante. Ne pas joindre de chemin ou nom de compte.
2. Démarrer normalement, observer le menu sans globe, puis activer le diagnostic via Paramètres et revenir au menu. Déplacer sur fond/boutons, clic gauche/droit à différents endroits, ouvrir/refermer les menus, Alt-Tab et retour. Filmer si possible avec caméra externe ou capture incluant le curseur ; une capture de fenêtre peut l'omettre. Marquer le symptôme dès que possible, noter le temps relatif sur la vidéo.
3. Exporter avant toute ouverture du globe pour un journal témoin sans Three.js. Recommencer une session distincte avec Nouvelle partie puis Charger : glisser, relâcher hors surface, interruption Alt-Tab, retour aux menus. Comparer les modes et échelles par sessions, sans changer de pilote/GPU durant la mesure initiale.
4. Si coordonnées et RAF progressent alors que le curseur affiché reste immobile : piste de présentation native/surface, pas preuve d'une cause GPU. Si coordonnées changent et image UI reste ancienne : suspecter présentation, corroborer vidéo. Si RAF présente un grand intervalle avec longue tâche visible : preuve de blocage JS pendant cet intervalle, pas explication automatique du double curseur. Si RAF s'interrompt sans longue tâche : ambigu (arrière-plan, suspension, processus/rendu), corréler focus/visibilité et diagnostics natifs. Si événements cessent/capture reste active, comparer pointercancel/lostpointercapture puis retour ; ne pas confondre absence d'événements et souris immobile.
5. En gel complet, l'export JS ne peut pas fonctionner avant reprise ; conserver vidéo/heure relative et diagnostic Windows externe. Export de téléchargement WebView2 à confirmer sur le nouveau binaire humain ; réussite Chromium ne prouve pas ce chemin natif. Ne pas annoncer BUG-UI-003 résolu sur la seule base d'une CI verte.

Validation du collecteur sur `a68120b05a2988502d1bc612a59089aac62204ba` : 216 unités, menus historiques 5/5 + diagnostic 1/1, animations 3/3, Charger 2/2, Nouvelle partie 2/2 et Windows/Rust réussis. Le JSON exporté a été ouvert et contient la tâche synthétique de 90 ms ; aucune reproduction native du bug n'en est déduite. [Exécutable Windows de diagnostic](https://github.com/waffle913/ProjectAtlas/actions/runs/41369697704/artifacts/13108733861). Résultats, empreintes et CI générale encore en cours dans le rapport de mission. Ne pas clore ce bug avant reproduction et validation humaines Windows.

## BUG-UI-003 — F9/F10, suite AUDIT-2026-11-01-12

Clarification humaine : les marqueurs 65,800 s / 68,784 s / 74,864 s du journal précédent ont été posés APRÈS disparition du symptôme, le curseur empêchant de repérer le bouton pendant le gel. La cadence normale autour de ces marqueurs n'exclut donc aucun gel antérieur. Cause toujours non établie, BUG-UI-003 OUVERT ; BUG-UI-002 reste validé.

Nouveau protocole : activer explicitement le diagnostic dans Paramètres, revenir au menu sans ouvrir le globe ; **F9 = symptôme présent/début signalé**, **F10 = retour à la normale signalé**. Touches seules, sans Ctrl/Alt/Shift/Meta, répétition maintenue et composition IME ignorées. Fonctionne aussi dans les champs sans changer leur texte. Lorsque F10 est reçu pendant l'enregistrement, son action DOM par défaut est annulée ; l'interception native Windows reste à vérifier sur le poste humain. Aucun écouteur clavier ni interception avant activation ou après arrêt/démontage. Pas de conflit F9/F10 trouvé dans les commandes applicatives ; globe limité aux flèches/Home/+/- ; une interception Windows, un clavier nécessitant Fn ou une perte de focus peuvent empêcher la réception, à vérifier sur le poste humain. Ces raccourcis ne sont pas des raccourcis globaux Windows.

Export v2 : événements symptom-start et symptom-end à l'heure de RÉCEPTION par le gestionnaire JS (ms = receivedMs), timestamp brut de l'événement séparé, délai depuis le précédent callback RAF, focus/visibilité. Aucun début de gel reconstruit à partir de l'heure de touche ; si le thread est bloqué, le traitement peut être tardif. Une absence de réception ne distingue pas absence d'appui, interception système, focus perdu ou thread bloqué ; compte des marqueurs reçus, RAF et longues tâches apportent seulement des éléments de corrélation.

Tampon courant inchangé : 2400 entrées maximum et cinq minutes d'enregistrement. Chaque marqueur F9/F10 ou bouton fige une copie du contexte encore présent (mouvements/coordonnées/capture/focus/RAF/longues tâches/écrans) jusqu'au marqueur inclus ; conservation des QUATRE derniers contextes (clavier ou bouton) seulement, chacun de 2400 entrées maximum. Le contexte reste exportable après écrasement dans le tampon courant. Compteur discardedMarkerContexts pour les contextes plus anciens retirés ; dropped/droppedBeforeMarker pour les entrées remplacées ; coverage donne première/dernière réception, durée et nombre d'entrées réellement conservées pour chaque contexte et le tampon courant. **Aucune garantie de 30 secondes** : la fenêtre dépend de la densité d'événements et du moment de l'activation. Les RAF sont agrégés par seconde et au marqueur, pas conservés image par image ; le JSON ne mesure pas la présentation GPU ni le curseur natif.

Après retour à la normale, exporter via Tab/Entrée vers « Arrêter et exporter le diagnostic » (ou souris redevenue utilisable). Le bandeau affiche F9/F10. Export possible après arrêt automatique, tant que l'application reste ouverte. Aucune écriture dans les sauvegardes ou préférences ; aucune modification du moteur graphique, du GPU, des animations ou du curseur. Validation native humaine toujours nécessaire.

Conflit système identifié : [Microsoft documente F10 pour activer la barre de menus de la fenêtre active](https://support.microsoft.com/en-gb/accessibility/windows/keyboard-shortcuts-in-windows). Shift+F10 et les autres combinaisons restent intacts. Aucune promesse de neutralisation d’une touche interceptée par Windows avant sa réception dans WebView2.

Preuves du nouveau diagnostic sur `0a30925fa4a34963a57ed362b8539542e10d5ee3` : 220 unités, menus 7/7 (cinq historiques + deux diagnostics), animations 3/3, Charger 2/2, Nouvelle partie 2/2 et Windows/Rust réussis. JSON sans souris ouvert : réception F9 33 ms / F10 51 ms, contextes réels 33/51 ms dans ce test court, aucune perte ; unités de conservation après saturation et d'écouteurs arrêt/démontage réussies. [Nouveau Windows](https://github.com/waffle913/ProjectAtlas/actions/runs/41385323094/artifacts/13114938642). CI générale Linux/Windows encore en cours au relais ; voir le rapport. Aucune validation native du symptôme ni fermeture de BUG-UI-003.
