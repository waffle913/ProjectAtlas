# Organisations politiques — 0.23

## Statut

**Implémenté.** Le registre 0.13 fournit les partis (via gouvernance/élections), les syndicats et les associations (`politics.organizations`) ; les organisations religieuses n'existent pas dans le registre 0.13 : aucune n'est fabriquée, la couverture reste `unavailable` (`politics.religiousOrganizationsCoverage` — le support religieux existe comme vraie famille de système, et une organisation religieuse peut être enregistrée dynamiquement comme `modelled`).

## Fonctions implémentées

- `joinOrganization` / `leaveOrganization` / `dissolveOrganization` / `banOrganization` / `appealBan` / `resolveBanAppeal` / `mergeOrganizations` / `splitOrganization` / `registerOrganization` : les partis synchronisent l'appartenance canonique (`PoliticalPersonState.partyId` ⇔ `members`, `isPartyLeader` ⇔ rôle `leader`), y compris pour les partis dynamiques ; les fusions respectent les familles compatibles, transfèrent l'intégralité de la trésorerie (l'absorbée ne possède plus rien), et les personnes ne sont jamais supprimées.
- `banOrganization(actor, motive, evidence)` — interdiction **procédurale** avec acteur, motif, preuve **et base juridique** (droits constitutionnels via `rightsBasisFor` : une garantie est respectée, `not_guaranteed` relève de la loi ordinaire — jamais automatiquement interdit, une base `unavailable` refuse la procédure) ; tracée (`banEvents`) et **appelable** par un appellant identifiable, décidée par une autorité distincte du bannisseur ; un jugement rendu n'est pas rejugé. Les transitions incohérentes (re-ban, dissolution répétée, état incompatible) sont refusées.
- `runOrganizationAction` — **actions verrouillées par famille** : partis sit-in/démonstration (générale/capitale)/rally ; syndicats revendication (`addUnionClaim`), négociation (`negotiateUnionClaim`), grève, boycott ; associations pétition/campagne/lobby/boycott ; religions déclaration/soutien de réforme/rencontre gouvernementale/œuvres sociales/boycott. Chaque action est gated par les droits constitutionnels et l'état d'urgence, et **influence réellement le moteur d'opinion** (sentiment, salience, drivers) — jamais un bonus. Une grève exige une revendication pendante, un fonds suffisant, et produit la **conséquence économique réelle** des travailleurs représentés (retrait de travail : emploi → chômage conservé, production réduite) ; une revendication acceptée débouche sur le levier réel (proposition fiscale du chef de gouvernement, ou réponse gouvernementale en attente pour un ministre).
- Financement déterministe : trésorerie strictement rejouée par le ledger daté (conservation), provenance conservée (`source`), dons refusés aux organisations bannies/dissoutes, dons étrangers refusés, plafond = fonds du donneur ; `setOrganizationFunds` n'existe qu'à l'initialisation/migration (ou le jour d'enregistrement) — plus de robinet en simulation. Cybersécurité recalculée après chaque changement de trésorerie (don, vol, split, fusion, financement, coûts de grève/attaque).
- Courants internes modélisés (`addInternalCurrent`) : ils déplacent progressivement la ligne mutable du parti, qui influence **réellement** les électeurs (`effectivePartyProfile`) et le comportement parlementaire (`dynamicPartyGoalProfile`). Les organisations dynamiques utilisent réellement `representedInterests`/`representedCohorts`/`issuePriorities` pour leur évolution hebdomadaire.
- Pluralisme : enregistrement (avec règle de parti unique : pas de parti concurrent dans un système à un seul parti), fusion, scission (collision d'ID refusée), dissolution — avec réconciliation du leadership, des membres, du statut électoral et des fonctions institutionnelles.

## Contrat ciblé

État mutable des organisations (partis, syndicats, associations, organisations religieuses) séparé du registre statique :

- appartenance et rôles des personnes (unifiés avec `partyId`/`isPartyLeader`) ;
- courants/factions internes (issue/goal, continus, indépendants) ;
- financement (ressources, plafonds, provenance, dons étrangers refusés sans règle sourcée) et dépenses de campagne ;
- pluralisme : enregistrement/fusion/scission/dissolution, parti unique ;
- démissions et remplacements de dirigeants ;
- trésorerie déterministe, jamais une source de ressources magiques.

Ces organisations ne sont **pas** créées par `elections`/`constitution` ; elles se greffent sur `governance` et `politics` sans les réécrire.

## Règle

Toute valeur `sourced` porte une provenance datée ; `unavailable ≠ 0` ; le financement conserve exactement les flux existants (ledger signé daté) ; les membres et dirigeants ne sont jamais supprimés artificiellement.
