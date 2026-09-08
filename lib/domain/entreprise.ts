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
  /* Le nom légal, tel qu'il figure sur l'acte — « FRERES » au pluriel, et le
     préfixe « ETS ». Les maquettes portaient « Sandwidi et frère » au
     singulier : c'est le nom d'usage, et il n'a rien à faire en tête d'un
     document commercial. Seule la casse est adoucie, l'acte étant en
     capitales par convention de formulaire, pas par choix de nom. */
  raisonSociale: "ETS Sandwidi et Frères",
  activite: "Vente de motos et pièces détachées",
  siege: "BP 41 — Pouytenga",
  /* Les quatre numéros professionnels de l'entreprise, désignés comme tels par
     le responsable. Ils valent pour toutes les boutiques — d'où le pluriel, et
     d'où le fait qu'ils s'impriment sur chaque reçu : un client qui rappelle ne
     doit pas dépendre du fait que la ligne d'un comptoir sonne ce jour-là.

     Celui de l'acte scanné (70 28 46 50) n'y figure pas : il n'a pas été redit
     dans cette liste, et un numéro qui ne répond plus est pire qu'un numéro
     absent. L'y remettre est une ligne, s'il est toujours en service. */
  telephones: ["72946323", "76217668", "70246397", "57069794"] as readonly string[],
  email: "sandwidimoustapha72@gmail.com",
  ifu: "00084905D",
  rccm: "BFTNK2016A495",
} as const;

/**
 * Les mentions encore provisoires, et le fait qu'elles le sont.
 *
 * **Ce tableau est vide, et c'est une bonne nouvelle** : l'IFU et le RCCM
 * portés ci-dessus viennent de l'acte fourni par le responsable, et non plus
 * des maquettes.
 * Il reste en place parce que le mécanisme, lui, doit survivre : le jour où une
 * mention devient douteuse — un déménagement de siège, un numéro qui change —
 * l'y inscrire suffit à ce que l'écran des réglages l'affiche en rouge, plutôt
 * qu'à espérer que quelqu'un relise ce fichier avant le prochain contrôle.
 */
export const IDENTITE_A_CONFIRMER: readonly (keyof typeof IDENTITE)[] = [];

export const LIBELLE_IDENTITE: Record<keyof typeof IDENTITE, string> = {
  raisonSociale: "Raison sociale",
  activite: "Activité",
  siege: "Siège",
  telephones: "Téléphones",
  email: "E-mail",
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
