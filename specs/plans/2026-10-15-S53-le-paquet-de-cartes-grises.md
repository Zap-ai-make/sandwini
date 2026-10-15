# S53 — Le paquet de cartes grises : plan d'implémentation

> **Pour les exécutants :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** confier plusieurs cartes grises à un prestataire **en un seul geste**,
avec une seule sortie de caisse, et laisser le retour se faire carte par carte.

**Architecture :** une collection de premier niveau `lotsCartesGrises/{id}` sur
le modèle de `transfertsMotos` (S17). Elle **groupe** sans remplacer : chaque
document `carte_grise` continue de porter son `prestataireId`, son `deposeLe` et
son `avance`, parce que les règles Firestore évaluent chaque écriture d'un lot
contre l'état d'**avant** le lot. Le paquet n'a pas d'état stocké : il est
**soldé par calcul** quand aucune de ses cartes n'est plus dehors.

**Pile :** Next.js 16 App Router, TypeScript strict, Firestore, Vitest,
`@firebase/rules-unit-testing`, Playwright.

**Spec :** `specs/S53-les-papiers-d-une-moto.md`, section « Le paquet, en
Firestore » et ses critères d'acceptation.

**Premier plan :** `specs/plans/2026-10-15-S53-les-papiers-d-une-moto.md`,
exécuté et livré (commits `b408656`..`0103c6e`). Ce plan s'empile dessus et
suppose `etatPapier`, `PapierMoto`, `emporte` et la machine à états raccourcie
déjà en place.

## Contraintes globales

- **TDD obligatoire** (D103) : le test échoue d'abord, et on le voit échouer.
- **Tout en français**, y compris les noms de symboles et les commentaires. Les
  commentaires disent **pourquoi**, jamais quoi.
- **Jamais `prettier`** sur ce dépôt.
- **Messages de commit** : `S53 : <phrase à l'indicatif>`, sujet **sans accents**.
- **Pas de passe e2e complète.** Un fichier ciblé à la fois, sur des émulateurs
  qui viennent de démarrer.
- **Lancer les tests e2e** exige de déplacer `.env.local.emulateurs` →
  `.env.local`, **puis de recompiler**, et de **remettre le fichier en place**
  après. Puis de **rebâtir pour le vrai projet**, parce que `swDest` ne suit pas
  `NEXT_DIST_DIR` et qu'un build émulateurs empoisonne `public/sw.js`.
- **Aucune suppression de données** sur `sandwini` dans ce plan.
- **`rtk vitest run <fichier>`** et non `rtk npx vitest run` : le filtre rtk
  traduit le second en `npm run vitest`, script qui n'existe pas.
- Commandes préfixées de `rtk`.

## Points de vigilance

Cinq classes d'entrée que la spec implique sans qu'aucune tâche ne les exerce
naturellement. Chacune reçoit son test dans la tâche qui porte le code.

1. **Un paquet dont une vente a été renumérotée** (`-B`) garde son `venteId` :
   l'identifiant du document ne change pas, seul le numéro affiché change.
   `etatPaquet` doit donc compter sur les identifiants, jamais sur les numéros.
   → Tâche 2.
2. **Un paquet dont les documents ne sont pas encore lus** ne doit pas passer
   pour soldé. Une liste vide et « toutes revenues » rendraient le même
   résultat sur un compteur naïf. → Tâche 2.
3. **Deux cartes grises de la même vente** sont structurellement impossibles —
   le type est l'identifiant du document — mais **la même vente choisie deux
   fois** dans une sélection d'écran l'est. → Tâche 1.
4. **Un paquet à zéro carte** doit être refusé : il écrirait une sortie de
   caisse sans contrepartie. → Tâche 1.
5. **Une carte déjà chez un prestataire** ne doit pas pouvoir entrer dans un
   nouveau paquet : l'avance serait versée deux fois. → Tâche 4.

---

## Structure des fichiers

| Fichier | Responsabilité après ce plan |
|---|---|
| `lib/domain/paquet.ts` | le type, la borne, `validerPaquet`, `etatPaquet` |
| `lib/domain/paquet.test.ts` | les deux fonctions pures |
| `lib/repositories/paquets.ts` | `confierPaquet` (le lot), `ecouterPaquets` |
| `firestore.rules` | `match /lotsCartesGrises/{id}` |
| `regles/paquets.test.ts` | le périmètre, la forme, l'immuabilité |
| `components/ConfierPaquetModal.tsx` | le formulaire d'un dépôt groupé |
| `components/PaquetsEnCours.tsx` | une ligne par paquet, avec son détail |
| `app/(app)/motos/dossiers/page.tsx` | la sélection, la barre d'action |
| `e2e/paquet.spec.ts` | le témoin de bout en bout |

---

### Tâche 1 : le domaine borne et valide un paquet

**Fichiers :**
- Créer : `lib/domain/paquet.ts`, `lib/domain/paquet.test.ts`

**Interfaces :**
- Produit : `CARTES_PAR_PAQUET_MAX`, `SaisiePaquet`, `validerPaquet(saisie): string | null`
- Consomme : `lireJour`, `lireMontant`, `MONTANT_MAX` de `lib/domain/dossier.ts`
  et `lib/domain/vente.ts`

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `lib/domain/paquet.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { CARTES_PAR_PAQUET_MAX, validerPaquet, type SaisiePaquet } from "./paquet";

const SAISIE: SaisiePaquet = {
  prestataireId: "p1",
  prestataireNom: "Ouédraogo Plaques",
  deposeLe: "2026-10-15",
  avance: "150000",
  moyenPaiement: "especes",
  disponibleLe: "",
  venteIds: ["v1", "v2", "v3"],
};

describe("validerPaquet", () => {
  it("accepte un paquet complet", () => {
    expect(validerPaquet(SAISIE)).toBeNull();
  });

  /* **Point de vigilance 4.** Un paquet sans carte écrirait une sortie de
     caisse sans contrepartie : de l'argent parti pour rien. */
  it("refuse un paquet sans carte", () => {
    expect(validerPaquet({ ...SAISIE, venteIds: [] })).toMatch(/au moins une carte/i);
  });

  /* **Point de vigilance 3.** L'écran coche des lignes ; rien n'empêche deux
     cases de désigner la même vente si la liste se recompose sous les doigts.
     Deux écritures sur le même document dans un lot Firestore sont refusées
     en bloc — autant le dire ici, où le message est lisible. */
  it("refuse deux fois la même vente", () => {
    expect(validerPaquet({ ...SAISIE, venteIds: ["v1", "v2", "v1"] })).toMatch(/deux fois/i);
  });

  it("refuse au-delà de la borne, et la borne est dans le message", () => {
    const trop = Array.from({ length: CARTES_PAR_PAQUET_MAX + 1 }, (_, rang) => `v${rang}`);
    const message = validerPaquet({ ...SAISIE, venteIds: trop });
    expect(message).toContain(String(CARTES_PAR_PAQUET_MAX));
  });

  it("accepte exactement la borne", () => {
    const pile = Array.from({ length: CARTES_PAR_PAQUET_MAX }, (_, rang) => `v${rang}`);
    expect(validerPaquet({ ...SAISIE, venteIds: pile })).toBeNull();
  });

  it("refuse un paquet sans prestataire", () => {
    expect(validerPaquet({ ...SAISIE, prestataireId: "" })).toMatch(/prestataire/i);
  });

  /* Même règle que le dépôt carte par carte : zéro n'est pas une avance, c'est
     un travail confié à crédit, et le crédit se modélise ailleurs. */
  it("refuse une avance nulle", () => {
    expect(validerPaquet({ ...SAISIE, avance: "0" })).toMatch(/crédit/i);
  });

  it("refuse une date annoncée antérieure au dépôt", () => {
    expect(validerPaquet({ ...SAISIE, disponibleLe: "2026-10-01" })).toMatch(/antérieure/i);
  });
});
```

- [ ] **Étape 2 : voir les tests échouer**

Lancer : `rtk vitest run lib/domain/paquet.test.ts`
Attendu : ÉCHEC — le module `./paquet` n'existe pas.

- [ ] **Étape 3 : écrire le minimum**

Créer `lib/domain/paquet.ts` :

```ts
/**
 * Le paquet de cartes grises (S53, arbitrages 2, 6 et 9).
 *
 * Le commanditaire : « *la remise au prestataire se fait par paquet. On tend
 * dix cartes grises.* » Le produit ne savait confier qu'une carte à la fois —
 * dix dépôts, dix sorties de caisse, dix fois le même nom de prestataire tapé.
 *
 * **Un paquet groupe, il ne remplace pas.** Chaque document `carte_grise`
 * continue de porter son `prestataireId`, son `deposeLe` et son `avance` :
 * les règles Firestore évaluent chaque écriture d'un lot contre l'état
 * d'**avant** le lot (la leçon de S5, redite en S17), donc un document validé
 * contre un paquet créé dans le même lot serait refusé. `depotRenseigne` reste
 * vrai mot pour mot, et les écrans de dossier existants continuent de marcher.
 */

import { lireJour, lireMontant, MONTANT_MAX } from "./dossier";
import type { MoyenPaiement } from "./vente";

/**
 * Le nombre de cartes qu'un paquet peut porter.
 *
 * **La borne vient du calcul, pas du confort.** Un lot Firestore accepte 500
 * écritures. Un paquet en fait `2N + 2` : le document du paquet, puis par carte
 * une mise à jour du document et une ligne d'historique, plus l'encaissement
 * unique de l'avance. `2N + 2 ≤ 500` donne `N ≤ 249`.
 *
 * C'est un **plafond**, pas une cible : le geste réel en tend dix. Mais une
 * borne choisie au hasard se révèle un jour fausse dans le mauvais sens, alors
 * que celle-ci est la limite au-delà de laquelle l'écriture échouerait en bloc,
 * sans message utile.
 */
export const CARTES_PAR_PAQUET_MAX = 249;

export type SaisiePaquet = {
  prestataireId: string;
  /** Recopié sur le paquet et sur chaque document : une ligne se lit sans
      rouvrir une fiche de prestataire. Même raison qu'au dépôt unitaire. */
  prestataireNom: string;
  /** Format de `<input type="date">` : `aaaa-mm-jj`. */
  deposeLe: string;
  avance: string;
  /** L'avance sort de la caisse : par quel moyen, il faut le dire. */
  moyenPaiement: MoyenPaiement;
  /** Facultatif. Même format. */
  disponibleLe: string;
  /** Les ventes dont la carte grise part. Une par carte. */
  venteIds: readonly string[];
};

/**
 * Le refus à montrer, ou `null` si le paquet peut partir.
 *
 * **Les mêmes règles que le dépôt unitaire, plus celles du nombre.** L'avance
 * strictement positive et la date annoncée postérieure au dépôt ne sont pas
 * redites par confort : ce sont les conditions que `depotRenseigne` impose côté
 * serveur à chaque document du lot, et les faire échouer là-bas donnerait un
 * refus illisible sur un geste déjà affiché comme fait.
 */
export function validerPaquet(saisie: SaisiePaquet): string | null {
  if (!saisie.prestataireId) {
    return "Choisissez le prestataire à qui vous confiez les cartes grises.";
  }

  if (saisie.venteIds.length === 0) {
    return "Choisissez au moins une carte grise à confier.";
  }

  /* Deux écritures sur le même document dans un lot Firestore font échouer le
     lot entier, sans dire laquelle. Le doublon se refuse donc ici, où le
     message est lisible. */
  if (new Set(saisie.venteIds).size !== saisie.venteIds.length) {
    return "La même vente figure deux fois dans la sélection.";
  }

  if (saisie.venteIds.length > CARTES_PAR_PAQUET_MAX) {
    return `Un paquet porte au plus ${CARTES_PAR_PAQUET_MAX} cartes grises. Faites-en deux.`;
  }

  const depose = lireJour(saisie.deposeLe);
  if (!depose) return "Indiquez la date du dépôt.";

  const montant = lireMontant(saisie.avance);
  if (montant === null) {
    return "L’avance doit être un montant en francs, sans virgule ni centimes.";
  }
  if (montant <= 0) {
    return "Une avance est un premier versement : sans montant, le travail est confié à crédit.";
  }
  if (montant > MONTANT_MAX) return "L’avance dépasse le maximum admis.";

  if (saisie.disponibleLe) {
    const disponible = lireJour(saisie.disponibleLe);
    if (!disponible) return "La date de disponibilité annoncée n’est pas une date.";
    if (disponible < depose) return "La date annoncée est antérieure au dépôt.";
  }

  return null;
}
```

- [ ] **Étape 4 : voir les tests passer**

Lancer : `rtk vitest run lib/domain/paquet.test.ts`
Attendu : SUCCÈS, 8 tests.

- [ ] **Étape 5 : commit**

```bash
rtk git add lib/domain/paquet.ts lib/domain/paquet.test.ts
rtk git commit -m "S53 : le domaine borne un paquet de cartes grises"
```

---

### Tâche 2 : l'état d'un paquet se calcule, il ne se stocke pas

**Fichiers :**
- Modifier : `lib/domain/paquet.ts`, `lib/domain/paquet.test.ts`

**Interfaces :**
- Produit : `PaquetCartesGrises`, `EtatPaquet`, `etatPaquet(paquet, documents, aujourdhui): EtatPaquet`
- Consomme : `DocumentDossier` de `lib/domain/vente.ts`, `joursEcoules` de
  `lib/domain/dossier.ts`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à `lib/domain/paquet.test.ts` :

```ts
describe("etatPaquet", () => {
  const AUJOURDHUI = new Date("2026-10-27T10:00:00");

  const paquet = (partie: Partial<PaquetCartesGrises> = {}): PaquetCartesGrises => ({
    id: "lot1",
    boutiqueId: "PTG",
    prestataireId: "p1",
    prestataireNom: "Ouédraogo Plaques",
    deposeLe: new Date("2026-10-15T12:00:00"),
    disponibleLe: null,
    avance: 150_000,
    venteIds: ["v1", "v2", "v3"],
    ...partie,
  });

  const carte = (venteId: string, statut: StatutDocument): DocumentDossier =>
    ({ id: "carte_grise", venteId, type: "carte_grise", statut }) as DocumentDossier;

  it("compte ce qui est dehors et ce qui est revenu", () => {
    const etat = etatPaquet(
      paquet(),
      [
        carte("v1", "revenu_magasin"),
        carte("v2", "chez_prestataire"),
        carte("v3", "chez_prestataire"),
      ],
      AUJOURDHUI,
    );
    expect(etat).toMatchObject({ total: 3, dehors: 2, revenues: 1, solde: false });
  });

  /* **Arbitrage 9 : le retour est partiel par défaut.** « Il peut partir avec
     10 et ramener 5 si c'est ce qui est dispo. » Cinq revenues ne soldent pas
     le paquet, et aucun geste n'a à le dire. */
  it("reste ouvert sur un retour partiel, sans qu’aucun geste ne le dise", () => {
    const etat = etatPaquet(
      paquet(),
      [carte("v1", "revenu_magasin"), carte("v2", "revenu_magasin"), carte("v3", "chez_prestataire")],
      AUJOURDHUI,
    );
    expect(etat.solde).toBe(false);
    expect(etat.dehors).toBe(1);
  });

  it("est soldé par calcul quand plus rien n’est dehors", () => {
    const etat = etatPaquet(
      paquet(),
      [
        carte("v1", "revenu_magasin"),
        carte("v2", "revenu_magasin"),
        carte("v3", "revenu_magasin"),
      ],
      AUJOURDHUI,
    );
    expect(etat.solde).toBe(true);
    expect(etat.dehors).toBe(0);
  });

  /* **Point de vigilance 2.** Une liste vide et « toutes revenues » rendent le
     même compte de cartes dehors : zéro. Sans distinction, un paquet dont les
     documents ne sont pas encore lus s'afficherait soldé. */
  it("n’est pas soldé tant que ses documents ne sont pas lus", () => {
    expect(etatPaquet(paquet(), [], AUJOURDHUI).solde).toBe(false);
    expect(etatPaquet(paquet(), [], AUJOURDHUI).lu).toBe(false);
  });

  /* **Point de vigilance 1.** Une vente renumérotée garde son identifiant :
     seul son numéro affiché gagne un `-B`. Le rapprochement se fait donc sur
     `venteId`, jamais sur le numéro. */
  it("ne retient que les cartes de ses propres ventes", () => {
    const etat = etatPaquet(
      paquet(),
      [carte("v1", "revenu_magasin"), carte("etrangere", "chez_prestataire")],
      AUJOURDHUI,
    );
    expect(etat.total).toBe(3);
    expect(etat.revenues).toBe(1);
    expect(etat.dehors).toBe(0);
  });

  it("compte les jours depuis le dépôt, de jour à jour", () => {
    expect(etatPaquet(paquet(), [], AUJOURDHUI).joursDehors).toBe(12);
  });

  /* Le retard est le seul signal qui vaut un rappel : un paquet annoncé pour
     une date dépassée et toujours dehors. */
  it("dit le retard quand la date annoncée est passée et qu’il reste des cartes", () => {
    const annonce = paquet({ disponibleLe: new Date("2026-10-20T12:00:00") });
    expect(etatPaquet(annonce, [carte("v1", "chez_prestataire")], AUJOURDHUI).enRetard).toBe(true);
  });

  it("ne dit pas le retard quand tout est revenu, même après la date", () => {
    const annonce = paquet({ venteIds: ["v1"], disponibleLe: new Date("2026-10-20T12:00:00") });
    expect(etatPaquet(annonce, [carte("v1", "revenu_magasin")], AUJOURDHUI).enRetard).toBe(false);
  });
});
```

Ajouter aux imports du fichier de test :

```ts
import type { DocumentDossier, StatutDocument } from "./vente";
import { etatPaquet, type PaquetCartesGrises } from "./paquet";
```

- [ ] **Étape 2 : voir les tests échouer**

Lancer : `rtk vitest run lib/domain/paquet.test.ts`
Attendu : ÉCHEC — `etatPaquet is not a function`.

- [ ] **Étape 3 : écrire le minimum**

Ajouter à `lib/domain/paquet.ts` :

```ts
/** Un paquet tel qu'il est stocké. Aucun champ d'état : il se calcule. */
export type PaquetCartesGrises = {
  id: string;
  boutiqueId: string;
  prestataireId: string;
  prestataireNom: string;
  deposeLe: Date | null;
  disponibleLe: Date | null;
  avance: number;
  venteIds: readonly string[];
};

export type EtatPaquet = {
  total: number;
  dehors: number;
  revenues: number;
  /** Plus rien dehors, et les documents ont répondu. Jamais un champ stocké. */
  solde: boolean;
  /** Les documents du paquet sont-ils parvenus ? Faux : on ne sait pas encore. */
  lu: boolean;
  joursDehors: number | null;
  enRetard: boolean;
};

/**
 * Ce qu'un paquet montre, recompté à chaque lecture (D61).
 *
 * **Un paquet n'a pas d'état « rendu », et c'est délibéré.** Lui en donner un
 * rouvrirait la contradiction B sous un autre nom : le champ dirait « soldé »
 * pendant qu'une carte serait encore chez le prestataire, et il faudrait un
 * geste pour les raccorder. Ici, le solde **est** l'absence de carte dehors.
 *
 * Le rapprochement se fait sur `venteId`. Une vente renumérotée garde le sien —
 * seul son numéro affiché gagne un `-B` (D5) —, donc un paquet ne perd jamais
 * une carte parce que deux appareils se sont disputé un numéro.
 */
export function etatPaquet(
  paquet: PaquetCartesGrises,
  documents: readonly DocumentDossier[],
  aujourdhui: Date,
): EtatPaquet {
  const siennes = new Set(paquet.venteIds);
  const cartes = documents.filter(
    (document) => document.type === "carte_grise" && siennes.has(document.venteId),
  );

  const dehors = cartes.filter((carte) => carte.statut === "chez_prestataire").length;
  const revenues = cartes.filter((carte) => carte.statut === "revenu_magasin").length;

  /* **Une liste vide n'est pas un paquet soldé.** Les deux rendent zéro carte
     dehors ; sans ce drapeau, un paquet dont l'écoute n'a pas encore répondu
     s'afficherait rendu, sur un écran qu'on vient justement consulter pour
     savoir ce qui reste dehors (D95). */
  const lu = cartes.length > 0;

  return {
    total: paquet.venteIds.length,
    dehors,
    revenues,
    solde: lu && dehors === 0,
    lu,
    joursDehors: joursEcoules(paquet.deposeLe, aujourdhui),
    /* Le retard d'un paquet soldé n'intéresse personne : les cartes sont là,
       la date annoncée est de l'histoire. */
    enRetard:
      lu &&
      dehors > 0 &&
      paquet.disponibleLe !== null &&
      estEnRetard(paquet.disponibleLe, aujourdhui),
  };
}
```

Ajouter aux imports de `lib/domain/paquet.ts` :

```ts
import { estEnRetard, joursEcoules, lireJour, lireMontant, MONTANT_MAX } from "./dossier";
import type { DocumentDossier, MoyenPaiement } from "./vente";
```

- [ ] **Étape 4 : voir les tests passer**

Lancer : `rtk vitest run lib/domain/paquet.test.ts`
Attendu : SUCCÈS, 16 tests.

- [ ] **Étape 5 : la suite entière**

Lancer : `rtk vitest run`
Attendu : 796 tests d'avant + 16, tous verts.

- [ ] **Étape 6 : commit**

```bash
rtk git add lib/domain/paquet.ts lib/domain/paquet.test.ts
rtk git commit -m "S53 : un paquet est solde par calcul, jamais par un champ"
```

---

### Tâche 3 : les règles portent le paquet

**Fichiers :**
- Modifier : `firestore.rules`
- Créer : `regles/paquets.test.ts`

**Interfaces :**
- Consomme : `CARTES_PAR_PAQUET_MAX` de la tâche 1 (la borne est redite en
  règle, voir le commentaire de l'étape 3)

- [ ] **Étape 1 : écrire les tests de règles qui échouent**

Créer `regles/paquets.test.ts` :

```ts
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Les règles du paquet de cartes grises (S53).
 *
 * **Une trace de premier niveau, comme `transfertsMotos` (S17).** Un paquet se
 * liste par sa boutique sans requête de groupe de collections, et il ne se
 * modifie jamais : on corrige en faisant revenir les cartes, ce qui laisse les
 * deux traces.
 */

const HOTE = "127.0.0.1";
const PORT = 8181;

let env: RulesTestEnvironment;

const responsable = () =>
  env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const audit = (uid = "ger-1") => ({
  createdAt: serverTimestamp(),
  createdBy: uid,
  createdByName: "Gérant",
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  updatedByName: "Gérant",
});

const paquet = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  prestataireId: "p1",
  prestataireNom: "Ouédraogo Plaques",
  deposeLe: new Date("2026-10-15T12:00:00"),
  disponibleLe: null,
  avance: 150_000,
  venteIds: ["v1", "v2"],
  ...audit(),
  ...partie,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-paquets",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), "lotsCartesGrises/lot-ptg"), paquet());
    await setDoc(doc(contexte.firestore(), "lotsCartesGrises/lot-kdg"), paquet({ boutiqueId: "KDG" }));
  });
});

describe("le paquet de cartes grises", () => {
  it("le gérant confie un paquet dans sa boutique", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "lotsCartesGrises"), paquet()));
  });

  /* **Le critère de la spec, nommément.** Un gérant ne lit ni n'écrit le
     paquet d'une autre boutique. */
  it("refuse le paquet d’une autre boutique, en lecture comme en écriture", async () => {
    await assertFails(getDoc(doc(gerant(), "lotsCartesGrises/lot-kdg")));
    await assertFails(
      addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ boutiqueId: "KDG" })),
    );
  });

  it("le responsable lit toutes les boutiques", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "lotsCartesGrises/lot-kdg")));
  });

  it("le gérant liste les paquets de sa boutique", async () => {
    await assertSucceeds(
      getDocs(query(collection(gerant(), "lotsCartesGrises"), where("boutiqueId", "==", "PTG"))),
    );
  });

  it("refuse un paquet sans carte : l’avance partirait sans contrepartie", async () => {
    await assertFails(addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ venteIds: [] })));
  });

  it("refuse une avance nulle — sans montant, c’est un crédit", async () => {
    await assertFails(addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ avance: 0 })));
  });

  it("refuse un prestataire vide", async () => {
    await assertFails(
      addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ prestataireId: "" })),
    );
  });

  it("refuse un champ inventé", async () => {
    await assertFails(
      addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ rendu: true })),
    );
  });

  /* Un paquet est un fait. Lui donner un état modifiable rouvrirait la
     contradiction que `etatPaquet` ferme en le calculant. */
  it("ne se modifie ni ne se supprime, pour personne", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "lotsCartesGrises/lot-ptg"), {
        avance: 1,
        updatedAt: serverTimestamp(),
        updatedBy: "resp-1",
        updatedByName: "Responsable",
      }),
    );
    await assertFails(deleteDoc(doc(responsable(), "lotsCartesGrises/lot-ptg")));
  });
});
```

- [ ] **Étape 2 : voir les tests échouer**

Lancer : `rtk vitest run --config vitest.regles.config.mts regles/paquets.test.ts`
Attendu : ÉCHEC — aucune règle ne couvre `lotsCartesGrises`, donc le refus par
défaut fait tomber les cas qui doivent réussir.

- [ ] **Étape 3 : écrire la règle**

Dans `firestore.rules`, après le bloc `match /transfertsMotos/{transfertId}` :

```
    // --- Paquets de cartes grises (S53) -------------------------------------
    // « On tend dix cartes grises. » Le paquet GROUPE un depot, il ne le
    // remplace pas : chaque document `carte_grise` continue de porter son
    // prestataire, sa date et son avance, parce que les regles evaluent chaque
    // ecriture d'un lot contre l'etat d'AVANT le lot — un document valide
    // contre un paquet cree dans le meme lot serait refuse (lecon de S5,
    // redite en S17).
    //
    // Une trace de premier niveau, comme `transfertsMotos` : elle se liste par
    // boutique sans requete de groupe de collections.
    //
    // **Aucun champ d'etat.** Un paquet est solde quand aucune de ses cartes
    // n'est plus dehors, ce qui se calcule (`lib/domain/paquet.ts`). Un champ
    // « rendu » dirait un jour le contraire de ses documents.
    function paquetCartesGrisesValide(donnees) {
      return donnees.keys().hasOnly(['boutiqueId', 'prestataireId', 'prestataireNom',
                                     'deposeLe', 'disponibleLe', 'avance',
                                     'venteIds'].concat(champsAudit()))
             && donnees.keys().hasAll(['boutiqueId', 'prestataireId', 'prestataireNom',
                                       'deposeLe', 'disponibleLe', 'avance',
                                       'venteIds'].concat(champsAudit()))
             && donnees.boutiqueId is string
             && donnees.prestataireId is string
             && donnees.prestataireId.size() > 0
             && texteBorne(donnees.prestataireNom, 80)
             && dateAppareil(donnees.deposeLe)
             && (donnees.disponibleLe == null || dateAppareil(donnees.disponibleLe))
             // Strictement positive, comme au depot unitaire : une avance a
             // zero n'est pas une avance, c'est un travail confie a credit.
             && montantValide(donnees.avance)
             && donnees.avance > 0
             && donnees.venteIds is list
             // Un paquet vide ferait sortir l'avance sans contrepartie.
             && donnees.venteIds.size() > 0
             // La borne redit `CARTES_PAR_PAQUET_MAX` du domaine, et cette
             // repetition est voulue (D27) : le domaine decide de ce qu'il
             // PROPOSE, la base de ce qu'elle ACCEPTE. 249 est la limite de 500
             // ecritures par lot divisee par les 2 ecritures que chaque carte
             // coute, moins le paquet et l'encaissement.
             && donnees.venteIds.size() <= 249;
    }

    match /lotsCartesGrises/{paquetId} {
      allow read: if estResponsable() || estGerantDe(resource.data.boutiqueId);
      allow create: if paquetCartesGrisesValide(request.resource.data)
                    && traceCreation(request.resource.data)
                    && peutVendrePour(request.resource.data.boutiqueId);
      // Un paquet est un fait. On le corrige en faisant revenir les cartes, ce
      // qui laisse les deux traces.
      allow update, delete: if false;
    }
```

- [ ] **Étape 4 : voir les tests passer**

Lancer : `rtk vitest run --config vitest.regles.config.mts regles/paquets.test.ts`
Attendu : SUCCÈS, 9 tests.

- [ ] **Étape 5 : la suite des règles entière**

Lancer : `rtk vitest run --config vitest.regles.config.mts`
Attendu : 400 tests d'avant + 9, tous verts.

- [ ] **Étape 6 : commit**

```bash
rtk git add firestore.rules regles/paquets.test.ts
rtk git commit -m "S53 : les regles portent le paquet, qui ne se modifie jamais"
```

---

### Tâche 4 : le dépôt groupé part en un seul lot

**Fichiers :**
- Créer : `lib/repositories/paquets.ts`
- Modifier : `lib/domain/paquet.ts`, `lib/domain/paquet.test.ts`

**Interfaces :**
- Produit : `confierPaquet(saisie, cartes, boutiqueId, auteur): Promise<string>`,
  `ecouterPaquets(boutiqueId, auChangement, enErreur)`,
  `cartesConfiables(documents): DocumentDossier[]`
- Consomme : `validerPaquet` (tâche 1), `PaquetCartesGrises` (tâche 2)

- [ ] **Étape 1 : écrire le test du domaine qui échoue**

Ajouter à `lib/domain/paquet.test.ts` :

```ts
describe("cartesConfiables", () => {
  const carte = (venteId: string, statut: StatutDocument): DocumentDossier =>
    ({ id: "carte_grise", venteId, type: "carte_grise", statut }) as DocumentDossier;

  /* **Point de vigilance 5.** Une carte déjà chez un prestataire ne peut pas
     entrer dans un nouveau paquet : l'avance serait versée deux fois pour le
     même travail, et la base refuserait la transition en bloc — un refus muet
     sur un geste déjà affiché comme fait. */
  it("ne retient que les cartes grises encore à faire", () => {
    const confiables = cartesConfiables([
      carte("v1", "a_faire"),
      carte("v2", "chez_prestataire"),
      carte("v3", "revenu_magasin"),
      carte("v4", "non_applicable"),
      carte("v5", "a_faire"),
    ]);
    expect(confiables.map((carte) => carte.venteId)).toEqual(["v1", "v5"]);
  });

  it("écarte les papiers qui ne passent pas par un prestataire", () => {
    const quittance = { id: "quittance", venteId: "v9", type: "quittance", statut: "a_faire" };
    expect(cartesConfiables([quittance as DocumentDossier])).toEqual([]);
  });
});
```

- [ ] **Étape 2 : voir le test échouer**

Lancer : `rtk vitest run lib/domain/paquet.test.ts`
Attendu : ÉCHEC — `cartesConfiables is not a function`.

- [ ] **Étape 3 : écrire le minimum**

Ajouter à `lib/domain/paquet.ts` :

```ts
/**
 * Les cartes grises qu'un paquet peut emporter.
 *
 * **Une carte déjà dehors n'y entre pas**, et ce filtre n'est pas décoratif :
 * la transition `chez_prestataire → chez_prestataire` n'existe pas, donc le lot
 * entier serait refusé par la base — sans dire laquelle des dix cartes a fauté,
 * et après que l'écran a montré le dépôt comme fait. Verser deux fois une
 * avance pour le même travail serait le vrai dégât.
 */
export function cartesConfiables(
  documents: readonly DocumentDossier[],
): readonly DocumentDossier[] {
  return documents.filter(
    (document) => document.type === "carte_grise" && document.statut === "a_faire",
  );
}
```

- [ ] **Étape 4 : voir le test passer**

Lancer : `rtk vitest run lib/domain/paquet.test.ts`
Attendu : SUCCÈS, 18 tests.

- [ ] **Étape 5 : écrire le dépôt groupé**

Créer `lib/repositories/paquets.ts` :

```ts
"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { lireJour, lireMontant } from "@/lib/domain/dossier";
import {
  validerPaquet,
  type PaquetCartesGrises,
  type SaisiePaquet,
} from "@/lib/domain/paquet";
import type { DocumentDossier } from "@/lib/domain/vente";
import { db } from "@/lib/firebase/client";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { traceCreation, traceModification, type Auteur } from "@/lib/repositories/referentiels";

/**
 * Confie plusieurs cartes grises en une fois (S53, arbitrages 2 et 6).
 *
 * **Tout part ensemble, ou rien ne part.** Un `writeBatch` unique porte le
 * paquet, les `N` documents passés à `chez_prestataire`, les `N` lignes
 * d'historique, et **une seule** sortie de caisse. Un dépôt à moitié écrit
 * laisserait des cartes dehors sans paquet pour les rassembler, ou un paquet
 * qui promet dix cartes dont trois seraient restées au magasin.
 *
 * **Une seule sortie de caisse, et c'est un critère de la spec.** Dix sorties
 * de 15 000 pour une avance de 150 000 rendraient le journal illisible et
 * feraient croire à dix décisions. L'avance est un geste, elle s'écrit une
 * fois, et son `origineRefId` est le paquet — qui porte le détail.
 *
 * **Pas de `posteId`, et le critère de la spec est quand même tenu.** « Elle se
 * range dans un poste de dépense (S55) » : S55 a prévu ce cas en repliant
 * `libelleDuPoste` sur l'origine quand aucun poste n'est posé, et
 * `avance_prestataire` est l'une de ces origines. L'avance apparaît donc dans
 * le bloc analytique sous son propre nom, sans qu'il faille créer une ligne de
 * référentiel que personne n'a demandée — et sans faire dépendre un dépôt de
 * l'existence d'un poste. Ne pas inventer de poste ici est le choix, pas un
 * oubli.
 *
 * Chaque document garde malgré tout son `prestataireId`, son `deposeLe` et son
 * `avance` : les règles évaluent chaque écriture du lot contre l'état d'avant
 * le lot, donc elles ne peuvent pas lire un paquet créé dans le même lot. C'est
 * `depotRenseigne` qui l'exige, mot pour mot, et les écrans existants
 * continuent de lire ces champs.
 *
 * **L'avance est répartie, pas répétée.** Chaque document porte sa part — le
 * total divisé par le nombre de cartes — afin que la somme des avances des
 * documents reste égale à l'avance du paquet. Sans cela, dix documents à
 * 150 000 feraient croire à 1 500 000 sortis de la caisse pour qui lit les
 * dossiers un par un.
 */
export function confierPaquet(
  saisie: SaisiePaquet,
  cartes: readonly DocumentDossier[],
  boutiqueId: string,
  auteur: Auteur,
): Promise<string> {
  const probleme = validerPaquet(saisie);
  if (probleme) return Promise.reject(new Error(probleme));

  /* La sélection de l'écran et les documents passés doivent se recouvrir
     exactement : un identifiant sans document, et le lot écrirait un paquet qui
     promet une carte que personne ne fait partir. */
  const parVente = new Map(cartes.map((carte) => [carte.venteId, carte]));
  const manquante = saisie.venteIds.find((venteId) => !parVente.has(venteId));
  if (manquante) {
    return Promise.reject(
      new Error("La sélection a changé pendant la saisie. Rouvrez l’écran des dossiers."),
    );
  }

  const montant = lireMontant(saisie.avance) ?? 0;
  const depose = Timestamp.fromDate(lireJour(saisie.deposeLe) as Date);
  const disponible = saisie.disponibleLe ? lireJour(saisie.disponibleLe) : null;
  const maintenant = Timestamp.fromDate(new Date());

  const lot = writeBatch(db());
  const reference = doc(collection(db(), "lotsCartesGrises"));

  lot.set(reference, {
    boutiqueId,
    prestataireId: saisie.prestataireId,
    prestataireNom: saisie.prestataireNom,
    deposeLe: depose,
    disponibleLe: disponible ? Timestamp.fromDate(disponible) : null,
    avance: montant,
    venteIds: [...saisie.venteIds],
    ...traceCreation(auteur),
  });

  /* La part de chacun, au franc près sur le dernier : une division entière
     laisserait un reste, et la somme des documents ne retomberait pas sur
     l'avance du paquet. Le reste va à la première carte, qui est aussi celle
     qu'on lit en premier. */
  const nombre = saisie.venteIds.length;
  const part = Math.floor(montant / nombre);
  const reste = montant - part * nombre;

  saisie.venteIds.forEach((venteId, rang) => {
    const carte = parVente.get(venteId) as DocumentDossier;
    const cible = doc(db(), "ventesMotos", venteId, "documents", "carte_grise");

    lot.update(cible, {
      statut: "chez_prestataire",
      prestataireId: saisie.prestataireId,
      prestataireNom: saisie.prestataireNom,
      deposeLe: depose,
      avance: rang === 0 ? part + reste : part,
      disponibleLe: disponible ? Timestamp.fromDate(disponible) : null,
      ...traceModification(auteur),
    });

    lot.set(doc(collection(cible, "historique")), {
      boutiqueId,
      venteId,
      type: "carte_grise",
      de: carte.statut,
      vers: "chez_prestataire",
      le: maintenant,
      ...traceCreation(auteur),
    });
  });

  lot.set(doc(collection(db(), "encaissements")), {
    boutiqueId,
    date: maintenant,
    sens: "sortie",
    montant,
    moyenPaiement: saisie.moyenPaiement,
    origine: "avance_prestataire",
    /* Le paquet, et non une vente : c'est lui qui porte le détail des cartes,
       et un journal de caisse qui renverrait vers une seule des dix ventes
       mentirait sur ce qui a été payé. */
    origineRefId: reference.id,
    libelle: `Avance ${saisie.prestataireNom} — ${nombre} cartes grises`,
    categorieTranches: false,
    ...traceCreation(auteur),
  });

  return suivreEcriture(lot.commit()).then(() => reference.id);
}

/**
 * Les paquets d'une boutique, du plus récent au plus ancien.
 *
 * Tri en mémoire et non par `orderBy` : la requête porte déjà un `where` sur la
 * boutique, et un tri serveur demanderait un index composite pour une liste qui
 * tient en quelques dizaines de lignes.
 */
export function ecouterPaquets(
  boutiqueId: string | null,
  auChangement: (paquets: PaquetCartesGrises[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "lotsCartesGrises");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) =>
      auChangement(
        instantane.docs
          .map(lirePaquet)
          .sort((a, b) => (b.deposeLe?.getTime() ?? 0) - (a.deposeLe?.getTime() ?? 0)),
      ),
    enErreur,
  );
}

function lirePaquet(instantane: QueryDocumentSnapshot<DocumentData>): PaquetCartesGrises {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    boutiqueId: typeof donnees.boutiqueId === "string" ? donnees.boutiqueId : "",
    prestataireId: typeof donnees.prestataireId === "string" ? donnees.prestataireId : "",
    prestataireNom: typeof donnees.prestataireNom === "string" ? donnees.prestataireNom : "",
    deposeLe: donnees.deposeLe?.toDate?.() ?? null,
    disponibleLe: donnees.disponibleLe?.toDate?.() ?? null,
    avance: typeof donnees.avance === "number" ? donnees.avance : 0,
    venteIds: Array.isArray(donnees.venteIds)
      ? donnees.venteIds.filter((valeur: unknown): valeur is string => typeof valeur === "string")
      : [],
  };
}
```

- [ ] **Étape 6 : vérifier**

Lancer : `rtk vitest run` puis `npx tsc --noEmit`
Attendu : tous verts, types propres.

- [ ] **Étape 7 : commit**

```bash
rtk git add lib/domain/paquet.ts lib/domain/paquet.test.ts lib/repositories/paquets.ts
rtk git commit -m "S53 : un paquet part en un lot, avec une seule sortie de caisse"
```

---

### Tâche 5 : l'écran des dossiers sélectionne et confie

**Fichiers :**
- Créer : `components/ConfierPaquetModal.tsx`
- Modifier : `app/(app)/motos/dossiers/page.tsx`

**Interfaces :**
- Consomme : `confierPaquet`, `cartesConfiables`, `validerPaquet`,
  `CARTES_PAR_PAQUET_MAX`

- [ ] **Étape 1 : écrire le témoin e2e qui échoue**

Créer `e2e/paquet.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { contenu, creerPrestataire, nomUnique, seConnecterEtEntrer, vendre } from "./aide";

/**
 * Le paquet de cartes grises (S53, arbitrages 2, 6 et 9).
 *
 * Ce qui se joue ici est le geste réel du comptoir : on tend dix cartes grises
 * à quelqu'un, on verse une avance, et on les récupère au fur et à mesure. Le
 * produit ne savait confier qu'une carte à la fois — dix dépôts, dix sorties de
 * caisse, dix fois le même nom tapé.
 */

test.beforeEach(({}, informations) => {
  informations.setTimeout(300_000);
});

test("deux cartes grises partent en un paquet, et reviennent une par une", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const prestataire = nomUnique("Ouedraogo");
  await creerPrestataire(page, prestataire);

  const premiere = await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });
  const seconde = await vendre(page, { mode: "Crédit", prix: "900000", encaisse: "300000" });

  await page.goto("/motos/dossiers", { waitUntil: "load" });

  /* On coche les deux cartes grises, et la barre dit combien partent. */
  for (const numero of [premiere.numero, seconde.numero]) {
    const ligne = contenu(page).locator("tbody tr").filter({ hasText: numero });
    await ligne.getByRole("checkbox", { name: /Confier la carte grise/ }).check();
  }
  await expect(contenu(page)).toContainText("2 cartes grises", { timeout: 30_000 });

  await contenu(page).getByRole("button", { name: /Confier .* cartes grises/ }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Prestataire").selectOption({ label: prestataire });
  await modal.getByLabel("Avance versée").fill("150000");
  await modal.getByRole("button", { name: "Confier le paquet" }).click();

  /* Le paquet se voit en une ligne, avec le nom, le nombre et les jours. */
  await expect(contenu(page)).toContainText(prestataire, { timeout: 30_000 });
  await expect(contenu(page)).toContainText("2 dehors", { timeout: 30_000 });

  /* **Arbitrage 9 : le retour est partiel.** Une seule revient, et le paquet
     reste ouvert sans qu'aucun geste ne le dise. */
  const ligne = contenu(page).locator("tbody tr").filter({ hasText: premiere.numero });
  await ligne.getByRole("button", { name: new RegExp(`Carte grise de ${premiere.numero}`) }).click();
  const relais = contenu(page).locator("section").filter({ hasText: "Carte grise de" });
  await relais.getByRole("button", { name: "Arrivé au magasin" }).click();

  await expect(contenu(page)).toContainText("1 dehors", { timeout: 30_000 });

  /* **Une seule sortie de caisse, pas deux.** C'est le critère que le journal
     doit refléter : un geste, une ligne. */
  await page.goto("/caisse", { waitUntil: "load" });
  await expect(contenu(page).getByText("150 000").first()).toBeVisible({ timeout: 30_000 });
  await expect(contenu(page).getByText(/2 cartes grises/).first()).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Étape 2 : voir le témoin échouer**

```bash
mv .env.local.emulateurs .env.local
node scripts/emulateurs.mjs   # en arriere-plan, attendre les quatre ports
NEXT_DIST_DIR=.next-emulateurs npm run build
NEXT_DIST_DIR=.next-emulateurs npx playwright test e2e/paquet.spec.ts --reporter=list
```

Attendu : ÉCHEC — la case « Confier la carte grise » n'existe pas.

- [ ] **Étape 3 : écrire la modale**

Créer `components/ConfierPaquetModal.tsx` :

```tsx
"use client";

import { useState } from "react";
import { Modale } from "@/components/patrons/Modale";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { useSession } from "@/lib/auth/session";
import { formaterMontant } from "@/lib/domain/format";
import { CARTES_PAR_PAQUET_MAX, type SaisiePaquet } from "@/lib/domain/paquet";
import { MOYENS_PAIEMENT, LIBELLE_MOYEN, type DocumentDossier } from "@/lib/domain/vente";
import type { Prestataire } from "@/lib/domain/prestataire";
import { confierPaquet } from "@/lib/repositories/paquets";
import { messageErreurDossier } from "@/lib/repositories/dossier";

/** Aujourd'hui au format d'un `<input type="date">`. */
function aujourdhui(): string {
  const date = new Date();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Confier plusieurs cartes grises d'un coup (S53).
 *
 * **Le formulaire du dépôt unitaire, moins le document et plus le nombre.** Un
 * prestataire, une date, une avance, une date annoncée facultative — et la
 * liste de ce qui part, affichée pour qu'on la relise avant de valider : dix
 * cartes confiées à la mauvaise personne se rattrapent en allant la voir.
 *
 * **L'avance est celle du paquet, pas celle d'une carte.** On tape ce qu'on
 * verse, une fois. Le dépôt la répartit sur les documents pour que la somme des
 * dossiers retombe sur la sortie de caisse ; l'écran, lui, ne demande qu'un
 * chiffre, parce que c'est un seul billet qui change de main.
 */
export function ConfierPaquetModal({
  cartes,
  prestataires,
  boutiqueId,
  numeroDe,
  onFermer,
  onConfie,
}: {
  cartes: readonly DocumentDossier[];
  prestataires: readonly Prestataire[];
  boutiqueId: string;
  numeroDe: (venteId: string) => string;
  onFermer: () => void;
  onConfie: () => void;
}) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisiePaquet>({
    prestataireId: "",
    prestataireNom: "",
    deposeLe: aujourdhui(),
    avance: "",
    moyenPaiement: "especes",
    disponibleLe: "",
    venteIds: cartes.map((carte) => carte.venteId),
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  function changer(partie: Partial<SaisiePaquet>) {
    setSaisie((ancienne) => ({ ...ancienne, ...partie }));
  }

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || envoi) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await confierPaquet(saisie, cartes, boutiqueId, {
        uid: session.utilisateur.uid,
        nom: session.utilisateur.nom,
      });
      onConfie();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : messageErreurDossier(cause));
      setEnvoi(false);
    }
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre={`Confier ${cartes.length} cartes grises`}
      description="Un prestataire, une date, une avance. L’avance sort de la caisse en une fois."
    >
      <form onSubmit={soumettre} className="space-y-4">
        <Champ id="paq-prestataire" libelle="Prestataire">
          <select
            id="paq-prestataire"
            value={saisie.prestataireId}
            onChange={(evenement) => {
              const choisi = prestataires.find((p) => p.id === evenement.target.value);
              changer({
                prestataireId: choisi?.id ?? "",
                prestataireNom: choisi?.nom ?? "",
              });
            }}
            className="saisie"
          >
            <option value="">Choisir un prestataire</option>
            {prestataires.map((prestataire) => (
              <option key={prestataire.id} value={prestataire.id}>
                {prestataire.nom}
              </option>
            ))}
          </select>
        </Champ>

        <Champ id="paq-depose" libelle="Date du dépôt">
          <input
            id="paq-depose"
            type="date"
            value={saisie.deposeLe}
            onChange={(evenement) => changer({ deposeLe: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ id="paq-avance" libelle="Avance versée">
          <input
            id="paq-avance"
            inputMode="numeric"
            value={saisie.avance}
            onChange={(evenement) => changer({ avance: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ id="paq-moyen" libelle="Par quel moyen">
          <select
            id="paq-moyen"
            value={saisie.moyenPaiement}
            onChange={(evenement) =>
              changer({ moyenPaiement: evenement.target.value as SaisiePaquet["moyenPaiement"] })
            }
            className="saisie"
          >
            {MOYENS_PAIEMENT.map((moyen) => (
              <option key={moyen} value={moyen}>
                {LIBELLE_MOYEN[moyen]}
              </option>
            ))}
          </select>
        </Champ>

        <Champ id="paq-dispo" libelle="Annoncé pour le" facultatif>
          <input
            id="paq-dispo"
            type="date"
            value={saisie.disponibleLe}
            onChange={(evenement) => changer({ disponibleLe: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        {/* **Ce qui part, relu avant de valider.** Dix cartes confiées à la
            mauvaise personne se rattrapent en allant la voir ; autant les
            nommer ici. */}
        <div className="cadre p-3">
          <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
            Ce qui part
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {cartes.map((carte) => (
              <li key={carte.venteId} className="plaque-code text-corps text-encre">
                {numeroDe(carte.venteId)}
              </li>
            ))}
          </ul>
        </div>

        <EtatErreurSaisie message={erreur} />

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={envoi} className="bouton bouton-principal">
            {envoi ? "Envoi…" : "Confier le paquet"}
          </button>
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Annuler
          </button>
        </div>
      </form>
    </Modale>
  );
}
```

- [ ] **Étape 4 : brancher la sélection sur l'écran**

Dans `app/(app)/motos/dossiers/page.tsx` :

1. Un état de sélection : `const [choisies, setChoisies] = useState<Set<string>>(new Set())`.
2. Dans la colonne `carte_grise`, **avant** la pastille, une case quand
   `papier.etat === "a_faire"` :

```tsx
{type === "carte_grise" && confiables.has(dossier.venteId) && (
  /* La case ne s'affiche que sur ce qui peut partir. Une case grisée sur une
     carte déjà dehors inviterait à verser une seconde avance pour le même
     travail — et la base refuserait le lot entier, sans dire laquelle. */
  <input
    type="checkbox"
    checked={choisies.has(dossier.venteId)}
    onChange={(evenement) => basculer(dossier.venteId, evenement.target.checked)}
    aria-label={`Confier la carte grise de ${dossier.numero}`}
    className="mr-2 size-4 accent-[var(--color-solde)]"
  />
)}
```

3. Une barre d'action au-dessus du tableau, quand la sélection n'est pas vide :

```tsx
{choisies.size > 0 && (
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 cadre p-3">
    <p className="text-encre">
      {compter(choisies.size, "carte grise", "cartes grises")} sélectionnée
      {choisies.size > 1 ? "s" : ""}
    </p>
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setPaquetOuvert(true)}
        className="bouton bouton-principal"
      >
        Confier {compter(choisies.size, "carte grise", "cartes grises")}
      </button>
      <button
        type="button"
        onClick={() => setChoisies(new Set())}
        className="bouton bouton-neutre"
      >
        Tout décocher
      </button>
    </div>
  </div>
)}
```

4. L'ensemble de ce qui peut partir, calculé **une fois** par
   `cartesConfiables` plutôt que relu case par case — c'est elle qui porte la
   règle, et la dupliquer dans le rendu la ferait diverger le jour où un
   troisième statut apparaîtrait :

```ts
const confiables = useMemo(
  () => new Set(cartesConfiables(documents ?? []).map((carte) => carte.venteId)),
  [documents],
);
```

5. `basculer` :

```ts
/* La sélection est un ensemble d'identifiants de vente, pas de documents : un
   document se recharge à chaque écriture du serveur, un identifiant non. */
const basculer = useCallback((venteId: string, choisi: boolean) => {
  setChoisies((anciennes) => {
    const suivantes = new Set(anciennes);
    if (choisi) suivantes.add(venteId);
    else suivantes.delete(venteId);
    return suivantes;
  });
}, []);
```

6. Le montage de la modale, avec les prestataires lus par
   `useAbonnement(souscrirePrestataires, …)` — la même écoute que
   `GestesDocument` utilise déjà — et la remise à zéro de la sélection après
   le dépôt :

```tsx
{paquetOuvert && boutiqueId && (
  <ConfierPaquetModal
    cartes={dossiers
      .filter((dossier) => choisies.has(dossier.venteId))
      .map((dossier) => dossier.documents.carte_grise)
      .filter((document): document is DocumentDossier => document !== null)}
    prestataires={prestataires ?? []}
    boutiqueId={boutiqueId}
    numeroDe={(venteId) =>
      dossiers.find((dossier) => dossier.venteId === venteId)?.numero ?? venteId
    }
    onFermer={() => setPaquetOuvert(false)}
    onConfie={() => {
      setPaquetOuvert(false);
      setChoisies(new Set());
    }}
  />
)}
```

**La sélection n'existe qu'en vue boutique.** `confierPaquet` exige un
`boutiqueId`, et un paquet appartient à une boutique : en vue entreprise, la
case ne s'affiche pas. Ajouter la garde `boutiqueId !== null` à la condition de
la case et de la barre.

- [ ] **Étape 5 : voir le témoin passer**

```bash
NEXT_DIST_DIR=.next-emulateurs npm run build
NEXT_DIST_DIR=.next-emulateurs npx playwright test e2e/paquet.spec.ts --reporter=list
```

Attendu : SUCCÈS. La ligne du paquet manque encore — la tâche 6 la pose — donc
les deux assertions sur « 2 dehors » et « 1 dehors » échouent à ce stade.
**Les commenter ici serait tricher** : garder le témoin en échec partiel, le
dire dans le registre, et le faire passer entièrement à la tâche 6.

- [ ] **Étape 6 : commit**

```bash
rtk git add components/ConfierPaquetModal.tsx "app/(app)/motos/dossiers/page.tsx" e2e/paquet.spec.ts
rtk git commit -m "S53 : l ecran des dossiers confie plusieurs cartes en un geste"
```

---

### Tâche 6 : les paquets en cours se lisent, et le retour reste partiel

**Fichiers :**
- Créer : `components/PaquetsEnCours.tsx`
- Modifier : `app/(app)/motos/dossiers/page.tsx`

**Interfaces :**
- Consomme : `ecouterPaquets` (tâche 4), `etatPaquet` (tâche 2)

- [ ] **Étape 1 : écrire le composant**

Créer `components/PaquetsEnCours.tsx` :

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import { etatPaquet, type PaquetCartesGrises } from "@/lib/domain/paquet";
import type { DocumentDossier } from "@/lib/domain/vente";

/**
 * Les paquets de cartes grises en cours (S53).
 *
 * **Une ligne par paquet, et le détail replié.** « 10 cartes grises chez
 * Ouédraogo, depuis 12 jours » répond à la question qu'on se pose en ouvrant
 * l'écran ; les dix châssis répondent à celle d'après, et seulement si on la
 * pose. Dix lignes dépliées d'office auraient noyé la file des dossiers, qui
 * est l'objet principal de cet écran.
 *
 * **Un paquet soldé disparaît de la liste, sans qu'aucun geste ne le dise.**
 * Son solde est l'absence de carte dehors (`etatPaquet`) : il s'efface quand la
 * dernière revient, et c'est exactement ce que l'arbitrage 9 demande — « il
 * peut partir avec 10 et ramener 5 », sans rien à cocher pour le dire.
 */
export function PaquetsEnCours({
  paquets,
  documents,
  numeroDe,
}: {
  paquets: readonly PaquetCartesGrises[] | null;
  documents: readonly DocumentDossier[] | null;
  numeroDe: (venteId: string) => string;
}) {
  const [deplie, setDeplie] = useState<string | null>(null);

  if (paquets === null || documents === null) return null;

  const maintenant = new Date();
  const enCours = paquets
    .map((paquet) => ({ paquet, etat: etatPaquet(paquet, documents, maintenant) }))
    .filter(({ etat }) => etat.dehors > 0);

  if (enCours.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
        Paquets chez un prestataire
      </h2>
      <ul className="cadre cadre-liste">
        {enCours.map(({ paquet, etat }) => (
          <li key={paquet.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setDeplie(deplie === paquet.id ? null : paquet.id)}
                aria-expanded={deplie === paquet.id}
                className="inline-flex items-center gap-1.5 font-medium text-encre"
              >
                {deplie === paquet.id ? (
                  <ChevronDown aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-4" />
                )}
                {paquet.prestataireNom || "un prestataire"}
              </button>

              <span className={etat.enRetard ? "font-semibold text-alerte" : "text-encre-doux"}>
                {/* Le nombre dehors d'abord : c'est ce qu'on va chercher. Le
                    total vient après, pour savoir où on en est. */}
                {etat.dehors} dehors sur {etat.total}
                {etat.joursDehors !== null && ` · depuis ${etat.joursDehors} j`}
                {etat.enRetard && " · en retard"}
              </span>
            </div>

            <p className="mt-0.5 text-legende text-encre-doux">
              Avance {formaterMontant(paquet.avance)}
              {paquet.disponibleLe && ` · annoncé le ${formaterDateCourte(paquet.disponibleLe)}`}
            </p>

            {deplie === paquet.id && (
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {paquet.venteIds.map((venteId) => (
                  <li key={venteId} className="plaque-code text-legende text-encre-doux">
                    {numeroDe(venteId)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Étape 2 : brancher l'écoute**

Dans `app/(app)/motos/dossiers/page.tsx`, ajouter l'écoute et le montage :

```ts
const souscrirePaquets = useCallback(
  (auChangement: (paquets: PaquetCartesGrises[]) => void, enErreur: (cause: unknown) => void) =>
    ecouterPaquets(boutiqueId, auChangement, enErreur),
  [boutiqueId],
);
const { valeur: paquets } = useAbonnement(
  souscrirePaquets,
  "Les paquets de cartes grises n’ont pas pu être lus.",
);
```

```tsx
<PaquetsEnCours
  paquets={paquets}
  documents={documents}
  numeroDe={(venteId) => ventes?.find((vente) => vente.id === venteId)?.numero ?? venteId}
/>
```

**Le `numeroDe` lit les ventes, pas les dossiers.** Un paquet survit à la
clôture de ses dossiers : une carte revenue sort de la file, et son numéro doit
rester lisible dans le détail du paquet.

- [ ] **Étape 3 : voir le témoin passer entièrement**

```bash
NEXT_DIST_DIR=.next-emulateurs npm run build
NEXT_DIST_DIR=.next-emulateurs npx playwright test e2e/paquet.spec.ts --reporter=list
```

Attendu : SUCCÈS complet, « 2 dehors » puis « 1 dehors » après un retour.

- [ ] **Étape 4 : remettre le dépôt en état**

```bash
mv .env.local .env.local.emulateurs
rtk git checkout -- tsconfig.json
npm run build          # pour le VRAI projet : `swDest` ne suit pas NEXT_DIST_DIR
```

Puis vérifier que les entrées préchargées de `public/sw.js` répondent toutes.

- [ ] **Étape 5 : commit**

```bash
rtk git add components/PaquetsEnCours.tsx "app/(app)/motos/dossiers/page.tsx"
rtk git commit -m "S53 : les paquets en cours se lisent, et le retour reste partiel"
```

---

### Tâche 7 : la spec se clôt, et la décision dit ce que le paquet ne stocke pas

**Fichiers :**
- Modifier : `specs/S53-les-papiers-d-une-moto.md`, `specs/ROADMAP.md`, `DECISIONS.md`

- [ ] **Étape 1 : cocher les critères du paquet**

Dans `specs/S53-les-papiers-d-une-moto.md`, cocher les huit cases de la section
« Le paquet de cartes grises », et **retirer la question laissée ouverte** sur
l'arbitrage 7 : elle a été tranchée à l'exécution du premier plan — le retour au
magasin est le terme, et la preuve de remise est le scan et la plaque.

- [ ] **Étape 2 : écrire le paragraphe de décision**

Ajouter à `DECISIONS.md`, à la suite de D107 :

```markdown
### Amendement S53 — Un groupement n'a pas d'état : il se recompte

Le paquet de cartes grises **groupe** un dépôt sans le remplacer. Trois choses
en découlent, et il faut les dire ensemble parce que c'est leur conjonction qui
tient.

**Chaque document garde ses champs de dépôt.** Les règles Firestore évaluent
chaque écriture d'un lot contre l'état d'**avant** le lot : un document validé
contre un paquet créé dans le même lot serait refusé. `depotRenseigne` reste
donc vrai mot pour mot, et le paquet n'est qu'une couche de regroupement
par-dessus un modèle qui tient déjà.

**Le paquet n'a pas d'état « rendu ».** Il est soldé quand aucune de ses cartes
n'est plus dehors, ce qui se calcule. Lui donner un champ rouvrirait la
contradiction B sous un autre nom — le champ dirait « rendu » pendant qu'une
carte serait encore chez le prestataire, et il faudrait un geste pour les
raccorder. C'est aussi ce qui rend le **retour partiel** gratuit : cinq cartes
revenues sur dix ne demandent rien à personne.

**L'avance sort une fois, et se répartit.** Un seul encaissement, dont
l'`origineRefId` est le paquet — dix sorties de 15 000 feraient croire à dix
décisions. Mais chaque document porte sa **part**, pas le total : sans cela, dix
documents à 150 000 feraient lire 1 500 000 sortis de la caisse à qui ouvre les
dossiers un par un. Le reste de la division entière va à la première carte.

**La borne vient du calcul.** `2N + 2 ≤ 500` écritures par lot donne 249 cartes.
C'est un plafond, pas une cible — le geste réel en tend dix —, mais une borne
choisie au hasard se révèle un jour fausse dans le mauvais sens, alors que
celle-ci est la limite au-delà de laquelle l'écriture échouerait en bloc.
```

- [ ] **Étape 3 : la feuille de route**

Dans `specs/ROADMAP.md`, marquer S53 **terminée** avec sa date, et noter que
S56 est désormais débloquée.

- [ ] **Étape 4 : commit**

```bash
rtk git add specs/S53-les-papiers-d-une-moto.md specs/ROADMAP.md DECISIONS.md
rtk git commit -m "S53 : la spec se clot, et la decision dit ce que le paquet ne stocke pas"
```

---

## Avant de dire que c'est fini

- [ ] `rtk vitest run` — tout vert.
- [ ] `rtk vitest run --config vitest.regles.config.mts` — tout vert.
- [ ] `npm run test:declencheurs` — tout vert.
- [ ] `npx tsc --noEmit` et `rtk lint` — propres.
- [ ] `e2e/paquet.spec.ts` et `e2e/dossier.spec.ts`, **un à la fois**, sur des
      émulateurs qui viennent de démarrer. **Pas de passe complète.**
- [ ] `public/sw.js` rebâti pour le **vrai** projet, et toutes ses entrées
      préchargées répondent.
- [ ] `.env.local` **absent**, `tsconfig.json` propre, arbre propre.
- [ ] Le rendu regardé — ou dit non regardé, explicitement.
