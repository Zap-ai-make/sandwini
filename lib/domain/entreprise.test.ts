import { describe, expect, it } from "vitest";
import {
  ENTREPRISE_VIDE,
  LOGO_OCTETS_MAX,
  SEUIL_INACTIVITE_DEFAUT,
  SEUIL_INACTIVITE_MAX,
  SEUIL_INACTIVITE_MIN,
  entrepriseComplete,
  estLogoValide,
  normaliserEntreprise,
  validerEntreprise,
  type Entreprise,
} from "./entreprise";

const entreprise = (partie: Partial<Entreprise> = {}): Entreprise => ({
  ...ENTREPRISE_VIDE,
  nom: "Sandwidi et frère",
  adresse: "Pouytenga, marché central",
  telephone: "70 00 00 00",
  ...partie,
});

const logo = (octets: number) =>
  `data:image/png;base64,${"A".repeat(Math.max(0, octets - "data:image/png;base64,".length))}`;

describe("validerEntreprise", () => {
  it("accepte une fiche renseignée", () => {
    expect(validerEntreprise(entreprise())).toBeNull();
  });

  it("exige le nom — c’est lui qui s’imprime en haut du reçu", () => {
    expect(validerEntreprise(entreprise({ nom: "   " }))).toMatch(/nom/i);
  });

  it("accepte une fiche encore incomplète pour tout le reste", () => {
    expect(validerEntreprise(entreprise({ adresse: "", telephone: "", identifiant: "" }))).toBeNull();
  });

  it("refuse les textes trop longs plutôt que de les couper", () => {
    expect(validerEntreprise(entreprise({ nom: "n".repeat(81) }))).toMatch(/nom/i);
    expect(validerEntreprise(entreprise({ adresse: "a".repeat(201) }))).toMatch(/adresse/i);
    expect(validerEntreprise(entreprise({ telephone2: "0".repeat(41) }))).toMatch(/téléphone/i);
    expect(validerEntreprise(entreprise({ identifiant: "x".repeat(41) }))).toMatch(/identification/i);
  });
});

describe("logo", () => {
  it("reconnaît les trois formats que le navigateur sait réduire", () => {
    for (const type of ["png", "jpeg", "webp"]) {
      expect(estLogoValide(`data:image/${type};base64,AAAA`), type).toBe(true);
    }
  });

  it("refuse ce qui n’est pas une image encodée", () => {
    for (const valeur of [
      "https://exemple.test/logo.png",
      "data:text/html;base64,AAAA",
      "data:image/svg+xml;base64,AAAA",
      "AAAA",
      "",
    ]) {
      expect(estLogoValide(valeur), valeur).toBe(false);
    }
  });

  it("accepte un logo sous la limite", () => {
    expect(validerEntreprise(entreprise({ logo: logo(LOGO_OCTETS_MAX - 100) }))).toBeNull();
  });

  it("refuse un logo qui ferait grossir le document au-delà du raisonnable", () => {
    expect(validerEntreprise(entreprise({ logo: logo(LOGO_OCTETS_MAX + 1) }))).toMatch(/trop lourd/);
  });

  it("accepte l’absence de logo — toutes les entreprises n’en ont pas", () => {
    expect(validerEntreprise(entreprise({ logo: null }))).toBeNull();
  });
});

describe("normaliserEntreprise", () => {
  it("met la saisie sous la forme exacte qui part en base", () => {
    expect(
      normaliserEntreprise(entreprise({ nom: "  Sandwidi  ", telephone: " 70 11 22 33 " })),
    ).toMatchObject({ nom: "Sandwidi", telephone: "70 11 22 33" });
  });
});

describe("entrepriseComplete", () => {
  it("demande au moins un nom et un téléphone pour qu’un reçu soit présentable", () => {
    expect(entrepriseComplete(entreprise())).toBe(true);
    expect(entrepriseComplete(entreprise({ telephone: "" }))).toBe(false);
    expect(entrepriseComplete(ENTREPRISE_VIDE)).toBe(false);
  });
});

describe("seuil d’inactivité des tranches", () => {
  it("vaut trente jours par défaut, comme le cahier des charges", () => {
    expect(ENTREPRISE_VIDE.seuilInactiviteTranches).toBe(SEUIL_INACTIVITE_DEFAUT);
  });

  it("accepte les bornes", () => {
    for (const seuil of [SEUIL_INACTIVITE_MIN, 30, SEUIL_INACTIVITE_MAX]) {
      expect(validerEntreprise(entreprise({ seuilInactiviteTranches: seuil }))).toBeNull();
    }
  });

  it("refuse hors bornes, ou pas un entier de jours", () => {
    for (const seuil of [0, -1, 366, 15.5, Number.NaN]) {
      expect(validerEntreprise(entreprise({ seuilInactiviteTranches: seuil }))).toMatch(/seuil/i);
    }
  });
});
