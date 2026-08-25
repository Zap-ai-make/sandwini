import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELAI_CONFIRMATION_MS,
  coupureConfirmee,
  ecouterSourceDonnees,
  reinitialiserSourceDonnees,
  signalerSourceDonnees,
} from "./source-donnees";

/**
 * Ce que ces tests protègent : que le bandeau ne crie pas « hors ligne » à
 * chaque démarrage, et qu’il le dise quand même quand le réseau ment.
 */

beforeEach(() => {
  vi.useFakeTimers();
  reinitialiserSourceDonnees();
});

afterEach(() => {
  reinitialiserSourceDonnees();
  vi.useRealTimers();
});

describe("confirmation de la coupure", () => {
  it("ne conclut à rien avant le délai — un démarrage lit le cache lui aussi", () => {
    signalerSourceDonnees(true);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS - 1);
    expect(coupureConfirmee()).toBe(false);
  });

  it("conclut à la coupure quand le cache dure", () => {
    signalerSourceDonnees(true);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS);
    expect(coupureConfirmee()).toBe(true);
  });

  it("un instantané venu du serveur annule le soupçon", () => {
    signalerSourceDonnees(true);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS - 100);
    signalerSourceDonnees(false);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS);
    expect(coupureConfirmee()).toBe(false);
  });

  it("le retour du serveur lève une coupure déjà confirmée", () => {
    signalerSourceDonnees(true);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS);
    signalerSourceDonnees(false);
    expect(coupureConfirmee()).toBe(false);
  });

  it("des instantanés de cache répétés ne repoussent pas l’échéance", () => {
    signalerSourceDonnees(true);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS - 500);
    signalerSourceDonnees(true);
    signalerSourceDonnees(true);
    vi.advanceTimersByTime(500);
    expect(coupureConfirmee()).toBe(true);
  });
});

describe("abonnement", () => {
  it("prévient les écouteurs à chaque bascule, et une seule fois", () => {
    const ecouteur = vi.fn();
    ecouterSourceDonnees(ecouteur);

    signalerSourceDonnees(true);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS);
    expect(ecouteur).toHaveBeenCalledTimes(1);

    signalerSourceDonnees(true);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS);
    expect(ecouteur).toHaveBeenCalledTimes(1);

    signalerSourceDonnees(false);
    expect(ecouteur).toHaveBeenCalledTimes(2);
  });

  it("un écouteur désabonné n’est plus appelé", () => {
    const ecouteur = vi.fn();
    ecouterSourceDonnees(ecouteur)();
    signalerSourceDonnees(true);
    vi.advanceTimersByTime(DELAI_CONFIRMATION_MS);
    expect(ecouteur).not.toHaveBeenCalled();
  });
});
