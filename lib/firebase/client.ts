import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { PORT_FONCTIONS_EMULATEUR, REGION_FONCTIONS } from "@/lib/fonctions/url";

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
let functionsInstance: Functions | undefined;

function application(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(config);
    activerAppCheck(app);
  }
  return app;
}

/**
 * App Check : la preuve que la requête vient de **notre** application.
 *
 * **Pourquoi il arrive maintenant, et pas avant.** Les identifiants Firebase du
 * client sont publics — l'en-tête de ce fichier le dit depuis le premier jour, et
 * c'est pour ça que les règles sont la seule protection réelle des *données*.
 * Mais les règles ne protègent pas l'**accès** : n'importe qui peut recopier
 * cette configuration et appeler l'API de Gemini à notre place, sur notre
 * facture. Firebase AI Logic impose donc App Check depuis juillet 2026, et
 * refuse de servir un modèle sans lui.
 *
 * **Le danger de ce fichier, nommé.** App Check s'applique au trafic Firebase
 * de *toute* l'application, pas seulement à Gemini. Mal réglé — jeton absent,
 * domaine non déclaré — il ne dégrade rien : il **bloque tout**, Firestore
 * compris, et le produit s'ouvre sur un écran vide. D'où les trois gardes
 * ci-dessous, et le fait qu'il ne s'active jamais de force.
 */
function activerAppCheck(application: FirebaseApp): void {
  /* 1. Jamais sur les émulateurs. Ils n'ont pas de service App Check, et
        l'activer y ferait échouer la suite bout en bout pour une raison qui
        n'a rien à voir avec ce qu'elle teste. */
  if (surEmulateurs) return;

  /* 2. Jamais côté serveur. `/suivi/[jeton]` (S56) est rendu par Node, qui n'a
        ni `document` ni reCAPTCHA — et ce portail ne touche de toute façon pas
        au SDK client. */
  if (typeof window === "undefined") return;

  /* 3. Jamais sans clé déclarée. Tant que `NEXT_PUBLIC_APP_CHECK_CLE` est
        absente, l'application tourne exactement comme avant : seul l'assistant
        refusera de répondre. C'est l'inverse du réglage qui casse tout en
        silence — ici l'absence se voit à un seul endroit, et nulle part
        ailleurs. */
  const cle = process.env.NEXT_PUBLIC_APP_CHECK_CLE;
  if (!cle) return;

  /* En développement, un jeton de débogage évite d'avoir à faire passer
     reCAPTCHA sur `localhost`. Firebase l'imprime dans la console au premier
     chargement ; il faut le coller dans la console Firebase une fois. */
  if (process.env.NODE_ENV !== "production") {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  initializeAppCheck(application, {
    provider: new ReCaptchaEnterpriseProvider(cle),
    /* Le jeton se renouvelle tout seul. Sans ça, une session ouverte toute la
       journée au comptoir — le cas normal ici — verrait ses appels refusés au
       bout d'une heure. */
    isTokenAutoRefreshEnabled: true,
  });
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

/* La région et le port de l'émulateur vivent dans `lib/fonctions/url.ts`, qui ne
   dépend d'aucun SDK : le portail du prestataire (S56) est rendu côté serveur et
   a besoin de ces deux valeurs sans tirer Firebase avec elles. Réexportés ici
   sous leur nom habituel pour que rien ne bouge chez les appelants. */
export { REGION_FONCTIONS } from "@/lib/fonctions/url";

export function fonctions(): Functions {
  if (functionsInstance) return functionsInstance;
  functionsInstance = getFunctions(application(), REGION_FONCTIONS);
  if (surEmulateurs) {
    connectFunctionsEmulator(functionsInstance, "127.0.0.1", PORT_FONCTIONS_EMULATEUR);
  }
  return functionsInstance;
}

export const configurationPresente = Boolean(config.projectId);
