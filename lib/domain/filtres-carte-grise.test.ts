import { describe, expect, it } from "vitest";
import type { DossierCarteGrise, StatutCarteGrise } from "./dossier-carte-grise";
import {
  compterParEtat,
  correspondALEtat,
  ETATS_CLASSEUR,
  rangerSelonEtat,
  type EtatClasseur,
} from "./filtres-carte-grise";

/**
 * Le filtre d'état du classeur (6 novembre 2026).
 *
 * « C'est comme s'il y avait deux pages, tout devrait être imbriqué » : les
 * onglets Dépôt et Retrait cèdent la place à un filtre sur place, qui se
 * combine avec le lot et la recherche. Ses cinq choix sont les états que la
 * base connaît déjà ; aucun ne s'invente ici.
 */
const dossier = (id: string, statut: StatutCarteGrise, partie: Partial<DossierCarteGrise> = {}) =>
  ({
    id,
    statut,
    clientNom: id,
    prestataireId: null,
    prestataireNom: "",
    deposeLe: null,
    immatriculation: "",
    revenuLe: null,
    remisLe: null,
    recu: false,
    ...partie,
  }) as DossierCarteGrise;

const aFaire = dossier("a", "a_faire");
const dehors = dossier("b", "chez_prestataire", { deposeLe: new Date(2026, 9, 20) });
const revenu = dossier("c", "revenu_magasin", { revenuLe: new Date(2026, 9, 28) });
const remis = dossier("d", "remis", { remisLe: new Date(2026, 10, 2) });
const sansObjet = dossier("e", "non_applicable");
const tous = [aFaire, dehors, revenu, remis, sansObjet];

const ids = (dossiers: readonly DossierCarteGrise[]) => dossiers.map((d) => d.id);

describe("correspondALEtat", () => {
  const dans = (etat: EtatClasseur) => ids(tous.filter((d) => correspondALEtat(d, etat)));

  it("garde en cours tout ce qui attend encore quelque chose", () => {
    expect(dans("en_cours")).toEqual(["a", "b", "c"]);
  });

  it("lit chaque étape du trajet sur le statut du dossier", () => {
    expect(dans("a_deposer")).toEqual(["a"]);
    expect(dans("sortis")).toEqual(["b"]);
    expect(dans("au_magasin")).toEqual(["c"]);
  });

  it("range parmi les retirés ce qui est clos, « sans objet » compris", () => {
    /* Comme l'ancien onglet Retrait : un dossier sans objet n'attend plus
       rien, il ne doit pas encombrer les dossiers en cours. */
    expect(dans("retires")).toEqual(["d", "e"]);
  });

  it("place chaque dossier dans « en cours » ou « retirés », jamais les deux", () => {
    for (const d of tous) {
      expect(correspondALEtat(d, "en_cours")).not.toBe(correspondALEtat(d, "retires"));
    }
  });
});

describe("compterParEtat", () => {
  it("compte chaque choix du filtre", () => {
    expect(compterParEtat(tous)).toEqual({
      en_cours: 3,
      a_deposer: 1,
      sortis: 1,
      au_magasin: 1,
      retires: 2,
    });
  });

  it("donne un compte à chacun des cinq choix, même vide", () => {
    expect(Object.keys(compterParEtat([]))).toEqual([...ETATS_CLASSEUR]);
  });
});

describe("rangerSelonEtat", () => {
  it("ne montre que l’état choisi", () => {
    expect(ids(rangerSelonEtat(tous, "sortis"))).toEqual(["b"]);
  });

  it("met en tête, parmi les dossiers en cours, ce qui n’est pas encore parti", () => {
    /* L'ordre de `rangerDossiers` : ce qui attend un geste d'abord. */
    expect(ids(rangerSelonEtat([revenu, dehors, aFaire], "en_cours"))[0]).toBe("a");
  });

  it("lit les retirés du plus récent au plus ancien", () => {
    const ancien = dossier("f", "remis", { remisLe: new Date(2026, 5, 1) });
    expect(ids(rangerSelonEtat([ancien, remis], "retires"))).toEqual(["d", "f"]);
  });
});
