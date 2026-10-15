import { describe, expect, it } from "vitest";
import {
  PLAGE_VIDE,
  bornesPeriode,
  dansLaPeriode,
  libellePeriode,
  plageInversee,
} from "./periode";

/** Un jeudi de septembre, loin des bords du mois : le repère de tous les cas. */
const MAINTENANT = new Date(2026, 8, 18, 14, 30);

describe("bornesPeriode", () => {
  it("« Tout » ne borne rien", () => {
    expect(bornesPeriode("tout", MAINTENANT)).toBeNull();
  });

  it("« Ce mois-ci » va du 1er du mois au 1er du suivant, fin exclue", () => {
    const bornes = bornesPeriode("ce-mois", MAINTENANT);
    expect(bornes).toEqual({ debut: new Date(2026, 8, 1), fin: new Date(2026, 9, 1) });
  });

  it("« Mois dernier » recule d’un mois", () => {
    const bornes = bornesPeriode("mois-dernier", MAINTENANT);
    expect(bornes).toEqual({ debut: new Date(2026, 7, 1), fin: new Date(2026, 8, 1) });
  });

  /* Le cas où un calcul de calendrier écrit à la main se trompe : en janvier,
     le mois dernier est dans l'année précédente. */
  it("« Mois dernier » un 5 janvier tombe sur décembre de l’année d’avant", () => {
    const bornes = bornesPeriode("mois-dernier", new Date(2026, 0, 5));
    expect(bornes).toEqual({ debut: new Date(2025, 11, 1), fin: new Date(2026, 0, 1) });
  });

  it("« Cette année » va du 1er janvier au 1er janvier suivant", () => {
    expect(bornesPeriode("cette-annee", MAINTENANT)).toEqual({
      debut: new Date(2026, 0, 1),
      fin: new Date(2027, 0, 1),
    });
  });

  describe("plage personnalisée", () => {
    it("inclut le dernier jour en entier", () => {
      const bornes = bornesPeriode("personnalise", MAINTENANT, {
        depuis: "2026-09-01",
        jusqua: "2026-09-30",
      });
      /* La borne haute est le 1er octobre : c'est ce qui fait entrer le
         30 septembre à 23 h 59. */
      expect(bornes).toEqual({ debut: new Date(2026, 8, 1), fin: new Date(2026, 9, 1) });
      expect(dansLaPeriode(new Date(2026, 8, 30, 23, 59, 59, 999), bornes)).toBe(true);
      expect(dansLaPeriode(new Date(2026, 9, 1, 0, 0, 0, 0), bornes)).toBe(false);
    });

    it("lit les dates en heure locale, pas en UTC", () => {
      const bornes = bornesPeriode("personnalise", MAINTENANT, {
        depuis: "2026-09-01",
        jusqua: "",
      });
      expect(bornes?.debut.getFullYear()).toBe(2026);
      expect(bornes?.debut.getMonth()).toBe(8);
      expect(bornes?.debut.getDate()).toBe(1);
      expect(bornes?.debut.getHours()).toBe(0);
    });

    it("ne borne que le côté rempli", () => {
      const depuisSeul = bornesPeriode("personnalise", MAINTENANT, {
        depuis: "2026-09-10",
        jusqua: "",
      });
      expect(dansLaPeriode(new Date(2026, 8, 9), depuisSeul)).toBe(false);
      expect(dansLaPeriode(new Date(2030, 0, 1), depuisSeul)).toBe(true);

      const jusquaSeul = bornesPeriode("personnalise", MAINTENANT, {
        depuis: "",
        jusqua: "2026-09-10",
      });
      expect(dansLaPeriode(new Date(2020, 0, 1), jusquaSeul)).toBe(true);
      expect(dansLaPeriode(new Date(2026, 8, 11), jusquaSeul)).toBe(false);
    });

    /* Le cas qui ferait croire à une panne : on saisit la première date, la
       liste se vide parce que la seconde est encore vide. */
    it("une plage vide ne borne rien", () => {
      expect(bornesPeriode("personnalise", MAINTENANT, PLAGE_VIDE)).toBeNull();
    });

    it("une saisie incomplète est ignorée, pas devinée", () => {
      expect(bornesPeriode("personnalise", MAINTENANT, { depuis: "2026-09", jusqua: "" })).toBeNull();
    });
  });
});

describe("dansLaPeriode", () => {
  const septembre = bornesPeriode("ce-mois", MAINTENANT);

  it("accepte une date dans les bornes et refuse celles du dehors", () => {
    expect(dansLaPeriode(new Date(2026, 8, 18), septembre)).toBe(true);
    expect(dansLaPeriode(new Date(2026, 7, 31, 23, 59), septembre)).toBe(false);
    expect(dansLaPeriode(new Date(2026, 9, 1), septembre)).toBe(false);
  });

  it("le premier instant de la période est dedans, le premier de la suivante est dehors", () => {
    expect(dansLaPeriode(new Date(2026, 8, 1, 0, 0, 0, 0), septembre)).toBe(true);
    expect(dansLaPeriode(new Date(2026, 9, 1, 0, 0, 0, 0), septembre)).toBe(false);
  });

  /* L'invariant hors-ligne (D66). Une vente saisie sans réseau n'a pas encore
     l'horodatage du serveur : elle doit rester visible dans le mois courant,
     sans quoi elle disparaît à l'instant où on vérifie qu'elle est passée. */
  it("une date absente passe toujours, quelle que soit la période", () => {
    expect(dansLaPeriode(null, septembre)).toBe(true);
    expect(dansLaPeriode(null, bornesPeriode("mois-dernier", MAINTENANT))).toBe(true);
    expect(dansLaPeriode(null, null)).toBe(true);
  });
});

describe("plageInversee", () => {
  it("repère une fin antérieure au début", () => {
    expect(plageInversee("personnalise", { depuis: "2026-09-30", jusqua: "2026-09-01" })).toBe(true);
  });

  it("ne dit rien d’une plage dans l’ordre, incomplète, ou d’une autre période", () => {
    expect(plageInversee("personnalise", { depuis: "2026-09-01", jusqua: "2026-09-30" })).toBe(false);
    expect(plageInversee("personnalise", { depuis: "2026-09-30", jusqua: "" })).toBe(false);
    expect(plageInversee("ce-mois", { depuis: "2026-09-30", jusqua: "2026-09-01" })).toBe(false);
  });

  it("deux dates égales ne sont pas inversées : c’est une journée", () => {
    expect(plageInversee("personnalise", { depuis: "2026-09-18", jusqua: "2026-09-18" })).toBe(false);
    const bornes = bornesPeriode("personnalise", MAINTENANT, {
      depuis: "2026-09-18",
      jusqua: "2026-09-18",
    });
    expect(dansLaPeriode(new Date(2026, 8, 18, 12), bornes)).toBe(true);
    expect(dansLaPeriode(new Date(2026, 8, 19, 12), bornes)).toBe(false);
  });
});

describe("libellePeriode", () => {
  it("ne nomme pas « Tout » : un chiffre sans mention porte sur l’ensemble", () => {
    expect(libellePeriode("tout", MAINTENANT)).toBeNull();
    expect(libellePeriode("personnalise", MAINTENANT, PLAGE_VIDE)).toBeNull();
  });

  it("nomme le mois, le mois d’avant et l’année", () => {
    expect(libellePeriode("ce-mois", MAINTENANT)).toBe("septembre 2026");
    expect(libellePeriode("mois-dernier", MAINTENANT)).toBe("août 2026");
    expect(libellePeriode("cette-annee", MAINTENANT)).toBe("2026");
  });

  it("nomme une plage, et se contente du côté rempli", () => {
    expect(
      libellePeriode("personnalise", MAINTENANT, { depuis: "2026-09-01", jusqua: "2026-09-30" }),
    ).toBe("Du 01/09/26 au 30/09/26");
    expect(libellePeriode("personnalise", MAINTENANT, { depuis: "2026-09-01", jusqua: "" })).toBe(
      "Depuis le 01/09/26",
    );
    expect(libellePeriode("personnalise", MAINTENANT, { depuis: "", jusqua: "2026-09-30" })).toBe(
      "Jusqu’au 30/09/26",
    );
  });
});

describe("aujourd’hui — le geste du comptoir dans un filtre devenu mensuel (S55)", () => {
  const unJour = new Date(2026, 9, 13, 15, 30);

  it("borne la journée de minuit à minuit, sur l’horloge de l’appareil", () => {
    const bornes = bornesPeriode("aujourd-hui", unJour);
    expect(bornes).toEqual({ debut: new Date(2026, 9, 13), fin: new Date(2026, 9, 14) });
  });

  /* La borne de fin est exclusive partout dans ce module : une écriture du 14 à
     minuit pile appartient au 14, pas au 13. */
  it("laisse le lendemain au lendemain", () => {
    const bornes = bornesPeriode("aujourd-hui", unJour);
    expect(dansLaPeriode(new Date(2026, 9, 13, 23, 59, 59, 999), bornes)).toBe(true);
    expect(dansLaPeriode(new Date(2026, 9, 14), bornes)).toBe(false);
    expect(dansLaPeriode(new Date(2026, 9, 12, 23, 59), bornes)).toBe(false);
  });

  it("se nomme par sa date", () => {
    expect(libellePeriode("aujourd-hui", unJour)).toBe("13/10/26");
  });
});
