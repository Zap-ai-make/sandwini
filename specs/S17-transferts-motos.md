# S17 — Déplacer une moto d'une boutique à une autre

```
Statut     : à faire
Périmètre  : post-MVP
Dépend de  : S5 (stock motos), S3 (boutiques et périmètre)
```

---

## Objectif

Une moto est à Pouytenga, le client qui la veut est à Koudougou. Le gérant de
Pouytenga la fait partir, et elle apparaît dans le stock de Koudougou. Les deux
boutiques peuvent dire, plus tard, où elle est passée.

Aujourd'hui c'est impossible : les règles Firestore interdisent explicitement
qu'une moto change de `boutiqueId`, en renvoyant à cette spec. Le seul recours
est de ressaisir la moto dans l'autre boutique — ce qui fabrique un doublon de
châssis et perd son prix d'achat, son arrivage et sa date d'entrée.

---

## Les arbitrages du commanditaire

Tranchés le 8 octobre 2026. Ils sont **tranchés**, pas pris par défaut.

| # | Question | Réponse |
|---|---|---|
| 1 | Un seul geste, ou envoi puis réception ? | **Un seul geste.** La moto change de boutique immédiatement. |
| 2 | Qui a le droit ? | **La boutique d'origine.** Son gérant fait partir ses motos ; le responsable qui bascule sur une boutique emprunte le même chemin. |
| 3 | Quelles motos ? | **Celles en stock seulement.** Une moto réservée ou vendue est promise à quelqu'un. |
| 4 | Faut-il une trace ? | **Oui**, un historique des transferts — mais sans écran neuf. |

### Ce que l'arbitrage 1 renverse

**Q7 (11 septembre 2026) avait tranché pour deux temps** : l'origine envoie
(statut `transferee`), l'arrivée confirme. L'argument était bon — pendant le
trajet, l'inventaire de la boutique d'arrivée compterait une moto encore sur la
route.

Le commanditaire a pesé ce coût contre le sien : deux gestes, deux écrans, et
surtout une moto qui reste « sur la route » indéfiniment si personne ne
confirme à l'arrivée. Un stock faux pendant deux jours se corrige tout seul ; un
geste que personne ne fait ne se corrige jamais. **Q7 est donc renversée**, et
ce paragraphe existe pour qu'on ne la rejoue pas dans six mois en croyant
retrouver un oubli.

**Q10 tombe avec elle.** Elle demandait si un gérant lit les motos d'une autre
boutique quand un transfert les lui destine — une question qui n'existait que
dans le modèle en deux temps. Avec un seul geste, la moto est simplement dans
son stock quand il la regarde. Aucune règle de lecture conditionnelle à écrire.

**Le statut `transferee` reste déclaré et inutilisé.** Il est dans `STATUTS`
depuis S5 ; avec un seul geste, une moto n'est jamais « sur la route ». On ne le
retire pas — des données anciennes pourraient le porter — et on ne l'emploie pas.

---

## Critères d'acceptation

**Le geste**

- [ ] Le gérant de Pouytenga fait partir une moto de son stock vers Koudougou ; elle quitte sa liste et entre dans celle de Koudougou.
- [ ] Le responsable fait le même geste, qu'il ait basculé sur une boutique ou qu'il soit sur « Toutes les boutiques » : l'origine vient de la **moto**, jamais du sélecteur.
- [ ] La destination se choisit parmi les boutiques **ouvertes**, la boutique d'origine exclue de la liste.
- [ ] Une moto réservée ou vendue ne propose pas le geste, et la raison est écrite.
- [ ] Le geste demande une confirmation qui nomme la moto et les deux boutiques.
- [ ] Il fonctionne **hors ligne** : le lot part en file, l'écran est juste immédiatement (D66).

**La trace**

- [ ] Chaque déplacement écrit un document : moto, châssis recopié, boutique de départ, boutique d'arrivée, date, auteur, et le motif s'il a été saisi.
- [ ] La fiche de la moto, côté destination, dit d'où elle vient et quand.
- [ ] L'écran du stock, côté origine, porte un bloc repliable « Motos parties d'ici » — et rien du tout quand aucune n'est partie.
- [ ] Le châssis est recopié dans la trace : elle reste lisible si la moto devient illisible pour celui qui la consulte.

**Les chiffres des deux boutiques, après le déplacement**

- [ ] Le stock de la boutique d'origine **perd** la moto : son total, sa répartition par marque et son compteur baissent d'une unité.
- [ ] Le stock de la boutique d'arrivée la **gagne**, et les mêmes chiffres montent d'une unité.
- [ ] **Aucun agrégat entretenu n'est introduit** (D61). Tout se recompte à la lecture depuis les écouteurs déjà filtrés par boutique, ce qui est la seule façon pour que les deux côtés ne puissent pas diverger.
- [ ] Prouvé par un test de règles : après le déplacement, le gérant d'origine **ne lit plus** la moto, celui de destination la lit. Le périmètre est ce qui porte tous les comptes ; le prouver, c'est les prouver tous.
- [ ] Les chiffres de **vente** ne bougent pas. Une vente passée garde sa boutique : déplacer une moto ne réécrit pas l'histoire commerciale de celle qui l'a vendue.
- [ ] L'**écoulement du lot** d'arrivage reste juste : la moto compte toujours dans son lot, où qu'elle vive ensuite.
- [ ] Le rendu est regardé **sur les deux boutiques**, avant et après un déplacement, et les nombres se recoupent.

**Les gardes — chacune avec son témoin de règles, sinon elle n'existe pas**

- [ ] Un gérant **ne tire pas** : il ne peut pas s'attribuer une moto d'une autre boutique en changeant son `boutiqueId`.
- [ ] Un gérant ne déplace pas une moto d'une boutique qui n'est pas la sienne.
- [ ] Une destination **inexistante** est refusée.
- [ ] Une boutique **fermée** est refusée comme destination.
- [ ] Un transfert ne se modifie pas et ne se supprime pas.
- [ ] Un gérant lit les transferts dont l'une des deux boutiques est la sienne, **et pas les autres**.
- [ ] Un gérant lit désormais la **liste** des boutiques, mais ne peut toujours ni en créer, ni en modifier, ni en supprimer.
- [ ] Un compte non connecté ne lit aucun transfert et aucune boutique.

**Le reste**

- [ ] Les états sont couverts : aucune autre boutique ouverte, chargement, erreur (`DESIGN.md` §10).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run test:unite`, `npm run test:regles`, et le rendu **regardé** en clair et en sombre.

---

## Hors périmètre

- **Les pièces détachées.** `transfert_sortie` et `transfert_entree` existent dans `MOUVEMENTS` depuis S20 et attendent leur lot ; la demande porte sur les motos.
- **Le transfert d'un lot entier.** Une moto à la fois. Si le geste groupé se révèle nécessaire, il s'ajoutera par-dessus celui-ci.
- **L'annulation d'un transfert.** Un déplacement est un fait : on corrige en retransférant, ce qui laisse les deux traces. Même principe que le mouvement de stock.
- **Un écran de journal des transferts.** Le commanditaire a dit « trop d'écrans pour ça » à propos des papiers ; la trace se lit là où la question se pose — sur la moto, et sur le stock d'où elle est partie.
- **Le statut `transferee`.** Voir plus haut.
- **Les papiers de la moto.** Une moto qui part emporte son dossier tel quel. S53 reprendra la question du dossier de bout en bout ; rien ici ne la préempte.

---

## Notes techniques

### La trace est une collection, pas une sous-collection

`transfertsMotos/{id}`, au premier niveau. Une sous-collection
`motos/{id}/transferts` n'aurait servi que la boutique d'arrivée : **la moto
quitte le périmètre de celle de départ**, qui ne peut plus l'ouvrir — ni elle,
ni ce qui pend dessous. Or c'est précisément elle qui se demande où est passée
la moto.

Le document porte `deBoutiqueId` et `versBoutiqueId`, et la règle de lecture
ouvre à qui est gérant de l'une **ou** de l'autre. Le châssis y est recopié,
comme `createdByName` ailleurs : la trace doit rester lisible même quand son
sujet ne l'est plus.

### Un lot d'écriture, et une limite qu'on nomme

Le changement de boutique et sa trace partent dans un `writeBatch` : les deux
atterrissent, ou aucun. Hors ligne, Firestore met le lot en file entier.

**Les règles Firestore ne voient pas les autres documents d'un même lot** —
elles évaluent chaque écriture contre l'état d'avant. Rien ne leur permet donc
d'exiger qu'un changement de `boutiqueId` s'accompagne de sa trace. C'est
l'atomicité du lot qui le garantit, et le fait que seul notre code écrit ici.
Même famille de limite que celle déjà nommée pour `fraisEntree` (les règles ne
savent pas parcourir une liste).

### La règle laisse pousser, jamais tirer

C'est la propriété centrale, et elle est gratuite. La règle d'`update` vérifie
le gérant contre `resource.data.boutiqueId` — la boutique que la moto **quitte**.
Un gérant peut donc donner une moto qu'il détient, et ne peut pas s'en attribuer
une qu'il ne détient pas, faute du moindre droit d'écriture sur elle tant
qu'elle est ailleurs. Le sens du transfert est porté par la règle, pas par une
condition dans un écran.

S'y ajoute une vérification de la destination : elle doit exister et ne pas être
fermée. Sans elle, une moto part vers un code inventé et disparaît de tous les
stocks sauf celui du responsable.

### La lecture des boutiques s'ouvre, et c'est le seul élargissement

Aujourd'hui `match /boutiques/{code}` n'ouvre la lecture qu'au responsable et au
gérant **de cette boutique**. Un gérant ne peut donc pas choisir une destination.

Firestore ne sait pas masquer un champ : un document lisible l'est en entier. La
lecture passe donc à **tout compte connecté**. Un document boutique porte le nom,
le code, les métiers, l'adresse, le téléphone et l'état d'ouverture — l'enseigne
au-dessus de la porte, rien qu'un client ne puisse lire sur place. Aucune
décision du dépôt ne protégeait cette restriction : c'était de l'hygiène de
moindre exposition (`SECURITY.md` §0), et elle devient ici un obstacle réel.

L'écriture ne bouge pas : créer, modifier et fermer une boutique restent au
responsable. Le test de règles le prouve dans les deux sens.

### Le `boutiqueId` du coût privé

`motos/{id}/prive/cout` porte un `boutiqueId` que la règle exige égal à celui de
la moto. Il n'est lu **nulle part** — ni par l'application, ni par la sécurité,
puisque seul le responsable ouvre ce document — mais le laisser diverger rendrait
faux l'invariant que la règle défend, et bloquerait une correction de coût
ultérieure.

Le transfert le met donc à jour **quand le document est en main**. Seul le
responsable peut l'écrire ; un gérant qui transfère ne le touche pas, et la
divergence se répare à la prochaine saisie de coût, qui envoie toujours la
boutique courante de la moto. La spec assume ce décalage plutôt que d'ouvrir le
mur D2 pour un champ que personne ne lit.

### Ce qui ne bouge pas

**L'arrivage garde la moto dans son lot.** Le lot est arrivé où il est arrivé ;
l'historique du fournisseur (S50) continue de la compter dedans, et son
écoulement reste juste. Une moto peut donc appartenir à un lot de Pouytenga et
vivre à Koudougou — c'est la vérité, pas une incohérence.

**La vente, le dossier, les photos, le prix de vente conseillé** suivent la moto
sans retouche : ils pendent à son identifiant, qui ne change pas.

### Le domaine pur, d'abord

Trois règles s'écrivent et se prouvent sans Firestore ni React
(`lib/domain/transfert.ts`, D103) :

- `peutPartir(moto)` — en stock, et rien d'autre ;
- `destinationsPossibles(boutiques, origine)` — les ouvertes, moins l'origine ;
- `validerTransfert(saisie)` — une destination choisie, et différente de l'origine. Le **motif est facultatif** : l'exiger ferait taper « transfert » dans la case à chaque fois, ce qui n'apprend rien à personne. Il est borné en longueur quand il est là.

Les écrans et les règles viennent après, chacun avec ses propres témoins.

### Les écrans

Aucun écran neuf. Une modale sur le patron `components/patrons/Modale.tsx`,
ouverte depuis la fiche de la moto. Le bloc « Motos parties d'ici » reprend le
`<details>` replié de `components/RepartitionStock.tsx` (S50), et rend `null`
quand il n'y a rien à montrer.

---

Une fois la spec terminée : critères cochés, code vérifié (tests + rendu), revue
des trois contrats passée, commit effectué, statut mis à jour dans
`specs/ROADMAP.md`.
