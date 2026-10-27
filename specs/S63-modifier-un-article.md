# S63 — Modifier et archiver un article

```
Statut     : terminée
Périmètre  : post-MVP
Dépend de  : S20, S21
```

---

## Objectif

Le gérant s'est trompé de prix, ou une référence ne se vend plus. Aujourd'hui
il ne peut rien y faire : le catalogue ne sait que **créer**. Pire, quand une
vente est refusée faute de prix, l'écran propose « Fixer le prix » et renvoie à
un panneau qui affiche « non fixé » sans aucun moyen de le fixer — un
cul-de-sac. Ce lot ouvre la modification d'une référence et son archivage, et
ferme ce cul-de-sac.

---

## Critères d'acceptation

- [x] Depuis le catalogue, le gérant ouvre une référence et **corrige** sa
      désignation, sa catégorie, ses deux prix et son seuil. L'enregistrement
      se voit, et la pièce vendable aussitôt le prix posé.
- [x] La **référence elle-même** (le code) se modifie, et le contrôle d'unicité
      s'exclut lui-même : rééditer sans rien changer ne se bloque pas comme un
      doublon.
- [x] Une référence s'**archive** (`actif: false`) et se **réactive**. Elle
      n'est jamais supprimée : des mouvements la citent, et la quantité d'hier
      se relit.
- [x] Les archivées **se retrouvent** : un filtre les montre, sinon une pièce
      désactivée est perdue.
- [x] Le refus de vente « Fixer le prix » (D90) **mène à un écran qui fixe le
      prix**, et non à un panneau qui ne fait que l'afficher.
- [x] Seul qui porte `gerer_pieces` voit et atteint la modification — gérant de
      la boutique **et** responsable (les deux la portent). Le cloisonnement
      réel reste dans les règles Firestore.
- [x] Les états sont couverts (chargement, pièce introuvable, erreur de saisie)
      — cf. `DESIGN.md` §10.

---

## Hors périmètre

- La **réception en plusieurs lignes** et le prix d'achat posé sur le lot : lot
  suivant.
- L'**historique des ventes** et le reçu : lot dédié (fin de S21).
- Les **retours / échanges** (opération sensible, lot 5) et le **crédit par
  nom** (lot crédit).
- La **suppression** d'une référence : elle n'existe pas, et n'existera pas.

---

## Notes techniques

- `modifierPiece` et `changerActivationPiece` existent déjà dans
  `lib/repositories/pieces.ts` et ne sont appelées de nulle part : ce lot leur
  donne leur écran. `referenceDejaPrise(reference, pieces, sauf?)` porte déjà le
  paramètre d'auto-exclusion.
- Nouvel écran `app/(app)/pieces/[id]/modifier/page.tsx`, qui **reprend le
  formulaire de `/pieces/nouvelle`** plutôt que de le dupliquer. Pré-rempli par
  un `saisieDepuisPiece(piece)` pur, testé.
- Le filtre des archivées s'ajoute à `FiltresPieces` (`archivees: boolean`) et à
  `filtrerPieces`, qui filtre déjà `actif` en dur.
- Correction de passage : le bouton « Nouvelle référence » du catalogue était
  gardé par `gerer_referentiels`, que le gérant n'a pas — invisible au seul rôle
  qui tient ce catalogue. Il passe sous `gerer_pieces`, comme le lien du rail et
  la garde de route.
- L'archivage/réactivation est une écriture réversible et tracée ; elle ne
  relève pas de la règle 6 (pas de suppression, pas de migration).
