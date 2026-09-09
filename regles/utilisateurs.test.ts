import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Règles sur les comptes utilisateurs (S2).
 *
 * L’enjeu tient en une phrase : **le rôle ne doit jamais être modifiable depuis
 * un navigateur**. Le document `users/{uid}` n’est qu’un miroir lisible ; les
 * droits vivent dans le custom claim, posé par une Cloud Function.
 *
 * Ces tests vérifient donc surtout des refus. C’est normal : la valeur d’une
 * règle se mesure à ce qu’elle empêche.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const fiche = (nom: string, role: string, boutiqueId: string | null = null) => ({
  nom,
  email: `${nom}@sdi.test`,
  role,
  boutiqueId,
  actif: true,
});

beforeAll(async () => {
  try {
    await fetch(`http://${HOTE}:${PORT}/`);
  } catch {
    throw new Error(
      `L’émulateur Firestore ne répond pas sur ${HOTE}:${PORT}.\n` +
        "Démarrez-le avec « npm run emulators », ou lancez « npm run test:regles:isole ».",
    );
  }
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-utilisateurs",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "users/resp-1"), fiche("resp", "responsable"));
    await setDoc(doc(base, "users/ger-1"), fiche("ger1", "gerant", "PTG"));
    await setDoc(doc(base, "users/ger-2"), fiche("ger2", "gerant", "KDG"));
  });
});

describe("lecture des comptes", () => {
  it("le responsable lit toute la liste", async () => {
    await assertSucceeds(getDocs(collection(responsable(), "users")));
  });

  it("un gérant lit sa propre fiche", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "users/ger-1")));
  });

  it("un gérant ne lit pas la fiche d’un collègue", async () => {
    await assertFails(getDoc(doc(gerant(), "users/ger-2")));
  });

  it("un gérant ne parcourt pas la liste des comptes", async () => {
    await assertFails(getDocs(collection(gerant(), "users")));
  });

  it("un anonyme ne lit rien du tout", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonyme, "users/ger-1")));
    await assertFails(getDocs(collection(anonyme, "users")));
  });
});

describe("écriture des comptes — interdite à tous depuis le navigateur", () => {
  it("un gérant ne se promeut pas responsable", async () => {
    await assertFails(updateDoc(doc(gerant(), "users/ger-1"), { role: "responsable" }));
  });

  it("un gérant ne change pas sa boutique pour voir celle d’à côté", async () => {
    await assertFails(updateDoc(doc(gerant(), "users/ger-1"), { boutiqueId: "KDG" }));
  });

  it("un gérant ne se réactive pas lui-même après désactivation", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "users/ger-1"), { actif: false });
    });
    await assertFails(updateDoc(doc(gerant(), "users/ger-1"), { actif: true }));
  });

  it("le responsable lui-même n’écrit pas dans users — seule une Cloud Function le fait", async () => {
    await assertFails(updateDoc(doc(responsable(), "users/ger-1"), { nom: "Renommé" }));
    await assertFails(setDoc(doc(responsable(), "users/nouveau"), fiche("x", "gerant")));
    await assertFails(deleteDoc(doc(responsable(), "users/ger-1")));
  });

  it("personne ne crée un compte responsable en s’inventant un document", async () => {
    await assertFails(setDoc(doc(gerant("intrus"), "users/intrus"), fiche("intrus", "responsable")));
  });

  it("un compte n’est jamais supprimé — l’historique doit rester lisible", async () => {
    await assertFails(deleteDoc(doc(gerant(), "users/ger-1")));
  });
});

describe("le claim fait autorité, pas le document", () => {
  it("un gérant dont le document dit « responsable » reste un gérant", async () => {
    // Le document est falsifié directement en base ; seul le claim compte.
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "users/ger-1"), { role: "responsable" });
    });
    await assertFails(getDocs(collection(gerant(), "users")));
  });

  it("un compte sans claim de rôle n’obtient rien de plus qu’un anonyme", async () => {
    const sansRole = env.authenticatedContext("sans-role").firestore();
    await assertFails(getDocs(collection(sansRole, "users")));
    await assertFails(getDoc(doc(sansRole, "users/ger-1")));
  });

  /**
   * La différence entre « la règle refuse » et « la règle plante », rendue
   * observable.
   *
   * Lire une clé absente d'une map **fait bien planter l'évaluation** : la
   * sonde le montre, le moteur répond `Property X is undefined on object`.
   * Mais le plantage d'une branche n'abat pas toute l'expression — un `||` le
   * rattrape et la seconde branche décide. C'est pourquoi le défaut est resté
   * invisible : presque partout dans ce fichier, un OU couvre la lecture du
   * jeton.
   *
   * Il devient visible là où aucun OU ne rattrape, c'est-à-dire dès que les
   * deux branches lisent le jeton. `boutiques/{code}` est ce cas : « le
   * responsable, ou le gérant de cette boutique-là » — un compte sans claim
   * fait planter les deux. Le refus est alors la bonne réponse rendue pour la
   * mauvaise raison, et le client reçoit le texte de l'erreur au lieu d'un
   * refus : le nom de la clé manquante sort des règles et arrive dans le
   * navigateur.
   *
   * Ce test ne vérifie donc pas que l'accès est refusé — il l'était déjà — mais
   * que le refus est une **décision**. Il échoue sur `token.role`, il passe sur
   * `token.get('role', '')`.
   *
   * Le cas n'est pas d'école : entre la création d'un compte et la pose de ses
   * claims par la Cloud Function il s'écoule un instant réel, et c'est
   * exactement l'instant où l'application demande « où suis-je ».
   */
  it("un compte sans claim se voit refuser une boutique par décision, non par plantage", async () => {
    const sansClaim = env.authenticatedContext("sans-claim").firestore();

    let message = "";
    try {
      await getDoc(doc(sansClaim, "boutiques/PTG"));
      throw new Error("la lecture aurait dû être refusée");
    } catch (cause) {
      message = String((cause as { message?: string }).message ?? cause);
    }

    /* Le refus, oui. Mais pas celui-là : « Property role is undefined on
       object » est le moteur qui trébuche, pas la règle qui tranche. */
    expect(message).not.toContain("is undefined");
  });

  /**
   * Le même mécanisme sur la boutique, dans l'autre sens : ici le refus est la
   * bonne réponse, et ce test dit qu'il le reste. Un gérant dont le compte
   * existe mais à qui aucune boutique n'a encore été attribuée ne lit aucune
   * boutique.
   */
  it("un gérant sans boutique attribuée se voit refuser une boutique", async () => {
    const sansBoutique = env.authenticatedContext("ger-orphelin", { role: "gerant" }).firestore();
    await assertFails(getDoc(doc(sansBoutique, "boutiques/PTG")));
  });
});
