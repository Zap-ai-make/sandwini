"use client";

import { CloudUpload, ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/lib/auth/session";
import { CHAMP_PAPIER, LIBELLE_PAPIER, validerFichierPapier, type Moto, type PapierMoto } from "@/lib/domain/moto";
import { envoyerPapierMoto, lireUrlPapier } from "@/lib/repositories/motos";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";

/**
 * Le geste d'un scan : l'envoyer s'il manque, l'ouvrir s'il est là (S11, D66).
 *
 * **Extrait de la fiche de la moto pour que l'inspection d'un lot l'ait aussi**
 * (26 octobre 2026) : « ajoute un bouton upload à côté de quittance ». La
 * quittance se coche depuis le lot depuis S53 — c'est là qu'on a les papiers
 * en main en ouvrant les caisses — et il fallait rouvrir chaque fiche pour
 * joindre le scan. Recopier le geste aurait fait deux endroits où se souvenir
 * que Storage n'a pas de file d'attente ; un seul composant ne peut pas
 * diverger.
 *
 * **Le seul geste du produit qui exige du réseau.** Firebase Storage n'a pas de
 * file d'attente hors ligne, contrairement à Firestore : un envoi sans réseau
 * échoue, il ne se met pas en attente. Le bouton s'éteint donc **avant** le
 * geste, et dit pourquoi — c'est la condition à laquelle D66 a levé
 * l'interdiction des champs d'envoi.
 *
 * **Les refus partent à l'appelant.** Posé dans une cellule de tableau, ce
 * bouton n'a pas la place d'afficher une phrase ; posé dans une fiche, il en a.
 * C'est donc l'écran qui porte le message, là où il tient.
 */
export function BoutonScanPapier({
  moto,
  papier,
  compact = false,
  onErreur,
}: {
  moto: Moto;
  papier: PapierMoto;
  /** Dans un tableau : l'icône seule, le libellé passant par `aria-label`. */
  compact?: boolean;
  onErreur: (message: string | null) => void;
}) {
  const session = useSession();
  const { enLigne } = useEtatReseau();
  const [envoi, setEnvoi] = useState(false);

  const chemin = moto[CHAMP_PAPIER[papier]];
  const nom = LIBELLE_PAPIER[papier];

  async function envoyer(fichier: File) {
    if (session.statut !== "connecte") return;
    onErreur(null);
    const probleme = validerFichierPapier(fichier);
    if (probleme) {
      onErreur(probleme);
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
      onErreur(
        "Le fichier n’est pas parti. Storage n’a pas de file d’attente : réessayez quand le réseau sera revenu, le reste est déjà enregistré.",
      );
    } finally {
      setEnvoi(false);
    }
  }

  async function ouvrir() {
    if (!chemin) return;
    onErreur(null);
    try {
      const url = await lireUrlPapier(chemin);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      onErreur(
        "Le document ne s’ouvre qu’avec du réseau : son adresse se redemande à chaque fois.",
      );
    }
  }

  const habit = compact
    ? "inline-flex h-11 items-center justify-center gap-2 rounded-plaque border border-bord px-2 text-sm font-medium text-encre"
    : "inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre";

  if (chemin) {
    return (
      <button
        type="button"
        onClick={() => void ouvrir()}
        className={`${habit} hover:bg-fond`}
        aria-label={compact ? `Ouvrir le scan de la ${nom.toLowerCase()}` : undefined}
        title={compact ? `Ouvrir le scan de la ${nom.toLowerCase()}` : undefined}
      >
        <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
        {!compact && "Ouvrir le document"}
      </button>
    );
  }

  const indisponible = !enLigne || envoi;
  const pourquoi = enLigne
    ? `Envoyer le scan de la ${nom.toLowerCase()}`
    : "L’envoi de fichier demande du réseau.";

  return (
    <label
      className={`${habit} ${indisponible ? "opacity-60" : "cursor-pointer hover:bg-fond"}`}
      title={compact ? pourquoi : undefined}
    >
      {envoi ? (
        <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
      ) : (
        <CloudUpload aria-hidden="true" className="size-4 shrink-0" />
      )}
      {!compact && (envoi ? "Envoi…" : "Envoyer le scan")}
      {compact && <span className="sr-only">{pourquoi}</span>}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        disabled={indisponible}
        className="sr-only"
        onChange={(evenement) => {
          const fichier = evenement.target.files?.[0];
          /* Le champ se vide avant l'envoi : sans cela, rechoisir le même
             fichier après un refus ne déclenche aucun changement. */
          evenement.target.value = "";
          if (fichier) void envoyer(fichier);
        }}
      />
    </label>
  );
}
