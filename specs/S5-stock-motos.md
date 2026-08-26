# S5 — Stock motos : entrée et consultation

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S4
```

---

## Objectif

Une moto arrive au comptoir : le gérant la fait entrer en stock en une saisie, réseau ou pas. Il la
retrouve ensuite par son numéro de châssis, sa marque ou son état. Le responsable voit le stock de
toutes ses boutiques, et lui seul voit ce que chaque moto a coûté.

---

## Critères d'acceptation

- [x] Le gérant fait entrer une moto : état, marque, modèle, châssis, provenance, prix d'achat, frais d'entrée
- [x] La saisie fonctionne **entièrement hors ligne**, coût compris
- [x] Le coût total s'affiche pendant la saisie : prix d'achat + somme des frais
- [x] Un numéro de châssis déjà présent dans le stock est refusé, avec la moto concernée nommée
- [x] Pour une moto d'occasion, la liste des papiers fournis est saisissable
- [x] La liste du stock filtre par état, par marque et par modèle, et cherche par châssis
- [x] La liste, la recherche **et la fiche d'une moto** fonctionnent hors ligne (D39, D40)
- [x] Le gérant ne voit que le stock de sa boutique ; le responsable voit celui du périmètre choisi
- [x] **Le gérant ne peut jamais relire un prix d'achat, un frais ou un coût total** — vérifié par les règles, pas seulement par l'interface (D2)
- [x] Le responsable ouvre une moto et voit son coût détaillé
- [x] États couverts : stock vide, chargement, aucun résultat de recherche, aucune boutique choisie, référentiels manquants, coût masqué, permission refusée

**Vérification :** 92 tests unitaires, 104 tests de règles, 39 tests bout en bout — dont un qui
saisit une moto réseau coupé et ouvre sa fiche dans la foulée. Rendu regardé en clair et en sombre,
mobile et bureau (`captures/`).

---

## Hors périmètre

Pas de **transfert entre boutiques** (S17), pas de **photos** (S19, cf. D14), pas de **vente** (S8),
pas d'**échange ni reprise** (S18), pas de **moto de confrère** (S26).

Pas de **filtre par statut** : toutes les motos sont `en_stock` tant que la vente n'existe pas, et un
filtre qui ne filtre rien est pire qu'un filtre absent — même raison qu'en D37. Il arrive avec S8.

Pas d'écran de correction d'une moto : les règles l'autorisent (S8 en a besoin pour changer le
statut), l'interface ne l'expose pas encore.

Pas de suppression : une moto ne s'efface jamais.

---

## Notes techniques

**Le coût vit dans une sous-collection privée** (D2) : `motos/{id}/prive/cout` porte `prixAchat`,
`fraisEntree[]` et `coutTotal`. Firestore ne sait pas masquer un champ ; c'est la seule façon de
tenir le §8 (« marge réservée au responsable ») tout en laissant le gérant lire la moto. Le
formulaire écrit les deux documents dans le même lot.

Conséquence de ce lot : les règles évaluent chaque document contre l'état **d'avant**, donc la moto
parente n'existe pas encore quand son coût est validé. Le `boutiqueId` est répété dans le document
de coût et vérifié contre le claim ; le parent est vérifié en plus dès qu'il existe.

**Le gérant écrit ce coût sans jamais pouvoir le relire** (D4). C'est le seul choix compatible avec
le hors-ligne : une moto qui arrive doit pouvoir être saisie sans attendre le responsable. L'écran le
dit avant la saisie, et le dit encore sur la fiche.

**La date d'entrée vient de l'appareil, l'horodatage d'audit du serveur** (D38).

**La fiche est un panneau de `/motos`, pas une route à part** (D39) — une route dynamique n'est pas
récupérable hors ligne. Et tous les écrans sont désormais mis en cache à l'installation, plus
seulement à la première visite (D40).

**Filtres et recherche se font en mémoire.** Le stock d'une boutique se compte en dizaines : le
charger entier et filtrer côté client donne une recherche instantanée qui marche hors ligne, là où
une requête indexée ne marcherait qu'en ligne. C'est aussi ce qui évite un index composite.

**L'unicité du châssis est vérifiée dans le périmètre visible**, pas globalement : un gérant ne lit
que sa boutique, il ne peut donc pas savoir si la moto est déjà entrée ailleurs. Une moto étant
physiquement dans un seul endroit, le cas est théorique ; il se réglera avec les transferts (S17).

---

Spec terminée : critères cochés, code vérifié (tests + rendu), revue des trois contrats passée,
commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
