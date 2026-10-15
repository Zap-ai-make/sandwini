import { describe, expect, it } from "vitest";
import {
  COUT_VIDE,
  FILTRES_VIDES,
  SAISIE_VIDE,
  chassisDejaPris,
  construireCout,
  coutRenseigne,
  coutTotal,
  coutTotalSaisie,
  filtrerMotos,
  LONGUEUR_CHASSIS_MAX,
  lireEntier,
  lirePapiers,
  normaliserChassis,
  normaliserPlaque,
  PLAQUE_LONGUEUR_MAX,
  validerChassis,
  validerCout,
  validerCoutPose,
  validerMoto,
  type Moto,
  type SaisieCout,
  type SaisieMoto,
  validerFichierPapier,
} from "./moto";

const saisie = (partie: Partial<SaisieMoto> = {}): SaisieMoto => ({
  ...SAISIE_VIDE,
  marqueId: "m1",
  modeleId: "mo1",
  provenanceId: "p1",
  numeroChassis: "LC6PCJ1A9K0000123",
  prixAchat: "850000",
  ...partie,
});

const moto = (partie: Partial<Moto> = {}): Moto => ({
  id: "1",
  boutiqueId: "PTG",
  quittanceChemin: null,
  cmcChemin: null,
  etat: "neuve",
  marqueId: "m1",
  modeleId: "mo1",
  couleur: "",
  annee: null,
  numeroChassis: "LC6PCJ1A9K0000123",
  numeroMoteur: "",
  prixVenteConseille: null,
  provenanceId: "p1",
  arrivageId: null,
  papiersFournis: [],
  photos: [],
  statut: "en_stock",
  dateEntree: null,
  cmcRecu: false,
  quittanceRecue: false,
  plaque: null,
  ...partie,
});

describe("normaliserChassis", () => {
  it("ignore la casse, les espaces et les tirets du relevé à la main", () => {
    expect(normaliserChassis(" lc6p cj1a9-k0000123 ")).toBe("LC6PCJ1A9K0000123");
  });

  it("laisse un champ vide vide", () => {
    expect(normaliserChassis("   ")).toBe("");
  });
});

describe("lireEntier", () => {
  it("lit un montant tapé avec des espaces", () => {
    expect(lireEntier("1 250 000")).toBe(1250000);
    expect(lireEntier("850000")).toBe(850000);
  });

  it("refuse ce qui n’est pas un entier — le FCFA n’a pas de décimale", () => {
    for (const valeur of ["", "  ", "12,5", "12.5", "-3", "abc", "1e5"]) {
      expect(lireEntier(valeur), valeur).toBeNull();
    }
  });
});

describe("coutTotal", () => {
  it("additionne le prix d’achat et tous les frais (prompt.md §5.2)", () => {
    expect(coutTotal(850_000, [{ montant: 15_000 }, { montant: 5_000 }])).toBe(870_000);
  });

  it("vaut le prix d’achat quand il n’y a aucun frais", () => {
    expect(coutTotal(850_000, [])).toBe(850_000);
  });
});

describe("coutTotalSaisie", () => {
  it("se calcule pendant la frappe, en ignorant les champs encore vides", () => {
    expect(
      coutTotalSaisie(
        saisie({
          prixAchat: "850 000",
          fraisEntree: [
            { typeFraisId: "t1", montant: "15000", note: "" },
            { typeFraisId: "t2", montant: "", note: "" },
          ],
        }),
      ),
    ).toBe(865_000);
  });

  it("vaut zéro tant que rien n’est saisi", () => {
    expect(coutTotalSaisie(SAISIE_VIDE)).toBe(0);
  });
});

describe("validerMoto", () => {
  it("accepte une saisie minimale complète", () => {
    expect(validerMoto(saisie())).toBeNull();
  });

  it("exige les deux choix qui rattachent la moto au référentiel", () => {
    expect(validerMoto(saisie({ marqueId: "" }))).toMatch(/marque/i);
    expect(validerMoto(saisie({ provenanceId: "" }))).toMatch(/provenance/i);
  });

  /* Le modèle a quitté les champs exigés, ici comme au lot. Les deux chemins
     d'entrée en stock devaient bouger ensemble : laisser la saisie unitaire
     stricte aurait fait dépendre l'acceptation d'une moto du formulaire par
     lequel elle passe, et c'est au comptoir que cette incohérence se serait
     rencontrée. La règle Firestore ne sait de toute façon pas distinguer les
     deux chemins. */
  it("accepte une moto sans modèle, comme un lot", () => {
    expect(validerMoto(saisie({ modeleId: "" }))).toBeNull();
  });

  it("exige un châssis — c’est l’identité de la moto", () => {
    expect(validerMoto(saisie({ numeroChassis: "  " }))).toMatch(/châssis/i);
  });

  it("refuse un châssis avec des caractères qui n’y sont jamais", () => {
    expect(validerMoto(saisie({ numeroChassis: "LC6P/CJ1A" }))).toMatch(/lettres et des chiffres/);
  });

  it("accepte un châssis tapé avec des espaces : il sera normalisé", () => {
    expect(validerMoto(saisie({ numeroChassis: "lc6p cj1a 9k00" }))).toBeNull();
  });

  /* Depuis S39 le gérant ne saisit plus le prix d'achat : la moto entre sans,
     et la supervision le pose après coup. Ce test disait l'inverse jusqu'ici —
     il exigeait le prix — et c'est exactement le comportement que le
     commanditaire a fait retirer. */
  it("accepte une moto sans prix d’achat : la supervision le posera (S39)", () => {
    expect(validerMoto(saisie({ prixAchat: "" }))).toBeNull();
  });

  it("refuse un prix d’achat qui n’est pas un entier, quand il est saisi", () => {
    expect(validerMoto(saisie({ prixAchat: "850 000,50" }))).toMatch(/prix d’achat/i);
  });

  it("refuse une année absurde et accepte une année plausible", () => {
    expect(validerMoto(saisie({ annee: "1899" }))).toMatch(/année/i);
    expect(validerMoto(saisie({ annee: "2099" }))).toMatch(/année/i);
    expect(validerMoto(saisie({ annee: "2024" }))).toBeNull();
    expect(validerMoto(saisie({ annee: "" }))).toBeNull();
  });

  it("refuse un frais sans type, sans montant, ou à zéro", () => {
    expect(
      validerMoto(saisie({ fraisEntree: [{ typeFraisId: "", montant: "5000", note: "" }] })),
    ).toMatch(/type/i);
    expect(
      validerMoto(saisie({ fraisEntree: [{ typeFraisId: "t1", montant: "", note: "" }] })),
    ).toMatch(/montant/i);
    expect(
      validerMoto(saisie({ fraisEntree: [{ typeFraisId: "t1", montant: "0", note: "" }] })),
    ).toMatch(/montant/i);
  });

  it("accepte plusieurs frais valides", () => {
    expect(
      validerMoto(
        saisie({
          fraisEntree: [
            { typeFraisId: "t1", montant: "15000", note: "Transport depuis Lomé" },
            { typeFraisId: "t2", montant: "5000", note: "" },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe("le coût, séparé de la moto (S39)", () => {
  const cout = (partie: Partial<SaisieCout> = {}): SaisieCout => ({ ...COUT_VIDE, ...partie });

  it("dit qu’un coût est renseigné dès que le prix d’achat l’est", () => {
    expect(coutRenseigne(COUT_VIDE)).toBe(false);
    expect(coutRenseigne(cout({ prixAchat: "   " }))).toBe(false);
    expect(coutRenseigne(cout({ prixAchat: "850000" }))).toBe(true);
  });

  it("accepte un coût vide : une moto peut entrer sans", () => {
    expect(validerCout(COUT_VIDE)).toBeNull();
  });

  it("refuse des frais sans prix d’achat — le total serait faux, pas absent", () => {
    expect(
      validerCout(cout({ fraisEntree: [{ typeFraisId: "t1", montant: "5000", note: "" }] })),
    ).toMatch(/frais/i);
  });

  it("exige le prix là où le prix est le sujet", () => {
    expect(validerCoutPose(COUT_VIDE)).toMatch(/prix d’achat/i);
    expect(validerCoutPose(cout({ prixAchat: "850000" }))).toBeNull();
  });

  it("ne construit rien quand il n’y a rien à écrire", () => {
    /* Le document absent est le signal. Un `prixAchat: 0` dirait « acquise
       gratuitement » là où on ne sait pas encore (D82). */
    expect(construireCout(COUT_VIDE)).toBeNull();
  });

  it("construit un coût propre : entiers, notes taillées, total additionné", () => {
    expect(
      construireCout(
        cout({
          prixAchat: "850 000",
          fraisEntree: [{ typeFraisId: "t1", montant: "15000", note: "  Transport  " }],
        }),
      ),
    ).toEqual({
      prixAchat: 850_000,
      fraisEntree: [{ typeFraisId: "t1", montant: 15_000, note: "Transport" }],
      coutTotal: 865_000,
    });
  });
});

describe("lirePapiers", () => {
  it("lit une liste tapée une ligne par papier", () => {
    expect(lirePapiers("Carte grise\n  Facture  \n\nAssurance")).toEqual([
      "Carte grise",
      "Facture",
      "Assurance",
    ]);
  });

  it("ne retient rien d’un champ vide", () => {
    expect(lirePapiers("   \n  ")).toEqual([]);
  });
});

describe("filtrerMotos", () => {
  const stock = [
    moto({ id: "1", numeroChassis: "AAA111", etat: "neuve", marqueId: "m1", modeleId: "mo1" }),
    moto({ id: "2", numeroChassis: "BBB222", etat: "occasion", marqueId: "m1", modeleId: "mo2" }),
    moto({ id: "3", numeroChassis: "CCC333", etat: "occasion", marqueId: "m2", modeleId: "mo3" }),
  ];

  it("ne filtre rien quand aucun filtre n’est posé", () => {
    expect(filtrerMotos(stock, FILTRES_VIDES)).toHaveLength(3);
  });

  it("filtre par état, par marque et par modèle", () => {
    expect(filtrerMotos(stock, { ...FILTRES_VIDES, etat: "occasion" })).toHaveLength(2);
    expect(filtrerMotos(stock, { ...FILTRES_VIDES, marqueId: "m1" })).toHaveLength(2);
    expect(filtrerMotos(stock, { ...FILTRES_VIDES, modeleId: "mo3" })).toHaveLength(1);
  });

  it("combine les filtres", () => {
    const trouve = filtrerMotos(stock, { ...FILTRES_VIDES, etat: "occasion", marqueId: "m1" });
    expect(trouve.map((m) => m.id)).toEqual(["2"]);
  });

  it("cherche sur un fragment de châssis — on relève souvent la fin", () => {
    expect(filtrerMotos(stock, { ...FILTRES_VIDES, recherche: "222" })).toHaveLength(1);
    expect(filtrerMotos(stock, { ...FILTRES_VIDES, recherche: " bbb " })).toHaveLength(1);
  });

  it("ne renvoie rien quand la recherche ne correspond à personne", () => {
    expect(filtrerMotos(stock, { ...FILTRES_VIDES, recherche: "ZZZ" })).toHaveLength(0);
  });
});

describe("chassisDejaPris", () => {
  const stock = [moto({ id: "1", numeroChassis: "AAA111" })];

  it("reconnaît le doublon même écrit autrement", () => {
    expect(chassisDejaPris("aaa 111", stock)?.id).toBe("1");
  });

  it("laisse passer un châssis neuf", () => {
    expect(chassisDejaPris("BBB222", stock)).toBeUndefined();
  });

  it("ne se signale pas à soi-même lors d’une correction", () => {
    expect(chassisDejaPris("AAA111", stock, "1")).toBeUndefined();
  });
});

describe("validerFichierPapier", () => {
  const fichier = (type: string, size: number) => ({ type, size });

  it("accepte une photo ou un PDF", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(validerFichierPapier(fichier(type, 500_000)), type).toBeNull();
    }
  });

  it("refuse ce qui n’est ni une image ni un PDF", () => {
    for (const type of ["application/x-msdownload", "text/html", ""]) {
      expect(validerFichierPapier(fichier(type, 1000)), type).toMatch(/photo|PDF/i);
    }
  });

  /* Cinq mégaoctets : au-delà, un envoi depuis un téléphone en 3G n'aboutit
     pas, et l'échec arrive après une longue attente. Mieux vaut le dire avant. */
  it("refuse un fichier trop lourd, en disant quoi faire", () => {
    const message = validerFichierPapier(fichier("image/jpeg", 6 * 1024 * 1024));
    expect(message).toMatch(/5 Mo/);
    expect(message).toMatch(/[Pp]hotographiez/);
  });

  it("accepte exactement cinq mégaoctets", () => {
    expect(validerFichierPapier(fichier("image/jpeg", 5 * 1024 * 1024))).toBeNull();
  });

  it("refuse un fichier vide", () => {
    expect(validerFichierPapier(fichier("image/jpeg", 0))).toMatch(/vide/i);
  });
});

describe("validerChassis", () => {
  it("refuse un châssis vide : c'est l'identité de la moto", () => {
    expect(validerChassis("  ")).toMatch(/obligatoire/i);
  });

  it("refuse un châssis trop long", () => {
    expect(validerChassis("A".repeat(LONGUEUR_CHASSIS_MAX + 1))).toMatch(/dépasse/i);
  });

  it("refuse un châssis avec des caractères autres que lettres et chiffres", () => {
    expect(validerChassis("LC6/PCJ")).toMatch(/lettres et.*chiffres/i);
  });

  it("accepte un châssis normalisé", () => {
    expect(validerChassis("lc6pcj1a9k0000123")).toBeNull();
  });
});

describe("normaliserPlaque", () => {
  it("taille les espaces et met en capitales : une plaque se lit d’un coup d’œil", () => {
    expect(normaliserPlaque("  11 aa 1234  ")).toBe("11 AA 1234");
  });

  it("réduit les espaces internes multiples à un seul", () => {
    expect(normaliserPlaque("11   AA   1234")).toBe("11 AA 1234");
  });

  /* **Point de vigilance 5.** Un champ libre reçoit tôt ou tard un collage
     malheureux ; la borne protège la règle Firestore d’un refus que le gérant
     ne saurait pas lire. */
  it("borne la longueur sans rien inventer au-delà", () => {
    expect(normaliserPlaque("A".repeat(200))).toHaveLength(PLAQUE_LONGUEUR_MAX);
  });

  it("rend une chaîne vide sur une saisie vide, jamais null", () => {
    expect(normaliserPlaque("   ")).toBe("");
  });
});
