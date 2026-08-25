# S12 — Règles Firestore — durcissement et tests

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S1 → S11
```

---

## Objectif

Ce que l'interface interdit, la base de données l'interdit aussi. Un gérant qui ouvrirait la console
de son navigateur ne peut pas lire les coûts d'achat, les données d'une autre boutique, ni un token de
prestataire. Et ce n'est pas une intention : c'est prouvé par des tests qui échouent si la protection
saute.

---

## Critères d'acceptation

- [ ] Refus par défaut sur toutes les collections ; chaque accès est ouvert explicitement (`SECURITY.md` §1)
- [ ] Un utilisateur non authentifié n'a **aucun** accès direct à Firestore, en lecture comme en écriture
- [ ] Un gérant ne lit et n'écrit que les documents dont le `boutiqueId` égale celui de son jeton (D7)
- [ ] Un gérant ne lit aucune sous-collection `prive/` : ni `motos/{id}/prive/cout`, ni `ventesMotos/{id}/prive/marge`, ni `prestataires/{id}/prive/token` (D2, D6)
- [ ] Un gérant peut **écrire** `motos/{id}/prive/cout` à la création sans pouvoir le relire (D4)
- [ ] Les référentiels sont en lecture pour tous les authentifiés, en écriture pour le seul responsable
- [ ] Personne ne modifie son propre `role` ni son `boutiqueId` ; aucune élévation de privilège par un champ soumis (`SECURITY.md` §4)
- [ ] `createdBy` et `updatedBy` sont validés contre `request.auth.uid` à l'écriture
- [ ] Les montants sont validés dans les règles : entiers, positifs, et un versement ne peut pas rendre le reste dû négatif
- [ ] Un gérant ne modifie ni ne supprime un versement ; le responsable le peut
- [ ] Les documents ne se suppriment pas — la désactivation est la seule sortie (référentiels, utilisateurs, clients)
- [ ] Storage : le logo n'est modifiable que par le responsable ; type réel et taille maximale vérifiés
- [ ] **Une suite de tests `@firebase/rules-unit-testing` couvre chaque point ci-dessus**, en cas passant et en cas refusé, et tourne dans `npm test`
- [ ] La checklist `SECURITY.md` §13 est passée point par point et son résultat consigné

---

## Hors périmètre

Les règles des collections post-MVP (pièces, inventaires, échanges, CMC) : chaque spec apportera les
siennes et ses tests. Le scan dynamique et le pentest (`SECURITY.md` §12), qui supposent un
déploiement sur un staging isolé.

---

## Notes techniques

Cette spec n'écrit pas les règles pour la première fois : chaque spec de S2 à S11 livre les siennes
avec ses tests, parce qu'une règle écrite six semaines après le code qu'elle protège est une règle
écrite trop tard. S12 est la passe de durcissement — relecture d'ensemble, cas croisés, trous entre
deux specs, et la suite de tests consolidée.

Les cas croisés sont ceux qu'aucune spec isolée ne voit : un gérant qui lit une vente de sa boutique
portant sur une moto transférée depuis une autre, un responsable désactivé dont le jeton n'a pas
encore expiré, un document `prive/` créé sans son parent.

Le point le plus délicat est D4 : écriture autorisée, lecture refusée sur la même sous-collection.
Firestore le permet, mais la formulation se teste dans les deux sens, sinon on croit avoir cloisonné
alors qu'on a seulement compliqué.

Vérifier aussi que les règles ne cassent pas le mode hors ligne. Le cache local ne les évalue pas :
une écriture illégale est acceptée localement puis rejetée à la synchronisation. L'interface doit
détecter ce rejet et le montrer, plutôt que de laisser un gérant croire qu'une saisie est passée.
