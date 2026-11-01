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

## UX-001 — Animations et transitions absentes du globe des menus « Nouvelle partie » et « Charger une partie »

- **Catégorie :** Amélioration UX connue / finition visuelle, **pas une défaillance du moteur**.
- **État :** Manque observé dans « Nouvelle partie » ; exigence à reprendre dans « Charger une partie », qui n'est pas encore implémenté.
- **Priorité :** Basse ; correctif différé à une passe de finition commune des menus. Ne bloque ni la fusion du menu « Nouvelle partie » ni la conception de « Charger une partie ».
- **Signalé :** 31 octobre 2026.
- **Périmètre vérifié :** branche UI `ui/new-game-globe` de `waffle913/ProjectAtlas`, notamment `src/components/new-game/globeRenderer.ts`, `CountryGlobe.tsx`, `NewGameSetup.css` ; pas d'affirmation de test sur un menu de chargement inexistant.

### Comportement actuel constaté

Le globe est réellement interactif en 3D : rotation manuelle, zoom, sélection et surbrillance des pays, recentrage de caméra. **Ce n'est pas une image statique.** En revanche, la rotation n'utilise pas d'inertie (`enableDamping = false`), le recentrage est immédiat plutôt qu'animé, et les menus ne possèdent pas encore de transitions visuelles abouties. Aucune rotation automatique du globe au repos n'est prévue dans l'implémentation observée.

### Comportement souhaité (à arbitrer pendant la finition)

- **Rotation manuelle fluide :** inertie/amortissement discret, sans réduire la précision du clic ni perturber la sélection des pays.
- **Sélection d'un pays :** transition de caméra douce vers le pays choisi, plutôt qu'un saut instantané, en conservant une interaction réactive.
- **Navigation :** transitions courtes et cohérentes pour la sélection, les panneaux et les étapes ; éviter les effets cinématiques envahissants.
- **Animation au repos :** rotation lente éventuelle du globe, **facultative** ; elle ne doit pas gêner la lecture ou déplacer le pays lorsque l'utilisateur interagit.
- **Accessibilité et performances :** respecter `prefers-reduced-motion`, limiter l'animation aux moments utiles et préserver WebGL dégradé / fallback sans WebGL.
- **Réutilisation :** mutualiser la logique d'animation du globe entre « Nouvelle partie » et « Charger une partie ». Dans « Charger », les animations sont purement visuelles : la sauvegarde est affichée en **lecture seule**, sans avancer le temps de simulation.

### Critères d'acceptation

1. Sélection d'un pays ou d'une sauvegarde : transition visible mais sobre, sans erreur de caméra, sélection ni surbrillance.
2. Rotation/zoom restent utilisables pendant ou après la transition ; arrêt propre lors d'une interaction de l'utilisateur.
3. Comportement adapté au mouvement réduit et à l'absence de WebGL ; aucun chargement ni changement de données non demandé.
4. Ne pas introduire de boucle de rendu permanente coûteuse pour une animation inexistante : activer le rendu au besoin ou seulement pendant la transition.
5. Tests/builds **uniquement sur GitHub Actions**, pas d'exécution locale imposée.

**Suivi :** effectuer lors d'un passage de finition commun aux deux menus, sans interrompre le développement actuel de « Charger une partie ».
