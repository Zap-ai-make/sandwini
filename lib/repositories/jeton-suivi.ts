import { httpsCallable } from "firebase/functions";
import { fonctions } from "@/lib/firebase/client";
import { phraseDuServeur } from "@/lib/firebase/erreur-appelable";

/**
 * L'émission du lien de suivi d'un prestataire (S56).
 *
 * **Le seul geste de cet écran qui demande du réseau**, et il n'avait pas le
 * choix : le jeton est un secret, et un secret ne se fabrique pas dans un
 * navigateur (`SECURITY.md` §4). Les règles Firestore refusent d'ailleurs
 * `jetonSuivi` écrit depuis l'application, responsable compris.
 *
 * Conséquence à assumer et à dire à l'écran (D66) : hors ligne, **ce bouton ne
 * marche pas**. Même traitement que la création d'un compte gérant — l'écran le
 * dit au lieu d'échouer en silence.
 */
export async function emettreJetonSuivi(prestataireId: string): Promise<string> {
  const appel = httpsCallable<{ prestataireId: string }, { jeton: string }>(
    fonctions(),
    "emettreJetonSuivi",
  );
  const reponse = await appel({ prestataireId });
  return reponse.data.jeton;
}

/**
 * Traduit les refus en phrases qui disent quoi faire.
 *
 * `unavailable` et `internal` couvrent la coupure réseau : le SDK ne distingue
 * pas « serveur muet » de « téléphone sans réseau », et au comptoir c'est la
 * seconde qui arrive. Dire « réessayez une fois connecté » est juste dans les
 * deux cas, et actionnable dans celui qui se produit.
 */
export function messageErreurJeton(cause: unknown): string {
  const code = (cause as { code?: string } | null | undefined)?.code ?? "";
  if (code.includes("permission-denied")) {
    return "Seul le responsable peut créer un lien de suivi.";
  }
  if (code.includes("unauthenticated")) {
    return "Votre session a expiré. Reconnectez-vous.";
  }
  if (code.includes("not-found")) {
    return "Ce prestataire n’existe plus.";
  }
  if (code.includes("unavailable") || code.includes("internal") || code.includes("deadline")) {
    return "Le lien se crée sur le serveur : il faut du réseau. Réessayez une fois connecté.";
  }
  return phraseDuServeur(cause) || "Le lien n’a pas pu être créé.";
}
