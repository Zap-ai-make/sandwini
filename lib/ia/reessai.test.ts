import { describe, expect, it } from "vitest";

import { attenteAvantReessai, estSurcharge, statutHttp } from "./reessai";

describe("le code HTTP derrière un échec de Gemini", () => {
  it("se lit dans les données d’erreur du SDK", () => {
    expect(statutHttp({ customErrorData: { status: 429 } })).toBe(429);
  });

  it("se lit aussi dans le message, que le SDK préfixe", () => {
    /* La forme réelle observée en console : « [429] Resource exhausted ». */
    expect(statutHttp(new Error("[503] The service is currently unavailable."))).toBe(503);
  });

  it("vaut null quand l’échec n’est pas une réponse du serveur", () => {
    expect(statutHttp(new TypeError("Failed to fetch"))).toBe(null);
  });
});

describe("décider si l’échec se dissipera tout seul", () => {
  it("retient la surcharge et l’indisponibilité", () => {
    for (const statut of [429, 503]) {
      expect(estSurcharge({ customErrorData: { status: statut } })).toBe(true);
    }
  });

  it("écarte un refus de droits, qui ne s’arrange pas en attendant", () => {
    for (const statut of [400, 401, 403, 404]) {
      expect(estSurcharge({ customErrorData: { status: statut } })).toBe(false);
    }
  });

  it("écarte des crédits épuisés, qui portent pourtant le même 429", () => {
    /* **Les deux refus partagent le code.** Une file d’attente saturée se vide ;
       une cagnotte vide, jamais. Réessayer la seconde brûlerait trois tentatives
       pour rien avant d’afficher un message qui, lui, demande un geste humain. */
    expect(
      estSurcharge({
        customErrorData: { status: 429 },
        message: "[429] Your prepayment credits are depleted.",
      }),
    ).toBe(false);
  });
});

describe("l’attente entre deux tentatives", () => {
  it("s’allonge à chaque reprise", () => {
    const sans = () => 0;
    const attentes = [0, 1, 2].map((reprise) => attenteAvantReessai(reprise, sans));
    expect(attentes).toEqual([...attentes].sort((a, b) => Number(a) - Number(b)));
    expect(attentes[0]).toBeGreaterThan(0);
  });

  it("s’arrête : une reprise au-delà du dernier palier rend null", () => {
    expect(attenteAvantReessai(99, () => 0)).toBe(null);
  });

  it("ajoute un décalage aléatoire, pour ne pas revenir tous en même temps", () => {
    /* Deux onglets qui prennent le même 429 reviendraient à la milliseconde
       près et se re-refuseraient mutuellement. Le hasard les écarte. */
    expect(attenteAvantReessai(0, () => 0)).toBeLessThan(
      attenteAvantReessai(0, () => 1) as number,
    );
  });
});
