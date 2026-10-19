import { describe, expect, it } from "vitest";
import { phraseDuServeur } from "./erreur-appelable";

/**
 * Le suffixe que le SDK ajoute, et rien d'autre.
 *
 * La règle est courte, et c'est justement pour cela qu'elle mérite ses témoins :
 * une expression régulière qui mange la fin d'une phrase se trompe en silence,
 * et ce qu'elle abîmerait est la seule chose que la personne lit quand quelque
 * chose vient d'échouer.
 */
describe("phraseDuServeur", () => {
  it("retire le code HTTP collé en fin de message", () => {
    expect(
      phraseDuServeur({
        message:
          "Ce compte a déjà enregistré des opérations : il ne peut pas être effacé. Désactivez-le. [400]",
      }),
    ).toBe(
      "Ce compte a déjà enregistré des opérations : il ne peut pas être effacé. Désactivez-le.",
    );
  });

  it("retire aussi les autres codes", () => {
    expect(phraseDuServeur({ message: "Ce compte n’existe pas. [404]" })).toBe(
      "Ce compte n’existe pas.",
    );
    expect(phraseDuServeur({ message: "Réservé au responsable. [403]" })).toBe(
      "Réservé au responsable.",
    );
  });

  it("laisse intacte une phrase sans suffixe", () => {
    expect(phraseDuServeur({ message: "Adresse e-mail invalide." })).toBe(
      "Adresse e-mail invalide.",
    );
  });

  /** Un crochet au milieu n'est pas un suffixe : il fait partie de la phrase. */
  it("ne touche pas à un nombre entre crochets au milieu", () => {
    expect(phraseDuServeur({ message: "Le lot [400] est incomplet." })).toBe(
      "Le lot [400] est incomplet.",
    );
  });

  /** Trois chiffres, pas davantage : un code HTTP n'en a jamais quatre. */
  it("ne touche pas à un nombre d’une autre longueur", () => {
    expect(phraseDuServeur({ message: "Reste à payer [1250]" })).toBe("Reste à payer [1250]");
    expect(phraseDuServeur({ message: "Lot [42]" })).toBe("Lot [42]");
  });

  it("rend une chaîne vide quand il n’y a pas de message", () => {
    expect(phraseDuServeur({})).toBe("");
    expect(phraseDuServeur(null)).toBe("");
    expect(phraseDuServeur(undefined)).toBe("");
  });

  /**
   * Un message réduit à son code ne dit rien.
   *
   * L'appelant retombe alors sur sa propre phrase, qui vaut mieux qu'un nombre
   * entre crochets.
   */
  it("rend une chaîne vide quand le message n’est que le code", () => {
    expect(phraseDuServeur({ message: "[400]" })).toBe("");
  });
});
