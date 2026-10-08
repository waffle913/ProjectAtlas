# Élections — 0.23

## Statut

Implémenté, tests dédiés (`src/simulation/__tests__/elections.test.ts`), schéma **19**. Le moteur convertit un vote déterministe en sièges **sans réécrire le registre statique** de 0.13.

## État canonique

`SimulationState.elections` (`ElectionsState`) contient, par Country :

- `chambers` : allocation **dynamique par chambre** (`ElectionChamberState`), alignée sur les chambres sourcées du registre 0.13 — les votes parlementaires et l'intérêt institutionnel lisent la même réalité post-élection ;
- `totalSeats`/`seatsByParty` par chambre, `independentOtherSeats` réservés ;
- `lastElectionDate`/`nextElectionDate` par chambre (échéances électorales **récurrentes**) ;
- `government` : coalition au pouvoir + confiance, formée selon `appointmentMode` ;
- `parties` : état par parti (sièges courants, statut, promesses, crédibilité), tous les partis présents même à zéro siège.

## Conversion des votes

`proportionalSeats(votes, totalSeats, thresholdBps)` applique un quotient de Hare + plus forts restes déterministe (`allocate` existant), en excluant les partis sous le seuil. Les votes sont tirés de `politics.countries[countryId].nationalSupportBps` (aligné sur `politicalRegistry.countries[countryId].partyIds`) ; à défaut, l'allocation sortante sert de base documentée (baseline sortante, pas un bonus).

## Commandes

- `dissolveParliament(state, countryId, personId)` : exige le poste exécutif ; programme une élection.
- `runElection(state, countryId)` : recompute les sièges de façon déterministe et forme le gouvernement.
- `runElectionCycle` (cadence mensuelle) : déclenche l'élection quand `nextElectionDate` est atteinte.
- `makeCampaignPromise(...)` : enregistre une promesse typée (`promisedKind`/`promisedPayload`) **sans jamais appliquer la politique elle-même** ; la promesse ne devient un effet que si le futur système l'adopte par la voie institutionnelle.

## Non implémenté (0.23, documenté)

- Vote au niveau régional/cohorte et engagement complet, crédibilité dynamique (tenue/rupture de promesse), promesses → effet automatique, formation détaillée de coalition — déférés à la consolidation du moteur.

## Invariants

`electionsInvariant` (`elections-0.23-integrity`) valide le total de sièges non dépassé, les comptes entiers non négatifs, la crédibilité bornée et les dates de promesses/élections.

## Compatibilité

Même migration schéma **18 → 19** : `elections` est initialisé à la date de la sauvegarde depuis le registre, sans rejouer l'histoire.
