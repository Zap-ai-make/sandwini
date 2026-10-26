"use client";

import { WifiOff } from "lucide-react";
import { useState } from "react";
import { BoutonScanPapier } from "@/components/BoutonScanPapier";
import { CHAMP_PAPIER, LIBELLE_PAPIER, PAPIERS_MOTO, type Moto, type PapierMoto } from "@/lib/domain/moto";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";
import { EtatErreur } from "@/components/patrons/Etats";

/**
 * La quittance et le CMC scannés, joints à la moto (S11, D66).
 *
 * **Le seul endroit du produit qui exige du réseau.** Firebase Storage n'a pas
 * de file d'attente hors ligne, contrairement à Firestore : un envoi sans
 * réseau échoue, il ne se met pas en attente. L'écran le dit **avant** le
 * geste plutôt que de laisser croire à une file qui n'existe pas — c'est la
 * condition à laquelle D66 a levé l'interdiction d'ajouter des champs d'envoi.
 *
 * Les deux autres conditions de D66 tiennent au fait que ce bloc vit **ici** et
 * non dans le formulaire d'entrée en stock : la moto s'enregistre sans son
 * scan, et le scan s'ajoute quand on veut. Une entrée faite au comptoir sans
 * réseau n'est donc jamais perdue, ni incomplète pour toujours.
 */
export function PapiersMoto({ moto }: { moto: Moto }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Documents scannés
      </h2>
      <ul className="mt-2 cadre cadre-liste">
        {PAPIERS_MOTO.map((papier) => (
          <li key={papier} className="px-4 py-3">
            <LignePapier moto={moto} papier={papier} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LignePapier({ moto, papier }: { moto: Moto; papier: PapierMoto }) {
  const { enLigne } = useEtatReseau();
  /* Le geste lui-même — envoyer, ouvrir — vit dans `BoutonScanPapier`, que
     l'inspection d'un lot partage. Ici restent le libellé, la phrase du
     hors-ligne et la place où le refus s'affiche. */
  const [erreur, setErreur] = useState<string | null>(null);

  const chemin = moto[CHAMP_PAPIER[papier]];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium text-encre">{LIBELLE_PAPIER[papier]}</span>

        <BoutonScanPapier moto={moto} papier={papier} onErreur={setErreur} />
      </div>

      {!chemin && !enLigne && (
        /* Dit avant le geste, pas après l'échec. C'est toute la différence entre
           une limite annoncée et une panne. */
        <p className="mt-2 flex items-center gap-2 text-sm text-encre-doux">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          L’envoi de fichier demande du réseau. Le reste de la fiche fonctionne sans.
        </p>
      )}

      <EtatErreur message={erreur} className="mt-2" />
    </>
  );
}
