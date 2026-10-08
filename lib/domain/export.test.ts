import { describe, expect, it } from "vitest";
import { EN_TETE_EXPORT, SEPARATEUR, motosEnCsv, nomFichierExport } from "./export";
import type { Moto } from "./moto";

const nomMarque = (id: string) => ({ ya: "Yamaha" })[id] ?? (id ? "—" : "");
const nomModele = (id: string) => ({ cry: "Crypton" })[id] ?? (id ? "—" : "");

const moto = (p: Partial<Moto> = {}): Moto => ({
  id: "m1",
  boutiqueId: "PTG",
  quittanceChemin: null,
  cmcChemin: null,
  etat: "neuve",
  marqueId: "ya",
  modeleId: "cry",
  couleur: "Rouge",
  annee: 2026,
  numeroChassis: "LC6PCJ1A9K0000123",
  numeroMoteur: "MOT-9",
  prixVenteConseille: 1_100_000,
  provenanceId: "p1",
  arrivageId: null,
  papiersFournis: [],
  photos: [],
  statut: "en_stock",
  dateEntree: new Date(2026, 8, 1),
  cmcRecu: false,
  ...p,
});

const lignes = (csv: string) => csv.split("\r\n");

describe("motosEnCsv", () => {
  it("ouvre sur une ligne d’en-tête", () => {
    expect(lignes(motosEnCsv([], nomMarque, nomModele))[0]).toBe(
      EN_TETE_EXPORT.join(SEPARATEUR),
    );
  });

  it("écrit une moto, cadre et désignation compris", () => {
    const ligne = lignes(motosEnCsv([moto()], nomMarque, nomModele))[1];
    expect(ligne).toContain("LC6PCJ1A9K0000123");
    expect(ligne).toContain("Yamaha");
    expect(ligne).toContain("Crypton");
    expect(ligne).toContain("Rouge");
  });

  /**
   * **Le mur de D2, et c'est tout l'enjeu de cet export.**
   *
   * « Ça doit tout prendre en compte : cadre, marque, modèle, **sauf les
   * prix**. » Ce n'est pas une préférence d'affichage. Les coûts vivent dans
   * `motos/{id}/prive/cout`, hors de portée d'un gérant — mais le prix de vente
   * conseillé, lui, est sur le document que tout le monde lit. Un export qui
   * l'emporterait ferait sortir du chiffre par la porte de derrière.
   *
   * Ce témoin ne vérifie pas une colonne : il vérifie qu'**aucun** montant
   * n'apparaît nulle part. Formulé ainsi, il tient encore le jour où quelqu'un
   * ajoute une colonne sans y penser.
   */
  it("n’emporte aucun prix, nulle part", () => {
    const csv = motosEnCsv(
      [moto({ prixVenteConseille: 1_100_000 }), moto({ id: "m2", prixVenteConseille: 975_000 })],
      nomMarque,
      nomModele,
    );
    expect(csv).not.toContain("1100000");
    expect(csv).not.toContain("1 100 000");
    expect(csv).not.toContain("975000");
    expect(csv.toLowerCase()).not.toContain("prix");
    expect(csv.toLowerCase()).not.toContain("fcfa");
  });

  /**
   * Le séparateur est le point-virgule, et il doit survivre aux données.
   *
   * Excel en français découpe sur le point-virgule ; une couleur saisie
   * « Rouge; noir » déplacerait sinon toutes les colonnes suivantes d'un cran,
   * en silence, sur la seule ligne concernée.
   */
  it("protège une valeur qui contient le séparateur ou un guillemet", () => {
    const csv = motosEnCsv(
      [moto({ couleur: 'Rouge; "vif"' })],
      nomMarque,
      nomModele,
    );
    expect(lignes(csv)[1]).toContain('"Rouge; ""vif"""');
  });

  it("laisse la cellule vide quand le modèle n’a pas été saisi", () => {
    const csv = motosEnCsv([moto({ modeleId: "" })], nomMarque, nomModele);
    const cellules = lignes(csv)[1].split(SEPARATEUR);
    expect(cellules[EN_TETE_EXPORT.indexOf("Modèle")]).toBe("");
    expect(cellules[EN_TETE_EXPORT.indexOf("Marque")]).toBe("Yamaha");
  });

  it("écrit une date lisible, et rien quand elle manque", () => {
    const avec = lignes(motosEnCsv([moto()], nomMarque, nomModele))[1].split(SEPARATEUR);
    expect(avec[EN_TETE_EXPORT.indexOf("Entrée")]).toBe("01/09/2026");
    const sans = lignes(motosEnCsv([moto({ dateEntree: null })], nomMarque, nomModele))[1].split(
      SEPARATEUR,
    );
    expect(sans[EN_TETE_EXPORT.indexOf("Entrée")]).toBe("");
  });

  it("garde l’ordre des motos qu’on lui donne", () => {
    const csv = motosEnCsv(
      [moto({ numeroChassis: "AAA" }), moto({ id: "m2", numeroChassis: "BBB" })],
      nomMarque,
      nomModele,
    );
    expect(lignes(csv)[1]).toContain("AAA");
    expect(lignes(csv)[2]).toContain("BBB");
  });
});

describe("nomFichierExport", () => {
  it("date le fichier, pour que deux exports ne se confondent pas", () => {
    expect(nomFichierExport(new Date(2026, 9, 8))).toBe("motos-2026-10-08.csv");
  });
});
