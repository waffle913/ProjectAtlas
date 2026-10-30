# Corrections après audit — plan avant modification

Périmètre autorisé : branche `ui/main-menu-reference`, couche application et composants seulement.

1. Supprimer les commandes de messages/notifications du menu.
2. Conserver dans App une sélection de sauvegarde et une projection de lecture seule. Le clic sélectionne ; un bouton distinct appelle le chargement existant. Aucun chargement, migration, écriture ou remplacement de la partie active lors d'une sélection.
3. Projeter uniquement les briefings sauvegardés accessibles au personnage contrôlé via la règle d'accès existante et ses propres propositions datées. Ne pas lire les variables de réalité, diagnostics de crise ou analyses confidentielles. Les données manquantes restent explicitement indisponibles ; pas de reconstruction historique.
4. Mémoriser l'origine menu/jeu des écrans auxiliaires ; ne pas déduire le retour de la présence d'une partie en mémoire.
5. Tests : absence du panneau avant sélection, sélection sans chargement, changement de sélection, action explicite, données absentes/corrompues, filtrage pays/personnage/confidentialité/dates, retours menu et jeu avec partie active. Captures réelles à 1920×1080 et 1366×768, à échelle normale et augmentée.

Contrats : information-0.15 (réalité/information/perception), sauvegardes existantes inchangées, pause de l'horloge existante. Aucune migration, nouveau champ canonique ou modification de donnée mondiale. Risques : fuite d'information brute, données anciennes présentées comme actuelles, sélection obsolète après suppression, débordement à UI 150 %. Relecture séparée du diff et vérification des chemins protégés avant livraison. Pas de fusion avant validation de l'utilisateur.

## Résultat de la correction

Les six corrections sont implémentées. La branche existante est conservée et aucune fusion n'est effectuée.

### Lecture du résumé

`src/app/campaignSummary.ts` lit uniquement le JSON du slot sélectionné et retourne une petite projection de présentation. Le JSON n'est ni restauré ni migré et n'est jamais installé dans l'horloge. Aucun nouvel état de simulation ou système de sauvegarde n'est créé. Les sauvegardes corrompues produisent un message d'indisponibilité ; seul le bouton de chargement appelle la restauration et ses invariants existants.

| Partie du résumé | Données réellement utilisées | Limites explicites |
| --- | --- | --- |
| Événements récents | `information.briefings` du pays du personnage sauvegardé, dates non futures et statut de preuve conservé | Briefings publics, ou gouvernementaux si la fonction existante `hasGovernmentInformationAccess` l'autorise. Quatre entrées maximum, avec date et qualité de preuve. Pas de lecture des variables de réalité, des diagnostics de crise ou des analyses des propositions. |
| Décisions précédentes | Propositions propres au personnage contrôlé, même pays, types implémentés, statuts `enacted`, `rejected`, `withdrawn` | Un statut enregistré n'est pas un journal exhaustif de décisions et ne prouve ni motivation ni causalité. La date de résolution absente reste « Date non enregistrée ». Aucun vote, conséquence ou ordre passé n'est reconstitué. |
| Situations en cours | Propositions propres au personnage au statut `submitted` | Ce sont les propositions encore en attente dans le snapshot. L'historique retenu ne permet pas d'établir un panorama complet des crises, opérations ou autres situations. Une ancienne activation de crise n'est jamais convertie en crise toujours active. |

Données manquantes : il n'existe pas de journal général exhaustif des commandes du joueur ; les briefings ont une rétention bornée et peuvent être absents des anciennes sauvegardes ; les résolutions n'ont pas toutes une date conservée ; le flux accessible ne fournit pas un cycle complet de toutes les situations en cours. Les trois catégories restent vides avec une explication quand leurs enregistrements sont absents. Aucun texte d'événement, décision, statistique ou actualité n'est créé pour remplir le panneau.

La sélection ne charge pas la partie, ne déclenche aucune écriture et conserve la partie active en mémoire. « Charger cette partie » est l'action explicite visant la sélection. « Continuer » conserve sa fonction distincte de chargement du slot le plus récent, dont le pays/date sont affichés. Le retour des écrans auxiliaires utilise l'origine réelle `menu` ou `game`, et non la présence d'un personnage en mémoire. Une suppression du slot sélectionné masque le résumé ; le chargement réussi et la création de partie effacent la sélection précédente.

### Validation et captures

- `npm test -- src/app/__tests__ src/components/__tests__ --maxWorkers=1` : **14 fichiers, 81 tests réussis**. Couverture : sélection sans chargement, chargement explicite de l'ID sélectionné, sélection supprimée, initialisation, erreurs, panneau absent avant sélection, données sauvegardées filtrées, confidentialité, perte de fonction, accès ministériel, pays/personnage, dates futures/invalides, rétention et échelle UI.
- `npm run build` : réussi. Avertissement existant sur la taille du bundle.
- `docs/menu-reference/audit/browser-audit.mjs` : dix contrôles de parcours réels réussis, aucune erreur JavaScript non interceptée. Les retours Paramètres/Crédits/Charger sont vérifiés sans partie active puis depuis le menu avec une vraie partie active en mémoire ; Paramètres/Charger ouverts depuis la pause reviennent au jeu. Sélection, absence d'écriture, chargement explicite et suppression du slot sélectionné sont vérifiés dans l'application complète.
- Rendu vérifié à **1920 × 1080** et **1366 × 768**, à **100 % et 150 %**, avec contrôle automatique du débordement horizontal, des contrôles tronqués, du chevauchement des lignes de sauvegarde et du pied de page. À 150 % sur 1366 × 768, le menu autorise un défilement vertical ; une capture du viewport exact et une capture de la page entière sont fournies. Les lignes de sauvegarde disposent d'une hauteur minimale et d'un défilement propre pour garder les métadonnées lisibles.
- Le code du moteur, les données mondiales, les adaptateurs de stockage, les migrations, Tauri et les dépendances sont inchangés. La suite globale d'endurance de simulation n'a pas été relancée pour cette correction d'interface ; les résultats ci-dessus ne prétendent pas la remplacer.

Captures actuelles dans [audit/](audit/) : `empty-1920x1080.png`, `empty-1366x768.png`, `selected-1920x1080.png`, `selected-1366x768.png`, `selected-ui150-1920x1080.png` et `selected-ui150-1366x768.png`. Les variantes `-viewport.png` gardent les dimensions exactes de la fenêtre. [Galerie de contrôle](audit/index.html). [Résultats structurés](audit/browser-results.json).

**Origine des parties photographiées :** les deux slots des captures sont de vraies sauvegardes sérialisées à travers « Save As », après démarrage d'une vraie campagne dans l'application. Ils ne sont pas des fixtures ou des métadonnées injectées. Cette campagne initiale n'a pas encore d'événements/propositions accessibles : les états vides sont donc le résultat réel. Le navigateur de contrôle est isolé ; pour éviter son quota localStorage déjà constaté, le script installe la couture `setSaveBackend` existante avec un backend mémoire de test. Aucune modification du DOM ou de l'état canonique, aucun événement inventé, aucune sauvegarde utilisateur préexistante modifiée. Le backend de production reste identique. Les captures ne prétendent pas être celles d'un exécutable Tauri empaqueté.

Reproduction du contrôle navigateur : installer Playwright séparément, lancer Vite, puis exécuter `node docs/menu-reference/audit/browser-audit.mjs`. Variables optionnelles : `PROJECTATLAS_URL` (défaut `http://127.0.0.1:5174`), `PROJECTATLAS_CHROME` (exécutable Chrome), `PROJECTATLAS_PLAYWRIGHT_MODULE` (URL du module Playwright si installé hors du dépôt). Le script utilise uniquement une session de navigateur isolée et génère les captures et son rapport JSON dans son propre répertoire.

### Relecture finale

Diff relu séparément après les tests : aucune importation du projecteur par le moteur, aucun nouvel enregistrement canonique, aucune lecture du monde réel brut pour alimenter le résumé, aucun accès confidentiel déduit de la seule appartenance à un parti. La navigation conserve la pause existante. Les captures ont permis d'identifier puis de corriger le chevauchement des métadonnées à 150 % ; ce défaut fait désormais l'objet d'une assertion navigateur. Intégration dans `main` en attente de validation utilisateur.

## Correctif visuel final — suppression du raccourci Paramètres

Le bouton Paramètres supérieur droit et le conteneur `atlas-utilities` ont été supprimés, ainsi que leurs règles CSS normales et mobiles. Le bouton de la navigation gauche et son gestionnaire restent inchangés. Aucun remplacement, changement de cadrage du globe, animation ou changement de disposition n'a été ajouté.

Validation : `npm test -- src/components/__tests__/MainMenu.test.ts src/app/__tests__/campaignSummary.test.ts src/app/__tests__/playableShell.test.ts --maxWorkers=1` : 3 fichiers, 83 tests réussis. `npm run build` : réussi. Le test du menu vérifie qu'il n'existe qu'un bouton Paramètres, dans la navigation gauche. Le contrôle navigateur réel confirme son ouverture des paramètres et le retour au menu, sans erreur JavaScript. Le diff des chemins moteur, données, stockage et logique de résumé reste vide.

Nouvelle capture réelle Chrome, viewport exact 1920 × 1080, session isolée sans sauvegarde injectée : [final-menu-1920x1080.png](final-menu-1920x1080.png). Les captures antérieures restent des archives des étapes précédentes. Aucune fusion dans `main` ; validation finale utilisateur attendue.
