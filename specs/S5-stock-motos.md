# S5 — Stock motos — entrée et consultation

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S4
```

---

## Objectif

Une moto arrive à la boutique : le gérant la saisit en quelques secondes, même sans réseau, et
retrouve ensuite instantanément n'importe quelle moto du stock par sa marque, son modèle ou son
numéro de châssis.

---

## Critères d'acceptation

- [ ] Formulaire d'entrée : état (neuve / occasion), marque, modèle, couleur, année, numéro de châssis, numéro de moteur, provenance, prix d'achat, frais d'entrée (type + montant + note, plusieurs lignes), papiers fournis
- [ ] Le numéro de châssis est obligatoire et unique dans la boutique ; un doublon est refusé avec un message qui nomme la moto déjà enregistrée
- [ ] La moto entre avec le statut `en_stock` et la boutique du périmètre courant
- [ ] Prix d'achat et frais d'entrée sont écrits dans `motos/{id}/prive/cout` avec le coût total pré-calculé ; le gérant les écrit sans pouvoir les relire (D2, D4)
- [ ] Le coût total vaut `prixAchat + Σ frais` — fonction pure testée dans `lib/domain`
- [ ] La saisie complète fonctionne hors ligne et la moto apparaît immédiatement dans le stock
- [ ] Liste du stock : filtres neuve/occasion, marque, modèle, statut ; recherche par châssis
- [ ] Fiche moto : toutes les caractéristiques, le statut, et pour le responsable seul le coût détaillé et le prix de vente conseillé
- [ ] Un gérant ne lit pas `motos/{id}/prive/cout`, même par requête directe (test de règles)
- [ ] États couverts : stock vide, aucun résultat de recherche, chargement, échec de validation, hors ligne

---

## Hors périmètre

Photos (D14, spec S19). Transferts entre boutiques (S17). Motos issues d'une reprise (S18) et motos de
confrère (S26) — le champ `origineEchangeId` existe mais reste vide. Inventaire (S23).

---

## Notes techniques

L'unicité du châssis ne peut pas être garantie par Firestore hors ligne. On la vérifie sur le cache
local avant validation — ce qui couvre le cas réel, la même personne saisissant deux fois la même
moto — et une Cloud Function signale les doublons détectés à la synchronisation, comme pour les
numéros de reçus (D5). Ne pas promettre une unicité que la base ne peut pas tenir.

L'écriture de `motos/{id}` et de sa sous-collection `prive/cout` se fait dans un même `writeBatch`,
donc atomiquement, y compris hors ligne.

Le formulaire est long : il doit rester utilisable au comptoir, sur téléphone, une main sur le guidon.
Champs regroupés, clavier numérique pour les montants, valeurs par défaut sensées, et surtout aucun
champ obligatoire qui ne le soit pas vraiment. Voir `DESIGN.md` avant de le dessiner.
