/**
 * Crée le compte responsable initial dans les émulateurs.
 *
 * Le premier responsable ne peut pas être créé par l'application : la fonction
 * `creerGerant` exige déjà un responsable. Ce script casse la boucle, comme le
 * ferait un administrateur en production depuis la console Firebase.
 *
 *   npm run amorcer
 *
 * Il refuse de s'exécuter ailleurs que sur les émulateurs : créer un compte à
 * mot de passe connu sur un projet réel serait une porte d'entrée offerte.
 */
import { readFileSync } from "node:fs";

const PROJET = "sdi-dev";
const AUTH = "127.0.0.1:9399";
const FIRESTORE = "127.0.0.1:8181";

const IDENTIFIANTS = {
  email: "responsable@sdi.test",
  motDePasse: "responsable-sdi-2026",
  nom: "Responsable SDI",
};

/* Garde-fou : les variables d'environnement d'émulateur sont ce qui fait
   parler le SDK Admin en local. Sans elles, il viserait un vrai projet. */
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.GCLOUD_PROJECT = PROJET;

async function emulateurJoignable() {
  try {
    await fetch(`http://${AUTH}/`);
    return true;
  } catch {
    return false;
  }
}

if (!(await emulateurJoignable())) {
  console.error(
    `Les émulateurs ne répondent pas sur ${AUTH}.\nLancez « npm run emulators » dans un autre terminal.`,
  );
  process.exit(1);
}

const { initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

initializeApp({ projectId: PROJET });
const auth = getAuth();

let compte = await auth.getUserByEmail(IDENTIFIANTS.email).catch(() => null);
if (compte) {
  console.log(`Le compte ${IDENTIFIANTS.email} existe déjà — mise à jour de son rôle.`);
} else {
  compte = await auth.createUser({
    email: IDENTIFIANTS.email,
    password: IDENTIFIANTS.motDePasse,
    displayName: IDENTIFIANTS.nom,
  });
  console.log(`Compte créé : ${IDENTIFIANTS.email}`);
}

// Le responsable n'est rattaché à aucune boutique : il les voit toutes.
await auth.setCustomUserClaims(compte.uid, { role: "responsable", boutiqueId: null });

await getFirestore()
  .doc(`users/${compte.uid}`)
  .set(
    {
      nom: IDENTIFIANTS.nom,
      email: IDENTIFIANTS.email,
      role: "responsable",
      boutiqueId: null,
      actif: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "amorçage",
      createdByName: "Script d'amorçage",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "amorçage",
      updatedByName: "Script d'amorçage",
    },
    { merge: true },
  );

const paquet = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
console.log(`\n${paquet.name} — compte responsable prêt (émulateurs uniquement) :`);
console.log(`  adresse      ${IDENTIFIANTS.email}`);
console.log(`  mot de passe ${IDENTIFIANTS.motDePasse}`);
process.exit(0);
