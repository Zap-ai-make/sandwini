import { describe, expect, it } from "vitest";
import {
  IDENTITE,
  IDENTITE_A_CONFIRMER,
  IDENTITE_PIECES,
  LIBELLE_IDENTITE,
  REGLAGES_DEFAUT,
  SEUIL_INACTIVITE_DEFAUT,
  SEUIL_INACTIVITE_MAX,
  SEUIL_INACTIVITE_MIN,
  validerReglages,
} from "./entreprise";

/**
 * L'identité est une constante depuis D71 : il n'y a plus de validation de
 * saisie à éprouver, puisqu'il n'y a plus de saisie. Ce qui reste à protéger,
 * c'est qu'elle soit **complète** — un reçu sans mention légale n'est pas
 * conforme, et le défaut ne se verrait qu'à l'impression.
 */
describe("l’identité de l’entreprise", () => {
  it("porte toutes ses mentions, aucune vide", () => {
    for (const [champ, valeur] of Object.entries(IDENTITE)) {
      const ecrit = typeof valeur === "string" ? valeur : valeur.join("");
      expect(ecrit.trim(), champ).not.toBe("");
    }
  });

  it("porte au moins un numéro joignable", () => {
    expect(IDENTITE.telephones.length).toBeGreaterThan(0);
    for (const numero of IDENTITE.telephones) {
      expect(numero.replace(/\D/g, "").length, numero).toBeGreaterThanOrEqual(8);
    }
  });

  it("nomme chacune de ses mentions, pour que l’écran puisse les lire", () => {
    for (const champ of Object.keys(IDENTITE)) {
      expect(LIBELLE_IDENTITE[champ as keyof typeof IDENTITE], champ).toBeTruthy();
    }
  });

  /* Ce test échouera le jour où quelqu'un ajoutera un champ « à confirmer » qui
     n'existe pas, ou renommera un champ sans toucher la liste — c'est-à-dire au
     moment où l'avertissement rouge de l'écran cesserait de désigner quoi que
     ce soit. */
  it("ne déclare à confirmer que des mentions qui existent", () => {
    for (const champ of IDENTITE_A_CONFIRMER) {
      expect(IDENTITE[champ], champ).toBeTruthy();
    }
  });
});

/* La boutique de pièces imprime sous le nom de Fatas (28 octobre 2026) : le
   reçu ne doit rien emprunter à Sandwidi, ni le nom, ni les numéros. */
describe("l’en-tête des reçus de pièces", () => {
  it("porte le nom, l’activité, les villes et les deux numéros de Fatas", () => {
    expect(IDENTITE_PIECES.enseigne).toBe("FATAS LE MANNEQUIN");
    expect(IDENTITE_PIECES.activite).toMatch(/pièces détachées de qualité de toute marque de motos/);
    expect(IDENTITE_PIECES.villes).toBe("Pouytenga / Ouagadougou");
    expect(IDENTITE_PIECES.telephones).toEqual(["70074641", "74157727"]);
  });

  it("n’a que des numéros à huit chiffres", () => {
    for (const numero of IDENTITE_PIECES.telephones) {
      expect(numero, numero).toMatch(/^\d{8}$/);
    }
  });

  it("ne reprend aucun numéro de Sandwidi", () => {
    for (const numero of IDENTITE_PIECES.telephones) {
      expect(IDENTITE.telephones, numero).not.toContain(numero);
    }
  });
});

describe("validerReglages", () => {
  it("accepte le défaut du cahier des charges", () => {
    expect(validerReglages(REGLAGES_DEFAUT)).toBeNull();
    expect(REGLAGES_DEFAUT.seuilInactiviteTranches).toBe(SEUIL_INACTIVITE_DEFAUT);
  });

  it("accepte les deux bornes", () => {
    expect(validerReglages({ seuilInactiviteTranches: SEUIL_INACTIVITE_MIN })).toBeNull();
    expect(validerReglages({ seuilInactiviteTranches: SEUIL_INACTIVITE_MAX })).toBeNull();
  });

  it("refuse en dessous, au-dessus, et ce qui n’est pas un nombre de jours", () => {
    for (const seuil of [
      SEUIL_INACTIVITE_MIN - 1,
      SEUIL_INACTIVITE_MAX + 1,
      0,
      -30,
      12.5,
      Number.NaN,
    ]) {
      expect(validerReglages({ seuilInactiviteTranches: seuil }), String(seuil)).toMatch(/jours/i);
    }
  });
});
