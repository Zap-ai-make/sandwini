import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

/* Configuration Firebase côté client. Ces valeurs ne sont pas des secrets : ce
   sont des identifiants publics, et c’est la raison pour laquelle les règles
   Firestore (S12) sont la seule protection réelle des données. Elles vivent
   quand même en variables d’environnement pour que dev, staging et prod visent
   trois projets distincts (SECURITY.md §2). */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const surEmulateurs = process.env.NEXT_PUBLIC_FIREBASE_EMULATEURS === "1";

let app: FirebaseApp | undefined;
let firestore: Firestore | undefined;
let auth: Auth | undefined;
let storage: FirebaseStorage | undefined;

function application(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(config);
  return app;
}

/**
 * Firestore avec sa persistance locale et sa file d’écritures hors-ligne.
 *
 * `persistentMultipleTabManager` est un choix, pas un réglage par défaut : le
 * gérant ouvre volontiers deux onglets, et sans lui le second se retrouve sans
 * cache. Il impose en revanche que l’initialisation soit identique partout,
 * d’où ce point d’accès unique.
 */
export function db(): Firestore {
  if (firestore) return firestore;
  firestore = initializeFirestore(application(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (surEmulateurs) connectFirestoreEmulator(firestore, "127.0.0.1", 8181);
  return firestore;
}

export function authentification(): Auth {
  if (auth) return auth;
  auth = getAuth(application());
  if (surEmulateurs) connectAuthEmulator(auth, "http://127.0.0.1:9399", { disableWarnings: true });
  return auth;
}

export function stockage(): FirebaseStorage {
  if (storage) return storage;
  storage = getStorage(application());
  if (surEmulateurs) connectStorageEmulator(storage, "127.0.0.1", 9599);
  return storage;
}

export const configurationPresente = Boolean(config.projectId);
