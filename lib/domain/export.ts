/**
 * L'export des motos choisies (S50).
 *
 * Demandé ainsi : « exportation de motos choisies par cochage, ça doit tout
 * prendre en compte : cadre, marque, modèle, **sauf les prix** ».
 *
 * **Le « sauf les prix » n'est pas une préférence d'affichage, c'est le mur
 * D2.** Les coûts et les marges vivent dans `motos/{id}/prive/cout`, hors de
 * portée d'un gérant — mais le prix de vente conseillé, lui, est sur le
 * document que tout le monde lit. Un export qui l'emporterait ferait sortir du
 * chiffre par la porte de derrière, dans un fichier qui circule par définition.
 * Aucune colonne de montant n'existe donc ici, et le test l'exige par l'absence
 * plutôt que par la liste — formulé ainsi, il tient encore le jour où quelqu'un
 * ajoute une colonne sans y penser.
 *
 * **Du CSV, et point-virgule.** Excel en français découpe sur le point-virgule ;
 * sur la virgule, tout atterrit dans une seule colonne. Le fichier se fabrique
 * entièrement sur l'appareil — aucun réseau, donc l'export marche au comptoir
 * coupure faite, comme le reste (D66).
 */

import type { Moto } from "./moto";
import { LIBELLE_ETAT, LIBELLE_STATUT } from "./moto";

export const SEPARATEUR = ";";

/* `\r\n` et non `\n` : c'est la fin de ligne que RFC 4180 décrit et que les
   tableurs sous Windows attendent. */
const FIN_DE_LIGNE = "\r\n";

/**
 * L'indicateur d'ordre des octets, en tête du fichier.
 *
 * Sans lui, Excel lit un CSV en codage local et rend « Côte d'Ivoire » en
 * « CÃ´te d'Ivoire ». Il ne sert qu'à l'ouverture du fichier ; il ne fait pas
 * partie des données, donc `motosEnCsv` ne le pose pas — c'est l'appelant qui
 * l'ajoute au moment de fabriquer le fichier.
 */
export const BOM_UTF8 = "﻿";

export const EN_TETE_EXPORT = [
  "Châssis",
  "Marque",
  "Modèle",
  "Couleur",
  "Année",
  "État",
  "Statut",
  "Boutique",
  "Moteur",
  "Entrée",
] as const;

/**
 * Protège une valeur selon RFC 4180.
 *
 * Une couleur saisie « Rouge; noir » décalerait sinon toutes les colonnes
 * suivantes d'un cran, en silence et sur cette seule ligne — le genre d'erreur
 * qu'on ne voit qu'en relisant le tableur à la main.
 */
function proteger(valeur: string): string {
  if (!/[";\r\n]/.test(valeur)) return valeur;
  return `"${valeur.replace(/"/g, '""')}"`;
}

/** `08/10/2026`, ou rien. La date de l'appareil, comme partout ailleurs. */
function jour(date: Date | null): string {
  if (date === null) return "";
  const jj = `${date.getDate()}`.padStart(2, "0");
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${jj}/${mm}/${date.getFullYear()}`;
}

/**
 * Les motos en CSV, dans l'ordre reçu.
 *
 * L'ordre n'est pas retrié : c'est celui de l'écran, donc celui que la personne
 * a sous les yeux au moment où elle coche. Un export qui se réordonnerait tout
 * seul obligerait à relire pour vérifier qu'on a bien pris les bonnes.
 */
export function motosEnCsv(
  motos: readonly Moto[],
  nomMarque: (id: string) => string,
  nomModele: (id: string) => string,
): string {
  const lignes = [EN_TETE_EXPORT.join(SEPARATEUR)];

  for (const moto of motos) {
    lignes.push(
      [
        moto.numeroChassis,
        nomMarque(moto.marqueId),
        /* Vide, et non « Modèle non précisé » : dans un tableur, une cellule
           vide se filtre et se trie ; une phrase se lirait comme un nom de
           modèle qui n'existe pas (D105). */
        nomModele(moto.modeleId),
        moto.couleur,
        moto.annee === null ? "" : String(moto.annee),
        LIBELLE_ETAT[moto.etat],
        LIBELLE_STATUT[moto.statut],
        moto.boutiqueId,
        moto.numeroMoteur,
        jour(moto.dateEntree),
      ]
        .map(proteger)
        .join(SEPARATEUR),
    );
  }

  return lignes.join(FIN_DE_LIGNE);
}

/** `motos-2026-10-08.csv` — daté, pour que deux exports ne se confondent pas. */
export function nomFichierExport(maintenant: Date): string {
  const mm = `${maintenant.getMonth() + 1}`.padStart(2, "0");
  const jj = `${maintenant.getDate()}`.padStart(2, "0");
  return `motos-${maintenant.getFullYear()}-${mm}-${jj}.csv`;
}
