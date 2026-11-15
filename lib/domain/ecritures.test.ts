import { describe, expect, it } from "vitest";
import { COUTS_PAR_ECRITURE, enTranches } from "./ecritures";

describe("enTranches", () => {
  it("découpe dans l’ordre, sans rien perdre ni dupliquer", () => {
    const elements = Array.from({ length: 45 }, (_, i) => i);
    const tranches = enTranches(elements, 20);
    expect(tranches.map((t) => t.length)).toEqual([20, 20, 5]);
    expect(tranches.flat()).toEqual(elements);
  });

  it("ne rend aucune tranche pour une liste vide", () => {
    expect(enTranches([], 20)).toEqual([]);
  });

  it("refuse une taille qui ne découperait rien", () => {
    expect(() => enTranches([1, 2], 0)).toThrow();
  });
});

describe("COUTS_PAR_ECRITURE", () => {
  /* Mesuré contre les règles le 15 novembre 2026 : 20 coûts dans un lot
     passent, 21 font tomber le lot entier. Chaque coût consulte sa moto une
     fois, et un lot d'écriture n'en tolère que 20. */
  it("ne dépasse pas les 20 consultations qu’un lot d’écriture tolère", () => {
    expect(COUTS_PAR_ECRITURE).toBeLessThanOrEqual(20);
    expect(COUTS_PAR_ECRITURE).toBeGreaterThan(0);
  });
});
