import { describe, expect, it } from "vitest";
import { estRole, LIBELLE_ROLE, peut, ROLES, type Capacite } from "./roles";

describe("estRole", () => {
  it("reconnaît les deux rôles du cahier des charges", () => {
    expect(estRole("responsable")).toBe(true);
    expect(estRole("gerant")).toBe(true);
  });

  it("refuse tout le reste — un claim absent ou falsifié n’ouvre aucun droit", () => {
    for (const valeur of [undefined, null, "", "admin", "GERANT", 1, {}, ["gerant"]]) {
      expect(estRole(valeur)).toBe(false);
    }
  });
});

describe("peut", () => {
  /**
   * Les capacités d'administration, celles qu'un gérant n'a jamais.
   *
   * `gerer_pieces` n'en fait **pas** partie, et c'est le seul droit qu'un
   * gérant porte : le commanditaire a tranché que pour les pièces détachées,
   * « le responsable ne fera que superviser, rien d'autre — donc tout est fait
   * par le gérant ». Tenir son catalogue n'est donc pas administrer, c'est son
   * métier.
   */
  const administratives: Capacite[] = [
    "gerer_utilisateurs",
    "gerer_boutiques",
    "gerer_referentiels",
    "voir_marges",
    "voir_toutes_boutiques",
    "corriger_versement",
  ];

  it("donne toutes les capacités au responsable", () => {
    for (const capacite of [...administratives, "gerer_pieces" as Capacite]) {
      expect(peut("responsable", capacite), capacite).toBe(true);
    }
  });

  it("n’en donne aucune d’administration au gérant — il vend, il n’administre pas", () => {
    for (const capacite of administratives) {
      expect(peut("gerant", capacite), capacite).toBe(false);
    }
  });

  it("donne au gérant la tenue du catalogue de pièces, qui est son métier", () => {
    /* Sans ce droit, l'écran « Nouvelle référence » lui reste fermé par
       `GardeCapacite`, et l'espace pièces n'a plus personne pour le remplir —
       le responsable ne faisant que regarder. */
    expect(peut("gerant", "gerer_pieces")).toBe(true);
  });

  it("refuse en particulier les trois capacités qui exposeraient de l’argent ou des droits", () => {
    expect(peut("gerant", "voir_marges")).toBe(false);
    expect(peut("gerant", "gerer_utilisateurs")).toBe(false);
    expect(peut("gerant", "corriger_versement")).toBe(false);
  });
});

describe("libellés", () => {
  it("nomme chaque rôle en français, sans laisser de trou", () => {
    for (const role of ROLES) {
      expect(LIBELLE_ROLE[role]).toBeTruthy();
    }
  });
});
