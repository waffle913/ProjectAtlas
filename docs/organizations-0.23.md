# Organisations politiques — 0.23

## Statut

**Implémenté pour les familles représentées par le registre 0.13** (partis via gouvernance/élections ; syndicats et associations via `politics.organizations`). Les organisations religieuses n'existent pas dans le registre 0.13 : aucune n'est fabriquée, la couverture reste `unavailable`.

## Fonctions implémentées

- `joinOrganization` / `leaveOrganization` / `dissolveOrganization`.
- `banOrganization(actorPersonId, motive, evidence)` — interdiction **procédurale** avec acteur, motif et preuve, tracée (`banEvents`) et **appelable** (`appealBan`).
- `runOrganizationAction(sit_in | demonstration | strike)` — **gated par le type** (grève réservée aux syndicats), par les **droits constitutionnels** (assemblée/grève) et par **l'état d'urgence** (restrictions) ; ajoute un driver d'opinion causal, jamais un bonus.
- `setOrganizationFunds` (financement déterministe) et `addInternalCurrent` (courants internes modélisés).

## Contrat ciblé (futur)

État mutable des organisations (partis, syndicats, associations, organisations religieuses) séparé du registre statique :

- appartenance et rôles des personnes ;
- courants/factions internes (issue/goal, continus, indépendants) ;
- financement (ressources, plafonds, provenance) et dépenses de campagne ;
- pluralisme : enregistrement/fusion/scission/dissolution ;
- démissions et remplacements de dirigeants ;
- trésorerie déterministe, jamais une source de ressources magiques.

Ces organisations ne sont **pas** créées par `elections`/`constitution` ; elles viendront se greffer sur `governance` et `politics` sans les réécrire.

## Règle

Toute valeur `sourced` devra porter une provenance datée ; `unavailable ≠ 0` ; le financement devra conserver exactement les flux existants.
