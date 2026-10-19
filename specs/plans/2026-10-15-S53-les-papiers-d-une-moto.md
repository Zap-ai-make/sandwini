# S53 — Les papiers d'une moto : plan d'implémentation

> **Pour les exécutants :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** faire que chaque papier d'une moto ait un seul endroit où il vit, et
que le dossier n'en soit qu'un lecteur.

**Architecture :** la quittance et le CMC deviennent des champs de la **moto** ;
ce que le client a emporté devient un champ de la **vente** ; la carte grise
garde seule un cycle stocké, réduit à deux étapes. L'état affiché d'un papier se
**calcule** à la lecture (D61) au lieu d'être entretenu.

**Pile :** Next.js 16 App Router, TypeScript strict, Firestore, Cloud Functions,
Vitest, `@firebase/rules-unit-testing`, Playwright.

**Spec :** `specs/S53-les-papiers-d-une-moto.md`

**Hors de ce plan :** le **paquet de cartes grises** (`lotsCartesGrises`) fait
l'objet d'un second plan. Les tâches ci-dessous produisent un logiciel complet
sans lui : le dépôt chez un prestataire continue de se faire carte par carte,
comme aujourd'hui.

## Contraintes globales

- **TDD obligatoire** (D103) : le test échoue d'abord, et on le voit échouer.
- **Tout en français**, y compris les noms de symboles et les commentaires. Les
  commentaires disent **pourquoi**, jamais quoi.
- **Jamais `prettier`** sur ce dépôt.
- **Messages de commit** : `S53 : <phrase à l'indicatif>`, sujet **sans accents**.
- **Pas de passe e2e complète.** Un fichier ciblé à la fois, sur des émulateurs
  qui viennent de démarrer. Une passe complète dure plus d'une heure et rend des
  verdicts d'outillage.
- **Lancer les tests e2e** exige de déplacer `.env.local.emulateurs` →
  `.env.local`, **puis de recompiler** (le garde-fou lit le fichier, pas le
  build), et de **remettre le fichier en place** après. Ne jamais laisser le
  dépôt avec un `.env.local` posé.
- **Aucune suppression de données** sur `sandwini` dans ce plan.
- Commandes préfixées de `rtk`.

## Points de vigilance

Cinq classes d'entrée que la spec implique sans qu'aucune tâche ne les exerce
naturellement. Chacune reçoit son test dans la tâche qui porte le code.

1. **Un document `carte_grise` déjà `remis_client`** existe dans la base de la
   préversion. `etatPapier` doit le rendre lisible et non planter. → Tâche 1.
2. **Une vente sans `emporte`** (toutes celles d'avant ce plan) doit se lire
   comme « rien d'emporté », pas comme `undefined`. → Tâche 3.
3. **Une moto sans `quittanceRecue`** doit se lire `false`, pas `undefined`. → Tâche 2.
4. **Cocher « emporté » sur un papier que la moto ne porte pas** doit être
   refusé — on ne remet pas ce qu'on n'a pas. → Tâche 3.
5. **Une plaque de 200 caractères** ou avec des espaces en trop doit être bornée
   et taillée avant écriture. → Tâche 2.

---

## Structure des fichiers

| Fichier | Responsabilité après ce plan |
|---|---|
| `lib/domain/dossier.ts` | les chemins restants, et `etatPapier` qui calcule l'état affiché |
| `lib/domain/moto.ts` | `Moto` porte `quittanceRecue` et `plaque` |
| `lib/domain/vente.ts` | `Vente` porte `emporte` et `carteGriseChemin` |
| `lib/repositories/motos.ts` | `marquerPapierRecu`, `poserPlaque` |
| `lib/repositories/ventes.ts` | la carte grise naît « sans objet » si décochée ; `marquerEmporte` |
| `functions/src/index.ts` | `dossierFini` lit la vente au lieu des statuts |
| `firestore.rules` | les nouveaux champs, et `non_applicable` à la création |
| `components/GestesDocument.tsx` | ne propose plus que les gestes qui existent |
| `components/FicheMoto.tsx` | montre et coche les papiers en main, montre la plaque |
| `components/FicheVente.tsx` | ce que le client a emporté, le scan, la plaque |

---

### Tâche 1 : le domaine calcule l'état d'un papier

**Fichiers :**
- Modifier : `lib/domain/dossier.ts:35-67`
- Test : `lib/domain/dossier.test.ts`

**Interfaces :**
- Produit : `EtatPapier`, `etatPapier(entree): EtatPapier`, `LIBELLE_ETAT_PAPIER`
- Consomme : `TypeDocument`, `StatutDocument` de `lib/domain/vente.ts`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `lib/domain/dossier.test.ts` :

```ts
describe("etatPapier", () => {
  it("rend « sans objet » dès que le document est écarté, quoi que porte la moto", () => {
    expect(
      etatPapier({ type: "cmc", statut: "non_applicable", enMain: true, emporte: true }),
    ).toBe("sans_objet");
  });

  it("rend « emporté » quand le client l’a pris", () => {
    expect(
      etatPapier({ type: "quittance", statut: "a_faire", enMain: true, emporte: true }),
    ).toBe("emporte");
  });

  it("rend « au magasin » quand la moto porte le papier sans qu’il soit emporté", () => {
    expect(
      etatPapier({ type: "cmc", statut: "a_faire", enMain: true, emporte: false }),
    ).toBe("au_magasin");
  });

  it("rend « à faire » quand la moto ne porte rien", () => {
    expect(
      etatPapier({ type: "quittance", statut: "a_faire", enMain: false, emporte: false }),
    ).toBe("a_faire");
  });

  /* La carte grise ne lit ni la moto ni la vente : elle a une vie dehors que
     ni l’une ni l’autre ne connaît. */
  it("lit la carte grise sur son seul statut, en ignorant la moto", () => {
    expect(
      etatPapier({ type: "carte_grise", statut: "chez_prestataire", enMain: true, emporte: true }),
    ).toBe("chez_prestataire");
    expect(
      etatPapier({ type: "carte_grise", statut: "revenu_magasin", enMain: false, emporte: false }),
    ).toBe("au_magasin");
  });

  /* **Point de vigilance 1.** La préversion porte des cartes grises déjà
     passées à `remis_client` par l’ancien modèle. Elles doivent se lire, pas
     faire tomber l’écran. */
  it("lit un « remis au client » hérité de l’ancien modèle comme étant au magasin", () => {
    expect(
      etatPapier({ type: "carte_grise", statut: "remis_client", enMain: false, emporte: false }),
    ).toBe("au_magasin");
  });
});
```

Ajouter `etatPapier` à l'import en tête du fichier de test.

- [ ] **Étape 2 : voir les tests échouer**

Lancer : `rtk npx vitest run lib/domain/dossier.test.ts`
Attendu : ÉCHEC — `etatPapier is not a function`.

- [ ] **Étape 3 : écrire le minimum**

Dans `lib/domain/dossier.ts`, remplacer `CHEMIN_ARRIVE_FAIT` par :

```ts
/**
 * Ce qui arrive avec la moto : la **quittance** et le **CMC**.
 *
 * **Ils n'ont plus d'étapes depuis S53.** Leur disponibilité vit sur la moto
 * (`quittanceRecue`, `cmcRecu`) et leur remise sur la vente (`emporte`) : le
 * dossier n'a plus rien à stocker pour eux, sinon le fait qu'ils soient écartés.
 * Le seul passage qui subsiste est donc vers « sans objet ».
 *
 * Suivre deux fois le même papier était la contradiction B de la spec : une
 * moto dont le CMC avait été coché à l'arrivage ouvrait quand même un document
 * à `a_faire`, qu'il fallait repromener à la main.
 */
const CHEMIN_SANS_ETAPE: Record<StatutDocument, readonly StatutDocument[]> = {
  a_faire: ["non_applicable"],
  chez_prestataire: [],
  revenu_magasin: [],
  remis_client: [],
  non_applicable: [],
};
```

Modifier `CHEMIN_PRESTATAIRE` pour retirer `remis_client` :

```ts
const CHEMIN_PRESTATAIRE: Record<StatutDocument, readonly StatutDocument[]> = {
  a_faire: ["chez_prestataire", "non_applicable"],
  chez_prestataire: ["revenu_magasin"],
  /* **Le retour est le terme** (arbitrage 7). La carte grise n'a que deux
     gestes : partie chez le prestataire, revenue. Sa preuve de remise est le
     scan et la plaque saisis sur la fiche de vente. */
  revenu_magasin: [],
  remis_client: [],
  non_applicable: [],
};

const CHEMIN: Record<TypeDocument, Record<StatutDocument, readonly StatutDocument[]>> = {
  quittance: CHEMIN_SANS_ETAPE,
  cmc: CHEMIN_SANS_ETAPE,
  carte_grise: CHEMIN_PRESTATAIRE,
};
```

Ajouter après `estStatutTerminal` :

```ts
/** Ce qu'un papier montre à l'écran, tous faits réunis. */
export type EtatPapier =
  | "sans_objet"
  | "emporte"
  | "au_magasin"
  | "chez_prestataire"
  | "a_faire";

export const LIBELLE_ETAT_PAPIER: Record<EtatPapier, string> = {
  sans_objet: "Sans objet",
  emporte: "Emporté par le client",
  au_magasin: "Au magasin",
  chez_prestataire: "Chez le prestataire",
  a_faire: "À faire",
};

/**
 * L'état affiché d'un papier, **calculé et jamais stocké** (D61).
 *
 * Trois sources, une réponse : le document dit s'il est écarté, la moto dit si
 * le papier est en main, la vente dit si le client l'a emporté. Les recoller à
 * la lecture rend la contradiction B *inexprimable* — un CMC coché trois jours
 * après la vente fait bouger l'écran du dossier sans qu'une seule écriture ne
 * touche le dossier.
 *
 * La carte grise échappe à la règle : elle a une vie chez quelqu'un, que ni la
 * moto ni la vente ne connaissent. Son statut stocké fait foi.
 */
export function etatPapier(entree: {
  type: TypeDocument;
  statut: StatutDocument;
  /** La moto porte-t-elle ce papier ? Ignoré pour la carte grise. */
  enMain: boolean;
  /** Le client l'a-t-il emporté ? Ignoré pour la carte grise. */
  emporte: boolean;
}): EtatPapier {
  if (entree.statut === "non_applicable") return "sans_objet";

  if (passeParUnPrestataire(entree.type)) {
    if (entree.statut === "chez_prestataire") return "chez_prestataire";
    /* `remis_client` n'est plus écrit, mais la préversion en porte : une carte
       grise ainsi marquée est revenue au magasin, et c'est tout ce qu'on peut
       en dire sans inventer. */
    if (entree.statut === "revenu_magasin" || entree.statut === "remis_client") {
      return "au_magasin";
    }
    return "a_faire";
  }

  if (entree.emporte) return "emporte";
  if (entree.enMain) return "au_magasin";
  return "a_faire";
}
```

- [ ] **Étape 4 : voir les tests passer**

Lancer : `rtk npx vitest run lib/domain/dossier.test.ts`
Attendu : SUCCÈS. Corriger les tests existants que le retrait de `remis_client`
fait tomber — ils figent l'ancienne machine à états, et leur chute est le signal
attendu, pas un défaut.

- [ ] **Étape 5 : commit**

```bash
rtk git add lib/domain/dossier.ts lib/domain/dossier.test.ts
rtk git commit -m "S53 : l'etat d'un papier se calcule au lieu de se stocker"
```

---

### Tâche 2 : la moto porte sa quittance et sa plaque

**Fichiers :**
- Modifier : `lib/domain/moto.ts:35-65`, `lib/repositories/motos.ts:412`
- Modifier : `firestore.rules:426-434`
- Test : `lib/domain/moto.test.ts`, `regles/motos.test.ts`

**Interfaces :**
- Produit : `Moto.quittanceRecue: boolean`, `Moto.plaque: string | null`,
  `marquerPapierRecu(motoId, papier, recu, auteur)`, `poserPlaque(motoId, plaque, auteur)`,
  `PLAQUE_LONGUEUR_MAX`, `normaliserPlaque(brut): string`
- Consomme : rien des tâches précédentes.

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans `lib/domain/moto.test.ts` :

```ts
describe("normaliserPlaque", () => {
  it("taille les espaces et met en capitales : une plaque se lit d’un coup d’œil", () => {
    expect(normaliserPlaque("  11 aa 1234  ")).toBe("11 AA 1234");
  });

  it("réduit les espaces internes multiples à un seul", () => {
    expect(normaliserPlaque("11   AA   1234")).toBe("11 AA 1234");
  });

  /* **Point de vigilance 5.** Un champ libre reçoit tôt ou tard un collage
     malheureux ; la borne protège la règle Firestore d'un refus incompréhensible. */
  it("borne la longueur sans rien inventer au-delà", () => {
    expect(normaliserPlaque("A".repeat(200))).toHaveLength(PLAQUE_LONGUEUR_MAX);
  });

  it("rend une chaîne vide sur une saisie vide, jamais null", () => {
    expect(normaliserPlaque("   ")).toBe("");
  });
});
```

- [ ] **Étape 2 : voir les tests échouer**

Lancer : `rtk npx vitest run lib/domain/moto.test.ts`
Attendu : ÉCHEC — `normaliserPlaque is not a function`.

- [ ] **Étape 3 : écrire le minimum**

Dans `lib/domain/moto.ts`, ajouter au type `Moto`, après `cmcRecu` :

```ts
  /**
   * La quittance est-elle dans le tiroir ?
   *
   * Posée en face de `cmcRecu`, qui existait seul depuis S43. Deux papiers de
   * même nature qui se comportent différemment sur le même écran, c'était
   * exactement le « on comprend rien » du commanditaire.
   */
  quittanceRecue: boolean;
  /**
   * L'immatriculation, saisie au retour de la carte grise.
   *
   * **Rangée sur la moto et non sur la vente** : une plaque appartient à
   * l'engin, elle lui survit à une revente, et l'inventaire peut l'afficher
   * sans rouvrir une vente. La saisie, elle, se fait sur la fiche de vente —
   * c'est là que se trouve le gérant au moment du retour.
   */
  plaque: string | null;
```

Ajouter en fin de fichier :

```ts
/** Assez pour toute plaque d'Afrique de l'Ouest, trop peu pour un collage. */
export const PLAQUE_LONGUEUR_MAX = 20;

/**
 * Met une plaque en forme avant de l'écrire.
 *
 * Les capitales et l'espace unique ne sont pas de la coquetterie : une plaque
 * se compare à l'œil avec celle qui est vissée sur la moto, et « 11aa1234 » ne
 * se compare pas. La borne protège la règle Firestore d'un refus que le gérant
 * ne saurait pas lire.
 */
export function normaliserPlaque(brut: string): string {
  return brut.trim().replace(/\s+/g, " ").toUpperCase().slice(0, PLAQUE_LONGUEUR_MAX);
}
```

- [ ] **Étape 4 : voir les tests passer**

Lancer : `rtk npx vitest run lib/domain/moto.test.ts`
Attendu : SUCCÈS.

- [ ] **Étape 5 : écrire le test de règles qui échoue**

Dans `regles/motos.test.ts` :

```ts
it("accepte quittanceRecue et plaque sur une moto de sa boutique", async () => {
  const base = gerantDe("ABC");
  await assertSucceeds(
    setDoc(doc(base, "motos", "m1"), { ...motoValable("ABC"), quittanceRecue: true, plaque: "11 AA 1234" }),
  );
});

/* **Point de vigilance 6 de la spec.** La plaque est une donnée de la moto :
   elle suit le périmètre de la moto, et rien d'autre. */
it("refuse la plaque d’une moto d’une autre boutique", async () => {
  const base = gerantDe("ABC");
  await assertFails(
    setDoc(doc(base, "motos", "m2"), { ...motoValable("XYZ"), plaque: "11 AA 1234" }),
  );
});

it("refuse une plaque plus longue que la borne", async () => {
  const base = gerantDe("ABC");
  await assertFails(
    setDoc(doc(base, "motos", "m3"), { ...motoValable("ABC"), plaque: "A".repeat(21) }),
  );
});
```

- [ ] **Étape 6 : voir le test de règles échouer**

Lancer : `rtk npm run test:regles:isole`
Attendu : ÉCHEC — `quittanceRecue` et `plaque` ne sont pas dans `hasOnly`.

- [ ] **Étape 7 : ouvrir les règles**

Dans `firestore.rules`, fonction `motoValide`, ajouter aux clés autorisées et
poser les deux contrôles de type :

```
                                     'quittanceChemin', 'cmcChemin', 'cmcRecu',
                                     'quittanceRecue', 'plaque'].concat(champsAudit()))
```

et, parmi les contrôles de champ :

```
             // Facultatifs : les motos d'avant S53 n'en portent aucun, et une
             // moto neuve n'a pas de plaque avant le retour de sa carte grise.
             && (!donnees.keys().hasAny(['quittanceRecue']) || donnees.quittanceRecue is bool)
             && (!donnees.keys().hasAny(['plaque'])
                 || donnees.plaque == null
                 || texteBorne(donnees.plaque, 20))
```

- [ ] **Étape 8 : voir le test de règles passer**

Lancer : `rtk npm run test:regles:isole`
Attendu : SUCCÈS, et les 381 tests antérieurs toujours verts.

- [ ] **Étape 9 : poser les écritures**

Dans `lib/repositories/motos.ts`, généraliser `marquerCmcRecu` (ligne 412) :

```ts
/** Le papier qu'une moto peut porter en main. */
export type PapierEnMain = "quittance" | "cmc";

const CHAMP_PAPIER: Record<PapierEnMain, string> = {
  quittance: "quittanceRecue",
  cmc: "cmcRecu",
};

/**
 * Coche ou décoche un papier en main.
 *
 * **Un seul champ, deux écrans** : la fiche de la moto et l'inspection d'un lot
 * écrivent ici tous les deux. C'est ce qui remplace la « synchronisation »
 * demandée par le commanditaire — deux champs qu'on synchronise finissent par
 * diverger, un seul champ ne le peut pas.
 */
export function marquerPapierRecu(
  motoId: string,
  papier: PapierEnMain,
  recu: boolean,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "motos", motoId), {
      [CHAMP_PAPIER[papier]]: recu,
      ...traceModification(auteur),
    }),
  );
}

/**
 * Pose l'immatriculation au retour de la carte grise.
 *
 * On n'attend pas le serveur (D76) : l'appelant reçoit la promesse et rend la
 * main tout de suite, comme partout ailleurs dans ce dépôt.
 */
export function poserPlaque(motoId: string, plaque: string, auteur: Auteur): Promise<void> {
  const propre = normaliserPlaque(plaque);
  return suivreEcriture(
    updateDoc(doc(db(), "motos", motoId), {
      plaque: propre === "" ? null : propre,
      ...traceModification(auteur),
    }),
  );
}
```

Remplacer les appels à `marquerCmcRecu` par `marquerPapierRecu(id, "cmc", …)`.

Dans la lecture d'une moto, poser les valeurs par défaut — **point de
vigilance 3** :

```ts
    quittanceRecue: donnees.quittanceRecue === true,
    plaque: typeof donnees.plaque === "string" ? donnees.plaque : null,
```

- [ ] **Étape 10 : vérifier et committer**

Lancer : `rtk npx tsc --noEmit` puis `rtk npm run test:unite`
Attendu : types propres, 773 tests + les nouveaux, tous verts.

```bash
rtk git add lib/domain/moto.ts lib/domain/moto.test.ts lib/repositories/motos.ts firestore.rules regles/motos.test.ts
rtk git commit -m "S53 : la moto porte sa quittance et sa plaque"
```

---

### Tâche 3 : la vente porte ce que le client a emporté

**Fichiers :**
- Modifier : `lib/domain/vente.ts:100-170`, `lib/repositories/ventes.ts`
- Modifier : `firestore.rules` (validation de `ventesMotos`)
- Test : `lib/domain/vente.test.ts`, `regles/ventes.test.ts`

**Interfaces :**
- Produit : `Vente.emporte: PapiersEmportes`, `Vente.carteGriseChemin: string | null`,
  `PAPIERS_EMPORTES_VIDES`, `marquerEmporte(venteId, papier, emporte, auteur)`
- Consomme : `PapierEnMain` de la tâche 2.

- [ ] **Étape 1 : écrire le test qui échoue**

Dans `lib/domain/vente.test.ts` :

```ts
describe("lireEmporte", () => {
  /* **Point de vigilance 2.** Toutes les ventes d'avant S53 n'ont pas le
     champ. Elles doivent se lire « rien d'emporté », jamais `undefined` —
     sinon l'écran du dossier affiche un vide là où il doit afficher « à faire ». */
  it("lit une vente d’avant S53 comme n’ayant rien fait emporter", () => {
    expect(lireEmporte(undefined)).toEqual({ quittance: false, cmc: false });
  });

  it("lit ce que la vente porte, et ignore une clé inconnue", () => {
    expect(lireEmporte({ quittance: true, cmc: false, carte_grise: true })).toEqual({
      quittance: true,
      cmc: false,
    });
  });
});
```

- [ ] **Étape 2 : voir le test échouer**

Lancer : `rtk npx vitest run lib/domain/vente.test.ts`
Attendu : ÉCHEC — `lireEmporte is not a function`.

- [ ] **Étape 3 : écrire le minimum**

Dans `lib/domain/vente.ts` :

```ts
/**
 * Ce que le client a emporté à l'achat.
 *
 * **La carte grise n'y figure pas**, et c'est une règle du métier, pas un
 * oubli : « la carte grise n'est jamais disponible à l'achat ». Elle est encore
 * chez le prestataire le jour de la vente.
 */
export type PapiersEmportes = { quittance: boolean; cmc: boolean };

export const PAPIERS_EMPORTES_VIDES: PapiersEmportes = { quittance: false, cmc: false };

/** Lit le champ d'une vente, y compris quand il n'existe pas (ventes d'avant S53). */
export function lireEmporte(brut: unknown): PapiersEmportes {
  if (brut === null || typeof brut !== "object") return PAPIERS_EMPORTES_VIDES;
  const valeurs = brut as Record<string, unknown>;
  return { quittance: valeurs.quittance === true, cmc: valeurs.cmc === true };
}
```

Ajouter au type `Vente` :

```ts
  /** Ce que le client a emporté. Jamais `null` : `lireEmporte` comble les ventes anciennes. */
  emporte: PapiersEmportes;
  /** Le scan de la carte grise, déposé au retour. `null` tant qu'il n'existe pas. */
  carteGriseChemin: string | null;
```

- [ ] **Étape 4 : voir le test passer**

Lancer : `rtk npx vitest run lib/domain/vente.test.ts`
Attendu : SUCCÈS.

- [ ] **Étape 5 : écrire les tests de règles qui échouent**

Dans `regles/ventes.test.ts` :

```ts
it("accepte que le gerant marque un papier emporte sur sa vente", async () => {
  const base = gerantDe("ABC");
  await assertSucceeds(
    updateDoc(doc(base, "ventesMotos", "v1"), { emporte: { quittance: true, cmc: false }, ...audit() }),
  );
});

/* **Point de vigilance 4.** On ne remet pas ce qu'on n'a pas. La règle ne peut
   pas lire la moto — elle borne donc la forme, et l'ecran tient la condition
   metier. Ce test fige la frontiere entre les deux. */
it("refuse un emporte qui ne serait pas deux booleens", async () => {
  const base = gerantDe("ABC");
  await assertFails(
    updateDoc(doc(base, "ventesMotos", "v1"), { emporte: { quittance: "oui" }, ...audit() }),
  );
});

it("refuse que le gerant marque emporte sur la vente d’une autre boutique", async () => {
  const base = gerantDe("ABC");
  await assertFails(
    updateDoc(doc(base, "ventesMotos", "vXYZ"), { emporte: { quittance: true, cmc: true }, ...audit() }),
  );
});
```

- [ ] **Étape 6 : voir les tests de règles échouer**

Lancer : `rtk npm run test:regles:isole`
Attendu : ÉCHEC — `emporte` hors de `hasOnly`.

- [ ] **Étape 7 : ouvrir les règles**

Dans la validation de `ventesMotos`, ajouter `'emporte'` et `'carteGriseChemin'`
aux clés autorisées, puis :

```
             // Facultatifs : les ventes d'avant S53 n'en portent aucun.
             && (!donnees.keys().hasAny(['emporte'])
                 || (donnees.emporte.keys().hasOnly(['quittance', 'cmc'])
                     && donnees.emporte.quittance is bool
                     && donnees.emporte.cmc is bool))
             && (!donnees.keys().hasAny(['carteGriseChemin'])
                 || donnees.carteGriseChemin == null
                 || texteBorne(donnees.carteGriseChemin, 400))
```

- [ ] **Étape 8 : poser l'écriture**

Dans `lib/repositories/ventes.ts` :

```ts
/**
 * Dit que le client a emporté un papier — ou qu'il ne l'a plus.
 *
 * **C'est le seul geste de comptoir qui reste** pour la quittance et le CMC :
 * leur disponibilité se coche sur la moto, souvent bien avant la vente.
 */
export function marquerEmporte(
  venteId: string,
  papier: PapierEnMain,
  emporte: boolean,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "ventesMotos", venteId), {
      [`emporte.${papier}`]: emporte,
      ...traceModification(auteur),
    }),
  );
}
```

Dans la lecture d'une vente : `emporte: lireEmporte(donnees.emporte)`.

- [ ] **Étape 9 : vérifier et committer**

Lancer : `rtk npm run test:regles:isole` puis `rtk npm run test:unite`
Attendu : tout vert.

```bash
rtk git add lib/domain/vente.ts lib/domain/vente.test.ts lib/repositories/ventes.ts firestore.rules regles/ventes.test.ts
rtk git commit -m "S53 : la vente dit ce que le client a emporte"
```

---

### Tâche 4 : la clôture lit la vente, des deux côtés

**Fichiers :**
- Modifier : `lib/domain/dossier.ts:118-135`, `functions/src/index.ts:963-977`
- Test : `lib/domain/dossier.test.ts`, `declencheurs/cloture.test.ts`

**Interfaces :**
- Consomme : `etatPapier` (tâche 1), `PapiersEmportes` (tâche 3)
- Produit : `dossierCloturable(etat)` à la signature élargie

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
describe("dossierCloturable", () => {
  it("clôt quand les deux papiers sont emportés et la carte grise revenue", () => {
    expect(
      dossierCloturable({
        documents: [
          { type: "quittance", statut: "a_faire" },
          { type: "cmc", statut: "a_faire" },
          { type: "carte_grise", statut: "revenu_magasin" },
        ],
        emporte: { quittance: true, cmc: true },
      }),
    ).toBe(true);
  });

  it("ne clôt pas tant qu’un papier disponible n’a pas été emporté", () => {
    expect(
      dossierCloturable({
        documents: [
          { type: "quittance", statut: "a_faire" },
          { type: "cmc", statut: "a_faire" },
          { type: "carte_grise", statut: "revenu_magasin" },
        ],
        emporte: { quittance: true, cmc: false },
      }),
    ).toBe(false);
  });

  it("clôt un dossier dont tout est sans objet, sans rien emporter", () => {
    expect(
      dossierCloturable({
        documents: [
          { type: "quittance", statut: "non_applicable" },
          { type: "cmc", statut: "non_applicable" },
          { type: "carte_grise", statut: "non_applicable" },
        ],
        emporte: { quittance: false, cmc: false },
      }),
    ).toBe(true);
  });

  it("ne clôt pas une carte grise encore chez le prestataire", () => {
    expect(
      dossierCloturable({
        documents: [
          { type: "quittance", statut: "non_applicable" },
          { type: "cmc", statut: "non_applicable" },
          { type: "carte_grise", statut: "chez_prestataire" },
        ],
        emporte: { quittance: false, cmc: false },
      }),
    ).toBe(false);
  });
});
```

- [ ] **Étape 2 : voir le test échouer**

Lancer : `rtk npx vitest run lib/domain/dossier.test.ts`
Attendu : ÉCHEC — `EtatDossier` n'a pas de champ `emporte`.

- [ ] **Étape 3 : écrire le minimum**

```ts
export type EtatDossier = {
  documents: readonly { type: TypeDocument; statut: StatutDocument }[];
  /** Ce que le client a emporté. La clôture ne lit **jamais** la moto. */
  emporte: PapiersEmportes;
};

/**
 * Un dossier est-il fini ?
 *
 * **La clôture ne lit pas la moto, et c'est une propriété à tenir.** Sans elle,
 * il faudrait réveiller la clôture à chaque case cochée sur un arrivage — une
 * moto dont le CMC arrive clôturerait un dossier que personne n'a touché. La
 * remise au client est un geste, donc un fait écrit sur la vente ; c'est lui
 * qui fait foi.
 */
export function dossierCloturable(etat: EtatDossier): boolean {
  return TYPES_DOCUMENT.every((type) => {
    const document = etat.documents.find((candidat) => candidat.type === type);
    const statut = document?.statut ?? "a_faire";
    if (statut === "non_applicable") return true;
    if (type === "carte_grise") return statut === "revenu_magasin" || statut === "remis_client";
    return etat.emporte[type];
  });
}
```

- [ ] **Étape 4 : voir le test passer**

Lancer : `rtk npx vitest run lib/domain/dossier.test.ts`
Attendu : SUCCÈS.

- [ ] **Étape 5 : répliquer côté serveur**

Dans `functions/src/index.ts`, remplacer le corps de `dossierFini` :

```ts
  if (vente.statutPaiement !== "solde" || vente.motoRemise !== true) return false;

  /* Réplique de `dossierCloturable` (D27). La duplication est le prix du
     cloisonnement des paquets : `functions/` a son propre tsconfig. */
  const emporte = (vente.emporte ?? {}) as Record<string, unknown>;
  const documents = await base.collection(`ventesMotos/${venteId}/documents`).get();
  const parType = new Map(documents.docs.map((doc) => [doc.get("type"), doc.get("statut")]));

  return TYPES_DOCUMENT.every((type) => {
    const statut = parType.get(type) ?? "a_faire";
    if (statut === "non_applicable") return true;
    if (type === "carte_grise") return statut === "revenu_magasin" || statut === "remis_client";
    return emporte[type] === true;
  });
```

**Aucun nouveau déclencheur** : `cloturerSurVente` se déclenche déjà sur toute
écriture de `ventesMotos/{venteId}`, donc sur `emporte`.

- [ ] **Étape 6 : lancer les tests de déclencheurs**

Lancer : `rtk npm run test:declencheurs`
Attendu : SUCCÈS. Mettre à jour les cas qui figent l'ancienne condition.

- [ ] **Étape 7 : commit**

```bash
rtk git add lib/domain/dossier.ts lib/domain/dossier.test.ts functions/src/index.ts declencheurs/
rtk git commit -m "S53 : la cloture lit ce que le client a emporte"
```

---

### Tâche 5 : la case du comptoir ouvre la carte grise à « sans objet »

**Fichiers :**
- Modifier : `lib/repositories/ventes.ts:410-421`, `firestore.rules`
- Test : `regles/dossiers.test.ts`, `e2e/ventes.spec.ts`

- [ ] **Étape 1 : écrire le test de règles qui échoue**

```ts
it("accepte non_applicable a la creation, pour la carte grise seule", async () => {
  const base = gerantDe("ABC");
  await assertSucceeds(
    setDoc(doc(base, "ventesMotos/v1/documents/carte_grise"), {
      boutiqueId: "ABC", venteId: "v1", type: "carte_grise", statut: "non_applicable", ...audit(),
    }),
  );
});

it("refuse tout autre statut initial", async () => {
  const base = gerantDe("ABC");
  await assertFails(
    setDoc(doc(base, "ventesMotos/v1/documents/cmc"), {
      boutiqueId: "ABC", venteId: "v1", type: "cmc", statut: "revenu_magasin", ...audit(),
    }),
  );
});
```

- [ ] **Étape 2 : voir le test échouer**

Lancer : `rtk npm run test:regles:isole`
Attendu : ÉCHEC — la règle n'accepte que `a_faire` à la création.

- [ ] **Étape 3 : ouvrir la règle**

```
      // Décochée au comptoir, la carte grise naît « sans objet » : il n'y a
      // rien à poursuivre, et le dossier se clôt sans geste supplémentaire.
      // Les deux autres papiers n'ont pas cette porte : leur disponibilité
      // vient de la moto, pas d'une case de vente.
      allow create: if peutVendrePour(request.resource.data.boutiqueId)
                    && (request.resource.data.statut == 'a_faire'
                        || (request.resource.data.type == 'carte_grise'
                            && request.resource.data.statut == 'non_applicable'));
```

- [ ] **Étape 4 : écrire la création conditionnelle**

Dans `lib/repositories/ventes.ts`, remplacer la boucle :

```ts
  for (const type of TYPES_DOCUMENT) {
    /* **La case du comptoir pilote le dossier** (arbitrage 5). Décocher
       « Carte grise » laissait jusqu'ici un document « à faire » que personne
       n'allait jamais faire, et qui bloquait la clôture : le reçu imprimait
       « non inclus » pendant que le dossier la réclamait. */
    const statut: StatutDocument =
      type === "carte_grise" && saisie.carteGrise === false ? "non_applicable" : "a_faire";

    lot.set(doc(reference, "documents", type), {
      boutiqueId,
      venteId: reference.id,
      type,
      statut,
      ...traceCreation(auteur),
    });
  }
```

- [ ] **Étape 5 : vérifier**

Lancer : `rtk npm run test:regles:isole`
Attendu : SUCCÈS.

- [ ] **Étape 6 : commit**

```bash
rtk git add lib/repositories/ventes.ts firestore.rules regles/dossiers.test.ts
rtk git commit -m "S53 : la case du comptoir ouvre la carte grise a sans objet"
```

---

### Tâche 6 : les écrans du stock montrent les deux papiers

**Fichiers :**
- Modifier : `components/FicheMoto.tsx`, `components/InspecterLotModal.tsx`
- Modifier : `lib/domain/arrivage.ts:168-215`
- Test : `lib/domain/arrivage.test.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
it("compte les quittances manquantes d’un lot comme il compte les CMC", () => {
  const motos = [
    { arrivageId: "L1", statut: "en_stock", cmcRecu: true, quittanceRecue: false },
    { arrivageId: "L1", statut: "en_stock", cmcRecu: false, quittanceRecue: true },
  ];
  expect(completudePapiers(motos, "L1")).toEqual({
    total: 2,
    cmcManquants: 1,
    quittancesManquantes: 1,
  });
});
```

- [ ] **Étape 2 : voir le test échouer**

Lancer : `rtk npx vitest run lib/domain/arrivage.test.ts`
Attendu : ÉCHEC — `completudePapiers is not a function`.

- [ ] **Étape 3 : écrire le minimum**

```ts
export type CompletudePapiers = {
  total: number;
  cmcManquants: number;
  quittancesManquantes: number;
};

/**
 * Ce qui manque à un lot, papier par papier.
 *
 * Remplace `completudeCmc`, qui ne comptait qu'un des deux : la quittance a la
 * même nature et se perd de la même façon, et un seul des deux compté était ce
 * qui faisait croire que le produit « ne suit pas le vrai circuit ».
 */
export function completudePapiers(
  motos: readonly Pick<Moto, "arrivageId" | "cmcRecu" | "quittanceRecue">[],
  arrivageId: string,
): CompletudePapiers {
  const duLot = motos.filter((moto) => moto.arrivageId === arrivageId);
  return {
    total: duLot.length,
    cmcManquants: duLot.filter((moto) => !moto.cmcRecu).length,
    quittancesManquantes: duLot.filter((moto) => !moto.quittanceRecue).length,
  };
}
```

- [ ] **Étape 4 : voir le test passer**

Lancer : `rtk npx vitest run lib/domain/arrivage.test.ts`
Attendu : SUCCÈS.

- [ ] **Étape 5 : porter aux écrans**

Dans `components/InspecterLotModal.tsx` : une colonne « Quittance » en face de
la colonne « CMC », avec la même case, appelant
`marquerPapierRecu(moto.id, "quittance", coché, auteur)`.

Remplacer les appelants de `completudeCmc` — `cartesArrivages` dans
`lib/domain/arrivage.ts`, `components/CartesArrivages.tsx` et le bordereau de
lot — par `completudePapiers`, et retirer `completudeCmc` une fois sans usage.
Un compteur laissé derrière redirait la moitié de la vérité.

Dans `components/InventaireStock.tsx` : afficher la plaque à côté du châssis
dans « Les plus anciennes ». La spec l'exige — « la plaque se relit sur la fiche
de la moto **et dans l'inventaire** » — et c'est ce qui justifie de l'avoir
rangée sur la moto plutôt que sur la vente.

Dans `components/FicheMoto.tsx` : une section « Papiers en main » portant les
deux cases et, quand elle existe, la plaque :

```tsx
{/* **La fiche ne disait pas si la carte était au magasin**, alors que la
    donnée existait depuis S43 : elle ne se voyait que dans l'inspection d'un
    lot. Ouvrir une moto pour savoir où en sont ses papiers est pourtant le
    premier réflexe. */}
<section className="mt-6">
  <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
    Papiers en main
  </h2>
  <CasePapier moto={moto} papier="quittance" libelle="Quittance" />
  <CasePapier moto={moto} papier="cmc" libelle="CMC" />
  {moto.plaque && <Ligne titre="Plaque" valeur={moto.plaque} />}
</section>
```

- [ ] **Étape 6 : vérifier et committer**

Lancer : `rtk npx tsc --noEmit` et `rtk npm run test:unite`

```bash
rtk git add lib/domain/arrivage.ts lib/domain/arrivage.test.ts components/FicheMoto.tsx components/InspecterLotModal.tsx
rtk git commit -m "S53 : la quittance se coche la ou le CMC se cochait deja"
```

---

### Tâche 7 : l'écran des dossiers lit les motos

**Fichiers :**
- Modifier : `lib/domain/dossier.ts:369`, `app/(app)/motos/dossiers/page.tsx`
- Test : `lib/domain/dossier.test.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
it("affiche « au magasin » pour une vente dont la moto porte son CMC, sans geste sur le dossier", () => {
  const dossiers = dossiersEnAttente(
    [venteOuverte("v1", "m1")],
    [{ ...documentNu("v1", "cmc"), statut: "a_faire" }],
    [{ id: "m1", cmcRecu: true, quittanceRecue: false }],
    FILTRES_DOSSIERS_VIDES,
    new Date("2026-10-15"),
  );
  expect(dossiers[0].papiers.find((p) => p.type === "cmc")?.etat).toBe("au_magasin");
});
```

- [ ] **Étape 2 : voir le test échouer**

Lancer : `rtk npx vitest run lib/domain/dossier.test.ts`
Attendu : ÉCHEC — `dossiersEnAttente` prend quatre arguments.

- [ ] **Étape 3 : élargir la signature**

```ts
/** Ce que l'écran des dossiers a besoin de savoir d'une moto, et rien de plus. */
export type MotoDuDossier = { id: string; cmcRecu: boolean; quittanceRecue: boolean };

export function dossiersEnAttente(
  ventes: readonly VenteDuDossier[],
  documents: readonly DocumentDossier[],
  /* **Le vrai coût de ce modèle, et il faut le dire :** l'écran des dossiers
     ne chargeait pas les motos. Il lui faut désormais une écoute de plus —
     celle du stock de la boutique, qu'il partage avec l'écran des motos. Le
     repli, si elle coûte trop, est de ne calculer l'état que sur la fiche de
     vente, où la moto est déjà chargée. */
  motos: readonly MotoDuDossier[],
  filtres: FiltresDossiers,
  aujourdhui: Date,
): DossierEnAttente[] {
```

Dans le corps, construire `new Map(motos.map((m) => [m.id, m]))` et remplir
`papiers` avec `etatPapier` pour chaque type.

- [ ] **Étape 4 : voir le test passer**

Lancer : `rtk npx vitest run lib/domain/dossier.test.ts`
Attendu : SUCCÈS.

- [ ] **Étape 5 : brancher l'écran**

Dans `app/(app)/motos/dossiers/page.tsx`, ajouter l'écoute `ecouterStock` du
périmètre et passer les motos à `dossiersEnAttente`.

- [ ] **Étape 6 : commit**

```bash
rtk git add lib/domain/dossier.ts lib/domain/dossier.test.ts "app/(app)/motos/dossiers/page.tsx"
rtk git commit -m "S53 : l'ecran des dossiers lit l'etat des papiers sur la moto"
```

---

### Tâche 8 : la fiche de vente — emporté, scan, plaque

**Fichiers :**
- Modifier : `components/FicheVente.tsx`
- Test : `e2e/dossier.spec.ts`

- [ ] **Étape 1 : écrire le témoin e2e qui échoue**

Dans `e2e/dossier.spec.ts` :

```ts
test("le papier coché à l’arrivage se lit au dossier, et s’emporte depuis la vente", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const { terrain, chassis, numero } = await vendreAvecDossier(page);

  /* Le CMC se coche sur la moto, jamais sur le dossier : c'est tout l'objet
     de S53. */
  await page.goto("/motos", { waitUntil: "load" });
  await page.getByLabel("Chercher dans le stock").fill(chassis);
  await page.getByRole("link", { name: chassis }).click();
  await page.getByRole("checkbox", { name: "CMC" }).check();

  /* Et le dossier bouge sans qu'on y ait touché. */
  await page.goto("/motos/dossiers", { waitUntil: "load" });
  const ligne = contenu(page).locator("tbody tr").filter({ hasText: numero });
  await expect(ligne).toContainText("Au magasin", { timeout: 30_000 });

  /* **Point de vigilance 4** : la quittance n'est pas en main, on ne peut pas
     l'emporter. */
  await page.goto("/motos/ventes", { waitUntil: "load" });
  await ouvrirLaFicheVente(page, numero);
  await expect(page.getByRole("checkbox", { name: /Quittance emportée/ })).toBeDisabled();

  await page.getByRole("checkbox", { name: /CMC emporté/ }).check();
  await expect(contenu(page)).toContainText("Emporté par le client", { timeout: 30_000 });

  await page.getByLabel("Numéro de plaque").fill("11 aa 1234");
  await page.getByRole("button", { name: "Enregistrer la plaque" }).click();
  await expect(contenu(page)).toContainText("11 AA 1234", { timeout: 30_000 });
});
```

- [ ] **Étape 2 : voir le témoin échouer**

```bash
mv .env.local.emulateurs .env.local
node scripts/emulateurs.mjs   # en arriere-plan, attendre les ports
NEXT_DIST_DIR=.next-emulateurs npm run build
NEXT_DIST_DIR=.next-emulateurs npx playwright test e2e/dossier.spec.ts --reporter=list
```

Attendu : ÉCHEC — les cases n'existent pas.

- [ ] **Étape 3 : poser les trois éléments sur la fiche**

Dans `components/FicheVente.tsx` : une section « Ce que le client a emporté »
avec deux cases désactivées tant que la moto ne porte pas le papier ; le bouton
d'envoi du scan de carte grise, par le mécanisme de `envoyerPapierMoto` ; un
champ « Numéro de plaque » appelant `poserPlaque`.

- [ ] **Étape 4 : voir le témoin passer, puis restaurer**

```bash
NEXT_DIST_DIR=.next-emulateurs npm run build
NEXT_DIST_DIR=.next-emulateurs npx playwright test e2e/dossier.spec.ts --reporter=list
mv .env.local .env.local.emulateurs
rtk git checkout -- tsconfig.json
```

Attendu : SUCCÈS, puis dépôt propre.

- [ ] **Étape 5 : commit**

```bash
rtk git add components/FicheVente.tsx e2e/dossier.spec.ts
rtk git commit -m "S53 : la fiche de vente porte l'emporte, le scan et la plaque"
```

---

### Tâche 9 : le trou de S48, le vocabulaire, la décision

**Fichiers :**
- Modifier : `firestore.rules:303`, `components/FichePrestataire.tsx`
- Modifier : `lib/domain/moto.test.ts`, `DECISIONS.md`
- Test : `regles/prestataires.test.ts`

- [ ] **Étape 1 : écrire les tests de règles qui échouent**

```ts
it("refuse plaque a la creation d’un prestataire", async () => {
  const base = responsable();
  await assertFails(
    setDoc(doc(base, "prestataires", "p1"), { ...prestataireValable(), typesDocuments: ["plaque"], ...audit() }),
  );
});

it("accepte encore plaque en modification, pour que les fiches anciennes se corrigent", async () => {
  const base = responsable();
  await assertSucceeds(
    updateDoc(doc(base, "prestataires", "pAncien"), { typesDocuments: ["plaque"], ...audit() }),
  );
});
```

- [ ] **Étape 2 : voir les tests échouer**

Lancer : `rtk npm run test:regles:isole`
Attendu : ÉCHEC — la création accepte encore `plaque`.

- [ ] **Étape 3 : fermer le trou**

Séparer la règle de création de celle de modification dans `firestore.rules`,
avec le commentaire qui dit pourquoi l'asymétrie est voulue.

- [ ] **Étape 4 : corriger le vocabulaire**

- Dans `lib/domain/moto.test.ts`, remplacer « Carte grise » comme exemple de
  texte libre de `papiersFournis` par « Double des clés ».
- Changer l'intitulé « Papiers fournis » à l'écran en « Notes du vendeur ».
- Retirer le groupe de cases « Types de documents » de `FichePrestataire.tsx`.

- [ ] **Étape 5 : écrire la décision**

Ajouter à `DECISIONS.md` un paragraphe nommant les sept emplois du mot
« carte » relevés par la spec, et disant lequel survit à S53. Sans lui, la
confusion repousse.

- [ ] **Étape 6 : vérifier et committer**

Lancer : `rtk npm run test:unite` puis `rtk npm run test:regles:isole`

```bash
rtk git add firestore.rules regles/prestataires.test.ts components/FichePrestataire.tsx lib/domain/moto.test.ts DECISIONS.md
rtk git commit -m "S53 : la plaque ne se cree plus sur un prestataire, le vocabulaire se range"
```

---

## Avant de dire que c'est fini

- [ ] `rtk npm run test:unite` — tout vert.
- [ ] `rtk npm run test:regles:isole` — tout vert.
- [ ] `rtk npm run test:declencheurs` — tout vert.
- [ ] `rtk npx eslint` et `rtk npx tsc --noEmit` — propres.
- [ ] Les fichiers e2e **ciblés** : `dossier.spec.ts`, `ventes.spec.ts`,
      `arrivages.spec.ts`. Un à la fois, émulateurs neufs. **Pas de passe complète.**
- [ ] `public/sw.js` reconstruit pour le vrai projet, et **toutes** ses entrées
      préchargées répondent — le piège trouvé le 15 octobre.
- [ ] Le rendu regardé en clair, en sombre, sur Pixel 7, **des deux rôles**.
- [ ] `.env.local` **absent** du dépôt, `tsconfig.json` propre.
