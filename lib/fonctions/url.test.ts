import { describe, expect, test } from "vitest";
import { REGION_FONCTIONS, urlFonction } from "./url";

describe("l’URL d’une fonction HTTP", () => {
  test("en ligne, elle porte la région et le projet", () => {
    expect(urlFonction("suiviPrestataire", { projet: "sandwini", emulateurs: false })).toBe(
      "https://europe-west1-sandwini.cloudfunctions.net/suiviPrestataire",
    );
  });

  /* Sur émulateurs la forme est tout autre — le projet est un SEGMENT et non un
     préfixe d'hôte. Recopier la forme en ligne en changeant l'hôte donne une
     URL qui répond 404, et on cherche le défaut dans la fonction. */
  test("sur émulateurs, elle passe par le port 5301 et nomme le projet en segment", () => {
    expect(urlFonction("suiviPrestataire", { projet: "sdi-dev", emulateurs: true })).toBe(
      "http://127.0.0.1:5301/sdi-dev/europe-west1/suiviPrestataire",
    );
  });

  test("la région est celle que déclarent les fonctions", () => {
    expect(REGION_FONCTIONS).toBe("europe-west1");
  });

  /* **Sans projet, on refuse bruyamment.** Fabriquer
     `https://europe-west1-undefined.cloudfunctions.net/...` donnerait une page
     « ce lien n'est plus valide » parfaitement trompeuse : le lien serait bon,
     c'est la configuration qui manquerait. */
  test.each([undefined, "", "   "])("sans projet configuré, elle le dit : %s", (projet) => {
    expect(() => urlFonction("suiviPrestataire", { projet, emulateurs: false })).toThrow(
      /projet/i,
    );
  });

  test("un nom de fonction vide est refusé", () => {
    expect(() => urlFonction("", { projet: "sandwini", emulateurs: false })).toThrow();
  });
});
