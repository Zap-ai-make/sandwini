/**
 * Les espaces de travail — ce que chacun voit de l'application.
 *
 * L'entreprise a trois espaces (`prompt.md` §1) : les boutiques de motos, la
 * boutique de pièces détachées, et la supervision. Aucun compte ne les voit
 * tous les trois de la même façon : le gérant vit dans l'espace du métier de sa
 * boutique, le responsable passe au-dessus.
 *
 * Sur le modèle de `peut()` dans `roles.ts` : une seule réponse à « cet espace
 * lui est-il ouvert ? », partagée par la navigation, les gardes de route et
 * l'accueil. Sans ce point unique, la barre affiche une entrée que l'écran
 * refuse ensuite — un lien mort, et l'impression que l'application est cassée.
 *
 * Ces fonctions décident de ce qu'on **affiche**, pas de ce qui est **permis** :
 * la permission se joue dans les règles Firestore (`DECISIONS.md` D27).
 */

import type { Metier } from "./boutique";
import { peut, type Role } from "./roles";

export type Espace = "supervision" | "accueil" | "motos" | "pieces" | "caisse" | "reglages";

export const ESPACES: Record<Espace, { href: string; libelle: string }> = {
  supervision: { href: "/supervision", libelle: "Supervision" },
  accueil: { href: "/dashboard", libelle: "Accueil" },
  motos: { href: "/motos", libelle: "Motos" },
  pieces: { href: "/pieces", libelle: "Pièces" },
  caisse: { href: "/caisse", libelle: "Caisse" },
  reglages: { href: "/parametres", libelle: "Réglages" },
};

/** L'espace qui porte un métier, et le métier qu'il demande. */
const METIER_DE: Partial<Record<Espace, Metier>> = {
  motos: "motos",
  pieces: "pieces",
};

/** Le métier qu'un espace exige, s'il en exige un. */
export function metierDeLEspace(espace: Espace): Metier | null {
  return METIER_DE[espace] ?? null;
}

/**
 * Là où chacun atterrit après la connexion.
 *
 * Le responsable ouvre sur la supervision, parce que c'est de là qu'il choisit
 * la boutique qu'il regarde. Le gérant n'a pas ce choix : son accueil est celui
 * de sa boutique.
 */
export function accueilDuRole(role: Role): string {
  return peut(role, "acceder_supervision") ? ESPACES.supervision.href : ESPACES.accueil.href;
}

/**
 * Les espaces ouverts à ce rôle sur ce périmètre, dans l'ordre de la journée :
 * on regarde d'où l'on part, on vend, on compte la caisse, et les réglages
 * ferment la marche.
 *
 * `metiers` vide — un périmètre encore en cours de chargement, ou une entreprise
 * sans boutique — ne rend que les espaces dont la réponse est certaine. Mieux
 * vaut une barre courte qui s'allonge qu'une entrée qui disparaît sous le doigt.
 */
export function espacesVisibles(role: Role, metiers: readonly Metier[]): Espace[] {
  const ordre: Espace[] = peut(role, "acceder_supervision")
    ? ["supervision", "motos", "pieces", "caisse", "reglages"]
    : ["accueil", "motos", "pieces", "caisse", "reglages"];

  return ordre.filter((espace) => accedeEspace(role, metiers, espace));
}

/** Cet espace est-il ouvert à ce rôle sur ce périmètre ? */
export function accedeEspace(
  role: Role,
  metiers: readonly Metier[],
  espace: Espace,
): boolean {
  if (espace === "supervision") return peut(role, "acceder_supervision");
  if (espace === "accueil") return !peut(role, "acceder_supervision");

  const metier = METIER_DE[espace];
  return metier ? metiers.includes(metier) : true;
}
