import { describe, expect, it } from "vitest";
import {
  changerLigneRetour,
  lignesReprises,
  margeReprise,
  retourDepuisVente,
  totalRembourse,
  validerRetour,
} from "./retour";
import type { LigneVentePiece, VentePiece } from "./vente-piece";

const ligne = (partie: Partial<LigneVentePiece> & { pieceId: string }): LigneVentePiece => ({
  reference: `REF-${partie.pieceId}`,
  designation: "Plaquette",
  quantite: 2,
  prixUnitaire: 3500,
  prixAchatUnitaire: 2000,
  total: 7000,
  ...partie,
});

const vente = (lignes: LigneVentePiece[]): VentePiece => ({
  id: "v1",
  numero: "PTG-2610-0042",
  boutiqueId: "PTG",
  date: new Date("2026-10-20"),
  clientId: "",
  operateur: "Awa",
  lignes,
  total: lignes.reduce((s, l) => s + l.total, 0),
  moyenPaiement: "especes",
});

describe("retourDepuisVente", () => {
  it("prépare une ligne par ligne vendue, rien de coché, le moyen de la vente", () => {
    const saisie = retourDepuisVente(vente([ligne({ pieceId: "p1" }), ligne({ pieceId: "p2" })]));
    expect(saisie.lignes).toEqual([
      { pieceId: "p1", quantite: "0" },
      { pieceId: "p2", quantite: "0" },
    ]);
    expect(saisie.moyenPaiement).toBe("especes");
    expect(saisie.motif).toBe("");
  });
});

describe("lignesReprises et totalRembourse", () => {
  const v = vente([
    ligne({ pieceId: "p1", quantite: 3, prixUnitaire: 3500, total: 10500 }),
    ligne({ pieceId: "p2", quantite: 1, prixUnitaire: 1000, total: 1000 }),
  ]);

  it("ne reprend que les lignes cochées, au prix vendu", () => {
    const saisie = changerLigneRetour(retourDepuisVente(v), "p1", "2");
    const reprises = lignesReprises(saisie, v);
    expect(reprises).toHaveLength(1);
    expect(reprises[0]).toMatchObject({ pieceId: "p1", quantite: 2, prixUnitaire: 3500, total: 7000 });
    expect(totalRembourse(saisie, v)).toBe(7000);
  });

  it("plafonne la quantité reprise à ce qui a été vendu", () => {
    const saisie = changerLigneRetour(retourDepuisVente(v), "p1", "99");
    expect(lignesReprises(saisie, v)[0].quantite).toBe(3);
  });

  it("additionne plusieurs lignes reprises", () => {
    let saisie = changerLigneRetour(retourDepuisVente(v), "p1", "1");
    saisie = changerLigneRetour(saisie, "p2", "1");
    expect(totalRembourse(saisie, v)).toBe(4500);
  });
});

describe("margeReprise", () => {
  it("additionne la marge des lignes reprises", () => {
    const v = vente([ligne({ pieceId: "p1", quantite: 2, prixUnitaire: 3500, prixAchatUnitaire: 2000 })]);
    const saisie = changerLigneRetour(retourDepuisVente(v), "p1", "2");
    // (3500 - 2000) * 2
    expect(margeReprise(saisie, v)).toBe(3000);
  });

  it("vaut null si une pièce reprise n’a pas de coût connu", () => {
    const v = vente([ligne({ pieceId: "p1", prixAchatUnitaire: null })]);
    const saisie = changerLigneRetour(retourDepuisVente(v), "p1", "1");
    expect(margeReprise(saisie, v)).toBeNull();
  });

  it("vaut null quand rien n’est repris", () => {
    const v = vente([ligne({ pieceId: "p1" })]);
    expect(margeReprise(retourDepuisVente(v), v)).toBeNull();
  });
});

describe("validerRetour", () => {
  const v = vente([ligne({ pieceId: "p1", reference: "PLQ-0142", quantite: 2 })]);

  it("refuse un retour où rien n’est coché", () => {
    expect(validerRetour(retourDepuisVente(v), v)).toMatch(/au moins une pièce/);
  });

  it("accepte une reprise valide", () => {
    expect(validerRetour(changerLigneRetour(retourDepuisVente(v), "p1", "2"), v)).toBeNull();
  });

  it("refuse de reprendre plus que vendu, en nommant la pièce", () => {
    const trop = changerLigneRetour(retourDepuisVente(v), "p1", "3");
    expect(validerRetour(trop, v)).toContain("PLQ-0142");
  });

  it("refuse une quantité non numérique", () => {
    const mauvais = changerLigneRetour(retourDepuisVente(v), "p1", "deux");
    expect(validerRetour(mauvais, v)).toContain("PLQ-0142");
  });
});
