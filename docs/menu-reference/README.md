> **État actuel :** voir les [corrections après audit](audit-corrections.md) et les [nouvelles captures](audit/index.html). Le texte ci-dessous conserve le rapport de la première livraison, avant correction du comportement de sélection et du panneau de reprise.

﻿# Menu principal — reproduction de la référence

Branche : `ui/main-menu-reference`. Base : `208ad29`.
Travail limité à la présentation du menu ; aucune fusion effectuée.

## Composition et comportement

- Navigation, logo orbital, panneaux translucides, palette bleu nuit/or et pied de page reconstruits en React, CSS et SVG.
- À 1672 × 941, panneau des parties à environ (374, 232), dimensions 548 × 329 ; actualités à (374, 578), dimensions 603 × 269. La référence place ces panneaux à environ (374, 233) et (374, 578).
- Police système Segoe UI/Arial : la police source n'est pas fournie. Le dessin des icônes et du logo est une approximation vectorielle de la référence.
- Le globe est un fond raster statique indépendant des contrôles, sans simulation ni interaction 3D. Le cadrage et les couleurs sont dérivés de la référence ; la retouche du fond peut présenter de légères différences de détails.
- Continuer, Nouvelle partie, Charger, Paramètres, Crédits et Quitter appellent les fonctions existantes. Signaler un bug ouvre le dépôt GitHub. Documentation / Sources ouvre les crédits et sources existants.
- Les quatre dernières sauvegardes sont lues dans `listSaves()`, ordonnées par modification, et chargées par leur ID réel avec `loadSlot`. L'index est relu au retour du gestionnaire pour éviter les lignes obsolètes après suppression.
- Aucune sauvegarde, photographie de partie, drapeau ou durée de jeu n'est inventé. Sans parties, un état vide est affiché. Les aperçus des parties existantes utilisent une icône neutre faute de captures enregistrées.
- Aucun flux d'actualités n'existe dans le menu actuel : le panneau indique cette absence, sans articles, images d'événements ni dates fictives. Aucune réalité interne de simulation n'est exposée.
- Encyclopédie, Statistiques, Mods, Notifications, Messages, Discord et Voir plus sont désactivés avec explication. Nouvelle partie et chargement attendent l'initialisation existante.
- Échelle d'interface, contraste renforcé, navigation clavier et adaptation aux écrans étroits sont pris en compte. Aucune animation ajoutée.

## Captures réelles

Captures de l'application React exécutée dans Chrome, sans données de sauvegarde injectées et sans modification du DOM :

- `menu-1672x941.png` : dimensions exactes de la référence.
- `menu-1366x768.png` : écran plus petit.
- `menu-390x844.png` : page étroite défilante.
- `comparison.html` et `comparison.png` : référence à gauche, capture réelle à droite.
- `browser-save-storage-error.png` : erreur du stockage navigateur rencontrée pendant le contrôle.
- `browser-checks.json` : résultats des parcours réels.

Les zones vides et fonctions désactivées constituent les différences intentionnelles avec les données illustratives de la référence. La capture n'est pas celle d'un exécutable Tauri empaqueté.

## Vérification

- `npm ci` : réussi ; le gestionnaire signale 11 vulnérabilités déjà présentes dans les dépendances verrouillées (4 modérées, 7 élevées). Dépendances inchangées.
- `npm run build` : réussi après les changements fonctionnels ; avertissement existant de taille du fichier JavaScript principal.
- `npm test -- src/components/__tests__/MainMenu.test.ts src/app/__tests__/playableShell.test.ts src/app/__tests__/saveReliability.test.ts --maxWorkers=1` : 3 fichiers, 18 tests réussis.
- `npm test -- src/app/__tests__ src/components/__tests__ --maxWorkers=1` : 13 fichiers, 64 tests réussis.
- `npm run verify -- -- --maxWorkers=1` : audits de données et compilation réussis ; suite globale de simulation interrompue après plusieurs minutes sans résultat de test. La validation globale complète n'est donc pas revendiquée.
- Contrôles navigateur : paramètres, crédits, gestionnaire de chargement, création réelle de partie et choix du personnage fonctionnels ; aucun débordement horizontal à 1366 × 768 et 390 × 844 ; aucune erreur JavaScript non interceptée.
- La sauvegarde réelle de la partie mondiale dans ce navigateur échoue avec `QuotaExceededError` (limite de localStorage). L'erreur existante est visible et aucune entrée fantôme n'apparaît. Le chargement réel d'une nouvelle sauvegarde n'a donc pas pu être validé de bout en bout dans ce navigateur. Le routage des IDs, le tri et les services de sauvegarde sont couverts par les tests automatisés. Cette limite du stockage existant est laissée intacte conformément au périmètre demandé.
- Le moteur, les données mondiales, le code de sauvegarde, les migrations, le schéma, Tauri et les dépendances restent inchangés. Aucun benchmark de simulation nécessaire pour cette modification de présentation.

## Provenance du fond

Référence fournie par l'utilisateur : `wide_cinematic_ui_screenshot_of_a_game_main_menu.png`, conservée comme `reference.png`.
SHA-256 : `054A55E6BBB36A85AD82AD0920A77D263EA77F21B1DE01ED0620879F23C88925`.

Le fichier `public/menu/earth-background.png` est une retouche de cette référence réalisée avec l'outil intégré ImageGen, uniquement pour enlever l'interface incrustée. Il est un décor de menu, pas une donnée mondiale ni une carte utilisable par la simulation. Aucun droit ou licence supplémentaire n'est déduit de cette retouche.
SHA-256 : `56AD7A3DDD80B27AE7F70F35E35CDA3ED4665225BF0EBB8C4D10E789110CFD6B`.

Prompt final utilisé :

> Edit target: attached ProjectAtlas reference screenshot. Produce ONLY its clean background plate, same 1672:941 aspect ratio and identical composition. Remove ALL UI: logo at upper left, all text, left navigation, central saves/news panels and their photos, top right buttons, bottom footer and gold line. Inpaint the areas formerly covered with the continuous existing dark space and Earth. Preserve the EXACT globe position, scale, camera, Europe/Africa geography, blue atmosphere, golden city lights, sunrise at upper right, existing colors and lighting. No artistic reinterpretation, no new camera, no typography, no panels or UI of any kind. The goal is a separate background asset underneath real React UI; keep the right half as identical to the input as possible.

## Relecture

La relecture du diff confirme une modification locale de l'interface : aucune écriture depuis le menu vers l'état canonique, aucun changement de stockage, aucune donnée d'actualité fabriquée et aucune importation nouvelle dans le moteur. Les tests couvrent les actions actives/inactives, les erreurs, l'initialisation, l'ordre des parties, les IDs transmis et l'absence de mutation de la liste fournie.
