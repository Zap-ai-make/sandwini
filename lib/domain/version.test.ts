import { describe, expect, it } from "vitest";
import { faitsDeVersion, lireVersion, marqueAvecVersion } from "./version";

/* Chaque test nomme l'arbitrage qu'il tient, pas le code qu'il traverse : c'est
   ce qui fait échouer un changement d'avis avant qu'il aille mentir à l'écran. */

const valeurDe = (version: Parameters<typeof faitsDeVersion>[0], titre: string) =>
  faitsDeVersion(version).find((fait) => fait.titre === titre)?.valeur;

describe("le numéro de version", () => {
  it("lit l'entier posé à la compilation", () => {
    expect(lireVersion({ numero: "12" }).numero).toBe(12);
  });

  it("tolère les espaces d'un fichier VERSION terminé par un retour à la ligne", () => {
    expect(lireVersion({ numero: " 12\n" }).numero).toBe(12);
  });

  it("n'invente aucun numéro quand le build n'en porte pas — l'absence est une réponse", () => {
    /* Un appareil sans numéro est plus ancien que la version 1. Rendre 0 ferait
       de cette information exacte un chiffre faux. */
    expect(lireVersion({}).numero).toBeNull();
    expect(lireVersion({ numero: "" }).numero).toBeNull();
  });

  it("refuse une valeur abîmée plutôt que d'en extraire un début plausible", () => {
    /* `parseInt("12abc")` rendrait 12 et ferait passer une variable mal posée
       pour un numéro valide. */
    expect(lireVersion({ numero: "12abc" }).numero).toBeNull();
    expect(lireVersion({ numero: "v12" }).numero).toBeNull();
  });

  it("refuse un numéro non entier ou nul — on ne numérote pas une version 1.5", () => {
    expect(lireVersion({ numero: "1.5" }).numero).toBeNull();
    expect(lireVersion({ numero: "0" }).numero).toBeNull();
    expect(lireVersion({ numero: "-3" }).numero).toBeNull();
  });
});

describe("la date de compilation", () => {
  it("lit l'horodatage ISO posé par le build", () => {
    const version = lireVersion({ compileeLe: "2026-09-10T15:40:00.000Z" });
    expect(version.compileeLe?.toISOString()).toBe("2026-09-10T15:40:00.000Z");
  });

  it("rend null sur un horodatage illisible plutôt qu'une date invalide", () => {
    expect(lireVersion({ compileeLe: "hier" }).compileeLe).toBeNull();
    expect(lireVersion({}).compileeLe).toBeNull();
  });
});

describe("l'empreinte git", () => {
  it("raccourcit l'empreinte complète aux sept caractères de git", () => {
    expect(lireVersion({ empreinte: "48cab17f2e9d4a1b3c5e7f9a0b2d4c6e8f0a2b4d" }).empreinte).toBe(
      "48cab17",
    );
  });

  it("accepte une empreinte déjà courte", () => {
    expect(lireVersion({ empreinte: "48cab17" }).empreinte).toBe("48cab17");
  });

  it("normalise la casse — git rend parfois des majuscules", () => {
    expect(lireVersion({ empreinte: "48CAB17" }).empreinte).toBe("48cab17");
  });

  it("refuse ce qui n'est pas une empreinte, plutôt que d'en afficher les sept premiers signes", () => {
    /* Une variable d'environnement mal posée ressemble à tout sauf à une
       empreinte ; en tronquer la valeur ferait chercher un commit inexistant. */
    expect(lireVersion({ empreinte: "inconnue" }).empreinte).toBeNull();
    expect(lireVersion({ empreinte: "48cab1" }).empreinte).toBeNull();
    expect(lireVersion({}).empreinte).toBeNull();
  });
});

describe("le pied de la page de connexion", () => {
  it("dit « SDI · version 12 », comme la maquette a1:25", () => {
    expect(marqueAvecVersion(lireVersion({ numero: "12" }))).toBe("SDI · version 12");
  });

  it("dit « SDI » tout court sans numéro, et jamais « version — »", () => {
    /* Le premier écran du produit : y nommer une chose qui n'existe pas ferait
       passer un build sain pour un build cassé. */
    expect(marqueAvecVersion(lireVersion({}))).toBe("SDI");
  });
});

describe("les faits de la section « Cet appareil »", () => {
  const complete = lireVersion({
    numero: "12",
    compileeLe: "2026-09-10T15:40:00.000Z",
    empreinte: "48cab17f2e9d4a1b",
  });

  it("porte les trois faits, dans l'ordre où on les lit au téléphone", () => {
    expect(faitsDeVersion(complete).map((fait) => fait.titre)).toEqual([
      "Version",
      "Compilée le",
      "Empreinte",
    ]);
  });

  it("affiche le numéro et l'empreinte que le build a posés", () => {
    expect(valeurDe(complete, "Version")).toBe("12");
    expect(valeurDe(complete, "Empreinte")).toBe("48cab17");
  });

  it("garde les trois lignes quand une valeur manque, et écrit « — »", () => {
    /* Une ligne qui disparaît se remarque moins qu'une ligne vide — et c'est au
       dépannage qu'on veut la remarquer. */
    const vide = lireVersion({});
    expect(faitsDeVersion(vide)).toHaveLength(3);
    expect(valeurDe(vide, "Version")).toBe("—");
    expect(valeurDe(vide, "Compilée le")).toBe("—");
    expect(valeurDe(vide, "Empreinte")).toBe("—");
  });
});
