# S8 — Vente de moto — enregistrement

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S5, S6, S7
```

---

## Objectif

Un client achète une moto : le gérant enregistre la vente sur un seul écran, en moins d'une minute,
sans réseau, et le dossier du client existe immédiatement avec ses quatre documents à traiter.

C'est la spec qui porte la valeur centrale du produit. Tout le reste la sert ou en découle.

---

## Critères d'acceptation

- [x] Un seul écran : moto (recherche dans le stock de la boutique), client (recherche ou création à la volée), prix convenu, mode de paiement, inclus / non inclus
- [x] Modes de paiement : comptant, crédit, tranches — le choix change le comportement, et l'écran dit lequel en clair avant validation
- [x] Un montant peut être encaissé immédiatement, quel que soit le mode
- [x] La validation écrit **en un seul batch atomique** : la vente, ses quatre documents (`quittance`, `cmc`, `carte_grise`, `plaque`) en statut `a_faire`, le token de suivi, la mise à jour de la moto, et le cas échéant le versement et l'encaissement
- [x] Comptant et crédit : moto `vendue`, `motoRemise: true`. Tranches : moto `reservee`, `motoRemise: false`
- [x] Comptant : le montant encaissé doit égaler le prix convenu, sinon la validation est refusée
- [x] `coutMotoSnapshot` est figé dans `ventesMotos/{id}/prive/marge` avec la marge calculée, par un **déclencheur serveur** — un gérant ne peut pas lire le coût, donc il ne peut pas l'écrire (D2, D51)
- [x] Une moto déjà vendue ou réservée ne peut pas être vendue une seconde fois ; le stock proposé à la vente exclut ces motos
- [x] Le numéro de vente vient de S7 et s'affiche dès la validation ; il est réservé sur l'appareil au moment de la validation, jamais avant
- [x] `numero` et `numeroInitial` sont égaux à la création, `numeroInitial` est immuable, et l'application signale une vente renumérotée par le serveur (D44)
- [x] Toute la séquence fonctionne hors ligne, de la recherche de moto à l'affichage du numéro — vérifié par un test Playwright réseau coupé
- [x] Liste des ventes avec recherche par nom ou téléphone du client, affichant moto, date, statut de paiement et état des quatre documents (`prompt.md` §6.4)
- [x] Fiche vente : tout le dossier sur un écran — moto, client, montants, versements, documents
- [x] Le prix convenu et les montants sont des entiers positifs en FCFA ; validation côté client et dans les règles Firestore
- [x] États couverts : stock vide, aucune moto vendable, aucun client, aucune vente, recherche sans résultat, validation refusée, droits refusés, chargement, hors ligne

---

## Hors périmètre

Les versements **ultérieurs** et les listes de dettes et de tranches (S9) — S8 n'écrit que le
versement du jour de la vente, dans son lot. Le reçu imprimable (S10) : ici on affiche la
confirmation et le numéro. Le cycle de vie des documents (S11) : ils sont créés en `a_faire`, pas
encore pilotés. La page publique `/suivi/[token]` et WhatsApp (S13, S14) : le token est **engendré**,
pas utilisé. Le journal de caisse (S22) : les encaissements sont écrits, jamais relus.
Reprises (S18), motos de confrère (S26), annulation (S25).

---

## Notes techniques

**Le batch atomique est le cœur de la spec.** Firestore garantit l'atomicité d'un `writeBatch` y
compris hors ligne : soit tout part, soit rien. Une vente à moitié écrite serait pire qu'une vente
refusée. Sept documents partent ensemble au maximum : la vente, ses quatre documents de dossier, le
versement, l'encaissement, plus la mise à jour de la moto.

**Le coût de la moto ne peut pas voyager par le navigateur.** C'est le point le plus délicat.
`coutMotoSnapshot` doit être figé à la vente, mais il vit dans `motos/{id}/prive/cout`, illisible par
un gérant (D2) — qui ne peut donc pas l'écrire dans la vente. Un déclencheur Firestore le recopie
côté serveur dans `ventesMotos/{id}/prive/marge`, seul acteur à voir les deux côtés. Les règles
interdisent à tout navigateur d'écrire cette sous-collection : la marge n'est donc pas seulement
cachée, elle est infalsifiable (D51).

**Le `boutiqueId` est répété sur chaque sous-document.** Dans un même lot, les règles évaluent chaque
document contre l'état d'**avant** : la vente parente n'existe pas encore quand son dossier est
validé. Même montage que `motos/{id}/prive/cout` en S5.

Les quatre documents du dossier prennent leur type comme identifiant (`documents/carte_grise`), ce qui
rend l'écriture idempotente et interdit structurellement les doublons.

Le tirage du token de suivi utilise `crypto.getRandomValues`, 32 octets en base64url (D6). Il est écrit
dans le document de vente, pas ailleurs — le gérant doit pouvoir le renvoyer plus tard.

Distinction à ne jamais relâcher, y compris dans le vocabulaire de l'interface : **crédit** = moto
livrée, le client doit de l'argent ; **tranches** = moto retenue, le magasin détient de l'argent. Les
confondre fausse la caisse et le stock à la fois.

Le calcul des agrégats de paiement (`totalPaye`, `resteDu`, `statutPaiement`) est une fonction pure de
`lib/domain/vente.ts`, partagée avec S9 — écrite ici, réutilisée là, jamais recopiée.

**Limite assumée, héritée du hors-ligne.** Deux appareils sans réseau peuvent vendre la même moto :
le stock local de chacun la montre disponible. Les règles ne l'interdisent pas, et c'est délibéré —
un refus au moment de la synchronisation ferait perdre une vente encaissée trois jours plus tôt.
Le cahier des charges tranche les conflits par la dernière écriture (§3.4). La prévention est côté
écran (le stock vendable exclut `vendue` et `reservee`) ; la détection après coup relève de S25.
