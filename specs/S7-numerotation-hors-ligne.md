# S7 — Numérotation hors-ligne des pièces comptables

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S3
```

---

## Objectif

Chaque reçu remis à un client porte un numéro lisible et retrouvable, attribué instantanément même
sans réseau — et si deux appareils tombent sur le même numéro, le magasin est prévenu plutôt que de
découvrir le problème six mois plus tard.

---

## Critères d'acceptation

- [ ] Format `{CODE_BOUTIQUE}-{AAMM}-{NNNN}`, ex. `PTG-2608-0042` (D5)
- [ ] Un numéro est attribué sans réseau, sans latence perceptible
- [ ] Le compteur repart à 1 au changement de mois, par boutique
- [ ] Le compteur local s'amorce au plus haut numéro connu pour la boutique et le mois, lu depuis le cache Firestore
- [ ] Une Cloud Function détecte les doublons `boutiqueId` + `numero` à la synchronisation, suffixe le document créé en second (`-B`, `-C`…) et le marque comme renuméroté
- [ ] L'utilisateur est averti visiblement quand l'un de ses reçus a été renuméroté, avec l'ancien et le nouveau numéro
- [ ] La logique d'attribution et de suffixage est une fonction pure testée : changement de mois, remise à zéro, plus de neuf doublons, compteur au-delà de 9999
- [ ] Un numéro déjà attribué n'est jamais réattribué sur le même appareil, même après rechargement

---

## Hors périmètre

Pas de séquence comptable certifiée sans trou (D5). Pas de réservation de plages de numéros par
appareil. Pas de renumérotation manuelle par l'utilisateur.

---

## Notes techniques

Cette spec ne produit aucun écran : c'est un module de `lib/domain` plus une Cloud Function, consommé
par S8, S9, S10 et plus tard S21. Elle est isolée parce qu'elle est courte, critique, et entièrement
testable sans interface — exactement ce qu'on veut couvrir par des tests unitaires.

Le compteur vit en stockage local, clé `{boutiqueId}:{AAMM}`. Il doit résister à deux onglets ouverts
sur le même appareil : incrémenter puis relire n'est pas atomique entre onglets. Le plus simple qui
marche est un verrou via l'API Web Locks, disponible partout où l'application est supportée.

Le suffixe `-B` s'applique au document dont `createdAt` est le plus tardif ; à égalité stricte,
l'identifiant Firestore tranche, pour que la Cloud Function soit déterministe et rejouable.

Ne pas tenter de rendre les numéros globalement uniques par un identifiant d'appareil dans le numéro :
le cahier des charges impose un format lisible, et la lisibilité est la fonction du numéro.
