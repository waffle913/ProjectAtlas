# Élections — 0.23

## Statut

Implémenté, tests dédiés (`src/simulation/__tests__/elections.test.ts`), schéma **19**. Le moteur convertit un vote déterministe en sièges **sans réécrire le registre statique** de 0.13.

## État canonique

`SimulationState.elections` (`ElectionsState`) contient, par Country :

- `chambers` : allocation **dynamique par chambre** (`ElectionChamberState`) — toutes les chambres gardent leur identité, y compris celles dont l'allocation 2026 est `unavailable`, afin qu'une élection future produise un état dynamique utilisable ; `totalSeats`/`seatsByParty`, `independentOtherSeats` (résolus par la première vraie élection, jamais conservés éternellement) et `unallocatedSeats` (sièges explicitement inconnus : seuils, absence de données régionales, aucun candidat éligible — jamais de perte silencieuse) ; `lastElectionTurnout` (participation et couverture d'éligibilité réelles du suffrage en vigueur) ;
- `lastElectionDate`/`nextElectionDate` par chambre (échéances récurrentes, dates valides autour du 29 février) ;
- `government` : coalition au pouvoir + confiance (`majority`/`minority`/`coalition`/`unavailable`), formée **uniquement** depuis la chambre responsable de la confiance et seulement quand elle est (ré)élue ; une minorité n'est **jamais nommée automatiquement** (procédure explicite `formGovernment`) ;
- `parties` : état par parti (sièges courants, statut, promesses, crédibilité) ;
- `directElection`/`nextDirectElectionDate` : élection directe de l'exécutif comme **procédure récurrente** à sa propre échéance (jamais un appel manuel arbitraire) ;
- `headOfStateElections`/`nextHeadOfStateElectionDate` : sélection directe du chef de l'État comme procédure séparée.

## Conversion des votes

`proportionalSeats(votes, totalSeats, thresholdBps)` applique un quotient de Hare + plus forts restes déterministe (`allocate` existant), en excluant les partis sous le seuil (les sièges exclus restent explicitement `unallocatedSeats`). Le mode majoritaire utilise des **circonscriptions spatiales stables** : les sièges sont répartis entre les Régions par population, chaque circonscription est une tranche de population de sa Région (la seule structure spatiale sourcée) et élit au scrutin majoritaire (deux tours le cas échéant) ; le mode mixte utilise les mêmes circonscriptions pour sa composante majoritaire. Les votes nationaux, régionaux, de cohortes et de circonscriptions gardent l'**alignement d'index du registre** : l'exclusion d'un parti banni/dissous ne décale jamais le support des autres (le support de B reste celui de B), et le fallback sur les anciens sièges filtre aussi les partis bannis/dissous. Les **partis dynamiques** (créés/scindés/fusionnés) entrent au bulletin par la règle canonique d'enregistrement (organisation `party` active du pays) et tirent leurs votes du pool indécis.

Les règles de suffrage sont **réellement** appliquées : le vote obligatoire force la participation ; un âge de vote ou un suffrage restreint change la couverture d'éligibilité enregistrée (la structure d'éligibilité sourcée n'existe pas : jamais supposée universelle). Une règle électorale constitutionnelle effective le jour du scrutin est en vigueur **avant** le scrutin (application quotidienne des amendements avant le cycle électoral).

## Commandes

- `dissolveParliament(state, countryId, personId)` : exige le poste exécutif **et** le détenteur exact de la dissolution (`executive`) ; ne dissout que la chambre constitutionnellement dissoluble (la chambre de confiance), jamais toutes les chambres.
- `dissolveParliamentByParliament(state, countryId, personId)` : le pouvoir `dissolutionHolder='parliament'` est une vraie procédure — motion votée dans la chambre de confiance avec les positions propres de chaque parti et la distribution interne.
- `runElection(state, countryId, chamberIds?)` : recompute les sièges par chambre de façon déterministe ; le gouvernement n'est re-formé que si la chambre de confiance a été (ré)élue, et seulement pour une majorité/coalition ; sans leader valide recevant l'office, le gouvernement enregistré reste inchangé (aucune contradiction entre `elections.government` et `governance.persons`).
- `runElectionCycle` (cadence quotidienne) : déclenche chaque procédure à sa propre échéance (chambres, exécutif direct, chef de l'État, dérivation des promesses) — plus d'attente du premier jour du mois.
- `formGovernment(state, countryId, actorPersonId, personId)` : formation/nomination explicite d'un gouvernement (y compris minoritaire).
- `runDirectElection` / `runHeadOfStateSelection` : procédures récurrentes à échéance ; l'appel manuel hors échéance est refusé.
- `makeCampaignPromise(...)` : enregistre une promesse typée **sans jamais appliquer la politique**, signée par le leader du parti (acteur autorisé obligatoire). Le contenu d'une promesse est évalué contre les préférences des électeurs : une promesse appréciée et une promesse rejetée produisent des effets **opposés** (jamais un bonus plat). Le statut tenue/rompue est **dérivé des décisions réellement prises** (réformes fiscales promulguées, amendements enactés) dès qu'il est observable ; une promesse résolue est immuable.

## Non implémenté (documenté)

- Géographie **intra-Région** : les circonscriptions sont des tranches de population de la Région (la seule structure spatiale sourcée), chacune votant avec le bulletin agrégé de sa Région.
- Sélection de candidats au-delà des leaders de parti (un parti sans leader actif ne peut pas recevoir l'office : le gouvernement enregistré reste inchangé).
- Candidatures individuelles indépendantes : les indépendants initiaux sont résolus par la première vraie élection puis représentés en `unallocatedSeats`.

## Invariants

`electionsInvariant` (`elections-0.23-integrity`) valide la **réconciliation exacte** `sièges de partis + indépendants + unknown = totalSeats`, `currentSeats` ⇔ chambres, les identités des partis (registre ou organisations dynamiques), la coalition/`governmentStatus`, les offices associés (le chef du gouvernement d'un régime parlementaire appartient à la coalition enregistrée), les dates, la crédibilité et les promesses.

## Compatibilité

Même migration schéma **18 → 19** : `elections` est initialisé à la date de la sauvegarde depuis le registre, sans rejouer l'histoire. Les anciennes chambres converties reçoivent un `unallocatedSeats` égal au reliquat réel (les sièges autrefois perdus silencieusement deviennent explicitement inconnus).
