/**
 * Le dossier documents — sa machine à états (`prompt.md` §7).
 *
 * Un dossier est l'ensemble vente + paiements + quatre documents (§13). Ce
 * module ne sait rien de Firestore ni de React : il dit ce qu'un document a le
 * droit de devenir, et quand un dossier est fini. Ces règles sont réutilisées
 * telles quelles par la page client (S13) et la page prestataire (S15), qui les
 * appliqueront côté serveur — d'où le fait qu'elles vivent ici, en fonctions
 * pures, plutôt qu'en conditions dispersées dans des composants.
 */

import { TYPES_DOCUMENT, type StatutDocument, type TypeDocument } from "./vente";

/**
 * Ce que chaque statut autorise comme suite.
 *
 * Le chemin nominal est celui du cahier :
 * `a_faire → chez_prestataire → revenu_magasin → remis_client`.
 *
 * Deux écarts, tous deux voulus (`DECISIONS.md` D65) :
 *
 * - **`a_faire → revenu_magasin`.** La quittance et le CMC se traitent au
 *   magasin. Les pages prestataire ne listent que la carte grise et la plaque
 *   (§12.2), et un CMC attribué passe directement à « revenu au magasin »
 *   (§7.2). Les faire transiter par un prestataire fictif ferait mentir la
 *   donnée, et le nom d'un prestataire est ce que la liste des dossiers affiche.
 * - **`chez_prestataire ⇏ non_applicable`.** Une avance a été versée et un
 *   encaissement écrit : écarter le document laisserait de l'argent sorti sans
 *   contrepartie. On écarte avant de déposer, pas après.
 *
 * `remis_client` et `non_applicable` sont terminaux. Corriger une erreur de
 * saisie est une opération sensible, journalisée, réservée au responsable —
 * c'est le sujet de S25, pas une transition ordinaire.
 */
export const TRANSITIONS: Record<StatutDocument, readonly StatutDocument[]> = {
  a_faire: ["chez_prestataire", "revenu_magasin", "non_applicable"],
  chez_prestataire: ["revenu_magasin"],
  revenu_magasin: ["remis_client"],
  remis_client: [],
  non_applicable: [],
};

/** Ce passage est-il permis ? Un statut ne se rend jamais à lui-même. */
export function transitionAutorisee(de: StatutDocument, vers: StatutDocument): boolean {
  return TRANSITIONS[de].includes(vers);
}

/** Ce qu'on propose à l'écran depuis un statut donné. Vide sur un statut terminal. */
export function statutsSuivants(de: StatutDocument): readonly StatutDocument[] {
  return TRANSITIONS[de];
}

/** Un statut dont plus rien ne peut sortir : le document a fini sa vie. */
export function estStatutTerminal(statut: StatutDocument): boolean {
  return TRANSITIONS[statut].length === 0;
}

/** Ce que la clôture regarde. Rien d'autre n'entre en compte (§7.1). */
export type EtatDossier = {
  documents: readonly { type: TypeDocument; statut: StatutDocument }[];
  /** `statutPaiement === 'solde'` : plus rien n'est dû. */
  soldee: boolean;
  /** La moto est chez le client. Fausse tant que des tranches ne sont pas soldées. */
  motoRemise: boolean;
};

/** Un document réglé : remis au client, ou écarté de la vente. */
function estRegle(statut: StatutDocument): boolean {
  return statut === "remis_client" || statut === "non_applicable";
}

/**
 * Le dossier peut-il se clore ? (§7.1)
 *
 * Les quatre documents réglés, la vente soldée, la moto partie. Les trois à la
 * fois : une vente en tranches entièrement payée dont la moto dort encore au
 * magasin n'est pas un dossier fini, et c'est précisément la confusion que le
 * cahier interdit entre crédit et tranches (§13).
 *
 * On exige les **quatre** types, pas « au moins zéro » : un dossier dont les
 * documents ne sont pas encore chargés passerait sinon pour un dossier complet.
 */
export function dossierCloturable(etat: EtatDossier): boolean {
  if (!etat.soldee || !etat.motoRemise) return false;

  return TYPES_DOCUMENT.every((type) => {
    const document = etat.documents.find((candidat) => candidat.type === type);
    return document !== undefined && estRegle(document.statut);
  });
}

/**
 * La date annoncée au client est-elle dépassée ?
 *
 * Comparé de jour à jour, pas d'instant à instant : une carte grise attendue le
 * 2 n'est pas en retard à 8 h le 2 parce qu'elle a été saisie à 14 h la veille.
 *
 * Le calcul est local et prend la date de l'appareil : c'est ce qui le rend
 * juste hors ligne, où aucune horloge serveur n'est joignable.
 */
export function estEnRetard(estimee: Date | null, aujourdhui: Date): boolean {
  if (!estimee) return false;
  return debutDeJournee(estimee) < debutDeJournee(aujourdhui);
}

function debutDeJournee(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
