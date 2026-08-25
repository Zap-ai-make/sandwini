"use client";

import { waitForPendingWrites } from "firebase/firestore";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { configurationPresente, db } from "@/lib/firebase/client";
import { ecouterFileEcritures, ecrituresEnAttente } from "./file-ecritures";

export type EtatSynchronisation = "a_jour" | "envoi" | "hors_ligne";

export type EtatReseau = {
  enLigne: boolean;
  enAttente: number;
  etat: EtatSynchronisation;
};

/* Deux systèmes extérieurs à React : les événements réseau du navigateur et le
   compteur d’écritures. `useSyncExternalStore` est fait pour ça — s’y abonner
   depuis un effet en recopiant la valeur dans un état déclenche des rendus en
   cascade et se désynchronise à l’hydratation. */

function souscrireReseau(rappel: () => void): () => void {
  window.addEventListener("online", rappel);
  window.addEventListener("offline", rappel);
  return () => {
    window.removeEventListener("online", rappel);
    window.removeEventListener("offline", rappel);
  };
}

const lireEnLigne = () => navigator.onLine;

/* Au rendu serveur, `navigator` n’existe pas. On répond « en ligne » : afficher
   un bandeau d’alerte une fraction de seconde à chaque chargement apprendrait
   au gérant à ne plus le regarder. */
const lireEnLigneAuServeur = () => true;

const souscrireFileEcritures = (rappel: () => void) => ecouterFileEcritures(() => rappel());
const lireFileAuServeur = () => 0;

const Contexte = createContext<EtatReseau>({ enLigne: true, enAttente: 0, etat: "a_jour" });

export function FournisseurEtatReseau({ children }: { children: ReactNode }) {
  const enLigne = useSyncExternalStore(souscrireReseau, lireEnLigne, lireEnLigneAuServeur);
  const enAttente = useSyncExternalStore(
    souscrireFileEcritures,
    ecrituresEnAttente,
    lireFileAuServeur,
  );

  /* Les écritures laissées par une session précédente échappent au compteur
     (cf. file-ecritures.ts). `waitForPendingWrites` les couvre : tant qu’il ne
     s’est pas résolu une première fois, il reste peut-être quelque chose à
     envoyer, et on le dit plutôt que d’afficher « à jour » à tort. */
  const [heritageSynchronise, setHeritageSynchronise] = useState(!configurationPresente);

  useEffect(() => {
    if (!configurationPresente) return;
    let vivant = true;
    waitForPendingWrites(db())
      .catch(() => undefined)
      .finally(() => {
        if (vivant) setHeritageSynchronise(true);
      });
    return () => {
      vivant = false;
    };
  }, []);

  const valeur = useMemo<EtatReseau>(() => {
    const resteAEnvoyer = enAttente > 0 || !heritageSynchronise;
    const etat: EtatSynchronisation = !enLigne ? "hors_ligne" : resteAEnvoyer ? "envoi" : "a_jour";
    return { enLigne, enAttente, etat };
  }, [enLigne, enAttente, heritageSynchronise]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useEtatReseau(): EtatReseau {
  return useContext(Contexte);
}
