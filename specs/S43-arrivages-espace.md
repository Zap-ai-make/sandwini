# S43 — L'arrivage : l'espace de suivi d'un lot

```
Statut     : en cours
Périmètre  : post-MVP
Dépend de  : S42, S11, S39
```

---

## Objectif

S42 fait *entrer* un lot ; S43 le *suit*. Le concurrent (KYSG) tient un espace
« Arrivages » qui, d'un coup d'œil, dit combien de motos sont arrivées, combien
restent en stock, combien sont vendues, et **combien attendent encore leur CMC**.
Il laisse inspecter un lot, corriger son entête, le sortir en PDF, retrouver une
moto par son châssis, et retirer un lot fautif.

Cette spec donne la même vue de pilotage, **sans copier son habillage** (nos
jetons, plus sobre) et **en respectant nos invariants** : rien ne s'efface en
cascade — une moto est citée par des ventes, des dossiers, la caisse. On adapte
donc « Supprimer » à un produit en journal, et on rend le suivi documentaire au
niveau où on le corrige déjà (le flux `PapiersMoto`, S11).

**CMC ici, ce n'est pas S16.** `cmcRecu` est un simple témoin par moto — « le CMC
de cette moto est-il en main ? » — qui alimente un décompte. La gestion du **stock
physique de cartes** (attribution, remise) reste S16, à part.

---

## Critères d'acceptation

- [ ] **Cartes de tête** sur `/motos/arrivages` : arrivages, motos reçues, en stock,
      vendues, **CMC manquants** — calculées en lecture sur le périmètre affiché,
      jamais stockées.
- [ ] La **liste** s'enrichit : date d'arrivée + son ancienneté relative
      (« aujourd'hui », « il y a 3 jours », « il y a 1 mois »), **barre d'écoulement**
      (en stock / vendues), **complétude CMC** (« k manquants · reçus / total »).
- [ ] **Filtres** : Tous · CMC incomplets · Écoulés (un lot est écoulé quand toutes
      ses motos sont vendues).
- [ ] **Retrouver une moto** : un champ cherche par numéro de châssis, **complet ou
      par ses derniers caractères**, et mène à la moto (et à son lot).
- [ ] **Inspecter le lot** : un panneau montre l'entête, les compteurs du lot, et la
      table de ses motos (cadre, marque, statut, CMC). Une **case « CMC reçu »** y
      bascule `cmcRecu` — écriture ordinaire de moto, sans jamais toucher au coût.
- [ ] **Modifier** l'entête (nom, fournisseur, date, description) depuis la liste —
      déjà permis par les règles (responsable ou gérant de la boutique du lot).
- [ ] **Retirer un lot**, adapté au journal : un lot **sans moto** s'efface (entête
      seule) ; un lot **avec motos** s'**annule** (masqué, réversible), ses motos
      restant en stock. Un lien « Voir les annulés » les révèle avec **Rétablir**.
- [ ] **Exporter le lot en PDF** : une vue imprimable du bordereau (entête, motos,
      écoulement, CMC) + impression navigateur → PDF. Hors-ligne, sans librairie ni
      Cloud Function (D66).
- [ ] **Le coût reste cloisonné (D2/S39)** : aucune de ces écritures (CMC, annule,
      entête) ne lit ni n'écrit `prive/cout`. Prouvé par un test de règles.
- [ ] États couverts : liste vide, chargement, périmètre « toutes boutiques » (lecture
      seule, pas de création), erreur nommée — `DESIGN.md` §10.

---

## Hors périmètre

- **Éditer les motos d'un lot** (ajouter, retirer, changer un châssis) n'est pas cet
  écran : la fiche moto s'en charge. « Modifier » ne touche que l'entête.
- **Le stock de cartes CMC** (S16) : on ne suit qu'un témoin `cmcRecu`, pas un stock
  physique attribué.
- **La recherche globale** (S32) reste à faire : « Retrouver une moto » est local à
  l'espace arrivages et cherche dans le stock déjà écouté.
- **Un vrai gabarit PDF paginé** (en-têtes répétés, styles d'impression fins) : on
  s'en tient à une vue imprimable simple, lisible sur une page.

---

## Notes techniques

**Modèle — deux champs de plus, rien de neuf comme collection :**
- `motos.cmcRecu: boolean` — témoin « CMC en main ». Défaut `false` à l'entrée (lot
  comme unitaire). « CMC manquant » = `!cmcRecu`.
- `arrivages.annule: boolean` — drapeau d'annulation douce. Défaut `false`.

**Domaine lu (fonctions pures, TDD, aucun agrégat entretenu) :**
- `depuisQuand(date, maintenant)` → l'ancienneté en clair.
- `completudeCmc(motos, arrivageId)` → `{ total, recus, manquants }`.
- `bilanArrivages(arrivages, motos)` → les cinq compteurs de tête, sur les lots non
  annulés.
- `estEcoule(motos, arrivageId)` ; `filtrerArrivages(arrivages, motos, filtre)`.
- `chercherMotoParChassis(motos, requête)` → correspondances par égalité **ou** suffixe
  du châssis normalisé.

**Écriture (dépôt) :**
- `enregistrerArrivage`/`ecrireMotoDansLot` posent les défauts (`cmcRecu:false`,
  `annule:false`).
- `marquerCmcRecu(moto, recu, auteur)` — relit la moto, bascule `cmcRecu`, trace ;
  ne touche pas `prive/cout`.
- `modifierArrivage(id, saisie, auteur)` ; `annulerArrivage(id, annule, auteur)` ;
  `supprimerArrivage(id)` (lot vide seulement, garde côté écran).

**Sécurité (firestore.rules + `regles/`) :**
- `motoValide` : `cmcRecu` ajouté aux clés, `is bool`. La mise à jour d'une moto est
  déjà ouverte au gérant de sa boutique et au responsable.
- `arrivageValide` : `annule` ajouté aux clés, `is bool`. Mise à jour déjà ouverte.
- `arrivages` : `delete` passe de `false` à responsable **ou** gérant de la boutique
  du lot. La vacuité (0 moto) est gardée à l'écran ; les règles ne comptent pas les
  motos, mais un effacement d'entête ne détruit aucune moto (pas de cascade).
- Test prouvant qu'un gérant bascule `cmcRecu` **sans** écrire de `prive/cout`, qu'il
  annule un lot de sa boutique, et qu'il n'efface pas un lot d'une autre.

**Réutilisation (règle 1) :** `ecoulement`, `normaliserChassis`, `chassisDejaPris`
(indirectement), `PapiersMoto` (S11) pour joindre le scan, `ChoixOuNouveau`/
`SelectFournisseur` dans le modal de modification, patrons `Tableau`, `Champ`, `Etats`,
`usePerimetre`, `useAbonnement`.

**Rendu (règle 5, D66) :** aucune Cloud Function dans le chemin ; tout se lit du cache.
Le PDF est une page imprimable, pas un service.

---

## Ce qui a été vérifié

- **Unités** ✅ (`npm test`, **533 vertes**) : `depuisQuand` (jours puis mois),
  `completudeCmc`, `estEcoule`, `bilanArrivages` (annulés et unitaires exclus),
  `filtrerArrivages` (les trois onglets, annulés jamais listés), `chercherMotoParChassis`
  (égalité, suffixe, requête trop courte).
- **Règles** ✅ (`regles/arrivages.test.ts`, émulateur, **20 vertes**, suite règles
  complète verte) : bascule `cmcRecu` par le gérant (booléen exigé, coût jamais touché),
  drapeau `annule`, `delete` d'un arrivage par sa boutique et **refusé** ailleurs. Les
  deux validateurs restent **rétro-compatibles** : `cmcRecu`/`annule` facultatifs, donc
  les motos et lots d'avant S43 restent modifiables.
- **Types + lint** ✅ : `tsc` sans erreur de source, `eslint` propre.
- **Rendu** ✅ : le serveur de dev (projet réel) recompile `/motos/arrivages` et la sert
  en 200.
- **E2e** ✍️ **écrit, pas rejoué** (`e2e/arrivages.spec.ts`) : un lot suivi — inspecter,
  cocher un CMC reçu (la pastille passe de manquant à reçu), retrouver une moto par ses
  derniers caractères. À rejouer sur émulateurs : l'environnement de dev pointe sur le
  vrai projet, et la suite refuse de tourner hors émulateurs.
- **À faire pour clore** : déployer les règles sur le projet réel (les actions CMC /
  annuler / supprimer l'exigent), rejouer l'e2e sur émulateurs, captures clair/sombre.

---

Une fois la spec terminée : critères cochés, code vérifié (tests + rendu), revue des
trois contrats passée, commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
