# S56 — Le portail du prestataire : plan d'implémentation

> **Pour les exécutants :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** donner à chaque prestataire un lien de consultation qui dit où en sont
ses cartes grises et combien d'avances il a reçues, sans compte et sans ouvrir
Firestore d'un millimètre.

**Architecture :** un jeton de 32 octets, fabriqué par une fonction appelable et
posé sur la fiche du prestataire. Une fonction HTTP — `suiviPrestataire` — reçoit
ce jeton dans son **corps**, résout le prestataire, lit avec les droits du
serveur et renvoie une charge utile nommée. Une page Next **rendue côté serveur**
appelle cette fonction et affiche le résultat. Aucune règle Firestore n'est
assouplie : la fonction est la seule porte.

**Pile :** Next.js 16 App Router, TypeScript strict, Tailwind v4, Firestore,
Cloud Functions (`onCall` + `onRequest`), Vitest,
`@firebase/rules-unit-testing`, Playwright.

**Spec :** `specs/S56-portail-prestataire.md` (validée le 16 octobre 2026).

**Hors de ce plan, et écrit noir sur blanc :** le **prix convenu** et le
**règlement** d'un prestataire — c'est-à-dire le mot « solde ». La spec a tranché
la possibilité (a) : les deux termes de la soustraction n'existent pas dans le
modèle, et les inventer serait une spec de caisse. Le portail affiche
« Avances reçues » et rien de plus sur l'argent.

---

## Contraintes globales

- **TDD obligatoire** (D103) : le test échoue d'abord, et on le voit échouer.
- **Tout en français**, y compris les noms de symboles et les commentaires. Les
  commentaires disent **pourquoi**, jamais quoi.
- **Jamais `prettier`** sur ce dépôt.
- **Messages de commit** : `S56 : <phrase à l'indicatif>`, sujet **sans
  accents**, corps **avec** accents.
- **Pas de passe e2e complète.** Un fichier ciblé à la fois, sur des émulateurs
  qui viennent de démarrer. Une passe complète dure plus d'une heure et rend des
  verdicts d'outillage, pas des verdicts de produit.
- **L'e2e lit le build, pas un fichier d'environnement** (S53). Enchaîner, avec
  la **même** `NEXT_DIST_DIR` :
  ```sh
  NEXT_PUBLIC_FIREBASE_EMULATEURS=1 NEXT_PUBLIC_FIREBASE_PROJECT_ID=sdi-dev \
    NEXT_DIST_DIR=.next-emulateurs npm run build
  NEXT_DIST_DIR=.next-emulateurs NEXT_PUBLIC_FIREBASE_EMULATEURS=1 npm run test:e2e -- e2e/<fichier>
  ```
- **APRÈS tout build d'émulateurs** : `npm run build` sans variable, puis
  `npm run verifier:sw`. Serwist écrit `public/sw.js` **hors** du répertoire de
  build ; un `sw.js` qui cite des fragments absents fait tomber le hors-ligne en
  entier, en silence, et seulement en coupure.
- **`rtk playwright test` ne rend pas un verdict fiable** (il a déjà dit
  « exit 0 » sur un test échoué). Pour l'e2e : `npx playwright test --reporter=line`.
- **`tsconfig.json` ressort modifié après chaque `next build`** :
  `git checkout -- tsconfig.json`. Ce n'est pas du travail.
- **`functions/` ne peut pas importer `lib/`** : son `tsconfig` a
  `rootDir: "src"`. Le partage se fait par **test d'aller-retour**, comme
  `numerotation` (le serveur fabrique, le client relit, un test les noue).
- **Aucune suppression ni migration de données** dans ce plan. Rien sur
  `sandwini` sans demander.
- Commandes préfixées de `rtk`.

---

## Points de vigilance

Cinq classes d'entrée que la spec implique sans qu'aucune tâche ne les exerce
d'elle-même. Chacune reçoit son test dans la tâche qui porte le code.

1. **Un jeton qui n'est pas un jeton** — vide, trop court, avec un `/`, long de
   dix mille caractères, ou absent du corps. La fonction doit répondre le même
   refus qu'à un jeton inconnu, et surtout ne pas lancer une requête Firestore
   avec une valeur arbitraire. → tâche 4.
2. **Un prestataire sans jeton** — `jetonSuivi` absent ou `null`. La requête
   `where('jetonSuivi', '==', null)` rendrait **toutes** les fiches jamais
   émises : un jeton nul ne doit jamais atteindre la requête. → tâche 4.
3. **Une carte grise dont la vente, la moto ou le client a disparu** (ou n'a
   jamais été lisible). La ligne doit se construire quand même, ou disparaître
   proprement — jamais faire échouer tout le portail. → tâche 3.
4. **Un prestataire à zéro carte** et **un prestataire à deux cents cartes**. Le
   premier doit rendre une page qui le dit ; le second ne doit pas rendre
   `undefined` sur un `enCours[0]` supposé. → tâches 3 et 5.
5. **La page sans réseau**, et la fonction qui ne répond pas. La page est en
   ligne seulement (exception écrite à D40) : elle doit **le dire**, pas rester
   blanche ni afficher une pile d'appels. → tâche 5.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---------|----------------|
| `lib/domain/jeton-suivi.ts` *(créé)* | Ce qu'est un jeton, ce qu'est un lien. Validation de forme, construction de l'URL. Pur. |
| `lib/domain/jeton-suivi.test.ts` *(créé)* | — |
| `lib/domain/suivi-prestataire.ts` *(créé)* | Le **type** de la charge utile et son **relecteur** `lireSuivi(json)`. C'est la moitié cliente de l'aller-retour. Pur. |
| `lib/domain/suivi-prestataire.test.ts` *(créé)* | — |
| `functions/src/suivi.ts` *(créé)* | La moitié serveur : `construireSuivi(...)`, pur, sans Firestore. |
| `functions/src/suivi.test.ts` *(créé)* | Tourne sous le Vitest de la racine ; importe **les deux moitiés** et les noue. |
| `functions/src/index.ts` *(modifié)* | `emettreJetonSuivi` (onCall) et `suiviPrestataire` (onRequest). |
| `firestore.rules` *(modifié)* | `prestataireValide` accepte les deux champs du jeton et interdit au client d'y toucher. |
| `firestore.indexes.json` *(modifié)* | L'index sur `jetonSuivi`. |
| `tests/regles/prestataires.test.ts` *(modifié — vérifier le nom réel)* | Les deux sens du jeton, et la fiche qui reste modifiable. |
| `lib/fonctions/url.ts` *(créé)* | L'URL d'une fonction HTTP, émulateurs compris. Pur, testé. |
| `lib/repositories/jeton-suivi.ts` *(créé)* | L'appel de `emettreJetonSuivi` depuis l'écran. |
| `app/suivi/[jeton]/page.tsx` *(créé)* | La page publique, rendue côté serveur. `noindex`. |
| `components/LienDeSuivi.tsx` *(créé)* | Le bouton « Créer le lien de suivi » et l'affichage du lien, sur la fiche. |
| `app/(app)/parametres/prestataires/page.tsx` *(modifié)* | Y pose le composant ci-dessus. |
| `e2e/suivi-prestataire.spec.ts` *(créé)* | Le témoin de bout en bout, **un seul fichier**. |

---

## Tâche 1 — Ce qu'est un jeton, et ce qu'est un lien

**Fichiers :**
- Créer : `lib/domain/jeton-suivi.ts`
- Test : `lib/domain/jeton-suivi.test.ts`

**Interfaces produites** (les tâches suivantes s'appuient dessus, mot pour mot) :

```ts
export const OCTETS_JETON = 32;
export const LONGUEUR_JETON = 43;              // 32 octets en base64url, sans '='
export function estJetonPlausible(valeur: unknown): valeur is string;
export function lienDeSuivi(origine: string, jeton: string): string;
```

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { describe, expect, test } from "vitest";
import {
  LONGUEUR_JETON,
  OCTETS_JETON,
  estJetonPlausible,
  lienDeSuivi,
} from "./jeton-suivi";

describe("la forme d'un jeton de suivi", () => {
  /* **La longueur est figée par un test, c'est un critere de la spec.** Un
     jeton raccourci un jour « pour que le lien tienne dans un SMS » perdrait
     l'alea qui fait toute la protection de ce portail. */
  test("trente-deux octets en base64url font quarante-trois caracteres", () => {
    expect(OCTETS_JETON).toBe(32);
    expect(LONGUEUR_JETON).toBe(Math.ceil((OCTETS_JETON * 4) / 3));
    expect(estJetonPlausible("a".repeat(LONGUEUR_JETON))).toBe(true);
  });

  test.each([
    ["vide", ""],
    ["trop court", "a".repeat(LONGUEUR_JETON - 1)],
    ["trop long", "a".repeat(LONGUEUR_JETON + 1)],
    ["avec une barre oblique", `${"a".repeat(LONGUEUR_JETON - 1)}/`],
    ["avec un plus", `${"a".repeat(LONGUEUR_JETON - 1)}+`],
    ["avec un egal", `${"a".repeat(LONGUEUR_JETON - 1)}=`],
    ["demesure", "a".repeat(10_000)],
  ])("refuse un jeton %s", (_cas, valeur) => {
    expect(estJetonPlausible(valeur)).toBe(false);
  });

  test.each([null, undefined, 42, {}, []])("refuse ce qui n'est pas une chaine : %s", (valeur) => {
    expect(estJetonPlausible(valeur)).toBe(false);
  });

  test("le lien se construit sur l'origine du produit", () => {
    expect(lienDeSuivi("https://sdi.exemple.bf", "a".repeat(LONGUEUR_JETON))).toBe(
      `https://sdi.exemple.bf/suivi/${"a".repeat(LONGUEUR_JETON)}`,
    );
  });

  /* Une origine avec barre finale est ce que rend `window.location.origin` sur
     certains navigateurs : un lien a double barre s'envoie par WhatsApp et ne
     marche pas, et personne ne sait pourquoi. */
  test("une origine a barre finale ne produit pas un double slash", () => {
    expect(lienDeSuivi("https://sdi.exemple.bf/", "b".repeat(LONGUEUR_JETON))).toBe(
      `https://sdi.exemple.bf/suivi/${"b".repeat(LONGUEUR_JETON)}`,
    );
  });
});
```

- [ ] **Étape 2 : voir les tests échouer**

`rtk vitest run lib/domain/jeton-suivi.test.ts`
Attendu : ÉCHEC — « Failed to resolve import "./jeton-suivi" ».

- [ ] **Étape 3 : écrire le module**

```ts
/**
 * Le jeton qui ouvre le portail d'un prestataire (S56).
 *
 * **Ce jeton EST le mot de passe**, et la spec l'assume : qui l'a entre. C'est
 * pour cela que sa longueur est figee par un test et non par une preference —
 * le raccourcir « pour que le lien tienne dans un SMS » retirerait la seule
 * protection du portail.
 *
 * Il n'est pas hache en base : il vit dans l'URL, donc dans l'historique du
 * navigateur du prestataire. Le hacher donnerait l'illusion d'une protection
 * que le canal n'offre pas.
 *
 * **Ce module ne FABRIQUE pas de jeton**, et c'est voulu : un secret ne se
 * fabrique pas dans un navigateur (`SECURITY.md` §4). La fabrication vit dans
 * `functions/src/index.ts`, avec `randomBytes`. Ici, on sait seulement
 * reconnaitre un jeton bien forme et en faire un lien.
 */

export const OCTETS_JETON = 32;

/** 32 octets en base64url, sans remplissage : `ceil(32 * 4 / 3)`. */
export const LONGUEUR_JETON = Math.ceil((OCTETS_JETON * 4) / 3);

const FORME = new RegExp(`^[A-Za-z0-9_-]{${LONGUEUR_JETON}}$`);

/**
 * Ce jeton peut-il etre un jeton ?
 *
 * **Le filtre sert d'abord a ne pas interroger la base.** Sans lui, n'importe
 * quelle chaine trouvee dans une URL partirait en `where('jetonSuivi', '==',
 * ...)` — une requete par essai, offerte a qui tape au hasard. Reconnaitre la
 * forme avant de lire coute une expression reguliere et ferme ce robinet.
 */
export function estJetonPlausible(valeur: unknown): valeur is string {
  return typeof valeur === "string" && FORME.test(valeur);
}

/** Le lien a donner au prestataire. L'origine vient de l'appelant : ce module ne devine pas le domaine. */
export function lienDeSuivi(origine: string, jeton: string): string {
  return `${origine.replace(/\/+$/, "")}/suivi/${jeton}`;
}
```

- [ ] **Étape 4 : voir les tests passer**

`rtk vitest run lib/domain/jeton-suivi.test.ts`
Attendu : SUCCÈS.

- [ ] **Étape 5 : commit**

```sh
rtk git add lib/domain/jeton-suivi.ts lib/domain/jeton-suivi.test.ts
rtk git commit -m "S56 : un jeton de suivi a une forme, et un lien se construit"
```

---

## Tâche 2 — La règle ouvre la serrure sans ouvrir la porte

C'est la tâche la plus facile à oublier et la plus coûteuse à oublier. Tant
qu'elle n'est pas faite, **la première émission de jeton rend la fiche du
prestataire incorrigible** : `prestataireValide` impose un `hasOnly` en création
**et** en modification, et un champ de plus fait échouer toute mise à jour. Le
refus se lirait comme un défaut de droits sur un geste légitime — exactement le
blocage vécu le 16 octobre 2026 sur `sandwini`.

**Fichiers :**
- Modifier : `firestore.rules` (`prestataireValide`, vers la ligne 308, et le
  bloc `match /prestataires/{id}`, vers la ligne 344)
- Modifier : `firestore.indexes.json`
- Test : `regles/referentiels.test.ts`, dans le `describe("prestataires")`
  existant (vers la ligne 355). **Aucun fichier à créer** : les helpers
  `prestataire()`, `creationFigee`, `modification()`, `responsable()` et la
  fiche semée `prestataires/kabore` y sont déjà.

**Interfaces consommées :** aucune. Cette tâche ne dépend d'aucune autre, et
tout le reste dépend d'elle.

- [ ] **Étape 1 : écrire les tests de règles qui échouent**

Trois cas, et le premier est celui qui compte :

D'abord, poser un jeton sur une seconde fiche dans le `beforeEach` déjà présent
(vers la ligne 104, à côté de `prestataires/kabore`) :

```ts
    /* Une fiche qui PORTE un jeton, posee par les droits du serveur comme la
       fonction le fera. Elle existe pour un seul test, et c'est le plus
       important de ce bloc : celui qui prouve qu'elle reste corrigeable. */
    await setDoc(doc(base, "prestataires/sawadogo"), {
      nom: "Sawadogo",
      telephone: "70 11 11 11",
      typesDocuments: ["carte_grise"],
      actif: true,
      jetonSuivi: "a".repeat(43),
      jetonEmisLe: new Date("2026-10-16T08:00:00Z"),
      ...creationFigee,
    });
```

Puis les trois cas, dans `describe("prestataires")` :

```ts
  /* **Le piege du `hasOnly`, pris a l'envers.** `prestataireValide` impose la
     liste des champs en modification AUSSI. Sans ce test, la premiere emission
     d'un jeton rendrait tout changement de telephone impossible, et le refus
     parlerait de droits — c'est exactement le blocage du 16 octobre 2026. */
  it("une fiche qui porte un jeton reste modifiable : on y corrige un telephone", async () => {
    await assertSucceeds(
      updateDoc(
        doc(responsable(), "prestataires/sawadogo"),
        modification({
          nom: "Sawadogo",
          telephone: "70 11 11 12",
          typesDocuments: ["carte_grise"],
          actif: true,
        }),
      ),
    );
  });

  /* Un navigateur ne fabrique pas de secret (`SECURITY.md` §4). Le responsable
     non plus : sa prerogative est de decider, pas d'inventer de l'alea. */
  it("personne n’ecrit un jeton depuis un navigateur, responsable compris", async () => {
    await assertFails(
      updateDoc(
        doc(responsable(), "prestataires/kabore"),
        modification({ jetonSuivi: "z".repeat(43) }),
      ),
    );
  });

  /* Et il ne s'efface pas davantage : revoquer un lien se fait en le
     REGENERANT, par la fonction. Un `null` pose depuis l'ecran laisserait
     croire a une revocation sans qu'aucune trace serveur ne l'enregistre. */
  it("un jeton ne s’efface pas depuis un navigateur", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "prestataires/sawadogo"), modification({ jetonSuivi: null })),
    );
  });

  /* **Le critere central de la spec : la fonction est la seule porte.** Aucune
     regle n'est assouplie par S56, et ce test est ce qui le prouve. Il est
     pose ici, au plus pres du jeton, pour que quiconque serait tente
     d'autoriser une lecture publique « puisque le jeton protege » le trouve
     sur son chemin. */
  it("un visiteur non authentifie ne lit RIEN, jeton ou pas", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonyme, "prestataires/sawadogo")));
    await assertFails(getDocs(collection(anonyme, "prestataires")));
  });
```

- [ ] **Étape 2 : voir les tests échouer**

`rtk npm run test:regles` sur les émulateurs déjà allumés (sans `:isole`, pour
ne pas effacer le décor de `sdi-dev`).
Attendu : ÉCHEC — le premier test tombe parce que le `hasOnly` refuse la fiche à
jeton ; les deux autres tombent parce qu'ils **réussissent** l'écriture.

- [ ] **Étape 3 : modifier la règle**

```
    // Le champ du cahier des charges existe enfin (S56). Trois choses a la
    // fois, et elles tiennent ensemble :
    //
    // 1. les deux champs du jeton sont ACCEPTES dans le `hasOnly`, sans quoi
    //    une fiche a qui la fonction a pose un jeton deviendrait incorrigible —
    //    on ne pourrait plus y changer un numero de telephone, et le refus
    //    parlerait de droits.
    // 2. ils ne sont pas dans le `hasAll` : les fiches posees avant S56 n'en
    //    portent pas, et les leur exiger les rendrait tout aussi incorrigibles.
    // 3. aucun navigateur ne les ECRIT. Un secret ne se fabrique pas dans un
    //    navigateur (`SECURITY.md` §4), et le responsable n'y fait pas
    //    exception : sa prerogative est de decider, pas d'inventer de l'alea.
    //
    // C'est la meme asymetrie que `typesACreer` juste en dessous : on ouvre la
    // serrure sans ouvrir la porte.
    function jetonIntact(apres, avant) {
      return (apres.get('jetonSuivi', null) == avant.get('jetonSuivi', null))
             && (apres.get('jetonEmisLe', null) == avant.get('jetonEmisLe', null));
    }

    function prestataireValide(donnees) {
      return donnees.keys().hasOnly(['nom', 'telephone', 'typesDocuments', 'actif',
                                     'jetonSuivi', 'jetonEmisLe'].concat(champsAudit()))
             && donnees.keys().hasAll(['nom', 'telephone', 'typesDocuments', 'actif'].concat(champsAudit()))
             // ... le reste inchange ...
    }
```

et dans le `match` :

```
      allow create: if estResponsable()
                    && prestataireValide(request.resource.data)
                    && typesACreer(request.resource.data)
                    // Une fiche ne NAIT jamais avec un jeton : il s'emet ensuite,
                    // par la fonction, sur une fiche qui existe.
                    && !request.resource.data.keys().hasAny(['jetonSuivi', 'jetonEmisLe'])
                    && traceCreation(request.resource.data);
      allow update: if estResponsable()
                    && prestataireValide(request.resource.data)
                    && jetonIntact(request.resource.data, resource.data)
                    && traceModification(request.resource.data, resource.data);
```

Puis l'index, dans `firestore.indexes.json` — champ unique, donc une exemption
n'est pas nécessaire : Firestore indexe `jetonSuivi` tout seul. **Vérifier ce
point en lançant la requête sur l'émulateur à la tâche 4** ; n'ajouter un index
composite que si la requête le réclame, et jamais « au cas où ».

- [ ] **Étape 4 : voir les tests passer**

`rtk npm run test:regles`
Attendu : SUCCÈS, et aucun des tests de règles existants ne tombe.

- [ ] **Étape 5 : commit**

```sh
rtk git add firestore.rules firestore.indexes.json <fichier de tests de regles>
rtk git commit -m "S56 : la regle accepte un jeton sans laisser un navigateur l ecrire"
```

> **À ne pas oublier au bout de ce plan :** ces règles ne protègent `sandwini`
> qu'une fois **déployées**. Un `npm test` vert ne dit rien du projet distant.
> Voir la clôture du plan.

---

## Tâche 3 — La charge utile : les deux moitiés, et le nœud entre elles

**Fichiers :**
- Créer : `functions/src/suivi.ts` — la moitié **serveur** : elle fabrique.
- Créer : `lib/domain/suivi-prestataire.ts` — la moitié **cliente** : elle relit.
- Créer : `functions/src/suivi.test.ts` — le nœud : il importe les deux.
- Créer : `lib/domain/suivi-prestataire.test.ts` — le relecteur seul.

**Pourquoi deux fichiers et pas un.** `functions/tsconfig.json` a
`rootDir: "src"` : le code déployé **ne peut pas** importer `lib/`. C'est déjà le
cas de `numerotation`, et la réponse du dépôt est écrite dans son en-tête — le
serveur fabrique, le client relit, et un test d'aller-retour les noue. On la
reprend telle quelle plutôt que d'inventer un troisième arrangement.

**Interfaces produites :**

```ts
// lib/domain/suivi-prestataire.ts
export type LigneSuivi = {
  numeroVente: string;
  client: string;
  moto: string;
  chassis: string;
  deposeLe: string;        // ISO : la charge traverse du JSON, pas des Date
  revenuLe: string | null;
  joursDehors: number;
};
export type SuiviPrestataire = {
  prestataire: { nom: string };
  enCours: LigneSuivi[];
  historique: LigneSuivi[];
  argent: { avances: number };
};
export function lireSuivi(brut: unknown): SuiviPrestataire | null;

// functions/src/suivi.ts
export type CarteDuSuivi = {
  venteId: string;
  statut: string;
  deposeLe: number | null;   // millisecondes
  remisLe: number | null;
  avance: number | null;
  numeroVente: string;
  client: string;
  moto: string;
  chassis: string;
};
export function construireSuivi(
  nom: string,
  cartes: readonly CarteDuSuivi[],
  maintenant: number,
): SuiviPrestataireServeur;      // meme forme, type local au paquet
```

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { describe, expect, test } from "vitest";
import { construireSuivi, type CarteDuSuivi } from "./suivi";
import { lireSuivi } from "../../lib/domain/suivi-prestataire";

const JOUR = 86_400_000;
const MAINTENANT = Date.UTC(2026, 9, 16);

function carte(partiel: Partial<CarteDuSuivi> = {}): CarteDuSuivi {
  return {
    venteId: "v1",
    statut: "chez_prestataire",
    deposeLe: MAINTENANT - 5 * JOUR,
    remisLe: null,
    avance: 15_000,
    numeroVente: "PTG-2610-0042",
    client: "Compaore Ali",
    moto: "Haojue DK150",
    chassis: "LC6PAGA1XJ0000001",
    ...partiel,
  };
}

describe("la charge utile du portail", () => {
  test("une carte dehors est en cours, et dit depuis combien de jours", () => {
    const suivi = construireSuivi("Ouedraogo", [carte()], MAINTENANT);
    expect(suivi.enCours).toHaveLength(1);
    expect(suivi.historique).toHaveLength(0);
    expect(suivi.enCours[0].joursDehors).toBe(5);
    expect(suivi.enCours[0].revenuLe).toBeNull();
  });

  test("une carte revenue passe a l'historique", () => {
    const suivi = construireSuivi(
      "Ouedraogo",
      [carte({ statut: "revenu_magasin", remisLe: MAINTENANT - JOUR })],
      MAINTENANT,
    );
    expect(suivi.enCours).toHaveLength(0);
    expect(suivi.historique).toHaveLength(1);
    expect(suivi.historique[0].revenuLe).not.toBeNull();
  });

  /* **Les avances s'additionnent sur les DOCUMENTS, pas sur les paquets.** Un
     paquet repartit son avance entre ses cartes (la part de chacune, le reste a
     la premiere) precisement pour que cette somme retombe juste. Additionner
     les paquets raterait les depots unitaires d'avant S53. */
  test("les avances s'additionnent, cartes rendues comprises", () => {
    const suivi = construireSuivi(
      "Ouedraogo",
      [carte({ avance: 15_000 }), carte({ venteId: "v2", statut: "revenu_magasin", avance: 10_000 })],
      MAINTENANT,
    );
    expect(suivi.argent.avances).toBe(25_000);
  });

  test("une avance absente compte zero et ne rend pas NaN", () => {
    const suivi = construireSuivi("Ouedraogo", [carte({ avance: null })], MAINTENANT);
    expect(suivi.argent.avances).toBe(0);
  });

  /* Point de vigilance 4 : zero carte doit rendre une charge valide. Une page
     qui lit `enCours[0]` sur un tableau absent serait blanche. */
  test("un prestataire sans carte rend une charge utile complete", () => {
    const suivi = construireSuivi("Ouedraogo", [], MAINTENANT);
    expect(suivi).toEqual({
      prestataire: { nom: "Ouedraogo" },
      enCours: [],
      historique: [],
      argent: { avances: 0 },
    });
  });

  /* Point de vigilance 3 : une vente ou une moto illisible ne doit pas faire
     tomber le portail entier. La ligne se construit, avec un libelle qui le
     dit. */
  test("une ligne dont la moto manque se construit quand meme", () => {
    const suivi = construireSuivi(
      "Ouedraogo",
      [carte({ moto: "", chassis: "", client: "" })],
      MAINTENANT,
    );
    expect(suivi.enCours).toHaveLength(1);
    expect(suivi.enCours[0].moto).toBe("Moto inconnue");
  });

  /* **LE test de cette tache.** Il fige le critere « ce qui ne doit pas
     fuir » : la charge contient EXACTEMENT ces clefs, et le relecteur du client
     les reconnait toutes. Ajouter un prix de vente au serveur fera tomber le
     relecteur, pas une revue de code. */
  test("aller-retour : ce que le serveur fabrique, le client le relit en entier", () => {
    const suivi = construireSuivi("Ouedraogo", [carte()], MAINTENANT);
    const traverse = JSON.parse(JSON.stringify(suivi));
    expect(lireSuivi(traverse)).toEqual(suivi);
  });

  test("aucun montant autre que les avances ne traverse", () => {
    const suivi = construireSuivi("Ouedraogo", [carte()], MAINTENANT);
    const texte = JSON.stringify(suivi);
    for (const interdit of ["prix", "cout", "marge", "benefice", "telephone", "prive"]) {
      expect(texte.toLowerCase()).not.toContain(interdit);
    }
    expect(Object.keys(suivi.argent)).toEqual(["avances"]);
  });
});
```

Et pour le relecteur seul, `lib/domain/suivi-prestataire.test.ts` :

```ts
test.each([null, undefined, 42, "texte", {}, { prestataire: {} }])(
  "une charge malformee rend null plutot que de laisser la page y croire : %s",
  (brut) => {
    expect(lireSuivi(brut)).toBeNull();
  },
);

/* Un champ de trop est une FUITE, pas une tolerance : le relecteur refuse. Sans
   cela, un prix de vente ajoute au serveur arriverait jusqu'au navigateur du
   prestataire sans qu'un test ne bronche. */
test("une charge qui porte un champ de plus est refusee", () => {
  expect(lireSuivi({ ...VALIDE, prixVente: 1_200_000 })).toBeNull();
});
```

- [ ] **Étape 2 : voir les tests échouer**

`rtk vitest run functions/src/suivi.test.ts lib/domain/suivi-prestataire.test.ts`
Attendu : ÉCHEC — imports non résolus.

- [ ] **Étape 3 : écrire les deux moitiés**

`construireSuivi` : partage les cartes sur `statut === "chez_prestataire"`,
somme `avance ?? 0` sur **toutes** les cartes, calcule `joursDehors` par
`Math.floor((maintenant - deposeLe) / 86_400_000)` (0 si `deposeLe` est nul),
replie les libellés vides sur `"Moto inconnue"` / `"Client inconnu"`, et trie
`enCours` du plus ancien dépôt au plus récent — c'est ce que le prestataire
regarde en premier — et `historique` du plus récent retour au plus ancien.

`lireSuivi` : valide la forme **et refuse tout champ supplémentaire**, à chaque
niveau. C'est lui qui fait du critère de non-fuite un test plutôt qu'une
intention.

Les deux en-têtes doivent se citer l'une l'autre, comme le font déjà
`lib/domain/numerotation.ts` et `functions/src/numerotation.ts` : le lecteur qui
tombe sur une moitié doit apprendre que l'autre existe et que `suivi.test.ts`
les noue.

- [ ] **Étape 4 : voir les tests passer**

`rtk vitest run functions/src/suivi.test.ts lib/domain/suivi-prestataire.test.ts`
Attendu : SUCCÈS.

- [ ] **Étape 5 : commit**

```sh
rtk git add functions/src/suivi.ts functions/src/suivi.test.ts lib/domain/suivi-prestataire.ts lib/domain/suivi-prestataire.test.ts
rtk git commit -m "S56 : la charge utile du portail est une frontiere nommee, nouee par un aller-retour"
```

---

## Tâche 4 — Les deux fonctions : celle qui émet, celle qui répond

**Fichiers :**
- Modifier : `functions/src/index.ts`
- Test : `declencheurs/suivi.test.ts` *(créé)* — contre les émulateurs, comme
  les autres tests de fonctions de ce dépôt.

**Interfaces consommées :** `construireSuivi` (tâche 3), `OCTETS_JETON` — **non
importable** depuis `functions/` ; recopier la valeur 32 avec un commentaire qui
pointe vers `lib/domain/jeton-suivi.ts`, et laisser le test d'aller-retour de la
tâche 3 tenir la cohérence.

**Interfaces produites :**
- `emettreJetonSuivi` — `onCall`, responsable seulement, prend
  `{ prestataireId }`, rend `{ jeton }`.
- `suiviPrestataire` — `onRequest`, `POST`, jeton **dans le corps**, rend la
  charge utile ou un refus.

- [ ] **Étape 1 : écrire les tests qui échouent**

Les cas, dans cet ordre de priorité :

```
emettreJetonSuivi
  - un gerant est refuse (permission-denied)
  - un prestataire inexistant est refuse, sans dire qu'il n'existe pas
  - le jeton rendu fait 43 caracteres base64url
  - deux emissions sur la meme fiche rendent deux jetons DIFFERENTS
  - la seconde emission REVOQUE la premiere : l'ancien jeton ne resout plus rien
  - `jetonEmisLe` est pose par le serveur

suiviPrestataire
  - un corps sans jeton rend le meme refus qu'un jeton inconnu
  - un jeton malforme NE DECLENCHE AUCUNE LECTURE : il est refuse sur sa forme
  - un jeton inconnu et un jeton revoque rendent le MEME message
  - **un jeton nul ne resout jamais** : une fiche sans `jetonSuivi` ne doit pas
    etre atteignable, et surtout la requete ne doit pas rendre TOUTES les fiches
  - le jeton de A ne rend aucune ligne de B
  - la charge utile ne porte aucun montant autre que les avances
  - une methode GET est refusee (le jeton n'a rien a faire dans une URL de
    fonction : elle finit dans les journaux d'acces)
```

Deux de ces cas s'écrivent ici parce qu'ils sont les plus faciles à croire
couverts sans l'être :

```ts
/* **Point de vigilance 2, et le pire defaut possible de ce portail.** Une fiche
   sans jeton porte `jetonSuivi` absent. Si un corps vide descendait jusqu'a la
   requete, `where('jetonSuivi', '==', null)` rendrait TOUTES les fiches jamais
   emises — un portail devenu annuaire, par un appel sans argument. */
test("un corps sans jeton ne resout jamais un prestataire", async () => {
  const reponse = await appeler({});
  expect(reponse.status).toBe(404);
  expect(await reponse.json()).toEqual({ erreur: "Ce lien n'est plus valide." });
});

/* **Le mur de D2, prouve plutot qu'affirme.** On seme un cout dans la
   sous-collection `prive/` de la moto, et on verifie qu'il ne ressort pas. La
   fonction a les droits du serveur : rien ne l'EMPECHE de lire `prive/`, c'est
   l'absence de code pour le faire qui tient. Un test qui regarde la charge
   utile est donc la seule preuve honnete. */
test("un cout seme dans prive/ ne ressort pas par le portail", async () => {
  await semerCoutPrive(venteId, { prixAchat: 900_000, marge: 300_000 });
  const charge = await appeler({ jeton }).then((r) => r.json());
  const texte = JSON.stringify(charge);
  expect(texte).not.toContain("900000");
  expect(texte).not.toContain("300000");
});
```

Le cas « le jeton de A ne rend aucune ligne de B » se monte avec **deux**
prestataires et deux dépôts : un seul prestataire ne prouverait rien, puisqu'un
filtre absent rendrait le même résultat.

- [ ] **Étape 2 : voir les tests échouer**

Émulateurs fraîchement démarrés (`rtk npm run emulators`, qui recompile les
fonctions), puis :
`rtk vitest run --config vitest.declencheurs.config.mts declencheurs/suivi.test.ts`
Attendu : ÉCHEC — fonctions absentes.

- [ ] **Étape 3 : écrire les deux fonctions**

```ts
/* `randomBytes` et non `Math.random` : c'est la seule source d'alea de ce
   depot, et elle est la raison pour laquelle ce jeton ne se fabrique pas dans
   un navigateur (`SECURITY.md` §4). */
import { randomBytes } from "node:crypto";

/** 32 octets, comme `OCTETS_JETON` dans `lib/domain/jeton-suivi.ts`. La valeur
    est recopiee parce que `functions/` ne peut pas importer `lib/`
    (`rootDir: "src"`) ; le test d'aller-retour de `suivi.test.ts` tient les
    deux moities ensemble. */
const OCTETS_JETON = 32;
```

`emettreJetonSuivi` : vérifie le rôle, vérifie que la fiche existe, écrit
`{ jetonSuivi, jetonEmisLe, updatedAt, updatedBy: "systeme", updatedByName:
"Emission d'un lien de suivi" }` et rend le jeton. **Écrire, jamais lire pour
réémettre** : régénérer est la seule révocation, et elle est donc un simple
écrasement.

`suiviPrestataire` : `onRequest` ; refuse tout ce qui n'est pas `POST` ; lit le
jeton dans le corps ; **refuse sur la forme avant toute lecture** ; résout par
`where('jetonSuivi', '==', jeton).limit(1)` ; puis, pour chaque document
`carte_grise` de `prestataireId`, lit la vente, la moto et le client avec les
droits du serveur ; appelle `construireSuivi` ; renvoie. **Elle n'ouvre jamais
`prive/`** — ce n'est pas une précaution, c'est l'absence de code pour le faire,
et le test le dit.

Un jeton inconnu, révoqué ou malformé rend **le même** corps :
`{ erreur: "Ce lien n'est plus valide." }`, statut 404. Les distinguer dirait à
qui essaie des liens au hasard lequel a existé.

- [ ] **Étape 4 : voir les tests passer**

`rtk vitest run --config vitest.declencheurs.config.mts declencheurs/suivi.test.ts`
Attendu : SUCCÈS.

- [ ] **Étape 5 : commit**

```sh
rtk git add functions/src/index.ts declencheurs/suivi.test.ts
rtk git commit -m "S56 : une fonction emet le jeton, une autre repond au lien"
```

---

## Tâche 5 — La page publique

**Fichiers :**
- Créer : `lib/fonctions/url.ts` + `lib/fonctions/url.test.ts`
- Créer : `app/suivi/[jeton]/page.tsx`
- Test : `lib/fonctions/url.test.ts`, et le rendu se vérifie à la tâche 7.

**Interfaces consommées :** `estJetonPlausible`, `lireSuivi`.

**Interfaces produites :** `urlFonction(nom: string): string`.

**Ce que `lib/fonctions/url.ts` résout.** La page est rendue **côté serveur** :
elle appelle la fonction par HTTP, et doit donc connaître son URL. Deux formes,
selon l'environnement — `https://europe-west1-<projet>.cloudfunctions.net/<nom>`
en ligne, `http://127.0.0.1:5301/<projet>/europe-west1/<nom>` sur émulateurs. La
règle vit dans un module pur et testé plutôt que recopiée dans la page : c'est
le même raisonnement que `scripts/deployer.mjs` — une ligne de documentation se
recopie mal, un chemin unique ne se recopie pas.

- [ ] **Étape 1 : écrire les tests d'URL qui échouent**

```ts
test("en ligne, l'URL suit la region des fonctions", () => { /* ... */ });
test("sur emulateurs, l'URL passe par le port 5301 et nomme le projet", () => { /* ... */ });
test("sans projet configure, elle le dit plutot que de fabriquer une URL fausse", () => {
  expect(() => urlFonction("suiviPrestataire", { projet: undefined })).toThrow();
});
```

- [ ] **Étape 2 : voir les tests échouer** — `rtk vitest run lib/fonctions/url.test.ts`.

- [ ] **Étape 3 : écrire le module, puis la page**

La page :

```tsx
export const metadata: Metadata = {
  title: "Suivi des cartes grises",
  /* Le critere de la spec, et la seule protection contre l'indexation d'un
     lien secret qui finira dans un groupe WhatsApp. */
  robots: { index: false, follow: false },
};

/* **Rendu cote serveur, et dynamique.** Le jeton ne doit pas etre pre-rendu a
   la compilation — il n'existe pas encore —, et la page ne doit pas etre mise
   en cache : le prestataire consulte pour savoir ou en sont ses cartes
   AUJOURD'HUI. */
export const dynamic = "force-dynamic";
```

Elle lit `params.jeton`, refuse sur la forme, appelle la fonction, relit par
`lireSuivi`, et rend trois blocs : **En cours**, **Rendues**, **Avances reçues**.

Les états que la page doit porter, et qui sont la tâche réelle ici :

| État | Ce qui s'affiche |
|------|------------------|
| Jeton malformé, inconnu ou révoqué | « Ce lien n'est plus valide. » et rien d'autre — aucune mention du prestataire. |
| Charge utile illisible | Le même message : un relecteur qui refuse est un refus. |
| Zéro carte | « Aucune carte grise en cours » — la page existe, elle n'est pas vide. |
| La fonction ne répond pas | « Ce suivi a besoin du réseau. Réessayez une fois connecté. » **Jamais une page blanche, jamais une pile d'appels.** C'est l'exception à D40, et elle se voit. |

`DESIGN.md` s'applique : tous les états, lisible sur un téléphone d'entrée de
gamme, en clair et en sombre, zéro emoji brut. Cette page n'a pas de coquille —
donc elle porte son propre titre et son propre pied, et elle doit avoir l'air du
produit sans en être une page interne.

**Ce qu'elle n'importe jamais** : `usePerimetre`, `useSession`,
`GardeCapacite`, ou quoi que ce soit de `lib/repositories/`. Le
`FournisseurSession` de la racine l'enveloppe — on ne le retire pas, c'est la
racine de toute l'application — mais rien ici ne l'interroge.

- [ ] **Étape 4 : voir les tests passer, et REGARDER la page**

`rtk vitest run lib/fonctions/url.test.ts` puis, et c'est la règle 5 :

```sh
NEXT_PUBLIC_FIREBASE_EMULATEURS=1 NEXT_PUBLIC_FIREBASE_PROJECT_ID=sdi-dev \
  NEXT_DIST_DIR=.next-emulateurs npm run build
NEXT_DIST_DIR=.next-emulateurs npx next start -p 3300
```

**Un port jamais servi** (3300, pas 3200) : une origine déjà visitée garde son
service worker, et c'est lui qu'on regarde au lieu du build. Prendre les quatre
états en capture, clair et sombre.

- [ ] **Étape 5 : commit**

```sh
rtk git add lib/fonctions/url.ts lib/fonctions/url.test.ts "app/suivi/[jeton]/page.tsx"
rtk git commit -m "S56 : un lien ouvre une page de suivi, sans compte et sans reseau cache"
```

---

## Tâche 6 — Le bouton sur la fiche du prestataire

**Fichiers :**
- Créer : `lib/repositories/jeton-suivi.ts`
- Créer : `components/LienDeSuivi.tsx`
- Modifier : `app/(app)/parametres/prestataires/page.tsx`

**Interfaces consommées :** `emettreJetonSuivi` (tâche 4), `lienDeSuivi`
(tâche 1), `fonctions()` et `REGION_FONCTIONS` de `lib/firebase/client.ts`.

- [ ] **Étape 1 : le dépôt**

`lib/repositories/jeton-suivi.ts` appelle l'appelable par `httpsCallable`, et
passe les erreurs par `messageErreurAppelable` — le module
`lib/firebase/erreur-appelable.ts` existe déjà et c'est lui qui traduit un code
Firebase en phrase française. Ne pas en écrire un second.

- [ ] **Étape 2 : le composant**

Trois états, et le troisième est celui qu'on oublie :

1. **Pas de jeton** — un bouton « Créer le lien de suivi ».
2. **Un jeton** — le lien en entier, lisible, avec un geste pour le copier, et
   un bouton « Régénérer ». **Le lien s'affiche en TEXTE, jamais en ancre
   cliquable** : « aucun écran du produit n'y renvoie par un lien » est un
   critère de la spec, et un `<a href>` dans une page interne est exactement le
   chemin par lequel un lien secret finit dans un historique partagé ou un
   `Referer`. On le donne à copier, on n'y navigue pas.
3. **En cours d'émission** — le bouton occupé, non recliquable. Sans cela, deux
   clics émettent deux jetons et le premier lien, déjà copié, est mort.

**« Régénérer » demande confirmation**, et la confirmation dit ce qu'elle fait :
« L'ancien lien cessera de fonctionner immédiatement. Le prestataire devra
recevoir le nouveau. » Un bouton qui révoque sans le dire est un piège — et
c'est la règle 6 appliquée à une action irréversible pour l'autre partie.

**Hors ligne** : l'émission passe par une Cloud Function, donc elle **ne marche
pas** sans réseau. L'écran le dit au lieu d'échouer en silence (D66) : c'est le
même traitement que la création d'un compte gérant, qu'on reprend tel quel.

- [ ] **Étape 3 : voir le rendu**

Les trois états en capture, clair et sombre, sur le build des émulateurs. Puis
`git checkout -- tsconfig.json`.

- [ ] **Étape 4 : commit**

```sh
rtk git add lib/repositories/jeton-suivi.ts components/LienDeSuivi.tsx "app/(app)/parametres/prestataires/page.tsx"
rtk git commit -m "S56 : la fiche d un prestataire porte son lien de suivi"
```

---

## Tâche 7 — Le témoin de bout en bout, et les deux gardes

**Fichiers :**
- Créer : `e2e/suivi-prestataire.spec.ts` — **un seul fichier**, et c'est la
  contrainte du commanditaire.
- Test : `lib/domain/service-worker.test.ts` (vérifier qu'aucune entrée
  `/suivi/` n'apparaît), et `npm run verifier:sw`.

**Le parcours, en un seul test :** un responsable ouvre la fiche d'un
prestataire, crée le lien, le copie. Un **second contexte de navigateur, jamais
connecté** ouvre ce lien et voit les cartes en cours, le client, le châssis et
le total des avances. Le responsable régénère. Le second contexte recharge
l'ancien lien et lit « Ce lien n'est plus valide ».

Ce test est le seul endroit où les sept tâches se touchent. Il doit tenir en un
fichier et ne pas dépasser deux ou trois minutes.

- [ ] **Étape 1 : écrire le test**

S'appuyer sur `e2e/aide.ts` (`vendreDansLeTerrain`, `contenu`) et sur
`e2e/paquet.spec.ts` pour le geste de dépôt. Le second contexte s'obtient par
`browser.newContext()` — **pas** `page.goto` dans le contexte connecté, sinon on
ne prouve rien sur l'absence de session.

- [ ] **Étape 2 : construire, puis lancer CE fichier seul**

```sh
NEXT_PUBLIC_FIREBASE_EMULATEURS=1 NEXT_PUBLIC_FIREBASE_PROJECT_ID=sdi-dev \
  NEXT_DIST_DIR=.next-emulateurs npm run build
NEXT_DIST_DIR=.next-emulateurs NEXT_PUBLIC_FIREBASE_EMULATEURS=1 \
  npx playwright test e2e/suivi-prestataire.spec.ts --reporter=line
```

**`npx`, pas `rtk`** : `rtk playwright test` a déjà rendu « exit 0 » sur un test
échoué.

**Si ce test échoue pour une raison d'outillage** — file d'écritures bloquée,
émulateurs épuisés, délai dépassé sans message de produit —, le **dire et
s'arrêter**. Ne pas relancer en boucle : c'est la consigne explicite du
commanditaire, et elle a déjà coûté des journées.

- [ ] **Étape 3 : les deux gardes du service worker**

```sh
npm run build          # sans variable : le build de production
npm run verifier:sw
```

Attendu : « `public/sw.js` est d'accord avec le build », et **aucune** entrée
`/suivi/`. Une route à jeton variable dans `ECRANS_HORS_LIGNE` rendrait 404 et
empêcherait le service worker de s'installer — le hors-ligne tomberait en
entier, en silence, et seulement en coupure.

- [ ] **Étape 4 : commit**

```sh
rtk git add e2e/suivi-prestataire.spec.ts
rtk git commit -m "S56 : un navigateur jamais connecte lit le suivi, et le lien regenere se ferme"
```

---

## Clôture

- [ ] **Cocher les critères de la spec** un par un, en regardant une capture ou
  un résultat de test pour chacun — pas de mémoire.
- [ ] **`DECISIONS.md`** : consigner la décision (a) sur le solde, et le fait
  que le portail est **en ligne seulement** (exception nommée à D40).
- [ ] **`AGENTS.md`** : une ligne sur la route publique, pour que personne ne
  l'ajoute un jour à `ECRANS_HORS_LIGNE`.
- [ ] **`specs/ROADMAP.md`** : S56 passe à livrée.
- [ ] **Vérifier l'ensemble** : `rtk npm test`, `rtk tsc --noEmit`, `rtk lint`.

### Le déploiement, qui ne se déduit de rien

**Ce plan touche `firestore.rules` et `functions/`. Les deux se déploient à la
main, et rien dans le dépôt ne signale l'écart.** Un `npm test` vert et une
application qui marche en local ne disent rien de `sandwini` : les émulateurs
chargent le fichier du dépôt, le projet distant garde ce qu'on lui a envoyé la
dernière fois. Le 16 octobre 2026, cet oubli a bloqué **toutes les ventes**
pendant une demi-journée, et le symptôme parlait de boutique, pas de version de
règles.

Sans déploiement, le défaut sera exactement celui-ci : **le bouton « Créer le
lien de suivi » refusera d'écrire**, et le refus se lira comme un défaut de
droits.

- [ ] **Demander avant de déployer** — c'est la règle 6, et `sandwini` est le
  décor que le commanditaire ouvre depuis son téléphone. Puis :

```sh
node scripts/deployer.mjs --only firestore:rules,firestore:indexes,functions --project sandwini
```

- [ ] **Après le déploiement, le vérifier** : relancer la même ligne doit rendre
  « Skipped (No changes detected) » sur les fonctions. C'est la seule preuve
  lisible, depuis ce dépôt, que le distant porte bien le code local.
