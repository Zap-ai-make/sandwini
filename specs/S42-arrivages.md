# S42 — L'arrivage : faire entrer un lot de motos d'un même fournisseur

```
Statut     : terminée
Périmètre  : post-MVP
Dépend de  : S4, S5, S39, S40
```

---

## Objectif

Au comptoir, un arrivage arrive rarement moto par moto : c'est un lot d'un même
fournisseur, quarante motos d'un coup. Aujourd'hui il faut ouvrir quarante fois
l'écran de saisie unitaire. Cette spec donne **un seul formulaire** où l'on
choisit (ou ajoute) le fournisseur, puis, **par groupe de marque**, on renseigne
une fois ce qui est commun (marque, modèle, prix) et on saisit les châssis à la
chaîne. Un même lot peut mêler plusieurs marques : on ajoute un groupe pour
chacune. Le lot existe ensuite comme un tout : on sait de qui il vient, et combien
il en reste à vendre.

---

## Critères d'acceptation

- [x] `/motos/arrivages` enregistre en une passe un arrivage (nom, fournisseur, date)
      et N motos qui lui sont rattachées, chacune avec son numéro de châssis.
- [x] Le **fournisseur** se choisit dans une liste des existants, ou s'ajoute par un
      **bouton « ＋ »** qui superpose un modal (nom, téléphone, localité) sans quitter
      la saisie du lot ni perdre ce qui est déjà tapé.
- [x] Le lot se saisit **par groupes**. Un groupe fixe une fois sa **marque**, son
      **modèle** et (pour le responsable) son **prix d'achat**, puis un **nombre** de
      motos qui déroule autant de lignes à châssis. Le bouton **« Ajouter une marque »**
      ouvre un nouveau groupe : un même lot peut ainsi mêler plusieurs marques.
- [x] **Le coût reste cloisonné (D2/S39).** Le champ « prix d'achat » n'apparaît
      qu'au responsable, et par groupe. Un lot saisi par un **gérant** n'écrit **aucun**
      `prive/cout` — prouvé par un test de règles, pas seulement masqué dans l'écran.
- [x] Le contrôle d'unicité du châssis vaut **dans tout le lot** — deux lignes au même
      châssis, **groupes confondus** — **et** contre le stock existant (S40,
      `chassisDejaPris`) ; il n'écrit pas tant que le stock n'est pas lu (D95).
- [x] La **liste des arrivages** affiche l'**écoulement** de chaque lot (« vendues k / N »),
      calculé en lecture depuis le statut des motos rattachées.
- [x] Les états sont couverts : lot vide (aucune ligne valable → refus nommé),
      chargement (bouton qui annonce la lecture), erreur (message qui dit quoi corriger)
      — `DESIGN.md` §10.
- [x] Tout passe par le SDK Firestore : fournisseur, arrivage et motos s'enregistrent
      **sans réseau** (D66). Aucune Cloud Function dans le chemin de l'écran.
- [x] Les points de sécurité applicables sont respectés — portée boutique de l'arrivage,
      cloisonnement du coût — `SECURITY.md`.

---

## Hors périmètre

- **La saisie unitaire ne change pas.** `/motos/nouvelle` garde la provenance ; le
  fournisseur et l'arrivage sont l'affaire du lot. Une moto porte donc **soit** une
  provenance (unitaire) **soit** un arrivage (lot) — la validation exige l'un ou l'autre.
  Unifier les deux notions serait un autre lot.
- **La gestion du fichier fournisseurs** (renommer, désactiver, fusionner) n'est pas
  cet écran : on crée à la volée depuis le lot. Un écran de paramètres dédié, si besoin,
  est un autre lot.
- **L'unicité n'est pas rendue garantie** : deux appareils hors ligne peuvent créer le
  même châssis, aucune règle ne l'empêche (même borne que D94/D5). On ferme le doublon
  sur un seul appareil avec du réseau.
- **Les transferts inter-agences** du concurrent (déplacer une moto d'une boutique à
  l'autre) ne sont pas dans cette spec.

---

## Notes techniques

**Modèle.** Deux collections neuves, un champ de plus sur la moto :
- `fournisseurs/{id}` — niveau entreprise, comme les autres référentiels :
  `{ nom, telephone, localite, actif, ...trace }`. Pas de suppression.
- `arrivages/{id}` — rattaché à une boutique :
  `{ nom, fournisseurId, boutiqueId, date, description, dateCreation, ...trace }`.
- `motos.arrivageId: string | null` — nul pour la saisie unitaire.

**Écriture.** `preparerLot(saisie, sousLots, stock, voitCouts)` aplatit les groupes en
une liste de motos, chacune portant la marque, le modèle et le prix de son groupe, et
dédoublonne les châssis sur tout le lot. `enregistrerArrivage(saisie, motos, boutiqueId,
auteur, voitLesCouts)` écrit alors, sur un `writeBatch`, 1 doc arrivage + N motos (chacune
`arrivageId` renseigné) + un `prive/cout` par moto **seulement si responsable et prix
fourni**. Le prix est vidé dès `preparerLot` pour qui ne voit pas les coûts : aucun coût
ne franchit la frontière. On factorise depuis `motos.ts` le montage d'un document moto
plutôt que le dupliquer, et on réutilise `construireCout`. Plafond de lignes **par lot,
groupes confondus**, pour rester loin de la limite de 500 opérations d'un batch.

**Réutilisation.** `ChoixOuNouveau` pour la marque et le modèle de chaque groupe ;
`chassisDejaPris`,
`normaliserChassis`, `validerMoto` (adaptée), `peut(role,"voir_marges")`, `usePerimetre`,
`useCatalogue`. Le modal fournisseur est neuf : `ChoixOuNouveau` ne porte qu'un nom, pas
un téléphone ni une localité.

**Sécurité (firestore.rules + tests dans `regles/`).**
- `fournisseurs` : lecture si connecté, création/màj si connecté + validation ; pas de
  suppression (miroir de `provenances`).
- `arrivages` : lecture si responsable ou boutique du compte = boutique du lot ; création
  dans sa propre boutique + validation ; màj responsable ; pas de suppression.
- `motos/prive/cout` : **inchangé**. Le test prouve qu'un lot « gérant » n'y écrit rien.

**Décisions tranchées** (au cadrage, avec le commanditaire) :
1. Provenance et fournisseur **coexistent** : la saisie unitaire garde la provenance, le lot
   porte le fournisseur. La saisie unitaire n'est pas touchée.
2. Fournisseur = **nom, téléphone, localité** (le nom seul obligatoire).
3. Liste des arrivages sur sa propre route `/motos/arrivages`, avec l'écoulement.
4. Plafond de **80** lignes par lot.

---

## Ce qui a été vérifié

- **Domaine** en TDD (`fournisseur`, `arrivage`, `validerChassis` extrait de `moto`) :
  validation de l'entête (`validerArrivage`) et de chaque groupe (`validerSousLot`),
  `preparerLot` (aplatissement des groupes, unicité **inter-groupes** et vs stock, D95,
  prix vidé hors coûts), `ajusterNombreDeLignes`, `ecoulement`. Suite unité **518 verte**.
- **Règles** en TDD (`regles/arrivages.test.ts`, exécutées sur émulateur) : cloisonnement
  du coût dans un lot « gérant », portée boutique des arrivages, validation des
  fournisseurs. `motoValide` accepte l'origine provenance **ou** arrivage. **14 tests**.
  Le passage aux groupes ne touche ni les règles ni ces tests (documents bruts).
- **E2e** (`e2e/arrivages.spec.ts`, sur émulateurs) : suite portée à **3 cas** — le lot
  d'une marque, le refus de deux châssis identiques, et **un lot à deux marques** (bouton
  « Ajouter une marque », un groupe par marque, deux motos en stock chacune sous la sienne).
  **Rejoué sur émulateurs jetables** (`npm run test:e2e:propre`), **vert** — les cas de lot
  ont dû retenter une fois sous la contention S27, verts au rejeu.
- **Rendu** : le serveur de dev (projet réel) recompile `/motos/arrivages` et la sert en
  200. `tsc` sans erreur de source, `eslint` propre.
- **Rendu regardé** (règle 5) : `captures/arrivage-modal-clair.png`,
  `arrivage-modal-sombre.png`, `arrivage-modal-fournisseur-clair.png`,
  `arrivages-liste-bureau-clair.png`.

**Deux défauts trouvés au rendu, et corrigés** — invisibles aux tests de domaine :
1. Le `<form>` de la modal fournisseur, imbriqué dans celui du lot, faisait partir le
   lot sans fournisseur. Puis, la modal fournisseur en `<dialog>` natif **imbriqué** dans
   le `<dialog>` du lot refermait ce dernier (les deux modals natifs se chassaient). La
   modal fournisseur est devenue un **calque** simple, posé dans le dialogue parent.
2. Le `<dialog>` du lot n'était pas centré : la Preflight de Tailwind remet `margin:0`
   partout, ce qui annule le centrage natif. Recentré à la main (`fixed inset-0 m-auto`).

---

Une fois la spec terminée : critères cochés, code vérifié (tests + rendu), revue des
trois contrats passée, commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
