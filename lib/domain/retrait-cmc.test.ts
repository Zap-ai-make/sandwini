import { describe, expect, it } from "vitest";
import {
  LONGUEUR_NOM_MAX,
  RETRAIT_CMC_VIDE,
  chercherRetraitsCmc,
  normaliserRetraitCmc,
  validerRetraitCmc,
  type RetraitCmc,
  type SaisieRetraitCmc,
} from "./retrait-cmc";

/**
 * Le registre des CMC retirés (26 octobre 2026).
 *
 * Ce que ces tests gardent : qu'une ligne désigne toujours **quelqu'un** et
 * **une moto** — sans quoi elle ne prouve pas que le papier est sorti — et
 * qu'elle n'exige rien de plus, le comptoir ne refusant pas un CMC à
 * quelqu'un qui n'a pas de téléphone.
 */

const saisie = (partie: Partial<SaisieRetraitCmc> = {}): SaisieRetraitCmc => ({
  ...RETRAIT_CMC_VIDE,
  nom: "Yameogo",
  numeroMoto: "MH8DL15AZTJ506023",
  ...partie,
});

const normaliser = (brut: string) =>
  brut
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

describe("validerRetraitCmc", () => {
  it("accepte un nom et un numéro de moto", () => {
    expect(validerRetraitCmc(saisie())).toBeNull();
  });

  it("n’exige ni prénom ni téléphone", () => {
    /* On ne refuse pas de remettre un CMC à quelqu'un qui n'a pas de
       téléphone : le registre note ce qu'on sait, pas ce qu'on exige. */
    expect(validerRetraitCmc(saisie({ prenom: "", telephone: "" }))).toBeNull();
  });

  it("refuse une ligne sans nom", () => {
    expect(validerRetraitCmc(saisie({ nom: "   " }))?.toLowerCase()).toContain("nom");
  });

  it("refuse une ligne sans numéro de moto", () => {
    /* Sans lui, la ligne ne dit pas quel CMC est sorti. */
    expect(validerRetraitCmc(saisie({ numeroMoto: "" }))?.toLowerCase()).toContain("moto");
  });

  it("borne les textes", () => {
    expect(validerRetraitCmc(saisie({ nom: "x".repeat(LONGUEUR_NOM_MAX + 1) }))).toMatch(
      new RegExp(String(LONGUEUR_NOM_MAX)),
    );
    expect(validerRetraitCmc(saisie({ prenom: "x".repeat(LONGUEUR_NOM_MAX + 1) }))).toMatch(
      /prénom/i,
    );
  });
});

describe("normaliserRetraitCmc", () => {
  it("met le numéro de moto sous la forme du reste du produit", () => {
    /* La même forme que partout : sans espaces ni tirets, en capitales. C'est
       ce qui permet de retrouver la ligne en tapant le numéro tel qu'on l'a
       sous les yeux. */
    const propre = normaliserRetraitCmc(saisie({ numeroMoto: " mh8dl15-aztj 506023 " }));
    expect(propre.numeroMoto).toBe("MH8DL15AZTJ506023");
  });

  it("garde les noms tels qu’ils s’écrivent, espaces en moins", () => {
    const propre = normaliserRetraitCmc(saisie({ nom: "  Yaméogo  ", prenom: " Lassané " }));
    expect(propre.nom).toBe("Yaméogo");
    expect(propre.prenom).toBe("Lassané");
  });
});

describe("chercherRetraitsCmc", () => {
  const ligne = (partie: Partial<RetraitCmc>): RetraitCmc =>
    ({
      id: "r1",
      boutiqueId: "PTG",
      nom: "Yameogo",
      prenom: "Lassane",
      telephone: "70760240",
      numeroMoto: "MH8DL15AZTJ506023",
      date: null,
      auteur: "Moussa",
      ...partie,
    }) as RetraitCmc;

  const registre = [
    ligne({ id: "r1" }),
    ligne({
      id: "r2",
      nom: "Compaore",
      prenom: "Idrissa",
      telephone: "03020104",
      numeroMoto: "MLTDHKHDS18225863",
    }),
  ];

  it("rend tout le registre quand rien n’est cherché", () => {
    expect(chercherRetraitsCmc(registre, "  ", normaliser)).toHaveLength(2);
  });

  it("trouve par le nom, par le prénom et par le téléphone", () => {
    expect(chercherRetraitsCmc(registre, "compaore", normaliser).map((l) => l.id)).toEqual(["r2"]);
    expect(chercherRetraitsCmc(registre, "lassane", normaliser).map((l) => l.id)).toEqual(["r1"]);
    expect(chercherRetraitsCmc(registre, "70760240", normaliser).map((l) => l.id)).toEqual(["r1"]);
  });

  it("trouve par un fragment du numéro de moto", () => {
    /* On relève souvent les derniers caractères du cadre plutôt que la suite
       entière. */
    expect(chercherRetraitsCmc(registre, "506023", normaliser).map((l) => l.id)).toEqual(["r1"]);
  });

  it("exige que chaque mot se retrouve", () => {
    expect(chercherRetraitsCmc(registre, "yameogo lassane", normaliser)).toHaveLength(1);
    expect(chercherRetraitsCmc(registre, "yameogo idrissa", normaliser)).toHaveLength(0);
  });
});
