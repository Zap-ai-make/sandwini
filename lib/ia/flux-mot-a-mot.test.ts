import { describe, expect, it } from "vitest";

import { avancerDUnMot, RETARD_MAX } from "./flux-mot-a-mot";

/** Déroule l'affichage jusqu'au bout, et rend ce qu'on a vu à chaque pas. */
function derouler(cible: string): string[] {
  const vus: string[] = [];
  let montre = 0;
  /* Borne de sûreté : une boucle qui n'avance pas doit casser le test, pas
     figer la suite. */
  for (let pas = 0; pas < 500 && montre < cible.length; pas += 1) {
    const suivant = avancerDUnMot(cible, montre);
    expect(suivant).toBeGreaterThan(montre);
    montre = suivant;
    vus.push(cible.slice(0, montre));
  }
  return vus;
}

describe("dévoiler une réponse mot à mot", () => {
  it("avance d’un mot à la fois", () => {
    expect(derouler("Il reste douze bougies")).toEqual([
      "Il ",
      "Il reste ",
      "Il reste douze ",
      "Il reste douze bougies",
    ]);
  });

  it("finit exactement sur le texte, sans rien ajouter ni perdre", () => {
    const phrase = "Trois motos sont en stock à la gare routière.";
    const vus = derouler(phrase);
    expect(vus.at(-1)).toBe(phrase);
  });

  it("ne bouge plus une fois tout dit", () => {
    const phrase = "Terminé.";
    expect(avancerDUnMot(phrase, phrase.length)).toBe(phrase.length);
  });

  it("emporte la ponctuation avec son mot", () => {
    /* Un pas qui s'arrêterait avant la virgule ferait clignoter un texte mal
       ponctué, puis se corriger — l'œil le voit, et ça fait bâclé. */
    expect(derouler("Oui, voilà.")).toEqual(["Oui, ", "Oui, voilà."]);
  });

  it("garde les retours à la ligne, qui portent la mise en forme", () => {
    const vus = derouler("Un\n\nDeux");
    expect(vus.at(-1)).toBe("Un\n\nDeux");
    expect(vus[0]).toBe("Un\n\n");
  });
});

describe("rattraper quand le modèle écrit plus vite qu’on n’affiche", () => {
  it("accélère au lieu de prendre un retard qui ne se rattrape jamais", () => {
    /* Gemini livre par paquets : une réponse entière peut arriver d'un coup.
       À un mot par battement, la fin s'afficherait longtemps après que tout
       soit connu — l'utilisateur attendrait une machine qui a fini. */
    const longue = Array.from({ length: 400 }, (_, rang) => `mot${rang}`).join(" ");
    const pas = avancerDUnMot(longue, 0);
    expect(longue.slice(0, pas).trim().split(/\s+/).length).toBeGreaterThan(1);
  });

  it("reste au pas de l’homme tant que le retard est tenable", () => {
    const courte = Array.from({ length: RETARD_MAX }, (_, rang) => `mot${rang}`).join(" ");
    expect(courte.slice(0, avancerDUnMot(courte, 0)).trim()).toBe("mot0");
  });
});
