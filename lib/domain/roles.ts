/**
 * Rôles et périmètres.
 *
 * Deux rôles seulement, et c’est voulu : le cahier des charges n’en décrit pas
 * d’autres (§4). Les accès des clients et des prestataires ne passent pas par
 * un rôle mais par un lien à jeton, servi côté serveur — ils n’ont pas de
 * compte, donc pas de rôle.
 */

export const ROLES = ["responsable", "gerant"] as const;
export type Role = (typeof ROLES)[number];

export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === "string" && (ROLES as readonly string[]).includes(valeur);
}

export const LIBELLE_ROLE: Record<Role, string> = {
  responsable: "Responsable",
  gerant: "Gérant",
};

/**
 * Ce que le rôle autorise dans l’interface.
 *
 * Fonction pure et testée, utilisée par les écrans **et** par les gardes de
 * navigation, pour qu’il n’existe qu’une seule réponse à « a-t-il le droit ? ».
 *
 * Elle ne protège rien à elle seule : elle décide de ce qu’on affiche. La
 * protection réelle vit dans les règles Firestore et dans les Cloud Functions,
 * qui revérifient le même rôle côté serveur (cf. `DECISIONS.md` D27).
 */
export type Capacite =
  | "acceder_supervision"
  | "gerer_utilisateurs"
  | "gerer_boutiques"
  | "gerer_referentiels"
  /**
   * Tenir le catalogue des pièces détachées : créer une référence, fixer ses
   * deux prix, la désactiver.
   *
   * **La seule capacité que le gérant partage avec le responsable**, et elle
   * vient d'une décision du commanditaire : pour les pièces, « le responsable
   * ne fera que superviser, rien d'autre ». Le catalogue des pièces appartient
   * donc à la boutique qui le vend, à l'inverse des marques et des modèles de
   * motos, qui restent sous `gerer_referentiels`.
   */
  | "gerer_pieces"
  | "voir_marges"
  | "voir_toutes_boutiques"
  | "corriger_versement";

const CAPACITES: Record<Role, readonly Capacite[]> = {
  responsable: [
    "acceder_supervision",
    "gerer_utilisateurs",
    "gerer_boutiques",
    "gerer_referentiels",
    "gerer_pieces",
    "voir_marges",
    "voir_toutes_boutiques",
    "corriger_versement",
  ],
  /* Le responsable la garde aussi : il ne s'en sert pas au quotidien, mais lui
     fermer l'écriture rouvrirait le trou que S55 a trouvé sur les dépenses —
     un responsable travaillant dans une de ses boutiques ne pouvait rien
     écrire, et le geste devenait intraçable. Le partage du travail est porté
     par les écrans, pas par une interdiction. */
  gerant: ["gerer_pieces"],
};

export function peut(role: Role, capacite: Capacite): boolean {
  return CAPACITES[role].includes(capacite);
}
