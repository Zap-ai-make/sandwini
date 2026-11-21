import { describe, expect, it } from "vitest";
import type { CoutMoto } from "./moto";
import { prixAffiche, preparerPrixDuLot, type EtatPrix } from "./prix-lot";

/**
 * Le prix d'achat posé après coup, depuis « Modifier l'arrivage » (20 novembre
 * 2026) : « quand on oublie de renseigner le prix à l'enregistrement, qu'on
 * puisse se rattraper ». Un prix par moto, et un prix commun qui remplit d'un
 * coup celles qui n'en ont pas.
 */

const cout = (prixAchat: number, frais: number[] = []): CoutMoto => ({
  prixAchat,
  fraisEntree: frais.map((montant) => ({ typeFraisId: "transport", montant, note: "" })),
  coutTotal: frais.reduce((somme, montant) => somme + montant, prixAchat),
});

const connu = (prixAchat: number, frais: number[] = []): EtatPrix => ({
  sorte: "connu",
  cout: cout(prixAchat, frais),
});
const ABSENT: EtatPrix = { sorte: "absent" };
const INCONNU: EtatPrix = { sorte: "inconnu" };

const motos = [
  { id: "m1", boutiqueId: "PTG" },
  { id: "m2", boutiqueId: "PTG" },
  { id: "m3", boutiqueId: "PTG" },
];

describe("prixAffiche", () => {
  it("montre ce qu’on a tapé, avant tout le reste", () => {
    expect(prixAffiche(connu(450_000), "500000", "400000")).toBe("500000");
    expect(prixAffiche(ABSENT, "", "400000")).toBe("");
  });

  it("montre le prix déjà posé, que le prix commun ne remplace pas", () => {
    expect(prixAffiche(connu(450_000), undefined, "400000")).toBe("450000");
  });

  it("remplit du prix commun une moto qui n’en a pas", () => {
    expect(prixAffiche(ABSENT, undefined, " 400000 ")).toBe("400000");
  });

  /* D82 : un prix qu'on n'a pas pu lire existe peut-être. Le remplir du prix
     commun écraserait le vrai, frais compris. */
  it("ne remplit jamais une moto dont le prix n’a pas pu être lu", () => {
    expect(prixAffiche(INCONNU, undefined, "400000")).toBe("");
    expect(prixAffiche(undefined, undefined, "400000")).toBe("");
  });
});

describe("preparerPrixDuLot", () => {
  it("pose le prix commun sur les seules motos qui n’en ont pas", () => {
    const etats = new Map<string, EtatPrix>([
      ["m1", ABSENT],
      ["m2", connu(450_000)],
      ["m3", ABSENT],
    ]);
    const resultat = preparerPrixDuLot(motos, etats, new Map(), "400000");
    expect(resultat).toEqual({
      ok: true,
      couts: [
        { motoId: "m1", boutiqueId: "PTG", cout: cout(400_000) },
        { motoId: "m3", boutiqueId: "PTG", cout: cout(400_000) },
      ],
    });
  });

  it("n’écrit rien quand rien ne change", () => {
    const etats = new Map<string, EtatPrix>([
      ["m1", connu(450_000)],
      ["m2", ABSENT],
      ["m3", ABSENT],
    ]);
    expect(preparerPrixDuLot(motos, etats, new Map([["m1", "450000"]]), "")).toEqual({
      ok: true,
      couts: [],
    });
  });

  /* Le prix change, les frais d'entrée restent : on corrige un prix, on ne
     perd pas le transport payé dessus. */
  it("corrige un prix en gardant les frais d’entrée déjà posés", () => {
    const etats = new Map<string, EtatPrix>([
      ["m1", connu(450_000, [25_000])],
      ["m2", ABSENT],
      ["m3", ABSENT],
    ]);
    const resultat = preparerPrixDuLot(motos, etats, new Map([["m1", "480 000"]]), "");
    expect(resultat).toEqual({
      ok: true,
      couts: [{ motoId: "m1", boutiqueId: "PTG", cout: cout(480_000, [25_000]) }],
    });
  });

  it("ne touche jamais une moto dont le prix n’a pas pu être lu", () => {
    const etats = new Map<string, EtatPrix>([
      ["m1", INCONNU],
      ["m2", ABSENT],
      ["m3", ABSENT],
    ]);
    const resultat = preparerPrixDuLot(motos, etats, new Map([["m1", "500000"]]), "400000");
    expect(resultat.ok && resultat.couts.map((c) => c.motoId)).toEqual(["m2", "m3"]);
  });

  it("refuse un prix mal écrit, sur sa ligne", () => {
    const etats = new Map<string, EtatPrix>([
      ["m1", ABSENT],
      ["m2", ABSENT],
      ["m3", ABSENT],
    ]);
    const resultat = preparerPrixDuLot(motos, etats, new Map([["m2", "45O000"]]), "");
    expect(resultat).toMatchObject({ ok: false, rang: 1 });
    expect(!resultat.ok && resultat.erreur).toMatch(/chiffres/);
  });

  /* Les règles n'effacent jamais un coût : vider la case ne peut que mentir. */
  it("refuse d’effacer un prix déjà posé", () => {
    const etats = new Map<string, EtatPrix>([
      ["m1", ABSENT],
      ["m2", connu(450_000)],
      ["m3", ABSENT],
    ]);
    const resultat = preparerPrixDuLot(motos, etats, new Map([["m2", " "]]), "");
    expect(resultat).toMatchObject({ ok: false, rang: 1 });
    expect(!resultat.ok && resultat.erreur).toMatch(/efface/);
  });
});
