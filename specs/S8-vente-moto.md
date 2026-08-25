# S8 — Vente de moto — enregistrement

```
Statut     : à faire
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

- [ ] Un seul écran : moto (recherche dans le stock de la boutique), client (recherche ou création à la volée), prix convenu, mode de paiement, inclus / non inclus
- [ ] Modes de paiement : comptant, crédit, tranches — le choix change le comportement, et l'écran dit lequel en clair avant validation
- [ ] Un montant peut être encaissé immédiatement, quel que soit le mode
- [ ] La validation écrit **en un seul batch atomique** : la vente, ses quatre documents (`quittance`, `cmc`, `carte_grise`, `plaque`) en statut `a_faire`, le token de suivi, la mise à jour de la moto, la sous-collection privée de marge, et le cas échéant le versement et l'encaissement
- [ ] Comptant et crédit : moto `vendue`, `motoRemise: true`. Tranches : moto `reservee`, `motoRemise: false`
- [ ] Comptant : le montant encaissé doit égaler le prix convenu, sinon la validation est refusée
- [ ] `coutMotoSnapshot` est figé à la vente dans `ventesMotos/{id}/prive/marge` avec la marge calculée (D2)
- [ ] Une moto déjà vendue ou réservée ne peut pas être vendue une seconde fois ; le stock affiché exclut ces motos
- [ ] Le numéro de vente vient de S7 et s'affiche dès la validation
- [ ] Toute la séquence fonctionne hors ligne, de la recherche de moto à l'affichage du reçu — vérifié par un test Playwright réseau coupé
- [ ] Liste des ventes avec recherche par nom ou téléphone du client, affichant moto, date, statut de paiement et état des quatre documents (`prompt.md` §6.4)
- [ ] Fiche vente : tout le dossier sur un écran — moto, client, montants, versements, documents
- [ ] Le prix convenu et les montants sont des entiers positifs en FCFA ; validation côté client et dans les règles Firestore
- [ ] États couverts : stock vide, aucune moto trouvée, client introuvable, validation refusée, hors ligne

---

## Hors périmètre

Les versements ultérieurs et les listes de dettes et de tranches (S9). Le reçu imprimable (S10) — ici
on affiche seulement la confirmation et le numéro. Le cycle de vie des documents (S11) : ils sont
créés, pas encore pilotés. Reprises (S18), motos de confrère (S26), annulation (S25).

---

## Notes techniques

Le batch atomique est le cœur de la spec. Firestore garantit l'atomicité d'un `writeBatch` y compris
hors ligne : soit tout part, soit rien. Une vente à moitié écrite serait pire qu'une vente refusée.

Le tirage du token de suivi utilise `crypto.getRandomValues`, 32 octets en base64url (D6). Il est écrit
dans le document de vente, pas ailleurs — le gérant doit pouvoir le renvoyer plus tard.

Les quatre documents du dossier prennent leur type comme identifiant (`documents/carte_grise`), ce qui
rend l'écriture idempotente et interdit structurellement les doublons.

Distinction à ne jamais relâcher, y compris dans le vocabulaire de l'interface : **crédit** = moto
livrée, le client doit de l'argent ; **tranches** = moto retenue, le magasin détient de l'argent. Les
confondre fausse la caisse et le stock à la fois.

Le calcul des agrégats de paiement (`totalPaye`, `resteDu`, `statutPaiement`) est une fonction pure de
`lib/domain`, partagée avec S9 — écrite ici, réutilisée là, jamais recopiée.
