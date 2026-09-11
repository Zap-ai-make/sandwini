import { describe, expect, it } from "vitest";
import {
  COLLECTIONS_REFERENTIEL,
  LIBELLE_COLLECTION,
  comparerReferentiels,
  nomDejaPris,
  optionsAvecChoix,
  reduire,
  trouverParNom,
  validerNom,
  type Referentiel,
} from "./referentiel";

const entree = (id: string, nom: string, actif = true): Referentiel => ({ id, nom, actif });

describe("validerNom", () => {
  it("accepte un nom ordinaire", () => {
    expect(validerNom("Yamaha", "marque")).toBeNull();
  });

  it("refuse un nom vide ou fait d’espaces", () => {
    expect(validerNom("", "marque")).toMatch(/nom/i);
    expect(validerNom("   ", "marque")).toMatch(/nom/i);
  });

  it("refuse un nom trop long plutôt que de le couper", () => {
    expect(validerNom("y".repeat(61), "marque")).toMatch(/60/);
  });
});

describe("reduire", () => {
  it("ignore la casse, les accents et les espaces de bord", () => {
    expect(reduire("  Yamaha ")).toBe("yamaha");
    expect(reduire("YAMAHA")).toBe("yamaha");
    expect(reduire("Réparé")).toBe("repare");
  });

  it("ne confond pas deux noms réellement différents", () => {
    expect(reduire("Yamaha")).not.toBe(reduire("Yamamoto"));
  });
});

describe("nomDejaPris", () => {
  const existants = [entree("1", "Yamaha"), entree("2", "TVS"), entree("3", "Apsonic", false)];

  it("attrape le doublon écrit autrement — sinon le stock se coupe en deux", () => {
    expect(nomDejaPris("yamaha", existants)).toBe(true);
    expect(nomDejaPris("  YAMAHA  ", existants)).toBe(true);
  });

  it("compte aussi les entrées désactivées : leur nom reste pris", () => {
    expect(nomDejaPris("apsonic", existants)).toBe(true);
  });

  it("laisse passer un nom neuf", () => {
    expect(nomDejaPris("Sanili", existants)).toBe(false);
  });

  it("ne se signale pas à soi-même quand on renomme", () => {
    expect(nomDejaPris("Yamaha", existants, "1")).toBe(false);
  });
});

describe("comparerReferentiels", () => {
  it("range les entrées désactivées après les actives, puis par nom", () => {
    const liste = [
      entree("1", "Zongshen"),
      entree("2", "Apsonic", false),
      entree("3", "Haojue"),
    ].sort(comparerReferentiels);
    expect(liste.map((e) => e.nom)).toEqual(["Haojue", "Zongshen", "Apsonic"]);
  });
});

describe("trouverParNom — ce qui remplace le référentiel fermé (S39)", () => {
  const liste = [entree("1", "Yamaha"), entree("2", "Apsonic", false)];

  it("rend l’entrée existante quelle que soit la casse ou les accents", () => {
    expect(trouverParNom("  YAMAHA ", liste)?.id).toBe("1");
  });

  it("rend aussi une entrée désactivée — la retaper, c’est la vouloir", () => {
    expect(trouverParNom("apsonic", liste)?.id).toBe("2");
  });

  it("ne rend rien pour un nom neuf ou vide", () => {
    expect(trouverParNom("Sanili", liste)).toBeUndefined();
    expect(trouverParNom("   ", liste)).toBeUndefined();
  });
});

describe("optionsAvecChoix", () => {
  const liste = [entree("1", "Yamaha"), entree("2", "Apsonic", false), entree("3", "Haojue")];

  it("ne propose que les actives quand rien n’est choisi", () => {
    expect(optionsAvecChoix(liste, "").map((e) => e.id)).toEqual(["1", "3"]);
  });

  it("garde la valeur choisie même désactivée, sinon le champ l’efface en silence", () => {
    expect(optionsAvecChoix(liste, "2").map((e) => e.id)).toEqual(["2", "1", "3"]);
  });

  it("ne duplique pas une valeur choisie qui est déjà active", () => {
    expect(optionsAvecChoix(liste, "1").map((e) => e.id)).toEqual(["1", "3"]);
  });

  it("ignore une valeur choisie qui n’existe plus du tout", () => {
    expect(optionsAvecChoix(liste, "disparue").map((e) => e.id)).toEqual(["1", "3"]);
  });
});

describe("libellés", () => {
  it("nomme chaque collection, sans laisser de trou", () => {
    for (const collection of COLLECTIONS_REFERENTIEL) {
      expect(LIBELLE_COLLECTION[collection].singulier).toBeTruthy();
      expect(LIBELLE_COLLECTION[collection].pluriel).toBeTruthy();
    }
  });
});
