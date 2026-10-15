import { describe, expect, it } from "vitest";
import { classeur, crc32, referenceColonne } from "./xlsx";

/* L'archive est écrite sans compression — méthode « stored », autorisée par le
   format. C'est ce qui permet de relire le XML à l'œil nu dans les octets, ici
   comme dans un éditeur, sans dézipper quoi que ce soit. */
const texte = (octets: Uint8Array) => new TextDecoder().decode(octets);

describe("crc32", () => {
  /* Le vecteur de référence de la norme : CRC-32 de « 123456789 ». S'il tombe
     juste, l'implémentation entière est bonne — c'est tout l'intérêt d'un
     vecteur d'essai. */
  it("retrouve le vecteur de référence", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("vaut zéro sur rien", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("referenceColonne", () => {
  it("compte comme un tableur", () => {
    expect(referenceColonne(0)).toBe("A");
    expect(referenceColonne(25)).toBe("Z");
    /* Le passage à deux lettres est l'endroit où ce genre de fonction se
       trompe : après Z vient AA, pas BA ni A@. */
    expect(referenceColonne(26)).toBe("AA");
    expect(referenceColonne(27)).toBe("AB");
    expect(referenceColonne(51)).toBe("AZ");
    expect(referenceColonne(52)).toBe("BA");
  });
});

describe("classeur", () => {
  const simple = () => classeur("Motos", [["Châssis", "Année"], ["LC6KDG001", 2024]]);

  it("fabrique une archive ZIP", () => {
    const octets = simple();
    /* `PK\x03\x04` ouvre le premier fichier, `PK\x05\x06` ferme l'archive. Sans
       ces deux-là, aucun tableur n'ouvrira le fichier. */
    expect([...octets.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(texte(octets)).toContain("PK\u0005\u0006");
  });

  it("emporte les cinq pièces qu'un classeur exige", () => {
    const contenu = texte(simple());
    for (const piece of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
    ]) {
      expect(contenu).toContain(piece);
    }
  });

  it("nomme la feuille", () => {
    expect(texte(simple())).toContain('name="Motos"');
  });

  it("écrit le texte en chaîne et les nombres en nombre", () => {
    const contenu = texte(simple());
    /* Un nombre dans `<is><t>` se trierait comme du texte : 10 avant 9. */
    expect(contenu).toContain("<is><t>LC6KDG001</t></is>");
    expect(contenu).toContain('<c r="B2"><v>2024</v></c>');
  });

  it("laisse les cellules vides hors de la feuille", () => {
    /* Une cellule absente et une cellule vide se ressemblent à l'écran, mais la
       première ne pèse rien et se filtre proprement (D105). */
    const contenu = texte(classeur("F", [["a", null, "c"]]));
    expect(contenu).toContain('<c r="A1"');
    expect(contenu).not.toContain('<c r="B1"');
    expect(contenu).toContain('<c r="C1"');
  });

  it("échappe ce qui casserait le XML", () => {
    const contenu = texte(classeur("F", [["Rouge & <noir>"]]));
    expect(contenu).toContain("Rouge &amp; &lt;noir&gt;");
    expect(contenu).not.toContain("<noir>");
  });

  it("écarte les caractères qu'un XML n'accepte pas", () => {
    /* Un octet de contrôle recopié d'un carnet suffirait à rendre le fichier
       illisible par le tableur — et le tableur ne dirait pas pourquoi. */
    const contenu = texte(classeur("F", [["avant\u0007après"]]));
    expect(contenu).toContain("<is><t>avantaprès</t></is>");
  });

  /**
   * L'injection de formule, et pourquoi elle ne se protège plus à la main.
   *
   * En CSV, une couleur saisie `=HYPERLINK(...)` devenait une formule chez
   * celui qui ouvrait le fichier, et il fallait la neutraliser d'une apostrophe.
   * Dans un classeur, une formule vit dans un élément `<f>` : une cellule
   * déclarée `inlineStr` ne peut pas en porter une. La protection est désormais
   * dans la structure du format, pas dans une chaîne — mais elle doit être
   * vérifiée, sans quoi personne ne saura qu'elle repose là-dessus.
   */
  it("ne laisse pas une saisie devenir une formule", () => {
    const contenu = texte(classeur("F", [['=HYPERLINK("http://ailleurs/","ok")']]));
    expect(contenu).toContain('t="inlineStr"');
    expect(contenu).not.toContain("<f>");
    expect(contenu).toContain("=HYPERLINK(");
  });

  it("numérote les lignes à partir de un", () => {
    const contenu = texte(classeur("F", [["a"], ["b"]]));
    expect(contenu).toContain('<row r="1">');
    expect(contenu).toContain('<row r="2">');
    expect(contenu).toContain('<c r="A2"');
  });

  it("accepte un classeur sans la moindre ligne", () => {
    /* Le cas arrive : on décoche tout avant de cliquer. Mieux vaut un fichier
       vide qu'une exception au moment du clic. */
    expect(() => classeur("F", [])).not.toThrow();
    expect(texte(classeur("F", []))).toContain("<sheetData></sheetData>");
  });
});
