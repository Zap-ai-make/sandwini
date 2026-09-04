"use client";

import { CloudUpload, ExternalLink, LoaderCircle, WifiOff } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/lib/auth/session";
import {
  CHAMP_PAPIER,
  LIBELLE_PAPIER,
  PAPIERS_MOTO,
  validerFichierPapier,
  type Moto,
  type PapierMoto,
} from "@/lib/domain/moto";
import { envoyerPapierMoto, lireUrlPapier } from "@/lib/repositories/motos";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";

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
      <ul className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
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
  const session = useSession();
  const { enLigne } = useEtatReseau();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const chemin = moto[CHAMP_PAPIER[papier]];

  async function envoyer(fichier: File) {
    if (session.statut !== "connecte") return;
    setErreur(null);
    const probleme = validerFichierPapier(fichier);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setEnvoi(true);
    try {
      await envoyerPapierMoto(moto.id, papier, fichier, {
        uid: session.utilisateur.uid,
        nom: session.utilisateur.nom,
      });
    } catch {
      /* Le message ne parle pas d'un « échec » sec : l'envoi peut être repris
         tel quel plus tard, et c'est la seule chose utile à savoir ici. */
      setErreur(
        "Le fichier n’est pas parti. Storage n’a pas de file d’attente : réessayez quand le réseau sera revenu, le reste de la fiche est déjà enregistré.",
      );
    } finally {
      setEnvoi(false);
    }
  }

  async function ouvrir() {
    if (!chemin) return;
    setErreur(null);
    try {
      const url = await lireUrlPapier(chemin);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setErreur("Le document ne s’ouvre qu’avec du réseau : son adresse se redemande à chaque fois.");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium text-encre">{LIBELLE_PAPIER[papier]}</span>

        {chemin ? (
          <button
            type="button"
            onClick={() => void ouvrir()}
            className="inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            Ouvrir le document
          </button>
        ) : (
          <label
            className={`inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre ${
              enLigne && !envoi ? "cursor-pointer hover:bg-fond" : "opacity-60"
            }`}
          >
            {envoi ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <CloudUpload aria-hidden="true" className="size-4" />
            )}
            {envoi ? "Envoi…" : "Envoyer le scan"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={!enLigne || envoi}
              className="sr-only"
              onChange={(evenement) => {
                const fichier = evenement.target.files?.[0];
                evenement.target.value = "";
                if (fichier) void envoyer(fichier);
              }}
            />
          </label>
        )}
      </div>

      {!chemin && !enLigne && (
        /* Dit avant le geste, pas après l'échec. C'est toute la différence entre
           une limite annoncée et une panne. */
        <p className="mt-2 flex items-center gap-2 text-sm text-encre-doux">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          L’envoi de fichier demande du réseau. Le reste de la fiche fonctionne sans.
        </p>
      )}

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
    </>
  );
}
