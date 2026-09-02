import { describe, expect, it } from "vitest";
import {
  STATUTS_DOCUMENT,
  TYPES_DOCUMENT,
  type StatutDocument,
  type TypeDocument,
} from "./vente";
import {
  dossierCloturable,
  estEnRetard,
  statutsSuivants,
  transitionAutorisee,
  type EtatDossier,
} from "./dossier";

const doc = (type: TypeDocument, statut: StatutDocument) => ({ type, statut });

const etat = (partie: Partial<EtatDossier> = {}): EtatDossier => ({
  documents: TYPES_DOCUMENT.map((type) => doc(type, "remis_client")),
  soldee: true,
  motoRemise: true,
  ...partie,
});

describe("transitionAutorisee — le chemin normal", () => {
  it("suit le cycle du cahier des charges", () => {
    expect(transitionAutorisee("a_faire", "chez_prestataire")).toBe(true);
    expect(transitionAutorisee("chez_prestataire", "revenu_magasin")).toBe(true);
    expect(transitionAutorisee("revenu_magasin", "remis_client")).toBe(true);
  });

  it("laisse écarter un document que la vente n’inclut pas", () => {
    expect(transitionAutorisee("a_faire", "non_applicable")).toBe(true);
  });

  /* La quittance et le CMC se traitent au magasin : les pages prestataire ne
     listent que carte grise et plaque (§12.2), et un CMC attribué passe
     directement à « revenu au magasin » (§7.2). Les faire transiter par un
     prestataire fictif ferait mentir la donnée. */
  it("laisse un document traité au magasin sauter l’étape du prestataire", () => {
    expect(transitionAutorisee("a_faire", "revenu_magasin")).toBe(true);
  });
});

describe("transitionAutorisee — ce qui est impossible", () => {
  it("ne saute pas la remise au client", () => {
    expect(transitionAutorisee("a_faire", "remis_client")).toBe(false);
    expect(transitionAutorisee("chez_prestataire", "remis_client")).toBe(false);
  });

  it("ne revient jamais en arrière", () => {
    expect(transitionAutorisee("revenu_magasin", "chez_prestataire")).toBe(false);
    expect(transitionAutorisee("revenu_magasin", "a_faire")).toBe(false);
    expect(transitionAutorisee("chez_prestataire", "a_faire")).toBe(false);
  });

  it("ne rouvre pas un document remis ou écarté", () => {
    for (const vers of STATUTS_DOCUMENT) {
      expect(transitionAutorisee("remis_client", vers), `remis_client → ${vers}`).toBe(false);
      expect(transitionAutorisee("non_applicable", vers), `non_applicable → ${vers}`).toBe(false);
    }
  });

  it("n’écarte pas un document déjà engagé chez un prestataire", () => {
    expect(transitionAutorisee("chez_prestataire", "non_applicable")).toBe(false);
  });

  it("ne se rend jamais à soi-même — un changement de statut change le statut", () => {
    for (const statut of STATUTS_DOCUMENT) {
      expect(transitionAutorisee(statut, statut), statut).toBe(false);
    }
  });
});

describe("statutsSuivants", () => {
  it("propose exactement ce que la transition autorise", () => {
    for (const depart of STATUTS_DOCUMENT) {
      for (const arrivee of STATUTS_DOCUMENT) {
        expect(
          statutsSuivants(depart).includes(arrivee),
          `${depart} → ${arrivee}`,
        ).toBe(transitionAutorisee(depart, arrivee));
      }
    }
  });

  it("ne propose rien depuis un statut terminal", () => {
    expect(statutsSuivants("remis_client")).toEqual([]);
    expect(statutsSuivants("non_applicable")).toEqual([]);
  });
});

describe("dossierCloturable", () => {
  it("clôt un dossier dont tout est remis, payé et livré", () => {
    expect(dossierCloturable(etat())).toBe(true);
  });

  it("compte un document écarté comme réglé", () => {
    expect(
      dossierCloturable(
        etat({
          documents: [
            doc("quittance", "remis_client"),
            doc("cmc", "non_applicable"),
            doc("carte_grise", "remis_client"),
            doc("plaque", "non_applicable"),
          ],
        }),
      ),
    ).toBe(true);
  });

  it("ne clôt pas tant qu’un document traîne", () => {
    for (const statut of ["a_faire", "chez_prestataire", "revenu_magasin"] as const) {
      expect(
        dossierCloturable(
          etat({
            documents: [
              doc("quittance", statut),
              doc("cmc", "remis_client"),
              doc("carte_grise", "remis_client"),
              doc("plaque", "remis_client"),
            ],
          }),
        ),
        statut,
      ).toBe(false);
    }
  });

  it("ne clôt pas une vente qui reste due", () => {
    expect(dossierCloturable(etat({ soldee: false }))).toBe(false);
  });

  /* Le cas des tranches : tout est payé, tous les papiers sont remis, mais la
     moto dort encore au magasin. Le dossier n’est pas fini — c’est justement la
     confusion que le cahier interdit entre crédit et tranches (§13). */
  it("ne clôt pas une vente soldée dont la moto n’est pas partie", () => {
    expect(dossierCloturable(etat({ motoRemise: false }))).toBe(false);
  });

  /* Un dossier dont les documents ne sont pas chargés ne doit pas passer pour
     un dossier complet : quatre documents sont attendus, pas « au moins zéro ». */
  it("ne clôt pas un dossier dont les documents manquent", () => {
    expect(dossierCloturable(etat({ documents: [] }))).toBe(false);
    expect(
      dossierCloturable(etat({ documents: [doc("quittance", "remis_client")] })),
    ).toBe(false);
  });
});

describe("estEnRetard", () => {
  const jour = (iso: string) => new Date(`${iso}T12:00:00`);

  it("signale une date de disponibilité dépassée", () => {
    expect(estEnRetard(jour("2026-09-01"), jour("2026-09-02"))).toBe(true);
  });

  it("ne signale rien le jour même — la journée n’est pas finie", () => {
    expect(estEnRetard(jour("2026-09-02"), jour("2026-09-02"))).toBe(false);
  });

  it("ne signale rien à venir, ni sans date annoncée", () => {
    expect(estEnRetard(jour("2026-09-03"), jour("2026-09-02"))).toBe(false);
    expect(estEnRetard(null, jour("2026-09-02"))).toBe(false);
  });

  /* Le retard se compare de jour à jour, pas d’instant à instant : une date
     estimée au 1er n’est pas « en retard » à 8 h le 1er parce qu’elle a été
     saisie à 14 h la veille. */
  it("compare des jours, pas des heures", () => {
    expect(estEnRetard(new Date("2026-09-02T18:00:00"), new Date("2026-09-02T08:00:00"))).toBe(
      false,
    );
  });
});
