import { describe, expect, it } from "vitest";
import {
  analyserNumero,
  estNumeroValide,
  formaterNumero,
  periodeDe,
  prochainCompteur,
} from "./numerotation";

describe("periodeDe", () => {
  it("écrit l’année sur deux chiffres et le mois sur deux", () => {
    expect(periodeDe(new Date(2026, 7, 25))).toBe("2608");
    expect(periodeDe(new Date(2026, 0, 1))).toBe("2601");
    expect(periodeDe(new Date(2030, 11, 31))).toBe("3012");
  });

  it("suit l’heure locale, pas UTC — le mois change à minuit au comptoir", () => {
    // 31 août 23 h à Ouagadougou (UTC+0) reste août.
    expect(periodeDe(new Date(2026, 7, 31, 23, 30))).toBe("2608");
  });
});

describe("formaterNumero", () => {
  it("compose le numéro du cahier des charges", () => {
    expect(formaterNumero("PTG", "2608", 42)).toBe("PTG-2608-0042");
  });

  it("s’allonge plutôt que de reboucler au-delà de 9999", () => {
    expect(formaterNumero("PTG", "2608", 10000)).toBe("PTG-2608-10000");
  });

});

describe("analyserNumero", () => {
  it("relit ce que formaterNumero a écrit", () => {
    expect(analyserNumero("PTG-2608-0042")).toEqual({
      code: "PTG",
      periode: "2608",
      compteur: 42,
      rang: 0,
    });
    expect(analyserNumero("KDG-2601-0007-C")).toEqual({
      code: "KDG",
      periode: "2601",
      compteur: 7,
      rang: 2,
    });
  });

  it("refuse ce qui n’est pas un numéro", () => {
    for (const faux of ["", "PTG-2608", "ptg-2608-0042", "PT-2608-0042", "PTG-2608-42", "PTG-2608-0042-"]) {
      expect(analyserNumero(faux), faux).toBeNull();
    }
  });

  it("refuse le suffixe -A : l’original n’en porte pas", () => {
    expect(analyserNumero("PTG-2608-0042-A")).toBeNull();
    expect(estNumeroValide("PTG-2608-0042")).toBe(true);
  });
});

describe("prochainCompteur", () => {
  it("part à 1 quand le mois est vierge", () => {
    expect(prochainCompteur([], "PTG", "2608")).toBe(1);
  });

  it("reprend au-dessus du plus haut numéro connu", () => {
    const connus = ["PTG-2608-0001", "PTG-2608-0042", "PTG-2608-0007"];
    expect(prochainCompteur(connus, "PTG", "2608")).toBe(43);
  });

  it("ignore les autres boutiques et les autres mois", () => {
    const connus = ["KDG-2608-0900", "PTG-2607-0800", "PTG-2608-0003"];
    expect(prochainCompteur(connus, "PTG", "2608")).toBe(4);
  });

  it("ne compte pas un suffixe pour un rang de plus", () => {
    expect(prochainCompteur(["PTG-2608-0042-B"], "PTG", "2608")).toBe(43);
  });

  it("laisse passer ce qu’il ne sait pas lire plutôt que de refuser de compter", () => {
    expect(prochainCompteur(["n’importe quoi", "PTG-2608-0005"], "PTG", "2608")).toBe(6);
  });
});
