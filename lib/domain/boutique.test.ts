import { describe, expect, it } from "vitest";
import {
  comparerBoutiques,
  LIBELLE_METIER,
  METIERS,
  estCodeValide,
  normaliserBoutique,
  normaliserCode,
  normaliserMetiers,
  nomDeBoutique,
  reunirMetiers,
  validerBoutique,
  type Boutique,
  type SaisieBoutique,
  engendrerCode,
} from "./boutique";

const saisie = (partie: Partial<SaisieBoutique> = {}): SaisieBoutique => ({
  nom: "Pouytenga",
  code: "PTG",
  metiers: ["motos"],
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

  it("ne réclame plus de code : il se déduit du nom", () => {
    /* Le champ a disparu du formulaire le 23 octobre 2026. Ce qui le
       remplaçait — trois lettres tapées à la main — n'avait de sens que pour la
       machine, et `engendrerCode` ne rend qu'une forme que la base accepte. */
    expect(validerBoutique(saisie({ code: "" }))).toBeNull();
  });

  it("exige au moins un métier — sans quoi la boutique n’ouvre aucun espace", () => {
    expect(validerBoutique(saisie({ metiers: [] }))).toMatch(/vend/i);
  });

  it("refuse les textes trop longs plutôt que de les couper", () => {
    expect(validerBoutique(saisie({ nom: "n".repeat(81) }))).toMatch(/nom/i);
    expect(validerBoutique(saisie({ adresse: "a".repeat(201) }))).toMatch(/adresse/i);
    expect(validerBoutique(saisie({ telephone: "0".repeat(41) }))).toMatch(/téléphone/i);
  });
});

describe("normaliserBoutique", () => {
  it("met la saisie sous la forme exacte qui part en base", () => {
    expect(
      normaliserBoutique(
        saisie({ nom: "  Kaya  ", code: "kdg", metiers: ["pieces", "motos"], adresse: " Rue 12 " }),
      ),
    ).toEqual({
      nom: "Kaya",
      code: "KDG",
      metiers: ["motos", "pieces"],
      adresse: "Rue 12",
      telephone: "70 00 00 00",
    });
  });
});

describe("normaliserMetiers", () => {
  it("range dans l’ordre de déclaration, pas dans l’ordre de clic", () => {
    expect(normaliserMetiers(["pieces", "motos"])).toEqual(["motos", "pieces"]);
  });

  it("retire les doublons et ce qui n’est pas un métier", () => {
    expect(normaliserMetiers(["motos", "motos"])).toEqual(["motos"]);
    expect(normaliserMetiers(["carburant", 3, null])).toEqual([]);
  });
});

describe("comparerBoutiques", () => {
  const boutique = (nom: string, actif: boolean): Boutique => ({
    id: nom.slice(0, 3).toUpperCase(),
    code: nom.slice(0, 3).toUpperCase(),
    nom,
    metiers: ["motos"],
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

describe("nomDeBoutique", () => {
  const boutiques: Boutique[] = [
    { id: "SGG", code: "SGG", nom: "Saidou Ghana (gare routière)", metiers: ["motos"], adresse: "", telephone: "", actif: true },
    { id: "PTG", code: "PTG", nom: "Pouytenga", metiers: ["pieces"], adresse: "", telephone: "", actif: false },
  ];

  it("rend le nom de la boutique, fermée comprise", () => {
    expect(nomDeBoutique(boutiques, "SGG")).toBe("Saidou Ghana (gare routière)");
    expect(nomDeBoutique(boutiques, "PTG")).toBe("Pouytenga");
  });

  it("rend l’identifiant quand la boutique n’est pas connue, plutôt qu’un vide", () => {
    expect(nomDeBoutique(boutiques, "KDG")).toBe("KDG");
  });
});

describe("reunirMetiers", () => {
  const boutique = (code: string, metiers: Boutique["metiers"]): Boutique => ({
    id: code,
    code,
    nom: code,
    metiers,
    adresse: "",
    telephone: "",
    actif: true,
  });

  it("réunit les métiers de plusieurs boutiques, sans doublon et dans l’ordre", () => {
    expect(reunirMetiers([boutique("PTG", ["motos"]), boutique("KDG", ["pieces"])])).toEqual([
      "motos",
      "pieces",
    ]);
  });

  it("ne rend rien quand il n’y a aucune boutique", () => {
    expect(reunirMetiers([])).toEqual([]);
  });
});

/**
 * Le troisième métier (S59, demande du client du 21 octobre 2026).
 *
 * « Le client veut que prestataire soit comme une boutique au même titre que
 * moto et pièce, et que ça se déroule au niveau de la plaque jaune. » Les
 * cartes grises sont traitées par une personne qui ne fait que ça : elle a
 * besoin d'un endroit à elle, choisi comme une boutique.
 *
 * **Un métier, et non un troisième rôle.** Le produit en a deux, et c'est
 * délibéré (`prompt.md` §4). L'axe des métiers décide déjà de ce qu'un compte
 * voit (D62) ; s'y brancher évite d'inventer une garde parallèle.
 */
describe("le métier des cartes grises", () => {
  it("existe et porte le nom que le client emploie", () => {
    expect(METIERS).toContain("cartes_grises");
    expect(LIBELLE_METIER.cartes_grises).toBe("Carte grise et plaque");
  });

  it("se déclare sur une boutique comme les deux autres", () => {
    expect(validerBoutique(saisie({ metiers: ["cartes_grises"] }))).toBeNull();
  });

  it("garde l’ordre de déclaration, quel que soit l’ordre de clic", () => {
    /* Deux boutiques aux mêmes métiers doivent porter le même tableau en base,
       sinon les comparer demande de les trier d'abord. */
    expect(normaliserMetiers(["cartes_grises", "motos"])).toEqual(["motos", "cartes_grises"]);
  });
});

/**
 * Le code n’est plus tapé : il se déduit du nom (23 octobre 2026).
 *
 * **Demande du commanditaire.** On lui demandait trois lettres dont il n'a que
 * faire : elles n'existent que pour la numérotation des reçus et pour servir
 * d'identifiant de document. Un champ qu'on ne comprend pas se remplit au
 * hasard, et ce hasard-là se retrouve ensuite sur chaque reçu imprimé.
 *
 * **Il reste exactement aussi contraint qu'avant** — trois lettres, unique,
 * définitif. Seule la saisie disparaît.
 */
describe("engendrerCode", () => {
  it("prend les trois premières lettres du nom", () => {
    expect(engendrerCode("Pouytenga", new Set())).toBe("POU");
    expect(engendrerCode("Koudougou", new Set())).toBe("KOU");
  });

  it("ignore accents, espaces et ponctuation", () => {
    expect(engendrerCode("  élaba-zon ", new Set())).toBe("ELA");
    expect(engendrerCode("Carte grise et plaque", new Set())).toBe("CAR");
  });

  it("évite un code déjà pris en avançant dans le nom", () => {
    /* Deux boutiques qui commencent pareil sont le cas ordinaire : « Pouytenga
       centre » et « Pouytenga marché ». */
    expect(engendrerCode("Pouytenga", new Set(["POU"]))).toBe("POY");
    expect(engendrerCode("Pouytenga", new Set(["POU", "POY"]))).toBe("POT");
  });

  it("finit par parcourir l’alphabet quand le nom est épuisé", () => {
    /* « Po » n'a pas de troisième lettre : elle est complétée par la première,
       ce qui donne POP. L'alphabet ne prend le relais qu'ensuite. */
    expect(engendrerCode("Po", new Set())).toBe("POP");
    expect(engendrerCode("Po", new Set(["POP", "POA", "POB"]))).toBe("POC");
  });

  it("complète un nom trop court", () => {
    /* Un nom d'une lettre reste un nom : il ne doit pas empêcher d'ouvrir une
       boutique. */
    expect(engendrerCode("A", new Set())).toBe("AAA");
  });

  it("rend null quand le nom ne porte aucune lettre", () => {
    /* `validerBoutique` refuse déjà un nom vide ; ceci couvre un nom fait de
       chiffres seuls, où il n'y a rien à dériver. */
    expect(engendrerCode("2024", new Set())).toBeNull();
  });

  it("rend toujours un code que la base accepte", () => {
    for (const nom of ["Pouytenga", "élaba", "A", "Zorgho Nord"]) {
      const code = engendrerCode(nom, new Set());
      expect(code).not.toBeNull();
      expect(estCodeValide(code as string)).toBe(true);
    }
  });
});
