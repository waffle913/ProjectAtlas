# Captures réelles — Charger une partie

Ces images proviennent de l'application de production exécutée par GitHub Actions, Chromium/SwiftShader. Les campagnes sont des **fixtures synthétiques explicitement identifiées** ; elles ne font pas partie du catalogue réel. Le pont IPC est simulé dans le test, l'adaptateur de stockage natif, React, la validation des sauvegardes et le rendu Three.js sont ceux de l'application.

| Écran / situation | 1920 × 1080 | 1366 × 768 |
|---|---|---|
| Liste des sauvegardes | [Capture](list-1920x1080.png) | [Capture](list-1366x768.png) |
| Occupation du Maine (souveraineté américaine) | [Capture](occupied-1920x1080.png) | [Capture](occupied-1366x768.png) |
| Liste, échelle UI 150 % | [Capture](list-ui150-1920x1080.png) | [Page entière](list-ui150-1366x768.png) |
| Aperçu, échelle UI 150 % | [Capture](occupied-ui150-1920x1080.png) | [Page entière](occupied-ui150-1366x768.png) |

[Bas du panneau : actualités et évaluation militaire](campaign-context-1920x1080.png).

Autres états : [cession du Maine au Canada](ceded-1920x1080.png), [personnage sans accès gouvernemental](opposition-1920x1080.png), [repli sans WebGL](no-webgl-1366x768.png).

À 150 %, les fichiers présentent la page entière avec défilement ; le viewport reste celui indiqué. Le panneau droit défile séparément. Les contrôles et le chargement restent accessibles.

[Référence artistique fournie](../load-game-reference.png) : palette, globe nocturne, navigation et panneau droit repris. La liste appartient à un écran distinct et le bandeau Nouvelle partie est absent, conformément à la mission. Les textes et chiffres fictifs de la référence ne sont pas copiés. Le décor NASA reste historique ; les informations de campagne proviennent des sauvegardes. La géométrie du Maine est celle du registre régional, pas une zone dessinée pour la démonstration. Les limitations de visibilité militaire et de journal international restent explicites.

Provenance du run et résultats : [rapport de livraison](../load-game-globe.md).

## Audit final — nouvelles captures des actualités

Source des images de cette galerie : commit `8ebde066751f933fad4c6d3baa4b47d91ad8db46`, [run load-game-ui 41271227366](https://github.com/waffle913/ProjectAtlas/actions/runs/41271227366), artefact `13069009170`. Elles remplacent les captures antérieures aux correctifs territoriaux et au projecteur d'actualités. Toutes les nouvelles ci-dessous viennent des enregistrements des sauvegardes synthétiques validées sur runner.

| Viewport / échelle | Actualités nationales | Actualités internationales |
|---|---|---|
| 1920 × 1080 / 100 % | [Occupation et déclaration](occupied-news-1920x1080-national.png) | [Guerre étrangère enregistrée](occupied-news-1920x1080-international.png) |
| 1366 × 768 / 100 % | [Nationales](occupied-news-1366x768-national.png) | [Internationales](occupied-news-1366x768-international.png) |
| 1920 × 1080 / 150 % | [Nationales](occupied-news-ui150-1920x1080-national.png) | [Internationales](occupied-news-ui150-1920x1080-international.png) |
| 1366 × 768 / 150 % | [Nationales](occupied-news-ui150-1366x768-national.png) | [Internationales](occupied-news-ui150-1366x768-international.png) |

Après règlement de la guerre : [fin du conflit et transfert du Maine](ceded-news-1920x1080-national.png), [actualité internationale conservée](ceded-news-1920x1080-international.png).

Sans WebGL : [nationales](no-webgl-news-1366x768-national.png), [internationales](no-webgl-news-1366x768-international.png). Le panneau reste consultable et le chargement explicite reste disponible.

Le panneau défile : une capture centrée sur une rubrique peut montrer une partie de la rubrique voisine au bord du défilement. Les rubriques sont intégralement accessibles en faisant défiler le panneau, sans chevauchement du bouton de chargement. Les captures à 150 % présentent la page entière et conservent le viewport annoncé. Le second conflit Allemagne–France sert seulement de fixture internationale synthétique ; aucun événement géopolitique réel de 2031 n'est revendiqué.

Rapport consolidé : [audit final](../load-game-final-audit.md). La carte montre le statut régional global sauvegardé ; les restrictions du personnage s'appliquent aux renseignements détaillés, pas à l'affichage de la souveraineté/occupation/contestation.
