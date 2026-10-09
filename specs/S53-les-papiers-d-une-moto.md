# S53 — Les papiers d'une moto : un seul endroit par papier

```
Statut     : à valider
Périmètre  : post-MVP
Dépend de  : S11 (dossier documents), S30 (dépôt prestataire), S43 (arrivages),
             S44 (vente en modale), S48 (la plaque quitte le dossier)
```

---

## Objectif

Le commanditaire, le 8 octobre 2026 : « *jusqu'à là c'est pas bien géré […]
actuellement tout est ambigu on comprend rien.* »

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

Les trois premiers tranchés le 8 octobre 2026, les trois suivants le 9. Ils sont
**tranchés**, pas pris par défaut.

| # | Question | Réponse |
|---|----------|---------|
| 1 | Qu'est-ce qui te gêne ? | **Trop de saisies pour la même carte**, le logiciel **ne suit pas le vrai circuit**, **trop d'écrans pour ça**. |
| 2 | La remise au prestataire ? | **Par paquet rendu en une fois.** « On tend dix cartes grises, il revient avec les dix. » |
| 3 | Dans quel ordre ? | **Les autres fonctionnalités d'abord**, puis une identification de bout en bout. Pas de suppression avant elle. |
| 4 | Qui fait foi pour le CMC ? | **La moto porte son CMC.** Le dossier le lit ; il ne reste qu'un geste au comptoir, « remise au client ». |
| 5 | La case « Carte grise » du comptoir ? | **Elle pilote le dossier.** Décochée, la carte grise naît « Sans objet » : rien à poursuivre. |
| 6 | Le paquet, comment ? | **C'est un objet.** Un prestataire, une date, une avance, ses dix motos — et le retour se fait en un geste pour les dix. |

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
- **La plaque reste dehors**, S48 ne se rejoue pas. On ferme seulement son trou.
- **Le groupe de cases « Types de documents »** de la fiche prestataire
  disparaît de l'écran : un choix à une seule option n'est pas un choix, c'est
  une saisie obligatoire déguisée.

---

## Ce que le modèle devient

Trois papiers, **trois mécanismes** — au lieu de trois lignes d'un même tableau.

| Papier | Sa nature | Où il vit, après | Ce que le dossier en stocke |
|--------|-----------|------------------|------------------------------|
| **Quittance** | elle arrive avec la moto | `motos.quittanceRecue` | la remise au client, et rien d'autre |
| **CMC** | une carte du tiroir du magasin | `motos.cmcRecu` *(existe déjà)* | la remise au client, et rien d'autre |
| **Carte grise** | un travail confié dehors | son cycle complet, dans un **paquet** | tout son cycle *(inchangé)* |

### La conséquence centrale : deux papiers perdent leur statut stocké

Pour la quittance et le CMC, le dossier **ne stocke plus d'étape**. Il stocke un
seul fait — *remis au client, le …* — et tout ce qui précède se **calcule à la
lecture** depuis la moto :

```
statut affiché = remis au client      si la remise est enregistrée
               = sans objet            si le document a été écarté
               = revenu au magasin     si la moto porte le papier
               = à faire               sinon
```

C'est D61 appliqué à la lettre : *rien n'est entretenu, tout se recompte à la
lecture*. Et c'est ce qui rend la contradiction **B** structurellement
impossible — non pas réparée, mais **inexprimable**. Un CMC qui arrive trois
jours après la vente fait changer l'écran du dossier sans qu'aucune écriture ne
soit faite sur le dossier.

La carte grise garde son statut stocké, et c'est voulu : elle a une vie dehors,
chez quelqu'un, que la moto ne connaît pas.

### La clôture ne change presque pas

La clôture demande *remis au client ou sans objet* pour les trois. Or la remise
est un **fait stocké** dans les deux nouveaux cas. La clôture n'a donc **jamais
besoin de lire la moto**, et le déclencheur `cloturerSiFini` garde exactement
sa surface actuelle. Sans cette propriété, il faudrait réveiller la clôture à
chaque case cochée sur un arrivage — un couplage qu'on ne veut pas.

### Le paquet ne remplace pas les champs du document : il les groupe

Les règles Firestore évaluent chaque document d'un lot contre l'état d'**avant**
le lot (la leçon de S5, redite en S17). Le document `carte_grise` qui passe à
`chez_prestataire` **ne peut donc pas** être validé contre un paquet créé dans
le même lot d'écriture.

Conséquence structurante : le paquet écrit malgré tout `prestataireId`,
`prestataireNom`, `deposeLe` et `avance` **sur chaque document**, comme
aujourd'hui. `depotRenseigne` reste vrai mot pour mot, les écrans de dossier
existants continuent de fonctionner, et le paquet n'est qu'une **couche de
regroupement** par-dessus un modèle qui tient déjà. C'est aussi ce qui rend
cette spec implémentable sans migration.

---

## Critères d'acceptation

### Le CMC et la quittance

- [ ] La fiche d'une moto dit si sa quittance et son CMC sont en main. Aujourd'hui elle ne le dit pas.
- [ ] La case se coche depuis la fiche de la moto **et** depuis l'inspection d'un lot. Les deux écrivent le même champ.
- [ ] Un arrivage compte ses quittances manquantes comme il compte déjà ses CMC manquants.
- [ ] Sur une vente dont la moto porte son CMC, le dossier affiche « Revenu au magasin » **sans qu'aucun geste n'ait été fait sur le dossier**.
- [ ] Cocher le CMC d'une moto **déjà vendue** fait avancer l'affichage de son dossier, en direct, sans écriture sur le dossier.
- [ ] Le seul geste restant au comptoir pour ces deux papiers est « Remettre au client ».
- [ ] Un dossier d'avant S53, dont le document porte `statut: 'remis_client'` sans `remisLe`, se lit toujours comme remis.

### La case du comptoir

- [ ] Décocher « Carte grise » à la vente ouvre le document à « Sans objet ». Le dossier se clôt sans geste supplémentaire.
- [ ] Le reçu et l'écran des dossiers disent la même chose sur la même vente. Un test le fige.
- [ ] Les règles Firestore acceptent `non_applicable` à la création pour la carte grise, et **refusent** toujours tout autre statut initial.

### Le paquet de cartes grises

- [ ] Depuis l'écran des dossiers, le gérant sélectionne plusieurs cartes grises à faire et les confie **en une fois** : un prestataire, une date, une avance, une date annoncée facultative.
- [ ] Le paquet se voit en une ligne : « 10 cartes grises chez Ouédraogo, depuis 12 jours ». Il porte le détail des châssis.
- [ ] Le retour se fait en **un geste** : les dix documents passent à « Revenu au magasin » ensemble.
- [ ] Un paquet se rend **partiellement** : huit revenues, deux encore dehors, sans que le paquet soit clos.
- [ ] L'avance sort de la caisse en **un seul** encaissement, pas en dix.
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

- [ ] La suite complète reste verte : unitaires, règles, déclencheurs, appelables.
- [ ] Le rendu est regardé en clair, en sombre et sur Pixel 7, **des deux rôles** — responsable et gérant.
- [ ] La palette et `.plaque-code` ne sont pas touchés. Un seul fichier CSS modifié serait un défaut de périmètre.

---

## Hors périmètre

- **S16 — le stock numéroté de CMC.** Plages de numéros, attribution d'une carte
  précise, interdiction de réattribuer. Cette spec pose le témoin « en main »
  sur la moto ; S16 viendra dire **laquelle**. Rien ici ne doit l'empêcher.
- **La plaque.** S48 l'a sortie du dossier, et l'arbitrage tient. On ferme son
  trou, on ne la réhabilite pas.
- **Les scans.** `quittanceChemin` et `cmcChemin` restent ce qu'ils sont : des
  pièces jointes, pas des étapes. D66 ne bouge pas.
- **Le portail prestataire (S15).** Le paquet est saisi par le magasin.
- **Toute suppression de données.** La préversion est jetable, mais c'est le
  décor que le commanditaire ouvre depuis son téléphone : on n'y efface rien
  sans le lui demander.

---

## Notes techniques

### Pourquoi aucune migration

`sandwini` est la **préversion**, pas la production : `DEPLOIEMENT.md` §4 dit ses
données jetables et sans vraies données clients. La production n'existe pas
encore.

Cette spec n'exige donc **aucune migration**, et c'est ce qui autorise le modèle
ci-dessus plutôt qu'un compromis. Les statuts stockés de `quittance` et `cmc`
deviennent des champs **lus, jamais écrits** — exactement le traitement que S44
a donné aux deux listes de texte libre d'avant elle. Un dossier ancien reste
lisible ; il n'est pas réécrit.

*Une ligne antérieure du ROADMAP affirmait le contraire — « une suppression
touche des données réelles sur `sandwini` ». Elle était fausse et a été
corrigée : l'argument aurait fait choisir un modèle plus timide pour une raison
inexistante.*

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

`dossierCloturable` et `dossierFini` (sa réplique dans `functions/`) ne changent
**pas** de signature, par la propriété établie plus haut. Si l'implémentation
découvre qu'il faut la moto pour clore, c'est que le modèle a dérivé : il faut
s'arrêter et revenir ici.

### Ce qui ne bouge pas

- `CHEMIN_PRESTATAIRE` et `CHEMIN_ARRIVE_FAIT` : la distinction entre *ce qui
  arrive déjà fait* et *ce qui passe par quelqu'un* est la bonne lecture du
  métier (D65). Elle est ce qui rend cette spec possible, pas ce qu'elle corrige.
- `depotRenseigne`, et l'avance strictement positive qui va avec.
- La réplique client/serveur de la machine à états (D27).
- `GestesDocument` reste le seul endroit qui propose un geste sur un document.

### Les preuves exigées

Un test de règles par refus, et nommément :

1. `plaque` refusé à la création d'un prestataire, accepté en modification.
2. `non_applicable` accepté à la création pour la carte grise seule.
3. Un gérant ne lit pas le paquet d'une autre boutique.
4. Le lot du paquet est atomique — un document retiré du lot fait tout échouer.
5. Un gérant ne peut pas faire revenir un paquet qu'il n'a pas déposé.

Et un test unitaire qui fige le calcul du statut affiché, **y compris le cas du
dossier ancien** sans `remisLe`.

Aucun de ces papiers ne touche au mur des coûts (D2) : rien ici ne s'approche
de `prive/`.
