import { describe, expect, test } from "vitest";
import { lireSuivi, type LigneSuivi, type SuiviPrestataire } from "./suivi-prestataire";

const LIGNE: LigneSuivi = {
  numeroVente: "PTG-2610-0042",
  client: "Compaoré Ali",
  moto: "Haojue DK150",
  chassis: "LC6PAGA1XJ0000001",
  deposeLe: "2026-10-11T00:00:00.000Z",
  revenuLe: null,
  joursDehors: 5,
};

const VALIDE: SuiviPrestataire = {
  prestataire: { nom: "Sawadogo" },
  enCours: [LIGNE],
  historique: [],
  argent: { avances: 15_000 },
};

describe("relire la charge utile du portail", () => {
  test("une charge complète se relit à l’identique", () => {
    expect(lireSuivi(JSON.parse(JSON.stringify(VALIDE)))).toEqual(VALIDE);
  });

  test("un prestataire sans aucune carte est une charge valide", () => {
    const vide: SuiviPrestataire = {
      prestataire: { nom: "Sawadogo" },
      enCours: [],
      historique: [],
      argent: { avances: 0 },
    };
    expect(lireSuivi(vide)).toEqual(vide);
  });

  test.each([null, undefined, 42, "texte", true, [], [VALIDE]])(
    "ce qui n’est pas un objet rend null : %s",
    (brut) => {
      expect(lireSuivi(brut)).toBeNull();
    },
  );

  test.each(["prestataire", "enCours", "historique", "argent"])(
    "une charge privée de %s rend null plutôt que de laisser la page y croire",
    (champ) => {
      const ampute: Record<string, unknown> = { ...VALIDE };
      delete ampute[champ];
      expect(lireSuivi(ampute)).toBeNull();
    },
  );

  /* **Le test de non-fuite, et c'est le plus important de ce fichier.** Un champ
     de trop est une FUITE, pas une tolérance. Le jour où un prix d'achat se
     glisserait dans la charge utile du serveur, c'est ici que ça s'arrête — et
     le portail dira « ce lien n'est plus valide » au lieu d'envoyer un coût
     dans le navigateur d'un fournisseur. */
  test.each([
    ["un prix de vente", { prixVente: 1_200_000 }],
    ["un prix d’achat", { prixAchat: 900_000 }],
    ["une marge", { marge: 300_000 }],
    ["un solde inventé", { solde: 0 }],
    ["un identifiant Firestore", { prestataireId: "abc123" }],
  ])("une charge qui porte %s est refusée", (_cas, surplus) => {
    expect(lireSuivi({ ...VALIDE, ...surplus })).toBeNull();
  });

  test("un champ de trop à l’intérieur de l’argent est refusé", () => {
    expect(lireSuivi({ ...VALIDE, argent: { avances: 15_000, solde: 42 } })).toBeNull();
  });

  test("un champ de trop à l’intérieur d’une ligne est refusé", () => {
    expect(
      lireSuivi({ ...VALIDE, enCours: [{ ...LIGNE, telephoneClient: "70 00 00 00" }] }),
    ).toBeNull();
  });

  test("un champ de trop à l’intérieur du prestataire est refusé", () => {
    expect(lireSuivi({ ...VALIDE, prestataire: { nom: "Sawadogo", telephone: "70" } })).toBeNull();
  });

  test.each([
    ["un nom vide", { prestataire: { nom: "" } }],
    ["un nom qui n’est pas une chaîne", { prestataire: { nom: 42 } }],
    ["des avances fractionnaires", { argent: { avances: 1_500.5 } }],
    ["des avances négatives", { argent: { avances: -1 } }],
    ["des avances en texte", { argent: { avances: "15000" } }],
    ["un enCours qui n’est pas un tableau", { enCours: {} }],
  ])("refuse %s", (_cas, remplacement) => {
    expect(lireSuivi({ ...VALIDE, ...remplacement })).toBeNull();
  });

  test.each([
    ["un châssis absent", { chassis: undefined }],
    ["un numéro numérique", { numeroVente: 42 }],
    ["une date en nombre", { deposeLe: 1_760_000_000_000 }],
    ["un retour en nombre", { revenuLe: 1_760_000_000_000 }],
    ["des jours négatifs", { joursDehors: -3 }],
    ["des jours fractionnaires", { joursDehors: 2.5 }],
  ])("refuse une ligne avec %s", (_cas, remplacement) => {
    expect(lireSuivi({ ...VALIDE, enCours: [{ ...LIGNE, ...remplacement }] })).toBeNull();
  });

  /* Une seule ligne illisible invalide le tout : garder les autres donnerait un
     suivi incomplet qui a l'air complet, et le prestataire croirait qu'une carte
     a disparu. */
  test("une seule ligne illisible invalide la charge entière", () => {
    expect(
      lireSuivi({ ...VALIDE, historique: [{ ...LIGNE, revenuLe: "2026-10-15T00:00:00.000Z" }, {}] }),
    ).toBeNull();
  });
});
