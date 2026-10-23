import { describe, expect, it } from "vitest";

import { JOURS_QUI_DORMENT, resumerLeCommerce } from "./resume";

const AUJOURDHUI = new Date(2026, 9, 20); // 20 octobre 2026
const CE_MOIS = new Date(2026, 9, 3);
const LE_MOIS_DERNIER = new Date(2026, 8, 28);

const VIDE = {
  motos: [],
  ventes: [],
  versements: [],
  caisse: [],
  cartesGrises: [],
  pieces: [],
};

describe("le résumé du commerce", () => {
  it("compte le stock, et ce qui dort dedans", () => {
    /* Une moto qui dort depuis quatre mois n'est plus du stock, c'est de
       l'argent immobilisé — et c'est la seule chose qu'on puisse faire d'un
       inventaire : voir ce qui ne bouge pas. */
    const resume = resumerLeCommerce(
      {
        ...VIDE,
        motos: [
          { statut: "en_stock", dateEntree: new Date(2026, 9, 1) },
          { statut: "en_stock", dateEntree: new Date(2026, 2, 1) },
          { statut: "vendue", dateEntree: new Date(2026, 0, 1) },
        ],
      },
      AUJOURDHUI,
    );
    expect(resume.motosEnStock).toBe(2);
    expect(resume.motosQuiDorment).toBe(1);
  });

  it("ne compte jamais une moto vendue comme dormante", () => {
    /* Elle est partie : son ancienneté ne dit plus rien de ce qu'on détient. */
    const resume = resumerLeCommerce(
      { ...VIDE, motos: [{ statut: "vendue", dateEntree: new Date(2025, 0, 1) }] },
      AUJOURDHUI,
    );
    expect(resume.motosQuiDorment).toBe(0);
  });

  it("retient quatre mois comme seuil de sommeil", () => {
    expect(JOURS_QUI_DORMENT).toBe(120);
  });

  it("ne compte dans le mois que les ventes du mois", () => {
    const resume = resumerLeCommerce(
      {
        ...VIDE,
        ventes: [
          { id: "v1", date: CE_MOIS, prixConvenu: 900_000, modePaiement: "comptant" },
          { id: "v2", date: LE_MOIS_DERNIER, prixConvenu: 800_000, modePaiement: "comptant" },
        ],
      },
      AUJOURDHUI,
    );
    expect(resume.ventesDuMois).toEqual({ combien: 1, montant: 900_000 });
  });

  /**
   * **Le test le plus important de ce fichier.**
   *
   * Crédit et tranches sont deux ventes différentes : dans un cas la moto est
   * partie et le magasin attend de l'argent, dans l'autre elle est au magasin
   * et c'est l'argent qui y est déjà. Les additionner produit un nombre qui ne
   * désigne rien, et qui serait lu à voix haute à quelqu'un sur le point de
   * réclamer une dette.
   */
  it("ne mélange jamais une créance et un dépôt en tranches", () => {
    const resume = resumerLeCommerce(
      {
        ...VIDE,
        ventes: [
          { id: "credit", date: CE_MOIS, prixConvenu: 1_000_000, modePaiement: "credit" },
          { id: "tranche", date: CE_MOIS, prixConvenu: 800_000, modePaiement: "tranches" },
        ],
        versements: [
          { venteId: "credit", montant: 400_000 },
          { venteId: "tranche", montant: 300_000 },
        ],
      },
      AUJOURDHUI,
    );

    expect(resume.creances).toEqual({ combien: 1, montant: 600_000 });
    expect(resume.tranches).toEqual({
      combien: 1,
      dejaVerse: 300_000,
      resteAVerser: 500_000,
    });
  });

  it("sort une vente soldée des deux comptes", () => {
    const resume = resumerLeCommerce(
      {
        ...VIDE,
        ventes: [{ id: "v1", date: CE_MOIS, prixConvenu: 500_000, modePaiement: "credit" }],
        versements: [{ venteId: "v1", montant: 500_000 }],
      },
      AUJOURDHUI,
    );
    expect(resume.creances.combien).toBe(0);
  });

  it("ne range nulle part un trop-perçu", () => {
    /* Une dette à rebours n'existe pas : c'est une anomalie de saisie, et
       l'annoncer comme un chiffre négatif ferait réclamer de l'argent à
       quelqu'un qui en a trop donné. */
    const resume = resumerLeCommerce(
      {
        ...VIDE,
        ventes: [{ id: "v1", date: CE_MOIS, prixConvenu: 500_000, modePaiement: "credit" }],
        versements: [{ venteId: "v1", montant: 600_000 }],
      },
      AUJOURDHUI,
    );
    expect(resume.creances).toEqual({ combien: 0, montant: 0 });
  });

  it("ne compte dans la caisse que les mouvements du mois", () => {
    const resume = resumerLeCommerce(
      {
        ...VIDE,
        caisse: [
          { date: CE_MOIS, sens: "entree", montant: 400_000 },
          { date: CE_MOIS, sens: "sortie", montant: 50_000 },
          { date: LE_MOIS_DERNIER, sens: "entree", montant: 999_000 },
        ],
      },
      AUJOURDHUI,
    );
    expect(resume.caisseDuMois).toEqual({ entrees: 400_000, sorties: 50_000 });
  });

  it("compte les cartes grises dehors, et celles qui ont dépassé la date annoncée", () => {
    const resume = resumerLeCommerce(
      {
        ...VIDE,
        cartesGrises: [
          { statut: "chez_prestataire", disponibleLe: new Date(2026, 9, 10) },
          { statut: "chez_prestataire", disponibleLe: new Date(2026, 10, 30) },
          { statut: "chez_prestataire", disponibleLe: null },
          { statut: "revenu_magasin", disponibleLe: new Date(2026, 8, 1) },
        ],
      },
      AUJOURDHUI,
    );
    expect(resume.cartesGrisesDehors).toEqual({ combien: 3, enRetard: 1 });
  });

  it("compte les pièces épuisées comme à réapprovisionner", () => {
    const resume = resumerLeCommerce(
      {
        ...VIDE,
        pieces: [
          { quantite: 0, seuilAlerte: 5 },
          { quantite: 3, seuilAlerte: 5 },
          { quantite: 40, seuilAlerte: 5 },
        ],
      },
      AUJOURDHUI,
    );
    expect(resume.piecesAReapprovisionner).toBe(2);
  });

  it("fait voyager la réserve avec le chiffre", () => {
    /* Un total calculé sur une lecture coupée a l'air juste. La réserve ne peut
       pas être laissée à la mémoire de celui qui répète le chiffre. */
    const resume = resumerLeCommerce(
      { ...VIDE, avertissements: ["Tous les versements n’ont pas été lus."] },
      AUJOURDHUI,
    );
    expect(resume.avertissements).toHaveLength(1);
  });

  it("rend des zéros sur une maison vide, et non des trous", () => {
    const resume = resumerLeCommerce(VIDE, AUJOURDHUI);
    expect(resume.motosEnStock).toBe(0);
    expect(resume.ventesDuMois.montant).toBe(0);
    expect(resume.creances.montant).toBe(0);
    expect(resume.avertissements).toEqual([]);
  });
});
