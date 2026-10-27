# S66 — La réception d'un arrivage de pièces

```
Statut     : terminée
Périmètre  : post-MVP
Dépend de  : S20, S21, S63
```

---

## Objectif

Un carton de quinze références arrive. Aujourd'hui le gérant ouvre le panneau
d'une pièce, saisit une entrée, ferme, rouvre la suivante — quinze allers-retours
pour un seul carton. Ce lot donne un écran de **réception** : on compose
l'arrivage en une liste, et tout entre en un seul geste.

---

## Critères d'acceptation

- [x] Depuis « Enregistrer · Réception », le gérant cherche des références, les
      ajoute à l'arrivage, fixe une quantité par ligne, et enregistre tout d'un
      coup — un mouvement `entree` par ligne, en un lot atomique.
- [x] Chaque ligne porte un **prix d'achat** pré-rempli du catalogue et
      modifiable ; modifié, il met à jour le coût de la référence (pour les
      ventes à venir, les passées gardant le leur). Laissé vide, le coût ne
      bouge pas.
- [x] Une **note** d'arrivage (bon de livraison, date) se porte sur chaque
      entrée du lot.
- [x] L'écran refuse une quantité nulle ou non numérique, et un prix non
      numérique, **en nommant la pièce** fautive.
- [x] L'écran exige une boutique (un stock entre sur une étagère précise) et
      `gerer_pieces`.
- [x] Le rendu regardé — réception vérifiée de bout en bout sur émulateurs
      (BOU-0231 : stock 0 → 10), en clair.

---

## Hors périmètre

- Le **fournisseur** : le commanditaire n'en veut pas (« non, pas de
  fournisseur »). Une entrée ne porte donc aucun tiers.
- Le **prix d'achat par lot stocké** (modèle Q9) : les règles bornent les clés
  du mouvement, et le commanditaire a placé le coût sur la pièce (`3cbf…` /
  `3c8b2fe`). La réception met donc à jour ce coût unique plutôt que d'empiler
  des prix par lot — ce qui demanderait un changement de règles et une décision
  de moyenne de coût que personne n'a demandée.
- Les **transferts** entre boutiques (S17) et l'**inventaire** (lot 6).

---

## Notes techniques

- Domaine pur `lib/domain/reception.ts` (+ 13 tests) : composer l'arrivage,
  valider, compter les unités. Aucun Firestore, aucune horloge.
- `enregistrerReception` dans `lib/repositories/pieces.ts` : un `writeBatch` —
  un `entree` par ligne, plus une mise à jour de `pieces/{id}.prixAchat` quand le
  prix a changé. Atomique, et hors ligne il voyage comme une écriture unique.
- **Aucun changement de règles Firestore** : la création d'`entree` et la mise à
  jour d'une pièce par le gérant de la boutique étaient déjà permises. Le prix
  ne pouvait **pas** aller sur le mouvement (`mouvementPieceValide` borne ses
  clés) — c'est ce qui a décidé qu'il va sur la pièce.
- Écran `app/(app)/pieces/reception/page.tsx` calqué sur l'écran de vente
  (recherche + liste composée, pas de `<form>` pour ne pas valider à Entrée).
  Champs d'une ligne extraits dans `components/ChampsReception.tsx`.
- Entrée « Réception » ajoutée au groupe « Enregistrer » du rail pièces, avec
  son icône (camion).
