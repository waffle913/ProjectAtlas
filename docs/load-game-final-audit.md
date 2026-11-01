# Audit final groupé — Charger une partie

Parent conservé : ce4cea59608fa7ef0100c64f3172051de439ef1c. Branche existante ui/load-game-globe, aucune réinitialisation depuis main. Mission de finalisation UI, pas de nouveau jalon moteur.

## Plan sans code

1. Relire le diff récent, les contrats opérations/information/multilatéral et BUGS_CONNUS. Confirmer les deux CI du parent et rechercher la PR existante.
2. Audit territorial : propriété/contrôle/occupation distincts, indépendant des rapports et du personnage conformément à la direction explicite de l'utilisateur ; maintien du filtrage pour les détails militaires. Examiner transferts, contesté étranger, correspondances régionales, couverture partielle, frontières internes, sauvegardes A/B/A et absence de mutation.
3. Audit actualités : préserver le projecteur existant ; corriger uniquement les anomalies démontrées de dates, formulation, tri, doublons et importance. Pas de nouvelle chronologie canonique ni d'événement reconstruit sans preuve enregistrée.
4. Compléter les régressions unitaires ciblées et la fixture navigateur : guerre étrangère via les commandes existantes et IDs canoniques, jamais donnée de production ; captures dédiées aux actualités nationales/internationales sur les deux viewports et à 150 %, plus sans WebGL.
5. IMPLEMENTATION puis REVIEW séparée du diff réel. Aucune migration/schema/économie/règle militaire/sauvegarde modifiés. Contrôler particulièrement informations secrètes, dates futures, inconnues, référence historique de cession, fin de guerre != traité.
6. Exécuter exclusivement GitHub Actions : tests ciblés, build, parcours Charger, régression Nouvelle partie et verify Linux/Windows. Lire les journaux, récupérer les nouvelles images du runner et les examiner. Aucun test/build/benchmark/application locale.
7. Rapport unique des anomalies/correctifs/limites, mise à jour documentaire et galerie, commit/push puis PR vers main sans fusion.

## Constats initiaux

- Verify parent 41268584176 : success ; load-game-ui 41268584225 annoncé vert, à recouper avec les jobs.
- Aucune PR ouverte de ui/load-game-globe trouvée au début.
- Contrôle territorial actuel global correctement indépendant des rapports : conserver ce correctif.
- Tri importance avant date : la liste affichée peut être non chronologique ; conserver la priorité pour sélectionner les événements puis trier les éléments retenus par date.
- Briefing de résultat et décision correspondante peuvent se répéter ; dédupliquer à partir de leurs références enregistrées déjà accessibles.
- Une restriction à effet différé est formulée comme une entrée en application enregistrée ; distinguer déclaration et applicabilité présente, sans annoncer l'événement futur comme accompli.
- Une composante manquante d'une région multi-feature peut être silencieusement acceptée ; vérifier les sourceFeatureIds déjà canoniques et signaler le repli.
- Texte de refus des renseignements militaires devenu contradictoire avec la carte mondiale : corriger le libellé, pas les droits.

Risques : couverture historique bornée, absence d'historique d'occupations achevées, contours généralisés, coût des grandes fixtures, chronologie intrajournalière limitée aux preuves enregistrées. Ces limites doivent rester explicites.
