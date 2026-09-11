# S20 — Pièces : catalogue, stock et mouvements

```
Statut     : livré
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

## Ce que le commanditaire a tranché

**1. Le prix d'achat est hors de portée du gérant — et plus largement, il ne le
saisit même pas.** « Il peut ajouter les articles (moto ou pièce), mais c'est
depuis l'espace superviseur que les prix d'achat sont ajoutés. » C'est plus fort
que la recommandation (a), qui laissait le gérant écrire sans relire : le
formulaire ne le lui demande plus du tout. Conséquence directe : les règles
Firestore de `pieces/{id}/prive/cout` s'ouvrent au **seul responsable**, et non
« responsable ou gérant de la boutique » comme celles des motos aujourd'hui.

**Cette réponse déborde S20** : le formulaire d'entrée d'une moto demande
aujourd'hui le prix d'achat au gérant, et les règles le lui permettent. Le
commanditaire l'a dit explicitement — « si le formulaire d'entrée de moto dans
l'espace gérant demande le prix d'achat, faudra corriger ». C'est S39.

**2. Le stock se calcule à la lecture** (recommandation suivie), depuis les
mouvements, avec le seuil écrit d'avance.

**3. Aucune compatibilité, et aucun lien avec les motos.** « L'espace pièces
détachées n'a rien à voir avec les motos, chaque espace est indépendant. » La
recommandation (b) — lier les pièces aux marques du référentiel motos — était à
côté : elle faisait entrer un métier dans l'autre. La colonne « Compatible » de
`c1:101` **ne sera pas reprise**, et rien ne remplace `marquesCompatibles`.
Ce que la maquette montrait là relevait d'un produit que le commanditaire ne
veut pas.

**4. Le responsable seul tient le catalogue** (option a). Pas de création par le
gérant : une référence porte un prix, et les prix appartiennent à la
supervision. Cohérent avec la réponse 1.

**5. La déclaration doit être aussi libre que possible.** « Le client doit avoir
le choix de déclarer comme il veut, ce qu'il veut. » Donc **pas de référentiel
fermé de catégories** : un champ libre, avec les valeurs déjà saisies proposées
en suggestion — jamais imposées, jamais à déclarer d'avance. Une catégorie naît
d'un usage, pas d'un écran de paramétrage.

**6. Pas de stock négatif.** Et l'argument que cette spec avançait pour nuancer
cette réponse a été écarté, à raison :

> « L'article se trouve dans une boutique et la vente se fera à la boutique,
> alors ton histoire de vendre à distance ne tient pas. »

C'est exact. Le scénario invoqué — deux appareils hors ligne vendant chacun la
dernière pièce — supposait deux comptoirs pour un même stock, ce que
l'organisation ne produit pas : une pièce est dans une boutique, et elle s'y
vend. **Cet argument tombe.** Ce qui suit ne le recycle pas ; il repart de la
seule contrainte qui reste, et qui n'est pas une opinion.

---

## Comment « pas de négatif » se tient réellement

**Il ne peut pas se tenir dans les règles Firestore, et ce n'est pas un
arbitrage.** Une règle ne sait pas additionner une collection : elle lit le
document qu'on écrit, pas la somme des autres. Refuser un total négatif *au
niveau de la base* exigerait donc un document portant la quantité — c'est-à-dire
l'agrégat entretenu que la réponse 2 vient d'écarter, avec l'écran qui ment au
comptoir dès que le réseau manque.

Une transaction ne sauve pas non plus : **les transactions Firestore ne
fonctionnent pas hors ligne.** Une vente passée par transaction échouerait
précisément le jour sans réseau, c'est-à-dire dans la situation que ce produit
promet de servir.

**La règle se tient donc là où le geste se fait**, et c'est le seul endroit où
elle peut se tenir : l'écran de vente (S21) refuse de sortir plus que le stock
disponible, calculé depuis les mouvements que l'appareil a en cache. Hors ligne
comme en ligne, il refuse. C'est ce que le commanditaire demande — le logiciel
ne laisse pas vendre ce qu'on n'a pas — et c'est effectif, pas décoratif.

### La conséquence qui compte, et qu'il faut traiter dans ce lot

Un refus n'est pas gratuit. **Le cas qui va se produire à Pouytenga n'est pas un
stock négatif : c'est une vente refusée sur une pièce physiquement présente.**
Un carton arrive, il n'est pas encore saisi, un client demande la pièce — et
l'écran dit non alors qu'elle est sur l'étagère. Le logiciel aurait tort, et le
gérant apprendrait à s'en méfier.

**Ce qu'on fait** : là où l'écran refuse, il propose l'entrée manquante au même
endroit — « cette référence n'est pas en stock ici ; faire entrer un lot » —
sans quitter la vente en cours. C'est exactement le principe de S39 appliqué
au comptoir des pièces : **une condition préalable ne bloque pas, elle se
répare sur place.**

C'est ce qui rend « pas de négatif » vivable. Sans ce geste, la règle serait
juste et le comptoir la contournerait.

### Et si un négatif apparaît quand même

Il n'y a plus qu'une façon d'en fabriquer un : **corriger ou annuler une entrée
après que des sorties l'ont consommée.** Aucun réseau, aucun second appareil —
une correction de saisie, sur un seul comptoir.

Ce n'est pas une fonctionnalité à concevoir, c'est un état de données à ne pas
afficher comme s'il était normal. Le tableau écrit alors **« −3 · il manque une
entrée »** plutôt qu'un nombre nu, au même titre qu'il écrirait une erreur de
lecture. Le masquer reviendrait à ranger « ma saisie est incohérente » avec
« il n'y en a plus » — la faute que D82 nomme.

---

## Ce que ce lot ne fait pas, et pourquoi

- **La vente au comptoir et les alertes de rupture** — c'est S21, la suite
  immédiate. Ce lot lui livre le catalogue, le stock et les mouvements.
- **Les transferts entre boutiques** — S17. Les types `transfert_entree` et
  `transfert_sortie` sont prévus dans le modèle mais aucun écran ne les écrit.
- **L'inventaire** — S23, qui apportera aussi l'arrêté périodique dont la
  question 2 dit qu'il manque.
- **L'écran des catégories** — il n'y en aura pas : la réponse 5 en fait un champ
  libre à suggestions, sans écran de paramétrage.
- **Le prix d'achat du formulaire moto et la marque à déclarer d'avance** — ce
  sont deux corrections demandées par le commanditaire en répondant à ce lot,
  mais elles portent sur S4 et S5. Elles vivent dans leur propre spec, S39.

---

## Ce qui prouve que c'est fait

- [x] **Le domaine pur calcule un stock depuis une liste de mouvements**, sans
      Firestore ni horloge — 34 tests, un par arbitrage, négatif compris.
- [x] **Les règles cloisonnent le prix d'achat dans les deux sens** : le gérant
      ne le lit pas et ne l'écrit pas. 25 tests de règles, dont deux qui figent
      l'absence de `stockPieces` et de `categoriesPieces` — sans eux, quelqu'un
      rouvrirait ces portes en croyant boucher un trou.
- [x] **Un mouvement écrit réseau coupé met la quantité à jour immédiatement.**
      C'est la question 2, vérifiée et non supposée : le test coupe le réseau,
      écrit une sortie, lit 20 − 6 = 14 dans le tableau, et vérifie que la garde
      du geste tient aussi sur le cache local.
- [x] **Le catalogue s'affiche avec sa recherche et ses trois filtres**, la
      maquette `c1` ouverte à côté du rendu — moins sa colonne « Compatible »,
      que la réponse 3 a écartée.
- [x] **Le rendu est regardé en clair et en sombre, et dans les deux rôles.**
      Sept captures, dont le repli en cartes et le panneau ouvert.
- [x] **Le semis de vérification écrit ce que le produit écrit** : des
      mouvements, jamais une quantité. Semer une quantité serait semer ce que le
      produit n'écrit pas (D84).

---

## Ce qui a été livré

**Le domaine** (`lib/domain/piece.ts`). `quantiteDe` et `stockParPiece`
comptent ; `etatStock` nomme les quatre états, dont l'anomalie qui n'est pas une
quantité mais un aveu. Le signe vit dans `MOUVEMENTS`, une seule fois : la
quantité se stocke positive, parce qu'un nombre négatif écrit à la main est une
faute de frappe qui ne se voit pas, là où un type inconnu se refuse.
`SEUIL_MOUVEMENTS` écrit d'avance où ce choix cesse d'être tenable.

**Les règles.** `pieces` au responsable, `mouvementsPieces` au comptoir de sa
boutique, `pieces/{id}/prive/cout` au seul responsable en lecture **et** en
écriture. Un mouvement ne se corrige ni ne s'efface : la quantité étant leur
somme, retoucher l'un d'eux déplacerait un total sans laisser de trace. On
corrige par un mouvement inverse, qui se voit.

**Les écrans.** `/pieces` porte le catalogue, ses filtres et les quantités de la
boutique du bandeau ; la ligne qu'on touche ouvre un panneau qui montre la
quantité, l'histoire récente et les deux gestes qui la changent. Le geste vit à
côté du chiffre : un arrivage de douze références aurait sinon coûté douze
allers-retours. `/pieces/nouvelle` crée une référence, et n'est offert qu'au
responsable.

**La catégorie est un champ libre à suggestions**, sans écran de paramétrage ni
collection pour la tenir — ce que `prompt.md` §14 prévoyait. C'est la réponse 5
appliquée, et c'est D90.

### Ce que le lot ne fait pas

- **La vente au comptoir** reste S21, qui s'appuie entièrement sur ce socle.
- **Les transferts** restent S17. Leurs deux types existent dans le modèle et
  dans les règles, mais aucun écran ne les écrit : les ajouter après coup aurait
  demandé de rouvrir le fichier de règles pour une spec voisine.
- **L'inventaire** reste S23, qui apportera l'arrêté périodique dont
  `SEUIL_MOUVEMENTS` dit qu'il manquera un jour.
- **Le prix d'achat d'une référence** a sa place en base et sa règle, et aucun
  écran ne le pose encore. C'est volontaire : `/supervision/couts` fait ce
  travail pour les motos, et l'étendre aux pièces demande de décider si une
  référence a un prix d'achat ou si chaque lot a le sien — le cahier des charges
  emploie le même mot pour les deux (§5.7 et §9). La question est posée, pas
  devinée.

---

## Ce qui a été livré

*À remplir à la fermeture.*
