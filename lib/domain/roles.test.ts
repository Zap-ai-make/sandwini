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
  const capacites: Capacite[] = [
    "gerer_utilisateurs",
    "gerer_boutiques",
    "gerer_referentiels",
    "voir_marges",
    "voir_toutes_boutiques",
    "corriger_versement",
  ];

  it("donne toutes les capacités au responsable", () => {
    for (const capacite of capacites) {
      expect(peut("responsable", capacite), capacite).toBe(true);
    }
  });

  it("n’en donne aucune au gérant — il vend, il n’administre pas", () => {
    for (const capacite of capacites) {
      expect(peut("gerant", capacite), capacite).toBe(false);
    }
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
