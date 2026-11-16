import { describe, expect, it } from "vitest";
import {
  LONGUEUR_MOT_DE_PASSE_MIN,
  messageErreurMotDePasse,
  validerChangementMotDePasse,
} from "./mot-de-passe";

const valide = {
  actuel: "ancien-secret",
  nouveau: "nouveau-secret-42",
  confirmation: "nouveau-secret-42",
};

describe("validerChangementMotDePasse", () => {
  it("accepte une saisie complète et cohérente", () => {
    expect(validerChangementMotDePasse(valide)).toBeNull();
  });

  /* Firebase le réclame pour réauthentifier : sans lui, le changement serait
     refusé par le serveur, après un aller-retour pour rien. */
  it("exige le mot de passe actuel", () => {
    expect(validerChangementMotDePasse({ ...valide, actuel: "" })).toMatch(/actuel/);
  });

  /* Six caractères depuis le 16 novembre 2026, à la demande du commanditaire
     — le plancher de Firebase. La même longueur qu'à la création d'un gérant
     (`functions/src/gerants.ts`). */
  it("refuse un nouveau mot de passe trop court", () => {
    expect(LONGUEUR_MOT_DE_PASSE_MIN).toBe(6);
    const court = "a".repeat(LONGUEUR_MOT_DE_PASSE_MIN - 1);
    expect(
      validerChangementMotDePasse({ ...valide, nouveau: court, confirmation: court }),
    ).toMatch(/6 caractères/);
    const juste = "a".repeat(LONGUEUR_MOT_DE_PASSE_MIN);
    expect(
      validerChangementMotDePasse({ ...valide, nouveau: juste, confirmation: juste }),
    ).toBeNull();
  });

  it("refuse deux saisies qui ne correspondent pas", () => {
    expect(
      validerChangementMotDePasse({ ...valide, confirmation: "nouveau-secret-43" }),
    ).toMatch(/correspondent pas/);
  });

  it("refuse de remettre le même mot de passe", () => {
    expect(
      validerChangementMotDePasse({
        actuel: valide.nouveau,
        nouveau: valide.nouveau,
        confirmation: valide.nouveau,
      }),
    ).toMatch(/différ/);
  });
});

describe("messageErreurMotDePasse", () => {
  /* Les versions récentes de Firebase rendent `invalid-credential` là où les
     anciennes rendaient `wrong-password` : les deux disent la même chose ici. */
  it("dit que le mot de passe actuel est faux", () => {
    for (const code of ["auth/wrong-password", "auth/invalid-credential"]) {
      expect(messageErreurMotDePasse({ code })).toMatch(/actuel est incorrect/);
    }
  });

  it("demande du réseau quand la demande n’a pas abouti", () => {
    expect(messageErreurMotDePasse({ code: "auth/network-request-failed" })).toMatch(/réseau/);
  });

  it("fait patienter après trop de tentatives", () => {
    expect(messageErreurMotDePasse({ code: "auth/too-many-requests" })).toMatch(/Patientez/);
  });

  it("ne reste jamais muet sur une cause inconnue", () => {
    expect(messageErreurMotDePasse(new Error("?"))).toMatch(/pas pu être changé/);
    expect(messageErreurMotDePasse(undefined)).toMatch(/pas pu être changé/);
  });
});
