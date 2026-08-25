# S6 — Clients — recherche et création

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S3
```

---

## Objectif

Au moment de vendre, le gérant retrouve un client existant en tapant les premiers chiffres de son
numéro ou les premières lettres de son nom — et s'il est nouveau, le crée sans quitter l'écran.

---

## Critères d'acceptation

- [ ] Recherche par numéro de téléphone et par nom (préfixe, insensible à la casse et aux accents)
- [ ] La recherche fonctionne hors ligne sur les clients déjà en cache
- [ ] Création rapide : nom et téléphone suffisent ; téléphone secondaire, adresse et note facultatifs
- [ ] Le téléphone est normalisé au format international à l'enregistrement, quel que soit le format saisi — c'est la clé de recherche et le lien WhatsApp en dépendra (S14)
- [ ] Un numéro déjà connu déclenche un avertissement qui propose le client existant, sans bloquer (deux personnes peuvent partager un téléphone)
- [ ] Fiche client : coordonnées et liste de ses ventes (alimentée par S8)
- [ ] Modification des coordonnées ; pas de suppression
- [ ] Les clients sont communs à toutes les boutiques : une fiche unique par personne, retrouvable partout (D16)
- [ ] Un gérant lit et crée des clients, mais ne voit d'aucune façon les ventes, montants ou dossiers rattachés à une autre boutique (test de règles)
- [ ] États couverts : aucun client, aucun résultat, chargement, hors ligne

---

## Hors périmètre

Pas de fusion de doublons. Pas d'historique de modifications au-delà de l'audit standard. Pas d'import
(aucune donnée existante à reprendre — arbitré au point d'arrêt 1).

---

## Notes techniques

`clients` n'a pas de `boutiqueId` : exception assumée au §3.2 du cahier des charges, qui parle de
« donnée opérationnelle ». Un client est une personne, pas une opération (D16). C'est la seule
collection lisible au-delà du périmètre du gérant — les règles de S12 doivent vérifier que rien de ce
qui s'y rattache ne le devient pour autant.

La recherche par préfixe se fait sur `nomNormalise` (minuscules, accents retirés) avec une requête de
plage Firestore. Le champ est calculé à l'écriture par une fonction pure testée — la normalisation est
exactement le genre de calcul qui diverge silencieusement s'il est écrit à deux endroits.

La normalisation du téléphone dépend du pays. Ne pas embarquer une bibliothèque complète pour ça au
MVP : une fonction ciblée sur l'indicatif local, testée sur les formats réellement saisis en boutique,
suffit et se remplace si le besoin s'élargit (`ARCHITECTURE.md` §1).
