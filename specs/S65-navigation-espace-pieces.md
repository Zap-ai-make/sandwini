# S65 — La navigation de l'espace pièces

```
Statut     : terminée
Périmètre  : post-MVP
Dépend de  : S20, S21, S63, S64
```

---

## Objectif

À mesure que l'espace pièces a gagné des écrans — vendre, consulter l'historique,
tenir le catalogue, créer une référence — ils se sont empilés sous un seul titre
« Suivre ». La colonne ne disait plus lequel on venait faire. Ce lot range
l'espace comme celui des motos : **Vendre**, puis **Suivre**, puis
**Enregistrer** — chaque geste sous son intention.

---

## Critères d'acceptation

- [x] La colonne de l'espace pièces porte trois groupes : **Vendre** (Vendre une
      pièce), **Suivre** (Catalogue, Ventes), **Enregistrer** (Nouvelle
      référence), chacun avec son icône.
- [x] Le groupe **Vendre** disparaît sur « Toutes les boutiques » (vendre exige
      une boutique), exactement comme celui des motos.
- [x] Le groupe **Enregistrer** disparaît pour qui n'a pas `gerer_pieces` — un
      titre sans écran dessous est un rangement qui ment.
- [x] Les titres de groupes sont verrouillés par un test, comme ceux des motos.

---

## Hors périmètre

- Les écrans **Mouvements** (journal des entrées/sorties) et **Réception**
  (arrivage multi-lignes) : annoncés par la feuille de route mais pas encore
  bâtis. Les câbler maintenant créerait des liens morts. Ils rejoindront
  « Suivre » et « Enregistrer » à leur lot.
- Tout renommage des **libellés** d'écrans existants (« Catalogue » reste
  « Catalogue ») : ce lot range, il ne rebaptise pas.

---

## Notes techniques

- Réorganisation du bloc `pieces` de `GROUPES_DE` dans `lib/domain/espaces.ts`,
  plus deux icônes (`/pieces/vendre`, `/pieces/nouvelle`) dans `icones-ecrans.ts`.
  `groupesVisibles` retire déjà les groupes vidés par les droits ou la portée —
  rien à ajouter côté affichage.
- **Dette corrigée au passage** : l'e2e `e2e/pieces.spec.ts` affirmait encore
  qu'un gérant ne tient pas le catalogue (modèle de S20, réponse 4). Le
  renversement de S21 (`3c8b2fe`) et la garde `gerer_pieces` de S63 l'ont rendu
  faux ; le test a été retourné pour dire que le gérant tient bien son catalogue.
  Non rejoué ici (règle « pas de marathon de tests ») — à confirmer par un run
  ciblé de ce fichier.
