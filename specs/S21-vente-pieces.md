# S21 — La vente de pièces au comptoir

```
Statut     : en cours — le geste et la base sont livrés, le reçu et le bout en bout restent
Périmètre  : post-MVP
Dépend de  : S7, S10, S20, S22
```

---

## Objectif

Le gérant vend une bougie. Aujourd'hui il ne peut pas : le stock ne descend que
par « Sortie · casse, usage interne », et rien n'enregistre la recette. Le second
métier devient entier.

---

## Les arbitrages

| # | Arbitrage | Statut |
|---|---|---|
| 1 | **Le panier est multi-lignes, le client est facultatif.** | Tranché par `prompt.md` §9. |
| 2 | **Le prix unitaire est pré-rempli depuis le catalogue et reste modifiable.** Le modèle stocke un prix *par ligne*, ce qui n'aurait aucun sens s'il ne pouvait pas différer du catalogue — et un comptoir négocie. L'écart se voit à l'écran. | *Par défaut.* |
| 3 | **Une pièce sans prix de vente ne se vend pas.** L'écran refuse **et propose de fixer le prix au même endroit** (D90). | *Par défaut.* |
| 4 | **Le stock insuffisant refuse la vente, sans possibilité de forcer.** | **Tranché contre `prompt.md` §9**, qui prévoyait un forçage journalisé. Le commanditaire a tranché « pas de stock négatif » ; un chemin de forçage rouvrirait exactement le négatif qu'on vient d'interdire, et il serait emprunté, parce qu'il est plus court que d'aller saisir le carton. **L'écart au cahier des charges est assumé.** |
| 5 | **La numérotation est un compteur partagé avec les ventes de motos.** | **Q1, tranchée par le commanditaire.** Un numéro dicté au téléphone doit désigner une seule pièce comptable. Coût : deux collections à lire pour numéroter. |
| 6 | **Pas d'écran « Alertes » distinct.** Les filtres « Stock bas » et « Épuisé » de `/pieces` répondent déjà, pour le même lecteur (D73). Ce qui manquait est un **lecteur** : le responsable. D'où une carte en supervision, et rien de plus. | *Par défaut, contre `prompt.md` §14.* |
| 7 | **Le prix d'achat d'une pièce n'est pas construit ici.** Q9 a tranché **où il ira** — sur le mouvement d'entrée, parce que c'est le lot qui porte le tarif du fournisseur, pas la référence. Cette étape ne ferme pas cette porte. | **Q9, tranchée.** |

---

## Le modèle

```ts
ventesPieces/{id} {
  numero, numeroInitial      // {CODE}-{AAMM}-{NNNN}, compteur partagé (Q1)
  boutiqueId, date
  clientId                   // "" au comptoir anonyme
  lignes: { pieceId, reference, designation, quantite, prixUnitaire, total }[]
  total
  moyenPaiement
  ...audit
}
```

**La désignation est recopiée dans la ligne, pas référencée.** Un reçu imprimé
six mois plus tard doit dire ce qui a été vendu, même si la référence a été
renommée depuis — même raisonnement que `coutMotoSnapshot`.

**Tout part en un seul lot** : la vente, un `mouvementsPieces` de type
`sortie_vente` par ligne (portant le numéro dans sa note), et un `encaissements`
d'origine `vente_piece`. Un stock qui descend sans recette enregistrée — ou
l'inverse — est un mensonge, et hors ligne le lot voyage dans la file comme une
écriture unique.

---

## Ce que les règles tiennent, et ce qu'elles ne peuvent pas tenir

Tenu : qui écrit (le comptoir de la boutique), la forme d'une ligne (quantité
entière positive, prix entier positif, `total == quantite * prixUnitaire`), le
nombre de lignes (vingt au plus), le format du numéro, et **l'immuabilité** —
`allow update, delete: if false`, une vente se contre-passe, elle ne se retouche
pas.

Pas tenu, et **figé par des tests qui l'affirment** plutôt que passé sous
silence :

- *le total de la vente contre la somme de ses lignes* — le langage des règles
  n'a pas de repli sur une liste ; seule la première ligne est vérifiée
  intégralement ;
- *le lien vers les mouvements de stock* — une règle ne voit qu'un document à la
  fois ; c'est le batch qui le tient ;
- *le stock disponible* — une règle ne sait pas additionner une collection, et
  une transaction ne fonctionne pas hors ligne (D94).

Écrire ces trois tests à l'envers aurait fait croire que la base protège. Le jour
où quelqu'un allégera le garde-fou du geste « puisque les règles le tiennent »,
ce sont eux qui lui diront qu'il se trompe.

---

## Critères d'acceptation

- [x] Le domaine calcule un panier, son total et son refus sur stock
      insuffisant, sans Firestore ni horloge — **un test par arbitrage, qui le
      nomme** (28 tests). Chaque refus porte un nom, y compris le panier plein,
      et le stock négatif ne se dit pas « épuisé » (D82).
- [x] Les règles refusent une ligne à quantité nulle, un total de ligne qui ne
      somme pas, un total de document qui contredit la somme de son détail, et
      toute retouche d'une vente enregistrée (32 tests de règles). Vérifier
      *entièrement* les vingt lignes a été mesuré comme impossible : le plafond
      de 1000 expressions par requête tombe dès la sixième.
- [x] Le refus sur stock insuffisant propose l'entrée manquante, et le refus sur
      prix absent propose de le fixer — chacun avec son lien, et `/pieces` ouvre
      la référence désignée ou applique le filtre demandé.
- [x] La carte « pièces en alerte » en supervision, qui s'efface quand il n'y a
      rien à réapprovisionner.
- [ ] **Une vente se passe réseau coupé** : le stock descend à l'écran
      immédiatement, l'encaissement apparaît au journal au retour du réseau.
- [x] Le reçu de vente de pièces, imprimable hors ligne et en thème sombre
      système (D77) — **livré par S64** sous la forme d'un composant propre,
      `RecuPiece`, plutôt qu'une extension de `PanneauRecu` (moto), pour ne pas
      toucher au reçu des motos.
- [x] Le rendu regardé en capture, clair et sombre — **vérifié en S64** sur les
      émulateurs, vente de bout en bout, reçu imprimable, zéro erreur console.

---

## Ce qui reste, et pourquoi c'est séparé

**Le reçu et le bout en bout.** Le geste est complet et vérifié à trois niveaux
— le domaine, les règles, et les déclencheurs pour la numérotation partagée entre
les deux collections (Q1) — mais le lot ne sera fermé que quand un test bout en
bout aura prouvé les deux choses qu'aucun de ces niveaux ne peut prouver : que le
**batch** lie réellement la vente, ses sorties de stock et sa recette, et que tout
cela marche **réseau coupé**. Tant qu'il n'existe pas, ce lien ne repose sur rien
d'autre que la relecture de `enregistrerVentePiece` — et les commentaires de
`firestore.rules` et du dépôt le disent ainsi, plutôt que d'annoncer une
protection absente. L'écran de vente n'annonce donc aucun reçu : un bouton qui
mène nulle part apprend à ne plus croire l'écran.

---

## Hors périmètre

Le transfert de pièces (étape 8), l'inventaire (étape 11), la contre-passation
d'une vente de pièces (étape 7), et le prix d'achat d'une pièce — dont Q9 dit
seulement **où** il ira.
