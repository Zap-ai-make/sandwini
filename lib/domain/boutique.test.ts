import { describe, expect, it } from "vitest";
import {
  comparerBoutiques,
  estCodeValide,
  normaliserBoutique,
  normaliserCode,
  validerBoutique,
  type Boutique,
  type SaisieBoutique,
} from "./boutique";

const saisie = (partie: Partial<SaisieBoutique> = {}): SaisieBoutique => ({
  nom: "Pouytenga",
  code: "PTG",
  adresse: "Marché central",
  telephone: "70 00 00 00",
  ...partie,
});

describe("normaliserCode", () => {
  it("corrige ce qui n’est qu’une question de frappe", () => {
    expect(normaliserCode(" ptg ")).toBe("PTG");
    expect(normaliserCode("p t g")).toBe("PTG");
    expect(normaliserCode("péa")).toBe("PEA");
  });

  it("ne tronque pas un code trop long — il doit être refusé, pas raboté", () => {
    expect(normaliserCode("pouytenga")).toBe("POUYTENGA");
    expect(estCodeValide(normaliserCode("pouytenga"))).toBe(false);
  });
});

describe("estCodeValide", () => {
  it("accepte exactement trois lettres majuscules", () => {
    expect(estCodeValide("PTG")).toBe(true);
    expect(estCodeValide("KDG")).toBe(true);
  });

  it("refuse tout ce qui abîmerait un numéro de reçu", () => {
    for (const code of ["", "PT", "PTGA", "PT1", "PT-", "ptg", "PT G", "PTÉ"]) {
      expect(estCodeValide(code), code).toBe(false);
    }
  });
});

describe("validerBoutique", () => {
  it("accepte une saisie complète", () => {
    expect(validerBoutique(saisie())).toBeNull();
  });

  it("accepte une adresse et un téléphone vides — ils s’ajoutent plus tard", () => {
    expect(validerBoutique(saisie({ adresse: "", telephone: "" }))).toBeNull();
  });

  it("exige un nom", () => {
    expect(validerBoutique(saisie({ nom: "   " }))).toMatch(/nom/i);
  });

  it("exige un code utilisable dans un numéro de reçu", () => {
    expect(validerBoutique(saisie({ code: "" }))).toMatch(/code/i);
    expect(validerBoutique(saisie({ code: "PT" }))).toMatch(/3 lettres/);
    expect(validerBoutique(saisie({ code: "PT1" }))).toMatch(/3 lettres/);
  });

  it("refuse les textes trop longs plutôt que de les couper", () => {
    expect(validerBoutique(saisie({ nom: "n".repeat(81) }))).toMatch(/nom/i);
    expect(validerBoutique(saisie({ adresse: "a".repeat(201) }))).toMatch(/adresse/i);
    expect(validerBoutique(saisie({ telephone: "0".repeat(41) }))).toMatch(/téléphone/i);
  });
});

describe("normaliserBoutique", () => {
  it("met la saisie sous la forme exacte qui part en base", () => {
    expect(normaliserBoutique(saisie({ nom: "  Kaya  ", code: "kdg", adresse: " Rue 12 " })))
      .toEqual({ nom: "Kaya", code: "KDG", adresse: "Rue 12", telephone: "70 00 00 00" });
  });
});

describe("comparerBoutiques", () => {
  const boutique = (nom: string, actif: boolean): Boutique => ({
    id: nom.slice(0, 3).toUpperCase(),
    code: nom.slice(0, 3).toUpperCase(),
    nom,
    adresse: "",
    telephone: "",
    actif,
  });

  it("range les boutiques fermées après les ouvertes, puis par nom", () => {
    const liste = [
      boutique("Zorgho", true),
      boutique("Bobo", false),
      boutique("Kaya", true),
    ].sort(comparerBoutiques);
    expect(liste.map((b) => b.nom)).toEqual(["Kaya", "Zorgho", "Bobo"]);
  });
});
