import { describe, expect, it } from "vitest";
import {
  LONGUEUR_NIP,
  SAISIE_CLIENT_VIDE,
  chercherClients,
  comparerClients,
  formaterTelephone,
  lireNip,
  nipDejaPris,
  nomComplet,
  nomPourRecherche,
  normaliserNom,
  normaliserTelephone,
  telephoneDejaPris,
  validerClient,
  type Client,
  type SaisieClient,
} from "./client";

const NIP = "12345678901234567";

const saisie = (partie: Partial<SaisieClient> = {}): SaisieClient => ({
  ...SAISIE_CLIENT_VIDE,
  nom: "Ouédraogo",
  prenom: "Salif",
  telephone: "70 12 34 56",
  ...partie,
});

const client = (partie: Partial<Client> = {}): Client => ({
  id: "1",
  nom: "Ouédraogo",
  prenom: "Salif",
  nip: "",
  telephone: "70 12 34 56",
  telephoneNormalise: "+22670123456",
  telephone2: "",
  adresse: "",
  note: "",
  nomNormalise: "ouedraogo salif",
  ...partie,
});

/** Une fiche d'avant S44 : tout le nom dans `nom`, ni prénom ni NIP. */
const clientLegacy = (partie: Partial<Client> = {}): Client =>
  client({ nom: "Ouédraogo Salif", prenom: "", nip: "", ...partie });

describe("normaliserTelephone", () => {
  it("ramène les trois façons d’écrire le même numéro à une seule", () => {
    for (const ecriture of ["70 12 34 56", "+226 70 12 34 56", "0022670123456", "70-12-34-56"]) {
      expect(normaliserTelephone(ecriture), ecriture).toBe("+22670123456");
    }
  });

  it("garde l’indicatif d’un client étranger", () => {
    expect(normaliserTelephone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("ne devine pas un pays quand la longueur n’est pas locale", () => {
    expect(normaliserTelephone("123456789012")).toBe("123456789012");
  });

  it("rend une chaîne vide pour une saisie vide", () => {
    expect(normaliserTelephone("   ")).toBe("");
  });
});

describe("formaterTelephone", () => {
  it("écrit un numéro burkinabè comme on le dicte", () => {
    expect(formaterTelephone("+22670123456")).toBe("70 12 34 56");
    expect(formaterTelephone("70123456")).toBe("70 12 34 56");
  });

  it("laisse un numéro étranger tel qu’il a été saisi", () => {
    expect(formaterTelephone("+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78");
  });
});

describe("normaliserNom", () => {
  it("ignore la casse, les accents et les espaces en trop", () => {
    expect(normaliserNom("  Ouédraogo   SALIF ")).toBe("ouedraogo salif");
  });
});

describe("validerClient", () => {
  it("accepte une saisie minimale", () => {
    expect(validerClient(saisie())).toBeNull();
  });

  it("exige un nom et un téléphone", () => {
    expect(validerClient(saisie({ nom: "  " }))).toMatch(/nom/i);
    expect(validerClient(saisie({ telephone: "" }))).toMatch(/téléphone/i);
  });

  it("refuse un numéro trop court pour être joignable", () => {
    expect(validerClient(saisie({ telephone: "701" }))).toMatch(/trop court/);
  });

  it("accepte l’adresse et la note vides", () => {
    expect(validerClient(saisie({ adresse: "", note: "" }))).toBeNull();
  });

  it("refuse les textes trop longs plutôt que de les couper", () => {
    expect(validerClient(saisie({ nom: "n".repeat(81) }))).toMatch(/nom/i);
    expect(validerClient(saisie({ prenom: "p".repeat(81) }))).toMatch(/prénom/i);
    expect(validerClient(saisie({ adresse: "a".repeat(201) }))).toMatch(/adresse/i);
    expect(validerClient(saisie({ note: "n".repeat(301) }))).toMatch(/note/i);
  });

  /* Le prénom est facultatif : les fiches d'avant S44 n'en ont pas, et une
     personne connue sous un seul nom ne doit pas en inventer un. */
  it("accepte une fiche sans prénom", () => {
    expect(validerClient(saisie({ prenom: "" }))).toBeNull();
  });

  /* Le NIP est facultatif, et c'est un arbitrage : une vente au comptoir ne
     s'arrête pas parce que le client a oublié sa carte (D76). */
  it("accepte un NIP vide", () => {
    expect(validerClient(saisie({ nip: "" }))).toBeNull();
  });

  it("accepte un NIP de dix-sept chiffres", () => {
    expect(validerClient(saisie({ nip: NIP }))).toBeNull();
  });

  it("refuse un NIP renseigné qui n’a pas la bonne longueur", () => {
    expect(validerClient(saisie({ nip: "1234567890123456" }))).toMatch(/17/);
    expect(validerClient(saisie({ nip: "123456789012345678" }))).toMatch(/17/);
  });
});

describe("nomComplet", () => {
  it("assemble le nom puis le prénom", () => {
    expect(nomComplet(client({ nom: "Ouédraogo", prenom: "Salif" }))).toBe("Ouédraogo Salif");
  });

  /* La rétro-compatibilité tient dans cette ligne : une fiche d'avant S44 porte
     tout dans `nom` et rend exactement la chaîne qu'elle rendait déjà. */
  it("rend une fiche d’avant S44 telle qu’elle était", () => {
    expect(nomComplet(clientLegacy())).toBe("Ouédraogo Salif");
  });

  it("ne laisse pas d’espace en trop quand une part manque", () => {
    expect(nomComplet(client({ nom: "Zongo", prenom: "" }))).toBe("Zongo");
    expect(nomComplet(client({ nom: "  Zongo  ", prenom: "  Ali " }))).toBe("Zongo Ali");
  });
});

describe("nomPourRecherche", () => {
  it("couvre le nom et le prénom, pour qu’on trouve par l’un ou par l’autre", () => {
    expect(nomPourRecherche({ nom: "Ouédraogo", prenom: "Salif" })).toBe("ouedraogo salif");
  });

  it("rend la même forme qu’avant pour une fiche sans prénom", () => {
    expect(nomPourRecherche({ nom: "Ouédraogo Salif", prenom: "" })).toBe("ouedraogo salif");
  });
});

describe("lireNip", () => {
  it("absorbe les espaces et les tirets d’un numéro recopié", () => {
    expect(lireNip("1234 5678-9012 34567")).toBe(NIP);
  });

  it("ne garde que les chiffres", () => {
    expect(lireNip("  ")).toBe("");
    expect(lireNip("B1234")).toBe("1234");
  });

  it("s’arrête à la longueur du numéro plutôt que d’accepter n’importe quoi", () => {
    expect(lireNip("1".repeat(25))).toHaveLength(LONGUEUR_NIP);
  });
});

describe("nipDejaPris", () => {
  const fichier = [client({ id: "1", nip: NIP }), client({ id: "2", nip: "" })];

  it("reconnaît le même numéro écrit avec des espaces", () => {
    expect(nipDejaPris("1234 5678 9012 34567", fichier)?.id).toBe("1");
  });

  /* Sans cette garde, toutes les fiches sans NIP se rapprocheraient les unes
     des autres — et le rapprochement produirait ce qu'il devait empêcher. */
  it("ne rapproche jamais sur un NIP vide", () => {
    expect(nipDejaPris("", fichier)).toBeUndefined();
  });

  it("laisse passer un numéro neuf", () => {
    expect(nipDejaPris("99999999999999999", fichier)).toBeUndefined();
  });

  it("ne se signale pas à soi-même lors d’une correction", () => {
    expect(nipDejaPris(NIP, fichier, "1")).toBeUndefined();
  });
});

describe("chercherClients", () => {
  const fichier = [
    client({ id: "1", nom: "Ouédraogo", prenom: "Salif", telephoneNormalise: "+22670123456" }),
    client({
      id: "2",
      nom: "Kaboré",
      prenom: "Awa",
      nomNormalise: "kabore awa",
      telephone: "76 55 44 33",
      telephoneNormalise: "+22676554433",
    }),
    /* Une fiche d'avant S44 dans le même fichier : les deux formes cohabitent
       sans migration, et la recherche doit les traiter pareil. */
    clientLegacy({
      id: "3",
      nom: "Sawadogo Issa",
      nomNormalise: "sawadogo issa",
      telephone: "78 00 11 22",
      telephoneNormalise: "+22678001122",
      telephone2: "65 99 88 77",
    }),
  ];

  it("rend tout le fichier quand rien n’est tapé", () => {
    expect(chercherClients(fichier, "  ")).toHaveLength(3);
  });

  it("trouve par le début du nom, sans casse ni accents", () => {
    expect(chercherClients(fichier, "oued").map((c) => c.id)).toEqual(["1"]);
    expect(chercherClients(fichier, "KABORÉ").map((c) => c.id)).toEqual(["2"]);
  });

  /* Séparer le nom du prénom ne doit pas faire disparaître le prénom de la
     recherche : au comptoir on tape aussi bien l'un que l'autre. */
  it("trouve par le prénom", () => {
    expect(chercherClients(fichier, "salif").map((c) => c.id)).toEqual(["1"]);
    expect(chercherClients(fichier, "Awa").map((c) => c.id)).toEqual(["2"]);
  });

  /* Le défaut que le prénom a révélé : « Awa » répondait « Sawadogo », parce
     qu'on cherchait n'importe quelle sous-chaîne. Un prénom est court, donc
     d'autant plus souvent contenu au milieu d'un autre nom. */
  it("ne répond pas sur le milieu d’un mot", () => {
    expect(chercherClients(fichier, "awa").map((c) => c.id)).toEqual(["2"]);
    expect(chercherClients(fichier, "bore")).toHaveLength(0);
  });

  it("trouve encore sur plusieurs mots consécutifs", () => {
    expect(chercherClients(fichier, "ouedraogo sal").map((c) => c.id)).toEqual(["1"]);
  });

  it("trouve par numéro, écrit comme on veut", () => {
    expect(chercherClients(fichier, "70 12 34 56").map((c) => c.id)).toEqual(["1"]);
    expect(chercherClients(fichier, "+22676554433").map((c) => c.id)).toEqual(["2"]);
  });

  it("trouve sur un fragment de numéro — on se souvient souvent de la fin", () => {
    expect(chercherClients(fichier, "4433").map((c) => c.id)).toEqual(["2"]);
  });

  it("cherche aussi dans le second numéro", () => {
    expect(chercherClients(fichier, "659988").map((c) => c.id)).toEqual(["3"]);
  });

  it("ne rend rien quand personne ne correspond", () => {
    expect(chercherClients(fichier, "Zongo")).toHaveLength(0);
    expect(chercherClients(fichier, "99 99 99 99")).toHaveLength(0);
  });
});

describe("telephoneDejaPris", () => {
  const fichier = [client({ id: "1", telephoneNormalise: "+22670123456" })];

  it("reconnaît le même numéro écrit autrement", () => {
    expect(telephoneDejaPris("+226 70 12 34 56", fichier)?.id).toBe("1");
    expect(telephoneDejaPris("70123456", fichier)?.id).toBe("1");
  });

  it("laisse passer un numéro neuf", () => {
    expect(telephoneDejaPris("76 00 00 00", fichier)).toBeUndefined();
  });

  it("ne se signale pas à soi-même lors d’une correction", () => {
    expect(telephoneDejaPris("70123456", fichier, "1")).toBeUndefined();
  });
});

describe("comparerClients", () => {
  it("range par nom, à la française", () => {
    const liste = [
      client({ id: "1", nom: "Zongo" }),
      client({ id: "2", nom: "Élodie" }),
      client({ id: "3", nom: "Kaboré" }),
    ].sort(comparerClients);
    expect(liste.map((c) => c.nom)).toEqual(["Élodie", "Kaboré", "Zongo"]);
  });
});
