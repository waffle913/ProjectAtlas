# Nouvelle partie avec globe 3D — plan avant implémentation

## Périmètre et base

Mission utilisateur du 31 octobre 2026. Nouvelle branche `ui/new-game-globe` issue de `origin/main`, commit `8fcf8cc8eea830bbb3a443c76915afc00754e257`. Intégrer le menu validé de `ui/main-menu-reference` (`a1d80f789a1f077dacd842f87ca3b6d3a61735f6`) sans perdre les protections politiques de main. Aucune intégration dans main autorisée.

Le fichier de mission mentionne deux maquettes Nouvelle partie, mais la seule pièce jointe reçue est le texte de mission. La référence historique du menu principal ne remplace pas ces deux maquettes. Les références nécessaires au dessin de l'écran sont demandées à l'utilisateur ; aucune disposition Nouvelle partie ne doit être présentée comme fidèle à des images non reçues.

## Contrats et étapes prévues

1. Intégrer le menu sur la nouvelle branche et relire explicitement les modifications de `App.tsx`, `StartGame.tsx` et des tests de démarrage. Préserver les API de sélection et la vérification `assertAuthorizedStartingPerson` introduites par main.
2. Définir un parcours de présentation indépendant à quatre étapes : pays, rôle, configuration, récapitulatif. Réutiliser `countryStartingOptions`, `selectableStartingCountryIds`, `national_leader` et `opposition_party_leader`. Tous les pays restent inspectables, sans fabriquer de voie jouable ni contourner les restrictions semi-présidentielles. Pas de nouvelle règle politique ou économique.
3. Préparer des options à partir des données canoniques sans installer de monde dans l'horloge active. Conserver une seule partie active ; à la confirmation seulement, initialiser un état neuf avec `initializeNewGame`, vérifier le personnage et la voie avec les API canoniques, puis appeler `setControlledPerson`. Annuler la préparation sans remplacer l'état actif ni toucher aux sauvegardes.
4. Globe : réutiliser les géométries et l'identité permanente du catalogue existant. Prévoir rotation, zoom, sélection par territoire, survol, recherche, recentrage, frontières, composantes éloignées, petits pays, trous et antiméridien. Évaluer un moteur de rendu WebGL maintenu plutôt qu'un second catalogue ou service externe. Justifier la dépendance choisie avant ajout ; garder toutes les ressources hors ligne et documenter licences/provenance. Le mode de repli doit fournir une vraie sélection clavier/liste, clairement distinguée du globe interactif.
5. Informations pays : uniquement les champs réellement disponibles et leur provenance ; absence explicite pour les données manquantes. Configuration limitée aux paramètres réellement pris en charge, scénario fixé au 1er janvier 2026. Aucun événement, dirigeant, pouvoir, niveau de difficulté ou scénario inventé.

## État, migrations et risques

Pas de changement de schéma, migration, données mondiales, référentiel d'identité, sauvegarde, scheduler ou règle de simulation. Les seuls états nouveaux sont des états transitoires de présentation et des ressources graphiques libérées à la fermeture. Principaux risques : perte des protections politiques lors de l'intégration ; initialisation prématurée de la partie active ; sélection périmée après changement de pays/voie ; raycasting ou triangulation incorrects à l'antiméridien ; mémoire GPU non libérée ; source/licence ou réseau d'exécution non maîtrisés ; interface inventée faute de maquettes.

## Validation autorisée

**GitHub Actions uniquement : aucun test, compilation ou benchmark local.** Ajouter des tests de pays/voies autorisés et indisponibles, transitions/retours, réévaluation du choix, confirmation, annulation sans mutation de la partie active, géométrie et sélection/recherche synchronisées, repli WebGL et libération des ressources. Produire des captures réelles dans les runners à 1920 × 1080 et 1366 × 768, sans injecter de personnages ou données mondiales fictives. Les résultats exécutables, captures et limites doivent être distingués des seules lectures de code locales.

Relecture séparée du diff et comparaison des fichiers du moteur et des données avec main avant livraison. Livrer branche, SHA, fichiers, choix techniques, résultats Actions, captures et limites. Aucune fusion dans main avant validation explicite.
