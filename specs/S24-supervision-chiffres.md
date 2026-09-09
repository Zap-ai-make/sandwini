# S24 — La supervision et ses chiffres

```
Statut     : en cours — trois arbitrages rendus, trois pris par défaut et signalés
Périmètre  : post-MVP
Dépend de  : S9 (versements), S11 (dossiers), S31 (la forme des écrans)
```

---

## Objectif

Donner au responsable les deux choses que la supervision promet depuis D63 et
qu'elle n'a jamais tenues : **ce que chaque boutique pèse**, sur sa carte, et
**ce que le mois a produit**, sur un écran à part.

C'est la seconde moitié de la mise en conformité. La première (S31) a repris la
forme ; celle-ci remplit ce que la forme réservait. Les huit « manques de
données » de `AUDIT-CONFORMITE-MAQUETTES.md` s'y rattachent presque tous.

---

## D'où vient cette spec

`a2-supervision.html` porte deux choses que le produit n'a pas :

- **A2.3** — chaque carte de boutique annonce *Motos en stock*, *Ventes ce
  mois*, *Reste dû* (`a2:90-116`).
- **A2.2** — un bouton « Voir les chiffres » en tête d'écran (`a2:86`), qui
  ouvre `c3-supervision-chiffres.html`.

`c3` montre quatre chiffres du mois — motos vendues, encaissé, marge brute,
restant dû —, puis deux répartitions en barres : par boutique, par mode de
paiement. Il porte son propre ruban : *« Ces chiffres relèvent de la spec S24.
Ils ne sont pas encore calculés par l'application. »*

**Ce que D63 exigeait avant d'en arriver là.** « La supervision est une
section, pas un tableau de bord ; aucune carte à zéro. » Cette spec ne renverse
pas D63, elle en remplit la condition : les cartes cessent d'être à zéro parce
que les chiffres existent enfin. La règle « pas de zéro affiché » reste, et
c'est la question 6 ci-dessous.

---

## Ce que je ne tranche pas seul

Six questions. Les trois premières changent ce que les chiffres *veulent dire*,
et aucune n'a de bonne réponse technique — ce sont des choix de gestion.

### 1. La marge d'une vente en tranches, au mois de la vente ou au fil de l'argent ?

Une moto à 830 000 achetée 650 000 dégage 180 000 de marge. Vendue en tranches
le 5 septembre, le client a versé 150 000 ce jour-là et versera le reste sur
six mois.

- **A — la marge entière en septembre.** La vente est faite, la marge est
  acquise, le mois qui l'a produite la porte. C'est la lecture comptable, et
  c'est ce que `figerMargeVente` écrit déjà : une marge figée à la vente.
- **B — la marge au prorata de l'encaissé.** 150 000 sur 830 000 encaissés,
  donc 18 % de la marge en septembre, le reste au fil des versements. C'est la
  lecture de trésorerie : la marge suit l'argent réellement entré.

**Ce que ça change.** En A, un mois de tranches affiche une marge que le
magasin n'a pas encore touchée — et si le client cesse de payer, ce mois-là
restera faux. En B, la marge d'un mois ne dit plus ce que ce mois a vendu, et
deux ventes identiques comptent différemment selon la ponctualité des clients.

**Ce que je ferais**, si vous me laissez trancher : **A**, parce que la marge
est déjà figée à la vente dans la base et qu'un chiffre qui se recalcule
rétroactivement quand un client paie en retard est un chiffre qu'on ne peut pas
citer deux fois de suite. Mais c'est votre commerce, pas ma comptabilité.

### 2. « Restant dû » totalise-t-il les crédits et les tranches ?

La maquette le fait dans sa quatrième carte — *« FCFA · crédits et tranches »*
(`c3:104`) — et **dit le contraire deux blocs plus bas** : *« "Crédit" et
"tranches" ne se totalisent pas ensemble : dans un cas le client doit de
l'argent au magasin, dans l'autre le magasin détient de l'argent et retient la
moto »* (`c3:166`).

Elle a raison la seconde fois. Un crédit est une créance : la moto est partie,
l'argent manque. Une tranche est un dépôt : la moto est au magasin, l'argent
est là. Les additionner produit un nombre qui ne désigne rien.

- **A — une carte, deux lignes** : « Créances 5 170 000 · Dépôts 2 000 000 ».
- **B — deux cartes distinctes**, et la quatrième place va à autre chose.
- **C — on garde le total**, en assumant que le responsable sait ce qu'il lit.

**Ce que je ferais : A.** La carte garde sa place dans la grille de quatre, et
les deux nombres ne se confondent plus.

### 3. « Encaissé » compte-t-il les avances de dossier ?

Un dossier porte une `avance` : ce que le magasin verse au prestataire pour la
carte grise. C'est de l'argent qui **sort**. La carte « Encaissé » compte
aujourd'hui, dans la maquette, « tous moyens confondus » — sans dire si c'est
brut ou net.

- **A — encaissé brut** : la somme des versements clients, rien d'autre. Les
  avances sont une dépense, elles ne se soustraient pas d'un encaissement.
- **B — net des avances** : ce qui reste réellement en caisse.

**Ce que je ferais : A.** « Encaissé » nomme une entrée d'argent ; en retrancher
une sortie donnerait un solde, qui est le sujet de la caisse (S22). Mélanger les
deux ferait un troisième chiffre qui n'est ni l'un ni l'autre.

### 4. Le sélecteur de mois : jusqu'où remonte-t-il ?

La maquette pose un bouton « Septembre 2026 » avec un chevron (`c3:83`). Il faut
décider ce qu'il ouvre.

- **A — les douze derniers mois**, liste simple.
- **B — mois par mois sans limite**, avec deux flèches.
- **C — le mois en cours et le précédent seulement**, ce que la carte
  « 38 en août » suppose déjà.

**Ce que je ferais : A.** Douze mois couvrent la comparaison annuelle, tiennent
dans une liste qu'on lit d'un coup, et bornent ce qu'il faut garder en mémoire.

### 5. Le gérant voit-il des chiffres ?

`c3` est un écran de supervision, donc du responsable. Mais un gérant a une
question légitime : *combien ai-je vendu ce mois-ci*. Aujourd'hui son accueil
ne le dit pas.

- **A — rien pour l'instant.** S24 sert le responsable ; le gérant garde sa file
  de travail. Une spec ultérieure lui donnera sa propre vue s'il la demande.
- **B — les mêmes chiffres, bornés à sa boutique**, marge exclue — elle est
  cloisonnée en base, il ne l'a simplement pas (D2).

**Ce que je ferais : A**, et je note B au backlog. Le gérant n'a rien demandé,
et un écran de chiffres sur l'accueil d'un comptoir concurrence le geste du
jour.

### 6. Un mois sans rien : que montre l'écran ?

D63 interdit la carte à zéro. Sur une installation neuve, ou un mois sans
vente, les quatre cartes valent zéro.

- **A — l'écran l'écrit en une phrase** et ne dessine aucune carte : « Aucune
  vente enregistrée en septembre 2026. »
- **B — les cartes s'affichent à zéro**, puisque ici un zéro est une
  information : ce mois-là, rien n'est sorti.

**Ce que je ferais : A pour un mois vide en entier** — quatre zéros alignés
n'apprennent rien qu'une phrase ne dise mieux — **et B dès qu'un seul chiffre
est non nul**, sinon la grille se troue et l'œil cherche ce qui manque.

---

## Critères d'acceptation

Un commit par sujet, la maquette ouverte à côté du rendu.

- [ ] **Les cartes de boutique annoncent trois chiffres** — motos en stock,
      ventes du mois, reste dû —, calculés depuis les collections déjà lues
      (A2.3, `a2:93-97`). La ligne d'alerte posée en S31 reste dessous.
- [ ] **« Voir les chiffres » ouvre l'écran du mois** depuis la tête de la
      supervision (A2.2, `a2:86`).
- [ ] **Les quatre chiffres du mois**, dans la forme de `c3:89-116` : nom,
      valeur, détail. La comparaison au mois précédent figure sous « Motos
      vendues ».
- [ ] **La marge n'existe que pour le responsable** — pas masquée par l'écran :
      absente de ce qu'un gérant peut lire (D2, et `ventesMotos/{id}/prive/`
      dont les règles refusent la lecture à tout autre).
- [ ] **Les deux répartitions en barres** — par boutique, par mode de paiement
      (`c3:118-172`), avec la phrase qui sépare crédit et tranches.
- [ ] **Le sélecteur de mois** change tout l'écran, et le sur-titre le dit.
- [ ] **Les états** : chargement, erreur de lecture, mois vide (`DESIGN.md` §10).
- [ ] **Tout se calcule hors ligne**, sur les collections en cache. Un mois déjà
      consulté se relit sans réseau.
- [ ] `npm test` vert. Les calculs d'agrégat sont des fonctions pures, testées
      unitairement — chaque question tranchée ci-dessus devient un test qui la
      fige.
- [ ] Captures **ouvertes et regardées** : l'écran plein, un mois vide, la
      supervision avec ses cartes, en clair et en sombre, à 1440 et sur Pixel 7.
- [ ] `specs/ROADMAP.md` et `DECISIONS.md` à jour.

---

## Hors périmètre

- **La caisse et sa clôture** (S22). « Encaissé » compte ce qui est entré ; ce
  qui reste en caisse après les sorties est un autre sujet, et un autre écran.
- **L'export.** Aucun bouton « exporter » : le besoin n'a pas été formulé, et un
  format de fichier se choisit avec celui qui l'ouvrira.
- **Les graphiques dans le temps.** Les barres de `c3` comparent des parts à un
  instant, pas des courbes sur douze mois. Une courbe demanderait de décider ce
  qu'elle lisse.
- **Les chiffres des pièces détachées** (S20, S21) : l'espace n'existe pas.

---

## Notes techniques

**Les agrégats se calculent à la lecture, pas par déclencheur.** C'est la même
décision qu'au reçu (D61) et pour la même raison : ce qui se recalcule à
l'ouverture ne peut pas diverger de ce dont il est tiré, et surtout il continue
de fonctionner hors ligne. Un document d'agrégat entretenu par Cloud Function
serait moins cher à lire, mais il exigerait le réseau pour être à jour et
mentirait silencieusement le jour où un déclencheur échoue.

**Le volume le permet, et c'est chiffré.** Trois boutiques, environ 45 motos
par mois d'après la maquette : 540 ventes par an, 2 700 sur cinq ans, avec
leurs versements. Les collections sont déjà lues entières par les écrans
existants (`ecouterVentes`, `ecouterVersementsDuPerimetre`). S24 n'ajoute aucune
écoute : elle ajoute un `useMemo` sur ce qui est déjà là.

**Le seuil où cette décision cesse d'être bonne** doit être écrit maintenant,
pas découvert plus tard : au-delà de ~20 000 ventes, une lecture complète
devient sensible sur un téléphone d'entrée de gamme. Le jour où le premier
écran dépasse deux secondes de calcul, c'est le signe de passer à des agrégats
mensuels figés — et non un moment pour improviser.

**La marge reste cloisonnée.** Elle vit dans `ventesMotos/{id}/prive/marge`, que
les règles réservent au responsable. La lire demande donc une écoute distincte,
qu'un gérant ne déclenche jamais — sans quoi il récolterait un refus rouge pour
un chiffre qu'il n'affichera pas. Même montage que `useCeQuiAttend`, qui ne
s'abonne pas sans périmètre (D7).

**Le mois est celui de l'appareil.** `jourLocal` (`lib/domain/recu.ts:227`)
porte déjà cette règle et sa raison : un gérant travaille des journées entières
sans réseau, et « ce mois-ci » doit vouloir dire ce mois-ci pour lui, pas pour
un serveur. Le découpage mensuel s'écrit sur le même modèle.

**Une vente d'août encaissée en septembre compte dans les deux mois**, à des
cartes différentes : « Motos vendues » suit la date de vente, « Encaissé » suit
la date du versement. Ce n'est pas une incohérence, c'est ce que les deux
chiffres mesurent — et l'écran l'écrit sous les cartes, une fois.

---

## Ce que le commanditaire a tranché

**1. La marge — réponse A.** Entière au mois de la vente. La marge est acquise
quand la vente est faite ; c'est déjà ce que `figerMargeVente` écrit dans la
base, et un chiffre qui se recalcule rétroactivement quand un client paie en
retard est un chiffre qu'on ne peut pas citer deux fois de suite.

*Ce que cela oblige à écrire à l'écran* : la marge d'un mois n'est pas de
l'argent en caisse. La carte le dit sous sa valeur — « acquise à la vente, pas
encore encaissée en totalité » dès qu'une vente en tranches ou à crédit entre
dans le total. Sans cette ligne, le choix A devient un mensonge tranquille.

**2. Le restant dû — séparé, confirmé.** Une carte, deux lignes : *Créances*
(crédits — la moto est partie, l'argent manque) et *Dépôts* (tranches — la moto
est au magasin, l'argent est là). Les additionner produisait un nombre qui ne
désignait rien. La maquette se contredisait elle-même sur ce point ; c'est sa
seconde version qui fait foi.

**3. L'encaissé — réponse A.** Brut : la somme des versements clients du mois,
rien de retranché. Les avances versées aux prestataires sont une sortie, et un
solde est le sujet de la caisse (S22).

---

### Les trois arbitrages pris par défaut

Le commanditaire a répondu aux trois questions qui changent le sens des
chiffres. Les trois autres portent sur la portée, elles sont restées sans
réponse, et je prends ma recommandation plutôt que de bloquer un lot entier
dessus. **Chacune se change en un commit**, et je le note pour que personne ne
lise ces choix comme validés.

**4. Le sélecteur de mois — douze derniers mois.** Ils couvrent la comparaison
annuelle et tiennent dans une liste qu'on lit d'un coup. Étendre la portée est
une ligne ; la réduire aussi.

**5. Le gérant ne voit pas de chiffres.** S24 sert le responsable. Le gérant
n'a rien demandé, et un écran de chiffres sur l'accueil d'un comptoir
concurrencerait le geste du jour. La variante — les mêmes chiffres bornés à sa
boutique, marge exclue — devient une entrée de backlog plutôt qu'une supposition
codée.

**6. Un mois vide.** Une phrase et aucune carte quand le mois entier est à zéro ;
les cartes dès qu'un seul chiffre est non nul, sinon la grille se troue et l'œil
cherche ce qui manque.
