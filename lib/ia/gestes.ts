import type { SaisieVente } from "../domain/vente";
import { trouverDestination, type Destination } from "./destinations";
import type { Refus } from "./propositions";

/**
 * Ce que l'assistant fait **à l'écran**, par la porte d'entrée de
 * l'application.
 *
 * **Et surtout pas en imitant une souris.** Le commanditaire a demandé un
 * assistant qui « manipule comme un utilisateur réel ». La tentation est de
 * cliquer dans la page et de taper dans les champs ; c'est le mauvais chemin,
 * pour trois raisons qui se vérifient toutes les trois :
 *
 * - **React ne voit pas une valeur posée dans le DOM.** L'écran afficherait
 *   « 1 200 000 » et le formulaire enverrait zéro. Le contournement existe —
 *   attaquer le setter interne — et casse à chaque version.
 * - **C'est aveugle.** Un clic vise une position et un libellé. On renomme un
 *   bouton, l'assistant tombe, et rien ne le dit.
 * - **C'est dangereux.** Un clic atterrit sur ce qui se trouve dessous à cet
 *   instant. Une confirmation qui apparaît une demi-seconde plus tôt, et c'est
 *   une suppression validée par personne.
 *
 * Alors l'assistant appelle **les mêmes fonctions que l'écran appelle quand un
 * humain clique** : le routeur de Next, `choisir` du périmètre. Instantané,
 * local, et vérifiable — un geste est une fonction, pas un pixel.
 *
 * Ce module est **pur** : il lit ce que le modèle demande et rend une
 * intention, ou un refus. L'exécution appartient au composant, qui seul tient
 * le routeur et la liste des boutiques.
 */

export type Geste =
  | { quoi: "aller"; destination: Destination }
  /**
   * Le même écran, **proposé** au lieu d'être ouvert.
   *
   * **Pourquoi les deux existent.** Un geste part *avant* que le modèle ait
   * fini d'écrire — c'est l'ordre dans lequel l'API les rend. Ouvrir tout de
   * suite escamote donc la réponse : l'écran change pendant qu'on lisait, et
   * la question posée reste sans réponse à l'écran.
   *
   * Le commanditaire l'a dit après essai : « il détaille bien, et à la fin il
   * ouvre l'onglet avec un bouton voir — mais il doit le faire à la fin ». Une
   * proposition pose un bouton ; c'est la main qui décide du moment, et le
   * moment est forcément après la lecture.
   *
   * `aller` reste pour les intentions explicites — « ouvre la caisse » —, où
   * attendre un second clic serait une politesse qui fait perdre du temps.
   */
  | { quoi: "proposer"; destination: Destination }
  /** Le nom tel que prononcé ; c'est l'écran qui le rapproche de sa boutique. */
  | { quoi: "boutique"; nom: string }
  | { quoi: "fermer" }
  /**
   * Une vente de moto **pré-remplie**, pas enregistrée.
   *
   * C'est la même doctrine que `propositions.ts`, appliquée à un formulaire :
   * l'assistant fait le travail lent — retrouver la moto au stock, le client
   * au fichier, convertir « un million deux » en 1 200 000 — puis la modale
   * s'ouvre remplie et **personne n'a rien validé**. Huit champs liés ne
   * tiennent pas dans une carte de confirmation ; l'écran de vente, lui, les
   * montre déjà tous, avec ses propres garde-fous.
   */
  | { quoi: "vente"; motoId: string; clientId: string; prix: string };

/** Les outils qui agissent sur l'écran plutôt que de consulter des données. */
export const OUTILS_QUI_AGISSENT = new Set([
  "aller_a",
  "proposer_l_ecran",
  "choisir_la_boutique",
  "fermer_l_assistant",
  "preparer_vente_moto",
]);

/** Les noms des paramètres d'adresse, écrits une fois pour les deux sens. */
const CLES_VENTE = { moto: "moto", client: "client", prix: "prix" } as const;

/** Les chiffres, et rien d'autre : le FCFA ne se divise pas. */
function chiffresSeuls(valeur: unknown): string {
  const brut = typeof valeur === "string" ? valeur : typeof valeur === "number" ? String(valeur) : "";
  const propre = brut.replace(/[\s .]/g, "");
  return /^\d+$/.test(propre) ? propre : "";
}

export function lireGeste(nom: string, args: Record<string, unknown>): Geste | Refus {
  if (nom === "aller_a" || nom === "proposer_l_ecran") {
    const demande = typeof args.ecran === "string" ? args.ecran : "";
    const destination = trouverDestination(demande);
    /* Nommer le refus plutôt que de choisir à peu près : emmener quelqu'un sur
       un écran voisin de celui qu'il voulait est pire que de ne pas bouger —
       il croit y être. */
    if (!destination) {
      return { erreur: `Il n’y a pas d’écran « ${demande} ». Choisis dans la liste proposée.` };
    }
    /* Une seule lecture pour les deux : l'écran est le même, c'est le moment
       qui change. Deux branches auraient fini par accepter deux listes. */
    return { quoi: nom === "aller_a" ? "aller" : "proposer", destination };
  }

  if (nom === "choisir_la_boutique") {
    const demande = typeof args.nom === "string" ? args.nom.trim() : "";
    if (demande === "") return { erreur: "Demande de quelle boutique il s’agit." };
    return { quoi: "boutique", nom: demande };
  }

  if (nom === "fermer_l_assistant") return { quoi: "fermer" };

  if (nom === "preparer_vente_moto") {
    const motoId = typeof args.motoId === "string" ? args.motoId.trim() : "";
    /* Sans moto, il n'y a pas de vente à préparer : ouvrir le formulaire vide
       ferait croire qu'on a compris la demande. */
    if (motoId === "") {
      return { erreur: "Retrouve d’abord la moto au stock pour obtenir son identifiant." };
    }
    return {
      quoi: "vente",
      motoId,
      /* Le client et le prix sont facultatifs : une vente se saisit souvent
         moto d'abord, et un formulaire à moitié rempli vaut mieux que rien. */
      clientId: typeof args.clientId === "string" ? args.clientId.trim() : "",
      prix: chiffresSeuls(args.prixConvenu),
    };
  }

  return { erreur: `Geste inconnu : ${nom}.` };
}

/** Ce que l'assistant redit, pour qu'on sache ce qui vient de se passer. */
export function resumeGeste(geste: Geste): string {
  if (geste.quoi === "aller") return `J’ouvre ${geste.destination.libelle}.`;
  if (geste.quoi === "proposer") {
    /* Au modèle, pas à l'utilisateur : il doit savoir que le bouton est posé,
       sinon il le redemande ou annonce un écran ouvert qui ne l'est pas. */
    return `Le bouton pour ouvrir ${geste.destination.libelle} est affiché sous ta réponse.`;
  }
  if (geste.quoi === "boutique") return `Je passe sur ${geste.nom}.`;
  if (geste.quoi === "vente") return "J’ouvre la vente, déjà remplie. Rien n’est enregistré.";
  return "Je referme l’assistant.";
}

/**
 * L'adresse qui ouvre la modale de vente déjà remplie.
 *
 * **Par l'adresse, et non par un état partagé.** La modale vit sur un autre
 * écran que le panneau ; un état global devrait survivre à la navigation, se
 * vider au bon moment, et ne pas rejouer au retour en arrière. L'adresse fait
 * les trois gratuitement — et `?nouvelle=1` ouvrait déjà cette modale avant
 * qu'on y pense.
 */
export function cheminVentePreparee(geste: Extract<Geste, { quoi: "vente" }>): string {
  const parametres = new URLSearchParams({ nouvelle: "1" });
  parametres.set(CLES_VENTE.moto, geste.motoId);
  if (geste.clientId) parametres.set(CLES_VENTE.client, geste.clientId);
  if (geste.prix) parametres.set(CLES_VENTE.prix, geste.prix);
  return `/motos/ventes?${parametres.toString()}`;
}

/**
 * Relit cette adresse, côté écran des ventes.
 *
 * Rend `null` quand il n'y a rien à pré-remplir, pour que la modale garde sa
 * saisie vide habituelle. Tout ce qui est illisible est **ignoré** plutôt que
 * repris : une adresse se bricole à la main, et un prix de « abc » ne doit pas
 * atterrir dans un champ de montant.
 */
export function lireVentePreparee(
  parametres: { get: (cle: string) => string | null },
): Partial<SaisieVente> | null {
  const depart: Partial<SaisieVente> = {};
  const motoId = parametres.get(CLES_VENTE.moto)?.trim() ?? "";
  const clientId = parametres.get(CLES_VENTE.client)?.trim() ?? "";
  const prix = chiffresSeuls(parametres.get(CLES_VENTE.prix) ?? "");

  if (motoId) depart.motoId = motoId;
  if (clientId) depart.clientId = clientId;
  if (prix) depart.prixConvenu = prix;

  return Object.keys(depart).length === 0 ? null : depart;
}
