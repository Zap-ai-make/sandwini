import { describe, expect, test } from "vitest";
import { LONGUEUR_JETON, OCTETS_JETON, estJetonPlausible, lienDeSuivi } from "./jeton-suivi";

const JETON = "a".repeat(43);

describe("la forme d’un jeton de suivi", () => {
  /* **La longueur est figée par un test, et c’est un critère de la spec.** Un
     jeton raccourci un jour « pour que le lien tienne dans un SMS » retirerait
     l’aléa qui fait toute la protection de ce portail — et la retouche aurait
     l’air inoffensive. */
  test("trente-deux octets en base64url font quarante-trois caractères", () => {
    expect(OCTETS_JETON).toBe(32);
    expect(LONGUEUR_JETON).toBe(43);
    expect(estJetonPlausible(JETON)).toBe(true);
  });

  test("accepte les quatre familles de caractères de base64url", () => {
    const quarenteTrois = `${"aZ9_-".repeat(8)}abc`;
    expect(quarenteTrois).toHaveLength(LONGUEUR_JETON);
    expect(estJetonPlausible(quarenteTrois)).toBe(true);
  });

  test.each([
    ["vide", ""],
    ["trop court d’un caractère", "a".repeat(42)],
    ["trop long d’un caractère", "a".repeat(44)],
    /* base64 ordinaire, et non base64url : ces trois caractères n’ont rien à
       faire dans un segment d’URL, et les accepter laisserait entrer un jeton
       qui ne survivrait pas à son propre lien. */
    ["avec une barre oblique", `${"a".repeat(42)}/`],
    ["avec un plus", `${"a".repeat(42)}+`],
    ["avec un égal", `${"a".repeat(42)}=`],
    ["avec un point", `${"a".repeat(42)}.`],
    ["avec un espace", `${"a".repeat(42)} `],
    ["démesuré", "a".repeat(10_000)],
  ])("refuse un jeton %s", (_cas, valeur) => {
    expect(estJetonPlausible(valeur)).toBe(false);
  });

  /* **`null` mérite sa ligne.** Une fiche sans jeton porte `jetonSuivi` absent,
     et une recherche lancée avec `null` rendrait toutes les fiches jamais
     émises. Le filtre est la première barrière : il doit refuser l’absence
     comme il refuse une faute de forme. */
  test.each([null, undefined, 42, {}, [], true, [JETON]])(
    "refuse ce qui n’est pas une chaîne : %s",
    (valeur) => {
      expect(estJetonPlausible(valeur)).toBe(false);
    },
  );
});

describe("le lien de suivi", () => {
  test("se construit sur l’origine du produit", () => {
    expect(lienDeSuivi("https://sdi.exemple.bf", JETON)).toBe(
      `https://sdi.exemple.bf/suivi/${JETON}`,
    );
  });

  /* Une origine à barre finale est ce que rendent certains navigateurs. Un lien
     à double barre s’envoie par WhatsApp, ne marche pas, et personne ne sait
     pourquoi — le prestataire conclut que le magasin lui a donné un faux lien. */
  test("une origine à barre finale ne produit pas un double slash", () => {
    expect(lienDeSuivi("https://sdi.exemple.bf/", JETON)).toBe(
      `https://sdi.exemple.bf/suivi/${JETON}`,
    );
    expect(lienDeSuivi("https://sdi.exemple.bf///", JETON)).toBe(
      `https://sdi.exemple.bf/suivi/${JETON}`,
    );
  });

  test("tient sur une origine locale, port compris", () => {
    expect(lienDeSuivi("http://127.0.0.1:3000", JETON)).toBe(
      `http://127.0.0.1:3000/suivi/${JETON}`,
    );
  });
});
