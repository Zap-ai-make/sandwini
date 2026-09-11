# S39 — Déclarer moins pour saisir mieux

```
Statut     : livré
Périmètre  : post-MVP
Dépend de  : S4 (référentiels), S5 (stock motos), S24 (marges)
```

---

## Objectif

Deux corrections demandées par le commanditaire en répondant à S20, et qui ne
portent pas sur les pièces :

1. **Le gérant ne saisit plus le prix d'achat d'une moto.** Il entre l'article
   et son prix de vente ; les prix d'achat se posent depuis l'espace du
   responsable.
2. **On n'a plus à déclarer une marque avant de faire entrer une moto.** La
   liste reste, mais elle se remplit depuis le formulaire.

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
enregistrer ce qu'il avait payé (D4). Le commanditaire tranche autrement.

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

Et il y a pire que le panneau, parce que le panneau au moins se voit :
`firestore.rules:207-216` réserve la **création** d'une marque au responsable.
Le gérant à qui il manque « Apsonic » un samedi matin ne peut pas s'en sortir
seul, même en trouvant l'écran de paramétrage. Il attend un appel.

---

## Ce que le commanditaire a tranché

> « Le prix d'achat est hors de portée du gérant ; il peut ajouter les articles
> (moto ou pièce), mais c'est depuis l'espace superviseur que les prix d'achat
> sont ajoutés. Si le formulaire d'entrée de moto dans l'espace gérant demande
> le prix d'achat, faudra corriger. »

> « Devoir déclarer une marque avant de faire rentrer une moto n'est pas anodin,
> supprime cela et ajoute un input pour saisir directement la marque sur le
> formulaire d'ajout de moto. »

> « Oui, une moto enregistrée via l'espace gérant n'aura pas de coût, mais il
> peut ajouter les prix de vente ; et le responsable verra les motos sans prix
> d'achat, c'est à lui d'ajouter, et ça restera dans son espace. »

> « Les références marques et modèles restent : on pourra ajouter directement
> via ces formulaires et ça créera une liste ; sur le formulaire d'ajout de
> moto la liste apparaît, avec la possibilité d'ajouter la marque directement
> sur le formulaire également. »

**La dernière réponse écarte la recommandation que cette spec portait.** Elle
proposait de supprimer les référentiels au profit d'un champ libre à
suggestions. C'était une façon de garder la cohérence en changeant de moyen ;
le commanditaire garde le moyen et déplace seulement l'endroit où on le
remplit. **C'est mieux, et pour une raison qui se mesure** : le champ libre
laisse « Apsonic » et « Apsonik » coexister dès que deux personnes tapent, et
la suggestion n'empêche rien — elle aide. La liste, elle, ne se trompe pas sur
ce qu'on a déjà. Aucune migration à faire, et un seul mécanisme au lieu de deux
(D73).

**Ce qui restait un risque disparaît donc** : la question « que deviennent les
motos qui référencent une marque ? » n'a plus lieu d'être. Rien ne bouge en
base. Aucune opération sur des données réelles n'est nécessaire.

---

## Le principe qu'on en tire

**Un référentiel vide ne bloque jamais une saisie de comptoir.** Ce qu'on sait
déjà se propose ; ce qui manque s'ajoute sur place ; rien ne se déclare
d'avance.

C'est la forme générale des réponses ci-dessus, et elle vaut au-delà des motos.
Elle décide aussi ce que S20 fera des catégories de pièces.

La nuance qui compte, et qui sépare cette spec d'un simple « on ouvre tout » :
**créer, oui ; renommer et désactiver, non.** Ajouter un mot au vocabulaire de
la maison est un geste de comptoir — il répare un manque, et une entrée de trop
se désactive. Changer un mot déjà employé en est un autre : le stock, les
ventes et les reçus le citent. Le premier passe au gérant, le second reste au
responsable. C'est la même coupure que S20 fait entre créer une référence et
lui poser un prix.

---

## Conception

### Le prix d'achat quitte le formulaire du gérant

- Le formulaire se réorganise en trois blocs : **la moto** (ce qu'on lit sur le
  cadre, provenance comprise), **le prix de vente** (le repère du gérant), et
  **ce qu'elle a coûté** — ce dernier affiché au seul responsable.
- **La provenance sort du bloc des coûts** : ce n'est pas un montant, c'est d'où
  vient la moto, et le gérant la connaît. Elle rejoint l'identité de la moto,
  où elle était de toute façon stockée — `provenanceId` vit sur le document
  public, pas dans `prive/cout`.
- **Le prix de vente conseillé reste au gérant**, et le commanditaire l'a dit
  explicitement. Il était déjà visible ; il change seulement de bloc, pour
  cesser d'être rangé sous un titre qui parle de coûts.
- Les règles Firestore se resserrent : `motos/{id}/prive/cout` n'accepte plus
  que `estResponsable()` en écriture. Un test de règles le prouve dans les deux
  sens (D79).

### Une moto peut désormais exister sans coût

C'est la conséquence nouvelle, et elle demande deux choses.

**En base**, l'absence de coût est l'**absence du document**, et non un document
à zéro. Un `prixAchat: 0` voudrait dire « acquise gratuitement » ; c'est ranger
« je ne sais pas » avec « rien », exactement ce que D82 refuse. Le document
manquant est le seul signal qui ne ment pas.

**À l'écran**, le responsable a besoin de voir ce qui lui revient. `/supervision`
gagne une entrée **« Prix d'achat »** qui liste les motos et l'état de leur
coût, filtrée par défaut sur celles qui n'en ont pas, avec le geste de le poser
sur place — prix d'achat, frais d'entrée, total — sans changer d'écran entre
deux lignes.

Sans ce geste, la correction rendrait le coût inatteignable et la marge de S24
muette pour toujours.

**Trois états, pas deux.** Une lecture de coût peut échouer — `getDoc` lève
`unavailable` quand le document n'est pas en cache et que la connexion est
encombrée, ce que S24 a constaté au banc. Une moto dont le coût n'a pas pu être
lu n'est donc pas une moto sans coût : elle s'affiche comme telle, et ne se
range pas dans la liste à renseigner. C'est D82 appliqué une seconde fois, au
même endroit et pour la même raison.

### La marque, le modèle et la provenance se créent depuis le formulaire

- Le panneau bloquant « Il manque une marque ou une provenance » disparaît.
- Chaque liste de choix gagne une entrée **« + Ajouter… »** qui ouvre un champ
  de saisie à la place du `<select>`, sans quitter l'écran ni perdre ce qui est
  déjà tapé.
- Le nom saisi est comparé sous forme réduite — sans casse ni accents, la
  fonction `reduire` existe déjà. **S'il existe déjà, on sélectionne l'existant
  au lieu d'en créer un second**, et on le dit. C'est ce qui remplace le
  garde-fou du référentiel fermé : la liste ne se dédouble pas, même quand
  c'est un gérant pressé qui la remplit.
- Les règles ouvrent la **création** de `marques`, `modeles` et `provenances` à
  tout compte connecté ; `update` reste au responsable, donc renommer et
  désactiver aussi. `typesFrais` ne bouge pas : un type de frais ne sert qu'au
  bloc des coûts, que le gérant ne voit plus.
- Les identifiants sont tirés avant l'écriture, comme pour une moto, pour que
  la marque créée soit sélectionnable **tout de suite, hors ligne**. La file
  d'écritures de Firestore rejoue dans l'ordre : la marque part avant le modèle
  qui la cite, donc la règle `exists(marques/{id})` sera vraie à l'arrivée.
- Un point qui traînait et que ce lot répare au passage : une entrée
  **désactivée** disparaissait du `<select>`, y compris quand c'était celle de
  la moto ouverte. La valeur sélectionnée est désormais toujours présente dans
  la liste, active ou non.

---

## Ce que ce lot ne fait pas

- **Il ne touche pas aux pièces.** S20 applique le même principe de son côté,
  sur son propre modèle.
- **Il ne migre rien.** Les référentiels restent, les motos gardent
  `marqueId` / `modeleId` / `provenanceId`.
- **Il ne pose pas le coût sur la fiche d'une moto.** Le geste vit dans la
  supervision, là où le commanditaire l'a mis : « ça restera dans son espace ».

---

## Ce qui prouvera que c'est fait

- [x] **Les règles refusent au gérant l'écriture de `motos/{id}/prive/cout`**, et
      le test échoue sur l'ancienne version des règles — vérifié dans les deux
      sens (D79).
- [x] **Le gérant crée une marque, un modèle et une provenance**, mais ne
      renomme ni ne désactive ce qui sert déjà. Prouvé en règles, dans les deux
      sens.
- [x] **Le domaine n'écrit aucun coût quand il n'y en a pas** — `construireCout`
      rend `null`, jamais un zéro.
- [x] **La marge d'une vente antérieure à son coût se rattrape**, et une marge
      déjà figée ne se réécrit pas. Deux tests de déclencheurs, l'un pour chaque
      moitié.
- [x] **Le formulaire d'entrée d'une moto, ouvert par un vrai gérant connecté,
      ne contient aucun champ de prix d'achat ni de frais** — et contient
      toujours le prix de vente conseillé. Vérifié sur le formulaire rendu, pas
      par relecture.
- [x] **Le responsable pose le coût après coup depuis `/supervision/couts`**, et
      la moto quitte la liste « à renseigner ». Le montant se relit ensuite sur
      sa fiche. Même test, seconde moitié.
- [x] **Une moto s'enregistre sur une boutique sans aucun référentiel rempli**,
      marque, modèle et provenance créés depuis le formulaire — et la même
      marque retapée en majuscules n'en crée pas une seconde.
- [ ] Le rendu n'a pas été regardé en clair et en sombre dans les deux rôles.
      C'est le seul poste de `ARCHITECTURE.md` §4 qui manque.

---

## Ce qui a été livré

**Le domaine.** `SaisieCout` sort de `SaisieMoto` — le coût a désormais deux
points d'entrée, le formulaire d'entrée en stock et l'écran de supervision, et
une seule validation les sert tous les deux. `validerCout` accepte un coût vide
(une moto peut entrer sans), `validerCoutPose` l'exige (on est là pour ça), et
`construireCout` rend `null` plutôt qu'un zéro. Le référentiel gagne
`trouverParNom` et `optionsAvecChoix`. **372 tests unitaires**, dont onze neufs.

**Les règles.** `motos/{id}/prive/cout` passe de « responsable ou gérant » à
« responsable » en écriture. La création de `marques`, `provenances` et
`modeles` passe de « responsable » à « connecté » ; `update` ne bouge pas, et
`typesFrais` non plus. **240 tests de règles**, et les cinq nouveaux
**échouent sur les règles d'avant** — vérifié en les remettant en place, pas
supposé (D79).

**Les écrans.** Le formulaire d'entrée en stock se lit en trois blocs : la moto
(provenance comprise), le prix de vente, et les coûts — ce dernier réservé au
responsable. Le panneau bloquant a disparu au profit de `ChoixOuNouveau`, une
liste de choix qui accueille ce qu'elle ne contient pas encore.
`/supervision/couts` est neuf : la liste de ce qui attend un prix d'achat, avec
le geste pour le poser sans changer d'écran.

**Le serveur.** `rattraperMargeDuCout` comble la marge d'une vente dont le coût
est arrivé après elle, et ne réécrit jamais celle qui existe (D91). **24 tests
de déclencheurs**, dont trois neufs.

**Trois décisions écrites** : D89 (un cloisonnement tenu d'un seul côté n'en est
pas un), D90 (un référentiel vide ne bloque jamais une saisie de comptoir),
D91 (un calcul figé se comble, il ne se révise pas).

### Ce que le lot a réparé sans que la spec l'ait prévu

- **Une entrée désactivée disparaissait du `<select>`, y compris quand c'était
  celle de la fiche ouverte.** Le champ retombait sur son invite, et enregistrer
  effaçait la marque en silence. Jamais mordu jusqu'ici parce que rien ne se
  désactivait.
- **Le message de refus écrivait « cette modèle » et « cette type de frais ».**
  Il se fabriquait en collant « cette » devant le substantif. Le genre vient
  désormais de l'appelant, qui le connaît — `ListeReferentiel` le portait déjà.
- **Le déclencheur de marge ne repassait jamais.** Ce n'était pas un défaut
  avant ce lot : le coût partait avec la moto. Il le devenait à la seconde où
  le coût est devenu facultatif.

### La suite bout en bout : 84 passés, 4 tombés, aucun sur S39

Les deux tests neufs passent. Les quatre échecs de la suite complète se
répartissent ainsi, chacun vérifié séparément :

- **`recus.spec.ts:70`** attend encore « La moto est remise au client », la
  phrase que le commanditaire a fait retirer du reçu. C'est **S37**, corrigé sur
  `feat/S22-caisse` et absent de cette branche-ci. Il tombera de lui-même à la
  consolidation.
- **`clients.spec.ts:120`, `paiements.spec.ts:67`, `motos.spec.ts:241`** passent
  tous les trois seuls, et passent tous les trois rejoués ensemble. **Le coupable
  change d'un tour à l'autre** — sur le code d'*avant* S39, c'est `clients` qui
  est tombé et `motos` qui est passé ; au tour suivant, l'inverse. C'est la
  signature de D50, la contention de la file d'écritures Firestore sous un seul
  jeu d'émulateurs partagé.

### Ce qui a coûté trois compilations, et qu'il faut savoir

`motos.spec.ts` « hors ligne » a d'abord échoué de façon **reproductible** : la
liste des modèles restait vide hors ligne. J'ai accusé S39 pendant un moment.

La cause était ailleurs : **`.next` mélangeait des artefacts Turbopack laissés
par `next dev` et le build webpack de la suite**. Le même code, sur un `.next`
purgé, passe en treize secondes. La preuve est venue des deux côtés — compiler
le code d'*avant* S39 échouait d'abord sur un type généré qui référençait encore
`/supervision/couts`, une route absente de ce code-là : le répertoire décrivait
un autre arbre que celui qu'on compilait.

**`npm run build` après un `npm run dev` demande donc de purger `.next`.** Les
deux écrivent au même endroit avec deux compilateurs différents, et le mélange
ne se voit pas — il produit une page qui s'affiche et dont une donnée manque.
