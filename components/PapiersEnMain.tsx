"use client";

import { useState } from "react";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { useSession } from "@/lib/auth/session";
import { LIBELLE_PAPIER, PAPIERS_MOTO, type Moto, type PapierMoto } from "@/lib/domain/moto";
import { marquerPapierRecu, messageErreurMoto } from "@/lib/repositories/motos";

/**
 * Les papiers que la moto porte, et sa plaque (S53).
 *
 * **La fiche ne disait pas si le CMC était au magasin**, alors que la donnée
 * existait depuis S43 : elle ne se voyait que dans l'inspection d'un lot.
 * Ouvrir une moto pour savoir où en sont ses papiers est pourtant le premier
 * réflexe, et la quittance ne se cochait, elle, nulle part.
 *
 * **À ne pas confondre avec `PapiersMoto`, juste en dessous.** Celui-là porte
 * les scans — des fichiers, qui exigent du réseau. Celui-ci porte un fait :
 * le papier est dans le tiroir, ou il ne l'est pas. On peut avoir reçu le CMC
 * sans l'avoir photographié, et inversement ; les deux blocs disent deux choses
 * et c'est pourquoi ils ne fusionnent pas.
 *
 * La case écrit aussitôt, coupure comprise : `marquerPapierRecu` fait une mise
 * à jour partielle que le cache local applique sur-le-champ, et qui part au
 * retour du réseau (D65, D76). Le coût n'est jamais touché — il vit dans une
 * sous-collection à part (D2).
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

        {/* La plaque n'apparaît qu'une fois connue. Une ligne « Plaque — » sur
            chaque moto neuve du parc ferait croire à un renseignement oublié,
            alors qu'elle n'arrive qu'au retour de la carte grise, des semaines
            après l'entrée en stock. Sa SAISIE est sur la fiche de vente, là où
            se trouve le gérant à ce moment-là. */}
        {moto.plaque !== null && (
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-encre-doux">Plaque</span>
            <span className="plaque-code text-encre">{moto.plaque}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
