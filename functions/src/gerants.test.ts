import { describe, expect, it } from "vitest";
import { LONGUEUR_MOT_DE_PASSE, fermeLesSessions, lireModification } from "./gerants";

/**
 * La lecture d'une demande de modification de compte (S52).
 *
 * Ce qui se vérifie ici tient en une phrase : **un champ absent et un champ
 * vidé ne demandent pas la même chose**. Absent veut dire « n'y touche pas » ;
 * vide veut dire « efface-le », ce qu'aucun des trois champs ne permet — un
 * gérant sans nom, sans adresse ou sans mot de passe n'est pas un compte. Si
 * l'un passait pour l'autre, le formulaire annoncerait un enregistrement réussi
 * en n'ayant rien fait, ou couperait l'accès de quelqu'un sans le dire.
 *
 * Même grain que `numerotation.ts` : la règle qui décide se vérifie en
 * millisecondes, sans émulateur. Le câblage, lui, se vérifie sur émulateur
 * (`fonctions/comptes.test.ts`).
 */

const modification = (data: unknown) => {
  const lecture = lireModification(data);
  if ("invalide" in lecture) throw new Error(`Refusée : ${lecture.invalide}`);
  return lecture.modification;
};

const refus = (data: unknown) => {
  const lecture = lireModification(data);
  if (!("invalide" in lecture)) throw new Error("Acceptée alors qu'elle devait être refusée.");
  return lecture.invalide;
};

describe("lireModification", () => {
  it("refuse une demande qui ne demande rien", () => {
    expect(refus({})).toMatch(/aucune modification/i);
  });

  it("refuse ce qui n’est pas un objet", () => {
    expect(refus(null)).toMatch(/aucune modification/i);
    expect(refus("nom")).toMatch(/aucune modification/i);
  });

  it("lit un nom seul, et laisse les deux autres champs intacts", () => {
    expect(modification({ nom: "Issaka Ouédraogo" })).toEqual({
      nom: "Issaka Ouédraogo",
      email: null,
      motDePasse: null,
    });
  });

  it("rogne le nom", () => {
    expect(modification({ nom: "  Issaka  " }).nom).toBe("Issaka");
  });

  /**
   * Un champ vidé n'est pas un champ absent (même grain que D101 et D105).
   *
   * Le formulaire envoie ce que la personne a tapé. Si une chaîne vide valait
   * « n'y touche pas », effacer le nom puis enregistrer répondrait « c'est
   * fait » sans que rien n'ait changé.
   */
  it("refuse un nom vidé, au lieu de l’ignorer", () => {
    expect(refus({ nom: "" })).toMatch(/nom/i);
    expect(refus({ nom: "   " })).toMatch(/nom/i);
  });

  it("refuse un nom trop long", () => {
    expect(refus({ nom: "a".repeat(201) })).toMatch(/nom/i);
    expect(modification({ nom: "a".repeat(200) }).nom).toHaveLength(200);
  });

  it("met l’adresse en minuscules et la rogne", () => {
    expect(modification({ email: "  Issaka@SDI.TEST " }).email).toBe("issaka@sdi.test");
  });

  it("refuse une adresse mal formée", () => {
    for (const email of ["issaka", "issaka@", "@sdi.test", "issaka@sdi", "a b@sdi.test"]) {
      expect(refus({ email })).toMatch(/adresse/i);
    }
  });

  it("refuse un mot de passe plus court que la création ne l’exige", () => {
    expect(refus({ motDePasse: "a".repeat(LONGUEUR_MOT_DE_PASSE - 1) })).toMatch(/mot de passe/i);
    expect(modification({ motDePasse: "a".repeat(LONGUEUR_MOT_DE_PASSE) }).motDePasse).toHaveLength(
      LONGUEUR_MOT_DE_PASSE,
    );
  });

  /**
   * Le mot de passe n'est pas rogné, et c'est volontaire.
   *
   * Une espace de tête ou de fin fait partie du secret : la retirer donnerait un
   * mot de passe que la personne ne retrouverait pas en le retapant.
   */
  it("ne rogne pas le mot de passe", () => {
    expect(modification({ motDePasse: " moto2026sdi " }).motDePasse).toBe(" moto2026sdi ");
  });

  it("refuse un mot de passe trop long pour Firebase", () => {
    expect(refus({ motDePasse: "a".repeat(129) })).toMatch(/mot de passe/i);
  });

  it("refuse un champ qui n’est pas du texte", () => {
    expect(refus({ nom: 12 })).toMatch(/nom/i);
    expect(refus({ email: true })).toMatch(/adresse/i);
    expect(refus({ motDePasse: ["secret"] })).toMatch(/mot de passe/i);
  });

  it("lit les trois champs ensemble", () => {
    expect(modification({ nom: "Issaka", email: "I@sdi.test", motDePasse: "moto2026sdi" })).toEqual({
      nom: "Issaka",
      email: "i@sdi.test",
      motDePasse: "moto2026sdi",
    });
  });

  /** `undefined` explicite se lit comme l'absence : c'est ce qu'envoie le client. */
  it("traite un champ à undefined comme absent", () => {
    expect(modification({ nom: "Issaka", email: undefined, motDePasse: undefined })).toEqual({
      nom: "Issaka",
      email: null,
      motDePasse: null,
    });
  });
});

/**
 * Ce qui coupe les sessions, et ce qui ne les coupe pas.
 *
 * L'adresse est l'identifiant de connexion, le mot de passe en est la clé :
 * changer l'un ou l'autre sans révoquer les jetons laisserait les sessions déjà
 * ouvertes travailler jusqu'à l'expiration, soit jusqu'à une heure — c'est le
 * raisonnement déjà écrit dans `attribuerBoutique`.
 *
 * Le nom affiché ne change aucun droit. Déconnecter quelqu'un pour une faute de
 * frappe dans son nom serait une punition sans motif.
 */
describe("fermeLesSessions", () => {
  it("ferme les sessions quand l’adresse de connexion change", () => {
    expect(fermeLesSessions({ nom: null, email: "i@sdi.test", motDePasse: null })).toBe(true);
  });

  it("ferme les sessions quand le mot de passe change", () => {
    expect(fermeLesSessions({ nom: null, email: null, motDePasse: "moto2026sdi" })).toBe(true);
  });

  it("ne ferme rien pour un simple nom corrigé", () => {
    expect(fermeLesSessions({ nom: "Issaka", email: null, motDePasse: null })).toBe(false);
  });
});
