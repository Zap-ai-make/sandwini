# S22 — La caisse : journal du jour et clôture

```
Statut     : arbitrée — les six réponses sont rendues, le code peut commencer
Périmètre  : post-MVP
Dépend de  : S8 (ventes), S9 (versements), S11 (avances prestataires), S31 (la forme des écrans)
```

---

## Objectif

Permettre à celui qui tient le comptoir de **fermer sa journée** : voir ce qui
est entré et sorti, savoir combien d'espèces devraient se trouver dans le
tiroir, compter, et enregistrer l'écart s'il y en a un.

C'est la troisième pièce de l'argent, et la seule qui manque. S9 a posé
l'encaissement — chaque versement produit son mouvement. S24 a posé le mois —
ce que l'entreprise a produit. Entre les deux, personne ne peut répondre à la
question qu'on se pose à dix-neuf heures, rideau baissé : *est-ce que le compte
y est ?*

---

## Ce qui existe déjà, et qui n'est pas à refaire

**Les mouvements sont écrits depuis S8.** La collection `encaissements` est
alimentée par trois chemins, tous en place :

| Écrit par | Sens | Origine | Où |
|---|---|---|---|
| S8, à la vente | `entree` | `vente_moto` | `ventes.ts:414` |
| S9, à chaque versement | `entree` | `versement` | `ventes.ts:491` |
| S11, au dépôt chez un prestataire | `sortie` | `avance_prestataire` | `dossier.ts:82` |

Chaque document porte déjà `boutiqueId`, `date`, `sens`, `montant`,
`moyenPaiement`, `origine`, `origineRefId`, `libelle`, `categorieTranches` et sa
trace d'audit.

**Les règles sont déjà écrites, et elles disent l'essentiel**
(`firestore.rules:901`) : lecture et création pour qui peut vendre dans la
boutique, et **`update` et `delete` refusés à tout le monde**, avec le
commentaire qui annonce cette spec — « Une écriture de caisse ne se retouche
pas : on la contre-passe. S22. » C'est la contrainte structurante de ce lot, et
elle est déjà en vigueur.

**Ce qui n'existe pas :** aucun module de domaine, aucun dépôt, aucune lecture.
`/caisse` est un `EspaceAVenir` qui annonce S22. Personne n'a jamais lu un
encaissement.

---

## D'où vient la forme

`maquettes/c2-caisse.html`, validée par le commanditaire. Deux colonnes.

**À gauche, « Les mouvements »** — un tableau du jour : heure, pièce, nature,
qui, moyen, montant. Six lignes dans la maquette, dont une sortie sans pièce
(« Carburant groupe », −15 000) et deux moyens de paiement différents.

**À droite, « La clôture »** — quatre faits, un total, un champ, un bouton :

```
Fonds d'ouverture            50 000 FCFA
Espèces encaissées          707 000 FCFA
Sorties d'espèces           −15 000 FCFA
Orange Money                300 000 FCFA
─────────────────────────────────────────
Espèces attendues en caisse 742 000 FCFA

[ Espèces comptées : 742 000 ]
« Comptez avant de clôturer : l'écart est enregistré avec la clôture
  et ne se corrige plus après. »
```

Le sur-titre nomme la boutique — « Caisse · Pouytenga » — et la ligne d'aide dit
« ouverte à 08:00 par Ousmane Sawadogo ».

**Deux notions que la maquette introduit et que le modèle n'a pas** : le *fonds
d'ouverture* et les *espèces comptées*. Ni l'un ni l'autre ne se déduit des
encaissements. Ce sont elles qui font les questions ci-dessous.

**Une distinction que la maquette tient et qu'il faut tenir** : « Espèces
attendues en caisse » ne compte que les espèces. L'Orange Money est affiché,
parce qu'il faut le rapprocher du relevé de l'opérateur, mais il n'est pas dans
le tiroir et il ne se compte pas à la main.

---

## Les six questions, et ce qu'elles pesaient

Six questions, toutes posées avant la première ligne de code. Aucune n'était
technique : toutes portaient sur ce qu'est une journée de caisse dans cette
entreprise-là. **Les réponses sont à la section suivante** ; ce qui suit garde
les termes du choix, pour qu'on sache plus tard ce qui a été écarté et pourquoi.

### 1. Le fonds d'ouverture — reporté, ou saisi chaque matin ?

La maquette affiche 50 000 FCFA de fonds d'ouverture. D'où vient ce nombre ?

- **A — reporté de la veille.** La clôture d'hier laisse les espèces comptées
  dans le tiroir ; elles sont le fonds d'ouverture d'aujourd'hui. Rien à saisir,
  aucune occasion de se tromper, et la chaîne des journées se tient toute seule.
  Contrepartie : la première journée n'a pas de veille, et une journée non
  clôturée casse la chaîne (question 4).
- **B — saisi à l'ouverture.** Quelqu'un compte le tiroir le matin et l'inscrit.
  Plus fidèle si de l'argent entre ou sort hors de l'application le soir — mais
  c'est une saisie de plus chaque matin, et une saisie oubliée bloque l'écran.
- **C — un montant fixe, réglé une fois.** Le fonds de caisse est une constante
  de l'entreprise ; ce qui dépasse est remis au responsable chaque soir.

*Ma recommandation : A.* Elle demande le moins et se vérifie le mieux — deux
journées consécutives se rapprochent chiffre à chiffre. Mais c'est une question
d'organisation du comptoir, pas de logiciel.

### 2. Les dépenses hors activité — dans la caisse, ou pas ?

C'est le point ouvert n° 3 du cahier des charges, resté sans réponse. La
maquette tranche implicitement en montrant « Carburant groupe, −15 000 » : une
sortie sans pièce, sans vente derrière.

- **A — oui, avec un motif libre.** Le gérant saisit une sortie d'espèces, écrit
  pourquoi, et la caisse tombe juste le soir. Le modèle le permet déjà
  (`origine: 'depense'`). Sans cela, chaque billet sorti pour du carburant
  devient un écart inexpliqué à la clôture — et un écart qu'on s'habitue à voir
  est un écart qu'on ne regarde plus.
- **B — non.** La caisse ne suit que les flux liés à l'activité. Les dépenses
  sont tenues ailleurs, et les sorties d'espèces se retrouvent dans l'écart.

*Ma recommandation : A*, pour la raison ci-dessus. Elle ajoute un formulaire de
sortie, ce qui est le seul geste d'écriture de ce lot.

### 3. Qui clôture ?

- **A — le gérant de la boutique**, puisque c'est lui qui tient le tiroir. Le
  responsable lit les clôtures sans en faire.
- **B — le responsable seul.** Le gérant compte, le responsable valide.
- **C — les deux.**

*Ma recommandation : A.* Un geste de fin de journée qui attend quelqu'un d'autre
n'est pas fait le soir même, et une caisse comptée le lendemain ne prouve rien.

### 4. Une journée qu'on n'a pas clôturée — que se passe-t-il le lendemain ?

Le cas arrivera : coupure de courant, urgence, oubli.

- **A — on peut clôturer une journée passée**, tant qu'elle n'est pas clôturée.
  L'écran des journées non clôturées les liste et on les ferme dans l'ordre.
- **B — la journée se ferme toute seule** avec les espèces attendues, sans
  comptage, et l'écart est réputé nul. Simple, et faux : cela fabrique une
  vérification qui n'a pas eu lieu.
- **C — rien ne bloque**, on clôture aujourd'hui et hier reste ouverte à jamais.

*Ma recommandation : A*, et jamais B — une clôture est une affirmation de
quelqu'un, pas un calcul.

### 5. Un écart — simplement enregistré, ou faut-il l'expliquer ?

- **A — enregistré, sans plus.** L'écart est un fait, il est consultable, on en
  parle si besoin.
- **B — un motif obligatoire au-delà d'un seuil.** En dessous de, disons,
  1 000 FCFA, on n'ennuie personne ; au-delà, il faut écrire une phrase.

*Ma recommandation : B*, avec un seuil réglable comme le seuil d'inactivité des
tranches. Un écart qu'on peut valider sans rien dire cesse d'être une
information au bout de trois semaines.

### 6. Le responsable voit-il une caisse consolidée ?

La maquette nomme une boutique — « Caisse · Pouytenga ». Mais le responsable
travaille avec le périmètre « Toutes les boutiques ».

- **A — la caisse est toujours celle d'une boutique.** En périmètre entreprise,
  l'écran demande de choisir. Une caisse consolidée ne désigne aucun tiroir, et
  on ne compte pas trois tiroirs à la fois.
- **B — une lecture consolidée pour le responsable**, sans possibilité de
  clôturer : il voit les journées des trois boutiques côte à côte.

*Ma recommandation : A pour clôturer, B pour lire* — mais les deux ensemble
doublent l'écran, donc c'est un vrai arbitrage de coût.

---

## Ce que le commanditaire a tranché

**1. Le fonds d'ouverture — reporté de la clôture de la veille.** Rien à saisir
le matin. La chaîne des journées se tient toute seule, et deux journées
consécutives se rapprochent chiffre à chiffre.

**2. Les dépenses hors activité — la caisse les enregistre.** C'est la réponse
au point ouvert n° 3 du cahier des charges, resté sans réponse depuis le
début. Une sortie d'espèces se saisit avec son motif, et la caisse tombe juste
le soir au lieu de fabriquer un écart qu'on finirait par ne plus regarder.
C'est le seul geste d'écriture nouveau de ce lot.

**3. Le gérant clôture.** Celui qui tient le tiroir. Le responsable lit les
clôtures sans en faire.

**4. Une journée oubliée se ferme toute seule** — et c'est la réponse qui va
contre ma recommandation. Je l'avais écartée au motif qu'une clôture
automatique fabrique une vérification qui n'a pas eu lieu. Le commanditaire
tranche autrement, et la raison se comprend : rien ne doit bloquer le comptoir
le lendemain matin parce que quelqu'un est parti sans compter.

*Ce que cela oblige à écrire, pour que le choix ne devienne pas un mensonge
tranquille.* La journée se ferme avec les espèces attendues, sans comptage —
mais **l'écart n'est pas réputé nul, il est inconnu**, et la clôture le dit :
`especesComptees: null`, `ecart: null`, `cloturePar: "automatique"`. Trois
conséquences, toutes visibles :

- L'historique distingue les journées comptées de celles qui se sont fermées
  seules. Un responsable qui parcourt le mois voit lesquelles ont été
  vérifiées.
- La somme des écarts d'un mois n'inclut pas les journées non comptées. Un zéro
  s'additionnerait et dirait « tout allait bien » ; un inconnu s'exclut.
- Le fonds d'ouverture du lendemain, reporté d'une journée non comptée (réponse
  1), est un montant *attendu* et non *compté*. La ligne d'ouverture le dit.

C'est la réponse 4 telle qu'elle a été choisie — rien ne bloque, la journée se
ferme — sans la seule chose qui la rendrait fausse. Si vous préférez un écart
à zéro plutôt qu'inconnu, c'est une ligne à changer, et je la changerai.

**5. Un écart demande un motif** au-delà d'un seuil, réglable comme le seuil
d'inactivité des tranches. En dessous, on n'ennuie personne.

**6. La caisse est toujours celle d'une boutique.** En périmètre entreprise,
l'écran demande d'en choisir une. Une caisse consolidée ne désigne aucun
tiroir, et on ne compte pas trois tiroirs à la fois. Pas de lecture
consolidée : elle aurait doublé l'écran pour une question que S24 traite déjà
au mois.

---


## Conception

**Un document par journée et par boutique**, et non un agrégat entretenu :

```ts
cloturesCaisse/{boutiqueId}_{AAAA-MM-JJ} {
  boutiqueId, jour            // le jour local de l'appareil, cf. jourLocal
  fondsOuverture              // reporté de la clôture précédente (réponse 1)
  especesAttendues            // recalculé et figé au moment de clôturer
  especesComptees   | null    // null quand la journée s'est fermée seule
  ecart             | null    // comptées − attendues ; null si rien n'a été compté
  motif                       // obligatoire au-delà du seuil (réponse 5)
  cloturePar: 'gerant' | 'automatique'
  parMoyen: { especes, orange_money, moov_money, wave }
  clotureLe, clotureParNom, ...audit
}
```

`especesComptees` et `ecart` sont **nullables, et c'est le cœur de la
réponse 4** : une journée fermée sans comptage n'a pas un écart de zéro, elle
n'a pas d'écart du tout. Un zéro s'additionnerait sur un mois et dirait « tout
allait bien » ; un `null` s'exclut et laisse la question ouverte, ce qu'elle
est.

L'identifiant est composé, comme `boutiques/{code}` (D30) : deux clôtures du
même jour dans la même boutique sont structurellement impossibles, sans qu'aucune
règle ait à le vérifier.

**Le journal se calcule à la lecture** (D61), sur `encaissements` filtrés par
boutique et par jour. Aucun agrégat entretenu par déclencheur : ce qui se
recalcule à l'ouverture ne peut pas diverger de ce dont il est tiré. Les totaux
figés dans la clôture ne sont pas une seconde vérité mais **une affirmation
datée** — ce que quelqu'un a déclaré ce soir-là, qui doit rester lisible même si
un mouvement arrive en retard.

**Le jour est celui de l'appareil**, comme partout (`jourLocal`) : un gérant
ferme sa journée à dix-neuf heures locales, pas à l'heure d'un serveur.

**Hors ligne.** Le journal se lit depuis le cache. La clôture s'écrit sans
attendre l'accusé de réception (D76) — c'est un geste de comptoir. Le cas
tordu à traiter et à écrire : deux appareils qui clôturent la même journée hors
ligne. L'identifiant composé les fait entrer en collision, ce qui est le
comportement voulu ; reste à décider ce que voit le second (question ouverte à
la conception, pas au commanditaire).

**La fermeture automatique, et où elle vit.** Elle se déclenche à l'ouverture
de l'écran, sur l'appareil, et non par un déclencheur serveur — pour la même
raison que le jour est celui de l'appareil : c'est le comptoir qui sait qu'une
journée est finie, et un déclencheur qui fermerait à minuit UTC fermerait la
journée de Pouytenga à minuit moins deux. La règle : en ouvrant la caisse, toute
journée antérieure au jour courant qui porte des mouvements et pas de clôture est
fermée, `cloturePar: 'automatique'`. L'écran le dit en une ligne plutôt que de le
faire en silence.

**Les règles.** `cloturesCaisse` : lecture pour qui peut vendre dans la
boutique, création par le gérant de la boutique (réponse 3), **`update` et
`delete` refusés** — une clôture est une affirmation, pas un brouillon. Une
clôture automatique est créée par le même compte, donc rien à ouvrir de plus :
c'est bien cet appareil-là qui constate, et la règle n'a pas à connaître la
différence — seul le champ la porte.

`encaissements` accepte déjà `origine: 'depense'` dans son modèle ; il faudra
vérifier que `encaissementValide` le laisse effectivement passer, et ajouter le
test qui le prouve avant d'écrire le formulaire de sortie (réponse 2).

---

## Hors périmètre, et pourquoi

- **Les ventes de pièces** (`origine: 'vente_piece'`) : elles n'existeront qu'en
  S20/S21. La nature est prévue dans le modèle et la maquette en montre une —
  le journal les affichera le jour où elles seront écrites, sans changement ici.
- **La contre-passation d'un mouvement erroné.** Les règles l'annoncent, mais
  corriger un encaissement, c'est corriger la vente ou le versement qui l'a
  produit : c'est S25.
- **Les rapprochements avec les relevés Orange Money.** Le total est affiché
  pour qu'on le compare à la main ; l'importer est un autre métier.

---

## Ce qui prouvera que c'est fait

- Le journal d'une journée avec trois natures et deux moyens, lu hors ligne.
- Une sortie d'espèces saisie, retrouvée dans le journal et déduite des espèces
  attendues.
- Une clôture avec un écart : enregistrée, puis **non modifiable** — le test doit
  échouer à la réécrire, au niveau des règles et pas seulement de l'écran.
- Une journée laissée ouverte, retrouvée fermée seule le lendemain — **et son
  écart à `null`, pas à zéro**. C'est le test qui garde la réponse 4 honnête.
- Un écart au-dessus du seuil : la clôture est refusée sans motif.
- Un gérant d'une autre boutique qui ne voit ni le journal ni la clôture.
