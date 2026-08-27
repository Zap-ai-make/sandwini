# S7 — Numérotation hors-ligne des pièces comptables

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S3
```

---

## Objectif

Donner à chaque pièce comptable un numéro lisible, unique et attribué **sans réseau** :
`{CODE_BOUTIQUE}-{AAMM}-{NNNN}`, par exemple `PTG-2608-0042` (`prompt.md` §3.3, `DECISIONS.md` D5).

Un gérant doit pouvoir dicter ce numéro au téléphone et le retrouver dans un classeur. C'est ce qui
interdit un identifiant technique, et c'est ce qui oblige à un compteur — donc à accepter que deux
appareils isolés puissent tomber sur le même, et à le réparer ensuite.

---

## Critères d'acceptation

- [x] Un numéro se compose, se relit et se valide : `PTG-2608-0042`, suffixé `-B` quand il a été renuméroté
- [x] Chaque appareil attribue ses numéros seul, sans réseau, sans jamais rendre deux fois le même
- [x] Un appareil qui apprend du serveur reprend au-dessus du plus haut numéro connu de la boutique
- [x] Chaque boutique et chaque mois ont leur propre série
- [x] Deux pièces d'une même boutique portant le même numéro sont départagées à la synchronisation : la première arrivée garde, la seconde reçoit `-B`, la troisième `-C`
- [x] Une pièce dont le numéro est unique n'est jamais touchée
- [x] Deux boutiques qui en sont au même compteur ne se renumérotent pas l'une l'autre
- [x] Le prochain numéro de l'appareil est consultable réseau coupé

**Vérification :** 147 tests unitaires (domaine + règle de réconciliation), 117 tests de règles,
5 tests de déclencheur sur émulateur, 48 tests bout en bout — dont un qui coupe le réseau, recharge
l'écran et retrouve le même numéro. Rendu regardé en clair et en sombre, mobile et bureau
(`captures/diagnostic-*`).

Une fragilité connue subsiste dans la suite bout en bout, sans rapport avec cette spec et inscrite au
backlog (S27) : cf. `DECISIONS.md` D50.

---

## Hors périmètre

Pas de **pièce à numéroter** : les ventes arrivent en S8. Cette spec livre le mécanisme et son
compteur ; S8 le branche sur `ventesMotos` et affiche la mention « renumérotée » au gérant.

Pas de **numérotation continue certifiée** — un numéro peut manquer si une saisie est abandonnée.
C'est un identifiant de reçu, pas une séquence comptable légale (D5, lié à D11).

Pas de **fusion des séries** entre appareils : le compteur est local, et il le reste.

---

## Notes techniques

**Deux champs, pas un.** `numero` est ce qu'on imprime et ce que le serveur peut corriger ;
`numeroInitial` est ce que l'appareil a attribué et que personne ne réécrit. Le rapprochement se fait
sur le second, sans quoi une troisième pièce en retard ne retrouve pas celle qui porte déjà un `-B`
et réclame un suffixe déjà donné (D44).

**Qui garde son numéro :** le premier arrivé au serveur, l'identifiant du document départageant les
ex æquo (D45). Ce critère rend le verdict indépendant de l'ordre d'exécution des déclencheurs — deux
instances concurrentes concluent pareil sans se parler.

**Le compteur survit à la déconnexion**, contrairement au cache et au périmètre mémorisé. L'effacer
ferait repartir l'appareil de `0001` et fabriquerait les doublons qu'il existe pour éviter (D46).

**Deux moitiés étanches.** Le client relit les suffixes, le serveur les fabrique, et les deux ne
partagent pas une ligne de code : les mettre en commun demandait de sortir `functions/` de son
`rootDir`. Leur accord est tenu par un test d'aller-retour sur deux cents rangs (D47).

**Où c'est vérifié.** La règle qui tranche est pure et se teste en millisecondes ; le câblage du
déclencheur demande deux émulateurs et vit dans `declencheurs/` (D49).

---

Spec terminée : critères cochés, code vérifié (tests + rendu), revue des trois contrats passée,
commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
