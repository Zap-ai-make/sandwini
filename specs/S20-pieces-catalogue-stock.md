# S20 — Pièces : catalogue, stock et mouvements

```
Statut     : en cours — spec écrite, questions posées, en attente de réponses
Périmètre  : post-MVP
Dépend de  : S4 (référentiels), S3 (boutiques et périmètre)
```

---

## Objectif

La boutique de pièces détachées doit savoir **ce qu'elle vend, combien il lui en
reste, et où c'est parti**. Ce lot pose le catalogue de références, le stock par
boutique, et les mouvements qui le font bouger — entrées, sorties, ajustements.

Il ne vend rien. La vente au comptoir et les alertes de rupture sont S21, qui
vient juste derrière et qui s'appuie entièrement là-dessus.

---

## Ce qui existe déjà, et qui n'est pas à refaire

- **L'espace est ouvert et gardé.** `app/(app)/pieces/` existe, `GardeEspace`
  y vérifie le métier, et le rail l'affiche dès que le périmètre porte
  `pieces` (D62, `CAHIER-UI.md:244`). Aujourd'hui il rend `EspaceAVenir`, qui
  annonce ce lot et S21 par leur numéro.
- **Le métier est porté par la boutique** (D62) : `boutiques.metiers` contient
  `'motos'` et/ou `'pieces'`, et les règles Firestore l'exigent déjà à la
  création comme à la modification (`firestore.rules:109`).
- **Le cloisonnement des coûts a son patron.** Le prix d'achat d'une moto vit
  dans `motos/{id}/prive/cout`, lisible du seul responsable — Firestore ne sait
  pas masquer un champ, une sous-collection est le seul moyen (D2). Ce lot n'a
  pas à réinventer le mécanisme, seulement à décider s'il s'applique ici
  (question 1).
- **Le patron de liste existe** : `Tableau`, avec son repli en cartes sur
  téléphone, déjà utilisé par le stock motos et le journal de caisse.
- **Le cahier des charges décrit le modèle** en `prompt.md` §5.7 et les règles
  métier en §9. Ce lot les suit, sauf sur un point qu'il conteste
  explicitement (question 2).

**Rien n'existe côté données** : ni `pieces`, ni `stockPieces`, ni
`mouvementsPieces`, ni `categoriesPieces`. Aucune règle Firestore ne les
mentionne. C'est un chantier neuf posé sur un socle connu.

---

## D'où vient la forme

De `c1-pieces.html`, la seule maquette de l'espace. **Elle montre surtout
l'écran de S21** — la vente au comptoir, avec son panier à droite — mais sa
moitié gauche est le catalogue de ce lot : une recherche, trois filtres
(« Tout », « Stock bas », « Épuisé »), un compte de références, et un tableau
à sept colonnes.

Sa colonne d'écrans nomme aussi ce que ce lot doit desservir, dans le groupe
« Suivre » : **Catalogue**, **Entrée en stock**, **Stock bas**. Le produit
n'expose aujourd'hui qu'une entrée, « Pièces détachées ».

---

## Les six questions, et ce qu'elles pèsent

**Aucune ne se tranche en écrivant du code.** Deux viennent d'un écart entre la
maquette et le modèle, une d'une contradiction entre le cahier des charges et
une décision déjà prise, trois de ce que le comptoir fait réellement.

### 1. Le gérant des pièces voit-il le prix d'achat ?

`prompt.md` §5.7 met `prixAchat` et `prixVente` côte à côte sur `pieces/{id}`.
Or D2 dit que les coûts et les marges sont hors de portée des gérants, et le
prouve par des tests de règles. Les deux ne peuvent pas tenir ensemble : un
champ posé là est lisible par quiconque lit la pièce.

Il y a de plus **deux prix d'achat différents** dans le cahier, et les
confondre coûterait cher : celui du catalogue (ce que cette référence coûte
d'ordinaire) et celui d'un lot entré un jour donné (§9 : « saisie d'un lot…
prix d'achat éventuel »). Le second bouge à chaque arrivage.

- **(a) Comme les motos.** Le prix d'achat quitte `pieces/{id}` pour
  `pieces/{id}/prive/cout`, et le prix du lot vit dans une sous-collection
  privée du mouvement d'entrée. Le gérant saisit des quantités, jamais des
  coûts ; c'est le responsable qui pose les prix.
- **(b) Le gérant des pièces voit ses coûts.** Un magasin de pièces négocie ses
  arrivages ; son gérant pourrait avoir besoin du prix d'achat pour décider.
  Mais alors D2 ne vaut plus pour ce métier, et il faut le dire.

**Recommandation : (a).** D2 n'est pas une préférence, c'est un cloisonnement
prouvé par des tests ; l'affaiblir pour un métier demande une raison venue du
comptoir, pas du code. Et si le gérant doit enregistrer ce qu'a coûté un
arrivage, il peut l'écrire sans le relire — c'est inhabituel, mais c'est
exactement ce que fait déjà le formulaire d'entrée d'une moto.

### 2. Le stock est-il un nombre entretenu, ou se compte-t-il à la lecture ?

`prompt.md` §5.7 décrit `stockPieces/{boutiqueId}_{pieceId}` avec une
`quantite` « maintenue par mouvements », et prévoit une Cloud Function de
recalcul. **D61 dit l'inverse** : rien ne se recalcule par déclencheur si ça
peut se calculer à la lecture, parce qu'un agrégat entretenu diverge et
**ment hors ligne**.

Ce n'est pas un désaccord de style, et le hors-ligne tranche presque seul :

| | Quantité entretenue | Quantité calculée des mouvements |
|---|---|---|
| Vente au comptoir sans réseau | le déclencheur ne tourne pas ; **l'écran affiche l'ancienne quantité** | le mouvement est écrit localement, la quantité bouge **tout de suite** |
| Divergence possible | oui, et silencieuse | impossible par construction |
| Coût de lecture | une lecture par pièce | tous les mouvements de la boutique |

- **(a) Calculé à la lecture** (D61). Juste hors ligne, jamais divergent. Le
  coût croît avec l'historique : une boutique qui écoule 40 lignes par jour
  écrit ~12 000 mouvements par an.
- **(b) Entretenu par déclencheur** (cahier des charges). Lecture bon marché,
  mais l'écran ment au comptoir précisément quand le réseau manque — c'est-à-dire
  dans la situation que ce produit promet de servir.

**Recommandation : (a), avec une borne écrite d'avance.** On calcule à la
lecture sur une **fenêtre de mouvements** plutôt que sur tout l'historique : un
document `stockPieces` figé par un arrêté périodique servirait de point de
départ, et seuls les mouvements postérieurs se rejoueraient. Mais **cet arrêté
n'existe pas tant que S23 (inventaires) n'existe pas.** Pour S20, on lit tous
les mouvements de la boutique, et on écrit dans la spec le seuil où ça cesse
d'être tenable — comme S24 l'a fait avec ses 20 000 ventes — plutôt que de
l'improviser le jour où ça rame.

**C'est la question la plus structurante du lot** : elle décide de ce qu'on
écrit en base, et se changer d'avis après coup demande une migration.

### 3. La maquette montre une colonne « Compatible » que le modèle ne porte pas

`c1:101-110` affiche « Sanili · Apsonic », « Toutes marques », « Haojue · Rato ».
`pieces/{id}` n'a aucun champ de compatibilité. C'est le même genre d'écart que
celui trouvé en S22 sur la colonne « Qui » du journal de caisse — la maquette
montre ce que le modèle ne contient pas (D84).

Et ce n'est pas un ornement : « est-ce que cette plaquette va sur sa moto ? »
est *la* question qu'on pose au comptoir des pièces.

- **(a) Un champ libre.** `compatibilite: string`, saisi à la main. Une ligne
  de code, aucune structure, et le gérant écrit ce qu'il veut.
- **(b) Des marques liées.** `marquesCompatibles: string[]` pointant sur le
  référentiel des marques, déjà posé par S4. Filtrable, cohérent, et ça évite
  « Apsonik » à côté d'« Apsonic ».
- **(c) Rien, et on retire la colonne.** Le gérant connaît son stock.

**Recommandation : (b)**, parce que le référentiel existe déjà et que c'est ce
qui rendra la recherche utile en S21 — chercher une pièce *pour une moto* est
le geste réel. Si la saisie s'avère pénible, (a) reste accessible en un commit.
**À trancher avant la première ligne** : c'est une forme de document.

### 4. Qui tient le catalogue ?

Le catalogue porte des prix de vente. Il est commun à l'entreprise — une
référence n'appartient pas à une boutique, seul son stock en dépend.

- **(a) Le responsable seul**, comme les marques, modèles et provenances (S4).
  Cohérent avec tout ce qui porte un prix.
- **(b) Le gérant des pièces aussi.** Il est au comptoir quand arrive une
  référence inconnue ; l'attente d'un appel au responsable bloque une vente.

**Recommandation : (a) pour les prix, (b) pour la création.** Le gérant peut
créer une référence et lui donner une désignation ; le prix de vente reste au
responsable, et une pièce sans prix ne peut pas être vendue tant qu'il n'est
pas posé. Cela dit ce que chacun décide sans bloquer le comptoir. Si c'est trop
subtil pour l'usage réel, (a) strict est plus simple à expliquer.

### 5. Faut-il les catégories de pièces dès maintenant ?

`prompt.md` §14 range « Catégories pièces » dans les paramètres, et §5.7 met
`categorieId` sur chaque pièce. Mais **la maquette n'affiche aucune catégorie** :
elle filtre par état de stock, pas par famille.

- **(a) Oui, dès S20.** Un référentiel de plus sur le patron de S4, et le champ
  est là dès le début — pas de migration ensuite.
- **(b) Non, plus tard.** 418 références se cherchent par référence et par
  désignation ; la catégorie ne sert que si on veut naviguer par famille, et
  personne ne l'a demandé.

**Recommandation : (b), et on garde le champ optionnel.** Créer un écran de
référentiel que la maquette n'utilise nulle part, c'est construire pour un
appelant imaginaire (`ARCHITECTURE.md` §1). Le champ posé dès le départ coûte
zéro et évite la migration ; l'écran qui le remplit attendra qu'on en veuille.

### 6. Une quantité peut-elle devenir négative ?

`prompt.md` §9 dit : « Bloquer une vente si la quantité en stock est
insuffisante (avec possibilité de forcer par le responsable, journalisée). »
La question déborde S21, parce que c'est ici qu'on décide si la base l'accepte.

- **(a) Jamais.** Les règles Firestore refusent tout mouvement qui rendrait le
  total négatif. Solide — mais une règle ne sait pas additionner une
  collection, donc c'est infaisable côté serveur sans agrégat entretenu, ce que
  la question 2 vient d'écarter.
- **(b) Le stock peut être négatif, et l'écran le montre comme une anomalie.**
  Un négatif ne vient jamais d'une vente de trop : il vient d'une entrée jamais
  saisie. Le masquer, c'est cacher une saisie manquante.

**Recommandation : (b).** C'est la seule option réellement applicable une fois
(2a) choisie, et elle est plus honnête : le comptoir vend ce qu'il a en main,
et un stock négatif est un **signal d'écart de saisie**, pas une faute à
interdire. L'écran le dira en toutes lettres. Le blocage de S21 restera un
garde-fou d'interface, annoncé comme tel, et non une promesse que la base ne
peut pas tenir.

---

## Ce que ce lot ne fait pas, et pourquoi

- **La vente au comptoir et les alertes de rupture** — c'est S21, la suite
  immédiate. Ce lot lui livre le catalogue, le stock et les mouvements.
- **Les transferts entre boutiques** — S17. Les types `transfert_entree` et
  `transfert_sortie` sont prévus dans le modèle mais aucun écran ne les écrit.
- **L'inventaire** — S23, qui apportera aussi l'arrêté périodique dont la
  question 2 dit qu'il manque.
- **L'écran des catégories** — voir question 5.

---

## Ce qui prouvera que c'est fait

*À compléter une fois les réponses connues ; les critères dépendent des
arbitrages ci-dessus.*

- [ ] Le domaine pur (`lib/domain/piece.ts`) calcule un stock à partir d'une
      liste de mouvements, sans Firestore ni horloge, avec un test par
      arbitrage — négatif compris.
- [ ] Les règles Firestore cloisonnent ce que la question 1 décide, et un test
      de règles le prouve — sans quoi le cloisonnement n'existe pas.
- [ ] Un mouvement écrit **réseau coupé** met la quantité à jour immédiatement
      à l'écran (c'est la question 2, vérifiée et non supposée).
- [ ] Le catalogue s'affiche avec sa recherche et ses trois filtres, maquette
      `c1` ouverte à côté du rendu.
- [ ] Le rendu est regardé en clair et en sombre, capture à l'appui.
- [ ] Le semis de vérification écrit ce que le produit écrit, et non ce que la
      maquette montre (D84).

---

## Ce qui a été livré

*À remplir à la fermeture.*
