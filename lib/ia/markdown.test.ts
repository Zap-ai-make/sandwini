import { describe, expect, it } from "vitest";

import { lireMarkdown } from "./markdown";

describe("le balisage que rend le modèle", () => {
  it("met en gras ce qui est entre deux paires d'étoiles", () => {
    /* Le premier rendu affichait « **Motos (21 au total)** » avec ses étoiles,
       parce que le texte sortait tel quel. C'est ce que le commanditaire a
       appelé « en vrac ». */
    const [bloc] = lireMarkdown("Nous avons **21 motos** en stock");
    expect(bloc).toEqual({
      type: "paragraphe",
      fragments: [
        { texte: "Nous avons " },
        { texte: "21 motos", gras: true },
        { texte: " en stock" },
      ],
    });
  });

  it("reconnaît une liste à tirets, et sa profondeur", () => {
    /* Le modèle imbrique : une boutique, puis ses motos. Aplatir les deux
       niveaux rendrait la réponse illisible dès qu'il y a deux magasins. */
    const blocs = lireMarkdown("- Boutique ABC\n  - 5 noires\n  - 3 bleues");
    expect(blocs).toHaveLength(1);
    expect(blocs[0]).toMatchObject({ type: "liste" });
    if (blocs[0].type !== "liste") throw new Error("bloc inattendu");
    expect(blocs[0].elements.map((element) => element.niveau)).toEqual([0, 1, 1]);
  });

  it("sépare deux paragraphes sur une ligne vide", () => {
    expect(lireMarkdown("Premier\n\nSecond")).toHaveLength(2);
  });

  it("garde les retours à la ligne simples dans un même paragraphe", () => {
    const blocs = lireMarkdown("Première ligne\nseconde ligne");
    expect(blocs).toHaveLength(1);
    expect(blocs[0].type).toBe("paragraphe");
  });

  it("reconnaît un titre", () => {
    const [bloc] = lireMarkdown("## Les motos");
    expect(bloc).toMatchObject({ type: "titre" });
  });

  it("n’interprète jamais de HTML", () => {
    /* **Le point de sécurité de ce module.** Le texte vient d'un modèle, qui a
       lui-même lu des noms de clients et des notes saisis par des humains. Rendu
       comme du balisage, un `<img onerror>` s'exécuterait. Ici tout ressort en
       texte, et le composant l'affiche avec React — jamais par
       `dangerouslySetInnerHTML`. */
    const [bloc] = lireMarkdown("<img src=x onerror=alert(1)>");
    expect(bloc).toEqual({
      type: "paragraphe",
      fragments: [{ texte: "<img src=x onerror=alert(1)>" }],
    });
  });

  it("supporte un flux coupé au milieu d’une mise en gras", () => {
    /* En streaming, le texte arrive par morceaux : « Nous avons **21 » est un
       état normal pendant une demi-seconde. Il ne doit ni perdre le texte ni
       faire clignoter la réponse. */
    const [bloc] = lireMarkdown("Nous avons **21");
    expect(bloc).toEqual({
      type: "paragraphe",
      fragments: [{ texte: "Nous avons " }, { texte: "21", gras: true }],
    });
  });

  it("ne rend rien pour un texte vide", () => {
    expect(lireMarkdown("")).toEqual([]);
    expect(lireMarkdown("   \n  ")).toEqual([]);
  });
});
