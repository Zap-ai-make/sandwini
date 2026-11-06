import { dossierEnCours, rangerDossiers, type DossierCarteGrise } from "./dossier-carte-grise";

/**
 * Le filtre d'état du classeur des cartes grises (6 novembre 2026).
 *
 * « C'est comme s'il y avait deux pages, tout devrait être imbriqué. » Les
 * onglets Dépôt et Retrait faisaient deux listes ; ce filtre en fait une seule,
 * qui se combine sur place avec le lot et la recherche.
 *
 * **Les cinq choix sont les états que la base connaît déjà**, lus sur le
 * statut du dossier — lui-même déduit des cases de la ligne
 * (`statutDeLaLigne`). « Sortis » est le mot du commanditaire pour « chez le
 * prestataire ».
 *
 * **« En cours » est le choix d'ouverture**, et il reprend l'ancien onglet
 * Dépôt : entre le dépôt et le retrait il passe presque un an, et les dossiers
 * rendus enterreraient ceux qu'on attend.
 */
export const ETATS_CLASSEUR = ["en_cours", "a_deposer", "sortis", "au_magasin", "retires"] as const;

export type EtatClasseur = (typeof ETATS_CLASSEUR)[number];

export const LIBELLE_ETAT_CLASSEUR: Record<EtatClasseur, string> = {
  en_cours: "En cours",
  a_deposer: "À déposer",
  sortis: "Sortis",
  au_magasin: "Au magasin",
  retires: "Retirés",
};

type DossierFiltre = Pick<DossierCarteGrise, "statut">;

export function correspondALEtat(dossier: DossierFiltre, etat: EtatClasseur): boolean {
  switch (etat) {
    case "en_cours":
      return dossierEnCours(dossier);
    case "a_deposer":
      return dossier.statut === "a_faire";
    case "sortis":
      return dossier.statut === "chez_prestataire";
    case "au_magasin":
      return dossier.statut === "revenu_magasin";
    case "retires":
      /* « Sans objet » compris, comme dans l'ancien onglet Retrait : il
         n'attend plus rien. */
      return !dossierEnCours(dossier);
  }
}

/** Le compte de chaque choix du filtre, dans l'ordre des boutons. */
export function compterParEtat(dossiers: readonly DossierFiltre[]): Record<EtatClasseur, number> {
  return Object.fromEntries(
    ETATS_CLASSEUR.map((etat) => [
      etat,
      dossiers.filter((dossier) => correspondALEtat(dossier, etat)).length,
    ]),
  ) as Record<EtatClasseur, number>;
}

/**
 * Les dossiers d'un état, triés comme on les lit (`rangerDossiers`) : ce qui
 * attend un geste en tête, les retirés du plus récent au plus ancien.
 */
export function rangerSelonEtat(
  dossiers: readonly DossierCarteGrise[],
  etat: EtatClasseur,
): DossierCarteGrise[] {
  const { cours, termines } = rangerDossiers(
    dossiers.filter((dossier) => correspondALEtat(dossier, etat)),
  );
  return [...cours, ...termines];
}
