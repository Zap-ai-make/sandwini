import { describe, expect, it } from "vitest";

import { trouverDestination } from "./destinations";
import { clesDuManuel, FICHES, sommaire, THEMES, trouverFiche } from "./manuel";

/**
 * Le mode d'emploi que l'assistant consulte.
 *
 * **Pourquoi un manuel plutôt que des phrases dans le prompt.** Un modèle à qui
 * l'on décrit l'application la paraphrase, puis finit par inventer un bouton
 * qui n'existe pas — et quelqu'un le cherche pendant dix minutes. Ici il lit
 * une fiche écrite, ou il dit qu'il ne sait pas.
 *
 * Ces tests sont ce qui empêche le manuel de vieillir en silence.
 */
describe("le manuel", () => {
  it("n’envoie que sur des écrans que l’assistant sait ouvrir", () => {
    /* Le même garde-fou que le catalogue des destinations, et pour la même
       raison : un écran renommé laisserait une fiche désigner une page
       d'erreur, et rien dans la compilation ne le dirait. En passant par les
       destinations, on hérite de leur vérification sur le disque. */
    for (const fiche of FICHES) {
      if (fiche.ecran === null) continue;
      expect(trouverDestination(fiche.ecran), `${fiche.cle} → ${fiche.ecran}`).not.toBeNull();
    }
  });

  it("donne des clés uniques, sinon la seconde serait inatteignable", () => {
    const cles = FICHES.map((fiche) => fiche.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("dit pour chaque fiche à quoi elle sert et comment on s’y prend", () => {
    /* Une fiche sans étapes n'apprend rien : elle renvoie vers un écran, ce
       que la navigation fait déjà. */
    for (const fiche of FICHES) {
      expect(fiche.quand, fiche.cle).toBeTruthy();
      expect(fiche.etapes.length, fiche.cle).toBeGreaterThanOrEqual(2);
      expect(THEMES).toContain(fiche.theme);
    }
  });

  it("ne sert jamais au gérant une fiche réservée au responsable", () => {
    /* Le mur de D2 ne se franchit pas par le mode d'emploi. Décrire à un
       gérant comment poser un prix d'achat lui apprendrait l'existence d'un
       écran que sa garde lui refuse — et donnerait l'impression que
       l'application est cassée. */
    const reservees = FICHES.filter((fiche) => fiche.responsable);
    expect(reservees.length).toBeGreaterThan(0);

    for (const fiche of reservees) {
      expect(trouverFiche(fiche.cle, "gerant"), fiche.cle).toBeNull();
      expect(trouverFiche(fiche.cle, "responsable"), fiche.cle).not.toBeNull();
    }
  });

  it("propose au gérant un sommaire qui ne cite que ce qu’il peut faire", () => {
    const titresGerant = sommaire("gerant").flatMap((groupe) => groupe.fiches.map((f) => f.cle));
    const reservees = FICHES.filter((fiche) => fiche.responsable).map((fiche) => fiche.cle);
    for (const cle of reservees) expect(titresGerant).not.toContain(cle);

    /* Et il reste de quoi tenir une formation : un sommaire vide renverrait
       quelqu'un qui demande « qu'est-ce que je peux faire » à rien du tout. */
    expect(titresGerant.length).toBeGreaterThan(5);
  });

  it("n’annonce aucun thème qu’il ne remplit pas", () => {
    /* Un titre de rubrique suivi de rien est un rangement qui ment — la même
       règle que les groupes de la navigation. */
    for (const groupe of sommaire("gerant")) {
      expect(groupe.fiches.length, groupe.theme).toBeGreaterThan(0);
    }
    for (const groupe of sommaire("responsable")) {
      expect(groupe.fiches.length, groupe.theme).toBeGreaterThan(0);
    }
  });

  it("refuse une fiche inventée plutôt que d’en choisir une au hasard", () => {
    expect(trouverFiche("comment_doubler_le_chiffre_d_affaires", "responsable")).toBeNull();
    expect(trouverFiche("", "gerant")).toBeNull();
  });

  it("retrouve une fiche quelle que soit la casse", () => {
    expect(trouverFiche("  Vendre_Une_Moto ", "gerant")?.cle).toBe("vendre_une_moto");
  });

  it("annonce au modèle exactement les clés qu’il a le droit de demander", () => {
    /* La description de l'outil cite cette liste. Si elle citait des fiches
       réservées, le modèle les demanderait à un gérant et recevrait un refus —
       en ayant déjà annoncé qu'il allait expliquer. */
    const gerant = clesDuManuel("gerant");
    for (const fiche of FICHES.filter((f) => f.responsable)) {
      expect(gerant).not.toContain(fiche.cle);
    }
    expect(clesDuManuel("responsable").split(", ").length).toBe(FICHES.length);
  });
});
