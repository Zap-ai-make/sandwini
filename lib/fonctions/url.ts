/**
 * Où vit une fonction HTTP (S56).
 *
 * **Pourquoi ce module existe.** Le portail du prestataire est rendu **côté
 * serveur** : la page Next appelle `suiviPrestataire` par HTTP, et doit donc
 * connaître son adresse. Or cette adresse a deux formes qui ne se ressemblent
 * pas — en ligne le projet est un préfixe d'hôte, sur émulateurs c'est un
 * segment de chemin. Recopier l'une en changeant l'hôte produit une URL qui
 * répond 404, et on cherche alors le défaut dans la fonction.
 *
 * La règle vit donc ici, pure et sous tests, plutôt que recopiée dans la page.
 * C'est le raisonnement de `scripts/deployer.mjs` : une ligne de documentation
 * se recopie mal, un chemin unique ne se recopie pas.
 *
 * **Il ne dépend d'aucun SDK**, et c'est la raison pour laquelle la région est
 * définie ici et non dans `lib/firebase/client.ts`. Un composant serveur qui
 * aurait besoin de la constante y tirerait sinon tout le SDK Firebase client.
 * `client.ts` la réexporte sous son nom habituel : rien n'a changé pour ses
 * appelants.
 */

/** Doit correspondre à `REGION` dans `functions/src/index.ts`. */
export const REGION_FONCTIONS = "europe-west1";

/** Le port de l'émulateur de fonctions, comme dans `firebase.json`. */
export const PORT_FONCTIONS_EMULATEUR = 5301;

type Environnement = {
  projet?: string;
  emulateurs?: boolean;
};

function environnementCourant(): Environnement {
  return {
    projet: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    emulateurs: process.env.NEXT_PUBLIC_FIREBASE_EMULATEURS === "1",
  };
}

/**
 * L'URL d'une fonction `onRequest`.
 *
 * **Sans projet configuré, on refuse bruyamment.** Fabriquer
 * `https://europe-west1-undefined.cloudfunctions.net/…` donnerait un appel qui
 * échoue, donc une page « ce lien n'est plus valide » parfaitement trompeuse :
 * le lien du prestataire serait bon, c'est la configuration du serveur qui
 * manquerait. Mieux vaut une erreur qui nomme la cause.
 */
export function urlFonction(nom: string, environnement = environnementCourant()): string {
  if (!nom.trim()) throw new Error("Nommez la fonction à appeler.");

  const projet = environnement.projet?.trim();
  if (!projet) {
    throw new Error(
      "Aucun projet Firebase configuré : NEXT_PUBLIC_FIREBASE_PROJECT_ID est vide.",
    );
  }

  if (environnement.emulateurs) {
    return `http://127.0.0.1:${PORT_FONCTIONS_EMULATEUR}/${projet}/${REGION_FONCTIONS}/${nom}`;
  }
  return `https://${REGION_FONCTIONS}-${projet}.cloudfunctions.net/${nom}`;
}
