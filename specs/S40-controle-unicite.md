# S40 — Le contrôle d'unicité qui répond avant de savoir

```
Statut     : terminée
Périmètre  : post-MVP (dette de correction)
Dépend de  : S5, S20, S39
```

---

## Objectif

Six écrans du produit vérifient qu'un nom, une référence ou un numéro n'est pas
déjà pris. Tous posaient la question à une liste **pas encore arrivée**, et tous
répondaient « aucun doublon ». Le plus grave d'entre eux laissait créer **deux
motos au même numéro de châssis**. Cette spec fait qu'aucun des six ne décide
d'écrire tant qu'il ne sait pas.

---

## Le défaut, en une ligne

```ts
const doublon = chassisDejaPris(saisie.numeroChassis, stock ?? []);
```

`stock` vaut `null` tant que la première réponse de l'écoute Firestore n'est pas
arrivée. **Le `?? []` transforme « je ne sais pas encore » en « il n'y a rien »**
— trois états aplatis en deux — et le contrôle répond à une question qu'il n'a
pas posée. C'est D95, dont S20 n'avait corrigé qu'une des six occurrences.

**Comment il a été trouvé.** Par le test bout en bout de S20 « une référence déjà
prise ne se crée pas deux fois », qui échouait une passe sur deux. Il avait
toutes les apparences du bruit de contention de S27 : intermittent, sensible à la
charge, invisible au rejeu isolé. Le classer ainsi aurait laissé le châssis en
place — c'est le mécanisme de D88, une chaîne de vérification bruyante finit par
avaler ce qu'elle devait montrer.

---

## Les arbitrages

| # | Arbitrage | Statut |
|---|---|---|
| 1 | **Le correctif a deux moitiés, et une seule ne suffit pas** : le garde dans la soumission empêche le doublon ; le bouton qui annonce la lecture en cours fait *disparaître* la course au lieu de la rattraper. | Tranché par D95, repris à l'identique de `pieces/nouvelle`. |
| 2 | **Les six occurrences se traitent ensemble.** Corriger celle qu'on a prise en défaut ne corrige rien tant qu'on n'a pas énuméré les autres (D92). | Tranché par le cahier, étape 1. |
| 3 | **La liste nulle remonte jusqu'au composant partagé.** `ListeReferentiel` et `ChoixOuNouveau` reçoivent désormais l'état « pas encore lu » au lieu d'une liste vide fabriquée par l'appelant : un composant qui ne peut pas distinguer les deux les aplatira à nouveau au prochain appelant. | *Par défaut.* Coût : une propriété de plus sur deux composants ; bénéfice : le défaut ne peut plus être réintroduit par un nouvel écran. |
| 4 | **Le message dit ce qui manque, pas « erreur ».** « Le stock n'a pas fini d'arriver. Réessayez dans un instant. » | Tranché par `DESIGN.md` §12. |
| 5 | **Le bouton se désactive *et* se renomme.** Désactivé seul, il n'explique rien ; renommé seul, il laisse cliquer. | *Par défaut*, repris de `pieces/nouvelle`. |

---

## La septième occurrence, que le cahier n'avait pas vue

`components/FormulaireClient.tsx` demande « ce numéro de téléphone est-il déjà
pris ? ». Il ne porte aucun `?? []` : l'aplatissement vit un étage plus bas, dans
`useFichierClients`, qui rend `clients: valeur ?? []`. **La recherche annoncée
par le cahier — `grep "?? []"` sur `app/` et `components/` — ne pouvait donc pas
la trouver.**

Elle coûte autant que les autres : un client créé pendant le chargement du
fichier duplique un numéro, et coupe en deux l'historique d'une personne — ses
dettes sur une fiche, ses versements sur l'autre.

**Ce qu'elle corrige à la méthode :** le motif se cherche par les **appels au
contrôle** (`…DejaPris`, `trouverParNom`), pas par l'écriture qui l'introduit.
C'est cette recherche-là qui fait foi dans les critères ci-dessous.

---

## Les six endroits

| Fichier | Ce qui se dupliquait | Ce qui a été fait |
|---|---|---|
| `app/(app)/motos/nouvelle/page.tsx` | Le **numéro de châssis** | Garde + bouton « Lecture du stock… » |
| `app/(app)/pieces/nouvelle/page.tsx` | La référence d'une pièce | Déjà corrigé avec S20 |
| `app/(app)/parametres/catalogue/page.tsx` | Le nom d'une **marque** | Par `ListeReferentiel`, liste nullable |
| `app/(app)/parametres/catalogue/page.tsx` | Le nom d'un **modèle** | Garde + bouton « Lecture des modèles… » |
| `app/(app)/parametres/referentiels/page.tsx` | Provenances, types de frais | Par `ListeReferentiel`, liste nullable |
| `components/ChoixOuNouveau.tsx` | La création à la volée (marque, modèle, provenance) | Propriété `chargement`, option d'ajout retirée tant que la liste n'est pas là |

`ListeReferentiel` portait le défaut **deux fois** : à l'ajout et au renommage —
renommer « Yamaha » en « Apsonic » pendant le chargement créait le même doublon.
Les deux formulaires sont gardés.

---

## Critères d'acceptation

- [x] `grep -rn "?? \[\]" app/ components/` ne rend plus aucun contrôle d'unicité.
- [x] Un test bout en bout qui **échoue sur l'ancien code** : ouvrir
      `/motos/nouvelle`, soumettre **immédiatement** un châssis existant, et
      vérifier le refus — les deux sens de D79 (il refuse quand il doit, il
      accepte quand il doit).
- [x] Le bouton de chaque formulaire concerné annonce la lecture en cours.
- [x] Le rendu est regardé en capture, clair et sombre — `captures/catalogue-lecture-en-cours-mobile-clair.png` et `captures/clients-lecture-en-cours-bureau-sombre.png`, produites par une variante neuve du script (`lectureEnCours`) qui **suspend le canal d'écoute Firestore** pour figer un état qui dure autrement quelques dizaines de millisecondes.
- [x] Les tests d'unité passent sans régression (452). Aucune règle Firestore
      n'est touchée par ce lot.
- [x] Les suites bout en bout des écrans touchés passent : `motos` (8/8, dont le
      nouveau), `referentiels` (10/10), `clients` (7/7), `ventes`.

---

## Hors périmètre

**L'unicité n'est pas rendue garantie.** Deux appareils hors ligne peuvent
toujours créer le même châssis, et aucune règle Firestore ne sait l'empêcher —
même impossibilité que pour le stock négatif (D94) et pour la numérotation (D5).
Ce qui est corrigé ici, c'est le doublon créé **sur un seul appareil, avec du
réseau** : le cas où le produit avait toutes les informations pour refuser et a
répondu quand même. Le rattrapage à la synchronisation est un autre lot, hors du
`CAHIER-DU-RESTE`.

---

## Ce qui a été livré

Les six occurrences sont fermées. Deux composants partagés — `ListeReferentiel`
et `ChoixOuNouveau` — acceptent désormais `null` comme troisième état de leur
liste, ce qui retire à leurs appelants la possibilité de refaire l'aplatissement.

Le test `e2e/motos.spec.ts` « un châssis existant est refusé même si l'écran
vient de s'ouvrir » soumet sans laisser l'écoute répondre : il échoue sur
l'ancien code (la seconde moto se crée), il passe sur le nouveau (le bouton
attend, puis le refus nomme la moto).

### Ce que la capture a trouvé

Cet état n'avait jamais été regardé — il ne dure pas assez longtemps pour qu'une
campagne l'attrape. Une fois figé, il montrait ceci : pendant que les marques
chargent, la section **Modèles** affichait « Ajoutez d'abord une marque : un
modèle n'existe pas tout seul. »

C'est le même aplatissement, **côté affichage** : `marques.length === 0`
confond « aucune marque » et « marques pas encore lues », et le produit conseille
de créer une donnée que le lecteur possède peut-être déjà (`DESIGN.md` §10). La
conséquence est plus douce qu'un doublon, mais elle est de la même famille — et
elle n'aurait été trouvée ni par un test, ni par une relecture.

**Ce qui rend l'outillage de cette capture justifié** : sans lui, cet état
resterait le seul du produit que personne ne regarde jamais.

**Une borne de l'outil, mesurée :** le gel ne vaut qu'**avant** la navigation.
Firestore multiplexe toutes ses écoutes sur un canal ouvert une fois pour
toutes ; une interception posée après le chargement ne voit plus rien passer.
Les écrans qui ont besoin de la liste des boutiques pour savoir où ils sont —
dont `/motos/nouvelle` — ne peuvent donc pas être photographiés dans cet état
par ce moyen : privés de cette liste, ils répondent « choisissez une boutique »,
c'est-à-dire autre chose. Leur bouton suit le patron photographié ici, et c'est
le test bout en bout qui l'atteste, **en l'attendant par son nom**.

---

### Ce que la vérification a trouvé, et qui n'était pas ce lot

Le test `motos.spec.ts` « une moto se saisit et se consulte sans réseau » s'est
mis à échouer **aussitôt après le correctif**, sur une option de liste manquante
— le modèle n'était plus proposé. Toutes les apparences d'une régression du lot,
qui touche précisément les listes de choix.

Elle a été vérifiée plutôt que crue :

1. **Rejeu sur le code d'avant** — il passe. Donc le lot est bien en cause.
2. **Bissection fichier par fichier** — le coupable apparent est
   `ListeReferentiel`, qui ne touche pas les modèles.
3. **Sonde** — le serveur **a** le document, avec le bon `marqueId` ; c'est le
   cache du navigateur qui ne l'a pas.

Le décor (`preparerTerrain`) fabrique une marque, un modèle et une provenance,
puis le test **coupe le réseau aussitôt**, sans attendre que ces écritures soient
parties. Le correctif n'a fait que déplacer le clic de quelques centaines de
millisecondes — le bouton attend maintenant la liste — ce qui a suffi à faire
basculer une course qui existait déjà.

Le test attend désormais « À jour » au bandeau avant de débrancher : **une fois,
à la frontière**, et non document par document — attendre le serveur à chaque
écriture du décor fabriquerait la contention que S27 mesure. Il passe en
**7,1 s** contre 90 s d'expiration.

C'est D97, et elle vaut pour tout test qui coupe le réseau après avoir écrit.

### Deux observations portées à l'étape 2

Elles ne sont pas écartées comme « bruit » : elles ont un mécanisme, et il est
écrit.

1. **`ventes.spec.ts` — deux échecs sous charge, zéro en isolement.** Les deux
   tests attendent une fiche client qui n'arrive jamais ; l'écran affiche « Le
   fichier clients est vide », et le serveur n'a effectivement pas ce client.
   Même famille que D97 : le décor écrit, puis recharge la page entière sans
   avoir attendu que l'écriture soit partie. Le correctif de ce lot ne fait que
   décaler le clic de quelques centaines de millisecondes — il n'a pas créé la
   course, il en a changé les chances. À mesurer et fermer en S27.

2. **La campagne de captures s'arrête à la fiche de vente.** Elle demande une
   vente existante dans la boutique qu'elle a choisie, et ne la fabrique pas :
   elle dépend donc de ce qu'une suite bout en bout a laissé derrière elle. Un
   outil de revue qui ne montre pas tout ne montre rien (D93). À reprendre à
   l'étape 17, dont c'est l'objet.

**Décisions consignées :** D96, D97.
