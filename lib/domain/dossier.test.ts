import { describe, expect, it } from "vitest";
import {
  STATUTS_DOCUMENT,
  TYPES_DOCUMENT,
  type DocumentDossier,
  type StatutDocument,
  type TypeDocument,
} from "./vente";
import {
  dossierCloturable,
  estEnRetard,
  estStatutTerminal,
  lireJour,
  passeParUnPrestataire,
  statutsSuivants,
  transitionAutorisee,
  validerDepot,
  dossiersEnAttente,
  FILTRES_DOSSIERS_VIDES,
  type EtatDossier,
  type FiltresDossiers,
  type SaisieDepot,
  type VenteDuDossier,
} from "./dossier";

const doc = (type: TypeDocument, statut: StatutDocument) => ({ type, statut });

const etat = (partie: Partial<EtatDossier> = {}): EtatDossier => ({
  documents: TYPES_DOCUMENT.map((type) => doc(type, "remis_client")),
  soldee: true,
  motoRemise: true,
  ...partie,
});

/** Ceux qui arrivent finis, hors du périmètre de l’entreprise (D65). */
const ARRIVENT_FAITS = ["quittance", "cmc"] as const;
/** Ceux qu’un intervenant externe traite. */
const VIA_PRESTATAIRE = ["carte_grise", "plaque"] as const;

describe("passeParUnPrestataire", () => {
  it("distingue ce qui arrive fait de ce qui se confie", () => {
    for (const type of ARRIVENT_FAITS) expect(passeParUnPrestataire(type), type).toBe(false);
    for (const type of VIA_PRESTATAIRE) expect(passeParUnPrestataire(type), type).toBe(true);
  });
});

describe("la quittance et le CMC arrivent déjà faits", () => {
  /* Le magasin reçoit le produit fini : la quittance accompagne la moto, et le
     CMC s’obtient au ministère avec elle. Ni l’une ni l’autre n’est jamais
     confiée à un prestataire. */
  it("vont du « à faire » au magasin, sans passer par personne", () => {
    for (const type of ARRIVENT_FAITS) {
      expect(transitionAutorisee(type, "a_faire", "revenu_magasin"), type).toBe(true);
      expect(transitionAutorisee(type, "revenu_magasin", "remis_client"), type).toBe(true);
    }
  });

  it("n’ont pas d’étape « chez le prestataire » — personne ne les détient", () => {
    for (const type of ARRIVENT_FAITS) {
      expect(transitionAutorisee(type, "a_faire", "chez_prestataire"), type).toBe(false);
      expect(statutsSuivants(type, "chez_prestataire"), type).toEqual([]);
    }
  });
});

describe("la carte grise et la plaque passent par un prestataire", () => {
  it("suivent le cycle complet du cahier", () => {
    for (const type of VIA_PRESTATAIRE) {
      expect(transitionAutorisee(type, "a_faire", "chez_prestataire"), type).toBe(true);
      expect(transitionAutorisee(type, "chez_prestataire", "revenu_magasin"), type).toBe(true);
      expect(transitionAutorisee(type, "revenu_magasin", "remis_client"), type).toBe(true);
    }
  });

  /* Sauter le dépôt priverait la liste des dossiers du seul renseignement
     qu’elle sert à donner : qui détient le document en ce moment (§7.3). */
  it("ne sautent pas le dépôt : c’est lui qui dit qui détient le document", () => {
    for (const type of VIA_PRESTATAIRE) {
      expect(transitionAutorisee(type, "a_faire", "revenu_magasin"), type).toBe(false);
    }
  });
});

describe("ce qui est impossible pour tous les documents", () => {
  it("laisse écarter un document que la vente n’inclut pas", () => {
    for (const type of TYPES_DOCUMENT) {
      expect(transitionAutorisee(type, "a_faire", "non_applicable"), type).toBe(true);
    }
  });

  it("ne saute jamais la remise au client", () => {
    for (const type of TYPES_DOCUMENT) {
      expect(transitionAutorisee(type, "a_faire", "remis_client"), type).toBe(false);
    }
  });

  it("ne revient jamais en arrière", () => {
    for (const type of TYPES_DOCUMENT) {
      expect(transitionAutorisee(type, "revenu_magasin", "a_faire"), type).toBe(false);
      expect(transitionAutorisee(type, "revenu_magasin", "chez_prestataire"), type).toBe(false);
    }
  });

  it("ne rouvre pas un document remis ou écarté", () => {
    for (const type of TYPES_DOCUMENT) {
      for (const vers of STATUTS_DOCUMENT) {
        expect(transitionAutorisee(type, "remis_client", vers), `${type} remis vers ${vers}`).toBe(
          false,
        );
        expect(
          transitionAutorisee(type, "non_applicable", vers),
          `${type} écarté vers ${vers}`,
        ).toBe(false);
      }
    }
  });

  /* Une avance a été versée et un encaissement écrit : écarter le document
     laisserait de l’argent sorti sans contrepartie. */
  it("n’écarte pas un document déjà déposé chez un prestataire", () => {
    for (const type of VIA_PRESTATAIRE) {
      expect(transitionAutorisee(type, "chez_prestataire", "non_applicable"), type).toBe(false);
    }
  });

  it("ne se rend jamais à soi-même — un changement de statut change le statut", () => {
    for (const type of TYPES_DOCUMENT) {
      for (const statut of STATUTS_DOCUMENT) {
        expect(transitionAutorisee(type, statut, statut), `${type} ${statut}`).toBe(false);
      }
    }
  });
});

describe("statutsSuivants et estStatutTerminal", () => {
  it("proposent exactement ce que la transition autorise", () => {
    for (const type of TYPES_DOCUMENT) {
      for (const depart of STATUTS_DOCUMENT) {
        for (const arrivee of STATUTS_DOCUMENT) {
          expect(
            statutsSuivants(type, depart).includes(arrivee),
            `${type} ${depart} vers ${arrivee}`,
          ).toBe(transitionAutorisee(type, depart, arrivee));
        }
      }
    }
  });

  it("s’arrêtent sur les statuts d’où plus rien ne sort", () => {
    for (const type of TYPES_DOCUMENT) {
      expect(estStatutTerminal(type, "remis_client"), type).toBe(true);
      expect(estStatutTerminal(type, "non_applicable"), type).toBe(true);
      expect(estStatutTerminal(type, "a_faire"), type).toBe(false);
    }
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
              doc("quittance", "remis_client"),
              doc("cmc", "remis_client"),
              doc("carte_grise", statut),
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

  it("ne clôt pas un dossier dont les documents manquent", () => {
    expect(dossierCloturable(etat({ documents: [] }))).toBe(false);
    expect(dossierCloturable(etat({ documents: [doc("quittance", "remis_client")] }))).toBe(false);
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

  it("compare des jours, pas des heures", () => {
    expect(estEnRetard(new Date("2026-09-02T18:00:00"), new Date("2026-09-02T08:00:00"))).toBe(
      false,
    );
  });
});

describe("lireJour", () => {
  it("lit un jour saisi dans un champ de date", () => {
    expect(lireJour("2026-09-03")?.getFullYear()).toBe(2026);
    expect(lireJour("2026-09-03")?.getMonth()).toBe(8);
    expect(lireJour("2026-09-03")?.getDate()).toBe(3);
  });

  /* `new Date(2026, 1, 31)` rend le 3 mars sans se plaindre. Enregistrer une
     date que personne n'a voulue est pire que refuser la saisie. */
  it("refuse un jour qui n’existe pas, plutôt que de le décaler", () => {
    expect(lireJour("2026-02-31")).toBeNull();
    expect(lireJour("2026-13-01")).toBeNull();
  });

  it("refuse ce qui n’a pas la forme d’une date", () => {
    for (const brut of ["", "03/09/2026", "2026-9-3", "hier"]) {
      expect(lireJour(brut), brut).toBeNull();
    }
  });
});

describe("validerDepot", () => {
  const depot = (partie: Partial<SaisieDepot> = {}): SaisieDepot => ({
    prestataireId: "prest-1",
    prestataireNom: "Kaboré Plaques",
    deposeLe: "2026-09-03",
    avance: "15000",
    moyenPaiement: "especes",
    disponibleLe: "2026-09-10",
    ...partie,
  });

  it("accepte un dépôt complet", () => {
    expect(validerDepot(depot())).toBeNull();
  });

  it("accepte un dépôt sans date annoncée — le prestataire ne la donne pas toujours", () => {
    expect(validerDepot(depot({ disponibleLe: "" }))).toBeNull();
  });

  it("exige de savoir à qui le document est confié", () => {
    expect(validerDepot(depot({ prestataireId: "" }))).toMatch(/prestataire/i);
  });

  it("exige la date du dépôt", () => {
    expect(validerDepot(depot({ deposeLe: "" }))).toMatch(/date du dépôt/i);
  });

  /* Une avance à zéro n'est pas une avance : c'est un crédit, et le crédit est
     déjà modélisé. Les confondre laisserait des documents déposés sans
     contrepartie en caisse. */
  it("refuse une avance nulle — sans montant, le travail est confié à crédit", () => {
    for (const avance of ["0", "00"]) {
      expect(validerDepot(depot({ avance })), avance).toMatch(/crédit/i);
    }
  });

  it("refuse un montant qui n’en est pas un", () => {
    for (const avance of ["", "-500", "15 000,50", "beaucoup"]) {
      expect(validerDepot(depot({ avance })), avance).not.toBeNull();
    }
  });

  it("refuse une date annoncée antérieure au dépôt", () => {
    expect(validerDepot(depot({ deposeLe: "2026-09-03", disponibleLe: "2026-09-02" }))).toMatch(
      /antérieure/i,
    );
  });

  it("accepte une disponibilité le jour même du dépôt", () => {
    expect(validerDepot(depot({ deposeLe: "2026-09-03", disponibleLe: "2026-09-03" }))).toBeNull();
  });
});

describe("dossiersEnAttente", () => {
  const AUJOURDHUI = new Date("2026-09-03T10:00:00");

  const vente = (partie: Partial<VenteDuDossier> = {}): VenteDuDossier => ({
    id: "v1",
    numero: "PTG-2609-0001",
    boutiqueId: "PTG",
    clientId: "c1",
    date: new Date("2026-09-01T10:00:00"),
    statutDossier: "ouvert",
    ...partie,
  });

  const document = (partie: Partial<DocumentDossier> = {}): DocumentDossier => ({
    id: "carte_grise",
    boutiqueId: "PTG",
    venteId: "v1",
    type: "carte_grise",
    statut: "a_faire",
    prestataireId: null,
    prestataireNom: "",
    deposeLe: null,
    avance: null,
    disponibleLe: null,
    remisLe: null,
    ...partie,
  });

  const lister = (
    ventes: VenteDuDossier[],
    documents: DocumentDossier[],
    filtres: Partial<FiltresDossiers> = {},
  ) =>
    dossiersEnAttente(
      ventes,
      documents,
      { ...FILTRES_DOSSIERS_VIDES, ...filtres },
      AUJOURDHUI,
    );

  it("ne garde que les dossiers ouverts", () => {
    const liste = lister(
      [vente(), vente({ id: "v2", statutDossier: "clos" })],
      [document(), document({ venteId: "v2" })],
    );
    expect(liste.map((d) => d.venteId)).toEqual(["v1"]);
  });

  /* Ce n'est pas un journal qu'on parcourt, c'est une file qu'on vide : ce qui
     traîne depuis le plus longtemps passe en premier. */
  it("range du plus ancien au plus récent", () => {
    const liste = lister(
      [
        vente({ id: "recent", date: new Date("2026-09-02T10:00:00") }),
        vente({ id: "ancien", date: new Date("2026-08-01T10:00:00") }),
      ],
      [document({ venteId: "recent" }), document({ venteId: "ancien" })],
    );
    expect(liste.map((d) => d.venteId)).toEqual(["ancien", "recent"]);
  });

  it("écarte un dossier dont tous les documents sont réglés", () => {
    const liste = lister(
      [vente()],
      [
        document({ id: "quittance", type: "quittance", statut: "remis_client" }),
        document({ id: "cmc", type: "cmc", statut: "non_applicable" }),
      ],
    );
    expect(liste).toEqual([]);
  });

  it("ne montre que les documents qui restent à traiter, dans l’ordre du cahier", () => {
    const liste = lister(
      [vente()],
      [
        document({ id: "plaque", type: "plaque" }),
        document({ id: "quittance", type: "quittance", statut: "remis_client" }),
        document({ id: "cmc", type: "cmc" }),
      ],
    );
    expect(liste[0].enCours.map((d) => d.type)).toEqual(["cmc", "plaque"]);
  });

  it("signale le retard d’après la date annoncée, jamais d’après une requête figée", () => {
    const enRetard = lister(
      [vente()],
      [
        document({
          statut: "chez_prestataire",
          disponibleLe: new Date("2026-09-01T10:00:00"),
        }),
      ],
    );
    expect(enRetard[0].enRetard).toBe(true);

    const aLHeure = lister(
      [vente()],
      [
        document({
          statut: "chez_prestataire",
          disponibleLe: new Date("2026-09-10T10:00:00"),
        }),
      ],
    );
    expect(aLHeure[0].enRetard).toBe(false);
  });

  it("ne signale aucun retard sans date annoncée — on n’a rien promis", () => {
    const liste = lister([vente()], [document({ statut: "chez_prestataire" })]);
    expect(liste[0].enRetard).toBe(false);
  });

  describe("les quatre filtres", () => {
    const ventes = [vente(), vente({ id: "v2", boutiqueId: "KDG" })];
    const documents = [
      document({
        statut: "chez_prestataire",
        prestataireId: "p1",
        disponibleLe: new Date("2026-09-01T10:00:00"),
      }),
      document({ id: "plaque", type: "plaque", venteId: "v2", boutiqueId: "KDG" }),
    ];

    it("par boutique", () => {
      expect(lister(ventes, documents, { boutiqueId: "KDG" }).map((d) => d.venteId)).toEqual([
        "v2",
      ]);
    });

    it("par prestataire", () => {
      expect(lister(ventes, documents, { prestataireId: "p1" }).map((d) => d.venteId)).toEqual([
        "v1",
      ]);
    });

    it("par type de document", () => {
      expect(lister(ventes, documents, { type: "plaque" }).map((d) => d.venteId)).toEqual(["v2"]);
    });

    it("par retard", () => {
      expect(lister(ventes, documents, { enRetardSeulement: true }).map((d) => d.venteId)).toEqual(
        ["v1"],
      );
    });

    it("se combinent, et peuvent ne rien rendre", () => {
      expect(lister(ventes, documents, { boutiqueId: "KDG", enRetardSeulement: true })).toEqual([]);
    });
  });
});
