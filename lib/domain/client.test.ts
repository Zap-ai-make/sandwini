import { describe, expect, it } from "vitest";
import {
  SAISIE_CLIENT_VIDE,
  chercherClients,
  comparerClients,
  formaterTelephone,
  normaliserNom,
  normaliserTelephone,
  telephoneDejaPris,
  validerClient,
  type Client,
  type SaisieClient,
} from "./client";

const saisie = (partie: Partial<SaisieClient> = {}): SaisieClient => ({
  ...SAISIE_CLIENT_VIDE,
  nom: "Ouédraogo Salif",
  telephone: "70 12 34 56",
  ...partie,
});

const client = (partie: Partial<Client> = {}): Client => ({
  id: "1",
  nom: "Ouédraogo Salif",
  telephone: "70 12 34 56",
  telephoneNormalise: "+22670123456",
  telephone2: "",
  adresse: "",
  note: "",
  nomNormalise: "ouedraogo salif",
  ...partie,
});

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
    expect(validerClient(saisie({ adresse: "a".repeat(201) }))).toMatch(/adresse/i);
    expect(validerClient(saisie({ note: "n".repeat(301) }))).toMatch(/note/i);
  });
});

describe("chercherClients", () => {
  const fichier = [
    client({ id: "1", nom: "Ouédraogo Salif", telephoneNormalise: "+22670123456" }),
    client({
      id: "2",
      nom: "Kaboré Awa",
      nomNormalise: "kabore awa",
      telephone: "76 55 44 33",
      telephoneNormalise: "+22676554433",
    }),
    client({
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
