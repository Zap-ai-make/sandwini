/**
 * L'identité de l'entreprise, et le seul réglage qui l'accompagne.
 *
 * **Ce fichier renverse D15.** Cette décision-là disait « paramètre, pas
 * constante » : le responsable saisirait son nom, son adresse et son numéro
 * fiscal dans un écran de réglages. Il n'en veut pas — « je ne veux pas que le
 * réglage soit fait par le client, je veux qu'on le fasse dès à présent ». La
 * décision qui fait foi est désormais D71, et ses trois raisons tiennent :
 *
 * 1. **Ça ne change pas.** Une raison sociale et un numéro RCCM sont fixés à la
 *    création de l'entreprise. Une donnée qui ne change jamais n'a rien à faire
 *    dans une collection modifiable — elle n'y gagne que d'être cassable.
 * 2. **Ça s'imprime sur un document commercial.** L'IFU et le RCCM sont
 *    obligatoires en tête d'un reçu au Burkina Faso. Un champ que quelqu'un
 *    peut vider un vendredi soir produit le lundi des reçus non conformes, sans
 *    que rien n'alerte.
 * 3. **Ça supprime un écran, une règle et des tests.** `ARCHITECTURE.md` §1.
 *
 * Ce qui reste réglable tient en un nombre — le seuil d'inactivité des tranches
 * — et il est plus bas dans ce fichier.
 */

/**
 * L'identité, posée une fois.
 *
 * Le nom du gérant, lui, ne vient pas d'ici : c'est la seule donnée du reçu qui
 * dépende du compte connecté (`session.utilisateur.nom`), parce que c'est la
 * seule qui change d'une personne à l'autre.
 */
export const IDENTITE = {
  raisonSociale: "Sandwidi et frère",
  activite: "Vente de motos et pièces détachées",
  siege: "Pouytenga, province du Kouritenga",
  telephone: "70124588",
  ifu: "00071842 R",
  rccm: "BF-OUA-01-2016-A12-00847",
} as const;

/**
 * Les valeurs encore provisoires, et le fait qu'elles le sont.
 *
 * L'IFU et le RCCM ci-dessus sont au bon format mais **n'ont pas été fournis** :
 * ils viennent des maquettes. Cette liste n'est pas un commentaire — l'écran
 * des réglages la lit et l'affiche en rouge, pour que personne ne remette un
 * reçu portant un numéro fiscal inventé sans l'avoir vu écrit.
 *
 * Vider ce tableau est le geste qui clôt le sujet, une fois les vrais numéros
 * communiqués par le responsable.
 */
export const IDENTITE_A_CONFIRMER: readonly (keyof typeof IDENTITE)[] = ["ifu", "rccm"];

export const LIBELLE_IDENTITE: Record<keyof typeof IDENTITE, string> = {
  raisonSociale: "Raison sociale",
  activite: "Activité",
  siege: "Siège",
  telephone: "Téléphone",
  ifu: "IFU",
  rccm: "RCCM",
};

/* --------------------------------------------------------------------------
   Le seul réglage qui reste, et il n'est pas d'identité.
   -------------------------------------------------------------------------- */

/**
 * Au bout de combien de jours sans versement une vente en tranches est
 * signalée comme inactive (`prompt.md` §6.3, §14).
 *
 * Il reste dans `entreprise/profil` : c'est un document déjà lu à chaque
 * ouverture, et lui donner une collection à lui coûterait une lecture de plus
 * pour un entier. Il est arrivé en S9 et pas en S4 parce qu'un réglage sans
 * liste à alimenter est pire qu'un réglage absent (D37).
 */
export type ReglagesEntreprise = {
  seuilInactiviteTranches: number;
};

/**
 * Trente jours, valeur par défaut du cahier des charges (§6.3).
 *
 * Les bornes ne sont pas décoratives : en dessous d'un jour la liste dirait
 * n'importe quoi, et au-delà d'un an elle ne dirait plus rien.
 */
export const SEUIL_INACTIVITE_DEFAUT = 30;
export const SEUIL_INACTIVITE_MIN = 1;
export const SEUIL_INACTIVITE_MAX = 365;

export const REGLAGES_DEFAUT: ReglagesEntreprise = {
  seuilInactiviteTranches: SEUIL_INACTIVITE_DEFAUT,
};

export function validerReglages(reglages: ReglagesEntreprise): string | null {
  const seuil = reglages.seuilInactiviteTranches;
  if (!Number.isInteger(seuil) || seuil < SEUIL_INACTIVITE_MIN || seuil > SEUIL_INACTIVITE_MAX) {
    return `Le seuil d’inactivité doit être un nombre de jours entre ${SEUIL_INACTIVITE_MIN} et ${SEUIL_INACTIVITE_MAX}.`;
  }
  return null;
}
