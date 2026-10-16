"use client";

import { useState } from "react";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { useSession } from "@/lib/auth/session";
import { LIBELLE_PAPIER, PAPIERS_MOTO, type Moto, type PapierMoto } from "@/lib/domain/moto";
import { marquerPapierRecu, messageErreurMoto } from "@/lib/repositories/motos";

/**
 * La quittance et le CMC d'une moto, **pour les motos sans lot seulement**
 * (S53, restreint le 16 octobre 2026).
 *
 * Ces deux papiers se cochent normalement sur le lot, à l'arrivée : c'est le
 * geste réel, dix motos d'un coup devant le camion, et le commanditaire a
 * demandé que ce soit le seul endroit. Ce bloc a donc quitté la fiche de la
 * moto.
 *
 * **Sauf qu'une moto peut n'avoir aucun lot** : celles entrées à l'unité par
 * « Faire entrer en stock » ont `arrivageId` nul et n'apparaissent dans aucune
 * inspection. Sans ce bloc, leurs papiers ne pourraient plus être cochés nulle
 * part — et, par ricochet, leur reçu ne pourrait jamais dire que le client les
 * a emportés, puisque la case de la vente ne s'ouvre que sur un papier en main.
 *
 * Il ne paraît donc que là où le lot ne peut pas faire le travail. C'est
 * `FicheMoto` qui tient cette condition : un bloc qui déciderait lui-même de ne
 * pas s'afficher serait invisible à la lecture de la fiche.
 *
 * La plaque a quitté ce bloc le même jour : elle se lit à côté du châssis, où
 * elle sert à identifier la moto, et non parmi des papiers à cocher.
 */
export function PapiersEnMain({ moto }: { moto: Moto }) {
  const session = useSession();
  const [erreur, setErreur] = useState<string | null>(null);

  const auteur =
    session.statut === "connecte"
      ? { uid: session.utilisateur.uid, nom: session.utilisateur.nom }
      : null;

  function basculer(papier: PapierMoto, recu: boolean) {
    if (!auteur) return;
    setErreur(null);
    const { enregistre } = marquerPapierRecu(moto.id, papier, recu, auteur);
    enregistre.catch((cause) => setErreur(messageErreurMoto(cause)));
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Papiers en main
      </h2>
      <EtatErreurSaisie message={erreur} />
      <ul className="mt-2 cadre cadre-liste">
        {PAPIERS_MOTO.map((papier) => {
          const enMain = papier === "quittance" ? moto.quittanceRecue : moto.cmcRecu;
          return (
            <li key={papier} className="flex items-center justify-between gap-3 px-4 py-3">
              <label className="inline-flex cursor-pointer items-center gap-2.5 text-encre">
                <input
                  type="checkbox"
                  checked={enMain}
                  disabled={auteur === null}
                  onChange={(evenement) => basculer(papier, evenement.target.checked)}
                  className="size-4 accent-[var(--color-solde)]"
                />
                {LIBELLE_PAPIER[papier]}
              </label>
              <span className={enMain ? "pastille pastille-solde" : "pastille pastille-retard"}>
                {enMain ? "Au magasin" : "Manquant"}
              </span>
            </li>
          );
        })}

      </ul>
    </section>
  );
}
