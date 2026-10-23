import { describe, expect, it } from "vitest";

import {
  dossierEnCours,
  estTerminal,
  LIBELLE_STATUT_CARTE_GRISE,
  normaliserDossierExterieur,
  statutsSuivants,
  transitionAutorisee,
  validerDossierExterieur,
  validerRemise,
  validerRetour,
  type DossierCarteGrise,
  type SaisieDossierExterieur,
  type SaisieRemise,
} from "./dossier-carte-grise";

/**
 * Le dossier de carte grise, sorti de la vente (S59).
 *
 * **Ce qui change par rapport à S53.** Un dossier vivait *dans* sa vente, donc
 * il n'en existait pas sans vente — or on confie souvent une carte grise venue
 * du dehors. Et son parcours s'arrêtait au retour du prestataire ; le fichier
 * du client montre qu'il y a une étape de plus, la remise, avec le nom et le
 * téléphone de celui qui vient chercher.
 */
describe("le parcours d’une carte grise", () => {
  it("va du magasin au prestataire, revient, puis se remet", () => {
    expect(transitionAutorisee("a_faire", "chez_prestataire")).toBe(true);
    expect(transitionAutorisee("chez_prestataire", "revenu_magasin")).toBe(true);
    expect(transitionAutorisee("revenu_magasin", "remis")).toBe(true);
  });

  it("ne saute jamais le prestataire", () => {
    /* C'est lui qui dit qui détient le papier. Sauter l'étape viderait la
       liste de la seule chose qu'elle sert à dire (D65). */
    expect(transitionAutorisee("a_faire", "revenu_magasin")).toBe(false);
    expect(transitionAutorisee("a_faire", "remis")).toBe(false);
  });

  it("ne revient jamais en arrière", () => {
    expect(transitionAutorisee("revenu_magasin", "chez_prestataire")).toBe(false);
    expect(transitionAutorisee("remis", "revenu_magasin")).toBe(false);
  });

  it("s’arrête à la remise, et pas avant", () => {
    /* **Le changement de définition de S59.** S53 arrêtait le parcours au
       retour au magasin. Le fichier du client montre qu'il manque une étape :
       une carte revenue n'est pas une carte rendue, et c'est justement celle
       qu'il faut pouvoir retrouver quand quelqu'un vient la chercher. */
    expect(estTerminal("revenu_magasin")).toBe(false);
    expect(estTerminal("remis")).toBe(true);
    expect(estTerminal("non_applicable")).toBe(true);
    expect(statutsSuivants("remis")).toEqual([]);
  });

  it("laisse écarter un dossier qui n’a pas lieu d’être, mais seulement au début", () => {
    expect(transitionAutorisee("a_faire", "non_applicable")).toBe(true);
    /* Une carte déjà chez quelqu'un ne devient pas « sans objet » : elle est
       physiquement dehors, et quelqu'un l'attend. */
    expect(transitionAutorisee("chez_prestataire", "non_applicable")).toBe(false);
  });

  it("nomme chaque étape avec les mots du comptoir", () => {
    expect(LIBELLE_STATUT_CARTE_GRISE.chez_prestataire).toBe("Chez le prestataire");
    expect(LIBELLE_STATUT_CARTE_GRISE.remis).toBe("Remis");
  });
});

describe("ce qui est encore en cours", () => {
  const dossier = (statut: DossierCarteGrise["statut"]) =>
    ({ statut }) as unknown as DossierCarteGrise;

  it("garde tout ce qui n’est ni remis ni écarté", () => {
    /* Y compris une carte revenue : elle attend son propriétaire, et c'est
       exactement la ligne qu'on cherche quand il se présente au comptoir. */
    expect(dossierEnCours(dossier("a_faire"))).toBe(true);
    expect(dossierEnCours(dossier("chez_prestataire"))).toBe(true);
    expect(dossierEnCours(dossier("revenu_magasin"))).toBe(true);
    expect(dossierEnCours(dossier("remis"))).toBe(false);
    expect(dossierEnCours(dossier("non_applicable"))).toBe(false);
  });
});

describe("un dossier venu du dehors", () => {
  const SAISIE: SaisieDossierExterieur = {
    clientNom: "Sawadogo Harouna",
    motoLibelle: "SR - 115",
    numeroChassis: "02SY052982",
  };

  it("accepte un propriétaire et un châssis", () => {
    expect(validerDossierExterieur(SAISIE)).toBeNull();
  });

  it("exige un nom : sans lui, personne ne vient chercher le papier", () => {
    expect(validerDossierExterieur({ ...SAISIE, clientNom: "  " })).toMatch(/nom/i);
  });

  it("exige un châssis : c’est l’identité de la moto", () => {
    expect(validerDossierExterieur({ ...SAISIE, numeroChassis: "" })).toMatch(/châssis/i);
  });

  it("n’impose aucune longueur de châssis", () => {
    /* **Relevé sur le fichier du client le 21 octobre 2026 :** leurs numéros
       font dix à douze caractères — 10RY243294, 4140RY029597 — et non les
       dix-sept d'une voiture. Une longueur imposée aurait refusé la totalité
       de leurs dossiers. */
    expect(validerDossierExterieur({ ...SAISIE, numeroChassis: "10RY243294" })).toBeNull();
    expect(validerDossierExterieur({ ...SAISIE, numeroChassis: "4140RY029597" })).toBeNull();
  });

  it("refuse un châssis qui n’est pas fait de lettres et de chiffres", () => {
    expect(validerDossierExterieur({ ...SAISIE, numeroChassis: "70SJ/0229" })).toMatch(/châssis/i);
  });

  it("se passe du modèle : le fichier du client en a sans", () => {
    expect(validerDossierExterieur({ ...SAISIE, motoLibelle: "" })).toBeNull();
  });

  it("range le châssis en majuscules, sans espaces ni tirets", () => {
    /* Deux saisies du même numéro doivent donner la même chaîne, sinon le
       contrôle d'unicité laisse passer un doublon. */
    const propre = normaliserDossierExterieur({ ...SAISIE, numeroChassis: " 02sy-052982 " });
    expect(propre.numeroChassis).toBe("02SY052982");
    expect(propre.clientNom).toBe("Sawadogo Harouna");
  });
});

describe("le retour du prestataire", () => {
  it("accepte le numéro d’immatriculation", () => {
    expect(validerRetour({ immatriculation: "7078 7DQ 04", revenuLe: "2026-07-29" })).toBeNull();
  });

  it("ne bloque pas un retour dont on n’a pas encore le numéro", () => {
    /* La carte est physiquement revenue : refuser de l'enregistrer parce que
       le numéro n'est pas sous la main ferait mentir l'écran sur un fait
       accompli. On le complétera. */
    expect(validerRetour({ immatriculation: "", revenuLe: "2026-07-29" })).toBeNull();
  });

  it("exige une date de retour, et une vraie", () => {
    expect(validerRetour({ immatriculation: "", revenuLe: "" })).toMatch(/date/i);
    expect(validerRetour({ immatriculation: "", revenuLe: "2026-02-31" })).toMatch(/date/i);
  });
});

describe("la remise au comptoir", () => {
  const REMISE: SaisieRemise = {
    nom: "Ouédraogo Issa",
    telephone: "70518381",
    remisLe: "2026-07-29",
  };

  it("accepte un nom, un téléphone et une date", () => {
    expect(validerRemise(REMISE)).toBeNull();
  });

  it("exige le nom de celui qui est venu", () => {
    /* **Ce n'est pas toujours l'acheteur** — c'est souvent un frère ou un
       employé. C'est précisément pour ça qu'on l'écrit : sans nom, la ligne ne
       dit pas à qui le papier a été remis. */
    expect(validerRemise({ ...REMISE, nom: "   " })).toMatch(/nom/i);
  });

  it("se passe du téléphone sans se bloquer", () => {
    /* Le fichier du client en a, mais tous les retraits n'en portent pas. Un
       champ obligatoire ferait inventer un numéro. */
    expect(validerRemise({ ...REMISE, telephone: "" })).toBeNull();
  });

  it("exige une date de remise", () => {
    expect(validerRemise({ ...REMISE, remisLe: "" })).toMatch(/date/i);
  });
});
