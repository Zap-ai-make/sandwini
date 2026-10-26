import { describe, expect, it } from "vitest";

import {
  champsDeLaLigne,
  champsDossierNeuf,
  chercherDossiers,
  dossierEnCours,
  ENTETES_LIGNE,
  estTerminal,
  LIBELLE_STATUT_CARTE_GRISE,
  LIGNE_VIDE,
  ligneDuDossier,
  ligneEstVide,
  ligneSuivante,
  ORDRE_LIGNE,
  rangerDossiers,
  statutDeLaLigne,
  validerLigne,
  type DossierCarteGrise,
  type SaisieLigne,
} from "./dossier-carte-grise";

/**
 * Le dossier de carte grise, tel que son classeur le tient (S59).
 *
 * **Ce que ces tests gardent.** Le commanditaire a demandé ses dix colonnes,
 * sous ses noms et dans son ordre : ce sont elles qu'on fige ici, parce qu'un
 * entête qui dérive lui fera relire la colonne à chaque ligne. Puis la
 * déduction du statut — il n'y a plus de machine à états, c'est le remplissage
 * des cases qui dit où se trouve le papier — et le seul contrôle de cohérence
 * entre deux cases, le retrait antérieur au dépôt.
 */

describe("les dix colonnes de son classeur", () => {
  it("garde ses noms, fautes comprises, et son ordre", () => {
    /* **Fautes comprises, et c'est la demande.** Il s'est familiarisé avec son
       fichier et ne veut pas en changer. `CHASIS` sans S, `TRANSITE` pour le
       prestataire : les corriger ferait un écran qu'il ne reconnaît plus.

       **Deux exceptions, demandées par lui le 26 octobre 2026.** `Reci`
       devient `Reçu` — c'était une faute de frappe, pas un mot à lui — et
       `RECEPTION` passe entre `Depot` et `retrait`, l'ordre du trajet du
       dossier : on dépose, la carte revient, le client l'emporte. */
    expect(ORDRE_LIGNE.map((cle) => ENTETES_LIGNE[cle])).toEqual([
      "Tel",
      "client",
      "MOTO",
      "CHASIS",
      "Reçu",
      "Credit",
      "Depot",
      "RECEPTION",
      "retrait",
      "Immatriculation",
      "TRANSITE",
    ]);
  });

  it("n’en ajoute aucune : la saisie et le tableau montrent les mêmes", () => {
    expect(ORDRE_LIGNE).toHaveLength(11);
    expect(Object.keys(ENTETES_LIGNE).sort()).toEqual([...ORDRE_LIGNE].sort());
    expect(Object.keys(LIGNE_VIDE).sort()).toEqual([...ORDRE_LIGNE].sort());
  });
});

describe("ce qui est fini", () => {
  it("s’arrête à la remise, et pas avant", () => {
    /* **Le changement de définition de S59.** S53 arrêtait le parcours au
       retour au magasin. Le fichier du client montre qu'il manque une étape :
       une carte revenue n'est pas une carte rendue, et c'est justement celle
       qu'il faut pouvoir retrouver quand quelqu'un vient la chercher. */
    expect(estTerminal("revenu_magasin")).toBe(false);
    expect(estTerminal("chez_prestataire")).toBe(false);
    expect(estTerminal("remis")).toBe(true);
    expect(estTerminal("non_applicable")).toBe(true);
  });

  it("nomme chaque étape avec les mots du comptoir", () => {
    expect(LIBELLE_STATUT_CARTE_GRISE.chez_prestataire).toBe("Chez le prestataire");
    expect(LIBELLE_STATUT_CARTE_GRISE.remis).toBe("Remis");
  });
});

describe("ce qui est encore en cours", () => {
  const dossier = (statut: DossierCarteGrise["statut"]) =>
    ({ statut }) as unknown as DossierCarteGrise;

  it("garde tout ce qui n’est ni remis ni écarté", () => {
    /* Y compris une carte revenue : elle attend son propriétaire, et c'est
       exactement la ligne qu'on cherche quand il se présente au comptoir. */
    expect(dossierEnCours(dossier("a_faire"))).toBe(true);
    expect(dossierEnCours(dossier("chez_prestataire"))).toBe(true);
    expect(dossierEnCours(dossier("revenu_magasin"))).toBe(true);
    expect(dossierEnCours(dossier("remis"))).toBe(false);
    expect(dossierEnCours(dossier("non_applicable"))).toBe(false);
  });
});


describe("une ligne de son classeur", () => {
  const LIGNE: SaisieLigne = {
    ...LIGNE_VIDE,
    client: "SOUMBOUGMA KARIM",
    moto: "SR - 115",
    chassis: "10RY243294",
  };

  it("accepte un propriétaire et un châssis, le reste vide", () => {
    expect(validerLigne(LIGNE)).toBeNull();
  });

  it("exige un nom : sans lui, personne ne vient chercher le papier", () => {
    expect(validerLigne({ ...LIGNE, client: "  " })).toMatch(/nom/i);
  });

  it("exige un châssis : c’est l’identité de la moto", () => {
    expect(validerLigne({ ...LIGNE, chassis: "" })).toMatch(/châssis/i);
  });

  it("n’impose aucune longueur de châssis", () => {
    /* **Relevé sur le fichier du client le 21 octobre 2026 :** leurs numéros
       font dix à douze caractères — 10RY243294, 4140RY029597 — et non les
       dix-sept d'une voiture. Une longueur imposée aurait refusé la totalité
       de leurs dossiers. */
    expect(validerLigne({ ...LIGNE, chassis: "10RY243294" })).toBeNull();
    expect(validerLigne({ ...LIGNE, chassis: "4140RY029597" })).toBeNull();
  });

  it("refuse un châssis qui n’est pas fait de lettres et de chiffres", () => {
    expect(validerLigne({ ...LIGNE, chassis: "70SJ/0229" })).toMatch(/châssis/i);
  });

  it("se passe du modèle : son fichier en a des lignes sans", () => {
    expect(validerLigne({ ...LIGNE, moto: "" })).toBeNull();
  });

  it("accepte la ligne entière, transcrite d’un coup", () => {
    /* **C'est sa saisie la plus courante**, et c'est pour elle que la machine à
       états est partie : il recopie des dossiers vieux d'un an, donc il remplit
       toutes les cases avant d'enregistrer. */
    expect(
      validerLigne({
        tel: "70112233",
        client: "SANA HAROUNA",
        moto: "GEAR",
        chassis: "70SJ022946",
        recu: true,
        credit: "",
        reception: "70518381",
        retrait: "2026-07-29",
        depot: "2025-08-18",
        immatriculation: "7078 7DQ 04",
        transite: "BOHARY",
      }),
    ).toBeNull();
  });

  it("refuse un retrait antérieur au dépôt", () => {
    /* Le seul contrôle entre deux cases, et il attrape une faute de frappe qui
       coûte cher : une carte rendue avant d'être partie n'existe pas, et la
       ligne resterait lisible et fausse pour toujours. */
    expect(
      validerLigne({ ...LIGNE, depot: "2026-07-29", retrait: "2025-08-18" }),
    ).toMatch(/antérieur/i);
  });

  it("accepte un dépôt et un retrait le même jour", () => {
    expect(
      validerLigne({ ...LIGNE, depot: "2026-07-29", retrait: "2026-07-29" }),
    ).toBeNull();
  });

  it("refuse une date qui n’en est pas une, mais pas une case vide", () => {
    expect(validerLigne({ ...LIGNE, depot: "2026-02-31" })).toMatch(/date/i);
    expect(validerLigne({ ...LIGNE, retrait: "" })).toBeNull();
  });

  it("lit le crédit comme un montant en francs, et le laisse vide", () => {
    /* Sa colonne `Credit` est vide sur toutes les lignes relevées. Elle existe
       quand même, parce qu'il a demandé ses champs et qu'un champ absent est
       un champ qu'il ira chercher ailleurs. */
    expect(validerLigne({ ...LIGNE, credit: "" })).toBeNull();
    expect(validerLigne({ ...LIGNE, credit: "150 000" })).toBeNull();
    expect(validerLigne({ ...LIGNE, credit: "12,5" })).toMatch(/montant/i);
  });

  it("borne le téléphone et la plaque", () => {
    expect(validerLigne({ ...LIGNE, reception: "7".repeat(40) })).toMatch(/téléphone/i);
    expect(validerLigne({ ...LIGNE, immatriculation: "A".repeat(30) })).toMatch(
      /immatriculation/i,
    );
  });
});

describe("le statut que les cases racontent", () => {
  const NEUF = { statut: "a_faire" as const, revenuLe: null };

  it("ne dit rien tant que rien n’est rempli", () => {
    expect(statutDeLaLigne(LIGNE_VIDE, NEUF)).toBe("a_faire");
  });

  it("dit « chez le prestataire » dès que le dépôt ou le prestataire est là", () => {
    expect(statutDeLaLigne({ ...LIGNE_VIDE, depot: "2025-08-18" }, NEUF)).toBe("chez_prestataire");
    expect(statutDeLaLigne({ ...LIGNE_VIDE, transite: "BOHARY" }, NEUF)).toBe("chez_prestataire");
  });

  it("dit « au magasin » dès que la plaque est connue", () => {
    /* `Immatriculation` est la preuve du retour : la plaque s'obtient avec la
       carte grise, et son classeur n'a pas d'autre colonne pour le dire. */
    expect(
      statutDeLaLigne({ ...LIGNE_VIDE, depot: "2025-08-18", immatriculation: "7078 7DQ 04" }, NEUF),
    ).toBe("revenu_magasin");
  });

  it("garde « au magasin » pour un papier revenu sans numéro", () => {
    /* Le numéro n'est pas toujours sous la main au retour. Sans ce rappel, la
       moindre correction d'une autre case renverrait le dossier chez le
       prestataire — alors que le papier est sur le bureau. */
    expect(
      statutDeLaLigne(
        { ...LIGNE_VIDE, depot: "2025-08-18" },
        { statut: "revenu_magasin", revenuLe: new Date(2026, 5, 10) },
      ),
    ).toBe("revenu_magasin");
  });

  it("dit « remis » dès que le retrait est daté", () => {
    expect(statutDeLaLigne({ ...LIGNE_VIDE, retrait: "2026-07-29" }, NEUF)).toBe("remis");
  });

  it("revient au départ quand on vide les cases d’un dossier parti par erreur", () => {
    /* C'est la correction qu'on vient chercher en rouvrant la ligne : un dépôt
       inscrit sur le mauvais dossier s'efface, et le papier redevient à faire. */
    expect(statutDeLaLigne(LIGNE_VIDE, { statut: "chez_prestataire", revenuLe: null })).toBe(
      "a_faire",
    );
  });

  it("n’invente jamais « sans objet », et ne le dément pas non plus", () => {
    /* « Sans objet » vient du comptoir — le client ne veut pas de carte grise —
       et aucune colonne de son classeur ne le porte. */
    expect(statutDeLaLigne(LIGNE_VIDE, { statut: "non_applicable", revenuLe: null })).toBe(
      "non_applicable",
    );
    expect(
      statutDeLaLigne({ ...LIGNE_VIDE, depot: "2025-08-18" }, { statut: "non_applicable", revenuLe: null }),
    ).toBe("chez_prestataire");
  });
});

describe("les champs que la ligne décide", () => {
  const NEUF = { statut: "a_faire" as const, revenuLe: null };
  const AUJOURDHUI = new Date(2026, 9, 23);

  it("range le châssis en majuscules, sans espaces ni tirets", () => {
    /* Deux saisies du même numéro doivent donner la même chaîne, sinon le
       contrôle d'unicité laisse passer un doublon. */
    const champs = champsDeLaLigne(
      { ...LIGNE_VIDE, client: " SANA HAROUNA ", chassis: " 02sy-052982 " },
      NEUF,
      AUJOURDHUI,
    );
    expect(champs.numeroChassis).toBe("02SY052982");
    expect(champs.clientNom).toBe("SANA HAROUNA");
  });

  it("met les cases aux champs du dossier", () => {
    const champs = champsDeLaLigne(
      {
        tel: "70112233",
        client: "SANA HAROUNA",
        moto: "GEAR",
        chassis: "70SJ022946",
        recu: true,
        credit: "150 000",
        reception: "70518381",
        retrait: "2026-07-29",
        depot: "2025-08-18",
        immatriculation: "7078 7DQ 04",
        transite: "BOHARY",
      },
      NEUF,
      AUJOURDHUI,
    );
    expect(champs.clientTelephone).toBe("70112233");
    expect(champs.recu).toBe(true);
    expect(champs.credit).toBe(150_000);
    /* `RECEPTION` porte un téléphone, pas un nom : ce sont des numéros à huit
       chiffres dans son fichier. */
    expect(champs.remisATelephone).toBe("70518381");
    expect(champs.prestataireNom).toBe("BOHARY");
    expect(champs.deposeLe).toEqual(new Date(2025, 7, 18, 12));
    expect(champs.remisLe).toEqual(new Date(2026, 6, 29, 12));
    expect(champs.statut).toBe("remis");
  });

  it("laisse le crédit vide plutôt qu’à zéro", () => {
    /* Zéro dirait « il ne doit rien », vide dit « on n'a pas renseigné ». Sur
       une colonne vide dans tout son fichier, la nuance est la seule chose qui
       reste. */
    expect(champsDeLaLigne(LIGNE_VIDE, NEUF, AUJOURDHUI).credit).toBeNull();
  });

  it("date le retour du jour où on l’enregistre", () => {
    const champs = champsDeLaLigne(
      { ...LIGNE_VIDE, immatriculation: "7078 7DQ 04" },
      NEUF,
      AUJOURDHUI,
    );
    expect(champs.revenuLe).toEqual(AUJOURDHUI);
  });

  it("ne rejuge pas un retour déjà daté", () => {
    const connu = new Date(2026, 5, 10);
    const champs = champsDeLaLigne(
      { ...LIGNE_VIDE, immatriculation: "7078 7DQ 04" },
      { statut: "revenu_magasin", revenuLe: connu },
      AUJOURDHUI,
    );
    expect(champs.revenuLe).toEqual(connu);
  });

  it("sur une ligne transcrite d’un coup, fait revenir le papier le jour du retrait", () => {
    /* **Sans rien inventer.** Son classeur n'a pas de colonne pour le retour au
       magasin ; sur une ligne déjà rendue, la seule date qu'on ait est celle du
       retrait, et le papier était forcément revenu au plus tard ce jour-là. */
    const champs = champsDeLaLigne(
      { ...LIGNE_VIDE, depot: "2025-08-18", retrait: "2026-07-29" },
      NEUF,
      AUJOURDHUI,
    );
    expect(champs.revenuLe).toEqual(new Date(2026, 6, 29, 12));
  });

  it("ne date aucun retour sur un dossier qui n’est pas parti", () => {
    expect(champsDeLaLigne(LIGNE_VIDE, NEUF, AUJOURDHUI).revenuLe).toBeNull();
  });
});

describe("ranger les dossiers pour l’écran", () => {
  const dossier = (partie: Partial<DossierCarteGrise>): DossierCarteGrise =>
    ({
      id: "d",
      statut: "a_faire",
      clientNom: "",
      deposeLe: null,
      remisLe: null,
      ...partie,
    }) as DossierCarteGrise;

  it("sépare ce qui attend de ce qui est fini", () => {
    const { cours, termines } = rangerDossiers([
      dossier({ id: "a", statut: "remis" }),
      dossier({ id: "b", statut: "chez_prestataire" }),
      dossier({ id: "c", statut: "non_applicable" }),
      dossier({ id: "d", statut: "revenu_magasin" }),
    ]);
    expect(cours.map((d) => d.id)).toEqual(["b", "d"]);
    expect(termines.map((d) => d.id).sort()).toEqual(["a", "c"]);
  });

  it("met en tête ce qui n’est pas encore parti", () => {
    /* Un dossier sans dépôt est celui sur lequel il y a quelque chose à
       faire. Le ranger après ceux qui sont déjà chez quelqu'un enterrerait la
       seule colonne d'action de l'écran sous une année d'attente. */
    const { cours } = rangerDossiers([
      dossier({ id: "parti", statut: "chez_prestataire", deposeLe: new Date(2025, 7, 18) }),
      dossier({ id: "a-faire", statut: "a_faire" }),
    ]);
    expect(cours.map((d) => d.id)).toEqual(["a-faire", "parti"]);
  });

  it("puis du plus ancien dépôt au plus récent", () => {
    /* C'est une file qu'on vide : entre le dépôt et le retrait il passe presque
       un an, et ce qui traîne depuis le plus longtemps est ce qu'il faut
       relancer. */
    const { cours } = rangerDossiers([
      dossier({ id: "recent", statut: "chez_prestataire", deposeLe: new Date(2026, 5, 1) }),
      dossier({ id: "vieux", statut: "chez_prestataire", deposeLe: new Date(2025, 7, 18) }),
    ]);
    expect(cours.map((d) => d.id)).toEqual(["vieux", "recent"]);
  });

  it("rend l’historique du plus récemment remis", () => {
    /* Une file se vide par le bas, un historique se lit par le haut : on y
       cherche ce qui vient de se passer. */
    const { termines } = rangerDossiers([
      dossier({ id: "ancien", statut: "remis", remisLe: new Date(2026, 1, 3) }),
      dossier({ id: "hier", statut: "remis", remisLe: new Date(2026, 9, 22) }),
    ]);
    expect(termines.map((d) => d.id)).toEqual(["hier", "ancien"]);
  });
});

describe("les champs d’un dossier neuf", () => {
  const NAISSANCE = {
    boutiqueId: "PTG",
    venteId: "v1",
    origine: "vente" as const,
    clientNom: "Sawadogo Harouna",
    motoLibelle: "Yamaha SR 115",
    numeroChassis: "02SY052982",
    statut: "a_faire" as const,
  };

  it("porte les vingt champs, et pas un de plus", () => {
    /* **Les règles exigent `hasOnly`** : un champ en trop fait refuser
       l'écriture, et un champ manquant fait refuser toutes les modifications
       suivantes. C'est la seule chose que ce test garde. */
    expect(Object.keys(champsDossierNeuf(NAISSANCE)).sort()).toEqual(
      [
        "avance",
        "boutiqueId",
        "clientNom",
        "clientTelephone",
        "credit",
        "deposeLe",
        "disponibleLe",
        "immatriculation",
        "motoLibelle",
        "numeroChassis",
        "origine",
        "prestataireId",
        "prestataireNom",
        "recu",
        "remisANom",
        "remisATelephone",
        "remisLe",
        "revenuLe",
        "statut",
        "venteId",
      ].sort(),
    );
  });

  it("naît vide de tout ce qui s’écrit plus tard", () => {
    const champs = champsDossierNeuf(NAISSANCE);
    expect(champs.prestataireId).toBeNull();
    expect(champs.deposeLe).toBeNull();
    expect(champs.avance).toBeNull();
    expect(champs.immatriculation).toBe("");
    expect(champs.remisANom).toBe("");
  });

  it("laisse passer « sans objet » quand le client n’en veut pas", () => {
    /* La case du comptoir pilote le dossier (S53, arbitrage 5). Décocher
       « Carte grise » ne doit pas laisser un dossier à faire que personne ne
       fera jamais. */
    expect(champsDossierNeuf({ ...NAISSANCE, statut: "non_applicable" }).statut).toBe(
      "non_applicable",
    );
  });

  it("recopie le propriétaire et la moto en clair", () => {
    /* Elle ne lit ni le fichier des clients ni le stock : sans cette copie, sa
       liste afficherait des identifiants. */
    const champs = champsDossierNeuf(NAISSANCE);
    expect(champs.clientNom).toBe("Sawadogo Harouna");
    expect(champs.motoLibelle).toBe("Yamaha SR 115");
  });

  it("garde un dossier extérieur sans vente", () => {
    const champs = champsDossierNeuf({ ...NAISSANCE, origine: "exterieur", venteId: null });
    expect(champs.venteId).toBeNull();
    expect(champs.origine).toBe("exterieur");
  });
});

describe("rouvrir une ligne pour la corriger", () => {
  const DOSSIER: DossierCarteGrise = {
    id: "d1",
    boutiqueId: "PTG",
    venteId: null,
    origine: "exterieur",
    clientNom: "SOUMBOUGMA KARIM",
    clientTelephone: "70445566",
    motoLibelle: "SR-115",
    numeroChassis: "10RY243294",
    recu: true,
    credit: 150_000,
    statut: "remis",
    prestataireId: "p1",
    prestataireNom: "BOHARY",
    deposeLe: new Date(2025, 7, 18, 12),
    avance: 100_000,
    disponibleLe: null,
    immatriculation: "7078 7DQ 04",
    revenuLe: new Date(2026, 5, 10, 12),
    remisLe: new Date(2026, 6, 29, 12),
    remisANom: "",
    remisATelephone: "70518381",
  };

  it("remet chaque case dans l’état où elle a été laissée", () => {
    /* **L'aller-retour doit être neutre.** Rouvrir une ligne et enregistrer
       sans rien toucher ne doit rien changer — sinon la moindre relecture
       déplacerait un dossier. */
    expect(ligneDuDossier(DOSSIER)).toEqual({
      tel: "70445566",
      client: "SOUMBOUGMA KARIM",
      moto: "SR-115",
      chassis: "10RY243294",
      recu: true,
      credit: "150000",
      reception: "70518381",
      retrait: "2026-07-29",
      depot: "2025-08-18",
      immatriculation: "7078 7DQ 04",
      transite: "BOHARY",
    });
  });

  it("rend un crédit absent comme une case vide, et non comme zéro", () => {
    expect(ligneDuDossier({ ...DOSSIER, credit: null }).credit).toBe("");
  });

  it("rend les dates absentes comme des cases vides", () => {
    const ligne = ligneDuDossier({ ...DOSSIER, deposeLe: null, remisLe: null });
    expect(ligne.depot).toBe("");
    expect(ligne.retrait).toBe("");
  });

  it("se relit sans rien déplacer", () => {
    const champs = champsDeLaLigne(ligneDuDossier(DOSSIER), DOSSIER, new Date(2026, 9, 23));
    expect(champs.statut).toBe(DOSSIER.statut);
    expect(champs.deposeLe).toEqual(DOSSIER.deposeLe);
    expect(champs.remisLe).toEqual(DOSSIER.remisLe);
    expect(champs.revenuLe).toEqual(DOSSIER.revenuLe);
    expect(champs.credit).toBe(DOSSIER.credit);
  });
});

describe("enchaîner plusieurs lignes", () => {
  it("hérite du dépôt et du prestataire, et de rien d’autre", () => {
    /* **Un relevé, pas une commodité.** Son classeur porte la même date de
       `Depot` sur tout un bloc : c'est un paquet confié le même jour, au même
       transitaire. Un châssis ou un nom hérité, lui, serait un doublon que
       personne ne remarque. */
    const premiere: SaisieLigne = {
      tel: "70112233",
      client: "SANA HAROUNA",
      moto: "GEAR",
      chassis: "70SJ022946",
      recu: true,
      credit: "150000",
      reception: "70518381",
      retrait: "2026-07-29",
      depot: "2025-08-18",
      immatriculation: "7078 7DQ 04",
      transite: "BOHARY",
    };

    expect(ligneSuivante(premiere)).toEqual({
      ...LIGNE_VIDE,
      depot: "2025-08-18",
      transite: "BOHARY",
    });
  });

  it("reconnaît une ligne où personne n’a rien tapé", () => {
    expect(ligneEstVide(LIGNE_VIDE)).toBe(true);
    expect(ligneEstVide({ ...LIGNE_VIDE, client: "  " })).toBe(true);
    expect(ligneEstVide({ ...LIGNE_VIDE, tel: "70112233" })).toBe(false);
    expect(ligneEstVide({ ...LIGNE_VIDE, recu: true })).toBe(false);
  });

  it("tient la ligne de trop pour vide, malgré ce qu’elle a hérité", () => {
    /* **Sinon le « + » de trop écrit un dossier fantôme.** La dernière ligne
       porte la date du dépôt et le transitaire sans rien d'autre : si elle
       comptait comme saisie, elle partirait dans la base comme une carte
       confiée à personne. */
    expect(ligneEstVide(ligneSuivante({ ...LIGNE_VIDE, depot: "2025-08-18", transite: "BOHARY" }))).toBe(
      true,
    );
  });
});

describe("chercher dans la liste", () => {
  const normaliser = (brut: string) =>
    brut.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

  const base: DossierCarteGrise = {
    id: "d1",
    boutiqueId: "PTG",
    venteId: null,
    origine: "exterieur",
    clientNom: "SOUMBOUGMA KARIM",
    clientTelephone: "70445566",
    motoLibelle: "SR-115",
    numeroChassis: "10RY243294",
    recu: false,
    credit: null,
    statut: "chez_prestataire",
    prestataireId: null,
    prestataireNom: "BOHARY",
    deposeLe: new Date(2025, 7, 18, 12),
    avance: null,
    disponibleLe: null,
    immatriculation: "7078 7DQ 04",
    revenuLe: null,
    remisLe: null,
    remisANom: "",
    remisATelephone: "70518381",
  };
  const autre: DossierCarteGrise = {
    ...base,
    id: "d2",
    clientNom: "SANA HAROUNA",
    clientTelephone: "76001122",
    motoLibelle: "GEAR",
    numeroChassis: "70SJ022946",
    prestataireNom: "KABORE",
    immatriculation: "",
    remisATelephone: "",
    deposeLe: new Date(2026, 5, 2, 12),
  };
  const liste = [base, autre];

  it("rend tout quand on n’a rien tapé", () => {
    expect(chercherDossiers(liste, "   ", normaliser)).toHaveLength(2);
  });

  it("cherche dans toutes les colonnes, pas dans une seule", () => {
    /* La demande : « qu'on puisse faire une recherche là-dessus », sur tous les
       champs. Celui qui cherche au comptoir a un bout de papier a la main ; il
       ne sait pas dans quelle colonne vit ce qu'il lit. */
    expect(chercherDossiers(liste, "karim", normaliser).map((d) => d.id)).toEqual(["d1"]);
    expect(chercherDossiers(liste, "70445566", normaliser).map((d) => d.id)).toEqual(["d1"]);
    expect(chercherDossiers(liste, "70SJ022946", normaliser).map((d) => d.id)).toEqual(["d2"]);
    expect(chercherDossiers(liste, "kabore", normaliser).map((d) => d.id)).toEqual(["d2"]);
    expect(chercherDossiers(liste, "gear", normaliser).map((d) => d.id)).toEqual(["d2"]);
  });

  it("trouve le téléphone de celui qui est venu chercher, pas seulement celui du propriétaire", () => {
    /* Les deux numéros sont des colonnes distinctes — `Tel` et `RECEPTION` — et
       ce n'est pas la même personne. */
    expect(chercherDossiers(liste, "70518381", normaliser).map((d) => d.id)).toEqual(["d1"]);
  });

  it("retrouve une plaque tapée d’un seul tenant", () => {
    /* Elle se lit `7078 7DQ 04` sur le papier et se tape rarement avec ses
       espaces. */
    expect(chercherDossiers(liste, "70787DQ04", normaliser).map((d) => d.id)).toEqual(["d1"]);
  });

  it("cherche une date comme on la lit, comme on la tape, ou par son année", () => {
    expect(chercherDossiers(liste, "18/08/2025", normaliser).map((d) => d.id)).toEqual(["d1"]);
    expect(chercherDossiers(liste, "2025-08-18", normaliser).map((d) => d.id)).toEqual(["d1"]);
    expect(chercherDossiers(liste, "2026", normaliser).map((d) => d.id)).toEqual(["d2"]);
  });

  it("demande que chaque mot se retrouve, sans exiger la même colonne", () => {
    /* « sana 2026 » rend les lignes de Sana datées de 2026. Deux mots forcés
       dans la même colonne n'auraient presque jamais de réponse. */
    expect(chercherDossiers(liste, "sana 2026", normaliser).map((d) => d.id)).toEqual(["d2"]);
    expect(chercherDossiers(liste, "sana 2025", normaliser)).toEqual([]);
  });

  it("ignore accents et casse", () => {
    expect(chercherDossiers(liste, "Kaboré", normaliser).map((d) => d.id)).toEqual(["d2"]);
  });

  it("rend une liste vide plutôt que tout, quand rien ne correspond", () => {
    /* Le pire des deux comportements serait de rendre la liste entière : on
       croirait avoir trouvé. */
    expect(chercherDossiers(liste, "zzzz", normaliser)).toEqual([]);
  });
});
