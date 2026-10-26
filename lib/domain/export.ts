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
 * **Un vrai classeur, et non plus du CSV (S54).** Le commanditaire ouvre ces
 * fichiers dans Excel : autant lui en donner un. Le format est fabriqué à la
 * main dans `./xlsx` — aucune dépendance, et le fichier se monte entièrement
 * sur l'appareil, donc au comptoir coupure faite comme le reste (D66).
 *
 * Le passage au classeur ferme au passage l'injection de formule que le CSV
 * demandait de neutraliser à la main : une cellule déclarée `inlineStr` ne peut
 * pas porter de formule. Ce n'est plus une chaîne qui protège, c'est la
 * structure du format — et `xlsx.test.ts` le vérifie, sans quoi personne ne
 * saurait que la protection repose là-dessus.
 */

import type { Moto } from "./moto";
import { LIBELLE_STATUT } from "./moto";
import { classeur, type Cellule } from "./xlsx";

export const EN_TETE_EXPORT = [
  "Châssis",
  "Marque",
  "Modèle",
  "Couleur",
  "Année",
  "Statut",
  "Boutique",
  "Moteur",
  "Entrée",
] as const;

/** `08/10/2026`, ou rien. La date de l'appareil, comme partout ailleurs. */
function jour(date: Date | null): string {
  if (date === null) return "";
  const jj = `${date.getDate()}`.padStart(2, "0");
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${jj}/${mm}/${date.getFullYear()}`;
}

/**
 * Les motos en lignes de tableau, en-tête compris, dans l'ordre reçu.
 *
 * L'ordre n'est pas retrié : c'est celui de l'écran, donc celui que la personne
 * a sous les yeux au moment où elle coche. Un export qui se réordonnerait tout
 * seul obligerait à relire pour vérifier qu'on a bien pris les bonnes.
 *
 * C'est ici, et nulle part ailleurs, que se décide ce qui sort — d'où un
 * témoin qui vérifie l'absence de tout montant plutôt que la liste des
 * colonnes : formulé ainsi, il tient encore le jour où quelqu'un en ajoute une
 * sans y penser.
 */
export function lignesMotosExport(
  motos: readonly Moto[],
  nomMarque: (id: string) => string,
  nomModele: (id: string) => string,
): Cellule[][] {
  return [
    [...EN_TETE_EXPORT],
    ...motos.map((moto): Cellule[] => [
      moto.numeroChassis,
      nomMarque(moto.marqueId),
      /* Vide, et non « Modèle non précisé » : dans un tableur, une cellule
         vide se filtre et se trie ; une phrase se lirait comme un nom de
         modèle qui n'existe pas (D105). */
      nomModele(moto.modeleId),
      moto.couleur,
      /* Un nombre, pas une chaîne : une année en texte se trierait comme du
         texte, et c'est le genre de colonne qu'on trie. */
      moto.annee,
      LIBELLE_STATUT[moto.statut],
      moto.boutiqueId,
      moto.numeroMoteur,
      jour(moto.dateEntree),
    ]),
  ];
}

/** Le classeur prêt à écrire sur le disque. */
export function motosEnClasseur(
  motos: readonly Moto[],
  nomMarque: (id: string) => string,
  nomModele: (id: string) => string,
): Uint8Array<ArrayBuffer> {
  return classeur("Motos", lignesMotosExport(motos, nomMarque, nomModele));
}

/** `motos-2026-10-08.xlsx` — daté, pour que deux exports ne se confondent pas. */
export function nomFichierExport(maintenant: Date): string {
  const mm = `${maintenant.getMonth() + 1}`.padStart(2, "0");
  const jj = `${maintenant.getDate()}`.padStart(2, "0");
  return `motos-${maintenant.getFullYear()}-${mm}-${jj}.xlsx`;
}
