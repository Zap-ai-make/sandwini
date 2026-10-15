import { formaterDateCourte, formaterMois } from "./format";

/**
 * Une période de consultation, pour les écrans qui bornent une liste dans le
 * temps (S46).
 *
 * **Rien ici ne touche aux données** : ce module décide seulement quelles
 * lignes déjà chargées s'affichent. Filtrer par une requête Firestore aurait
 * demandé une écoute par période, un index de plus, et surtout un aller-retour
 * réseau pour changer de mois — or ces écrans doivent répondre coupure faite
 * (D66). Les collections sont chargées entières, le tri se fait en mémoire.
 *
 * Les bornes sont **semi-ouvertes** — `[debut, fin[`. C'est ce qui évite la
 * dernière milliseconde du dernier jour, celle qu'on croit attraper avec
 * `23:59:59` et qui laisse passer `23:59:59.500`.
 */
/**
 * `aujourd-hui` est entré en S55, avec la caisse.
 *
 * La caisse lisait la journée et ne savait rien faire d'autre ; le
 * commanditaire l'a voulue mensuelle — « les calculs doivent être mensuels ».
 * Mais le geste du comptoir reste quotidien : on ouvre la caisse pour voir ce
 * qui s'est passé depuis ce matin. Remplacer le jour par le mois aurait réglé
 * la comptabilité en cassant l'usage. Les deux tiennent dans le même filtre.
 */
export const PERIODES = [
  "aujourd-hui",
  "ce-mois",
  "mois-dernier",
  "cette-annee",
  "tout",
  "personnalise",
] as const;

export type Periode = (typeof PERIODES)[number];

export const LIBELLE_PERIODE: Record<Periode, string> = {
  "aujourd-hui": "Aujourd’hui",
  tout: "Tout",
  "ce-mois": "Ce mois-ci",
  "mois-dernier": "Mois dernier",
  "cette-annee": "Cette année",
  personnalise: "Du… au…",
};

/** Les deux champs de date, tels que les rend `<input type="date">` : `AAAA-MM-JJ`, ou vides. */
export type PlagePeriode = {
  depuis: string;
  jusqua: string;
};

export const PLAGE_VIDE: PlagePeriode = { depuis: "", jusqua: "" };

/** `null` veut dire « aucune borne » — donc tout passe. */
export type BornesPeriode = { debut: Date; fin: Date } | null;

/**
 * Lit `AAAA-MM-JJ` en date **locale**, à minuit.
 *
 * `new Date("2026-09-01")` lirait la chaîne comme de l'UTC. Le commerce est au
 * Burkina, donc à UTC+0, et l'écart ne se verrait pas ici — il se verrait sur
 * la machine de développement, ou le jour où quelqu'un consulte depuis
 * ailleurs, et il décalerait la borne d'un jour entier. On construit la date
 * champ par champ plutôt que de dépendre du fuseau de qui regarde.
 */
function lireJour(brut: string): Date | null {
  const trouve = /^(\d{4})-(\d{2})-(\d{2})$/.exec(brut);
  if (!trouve) return null;
  const [, annee, mois, jour] = trouve;
  const date = new Date(Number(annee), Number(mois) - 1, Number(jour));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Le lendemain à minuit : la borne haute d'un jour qu'on veut inclure en entier. */
function lendemain(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/**
 * Les bornes d'une période, calculées sur l'heure de l'appareil.
 *
 * `maintenant` est un paramètre et non un `new Date()` interne : c'est ce qui
 * rend « le mois dernier » testable un 1ᵉʳ janvier, où il tombe sur l'année
 * précédente. `new Date(2026, 0, 1 - 1)` rend le 31 décembre 2025 tout seul —
 * le constructeur normalise, et on n'a donc aucun calcul de calendrier à
 * écrire à la main.
 */
export function bornesPeriode(
  periode: Periode,
  maintenant: Date,
  plage: PlagePeriode = PLAGE_VIDE,
): BornesPeriode {
  const annee = maintenant.getFullYear();
  const mois = maintenant.getMonth();

  switch (periode) {
    case "tout":
      return null;
    case "aujourd-hui": {
      /* Minuit à minuit, sur l'horloge de l'appareil : « aujourd'hui » veut
         dire aujourd'hui pour qui est au comptoir, pas à l'heure UTC. */
      const jour = maintenant.getDate();
      return { debut: new Date(annee, mois, jour), fin: new Date(annee, mois, jour + 1) };
    }
    case "ce-mois":
      return { debut: new Date(annee, mois, 1), fin: new Date(annee, mois + 1, 1) };
    case "mois-dernier":
      return { debut: new Date(annee, mois - 1, 1), fin: new Date(annee, mois, 1) };
    case "cette-annee":
      return { debut: new Date(annee, 0, 1), fin: new Date(annee + 1, 0, 1) };
    case "personnalise": {
      const depuis = lireJour(plage.depuis);
      const jusqua = lireJour(plage.jusqua);
      /* Une plage qu'on n'a pas fini de remplir ne borne rien de ce côté-là.
         Saisir la date de début et voir la liste se vider d'un coup, parce que
         la date de fin vaut encore zéro, serait un faux verdict. */
      if (!depuis && !jusqua) return null;
      return {
        debut: depuis ?? new Date(-8640000000000000),
        fin: jusqua ? lendemain(jusqua) : new Date(8640000000000000),
      };
    }
  }
}

/**
 * Cette date tombe-t-elle dans la période ?
 *
 * **Une date absente passe toujours, et ce n'est pas une tolérance.** Une vente
 * ou un versement enregistré hors ligne n'a pas encore l'horodatage du serveur :
 * son champ vaut `null` jusqu'à la synchronisation. Le masquer reviendrait à
 * faire disparaître de « ce mois-ci » l'écriture qu'on vient de saisir, au
 * moment précis où l'on vérifie qu'elle est bien passée — le contraire de ce
 * que promet D66. Une écriture sans date est de toute façon la plus récente de
 * toutes : elle n'a pas encore atteint le serveur.
 */
export function dansLaPeriode(date: Date | null, bornes: BornesPeriode): boolean {
  if (bornes === null || date === null) return true;
  return date >= bornes.debut && date < bornes.fin;
}

/**
 * La plage est-elle à l'envers ?
 *
 * On ne remet pas les deux dates dans l'ordre à la place de qui les a saisies :
 * inverser silencieusement, c'est répondre à une question qui n'a pas été
 * posée. L'écran le dit, et la liste se vide — ce qui est la vérité de
 * l'intervalle demandé.
 */
export function plageInversee(periode: Periode, plage: PlagePeriode): boolean {
  if (periode !== "personnalise") return false;
  const depuis = lireJour(plage.depuis);
  const jusqua = lireJour(plage.jusqua);
  return depuis !== null && jusqua !== null && depuis > jusqua;
}

/**
 * Le nom de la période, tel qu'il se pose sous un chiffre.
 *
 * Rend `null` pour « Tout » : un chiffre sans mention porte sur l'ensemble,
 * c'est la lecture par défaut et l'écrire n'ajoute rien. Les autres en ont
 * besoin — « 2 290 000 FCFA » ne dit pas de quoi il parle.
 */
export function libellePeriode(
  periode: Periode,
  maintenant: Date,
  plage: PlagePeriode = PLAGE_VIDE,
): string | null {
  switch (periode) {
    case "tout":
      return null;
    case "aujourd-hui":
      return formaterDateCourte(maintenant);
    case "ce-mois":
      return formaterMois(maintenant);
    case "mois-dernier":
      return formaterMois(new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1));
    case "cette-annee":
      return String(maintenant.getFullYear());
    case "personnalise": {
      const depuis = lireJour(plage.depuis);
      const jusqua = lireJour(plage.jusqua);
      if (depuis && jusqua) return `Du ${formaterDateCourte(depuis)} au ${formaterDateCourte(jusqua)}`;
      if (depuis) return `Depuis le ${formaterDateCourte(depuis)}`;
      if (jusqua) return `Jusqu’au ${formaterDateCourte(jusqua)}`;
      return null;
    }
  }
}
