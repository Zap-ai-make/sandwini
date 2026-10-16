import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Le portail du prestataire, côté serveur (S56).
 *
 * Deux fonctions, et ce qui se vérifie ici est leur **câblage** : la règle pure
 * — ce que la charge utile contient — se vérifie sans émulateur dans
 * `functions/src/suivi.test.ts`. Ici on branche, là-bas on calcule.
 *
 * **Ce fichier porte la sécurité de tout le portail.** C'est la seule partie du
 * produit accessible sans compte : le refus d'un jeton malformé, l'égalité des
 * messages entre un jeton inconnu et un jeton révoqué, et surtout le fait qu'un
 * jeton nul ne résolve jamais, ne se vérifient nulle part ailleurs. Un défaut
 * ici ne se verrait pas à l'écran — il se verrait dans les données d'un autre
 * prestataire.
 */

const PROJET = "sdi-dev";
const FIRESTORE = "127.0.0.1:8181";
const AUTH = "127.0.0.1:9399";
const FONCTIONS = "http://127.0.0.1:5301";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
process.env.GCLOUD_PROJECT = PROJET;

const BOUTIQUE = "SUI";
const LONGUEUR_JETON = 43;

/* L'émulateur d'authentification accepte n'importe quelle clef d'API : c'est la
   raison pour laquelle cette valeur n'est pas un secret et n'a pas à sortir du
   fichier. */
const CLEF_FACTICE = "clef-emulateur";

let base: Firestore;
let jetonResponsable = "";
let jetonGerant = "";
let rang = 0;

beforeAll(async () => {
  const injoignable = async (url: string) => {
    try {
      await fetch(url);
      return false;
    } catch {
      return true;
    }
  };
  if (
    (await injoignable(`http://${FIRESTORE}/`)) ||
    (await injoignable(`${FONCTIONS}/`)) ||
    (await injoignable(`http://${AUTH}/`))
  ) {
    throw new Error("Les émulateurs ne répondent pas. Démarrez-les avec « npm run emulators ».");
  }

  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");
  if (getApps().length === 0) initializeApp({ projectId: PROJET });
  base = getFirestore();

  /* Deux comptes réels dans l'émulateur d'authentification, et un vrai jeton
     d'identité pour chacun. On pourrait forger un JWT non signé — l'émulateur
     l'accepterait —, mais le test ne prouverait alors rien sur le chemin que
     l'application emprunte vraiment. */
  jetonResponsable = await compte(getAuth(), "suivi-resp@exemple.bf", {
    role: "responsable",
    boutiqueId: null,
  });
  jetonGerant = await compte(getAuth(), "suivi-ger@exemple.bf", {
    role: "gerant",
    boutiqueId: BOUTIQUE,
  });

  /* L'émulateur démarre un processus par fonction, à la première invocation
     (D43, D49). On paie ce réveil ici plutôt que dans la première mesure, qui
     accuserait le code d'une lenteur qui n'est pas la sienne. */
  const debut = Date.now();
  await appelerSuivi({ jeton: "x".repeat(LONGUEUR_JETON) });
  await emettre("inexistant", jetonResponsable);
  console.log(`Fonctions du portail réveillées en ${Date.now() - debut} ms.`);
}, 180_000);

beforeEach(async () => faireLePropre());
afterAll(async () => faireLePropre());

/** Crée (ou recrée) un compte et rend son jeton d'identité, claims comprises. */
async function compte(
  auth: import("firebase-admin/auth").Auth,
  email: string,
  claims: Record<string, unknown>,
): Promise<string> {
  const motDePasse = "motdepasse-emulateur";
  await auth.getUserByEmail(email).then(
    (utilisateur) => auth.deleteUser(utilisateur.uid),
    () => undefined,
  );
  const utilisateur = await auth.createUser({ email, password: motDePasse });
  await auth.setCustomUserClaims(utilisateur.uid, claims);

  const reponse = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CLEF_FACTICE}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: motDePasse, returnSecureToken: true }),
    },
  );
  const corps = (await reponse.json()) as { idToken?: string };
  if (!corps.idToken) throw new Error(`Connexion impossible pour ${email}.`);
  return corps.idToken;
}

async function faireLePropre(): Promise<void> {
  const ventes = await base.collection("ventesMotos").where("boutiqueId", "==", BOUTIQUE).get();
  for (const vente of ventes.docs) {
    const documents = await vente.ref.collection("documents").get();
    for (const document of documents.docs) await document.ref.delete();
    await vente.ref.delete();
  }
  for (const nom of ["prestataires", "motos", "clients"]) {
    const lot = await base.collection(nom).where("boutiqueId", "==", BOUTIQUE).get();
    for (const element of lot.docs) await element.ref.delete();
  }
  /* Les prestataires n'ont pas de boutique : ils servent tout le réseau. On ne
     peut donc pas les filtrer comme le reste, et on les nomme. */
  for (const identifiant of ["presta-a", "presta-b", "presta-nu"]) {
    await base.doc(`prestataires/${identifiant}`).delete();
  }
}

type DecorCarte = {
  prestataireId: string | null;
  statut: string;
  avance?: number | null;
  deposeLe?: Date | null;
  remisLe?: Date | null;
};

type CarteSemee = { venteId: string; client: string; chassis: string; numero: string };

/** Pose une vente, sa moto, son client et sa carte grise. Rend de quoi vérifier ce qui ressortira. */
async function poserCarte(carte: DecorCarte): Promise<CarteSemee> {
  rang += 1;
  const motoId = `moto-${rang}`;
  const clientId = `client-${rang}`;
  const venteId = `vente-${rang}`;
  const client = `Client ${rang}`;
  const chassis = `CHASSIS-${rang}`;
  const numero = `SUI-2610-${String(rang).padStart(4, "0")}`;

  await base.doc(`motos/${motoId}`).set({
    boutiqueId: BOUTIQUE,
    marqueNom: "Haojue",
    modeleNom: `DK${rang}`,
    chassis,
  });
  await base.doc(`clients/${clientId}`).set({ boutiqueId: BOUTIQUE, nom: client });
  await base.doc(`ventesMotos/${venteId}`).set({
    boutiqueId: BOUTIQUE,
    numero,
    motoId,
    clientId,
    /* **Un coût semé exprès**, pour que le test de non-fuite porte sur des
       données réelles et non sur un décor qui n'en contenait pas. */
    prixVente: 1_200_000,
  });
  await base.doc(`ventesMotos/${venteId}/prive/cout`).set({
    boutiqueId: BOUTIQUE,
    prixAchat: 900_000,
    marge: 300_000,
  });
  await base.doc(`ventesMotos/${venteId}/documents/carte_grise`).set({
    boutiqueId: BOUTIQUE,
    venteId,
    type: "carte_grise",
    statut: carte.statut,
    prestataireId: carte.prestataireId,
    prestataireNom: carte.prestataireId ?? "",
    deposeLe: carte.deposeLe ?? new Date("2026-10-11T09:00:00Z"),
    remisLe: carte.remisLe ?? null,
    avance: carte.avance ?? null,
    disponibleLe: null,
  });
  return { venteId, client, chassis, numero };
}

async function poserPrestataire(identifiant: string, jetonSuivi: string | null): Promise<void> {
  await base.doc(`prestataires/${identifiant}`).set({
    nom: `Prestataire ${identifiant}`,
    telephone: "70 00 00 00",
    typesDocuments: ["carte_grise"],
    actif: true,
    ...(jetonSuivi === null ? {} : { jetonSuivi, jetonEmisLe: new Date() }),
  });
}

async function emettre(prestataireId: string, jetonIdentite: string): Promise<Response> {
  return fetch(`${FONCTIONS}/${PROJET}/europe-west1/emettreJetonSuivi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jetonIdentite}`,
    },
    body: JSON.stringify({ data: { prestataireId } }),
  });
}

async function appelerSuivi(corps: unknown, methode = "POST"): Promise<Response> {
  return fetch(`${FONCTIONS}/${PROJET}/europe-west1/suiviPrestataire`, {
    method: methode,
    headers: { "Content-Type": "application/json" },
    body: methode === "POST" ? JSON.stringify(corps) : undefined,
  });
}

const REFUS = "Ce lien n’est plus valide.";

describe("émettre un jeton de suivi", () => {
  it("le responsable en émet un, long de quarante-trois caractères", async () => {
    await poserPrestataire("presta-a", null);
    const reponse = await emettre("presta-a", jetonResponsable);
    expect(reponse.status).toBe(200);

    const { result } = (await reponse.json()) as { result: { jeton: string } };
    expect(result.jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const fiche = await base.doc("prestataires/presta-a").get();
    expect(fiche.get("jetonSuivi")).toBe(result.jeton);
    expect(fiche.get("jetonEmisLe")).toBeTruthy();
  });

  it("un gérant ne peut pas en émettre", async () => {
    await poserPrestataire("presta-a", null);
    const reponse = await emettre("presta-a", jetonGerant);
    expect(reponse.status).toBe(403);
  });

  it("un visiteur sans jeton d’identité ne peut pas en émettre", async () => {
    await poserPrestataire("presta-a", null);
    const reponse = await fetch(`${FONCTIONS}/${PROJET}/europe-west1/emettreJetonSuivi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { prestataireId: "presta-a" } }),
    });
    expect(reponse.status).toBe(401);
  });

  it("une fiche qui n’existe pas est refusée", async () => {
    const reponse = await emettre("fantome", jetonResponsable);
    expect(reponse.status).toBe(404);
  });

  /* **Deux émissions rendent deux jetons différents, et la seconde révoque la
     première.** C'est toute la révocation du portail : il n'y a jamais deux
     liens valides pour un même prestataire, parce qu'il n'y a jamais deux
     champs. */
  it("réémettre révoque : l’ancien lien ne résout plus rien", async () => {
    await poserPrestataire("presta-a", null);
    const premier = await emettre("presta-a", jetonResponsable)
      .then((r) => r.json())
      .then((c) => (c as { result: { jeton: string } }).result.jeton);
    const second = await emettre("presta-a", jetonResponsable)
      .then((r) => r.json())
      .then((c) => (c as { result: { jeton: string } }).result.jeton);

    expect(second).not.toBe(premier);

    const ancien = await appelerSuivi({ jeton: premier });
    expect(ancien.status).toBe(404);
    expect(await ancien.json()).toEqual({ erreur: REFUS });

    const neuf = await appelerSuivi({ jeton: second });
    expect(neuf.status).toBe(200);
  });
});

describe("répondre à un lien", () => {
  const JETON_A = "a".repeat(LONGUEUR_JETON);
  const JETON_B = "b".repeat(LONGUEUR_JETON);

  it("rend les cartes dehors, le client, la moto et le châssis", async () => {
    await poserPrestataire("presta-a", JETON_A);
    const semee = await poserCarte({
      prestataireId: "presta-a",
      statut: "chez_prestataire",
      avance: 15_000,
    });

    const reponse = await appelerSuivi({ jeton: JETON_A });
    expect(reponse.status).toBe(200);

    const suivi = (await reponse.json()) as {
      prestataire: { nom: string };
      enCours: { client: string; moto: string; chassis: string; numeroVente: string }[];
      argent: { avances: number };
    };
    expect(suivi.prestataire.nom).toBe("Prestataire presta-a");
    expect(suivi.enCours).toHaveLength(1);
    expect(suivi.enCours[0].client).toBe(semee.client);
    expect(suivi.enCours[0].chassis).toBe(semee.chassis);
    expect(suivi.enCours[0].numeroVente).toBe(semee.numero);
    expect(suivi.enCours[0].moto).toContain("Haojue");
    expect(suivi.argent.avances).toBe(15_000);
  });

  /* **Le test qui compte le plus de ce fichier.** Un seul prestataire ne
     prouverait rien : un filtre absent rendrait le même résultat. Il en faut
     deux, et le jeton de l'un ne doit rien montrer de l'autre. */
  it("le jeton d’un prestataire ne montre aucune ligne d’un autre", async () => {
    await poserPrestataire("presta-a", JETON_A);
    await poserPrestataire("presta-b", JETON_B);
    const chezA = await poserCarte({
      prestataireId: "presta-a",
      statut: "chez_prestataire",
      avance: 15_000,
    });
    await poserCarte({ prestataireId: "presta-b", statut: "chez_prestataire", avance: 90_000 });

    const suiviA = (await appelerSuivi({ jeton: JETON_A }).then((r) => r.json())) as {
      enCours: { chassis: string }[];
      argent: { avances: number };
    };
    expect(suiviA.enCours).toHaveLength(1);
    expect(suiviA.enCours[0].chassis).toBe(chezA.chassis);
    expect(suiviA.argent.avances).toBe(15_000);
  });

  /* **Point de vigilance 2, et le pire défaut possible de ce portail.** Une
     fiche jamais émise n'a pas de `jetonSuivi`. Si un corps vide descendait
     jusqu'à la requête, `where('jetonSuivi', '==', null)` rendrait toutes ces
     fiches — un portail devenu annuaire, par un appel sans argument. */
  it("un corps sans jeton ne résout jamais un prestataire", async () => {
    await poserPrestataire("presta-nu", null);
    const reponse = await appelerSuivi({});
    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toEqual({ erreur: REFUS });
  });

  it("un jeton nul ne résout jamais un prestataire", async () => {
    await poserPrestataire("presta-nu", null);
    const reponse = await appelerSuivi({ jeton: null });
    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toEqual({ erreur: REFUS });
  });

  /* Un jeton inconnu, révoqué ou malformé rend LE MÊME corps. Les distinguer
     dirait à qui essaie des liens au hasard lequel a existé. */
  it.each([
    ["inconnu mais bien formé", "z".repeat(LONGUEUR_JETON)],
    ["trop court", "abc"],
    ["avec une barre oblique", `${"a".repeat(42)}/`],
    ["démesuré", "a".repeat(10_000)],
    ["vide", ""],
  ])("un jeton %s rend le même refus", async (_cas, jeton) => {
    await poserPrestataire("presta-a", JETON_A);
    const reponse = await appelerSuivi({ jeton });
    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toEqual({ erreur: REFUS });
  });

  it("une méthode GET est refusée : un jeton n’a rien à faire dans une URL", async () => {
    const reponse = await appelerSuivi(undefined, "GET");
    expect(reponse.status).toBe(405);
  });

  /* **Le mur de D2, prouvé plutôt qu'affirmé.** Le décor sème un `prixAchat` et
     une `marge` dans `prive/`, plus un `prixVente` sur la vente elle-même. La
     fonction a les droits du serveur : rien ne l'EMPÊCHE de les lire, c'est
     l'absence de code pour le faire qui tient. Un test qui regarde ce qui sort
     est donc la seule preuve honnête. */
  it("aucun coût, prix ni marge ne ressort par le portail", async () => {
    await poserPrestataire("presta-a", JETON_A);
    await poserCarte({ prestataireId: "presta-a", statut: "chez_prestataire", avance: 15_000 });

    const texte = await appelerSuivi({ jeton: JETON_A }).then((r) => r.text());
    for (const interdit of ["1200000", "900000", "300000", "prixAchat", "marge", "prive"]) {
      expect(texte).not.toContain(interdit);
    }
  });

  it("une carte revenue passe à l’historique, et son avance compte toujours", async () => {
    await poserPrestataire("presta-a", JETON_A);
    await poserCarte({
      prestataireId: "presta-a",
      statut: "revenu_magasin",
      avance: 10_000,
      remisLe: new Date("2026-10-15T10:00:00Z"),
    });

    const suivi = (await appelerSuivi({ jeton: JETON_A }).then((r) => r.json())) as {
      enCours: unknown[];
      historique: unknown[];
      argent: { avances: number };
    };
    expect(suivi.enCours).toHaveLength(0);
    expect(suivi.historique).toHaveLength(1);
    expect(suivi.argent.avances).toBe(10_000);
  });

  it("un prestataire sans aucune carte rend une page, pas une erreur", async () => {
    await poserPrestataire("presta-a", JETON_A);
    const reponse = await appelerSuivi({ jeton: JETON_A });
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({
      prestataire: { nom: "Prestataire presta-a" },
      enCours: [],
      historique: [],
      argent: { avances: 0 },
    });
  });
});
