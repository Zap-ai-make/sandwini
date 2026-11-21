"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { normaliserNom } from "@/lib/domain/client";
import {
  chercherDossiersAEnvoyer,
  type DossierCarteGrise,
} from "@/lib/domain/dossier-carte-grise";
import {
  envoyerAuxCartesGrises,
  messageErreurDossierCarteGrise,
} from "@/lib/repositories/dossiers-carte-grise";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Faire entrer à la main une moto vendue dans les cartes grises (20 novembre
 * 2026).
 *
 * « Une vente ne doit pas envoyer directement le dossier dans cartes grises,
 * ça doit être manuel. » La vente écrit son dossier « à envoyer » ; on le
 * retrouve ici par un bout de châssis ou par le nom du client, on coche, et il
 * entre dans la liste « à faire ».
 *
 * **Les motos cochées restent sous les yeux** quand on change de recherche :
 * trois motos d'une même vente se cherchent une par une, et la deuxième
 * recherche ne doit pas faire oublier la première.
 *
 * L'écriture ne s'attend pas (D76) : la fenêtre se ferme, et un refus tardif
 * remonte à l'écran, qui reste là pour l'afficher.
 */
export function AjouterMotoVendueModal({
  dossiers,
  auteur,
  onFermer,
  onEchec,
}: {
  /** Tous les dossiers lus par l'écran : seuls ceux « à envoyer » sont proposés. */
  dossiers: readonly DossierCarteGrise[];
  auteur: Auteur;
  onFermer: () => void;
  onEchec: (message: string) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const coches = dossiers.filter(
      (dossier) => choisis.has(dossier.id) && dossier.statut === "a_envoyer",
    );
    const trouves = chercherDossiersAEnvoyer(dossiers, recherche, normaliserNom).filter(
      (dossier) => !choisis.has(dossier.id),
    );
    return [...coches, ...trouves];
  }, [dossiers, choisis, recherche]);

  function basculer(id: string) {
    setErreur(null);
    setChoisis((actuels) => {
      const suivants = new Set(actuels);
      if (suivants.has(id)) suivants.delete(id);
      else suivants.add(id);
      return suivants;
    });
  }

  function ajouter() {
    const aEnvoyer = dossiers.filter(
      (dossier) => choisis.has(dossier.id) && dossier.statut === "a_envoyer",
    );
    if (aEnvoyer.length === 0) {
      setErreur("Cochez au moins une moto.");
      return;
    }
    envoyerAuxCartesGrises(aEnvoyer, auteur).catch((cause: unknown) =>
      onEchec(messageErreurDossierCarteGrise(cause)),
    );
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Ajouter une moto vendue"
      pied={
        <>
          {erreur && <EtatErreurSaisie message={erreur} className="basis-full" />}
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={onFermer} className="bouton bouton-discret">
              Annuler
            </button>
            <button type="button" onClick={ajouter} className="bouton bouton-principal">
              Ajouter aux cartes grises
            </button>
          </div>
        </>
      }
    >
      <label htmlFor="moto-vendue-recherche" className="block text-sm font-medium text-encre">
        Châssis ou client
      </label>
      <div className="relative mt-1.5">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
        />
        <input
          id="moto-vendue-recherche"
          type="search"
          inputMode="search"
          autoComplete="off"
          value={recherche}
          onChange={(evenement) => setRecherche(evenement.target.value)}
          className="saisie pr-3 pl-9"
        />
      </div>

      {visibles.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {visibles.map((dossier) => {
            const coche = choisis.has(dossier.id);
            return (
              <li key={dossier.id}>
                <label
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-champ border px-4 py-3",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-encre",
                    coche
                      ? "border-2 border-encre bg-papier px-[15px] py-[11px]"
                      : "border-bord bg-papier hover:bg-survol",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={coche}
                    onChange={() => basculer(dossier.id)}
                    className="size-[18px] shrink-0 accent-encre"
                  />
                  <span className="min-w-0">
                    <span className="block font-code text-legende break-all text-encre">
                      {dossier.numeroChassis}
                    </span>
                    <span className="block text-corps text-encre">{dossier.clientNom}</span>
                    {dossier.motoLibelle && (
                      <span className="block text-corps text-encre-doux">
                        {dossier.motoLibelle}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modale>
  );
}
