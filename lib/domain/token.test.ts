import { describe, expect, it } from "vitest";
import { LONGUEUR_TOKEN, engendrerToken, estTokenValide } from "./token";

/**
 * Le token de suivi client (D6).
 *
 * Un token faible n'échoue jamais bruyamment : il ouvre simplement le dossier
 * d'un client à quelqu'un d'autre. On vérifie donc ce qui se vérifie — forme,
 * longueur, et le fait que deux tirages ne se ressemblent pas.
 */

describe("engendrer un token de suivi", () => {
  it("rend 43 caractères en base64url — au-delà des 32 exigés", () => {
    expect(engendrerToken()).toHaveLength(LONGUEUR_TOKEN);
  });

  it("n’utilise aucun caractère qui se ferait échapper dans une URL", () => {
    for (let essai = 0; essai < 200; essai += 1) {
      const token = engendrerToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("ne se répète pas", () => {
    const tirages = new Set(Array.from({ length: 1000 }, engendrerToken));
    expect(tirages.size).toBe(1000);
  });

  it("reconnaît un token valide et refuse ce qui n’en est pas un", () => {
    expect(estTokenValide(engendrerToken())).toBe(true);
    expect(estTokenValide("")).toBe(false);
    expect(estTokenValide("trop-court")).toBe(false);
    expect(estTokenValide("A".repeat(LONGUEUR_TOKEN - 1))).toBe(false);
    expect(estTokenValide(`${"A".repeat(LONGUEUR_TOKEN - 1)}+`)).toBe(false);
  });
});
