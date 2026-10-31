import { describe, expect, it } from "vitest";
import {
  LONGUEUR_MOTIF_ANNULATION_MAX,
  dossierApresAnnulation,
  motifDeCorrection,
  remboursementsDAnnulation,
  saisieDeCorrection,
  totalARendre,
  validerMotifAnnulation,
} from "./annulation-vente";
import type { DossierCarteGrise } from "./dossier-carte-grise";
import type { Vente, Versement } from "./vente";

/**
 * Annuler et corriger une vente de moto (S25).
 *
 * Ce que ces tests gardent, ce sont les trois principes de D10 vus du domaine :
 * l'argent ressort exactement comme il est entré — versement par versement,
 * même moyen, même nature (recette ou dépôt de tranches) — ; un dossier de
 * carte grise déjà parti n'est pas effacé ; et une correction repart de ce qui
 * avait été saisi, au franc près.
 */
const vente = (partie: Partial<Vente> = {}): Vente =>
  ({
    id: "v1",
    numero: "PTG-2610-0042",
    numeroInitial: "PTG-2610-0042",
    boutiqueId: "PTG",
    motoId: "moto-1",
    clientId: "client-1",
    prixConvenu: 1_200_000,
    modePaiement: "credit",
    carteGrise: true,
    casque: false,
    totalPaye: 500_000,
    resteDu: 700_000,
    motoRemise: true,
    annulation: null,
    remplaceId: null,
    ...partie,
  }) as Vente;

const versement = (partie: Partial<Versement> = {}): Versement => ({
  id: "x1",
  venteId: "v1",
  numeroRecu: "PTG-2610-0042",
  date: new Date(2026, 9, 20),
  montant: 300_000,
  moyenPaiement: "especes",
  reference: "",
  encaissementId: "e1",
  operateur: "",
  ...partie,
});

describe("validerMotifAnnulation", () => {
  it("exige un motif", () => {
    expect(validerMotifAnnulation("")).toMatch(/motif/i);
    expect(validerMotifAnnulation("   ")).toMatch(/motif/i);
  });

  it("le borne", () => {
    expect(validerMotifAnnulation("m".repeat(LONGUEUR_MOTIF_ANNULATION_MAX + 1))).toMatch(
      /motif/i,
    );
  });

  it("accepte un motif court", () => {
    expect(validerMotifAnnulation("Le client s’est rétracté")).toBeNull();
  });
});

describe("remboursementsDAnnulation", () => {
  it("rend chaque versement, par le même moyen", () => {
    const remboursements = remboursementsDAnnulation(vente(), [
      versement({ id: "x1", montant: 300_000, moyenPaiement: "especes" }),
      versement({ id: "x2", montant: 200_000, moyenPaiement: "orange_money" }),
    ]);
    expect(remboursements).toEqual([
      { versementId: "x1", montant: 300_000, moyenPaiement: "especes", categorieTranches: false },
      {
        versementId: "x2",
        montant: 200_000,
        moyenPaiement: "orange_money",
        categorieTranches: false,
      },
    ]);
  });

  it("ne rend que les versements de cette vente", () => {
    expect(
      remboursementsDAnnulation(vente(), [versement({ venteId: "autre", montant: 100_000 })]),
    ).toEqual([]);
  });

  it("rend un dépôt de tranches comme un dépôt, et non comme une recette", () => {
    /* La moto dort au magasin : l'argent versé était un engagement (§6.2), et
       le rendre ne touche pas la recette du jour. */
    const [remboursement] = remboursementsDAnnulation(
      vente({ modePaiement: "tranches", motoRemise: false }),
      [versement()],
    );
    expect(remboursement.categorieTranches).toBe(true);
  });

  it("ne rend rien d’une vente où rien n’a été versé", () => {
    expect(remboursementsDAnnulation(vente({ totalPaye: 0 }), [])).toEqual([]);
  });

  it("additionne ce qui sera rendu", () => {
    expect(
      totalARendre(vente(), [
        versement({ id: "x1", montant: 300_000 }),
        versement({ id: "x2", montant: 200_000 }),
        versement({ id: "x3", venteId: "autre", montant: 999_000 }),
      ]),
    ).toBe(500_000);
  });
});

describe("dossierApresAnnulation", () => {
  const dossier = (partie: Partial<DossierCarteGrise> = {}) =>
    ({
      deposeLe: null,
      prestataireNom: "",
      immatriculation: "",
      revenuLe: null,
      remisLe: null,
      ...partie,
    }) as DossierCarteGrise;

  it("écarte un dossier qui n’est jamais parti", () => {
    expect(dossierApresAnnulation(dossier())).toEqual({ statut: "non_applicable" });
  });

  it("garde, marqué, un dossier dont la carte est déjà partie", () => {
    /* Arbitrage du 31 octobre 2026 : on annule quand même, et le dossier reste
       au classeur jusqu'au retour de la carte. */
    expect(dossierApresAnnulation(dossier({ deposeLe: new Date(2026, 9, 1) }))).toEqual({
      venteAnnulee: true,
    });
    expect(dossierApresAnnulation(dossier({ prestataireNom: "Kaboré" }))).toEqual({
      venteAnnulee: true,
    });
    expect(dossierApresAnnulation(dossier({ immatriculation: "11 KM 4521" }))).toEqual({
      venteAnnulee: true,
    });
  });
});

describe("la correction", () => {
  it("nomme dans le motif la vente qui remplace, par son numéro lisible", () => {
    expect(motifDeCorrection("PTG-2610-0044")).toBe("Corrigée par la vente 0044");
  });

  it("repart de la vente telle qu’elle a été saisie", () => {
    const saisie = saisieDeCorrection(vente(), [
      versement({ id: "x1", montant: 300_000, moyenPaiement: "especes" }),
      versement({
        id: "x2",
        montant: 200_000,
        moyenPaiement: "wave",
        reference: "W-123",
        date: new Date(2026, 9, 25),
      }),
    ]);
    expect(saisie).toEqual({
      motos: [{ motoId: "moto-1", prixConvenu: "1200000" }],
      clientId: "client-1",
      modePaiement: "credit",
      carteGrise: true,
      casque: false,
      montantEncaisse: "500000",
      /* Le moyen et la référence du dernier versement : c'est le geste de
         caisse le plus récent, celui qu'on a le plus de chances de refaire. */
      moyenPaiement: "wave",
      reference: "W-123",
    });
  });

  it("laisse le montant vide quand rien n’a été versé", () => {
    expect(saisieDeCorrection(vente(), []).montantEncaisse).toBe("");
  });

  it("coche par défaut ce qu’une vente d’avant S44 ne disait pas", () => {
    const saisie = saisieDeCorrection(vente({ carteGrise: null, casque: null }), []);
    expect(saisie.carteGrise).toBe(true);
    expect(saisie.casque).toBe(true);
  });
});
