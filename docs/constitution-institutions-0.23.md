# Constitution et institutions — 0.23

## Statut

Implémenté, tests dédiés (`src/simulation/__tests__/constitution.test.ts`), schéma **19**. La Constitution canonique est un état dérivé du registre politique 0.13 ; elle n'invente aucun droit, seuil ou procédure qui ne soit pas déjà représenté.

## Modèle canonique

`SimulationState.constitution` (`ConstitutionState`) contient, par Country :

- `coverage` : `derived` (à partir d'un enregistrement institutionnel admissible) ou `unavailable` (aucun enregistrement, rien n'est fabriqué) ;
- `provenance` : statut qualité, méthode, date de référence, limitation ;
- `parliament` : `power` (`decisive` / `legislative_and_censure` / `legislative` / `weak_legislative` / `consultative` / `none` / `unavailable`), chambres, détenteur de la dissolution ;
- `headOfState` / `headOfGovernment` : mode de sélection et suffrage — `executiveSystem='parliamentary'` ne prouve à lui seul **aucune** méthode précise : elle reste `unavailable` sans preuve adéquate ;
- `succession` : remplacement ordinaire du dirigeant (règle `vacancySuccession` verrouillée du projet, jamais amendable) ;
- `amendment` : seuil de révision, exigence de référendum, protection des dispositions fondamentales ;
- `elections` : suffrage, vote obligatoire, âge de vote, système parlementaire, tours, seuil ;
- `judicialReview` : contrôle constitutionnel (a priori/a posteriori), nomination/durée de la cour, accesseurs ;
- `emergency` : statut, crises justificatrices par **identité permanente d'épisode**, restrictions, recommandations ministérielles ;
- `constitutionalRights` : liste typée de droits reconnus/indisponibles — les droits servent de contraintes et de fondements juridiques quand un système concerné agit ; `not_guaranteed` ne signifie jamais automatiquement « interdit » ;
- `protectedMaterialKeys` + `bindingEvents` + `revisionEvents` : trace datée de chaque protection/clé et de chaque révision par champ (ownership/versioning) ;
- `courtMembers` : cour constitutionnelle en exercice (nomination selon la règle constitutionnelle, mandat expirant selon `term`/`termYears`) ;
- `territory` : organisation fédérale/unitaire, autonomie régionale, compétences déléguées **reliées aux Régions** (`devolvedPowers`) et transfert souverain appliqué à `regionOwnership` quand la procédure l'autorise.

La dérivation se fait **strictement** depuis `politicalRegistry.institutions` (`executiveSystem`, chambres, règles électorales). Aucune valeur `sourced` n'est inventée ; l'absence de preuve produit `unavailable`.

## Procédures implémentées

- **Urgence** : `declareEmergency` exige une crise active **et** le poste exécutif, refuse d'écraser une urgence déjà active/expirée (les compteurs `unjustifiedSince`/mécontentement ne sont jamais remis à zéro) ; `endEmergency` lève les restrictions ; le pass mensuel expire la justification quand les crises cessent, fait **réellement** parvenir le mécontentement progressif à l'état d'opinion, et enregistre la recommandation (consultative) du ministre de l'Intérieur.
- **Binding constitutionnel / clés protégées** : `registerConstitutionalBinding`/`removeConstitutionalBinding` n'existent qu'à travers un amendement enacté ; `rejectProtectedModification` rejette une loi ordinaire qui modifierait une clé protégée. La détection correspond aux modifications fiscales réelles (`fiscal.employee`/`fiscal.employer`/`fiscal.payroll` selon la composante modifiée) et le registre des clés est dérivé du modèle fiscal canonique.
- **Amendement constitutionnel** : classification automatique principal/secondaire ; seuil parlementaire et référendum (un référendum requis mais pas encore tenu laisse la proposition en attente, jamais rejetée ; un référendum tenu n'est pas rejouable) ; **saisine réelle** de la cour (aucune saisine automatique, aucun acteur fabriqué) ; **verdict institutionnel déterministe et traçable** dérivé de la saisine, du texte et des normes en vigueur (grounds enregistrés, jamais injecté par l'appelant) ; effet appliqué **à la date effective réelle** (tâche quotidienne) ; annulation a posteriori par **replay** de la trace de révision — annuler A après B n'efface jamais la valeur de B ; `vacancySuccession` non amendable ; payload validé en profondeur (enums, seuils, durées, âges, termes, droits, règles judiciaires/électorales/territoriales) dès la création.
- **Sélection du chef de l'État** : `runHeadOfStateSelection` implémente `popular_direct` / `popular_indirect` / `parliamentary` avec mandat (`termYears`), `maxTerms` et participation réelle du suffrage ; `appointed`/`hereditary`/`other` refusent (pas de procédure modélisée, rien n'est fabriqué).
- **Cour constitutionnelle** : `appointConstitutionalJudge` applique la règle de nomination et le mandat ; les mandats expirent ; une décision exige un juge en exercice.
- **Pouvoirs du Parlement** : `none` signifie décision exécutive **explicite** (jamais l'adoption automatique d'un appel de vote de législateur) ; `consultative` reste un avis non contraignant suivi d'une décision exécutive ; `weak_legislative` conserve son vote réel et son override exécutif séparé.
- **Intégrité** : le fingerprint soumis inclut `instrumentClass` et `constitutionalDisposition` ; chaque `PendingAmendment` est strictement lié à l'instrument canonique adopté (id, Country, date effective, payload, fingerprint).

## Non implémenté (documenté)

- Indépendance d'une Région vers un **État nouveau** (la création de Country n'est pas modélisée) : le transfert souverain constitutionnel s'applique vers un Country destinataire existant.
- Nomination de la cour par `parliament`/`shared` (aucune procédure parlementaire de nomination n'existe) : la règle est représentée mais la commande refuse hors nomination exécutive.
- Constitutions mutables au-delà des champs 0.23 et procédure constitutionnelle complète de révision plébiscitaire : hors périmètre 0.23.

## Invariants

`constitutionInvariant` (`constitution-0.23-integrity`) valide la version, l'initialisation non future, les enums et structures imbriqués, les seuils bornés, les dates, la cohérence des références, le cycle de vie judiciaire (saisine/verdict/grounds), la canonicité des pendings (instrument enacté, fingerprint), la cohérence du replay (trace de révision ⇔ `appliedInverse`) et les champs de territoire/cour/urgence.

## Compatibilité

Migration schéma **18 → 19** dans `save.ts` : initialise `constitution` à partir du registre à la date de la sauvegarde, **sans rejouer** l'histoire ni recalculer d'opinion. Les backfills intra-schéma 19 complètent les champs introduits progressivement (trace de révision, membres de la cour, pouvoirs dévolus, recommandations, grounds, fingerprint des pendings) ; une urgence historique par type de crise **n'est jamais rattachée** à un épisode courant du même type — l'incertitude est conservée.
