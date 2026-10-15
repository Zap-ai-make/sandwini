# S53 — Les papiers d'une moto : un seul endroit par papier

```
Statut     : à valider (réécrite le 15 octobre 2026)
Périmètre  : post-MVP
Dépend de  : S11 (dossier documents), S30 (dépôt prestataire), S43 (arrivages),
             S44 (vente en modale), S48 (la plaque quitte le dossier)
Suivie de  : S56 (portail prestataire), qui lit ce que cette spec écrit
```

---

## Objectif

Le commanditaire, le 8 octobre 2026 : « *jusqu'à là c'est pas bien géré […]
actuellement tout est ambigu on comprend rien.* »

Le 15 octobre, devant l'écran : « *le modèle actuel est trop chargé, on doit
juste cocher par à faire, revenu au magasin… si on coche directement ça veut
dire que c'est revenu.* »

L'inventaire lui donne raison, et chiffre la raison : **le mot « carte »
désigne sept choses différentes** dans le produit, et rien ne les relie. Trois
d'entre elles suivent la même carte à deux endroits qui ne se parlent jamais.

Cette spec ne retire pas des écrans : elle répare le modèle. Après elle,
**chaque papier a un seul endroit où il vit**, et les écrans n'en sont que des
lecteurs.

---

## L'inventaire, au 9 octobre 2026

Sept endroits, un seul mot.

| Où | Ce que ça veut dire | Posé par |
|----|---------------------|----------|
| `motos.papiersFournis` | une liste de texte libre, **occasion seulement** | S4 |
| `motos.quittanceChemin`, `motos.cmcChemin` | deux scans dans Storage | S11 |
| `motos.cmcRecu` | une case : la carte est-elle dans le tiroir ? | S43 |
| `ventesMotos/{id}/documents/{quittance,cmc,carte_grise}` | trois documents, cinq statuts, deux parcours | S11, S30 |
| `ventesMotos/{id}.carteGrise` | une case au comptoir : « part avec la moto » | S44 |
| `prestataires.typesDocuments` | une énumération **à une seule valeur** | S30, amputée en S48 |
| `.plaque-code`, `BandeauEtat` | la métaphore visuelle du produit | S28 |

Le septième n'est pas une donnée : c'est la palette, née de la plaque jaune.
Il explique pourquoi `grep plaque` rend une centaine de fichiers. **Toute
suppression doit l'exclure explicitement** — sinon on enlève le design en
croyant enlever une fonctionnalité.

Et `lib/domain/moto.test.ts` fige le symptôme noir sur blanc : le test de
`papiersFournis` prend **« Carte grise »** comme exemple de texte libre. Le même
papier est donc une chaîne tapée à la main *et* un document à cycle, dans deux
fichiers voisins.

### Les trois contradictions, mesurées

**A — La case du comptoir ne parle pas au dossier.**
`lib/repositories/ventes.ts:410-421` ouvre les **trois** documents à `a_faire`,
sans condition. Décocher « Carte grise » dans la modale de vente n'a donc aucun
effet : le reçu imprime « Carte grise — non inclus » (`components/Recu.tsx:321`)
pendant que le dossier réclame une carte grise à faire, et **bloque la clôture**
jusqu'à ce que quelqu'un la passe à « Sans objet » à la main. Deux documents du
même logiciel se contredisent sur la même vente.

**B — Le CMC est suivi deux fois, et les deux ne se recoupent jamais.**
`motos.cmcRecu` dit « la carte est là ». Le document `cmc` du dossier dit « à
faire → revenue au magasin → remise au client ». Aucun lien : `cmcRecu`
n'apparaît dans aucun fichier de vente, de dossier ou de Cloud Function. Une
moto dont le CMC a été coché à l'arrivage ouvre quand même un document `cmc` à
`a_faire`, qu'il faut repromener à la main. C'est littéralement la « trop de
saisies pour la même carte » du commanditaire.

Pire pour le gérant : `cmcRecu` ne se voit que dans `InspecterLotModal` et sur
le bordereau du lot. **La fiche de la moto ne le montre pas.** Ouvrir une moto
ne dit pas si sa carte est au magasin.

**C — L'amputation de la plaque (S48) a laissé un trou.**
`firestore.rules:303` accepte encore `plaque` **à la création** d'un
prestataire, et pas seulement en modification — le commentaire ne prévoyait que
le second cas. Or `lib/repositories/prestataires.ts:38` jette les types inconnus
à la lecture. Un prestataire portant `plaque` seule se lit donc avec une liste
**vide** : l'écran des paramètres affiche « Aucun type de document », et
`GestesDocument.tsx:177` ne le proposera jamais pour une carte grise. Il est
dans la base, visible, et inutilisable.

### Ce qui manque franchement

`prompt.md` §13 dit que le CMC **est un stock physique numéroté** détenu par le
magasin. S16 — plages de numéros, attribution à une vente, « un CMC attribué ne
se réattribue pas » — n'a jamais été fait. Le produit traite donc le CMC comme
un simple statut, alors que c'est un objet qu'on prend dans un carnet. C'est
probablement l'origine de la sensation que « ça ne suit pas le vrai circuit ».

**S16 reste hors périmètre** (voir plus bas), mais cette spec doit lui laisser
la place sans la lui voler.

---

## Les arbitrages du commanditaire

Les trois premiers tranchés le 8 octobre 2026, les trois suivants le 9, les
quatre derniers le 15. Ils sont **tranchés**, pas pris par défaut.

| # | Question | Réponse |
|---|----------|---------|
| 1 | Qu'est-ce qui te gêne ? | **Trop de saisies pour la même carte**, le logiciel **ne suit pas le vrai circuit**, **trop d'écrans pour ça**. |
| 2 | La remise au prestataire ? | **Par paquet.** « On tend dix cartes grises. » |
| 3 | Dans quel ordre ? | **Les autres fonctionnalités d'abord**, puis une identification de bout en bout. |
| 4 | Qui fait foi pour le CMC ? | **La moto porte son CMC.** Le dossier le lit. |
| 5 | La case « Carte grise » du comptoir ? | **Elle pilote le dossier.** Décochée, la carte grise naît « Sans objet ». |
| 6 | Le paquet, comment ? | **C'est un objet.** Un prestataire, une date, une avance, ses dix motos. |
| 7 | Combien d'étapes par papier ? | **Une case** pour la quittance et le CMC : cochée = revenu au magasin. **Deux** pour la carte grise : partie chez le prestataire, revenue. |
| 8 | Et « remis au client » ? | **Il quitte le dossier.** Il devient, sur la vente, *ce que le client a emporté* — quittance et CMC seulement : « la carte grise n'est jamais disponible à l'achat ». |
| 9 | Le retour d'un paquet ? | **Partiel par défaut.** « Il peut partir avec 10 et ramener 5 si c'est ce qui est dispo. » |
| 10 | La plaque ? | **Elle revient**, saisie sur la fiche de vente au retour de la carte grise. S48 est rejouée. |
| 11 | Les dossiers déjà saisis ? | **Table rase.** Rien à migrer, rien à faire cohabiter. |

### Ce que l'arbitrage 4 entraîne, et qui n'a pas été demandé

Le commanditaire a tranché pour le **CMC**. La quittance a exactement la même
nature — elle arrive avec la moto, elle se remet au client — mais elle n'a pas
de témoin « en main » aujourd'hui : seul le document du dossier la suit.

Ne déplacer que le CMC laisserait **deux des trois papiers du même écran se
comporter différemment**, ce qui aggraverait précisément le « on comprend
rien ». La spec traite donc les deux de la même façon, et c'est une extension
assumée de l'arbitrage, à refuser au moment de la relecture si elle ne convient
pas.

### Ce qui n'a pas été demandé et qui est tranché ici

- **`papiersFournis` reste**, mais change d'intitulé à l'écran. C'est une note
  du vendeur sur une occasion, pas un document du dossier ; le mot « papiers »
  nu est ce qui le fait confondre avec eux.
- **Le groupe de cases « Types de documents »** de la fiche prestataire
  disparaît de l'écran : un choix à une seule option n'est pas un choix, c'est
  une saisie obligatoire déguisée.

### Une question laissée ouverte à la relecture

L'arbitrage 7 donne **deux** gestes à la carte grise : partie, revenue. Il n'en
donne pas un troisième pour sa remise au client. Cette spec en tire que **le
retour au magasin est le terme du parcours** de la carte grise, et que la preuve
de ce retour est le scan et la plaque saisis sur la fiche de vente.

Si le commanditaire veut aussi tracer le moment où la carte grise **quitte** le
magasin pour le client, c'est une case de plus à poser, et il faut le dire
maintenant : l'ajouter plus tard rouvrirait la clôture.

---

## Ce que le modèle devient

Trois papiers, **trois mécanismes** — au lieu de trois lignes d'un même tableau.

| Papier | Sa nature | Où vit sa disponibilité | Où vit sa remise |
|--------|-----------|-------------------------|------------------|
| **Quittance** | elle arrive avec la moto | `motos.quittanceRecue` *(à créer)* | la vente |
| **CMC** | une carte du tiroir du magasin | `motos.cmcRecu` *(existe déjà)* | la vente |
| **Carte grise** | un travail confié dehors | son cycle, dans un **paquet** | — (le retour est le terme) |

### La conséquence centrale : le dossier ne stocke presque plus rien

Pour la quittance et le CMC, le dossier **ne stocke plus aucune étape**. Il ne
garde qu'un fait : *ce document est sans objet pour cette vente*. Tout le reste
se **calcule à la lecture** :

```
statut affiché = sans objet          si le document a été écarté
               = remis au client     si la vente le porte dans « emporté »
               = au magasin          si la moto porte le papier
               = à faire             sinon
```

C'est D61 appliqué à la lettre : *rien n'est entretenu, tout se recompte à la
lecture*. Et c'est ce qui rend la contradiction **B** structurellement
impossible — non pas réparée, mais **inexprimable**. Un CMC qui arrive trois
jours après la vente fait changer l'écran du dossier sans qu'aucune écriture ne
soit faite sur le dossier.

La carte grise garde son statut stocké, et c'est voulu : elle a une vie dehors,
chez quelqu'un, que la moto ne connaît pas.

### Ce que la vente gagne

```
ventesMotos/{id}
  emporte: { quittance: boolean, cmc: boolean }   ← ce que le client a pris
  carteGriseChemin: string | null                 ← le scan, au retour
```

```
motos/{id}
  quittanceRecue: boolean    ← à créer, en face de cmcRecu
  plaque: string | null      ← à créer, saisie depuis la fiche de vente
```

**La plaque est rangée sur la moto, pas sur la vente**, et c'est un choix. Une
plaque appartient à l'engin : elle lui survit à la revente, et l'inventaire
pourra l'afficher sans rouvrir une vente. La **saisie**, elle, reste sur la
fiche de vente, où le gérant se trouve au moment où la carte grise revient.

### La clôture

Un dossier se ferme quand les trois papiers ont fini :

| Papier | Fini quand |
|--------|------------|
| Quittance | sans objet, **ou** emportée par le client |
| CMC | sans objet, **ou** emporté par le client |
| Carte grise | sans objet, **ou** revenue du prestataire |

La clôture lit donc la **vente** et les **documents**, jamais la moto. Sans
cette propriété, il faudrait réveiller la clôture à chaque case cochée sur un
arrivage — un couplage qu'on ne veut pas.

**Aucun nouveau déclencheur n'est nécessaire**, et une version antérieure de
cette spec se trompait en en annonçant un. `cloturerSurVente` existe depuis S11
et se déclenche sur **toute** écriture de `ventesMotos/{venteId}` : écrire
`emporte` le réveille déjà. Seul le corps de `dossierFini` change.

### Le paquet groupe le départ, jamais le retour

Arbitrage 9 : « il peut partir avec 10 et ramener 5 si c'est ce qui est dispo ».

Le paquet est donc un **objet de dépôt** : il dit qui est parti avec quoi, quel
jour, contre quelle avance. Le retour, lui, se fait carte par carte — ou par
sélection de plusieurs d'un coup, ce qui est la même écriture répétée et non un
geste sur le paquet.

Un paquet n'a pas d'état « rendu » : il est **soldé quand aucune de ses cartes
n'est plus dehors**, ce qui se calcule. Lui donner un état stocké rouvrirait la
contradiction B sous un autre nom.

### Le paquet ne remplace pas les champs du document : il les groupe

Les règles Firestore évaluent chaque document d'un lot contre l'état d'**avant**
le lot (la leçon de S5, redite en S17). Le document `carte_grise` qui passe à
`chez_prestataire` **ne peut donc pas** être validé contre un paquet créé dans
le même lot d'écriture.

Conséquence structurante : le paquet écrit malgré tout `prestataireId`,
`prestataireNom`, `deposeLe` et `avance` **sur chaque document**, comme
aujourd'hui. `depotRenseigne` reste vrai mot pour mot, les écrans de dossier
existants continuent de fonctionner, et le paquet n'est qu'une **couche de
regroupement** par-dessus un modèle qui tient déjà.

---

## Critères d'acceptation

### Le CMC et la quittance

- [ ] La fiche d'une moto dit si sa quittance et son CMC sont en main. Aujourd'hui elle ne le dit pas.
- [ ] La case se coche depuis la fiche de la moto **et** depuis l'inspection d'un lot. Les deux écrivent le même champ — pas deux champs synchronisés.
- [ ] Un arrivage compte ses quittances manquantes comme il compte déjà ses CMC manquants.
- [ ] Sur une vente dont la moto porte son CMC, le dossier affiche « Au magasin » **sans qu'aucun geste n'ait été fait sur le dossier**.
- [ ] Cocher le CMC d'une moto **déjà vendue** fait avancer l'affichage de son dossier, en direct, sans écriture sur le dossier.
- [ ] Le seul geste restant au comptoir pour ces deux papiers est de dire que le client les a emportés — et il se fait **sur la vente**.

### Ce que le client a emporté

- [ ] La fiche de vente porte deux cases : quittance emportée, CMC emporté. La carte grise n'y figure pas.
- [ ] Une case ne se coche pas tant que la moto ne porte pas le papier : on ne remet pas ce qu'on n'a pas.
- [ ] Le reçu dit la même chose que la fiche. Un test le fige.

### La case du comptoir

- [ ] Décocher « Carte grise » à la vente ouvre le document à « Sans objet ». Le dossier se clôt sans geste supplémentaire.
- [ ] Le reçu et l'écran des dossiers disent la même chose sur la même vente. Un test le fige.
- [ ] Les règles Firestore acceptent `non_applicable` à la création pour la carte grise, et **refusent** toujours tout autre statut initial.

### La carte grise, son scan et sa plaque

- [ ] La fiche de vente permet d'envoyer le scan de la carte grise, par le mécanisme des scans existants (D66 inchangé).
- [ ] La fiche de vente porte un champ « Numéro de plaque », saisi au retour. Il écrit `motos.plaque`.
- [ ] La plaque se relit sur la fiche de la moto et dans l'inventaire.
- [ ] Un test de règles prouve qu'un gérant écrit la plaque d'une moto de sa boutique, et d'aucune autre.

### Le paquet de cartes grises

- [ ] Depuis l'écran des dossiers, le gérant sélectionne plusieurs cartes grises à faire et les confie **en une fois** : un prestataire, une date, une avance, une date annoncée facultative.
- [ ] Le paquet se voit en une ligne : « 10 cartes grises chez Ouédraogo, depuis 12 jours ». Il porte le détail des châssis.
- [ ] **Le retour est partiel par défaut** : cinq revenues, cinq encore dehors, et le paquet reste ouvert sans qu'aucun geste ne le dise.
- [ ] Un paquet dont toutes les cartes sont revenues est **soldé par calcul**, jamais par un champ.
- [ ] L'avance sort de la caisse en **un seul** encaissement, pas en dix. Elle se range dans un poste de dépense (S55).
- [ ] Le nombre de cartes par paquet est **borné**, la borne est nommée, et le dépassement est refusé par un message qui dit la borne.
- [ ] Tout est atomique : ou le paquet et ses documents partent ensemble, ou rien ne part.
- [ ] Un test de règles prouve qu'un gérant ne lit ni n'écrit le paquet d'une autre boutique.

### Le trou de S48

- [ ] Les règles **refusent** `plaque` à la **création** d'un prestataire, et continuent de l'accepter en modification pour que les fiches anciennes restent corrigeables. Un test de règles fige les deux.
- [ ] Un prestataire dont les types se lisent vides est **signalé** à l'écran au lieu d'afficher « Aucun type de document » sans conséquence visible.
- [ ] Le groupe de cases « Types de documents » quitte le formulaire ; le type est posé implicitement.

### Le vocabulaire

- [ ] « Papiers fournis » change d'intitulé pour ne plus se confondre avec les documents du dossier.
- [ ] Aucun exemple de test ne prend « Carte grise » comme valeur de texte libre.
- [ ] Un paragraphe de `DECISIONS.md` nomme les sept emplois du mot et dit lequel survit. Sans lui, la confusion repousse.

### Ce qui ne doit pas casser

- [ ] La suite ciblée reste verte : unitaires, règles, et les fichiers e2e des dossiers, des ventes et des arrivages. **Pas de passe complète** — elle dure plus d'une heure et rend des verdicts d'outillage.
- [ ] Le rendu est regardé en clair, en sombre et sur Pixel 7, **des deux rôles** — responsable et gérant.
- [ ] La palette et `.plaque-code` ne sont pas touchés. Un seul fichier CSS modifié serait un défaut de périmètre.

---

## Hors périmètre

- **S16 — le stock numéroté de CMC.** Plages de numéros, attribution d'une carte
  précise, interdiction de réattribuer. Cette spec pose le témoin « en main »
  sur la moto ; S16 viendra dire **laquelle**. Rien ici ne doit l'empêcher.
- **Le portail prestataire.** Il fait l'objet de S56, et il **lit** ce que cette
  spec écrit. S53 passe en premier.
- **Les scans de quittance et de CMC.** `quittanceChemin` et `cmcChemin` restent
  ce qu'ils sont : des pièces jointes, pas des étapes. Seul le scan de la carte
  grise s'ajoute, parce qu'il est la preuve d'un retour.

---

## Notes techniques

### La table rase, et ce qu'elle autorise

`sandwini` est la **préversion**, pas la production : `DEPLOIEMENT.md` §4 dit ses
données jetables et sans vraies données clients. La production n'existe pas
encore.

Le commanditaire a tranché la table rase le 15 octobre. Cette spec n'exige donc
**aucune migration ni aucune compatibilité ascendante** — c'est ce qui autorise
le modèle ci-dessus plutôt qu'un compromis à deux lectures.

**La suppression elle-même n'est pas dans cette spec.** C'est une opération
sensible sur le décor que le commanditaire ouvre depuis son téléphone : elle se
redemande au moment de la faire, elle se fait collection par collection, et elle
se dit avant de se lancer.

### Le paquet, en Firestore

Une collection de premier niveau, `lotsCartesGrises/{id}`, sur le modèle de
`transfertsMotos` (S17) : une trace de premier niveau se lit par les deux
boutiques concernées et se liste sans requête de groupe de collections.

Elle porte `boutiqueId`, le prestataire (identifiant **et** nom recopié, pour
qu'une ligne se lise sans rouvrir une fiche), les dates, l'avance, et la liste
des ventes concernées. La borne du nombre de cartes vient de la limite de 500
écritures d'un lot Firestore : un paquet écrit `1 + N` documents plus
l'encaissement de l'avance. La borne sera donc **nommée et justifiée par ce
calcul**, pas choisie au hasard.

### Les signatures du domaine qui bougent

`dossiersEnAttente` reçoit aujourd'hui les ventes et les documents. Pour
calculer l'état de la quittance et du CMC à la lecture, elle recevra aussi les
**motos** des ventes listées.

**C'est le vrai coût de ce modèle, et il faut le dire :** l'écran des dossiers
ne charge **pas** les motos aujourd'hui — il renvoie vers l'écran des ventes
quand on veut la moto. Il faudra donc une écoute de plus. La forme retenue est
l'écoute des motos de la boutique, celle que l'écran du stock utilise déjà :
une moto vendue reste dans la collection avec `statut: 'vendue'`, le périmètre
est le même, et on évite un `where(documentId(), 'in', …)` borné à trente qui
casserait dès le trente-et-unième dossier ouvert.

Si cette écoute s'avère coûteuse à l'usage, le repli est de n'afficher l'état
calculé que sur la **fiche de la vente** — où la moto est déjà chargée — et de
laisser la file des dossiers ne montrer que ce qu'elle stocke. À décider sur
mesure, pas par principe.

### Ce qui ne bouge pas

- `CHEMIN_PRESTATAIRE` : la carte grise garde son cycle stocké. `CHEMIN_ARRIVE_FAIT`,
  lui, **disparaît** — ses deux documents n'ont plus d'étapes à parcourir.
- `depotRenseigne`, et l'avance strictement positive qui va avec.
- La réplique client/serveur de la machine à états (D27).
- `GestesDocument` reste le seul endroit qui propose un geste sur un document.

### Les preuves exigées

Un test de règles par refus, et nommément :

1. `plaque` refusé à la création d'un prestataire, accepté en modification.
2. `non_applicable` accepté à la création pour la carte grise seule.
3. Un gérant ne lit pas le paquet d'une autre boutique.
4. Le lot du paquet est atomique — un document retiré du lot fait tout échouer.
5. Un gérant n'écrit pas `emporte` sur la vente d'une autre boutique.
6. Un gérant n'écrit pas la plaque d'une moto d'une autre boutique.

Et un test unitaire qui fige le calcul du statut affiché, pour les quatre
branches de la table ci-dessus.

Aucun de ces papiers ne touche au mur des coûts (D2) : rien ici ne s'approche
de `prive/`.
