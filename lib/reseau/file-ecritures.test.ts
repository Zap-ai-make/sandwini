import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ecouterFileEcritures,
  ecrituresEnAttente,
  reinitialiserFileEcritures,
  suivreEcriture,
} from "./file-ecritures";

afterEach(() => reinitialiserFileEcritures());

/** Une promesse qu’on résout ou rejette à la main, comme une écriture Firestore. */
function promesseManuelle<T = void>() {
  let resoudre!: (valeur: T) => void;
  let rejeter!: (raison: unknown) => void;
  const promesse = new Promise<T>((ok, ko) => {
    resoudre = ok;
    rejeter = ko;
  });
  return { promesse, resoudre, rejeter };
}

describe("file d’écritures", () => {
  it("part de zéro", () => {
    expect(ecrituresEnAttente()).toBe(0);
  });

  it("compte une écriture tant que le serveur n’a pas confirmé", async () => {
    const { promesse, resoudre } = promesseManuelle();
    const suivie = suivreEcriture(promesse);

    expect(ecrituresEnAttente()).toBe(1);

    resoudre();
    await suivie;
    expect(ecrituresEnAttente()).toBe(0);
  });

  it("cumule plusieurs écritures et les décompte dans le désordre", async () => {
    const a = promesseManuelle();
    const b = promesseManuelle();
    const c = promesseManuelle();
    const suivies = [a, b, c].map((p) => suivreEcriture(p.promesse));

    expect(ecrituresEnAttente()).toBe(3);

    b.resoudre();
    await suivies[1];
    expect(ecrituresEnAttente()).toBe(2);

    a.resoudre();
    c.resoudre();
    await Promise.all(suivies);
    expect(ecrituresEnAttente()).toBe(0);
  });

  it("décompte aussi une écriture refusée — sinon l’indicateur reste bloqué à vie", async () => {
    const { promesse, rejeter } = promesseManuelle();
    const suivie = suivreEcriture(promesse);
    expect(ecrituresEnAttente()).toBe(1);

    rejeter(new Error("permission refusée par les règles"));
    await expect(suivie).rejects.toThrow("permission refusée");
    expect(ecrituresEnAttente()).toBe(0);
  });

  it("rend la valeur d’origine sans la transformer", async () => {
    await expect(suivreEcriture(Promise.resolve("PTG-2608-0042"))).resolves.toBe("PTG-2608-0042");
  });

  it("prévient les abonnés à chaque variation, valeur courante comprise", async () => {
    const vues: number[] = [];
    const desabonner = ecouterFileEcritures((n) => vues.push(n));

    const { promesse, resoudre } = promesseManuelle();
    const suivie = suivreEcriture(promesse);
    resoudre();
    await suivie;

    expect(vues).toEqual([0, 1, 0]);
    desabonner();
  });

  it("cesse de prévenir après désabonnement", async () => {
    const ecouteur = vi.fn();
    const desabonner = ecouterFileEcritures(ecouteur);
    desabonner();

    const { promesse, resoudre } = promesseManuelle();
    const suivie = suivreEcriture(promesse);
    resoudre();
    await suivie;

    expect(ecouteur).toHaveBeenCalledTimes(1); // seulement l’appel initial
  });
});
