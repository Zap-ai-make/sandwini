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
  etatPapier,
  lireJour,
  passeParUnPrestataire,
  statutsSuivants,
  transitionAutorisee,
  validerDepot,
  dossiersEnAttente,
  chercherDossiers,
  etapesRelais,
  joursEcoules,
  FILTRES_DOSSIERS_VIDES,
  type EtatDossier,
  type FiltresDossiers,
  type SaisieDepot,
  type MotoDuDossier,
  type VenteDuDossier,
} from "./dossier";

const doc = (type: TypeDocument, statut: StatutDocument) => ({ type, statut });

const etat = (partie: Partial<EtatDossier> = {}): EtatDossier => ({
  documents: [doc("quittance", "a_faire"), doc("cmc", "a_faire"), doc("carte_grise", "revenu_magasin")],
  emporte: { quittance: true, cmc: true },
  soldee: true,
  motoRemise: true,
  ...partie,
});

/** Ceux qui arrivent finis, hors du périmètre de l’entreprise (D65). */
const ARRIVENT_FAITS = ["quittance", "cmc"] as const;
/** Ceux qu’un intervenant externe traite. La plaque en faisait partie jusqu’à S48. */
const VIA_PRESTATAIRE = ["carte_grise"] as const;

describe("passeParUnPrestataire", () => {
  it("distingue ce qui arrive fait de ce qui se confie", () => {
    for (const type of ARRIVENT_FAITS) expect(passeParUnPrestataire(type), type).toBe(false);
    for (const type of VIA_PRESTATAIRE) expect(passeParUnPrestataire(type), type).toBe(true);
  });
});

describe("la quittance et le CMC arrivent avec la moto", () => {
  /* **Ils n’ont plus d’étapes depuis S53.** Leur disponibilité se coche sur la
     moto et leur remise sur la vente : promener un statut de dossier en
     parallèle était la contradiction B de la spec — deux endroits pour un même
     fait, qui finissaient par se contredire. Le seul passage qui reste est
     celui qui écarte le papier de la vente. */
  it("n’ont plus qu’un passage : celui qui les écarte", () => {
    for (const type of ARRIVENT_FAITS) {
      expect(statutsSuivants(type, "a_faire"), type).toEqual(["non_applicable"]);
      expect(transitionAutorisee(type, "a_faire", "revenu_magasin"), type).toBe(false);
      expect(transitionAutorisee(type, "revenu_magasin", "remis_client"), type).toBe(false);
    }
  });

  it("n’ont pas d’étape « chez le prestataire » — personne ne les détient", () => {
    for (const type of ARRIVENT_FAITS) {
      expect(transitionAutorisee(type, "a_faire", "chez_prestataire"), type).toBe(false);
      expect(statutsSuivants(type, "chez_prestataire"), type).toEqual([]);
    }
  });
});

describe("la carte grise passe par un prestataire", () => {
  /* **Le retour est le terme depuis S53** (arbitrage 7). `remis_client`
     existait pour dire que le client avait la carte en main ; la preuve est
     désormais le scan et la plaque saisis sur la fiche de vente, qui disent la
     même chose en laissant une trace. Un troisième statut à promener n’ajoutait
     qu’un geste. */
  it("partent chez le prestataire, reviennent, et s’arrêtent là", () => {
    for (const type of VIA_PRESTATAIRE) {
      expect(transitionAutorisee(type, "a_faire", "chez_prestataire"), type).toBe(true);
      expect(transitionAutorisee(type, "chez_prestataire", "revenu_magasin"), type).toBe(true);
      expect(estStatutTerminal(type, "revenu_magasin"), type).toBe(true);
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
  it("clôt quand les deux papiers sont emportés et la carte grise revenue", () => {
    expect(dossierCloturable(etat())).toBe(true);
  });

  /* **C’est le changement de S53.** Un papier ne se clôt plus en passant par
     `remis_client` sur le dossier : il se clôt parce que la VENTE dit que le
     client est parti avec. Un seul fait, écrit à un seul endroit. */
  it("ne clôt pas tant qu’un papier disponible n’a pas été emporté", () => {
    expect(dossierCloturable(etat({ emporte: { quittance: true, cmc: false } }))).toBe(false);
  });

  it("clôt un dossier dont tout est sans objet, sans rien emporter", () => {
    expect(
      dossierCloturable(
        etat({
          documents: TYPES_DOCUMENT.map((type) => doc(type, "non_applicable")),
          emporte: { quittance: false, cmc: false },
        }),
      ),
    ).toBe(true);
  });

  it("ne clôt pas une carte grise encore chez le prestataire", () => {
    expect(
      dossierCloturable(
        etat({
          documents: [
            doc("quittance", "non_applicable"),
            doc("cmc", "non_applicable"),
            doc("carte_grise", "chez_prestataire"),
          ],
          emporte: { quittance: false, cmc: false },
        }),
      ),
    ).toBe(false);
  });

  /* La préversion porte des cartes grises déjà marquées `remis_client` par
     l’ancien modèle. Le statut ne s’écrit plus, mais il doit encore clore —
     sans quoi les dossiers les plus anciens resteraient ouverts pour toujours. */
  it("clôt une carte grise héritée, marquée remise au client", () => {
    expect(
      dossierCloturable(
        etat({
          documents: [
            doc("quittance", "non_applicable"),
            doc("cmc", "non_applicable"),
            doc("carte_grise", "remis_client"),
          ],
          emporte: { quittance: false, cmc: false },
        }),
      ),
    ).toBe(true);
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

  /* Un dossier dont les documents ne sont pas encore lus ne doit pas passer
     pour un dossier complet. Les types manquants comptent `a_faire`, et un
     papier `a_faire` non emporté ne clôt pas. */
  it("ne clôt pas un dossier dont les documents manquent", () => {
    expect(dossierCloturable(etat({ documents: [], emporte: { quittance: false, cmc: false } }))).toBe(
      false,
    );
    expect(
      dossierCloturable(
        etat({ documents: [doc("quittance", "a_faire")], emporte: { quittance: true, cmc: true } }),
      ),
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

describe("etapesRelais", () => {
  const noms = (type: TypeDocument, statut: StatutDocument) =>
    etapesRelais(type, statut).map((etape) => `${etape.statut}:${etape.etat}`);

  /* **Le parcours s'est raccourci avec S53, et un témoin e2e l'a trouvé avant
     ces tests.** `PARCOURS_*` est une seconde écriture de `CHEMIN` : retirer
     `remis_client` du chemin ne le retirait pas d'ici, et le relais annonçait
     encore un quatrième pas que plus aucun geste n'atteint. Un parcours qui
     montre une étape inatteignable promet un retour que personne ne fera. */
  it("ne dessine plus qu’une étape pour ce qui arrive avec la moto", () => {
    expect(etapesRelais("quittance", "a_faire").map((e) => e.statut)).toEqual(["a_faire"]);
    expect(etapesRelais("cmc", "a_faire").map((e) => e.statut)).toEqual(["a_faire"]);
  });

  it("dessine deux pas pour la carte grise, et s’arrête à son retour", () => {
    expect(etapesRelais("carte_grise", "a_faire").map((e) => e.statut)).toEqual([
      "a_faire",
      "chez_prestataire",
      "revenu_magasin",
    ]);
  });

  it("marque le passé, le présent et ce qui reste", () => {
    expect(noms("carte_grise", "chez_prestataire")).toEqual([
      "a_faire:fait",
      "chez_prestataire:cours",
      "revenu_magasin:attente",
    ]);
  });

  /* Le voyage est fini : un point « en cours » sur la dernière étape dirait que
     le document est encore en route. */
  it("ne laisse rien « en cours » sur une étape terminale", () => {
    expect(noms("carte_grise", "revenu_magasin")).toEqual([
      "a_faire:fait",
      "chez_prestataire:fait",
      "revenu_magasin:fait",
    ]);
  });

  /* `remis_client` n'est plus dans le parcours : une carte grise héritée de
     l'ancien modèle n'y trouve pas son rang, et n'a donc pas de parcours à
     dessiner. L'écran dit son état — « Au magasin » — sans tracer un chemin
     dont elle serait sortie. */
  it("ne donne aucun parcours à une carte grise héritée de l’ancien modèle", () => {
    expect(etapesRelais("carte_grise", "remis_client")).toEqual([]);
  });

  it("ne donne aucun parcours à un document écarté", () => {
    expect(etapesRelais("cmc", "non_applicable")).toEqual([]);
  });
});

describe("joursEcoules", () => {
  const MATIN = new Date("2026-09-03T08:00:00");

  /* Même règle que `estEnRetard` : c'est ainsi qu'un gérant compte l'attente
     d'un client, et un dépôt d'hier soir fait bien un jour ce matin. */
  it("compte de jour à jour, pas d’heure à heure", () => {
    expect(joursEcoules(new Date("2026-09-02T17:00:00"), MATIN)).toBe(1);
    expect(joursEcoules(new Date("2026-09-03T07:00:00"), MATIN)).toBe(0);
    expect(joursEcoules(new Date("2026-07-27T12:00:00"), MATIN)).toBe(38);
  });

  it("ne compte pas de jours négatifs, ni sans date", () => {
    expect(joursEcoules(new Date("2026-09-10T12:00:00"), MATIN)).toBe(0);
    expect(joursEcoules(null, MATIN)).toBeNull();
  });
});

describe("dossiersEnAttente", () => {
  const AUJOURDHUI = new Date("2026-09-03T10:00:00");

  const vente = (partie: Partial<VenteDuDossier> = {}): VenteDuDossier => ({
    id: "v1",
    numero: "PTG-2609-0001",
    boutiqueId: "PTG",
    clientId: "c1",
    motoId: "m1",
    date: new Date("2026-09-01T10:00:00"),
    statutDossier: "ouvert",
    emporte: { quittance: false, cmc: false },
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

  /* La moto par defaut ne porte rien : c'est l'etat d'une vente dont les
     papiers sont encore a venir, et le cas le plus courant de la file. */
  const moto = (partie: Partial<MotoDuDossier> = {}): MotoDuDossier => ({
    id: "m1",
    quittanceRecue: false,
    cmcRecu: false,
    ...partie,
  });

  const lister = (
    ventes: VenteDuDossier[],
    documents: DocumentDossier[],
    filtres: Partial<FiltresDossiers> = {},
    motos: MotoDuDossier[] = [moto()],
  ) =>
    dossiersEnAttente(
      ventes,
      documents,
      motos,
      { ...FILTRES_DOSSIERS_VIDES, ...filtres },
      AUJOURDHUI,
    );

  /* **Le critere d'acceptation central de S53.** Aucun geste n'a ete fait sur
     le dossier : c'est la case cochee sur la MOTO qui fait bouger l'ecran. La
     contradiction B n'est pas reparee, elle est devenue inexprimable. */
  it("affiche « au magasin » pour une vente dont la moto porte son CMC, sans geste sur le dossier", () => {
    const liste = lister(
      [vente()],
      [document({ id: "cmc", type: "cmc", statut: "a_faire" })],
      {},
      [moto({ cmcRecu: true })],
    );
    expect(liste[0].papiers.find((p) => p.type === "cmc")?.etat).toBe("au_magasin");
  });

  it("affiche « emporté » quand la vente dit que le client est parti avec", () => {
    const liste = lister(
      [vente({ emporte: { quittance: true, cmc: false } })],
      [document({ id: "quittance", type: "quittance", statut: "a_faire" })],
      {},
      [moto({ quittanceRecue: true })],
    );
    expect(liste[0].papiers.find((p) => p.type === "quittance")?.etat).toBe("emporte");
  });

  /* Une vente dont la moto n'est pas dans la liste passee : l'ecoute du stock
     peut n'avoir pas encore repondu, ou la moto etre hors perimetre. Le papier
     se lit « a faire », jamais `undefined`. */
  it("lit « à faire » quand la moto est inconnue de la liste", () => {
    const liste = lister([vente()], [document({ id: "cmc", type: "cmc" })], {}, []);
    expect(liste[0].papiers.find((p) => p.type === "cmc")?.etat).toBe("a_faire");
  });

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

  /* **Ce qui règle un papier a changé avec S53.** La quittance est réglée parce
     que la vente dit que le client l'a emportée, le CMC parce qu'il est écarté,
     et la carte grise parce qu'elle est revenue. Aucun `remis_client` dans ce
     test : c'est un statut que le produit n'écrit plus. */
  it("écarte un dossier dont les trois papiers ont fini", () => {
    const liste = lister(
      [vente({ emporte: { quittance: true, cmc: false } })],
      [
        document({ id: "quittance", type: "quittance", statut: "a_faire" }),
        document({ id: "cmc", type: "cmc", statut: "non_applicable" }),
        document({ id: "carte_grise", type: "carte_grise", statut: "revenu_magasin" }),
      ],
      {},
      [moto({ quittanceRecue: true })],
    );
    expect(liste).toEqual([]);
  });

  /* Le cas voisin, et celui qui compte : un papier en main que le client n'a
     pas pris retient le dossier. C'est le sens du filtre « À remettre ». */
  it("garde un dossier dont un papier est au magasin sans être emporté", () => {
    const liste = lister(
      [vente()],
      [
        document({ id: "quittance", type: "quittance", statut: "a_faire" }),
        document({ id: "cmc", type: "cmc", statut: "non_applicable" }),
        document({ id: "carte_grise", type: "carte_grise", statut: "revenu_magasin" }),
      ],
      {},
      [moto({ quittanceRecue: true })],
    );
    expect(liste.map((d) => d.venteId)).toEqual(["v1"]);
    expect(liste[0].detention).toEqual({ chez: "magasin" });
  });

  it("ne garde en cours que ce qui reste à traiter, dans l’ordre du cahier", () => {
    const liste = lister(
      [vente({ emporte: { quittance: true, cmc: false } })],
      [
        document({ id: "carte_grise", type: "carte_grise" }),
        document({ id: "quittance", type: "quittance", statut: "a_faire" }),
        document({ id: "cmc", type: "cmc" }),
      ],
      {},
      [moto({ quittanceRecue: true })],
    );
    expect(liste[0].enCours.map((d) => d.type)).toEqual(["cmc", "carte_grise"]);
  });

  /* Les trois papiers sortent toujours, dans l'ordre du cahier, quel que soit
     leur état : c'est une colonne par papier à l'écran, et un papier fini doit
     se voir fini. */
  it("rend les trois papiers avec leur état, dans l’ordre du cahier", () => {
    const liste = lister(
      [vente({ emporte: { quittance: true, cmc: false } })],
      [
        document({ id: "quittance", type: "quittance", statut: "a_faire" }),
        document({ id: "cmc", type: "cmc", statut: "non_applicable" }),
        document({ id: "carte_grise", type: "carte_grise", statut: "chez_prestataire" }),
      ],
      {},
      [moto({ quittanceRecue: true })],
    );
    expect(liste[0].papiers.map((papier) => [papier.type, papier.etat])).toEqual([
      ["quittance", "emporte"],
      ["cmc", "sans_objet"],
      ["carte_grise", "chez_prestataire"],
    ]);
  });

  /* L'écran montre une colonne par document : « remis » y compte autant que
     « à faire », c'est en voyant les premiers réglés qu'on comprend lequel
     manque encore. */
  it("rend les trois documents par type, réglés compris, et rien pour ceux qui manquent", () => {
    const liste = lister(
      [vente()],
      [
        document({ id: "carte_grise", type: "carte_grise" }),
        document({
          id: "quittance",
          type: "quittance",
          statut: "remis_client",
        }),
      ],
    );
    expect(liste[0].documents.quittance?.statut).toBe("remis_client");
    expect(liste[0].documents.carte_grise?.statut).toBe("a_faire");
    expect(liste[0].documents.cmc).toBeNull();
  });

  /* S48 : la plaque a quitté le dossier, mais les dossiers ouverts avant en
     portent encore un en base. Il ne doit peser sur rien — ni « en cours », ni
     la détention, ni le retard —, sans quoi l'écran contredirait le serveur,
     qui vient de clore ce dossier sur trois documents. */
  it("ignore un document d’un type retiré du dossier", () => {
    const liste = lister(
      [vente({ emporte: { quittance: true, cmc: true } })],
      [
        document({ id: "quittance", type: "quittance", statut: "a_faire" }),
        document({ id: "cmc", type: "cmc", statut: "a_faire" }),
        document({ id: "carte_grise", type: "carte_grise", statut: "revenu_magasin" }),
        /* Le type n'existe plus dans `TypeDocument` : c'est bien le cas d'une
           donnée plus vieille que le code, et le compilateur ne peut pas la
           décrire. */
        document({
          id: "plaque",
          type: "plaque" as unknown as DocumentDossier["type"],
          statut: "chez_prestataire",
          prestataireNom: "Fabricant de plaques",
          deposeLe: new Date("2026-08-01T12:00:00"),
          disponibleLe: new Date("2026-08-05T10:00:00"),
        }),
      ],
      {},
      [moto({ quittanceRecue: true, cmcRecu: true })],
    );
    /* Le dossier quitte la file : ses trois papiers ont fini. Avant S48, la
       plaque l'y aurait retenu — chez un prestataire, avec une date dépassée —
       pendant que le serveur, lui, venait de le clore. */
    expect(liste).toEqual([]);
  });

  it("ne laisse pas un type retiré retenir un dossier qui attend encore", () => {
    const liste = lister(
      [vente({ emporte: { quittance: true, cmc: false } })],
      [
        document({ id: "quittance", type: "quittance", statut: "a_faire" }),
        document({ id: "cmc", type: "cmc", statut: "non_applicable" }),
        document({ id: "carte_grise", type: "carte_grise", statut: "chez_prestataire",
          prestataireNom: "Zongo Prestations", deposeLe: new Date("2026-09-01T12:00:00") }),
        /* La quittance est emportée, le CMC écarté : seule la carte grise
           attend, et c'est elle seule qui doit figurer en cours. */
        document({
          id: "plaque",
          type: "plaque" as unknown as DocumentDossier["type"],
          statut: "chez_prestataire",
          prestataireNom: "Fabricant de plaques",
          deposeLe: new Date("2026-08-01T12:00:00"),
        }),
      ],
    );
    /* La carte grise reste en cours, seule. La détention nomme son prestataire
       et non celui de la plaque, pourtant déposée un mois plus tôt : un dépôt
       qu'on ne suit plus ne peut pas nommer le dossier. */
    expect(liste[0].enCours.map((document) => document.type)).toEqual(["carte_grise"]);
    expect(liste[0].detention).toEqual({
      chez: "prestataire",
      nom: "Zongo Prestations",
      depuisJours: joursEcoules(new Date("2026-09-01T12:00:00"), AUJOURDHUI),
    });
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

  describe("qui détient le dossier", () => {
    it("nomme le prestataire, et compte les jours depuis le dépôt", () => {
      const liste = lister(
        [vente()],
        [
          document({
            statut: "chez_prestataire",
            prestataireNom: "Zongo Prestations",
            deposeLe: new Date("2026-07-27T12:00:00"),
          }),
        ],
      );
      expect(liste[0].detention).toEqual({
        chez: "prestataire",
        nom: "Zongo Prestations",
        depuisJours: 38,
      });
    });

    /* **Deux dépôts simultanés sont désormais impossibles, et il faut le dire
       ici parce qu'un test les simulait.** Le type EST l'identifiant du
       document — `documents/carte_grise` —, donc une vente n'a jamais deux
       documents du même type ; et depuis S48 un seul type passe par un
       prestataire. L'ancien test posait deux `carte_grise` sous deux
       identifiants, un état que les règles refusent (`donnees.type == type`).

       La règle du plus ancien reste écrite dans `detentionDe` : elle tient la
       promesse de la colonne — nommer celui dont le délai s'allonge — et la
       prochaine pièce confiée à l'extérieur la retrouvera. Ce qui se vérifie
       ici est ce qui est atteignable : le dépôt unique est bien celui qui est
       nommé. */
    it("nomme le dépôt de la carte grise, le seul papier qui sorte du magasin", () => {
      const liste = lister(
        [vente()],
        [
          document({
            statut: "chez_prestataire",
            prestataireNom: "Ancien",
            deposeLe: new Date("2026-08-01T12:00:00"),
          }),
        ],
      );
      expect(liste[0].detention).toMatchObject({ nom: "Ancien" });
    });

    /* **S53 change ce que « au magasin » désigne.** Une carte grise revenue a
       FINI son parcours : plus rien n'est détenu, et le dossier quitte la file.
       Ce qui est détenu par le magasin, c'est un papier de main dans le tiroir
       que le client n'a pas encore pris — et il n'a aucun statut stocké pour le
       dire, seulement la case de la moto. */
    it("dit « au magasin » pour un papier en main que le client n’a pas pris", () => {
      const auMagasin = lister(
        [vente()],
        [document({ id: "cmc", type: "cmc", statut: "a_faire" })],
        {},
        [moto({ cmcRecu: true })],
      );
      expect(auMagasin[0].detention).toEqual({ chez: "magasin" });
    });

    it("ne détient rien quand rien n’est parti et que la moto ne porte rien", () => {
      const rienParti = lister([vente()], [document()]);
      expect(rienParti[0].detention).toBeNull();
    });

    /* Une carte grise revenue ne retient plus le dossier : le retour est le
       terme de son parcours (arbitrage 7), et sa remise se prouve par le scan
       et la plaque sur la fiche de vente. */
    it("ne détient rien pour une carte grise revenue : son parcours est fini", () => {
      const liste = lister(
        [vente({ emporte: { quittance: true, cmc: true } })],
        [
          document({ id: "quittance", type: "quittance", statut: "a_faire" }),
          document({ id: "cmc", type: "cmc", statut: "a_faire" }),
          document({ statut: "revenu_magasin" }),
        ],
        {},
        [moto({ quittanceRecue: true, cmcRecu: true })],
      );
      expect(liste).toEqual([]);
    });
  });

  describe("les trois questions qu’on pose à la file", () => {
    /* v3 a sa propre moto : c'est elle qui porte le CMC, et c'est ce qui place
       le dossier dans « À remettre » — sans qu'aucun document ne le dise. */
    const ventes = [vente(), vente({ id: "v2" }), vente({ id: "v3", motoId: "m3" })];
    const documents = [
      document({
        statut: "chez_prestataire",
        prestataireId: "p1",
        prestataireNom: "Zongo Prestations",
        disponibleLe: new Date("2026-09-01T10:00:00"),
      }),
      document({
        id: "d2",
        venteId: "v2",
        statut: "chez_prestataire",
        prestataireNom: "Nikiéma Services",
        disponibleLe: new Date("2026-09-20T10:00:00"),
      }),
      document({
        id: "d3",
        venteId: "v3",
        type: "cmc",
        statut: "a_faire",
      }),
    ];

    const motos = [moto(), moto({ id: "m3", cmcRecu: true })];

    it("ce qui a dépassé la date annoncée", () => {
      expect(
        lister(ventes, documents, { etat: "en_retard" }, motos).map((d) => d.venteId),
      ).toEqual(["v1"]);
    });

    it("ce qui est chez quelqu’un", () => {
      expect(
        lister(ventes, documents, { etat: "chez_prestataire" }, motos).map((d) => d.venteId),
      ).toEqual(["v1", "v2"]);
    });

    it("ce qui peut se remettre aujourd’hui", () => {
      expect(
        lister(ventes, documents, { etat: "a_remettre" }, motos).map((d) => d.venteId),
      ).toEqual(["v3"]);
    });

    /* Les trois façons dont un dossier revient à l'esprit au comptoir : le
       client appelle, il tend un reçu, ou le prestataire passe. */
    describe("chercherDossiers", () => {
      const cherchables = (etat: Partial<FiltresDossiers> = {}) =>
        lister(ventes, documents, etat, motos).map((dossier) => ({
          dossier,
          nomNormalise: dossier.venteId === "v1" ? "salifou kabore" : "rasmane nikiema",
        }));

      const normaliser = (brut: string) => brut.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

      const chercher = (texte: string) =>
        chercherDossiers(cherchables(), texte, normaliser).map((l) => l.dossier.venteId);

      it("rend tout quand on ne cherche rien", () => {
        expect(chercher("  ")).toEqual(["v1", "v2", "v3"]);
      });

      it("trouve par le nom du client", () => {
        expect(chercher("Kaboré")).toEqual(["v1"]);
      });

      it("trouve par le nom du prestataire qui détient un papier", () => {
        expect(chercher("Zongo")).toEqual(["v1"]);
      });

      /* Personne ne retape les tirets à l'identique depuis un reçu froissé. */
      it("trouve par le numéro, avec ou sans ses tirets", () => {
        expect(chercher("PTG26090001")).toEqual(["v1", "v2", "v3"]);
        expect(chercher("PTG-2609-0001")).toEqual(["v1", "v2", "v3"]);
      });

      it("ne rend rien plutôt que de rendre tout", () => {
        expect(chercher("Ouedraogo")).toEqual([]);
      });
    });
  });
});

describe("etatPapier", () => {
  it("rend « sans objet » dès que le document est écarté, quoi que porte la moto", () => {
    expect(
      etatPapier({ type: "cmc", statut: "non_applicable", enMain: true, emporte: true }),
    ).toBe("sans_objet");
  });

  it("rend « emporté » quand le client l’a pris", () => {
    expect(
      etatPapier({ type: "quittance", statut: "a_faire", enMain: true, emporte: true }),
    ).toBe("emporte");
  });

  it("rend « au magasin » quand la moto porte le papier sans qu’il soit emporté", () => {
    expect(etatPapier({ type: "cmc", statut: "a_faire", enMain: true, emporte: false })).toBe(
      "au_magasin",
    );
  });

  it("rend « à faire » quand la moto ne porte rien", () => {
    expect(
      etatPapier({ type: "quittance", statut: "a_faire", enMain: false, emporte: false }),
    ).toBe("a_faire");
  });

  /* La carte grise ne lit ni la moto ni la vente : elle a une vie dehors que ni
     l’une ni l’autre ne connaît. */
  it("lit la carte grise sur son seul statut, en ignorant la moto", () => {
    expect(
      etatPapier({ type: "carte_grise", statut: "chez_prestataire", enMain: true, emporte: true }),
    ).toBe("chez_prestataire");
    expect(
      etatPapier({ type: "carte_grise", statut: "revenu_magasin", enMain: false, emporte: false }),
    ).toBe("au_magasin");
  });

  /* **Point de vigilance 1.** La préversion porte des cartes grises déjà passées
     à `remis_client` par l’ancien modèle. Elles doivent se lire, pas faire
     tomber l’écran. */
  it("lit un « remis au client » hérité de l’ancien modèle comme étant au magasin", () => {
    expect(
      etatPapier({ type: "carte_grise", statut: "remis_client", enMain: false, emporte: false }),
    ).toBe("au_magasin");
  });
});
