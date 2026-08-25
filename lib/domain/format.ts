/**
 * Formatage des montants et des dates.
 *
 * Centralisé dès le socle : c’est exactement le genre d’utilitaire qui se
 * retrouve réécrit en dix variantes légèrement différentes, et le jour où un
 * reçu affiche « 1250000 » là où l’écran affichait « 1 250 000 », le client
 * cesse de faire confiance au document.
 */

const LOCALE = "fr-FR";

/* Le FCFA ne se divise pas : aucun montant du système n’a de décimale
   (prompt.md §0). Un décimal qui arriverait ici est un bug ailleurs — on
   l’arrondit pour ne pas afficher n’importe quoi, mais on ne l’invente pas. */
const groupeur = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** Un montant en FCFA, groupé par milliers. Ex. `1250000` → `1 250 000 FCFA`. */
export function formaterMontant(montant: number): string {
  if (!Number.isFinite(montant)) return "— FCFA";
  return `${groupeur.format(Math.round(montant))} FCFA`;
}

/** Le nombre seul, sans devise — pour les colonnes de tableau qui titrent la devise une fois. */
export function formaterNombre(valeur: number): string {
  if (!Number.isFinite(valeur)) return "—";
  return groupeur.format(Math.round(valeur));
}

const dateLongue = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateCourte = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const heureMinute = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});

/** Ex. `25 août 2026`. Pour les en-têtes de documents et les reçus. */
export function formaterDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return "—";
  return dateLongue.format(date);
}

/** Ex. `25/08/26`. Pour les listes denses, où la place manque. */
export function formaterDateCourte(date: Date): string {
  if (Number.isNaN(date.getTime())) return "—";
  return dateCourte.format(date);
}

/** Ex. `25/08/26 à 14:30`. Pour les journaux et les historiques. */
export function formaterDateHeure(date: Date): string {
  if (Number.isNaN(date.getTime())) return "—";
  return `${dateCourte.format(date)} à ${heureMinute.format(date)}`;
}
