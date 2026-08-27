import { describe, expect, it } from "vitest";
import { analyserNumero } from "../../lib/domain/numerotation";
import { resoudreCollision, suffixeDeRang, type PieceNumerotee } from "./numerotation";

const piece = (id: string, recueA: number, numeroInitial = "PTG-2608-0042"): PieceNumerotee => ({
  id,
  numeroInitial,
  recueA,
});

describe("suffixeDeRang", () => {
  it("laisse l’original sans suffixe", () => {
    expect(suffixeDeRang(0)).toBe("");
  });

  it("commence à B, comme l’écrit le cahier des charges", () => {
    expect(suffixeDeRang(1)).toBe("-B");
    expect(suffixeDeRang(2)).toBe("-C");
    expect(suffixeDeRang(25)).toBe("-Z");
  });

  it("continue au-delà de Z plutôt que de s’arrêter", () => {
    expect(suffixeDeRang(26)).toBe("-AA");
    expect(suffixeDeRang(27)).toBe("-AB");
    expect(suffixeDeRang(51)).toBe("-AZ");
    expect(suffixeDeRang(52)).toBe("-BA");
  });

  it("ne rend jamais deux fois le même suffixe", () => {
    const vus = new Set<string>();
    for (let rang = 1; rang <= 200; rang += 1) vus.add(suffixeDeRang(rang));
    expect(vus.size).toBe(200);
  });
});

/**
 * Le seul point de contact entre les deux moitiés du mécanisme.
 *
 * Le serveur fabrique les suffixes, le client les relit, et les deux
 * n’échangent pas une ligne de code. Ce test est ce qui les tient d’accord : le
 * jour où l’alphabet change d’un côté, il tombe.
 */
describe("aller-retour avec la lecture côté client", () => {
  it("tout suffixe produit ici est relu là-bas, au bon rang", () => {
    for (let rang = 1; rang <= 200; rang += 1) {
      const numero = `PTG-2608-0042${suffixeDeRang(rang)}`;
      expect(analyserNumero(numero), numero).toEqual({
        code: "PTG",
        periode: "2608",
        compteur: 42,
        rang,
      });
    }
  });
});

describe("resoudreCollision", () => {
  it("ne touche à rien quand la pièce est seule — le cas de tous les jours", () => {
    const seule = piece("a", 1000);
    expect(resoudreCollision(seule, [seule])).toBeNull();
  });

  it("laisse son numéro à la première arrivée au serveur", () => {
    const premiere = piece("a", 1000);
    const seconde = piece("b", 2000);
    expect(resoudreCollision(premiere, [premiere, seconde])).toBeNull();
  });

  it("suffixe celle qui arrive après", () => {
    const premiere = piece("a", 1000);
    const seconde = piece("b", 2000);
    expect(resoudreCollision(seconde, [premiere, seconde])).toBe("PTG-2608-0042-B");
  });

  it("donne le même verdict quel que soit l’ordre de lecture", () => {
    const premiere = piece("a", 1000);
    const seconde = piece("b", 2000);
    const troisieme = piece("c", 3000);
    const toutes = [troisieme, premiere, seconde];
    expect(resoudreCollision(premiere, toutes)).toBeNull();
    expect(resoudreCollision(seconde, [...toutes].reverse())).toBe("PTG-2608-0042-B");
    expect(resoudreCollision(troisieme, toutes)).toBe("PTG-2608-0042-C");
  });

  it("départage deux arrivées à la même milliseconde par l’identifiant", () => {
    const alpha = piece("aaa", 1000);
    const beta = piece("bbb", 1000);
    expect(resoudreCollision(alpha, [alpha, beta])).toBeNull();
    expect(resoudreCollision(beta, [alpha, beta])).toBe("PTG-2608-0042-B");
  });

  it("ne dit rien d’une pièce absente de la liste", () => {
    expect(resoudreCollision(piece("z", 500), [piece("a", 1000)])).toBeNull();
  });
});
