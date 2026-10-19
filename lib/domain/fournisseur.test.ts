import { describe, expect, it } from "vitest";
import {
  FOURNISSEUR_VIDE,
  LONGUEUR_LOCALITE_MAX,
  LONGUEUR_NOM_MAX,
  LONGUEUR_TELEPHONE_MAX,
  normaliserFournisseur,
  validerFournisseur,
  type SaisieFournisseur,
} from "./fournisseur";

const saisie = (partie: Partial<SaisieFournisseur> = {}): SaisieFournisseur => ({
  ...FOURNISSEUR_VIDE,
  nom: "HAOJUE Import",
  ...partie,
});

describe("validerFournisseur", () => {
  it("accepte un fournisseur qui n'a qu'un nom : téléphone et localité sont facultatifs", () => {
    expect(validerFournisseur(saisie({ telephone: "", localite: "" }))).toBeNull();
  });

  it("refuse un nom vide : un fournisseur sans nom ne se retrouve pas dans la liste", () => {
    expect(validerFournisseur(saisie({ nom: "  " }))).toMatch(/nom/i);
  });

  it("refuse un nom trop long", () => {
    expect(validerFournisseur(saisie({ nom: "x".repeat(LONGUEUR_NOM_MAX + 1) }))).toMatch(
      /dépasse/i,
    );
  });

  it("refuse un téléphone trop long", () => {
    expect(
      validerFournisseur(saisie({ telephone: "0".repeat(LONGUEUR_TELEPHONE_MAX + 1) })),
    ).toMatch(/téléphone/i);
  });

  it("refuse une localité trop longue", () => {
    expect(
      validerFournisseur(saisie({ localite: "x".repeat(LONGUEUR_LOCALITE_MAX + 1) })),
    ).toMatch(/localité/i);
  });
});

describe("normaliserFournisseur", () => {
  it("coupe les espaces autour de chaque champ", () => {
    expect(normaliserFournisseur(saisie({ nom: "  HAOJUE  ", telephone: " 70 12 ", localite: " Pouytenga " }))).toEqual({
      nom: "HAOJUE",
      telephone: "70 12",
      localite: "Pouytenga",
    });
  });
});
