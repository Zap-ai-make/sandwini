import { describe, expect, it } from "vitest";
import {
  formaterAnciennete,
  formaterDate,
  formaterDateCourte,
  formaterDateHeure,
  formaterMontant,
  formaterNombre,
} from "./format";

/* Les séparateurs de milliers produits par Intl en français sont des espaces
   insécables, fines selon la version d’ICU. Les tests comparent sur du texte
   normalisé : ce qui compte est le groupage, pas l’octet exact. */
const sansEspacesFines = (texte: string) => texte.replace(/[  ]/g, " ");

describe("formaterMontant", () => {
  it("groupe les milliers et suffixe la devise", () => {
    expect(sansEspacesFines(formaterMontant(1250000))).toBe("1 250 000 FCFA");
  });

  it("laisse les petits montants sans séparateur", () => {
    expect(sansEspacesFines(formaterMontant(500))).toBe("500 FCFA");
  });

  it("affiche zéro plutôt que rien — un reste dû nul est une information", () => {
    expect(sansEspacesFines(formaterMontant(0))).toBe("0 FCFA");
  });

  it("n’affiche jamais de décimale, le FCFA ne se divise pas", () => {
    expect(sansEspacesFines(formaterMontant(1500.6))).toBe("1 501 FCFA");
  });

  it("rend les montants négatifs lisibles — un écart d’inventaire peut l’être", () => {
    expect(sansEspacesFines(formaterMontant(-2000))).toBe("-2 000 FCFA");
  });

  it("dégrade proprement sur une valeur absente plutôt que d’afficher NaN", () => {
    expect(formaterMontant(Number.NaN)).toBe("— FCFA");
    expect(formaterMontant(Number.POSITIVE_INFINITY)).toBe("— FCFA");
  });
});

describe("formaterNombre", () => {
  it("groupe sans devise", () => {
    expect(sansEspacesFines(formaterNombre(12000))).toBe("12 000");
  });

  it("dégrade sans devise elle non plus", () => {
    expect(formaterNombre(Number.NaN)).toBe("—");
  });
});

describe("formatage des dates", () => {
  const jour = new Date(2026, 7, 25, 14, 30);

  it("écrit la date longue en français", () => {
    expect(sansEspacesFines(formaterDate(jour))).toBe("25 août 2026");
  });

  it("écrit la date courte sur deux chiffres", () => {
    expect(formaterDateCourte(jour)).toBe("25/08/26");
  });

  it("joint date et heure", () => {
    expect(sansEspacesFines(formaterDateHeure(jour))).toBe("25/08/26 à 14:30");
  });

  it("dégrade sur une date invalide plutôt que d’écrire « Invalid Date »", () => {
    const cassee = new Date("pas une date");
    expect(formaterDate(cassee)).toBe("—");
    expect(formaterDateCourte(cassee)).toBe("—");
    expect(formaterDateHeure(cassee)).toBe("—");
  });
});

describe("formaterAnciennete", () => {
  it("dit les deux premiers jours avec des mots, pas avec un compteur", () => {
    expect(formaterAnciennete(0)).toBe("aujourd’hui");
    expect(formaterAnciennete(1)).toBe("hier");
  });

  it("reprend le nombre au-delà : c’est lui qu’on compare d’une ligne à l’autre", () => {
    expect(formaterAnciennete(2)).toBe("il y a 2 jours");
    expect(formaterAnciennete(47)).toBe("il y a 47 jours");
  });

  it("dit « date inconnue » plutôt que d’inventer un chiffre", () => {
    expect(formaterAnciennete(null)).toBe("date inconnue");
    expect(formaterAnciennete(Number.NaN)).toBe("date inconnue");
  });
});
