# S27 — La suite bout en bout rend un verdict qu'on peut croire

```
Statut     : terminée
Périmètre  : post-MVP (dette de vérification)
Dépend de  : aucune
```

---

## Objectif

La suite bout en bout rendait un verdict rouge à chaque passe, sans qu'aucun
échec porte sur le produit. Un verdict toujours rouge apprend à ranger le
prochain vrai défaut avec le bruit — c'est ce qui a caché S37 pendant deux jours
(D88). Cette spec rend le verdict croyable : les échecs qui restent accusent le
code.

---

## Ce que le lot devait chercher, et ce qu'il a trouvé

**L'hypothèse de départ était la reconnexion.** Le nom du lot le dit : « la file
d'écritures Firestore repart jusqu'à une minute après le retour du signal »
(D50). Trois mesures antérieures pointaient la contention de l'émulateur.

**Ce n'était pas ça.** Une passe complète sur émulateurs neufs a rendu huit
échecs, et **sept d'entre eux avaient deux causes**, ni l'une ni l'autre dans le
produit :

| Cause | Combien | Ce qu'on lisait |
|---|---|---|
| Une écriture du décor perdue au rechargement de page | 6 | `waiting for getByRole('radio', { name: /Zongo …/ })` puis expiration |
| Un second navigateur qui lit le serveur avant que la file soit vide | 2 | `element(s) not found` sur une fiche créée deux lignes plus haut |

La huitième — `dossier` — est la même que la première.

**Le mécanisme, et il est simple une fois écrit.** Le produit confirme une
écriture **de façon optimiste** : c'est sa promesse au comptoir, et elle est
juste (D76). Mais deux gestes du décor détruisent ce qui n'est pas encore parti :
`page.goto` / `page.reload` rechargent la page entière, et Firestore repart de
son cache sur disque, où une écriture en vol n'est pas ; `browser.newContext()`
ouvre un navigateur qui ne partage aucun cache et lit le **serveur**.

Le décor de `vendre()` faisait les deux à la file : créer un client, puis ouvrir
l'écran de vente par un chargement complet. Le client n'était **nulle part** — ni
au cache, ni au serveur — et le test expirait sur un bouton radio absent. Vérifié
au serveur, pas supposé : sur huit clients fabriqués par une passe, deux
seulement y étaient arrivés.

---

## Les arbitrages

| # | Arbitrage | Statut |
|---|---|---|
| 1 | **On attend la file vide une fois, à la frontière** — à la sortie du décor, avant un second navigateur, avant de couper le réseau. Jamais document par document. | *Tranché par la mesure.* Attendre le serveur à chaque écriture fabrique la contention qu'on mesurait ensuite : la tentative précédente avait été retirée de `ventes.spec.ts` pour cette raison, et elle avait raison de l'être — elle était au mauvais endroit, pas de trop. |
| 2 | **Le signal d'attente est celui du produit** : « À jour » au bandeau veut dire file vide. | *Par défaut.* Rien d'autre ne dit cela, et un signal inventé pour les tests aurait pu mentir sans qu'on le voie. |
| 3 | **Les émulateurs sont neufs à chaque passe complète**, par un script qui démarre son propre jeu et l'éteint après. | *Par défaut.* Ils ne vieillissent pas avec le temps mais avec les données ; voir plus bas. |
| 4 | **Le protocole de tri est écrit là où on le lira** — `e2e/README.md` —, pas dans un message de commit. | Tranché par le cahier. |

---

## Pourquoi les émulateurs « vieillissent »

Pas avec le temps : avec les données. `e2e/preparation.ts` vide la base **une
fois par passe**, puis les cent tests y accumulent chacun une boutique, une
marque, un modèle, une provenance, un client. Or presque chaque écran du produit
écoute ses collections **en entier** — c'est le choix de D16, et il est bon pour
le comptoir, où le hors-ligne prime. Au centième test, chaque ouverture d'écran
relit ce que les quatre-vingt-dix-neuf précédents ont écrit.

Le coût de la suite n'est donc pas linéaire, et une passe lancée sur les
émulateurs du matin part déjà chargée de la veille. `npm run test:e2e:propre`
retire la variable au lieu de la mesurer.

---

## Ce qui a été livré

- `e2e/aide.ts` — `attendreLaFileVide(page)`, le point d'attente unique, avec la
  raison écrite au-dessus.
- Les deux frontières du décor : à la sortie de `preparerTerrain`, et dans
  `vendre()` avant l'écran de saisie.
- Les dix ouvertures de second navigateur attendent la file vide.
- `scripts/e2e-propre.mjs` + `npm run test:e2e:propre` : purge `.next`, compile,
  démarre un jeu d'émulateurs neuf pour la seule durée de la passe, l'éteint
  après. Il **refuse** de partir si des émulateurs tournent déjà.
- `e2e/README.md` : le protocole de tri en cinq étapes, dont celle que personne
  ne fait — **aller voir si la donnée est au serveur**, qui tranche entre « le
  produit a mal écrit », « l'écriture s'est perdue » et « la lecture n'a pas eu
  lieu ».

---

## Les mesures

Toutes sur émulateurs neufs, même machine, même build à un commit près.

| | Passe A — avant | Passe C — après |
|---|---|---|
| Périmètre | suite complète, arrêtée à 62 tests | les **quatre fichiers** qui portaient les huit échecs |
| Échecs | **8** | **1** |
| `caisse` · la sortie d'espèces | échoue (2,7 min) | échoue (3,2 min) — *vrai défaut, voir plus bas* |
| `clients` · droits du gérant | échoue (24,0 s) | **passe (10,6 s)** |
| `dossier` · la file des dossiers | échoue (4,1 min) | **passe (2,1 min)** |
| `dossier` · écarter un document | *suspendu 1 h 30* (passe B) | **passe (2,1 min)** |
| `paiements` · quatre tests | échouent (3,1 à 3,2 min chacun) | **passent (2,1 à 2,2 min)** |

**Les six échecs de la famille « radio du client » ont disparu**, et les tests
correspondants ont perdu une minute chacun — ils n'expirent plus sur une donnée
absente, ils font leur travail.

**Ce que la correction coûte.** Chaque attente vaut environ trente secondes :
elle ne mesure pas la file, elle paie l'établissement de la connexion Firestore
après un chargement de page. `vendre()` en porte deux, et les tests qui
l'emploient sont passés de 1,1 à 2,1 minutes. C'est un mauvais échange à l'unité
et un bon échange en tout : une passe complète perd une quinzaine de minutes
d'attente et gagne six expirations de trois minutes, plus un verdict croyable.

**La borne du cahier est atteinte, et assumée.** La suite ne redescend pas sous
quinze minutes : cent tests qui font chacun six chargements de page complets ne
tiennent pas dans ce budget, et les y faire tenir demanderait de semer le décor
par l'Admin SDK plutôt que par l'interface — un autre lot, qui perdrait au
passage la vérification du « vrai chemin d'un premier jour ». La parade est donc
outillée, et la mesure consignée.

---

## Deux choses trouvées en chemin, qui n'étaient pas le sujet

### Un test peut rester suspendu bien au-delà de son budget

Deux cas mesurés : 45 minutes pour un test qui en demandait trois, et 1 h 30
pour un autre. Le journal des émulateurs porte la cause :
`Request to function failed: Error: socket hang up` — l'émulateur Functions perd
sa socket, et l'appel ne revient jamais. Le budget par test ne couvre pas ce
cas.

C'est, à soi seul, l'explication des « passes de 1 h 40 » consignées jusqu'ici.
`playwright.config.ts` gagne donc un `globalTimeout` de deux heures : il laisse
la place à la suite complète sur une machine chargée, et coupe net ce qui ne
finira pas. Une passe lancée le soir ne se retrouve plus suspendue le matin.

### La sortie d'espèces attendait le serveur — et c'est un vrai défaut

`caisse.spec.ts` « la sortie d'espèces » est le seul échec que la correction n'a
pas levé. Il échouait en suite, passait seul, et échouait encore dans une passe
de quatre fichiers : assez reproductible pour qu'on aille regarder le code plutôt
que la charge.

`SortieEspeces` faisait `await enregistrer(…)`, bouton désactivé le temps du
trajet. C'était **le dernier geste de comptoir à attendre l'accusé de réception
du serveur**, contre D76. Hors ligne, la promesse de Firestore ne se résout
jamais : le bouton serait resté désactivé et les champs pleins, indéfiniment,
pour une écriture pourtant déjà acquise dans le cache local — le gérant ne
pouvait plus saisir la sortie suivante. Sur une connexion seulement lente, le
même mécanisme rendait la main au bout d'une minute, ce qui explique l'échec en
suite chargée.

Corrigé : la validation reste synchrone (montant absurde, libellé vide), et seul
le refus du serveur — le seul qu'on ne peut pas connaître d'avance — arrive en
différé. Le test gagne l'assertion qui manquait, dans les deux sens de D79 : la
ligne apparaît **et** le formulaire redevient disponible, réseau coupé.

**Mais ce n'était pas la cause de l'échec.** Le test échoue toujours, et le
protocole de `e2e/README.md` §3 dit où : le document **est au serveur**, exact
dans tous ses champs — `sortie`, `depense`, 15 000, « Carburant du groupe »,
bonne boutique, bonne date. Le gérant le voit (son journal compte bien deux
mouvements). C'est le **responsable**, qui recharge le journal de cette boutique
juste après, qui ne le voit pas dans les trente secondes qu'on lui laisse.

Ce n'est donc ni une écriture perdue, ni un défaut de droits, ni du bruit : c'est
une **lecture qui n'arrive pas**, chez un second lecteur, pour un document déjà
publié. C'est la famille de D82. Le diagnostic s'arrête ici — la borne de cette
étape est atteinte — et il continue sous le nom **S41**, avec la preuve
ci-dessus, dans `specs/ROADMAP.md`.

---

## Hors périmètre

- **La reconnexion elle-même.** Le SDK Firestore repart avec une attente
  croissante qui peut approcher la minute (D50). Ce lot ne la change pas : D66 a
  fait baisser son rang côté produit, et la mesure montre qu'elle n'était pas la
  cause du verdict rouge.
- **Le coût du décor.** Un test de vente fabrique six documents par l'interface,
  soit six chargements de page complets. C'est voulu — c'est le vrai chemin d'un
  premier jour — et le réduire demanderait de semer par l'Admin SDK, ce qui est
  un autre lot.
- **Vider la base entre les fichiers de tests** plutôt qu'une fois par passe.
  Cela romprait l'amorçage du compte responsable, qui vit en base.
