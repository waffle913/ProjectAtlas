# Organisations politiques — 0.23

## Statut

**Non implémenté dans 0.23** — différé. Ce document enregistre le contrat ciblé afin qu'il ne soit pas réinventé plus tard ; il ne prétend pas qu'un moteur existe.

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
