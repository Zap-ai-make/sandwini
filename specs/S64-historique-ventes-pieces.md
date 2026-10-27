# S64 — Historique des ventes de pièces et reçu

```
Statut     : terminée
Périmètre  : post-MVP
Dépend de  : S20, S21
```

---

## Objectif

Le gérant a vendu une bougie ce matin ; un client revient cet après-midi
réclamer son reçu, ou le responsable veut savoir ce qui s'est vendu cette
semaine. Aujourd'hui une vente de pièces part en base et **disparaît de la
vue** : on ne la relit que par le journal de caisse. Ce lot donne à l'espace
pièces sa liste de ventes, le détail d'une vente, et son reçu imprimable —
c'est la moitié qui manquait pour fermer S21.

---

## Critères d'acceptation

- [x] L'onglet **Ventes** liste les ventes de pièces de la boutique, la plus
      récente en haut, avec numéro, date, client (ou « comptoir »), un résumé
      des articles, et le total.
- [x] On **cherche** une vente par numéro, nom de client ou désignation d'une
      pièce ; on **filtre par période**. Tout en mémoire, donc hors ligne.
- [x] Un clic ouvre le **reçu** dans un panneau : la facture du commanditaire,
      étendue à plusieurs lignes (Qté / Désignation / Prix unitaire / Montant),
      total, somme en lettres, **ACQUITTÉ** (une vente de pièces est payée
      comptant).
- [x] Le reçu s'**imprime** (et se partage en texte), hors ligne, et tient en
      thème sombre système comme celui des motos (D77).
- [x] Après une vente, l'écran de vente propose **« Voir le reçu »** — le bouton
      qui menait nulle part existe enfin (fin de S21).
- [x] Les états sont couverts (vide, chargement, erreur, sans boutique) —
      cf. `DESIGN.md` §10.

---

## Hors périmètre

- Le **test bout en bout** « vente réseau coupé » (l'autre critère ouvert de
  S21) : c'est un chantier e2e à part, et la règle « pas de marathon de tests »
  l'écarte de ce lot.
- Le **remboursement / échange** (lot 5, opération sensible) et la
  **réimpression d'un reçu de versement** (les pièces n'ont pas de versements).
- La refonte complète de la **navigation** de l'espace (lot 3) : ce lot ajoute
  seulement l'entrée « Ventes » sous « Suivre ».

---

## Notes techniques

- `ecouterVentesPieces` existe déjà et charge les ventes du périmètre. Le
  panneau reçoit la vente **déjà en mémoire** depuis la liste — pas de seconde
  lecture d'un document unique.
- Le reçu est un **composant propre, `RecuPiece`**, et non une extension de
  `Recu` (moto) : il réutilise les classes `facture-*`, `IDENTITE`,
  `Monogramme`, `montantEnLettres`, `numeroLisible` — tout ce qui n'est pas
  propre aux motos — sans toucher au reçu des motos, que l'autre fenêtre tient.
- L'impression s'appuie sur le marqueur `a-imprimer` (globals.css) et
  `window.print()`, comme `PanneauRecu` — aucune bibliothèque PDF (D60).
- `VentePiece` gagne `operateur` (lu de `createdByName`) pour le pied
  « Établi par » ; champ optionnel, lu par le mapper.
- Nouveaux helpers purs dans `vente-piece.ts`, testés : tri par date,
  prédicat de recherche, résumé des désignations, texte de partage.
