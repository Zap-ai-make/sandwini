# S39 — Déclarer moins pour saisir mieux

```
Statut     : en cours — spec écrite, une question posée
Périmètre  : post-MVP
Dépend de  : S4 (référentiels), S5 (stock motos)
```

---

## Objectif

Deux corrections demandées par le commanditaire en répondant à S20, et qui ne
portent pas sur les pièces :

1. **Le gérant ne saisit plus le prix d'achat d'une moto.** Il entre l'article ;
   les prix d'achat se posent depuis l'espace du responsable.
2. **On n'a plus à déclarer une marque avant de faire entrer une moto.** La
   marque se tape directement sur le formulaire.

Elles se ressemblent plus qu'il n'y paraît : les deux retirent une **condition
préalable** à un geste de comptoir. L'une une permission, l'autre une
déclaration.

---

## Ce qui ne va pas aujourd'hui, vérifié dans le code

### Le gérant saisit un montant qu'il ne peut pas relire

`app/(app)/motos/nouvelle/page.tsx:293-330` porte un bloc « Ce qu'elle a
coûté » — provenance, prix d'achat, frais d'entrée, coût total — affiché à
**quiconque ouvre le formulaire**, gérant compris. Il s'en excuse d'ailleurs en
toutes lettres : « Ces montants sont réservés au responsable : ils ne se
relisent pas ici. »

Et les règles suivent : `firestore.rules:444-449` autorise l'écriture de
`motos/{motoId}/prive/cout` à `estResponsable() || estGerantDe(...)`.

Le cloisonnement de D2 est donc respecté **en lecture** et ouvert **en
écriture**. Ce n'était pas un oubli — c'était le choix de laisser le gérant
enregistrer ce qu'il avait payé. Le commanditaire tranche autrement : *« il peut
ajouter les articles, mais c'est depuis l'espace superviseur que les prix
d'achat sont ajoutés »*.

**Ce qu'on y gagne au-delà de l'obéissance** : un formulaire qui demande un
chiffre qu'on ne reverra jamais est un formulaire qu'on remplit mal. Le prix
d'achat saisi par quelqu'un qui ne peut pas le vérifier est une donnée dont
personne ne répond.

### Une moto ne peut pas entrer tant qu'une marque n'est pas déclarée

`app/(app)/motos/nouvelle/page.tsx:107-119` remplace le formulaire par un
panneau « Il manque une marque ou une provenance » dès que le référentiel est
vide, avec un bouton « Déclarer une marque ». La marque et le modèle sont des
`<select>` sur `catalogue.marques` / `catalogue.modeles`, et `motos` stocke
`marqueId` / `modeleId`.

Le raisonnement d'origine est écrit à l'écran : « sinon la même marque finit
écrite de trois façons ». Il est juste. **Il est juste et il coûte trop cher** :
il met un écran de paramétrage entre un gérant et la moto qu'il a devant lui.

---

## Ce que le commanditaire a tranché

> « Le prix d'achat est hors de portée du gérant ; il peut ajouter les articles
> (moto ou pièce), mais c'est depuis l'espace superviseur que les prix d'achat
> sont ajoutés. Si le formulaire d'entrée de moto dans l'espace gérant demande
> le prix d'achat, faudra corriger. »

> « Devoir déclarer une marque avant de faire rentrer une moto n'est pas anodin,
> supprime cela et ajoute un input pour saisir directement la marque sur le
> formulaire d'ajout de moto. »

> « Rends la plus flexible possible : le client doit avoir le choix de déclarer
> comme il veut, ce qu'il veut. »

---

## Le principe qu'on en tire

**Un référentiel vide ne bloque jamais une saisie de comptoir.** Ce qu'on sait
déjà se propose ; rien ne s'impose ; rien ne se déclare d'avance.

C'est la forme générale des trois phrases ci-dessus, et elle vaut au-delà des
motos : elle décide aussi ce que S20 fera des catégories de pièces (champ libre
à suggestions, pas d'écran de paramétrage).

**Et elle ne renonce pas à la cohérence, elle change de moyen.** Le champ de
marque est libre *et* propose les marques déjà employées, tirées de ce qui a
été saisi — pas d'une liste à tenir. On tape « Apsonic » et on le retrouve
proposé la fois suivante ; la troisième orthographe devient possible sans
devenir probable. C'est la différence entre empêcher et aider, et c'est la
seule qui tienne au comptoir.

---

## Conception

**Le prix d'achat.**

- Le bloc « Ce qu'elle a coûté » ne s'affiche que pour le responsable. Le gérant
  voit l'identité de la moto et rien d'autre.
- **La provenance sort de ce bloc** : ce n'est pas un montant, c'est d'où vient
  la moto, et le gérant la connaît. Elle reste à lui, et elle suit la même règle
  de souplesse que la marque — saisie libre, valeurs déjà vues proposées.
- Les règles Firestore se resserrent : `motos/{id}/prive/cout` n'accepte plus
  que `estResponsable()` en écriture. Un test de règles le prouve, sinon le
  cloisonnement n'existe pas (D2).
- **Une moto peut donc exister sans coût**, et c'est nouveau. Le responsable a
  besoin d'un endroit pour le poser après coup : un geste sur la fiche de la
  moto, visible de lui seul, qui dit « coût non renseigné » tant qu'il ne l'est
  pas. Sans ce geste, la correction rendrait le coût inatteignable et la marge
  de S24 muette pour toujours.

**La marque et le modèle.**

- `marque: string` et `modele: string` sur la moto, saisis librement, avec un
  `<datalist>` alimenté par les valeurs déjà présentes dans le stock de
  l'entreprise.
- Le panneau bloquant « Il manque une marque ou une provenance » disparaît.
- Les filtres du stock passent de `marqueId` à la valeur texte.

---

## La question qui reste, et elle porte sur des données existantes

**Que deviennent `marques` et `modeles`, et les motos qui les référencent ?**

- **(a) On supprime les deux référentiels et on convertit.** Chaque moto reçoit
  `marque` / `modele` avec le libellé qu'elle affichait ; les écrans de
  paramétrage s'en vont. Le produit devient plus simple, sans deux façons de
  dire la même chose.
- **(b) On garde les référentiels comme source de suggestions.** Rien à
  migrer, mais deux mécanismes coexistent pour un seul besoin — exactement ce
  que D73 demande d'éviter.

**Recommandation : (a).** Et le moment est le bon, pour une raison mesurable :
**la base de production ne contient aujourd'hui aucune moto** — les deux
boutiques affichent « Motos en stock : 0 ». La conversion ne porte donc sur
rien. Faite dans six mois, elle portera sur tout le stock, et sur les ventes qui
le référencent.

**C'est une opération sur des données réelles** : elle ne se lance pas sans un
mot explicite, même quand il n'y a rien à convertir (`AGENTS.md` règle 6).

---

## Ce qui prouvera que c'est fait

- [ ] Le formulaire d'entrée d'une moto, ouvert **par un gérant**, ne contient
      aucun champ de prix — vérifié par un test bout en bout avec une vraie
      session de gérant, pas par relecture.
- [ ] Les règles refusent au gérant l'écriture de `motos/{id}/prive/cout`, et le
      test de règles échoue sur l'ancienne version (D79).
- [ ] Le responsable pose un coût après coup, et la marge de S24 le reflète.
- [ ] Une moto s'enregistre sur une base **sans aucune marque déclarée**.
- [ ] La marque déjà employée est proposée à la saisie suivante.
- [ ] Le rendu est regardé en clair et en sombre, dans les deux rôles.

---

## Ce qui a été livré

*À remplir à la fermeture.*
