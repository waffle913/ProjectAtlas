# Constitution et institutions — 0.23

## Statut

Implémenté, tests dédiés (`src/simulation/__tests__/constitution.test.ts`), schéma **19**. La Constitution canonique est un état dérivé du registre politique 0.13 ; elle n'invente aucun droit, seuil ou procédure qui ne soit pas déjà représenté.

## Modèle canonique

`SimulationState.constitution` (`ConstitutionState`) contient, par Country :

- `coverage` : `derived` (à partir d'un enregistrement institutionnel admissible) ou `unavailable` (aucun enregistrement, rien n'est fabriqué) ;
- `provenance` : statut qualité, méthode, date de référence, limitation ;
- `parliament` : `power` (`decisive` / `legislative_and_censure` / `legislative` / `unavailable`) et chambres ;
- `headOfState` / `headOfGovernment` : mode de sélection et suffrage dérivés de `executiveSystem` ;
- `succession` : remplacement ordinaire du dirigeant ;
- `amendment` : seuil de révision, exigence de référendum, protection des dispositions fondamentales ;
- `elections` : suffrage, vote obligatoire, système parlementaire, tours ;
- `judicialReview` : contrôle constitutionnel (a priori/a posteriori) ;
- `emergency` : statut, crises justificatrices, restrictions ;
- `constitutionalRights` : liste typée de droits reconnus/indisponibles.

La dérivation se fait **strictement** depuis `politicalRegistry.institutions` (`executiveSystem`, chambres, règles électorales). Aucune valeur `sourced` n'est inventée ; l'absence de preuve produit `unavailable`.

## Procédures implémentées

- **Urgence** (`constitution/runtime.ts`) : `declareEmergency` exige une crise active **et** le poste exécutif ; `endEmergency` lève les restrictions ; `runEmergencyMonth` (cadence mensuelle) expire la justification quand les crises cessent.
- **Binding constitutionnel / clés protégées** : `registerConstitutionalBinding` enregistre des clés matérielles ; `rejectProtectedModification`, intégré dans `resolveProposalVoteForActor`, rejette une loi ordinaire qui modifierait une clé protégée (raison `constitutionally_protected`) ; un amendement constitutionnel en est exempté.

## Non implémenté (0.23, documenté)

- Procédure d'amendement complète (référendum, contrôle constitutionnel avant/après promulgation, seuil parlementaire) — l'architecture `instrumentClass`/`constitutionalDisposition`/clés protégées est en place, mais la procédure n'est pas encore câblée.
- Ministères/portefeuilles et organisations politiques mutables (partis/syndicats/associations/religions, financement, dissolution) — déférés.

## Invariants

`constitutionInvariant` (`constitution-0.23-integrity`) valide la version, l'initialisation non future, les seuils bornés, la validité des dates et la cohérence des références.

## Compatibilité

Migration schéma **18 → 19** dans `save.ts` : initialise `constitution` à partir du registre à la date de la sauvegarde, **sans rejouer** l'histoire ni recalculer d'opinion.
