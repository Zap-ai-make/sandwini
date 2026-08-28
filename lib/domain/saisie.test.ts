import { describe, expect, it } from "vitest";
import { LIGNES_MAX, ecrireLignes, ligneTropLongue, lireLignes } from "./saisie";

describe("saisie libre, une valeur par ligne", () => {
  it("découpe, élague et jette les lignes vides", () => {
    expect(lireLignes("  Casque \n\n Plaque provisoire  \n")).toEqual([
      "Casque",
      "Plaque provisoire",
    ]);
  });

  it("borne le nombre de lignes plutôt que d’écrire un document que le serveur refusera", () => {
    const trop = Array.from({ length: LIGNES_MAX + 5 }, (_, index) => `objet ${index}`).join("\n");
    expect(lireLignes(trop)).toHaveLength(LIGNES_MAX);
  });

  it("fait l’aller-retour sans rien perdre", () => {
    const lignes = ["Casque", "Bidon d’huile"];
    expect(lireLignes(ecrireLignes(lignes))).toEqual(lignes);
  });

  it("nomme la ligne trop longue au lieu de la tronquer en silence", () => {
    expect(ligneTropLongue(["court", "x".repeat(200)])).toBe("x".repeat(200));
    expect(ligneTropLongue(["court", "aussi court"])).toBeUndefined();
  });
});
