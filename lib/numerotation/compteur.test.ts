import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { oublierCompteurs, prochainNumero, reserverNumero } from "./compteur";

/** Un `localStorage` de laboratoire : le module va y écrire pour de vrai. */
function stockageFactice(): Storage {
  const contenu = new Map<string, string>();
  return {
    get length() {
      return contenu.size;
    },
    key: (index: number) => [...contenu.keys()][index] ?? null,
    getItem: (cle: string) => contenu.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => void contenu.set(cle, valeur),
    removeItem: (cle: string) => void contenu.delete(cle),
    clear: () => contenu.clear(),
  } as Storage;
}

const PTG = { boutiqueId: "PTG", code: "PTG" };
const KDG = { boutiqueId: "KDG", code: "KDG" };
const AOUT = new Date(2026, 7, 25, 10, 0);
const SEPTEMBRE = new Date(2026, 8, 1, 8, 0);

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: stockageFactice(),
    configurable: true,
    writable: true,
  });
  oublierCompteurs();
});

afterEach(() => {
  oublierCompteurs();
});

describe("un appareil neuf", () => {
  it("commence à 1 dans une boutique sans historique", () => {
    expect(prochainNumero(PTG, [], AOUT)).toBe("PTG-2608-0001");
  });

  it("reprend au-dessus de ce que le cache lui apprend", () => {
    expect(prochainNumero(PTG, ["PTG-2608-0041"], AOUT)).toBe("PTG-2608-0042");
  });
});

describe("réserver", () => {
  it("ne rend jamais deux fois le même numéro, même sans rien apprendre du serveur", () => {
    expect(reserverNumero(PTG, [], AOUT)).toBe("PTG-2608-0001");
    expect(reserverNumero(PTG, [], AOUT)).toBe("PTG-2608-0002");
    expect(reserverNumero(PTG, [], AOUT)).toBe("PTG-2608-0003");
  });

  it("ne recule pas quand le cache est en retard sur l’appareil", () => {
    reserverNumero(PTG, [], AOUT);
    reserverNumero(PTG, [], AOUT);
    // Le serveur n’a encore vu aucune de ces deux ventes.
    expect(prochainNumero(PTG, [], AOUT)).toBe("PTG-2608-0003");
  });

  it("saute en avant quand le cache est en avance sur l’appareil", () => {
    reserverNumero(PTG, [], AOUT);
    // Un autre appareil a travaillé et la synchronisation est revenue.
    expect(reserverNumero(PTG, ["PTG-2608-0050"], AOUT)).toBe("PTG-2608-0051");
    expect(prochainNumero(PTG, [], AOUT)).toBe("PTG-2608-0052");
  });

  it("montrer un numéro ne le consomme pas", () => {
    expect(prochainNumero(PTG, [], AOUT)).toBe("PTG-2608-0001");
    expect(prochainNumero(PTG, [], AOUT)).toBe("PTG-2608-0001");
    expect(reserverNumero(PTG, [], AOUT)).toBe("PTG-2608-0001");
  });
});

describe("cloisonnement", () => {
  it("chaque boutique a son compteur", () => {
    reserverNumero(PTG, [], AOUT);
    reserverNumero(PTG, [], AOUT);
    expect(reserverNumero(KDG, [], AOUT)).toBe("KDG-2608-0001");
    expect(reserverNumero(PTG, [], AOUT)).toBe("PTG-2608-0003");
  });

  it("chaque mois repart à 1", () => {
    reserverNumero(PTG, [], AOUT);
    reserverNumero(PTG, [], AOUT);
    expect(reserverNumero(PTG, [], SEPTEMBRE)).toBe("PTG-2609-0001");
  });

  it("revenir sur un mois passé reprend son compteur là où il était", () => {
    reserverNumero(PTG, [], AOUT);
    reserverNumero(PTG, [], SEPTEMBRE);
    expect(reserverNumero(PTG, [], AOUT)).toBe("PTG-2608-0002");
  });
});

describe("stockage indisponible", () => {
  it("numérote quand même, en mémoire vive", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(reserverNumero(PTG, [], AOUT)).toBe("PTG-2608-0001");
    expect(reserverNumero(PTG, [], AOUT)).toBe("PTG-2608-0002");
  });
});
