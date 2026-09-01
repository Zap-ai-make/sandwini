import { describe, expect, it } from "vitest";
import { accedeEspace, accueilDuRole, espacesVisibles } from "./espaces";

describe("espacesVisibles — le gérant", () => {
  it("ne voit que l’espace du métier de sa boutique", () => {
    expect(espacesVisibles("gerant", ["motos"])).toEqual([
      "accueil",
      "motos",
      "caisse",
      "reglages",
    ]);
    expect(espacesVisibles("gerant", ["pieces"])).toEqual([
      "accueil",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });

  it("voit les deux espaces si sa boutique tient les deux métiers", () => {
    expect(espacesVisibles("gerant", ["motos", "pieces"])).toEqual([
      "accueil",
      "motos",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });

  it("n’a jamais accès à la supervision", () => {
    expect(espacesVisibles("gerant", ["motos", "pieces"])).not.toContain("supervision");
    expect(accedeEspace("gerant", ["motos", "pieces"], "supervision")).toBe(false);
  });
});

describe("espacesVisibles — le responsable", () => {
  it("ouvre sur la supervision plutôt que sur l’accueil du gérant", () => {
    const espaces = espacesVisibles("responsable", ["motos", "pieces"]);
    expect(espaces[0]).toBe("supervision");
    expect(espaces).not.toContain("accueil");
  });

  it("voit les deux espaces métier quand le périmètre est l’entreprise entière", () => {
    expect(espacesVisibles("responsable", ["motos", "pieces"])).toEqual([
      "supervision",
      "motos",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });

  it("se restreint au métier de la boutique qu’il a choisie", () => {
    expect(espacesVisibles("responsable", ["pieces"])).toEqual([
      "supervision",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });
});

describe("espacesVisibles — périmètre sans métier", () => {
  /* Pendant le chargement du périmètre, et tant qu’aucune boutique n’existe, on
     ne rend que les espaces dont la réponse est certaine : une entrée qui
     disparaît sous le doigt est pire qu’une barre qui s’allonge. */
  it("ne rend que ce qui ne dépend d’aucune boutique", () => {
    expect(espacesVisibles("gerant", [])).toEqual(["accueil", "caisse", "reglages"]);
    expect(espacesVisibles("responsable", [])).toEqual(["supervision", "caisse", "reglages"]);
  });
});

describe("accedeEspace", () => {
  it("refuse l’espace d’un métier que le périmètre ne porte pas", () => {
    expect(accedeEspace("gerant", ["motos"], "pieces")).toBe(false);
    expect(accedeEspace("responsable", ["motos"], "pieces")).toBe(false);
  });

  it("laisse passer la caisse et les réglages quel que soit le métier", () => {
    for (const role of ["responsable", "gerant"] as const) {
      expect(accedeEspace(role, [], "caisse")).toBe(true);
      expect(accedeEspace(role, [], "reglages")).toBe(true);
    }
  });
});

describe("accueilDuRole", () => {
  it("envoie le responsable à la supervision et le gérant à son accueil", () => {
    expect(accueilDuRole("responsable")).toBe("/supervision");
    expect(accueilDuRole("gerant")).toBe("/dashboard");
  });
});
