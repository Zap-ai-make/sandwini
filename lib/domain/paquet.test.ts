import { describe, expect, it } from "vitest";
import type { DocumentDossier, StatutDocument } from "./vente";
import {
  CARTES_PAR_PAQUET_MAX,
  cartesConfiables,
  etatPaquet,
  validerPaquet,
  type PaquetCartesGrises,
  type SaisiePaquet,
} from "./paquet";

const SAISIE: SaisiePaquet = {
  prestataireId: "p1",
  prestataireNom: "Ouédraogo Plaques",
  deposeLe: "2026-10-15",
  avance: "150000",
  moyenPaiement: "especes",
  disponibleLe: "",
  venteIds: ["v1", "v2", "v3"],
};

describe("validerPaquet", () => {
  it("accepte un paquet complet", () => {
    expect(validerPaquet(SAISIE)).toBeNull();
  });

  /* **Point de vigilance 4.** Un paquet sans carte écrirait une sortie de
     caisse sans contrepartie : de l’argent parti pour rien. */
  it("refuse un paquet sans carte", () => {
    expect(validerPaquet({ ...SAISIE, venteIds: [] })).toMatch(/au moins une carte/i);
  });

  /* **Point de vigilance 3.** L’écran coche des lignes ; rien n’empêche deux
     cases de désigner la même vente si la liste se recompose sous les doigts.
     Deux écritures sur le même document dans un lot Firestore sont refusées en
     bloc, sans dire laquelle — autant le dire ici, où le message est lisible. */
  it("refuse deux fois la même vente", () => {
    expect(validerPaquet({ ...SAISIE, venteIds: ["v1", "v2", "v1"] })).toMatch(/deux fois/i);
  });

  it("refuse au-delà de la borne, et la borne est dans le message", () => {
    const trop = Array.from({ length: CARTES_PAR_PAQUET_MAX + 1 }, (_, rang) => `v${rang}`);
    const message = validerPaquet({ ...SAISIE, venteIds: trop });
    expect(message).toContain(String(CARTES_PAR_PAQUET_MAX));
  });

  it("accepte exactement la borne", () => {
    const pile = Array.from({ length: CARTES_PAR_PAQUET_MAX }, (_, rang) => `v${rang}`);
    expect(validerPaquet({ ...SAISIE, venteIds: pile })).toBeNull();
  });

  it("refuse un paquet sans prestataire", () => {
    expect(validerPaquet({ ...SAISIE, prestataireId: "" })).toMatch(/prestataire/i);
  });

  /* Même règle que le dépôt carte par carte : zéro n’est pas une avance, c’est
     un travail confié à crédit, et le crédit se modélise ailleurs. */
  it("refuse une avance nulle", () => {
    expect(validerPaquet({ ...SAISIE, avance: "0" })).toMatch(/crédit/i);
  });

  it("refuse une date annoncée antérieure au dépôt", () => {
    expect(validerPaquet({ ...SAISIE, disponibleLe: "2026-10-01" })).toMatch(/antérieure/i);
  });
});

const carte = (venteId: string, statut: StatutDocument): DocumentDossier =>
  ({ id: "carte_grise", venteId, type: "carte_grise", statut }) as DocumentDossier;

describe("etatPaquet", () => {
  const AUJOURDHUI = new Date("2026-10-27T10:00:00");

  const paquet = (partie: Partial<PaquetCartesGrises> = {}): PaquetCartesGrises => ({
    id: "lot1",
    boutiqueId: "PTG",
    prestataireId: "p1",
    prestataireNom: "Ouédraogo Plaques",
    deposeLe: new Date("2026-10-15T12:00:00"),
    disponibleLe: null,
    avance: 150_000,
    venteIds: ["v1", "v2", "v3"],
    ...partie,
  });

  it("compte ce qui est dehors et ce qui est revenu", () => {
    const etat = etatPaquet(
      paquet(),
      [
        carte("v1", "revenu_magasin"),
        carte("v2", "chez_prestataire"),
        carte("v3", "chez_prestataire"),
      ],
      AUJOURDHUI,
    );
    expect(etat).toMatchObject({ total: 3, dehors: 2, revenues: 1, solde: false });
  });

  /* **Arbitrage 9 : le retour est partiel par défaut.** « Il peut partir avec
     10 et ramener 5 si c’est ce qui est dispo. » Deux revenues ne soldent pas
     le paquet, et aucun geste n’a à le dire. */
  it("reste ouvert sur un retour partiel, sans qu’aucun geste ne le dise", () => {
    const etat = etatPaquet(
      paquet(),
      [
        carte("v1", "revenu_magasin"),
        carte("v2", "revenu_magasin"),
        carte("v3", "chez_prestataire"),
      ],
      AUJOURDHUI,
    );
    expect(etat.solde).toBe(false);
    expect(etat.dehors).toBe(1);
  });

  it("est soldé par calcul quand plus rien n’est dehors", () => {
    const etat = etatPaquet(
      paquet(),
      [
        carte("v1", "revenu_magasin"),
        carte("v2", "revenu_magasin"),
        carte("v3", "revenu_magasin"),
      ],
      AUJOURDHUI,
    );
    expect(etat.solde).toBe(true);
    expect(etat.dehors).toBe(0);
  });

  /* **Point de vigilance 2.** Une liste vide et « toutes revenues » rendent le
     même compte de cartes dehors : zéro. Sans distinction, un paquet dont les
     documents ne sont pas encore lus s’afficherait soldé. */
  it("n’est pas soldé tant que ses documents ne sont pas lus", () => {
    expect(etatPaquet(paquet(), [], AUJOURDHUI).solde).toBe(false);
    expect(etatPaquet(paquet(), [], AUJOURDHUI).lu).toBe(false);
  });

  /* **Point de vigilance 1.** Une vente renumérotée garde son identifiant :
     seul son numéro affiché gagne un `-B`. Le rapprochement se fait donc sur
     `venteId`, jamais sur le numéro. */
  it("ne retient que les cartes de ses propres ventes", () => {
    const etat = etatPaquet(
      paquet(),
      [carte("v1", "revenu_magasin"), carte("etrangere", "chez_prestataire")],
      AUJOURDHUI,
    );
    expect(etat.total).toBe(3);
    expect(etat.revenues).toBe(1);
    expect(etat.dehors).toBe(0);
  });

  it("compte les jours depuis le dépôt, de jour à jour", () => {
    expect(etatPaquet(paquet(), [], AUJOURDHUI).joursDehors).toBe(12);
  });

  /* Le retard est le seul signal qui vaut un rappel : un paquet annoncé pour
     une date dépassée et toujours dehors. */
  it("dit le retard quand la date annoncée est passée et qu’il reste des cartes", () => {
    const annonce = paquet({ disponibleLe: new Date("2026-10-20T12:00:00") });
    expect(etatPaquet(annonce, [carte("v1", "chez_prestataire")], AUJOURDHUI).enRetard).toBe(true);
  });

  it("ne dit pas le retard quand tout est revenu, même après la date", () => {
    const annonce = paquet({ venteIds: ["v1"], disponibleLe: new Date("2026-10-20T12:00:00") });
    expect(etatPaquet(annonce, [carte("v1", "revenu_magasin")], AUJOURDHUI).enRetard).toBe(false);
  });
});

describe("cartesConfiables", () => {
  /* **Point de vigilance 5.** Une carte déjà chez un prestataire ne peut pas
     entrer dans un nouveau paquet : l’avance serait versée deux fois pour le
     même travail, et la base refuserait la transition en bloc — un refus muet
     sur un geste déjà affiché comme fait. */
  it("ne retient que les cartes grises encore à faire", () => {
    const confiables = cartesConfiables([
      carte("v1", "a_faire"),
      carte("v2", "chez_prestataire"),
      carte("v3", "revenu_magasin"),
      carte("v4", "non_applicable"),
      carte("v5", "a_faire"),
    ]);
    expect(confiables.map((confiable) => confiable.venteId)).toEqual(["v1", "v5"]);
  });

  it("écarte les papiers qui ne passent pas par un prestataire", () => {
    const quittance = { id: "quittance", venteId: "v9", type: "quittance", statut: "a_faire" };
    expect(cartesConfiables([quittance as DocumentDossier])).toEqual([]);
  });
});
