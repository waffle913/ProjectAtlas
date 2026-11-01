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
