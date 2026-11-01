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
