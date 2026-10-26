import { describe, expect, it } from "vitest";
import { montantEnLettres, nombreEnLettres } from "./lettres";

/**
 * Le montant en toutes lettres de la facture (26 octobre 2026).
 *
 * **Ce que ces tests gardent, c'est l'orthographe.** La somme en lettres fait
 * foi sur une pièce commerciale, et le client relit la ligne : « quatre-vingt »
 * mal accordé ou « un mille » se voient. Les cas ci-dessous sont les quatre
 * pièges de la numération française, plus le montant exact de la facture que
 * le commanditaire a envoyée.
 */
describe("nombreEnLettres", () => {
  it("écrit les premiers nombres", () => {
    expect(nombreEnLettres(0)).toBe("zéro");
    expect(nombreEnLettres(1)).toBe("un");
    expect(nombreEnLettres(16)).toBe("seize");
    expect(nombreEnLettres(17)).toBe("dix-sept");
    expect(nombreEnLettres(19)).toBe("dix-neuf");
  });

  it("lie les unités par « et » là où l’usage le demande", () => {
    expect(nombreEnLettres(21)).toBe("vingt et un");
    expect(nombreEnLettres(22)).toBe("vingt-deux");
    expect(nombreEnLettres(31)).toBe("trente et un");
    expect(nombreEnLettres(61)).toBe("soixante et un");
  });

  it("compte par seize au-dessus de soixante et de quatre-vingt", () => {
    expect(nombreEnLettres(70)).toBe("soixante-dix");
    /* Le seul « et » de la série, et il ne vaut que pour soixante. */
    expect(nombreEnLettres(71)).toBe("soixante et onze");
    expect(nombreEnLettres(77)).toBe("soixante-dix-sept");
    expect(nombreEnLettres(90)).toBe("quatre-vingt-dix");
    expect(nombreEnLettres(91)).toBe("quatre-vingt-onze");
    expect(nombreEnLettres(99)).toBe("quatre-vingt-dix-neuf");
  });

  it("accorde quatre-vingts seul, et le laisse nu quand un nombre le suit", () => {
    expect(nombreEnLettres(80)).toBe("quatre-vingts");
    expect(nombreEnLettres(81)).toBe("quatre-vingt-un");
    expect(nombreEnLettres(82)).toBe("quatre-vingt-deux");
  });

  it("traite « cent » comme « quatre-vingt » : accordé seul, nu s’il est suivi", () => {
    expect(nombreEnLettres(100)).toBe("cent");
    expect(nombreEnLettres(101)).toBe("cent un");
    expect(nombreEnLettres(200)).toBe("deux cents");
    expect(nombreEnLettres(201)).toBe("deux cent un");
    expect(nombreEnLettres(380)).toBe("trois cent quatre-vingts");
  });

  it("garde « mille » invariable, et sans « un » devant", () => {
    expect(nombreEnLettres(1_000)).toBe("mille");
    expect(nombreEnLettres(1_001)).toBe("mille un");
    expect(nombreEnLettres(2_000)).toBe("deux mille");
    expect(nombreEnLettres(80_000)).toBe("quatre-vingt mille");
    expect(nombreEnLettres(200_000)).toBe("deux cent mille");
  });

  it("accorde million et milliard, qui sont des noms", () => {
    expect(nombreEnLettres(1_000_000)).toBe("un million");
    expect(nombreEnLettres(2_000_000)).toBe("deux millions");
    expect(nombreEnLettres(1_000_000_000)).toBe("un milliard");
    expect(nombreEnLettres(3_000_000_000)).toBe("trois milliards");
  });

  /* Le montant exact de la facture envoyée par le commanditaire, et la phrase
     qu'elle porte : c'est ce rendu-là qui doit sortir de l'imprimante. */
  it("écrit le montant de la facture du commanditaire", () => {
    expect(nombreEnLettres(1_575_000)).toBe("un million cinq cent soixante-quinze mille");
  });

  it("écrit un prix de moto ordinaire", () => {
    expect(nombreEnLettres(850_000)).toBe("huit cent cinquante mille");
    expect(nombreEnLettres(1_250_500)).toBe("un million deux cent cinquante mille cinq cents");
  });

  /* Taire une mention vaut mieux que la mentir : un montant impossible ne
     produit pas une phrase approximative, il ne produit rien, et le reçu
     n'imprime pas la ligne. */
  it("ne rend rien pour un montant négatif ou à virgule", () => {
    expect(nombreEnLettres(-1)).toBe("");
    expect(nombreEnLettres(12.5)).toBe("");
    expect(nombreEnLettres(Number.NaN)).toBe("");
  });
});

describe("montantEnLettres", () => {
  it("porte la majuscule de phrase et l’unité monétaire", () => {
    expect(montantEnLettres(1_575_000)).toBe(
      "Un million cinq cent soixante-quinze mille francs CFA",
    );
  });

  it("écrit zéro comme le reste : une facture soldée l’imprime aussi", () => {
    expect(montantEnLettres(0)).toBe("Zéro francs CFA");
  });

  it("ne rend rien quand le nombre n’en est pas un", () => {
    expect(montantEnLettres(-5)).toBe("");
  });
});
