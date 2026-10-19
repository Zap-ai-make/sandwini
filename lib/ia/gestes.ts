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
  /** Le nom tel que prononcé ; c'est l'écran qui le rapproche de sa boutique. */
  | { quoi: "boutique"; nom: string }
  | { quoi: "fermer" };

/** Les outils qui agissent sur l'écran plutôt que de consulter des données. */
export const OUTILS_QUI_AGISSENT = new Set([
  "aller_a",
  "choisir_la_boutique",
  "fermer_l_assistant",
]);

export function lireGeste(nom: string, args: Record<string, unknown>): Geste | Refus {
  if (nom === "aller_a") {
    const demande = typeof args.ecran === "string" ? args.ecran : "";
    const destination = trouverDestination(demande);
    /* Nommer le refus plutôt que de choisir à peu près : emmener quelqu'un sur
       un écran voisin de celui qu'il voulait est pire que de ne pas bouger —
       il croit y être. */
    if (!destination) {
      return { erreur: `Il n’y a pas d’écran « ${demande} ». Choisis dans la liste proposée.` };
    }
    return { quoi: "aller", destination };
  }

  if (nom === "choisir_la_boutique") {
    const demande = typeof args.nom === "string" ? args.nom.trim() : "";
    if (demande === "") return { erreur: "Demande de quelle boutique il s’agit." };
    return { quoi: "boutique", nom: demande };
  }

  if (nom === "fermer_l_assistant") return { quoi: "fermer" };

  return { erreur: `Geste inconnu : ${nom}.` };
}

/** Ce que l'assistant redit, pour qu'on sache ce qui vient de se passer. */
export function resumeGeste(geste: Geste): string {
  if (geste.quoi === "aller") return `J’ouvre ${geste.destination.libelle}.`;
  if (geste.quoi === "boutique") return `Je passe sur ${geste.nom}.`;
  return "Je referme l’assistant.";
}
