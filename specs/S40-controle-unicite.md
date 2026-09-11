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
- [x] Le rendu est regardé en capture, clair et sombre.
- [x] Les tests d'unité et de règles passent sans régression.

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

**Décision consignée :** D96.
