"use client";

import { Ban, Pencil, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { BoutonScanPapier } from "@/components/BoutonScanPapier";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { completudePapiers, ecoulement, type Arrivage } from "@/lib/domain/arrivage";
import { formaterNombre } from "@/lib/domain/format";
import { LIBELLE_PAPIER, LIBELLE_STATUT, type PapierMoto, type Moto } from "@/lib/domain/moto";
import { marquerPapierRecu, messageErreurMoto } from "@/lib/repositories/motos";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Inspecter un lot (S43) — l'entête, ses compteurs, et la table de ses motos.
 *
 * Un modal large plutôt que le panneau latéral étroit : ce qu'on montre ici est
 * un tableau (cadre, marque, statut, papiers), pas huit faits. Les cases
 * écrivent aussitôt (cache local), sans toucher au coût (D2). Les actions du lot —
 * corriger, annuler, effacer — vivent au pied, pas dans un menu par ligne.
 *
 * Monté seulement à l'ouverture. Le calque, le focus, Échap et le verrou de
 * défilement viennent de `Modale` depuis S44 — ils étaient recopiés ici, et
 * **Échap ne marchait pas** : la touche était écoutée sur une boîte que rien ne
 * focalisait à l'ouverture, donc l'événement ne lui parvenait jamais.
 */
export function InspecterLotModal({
  arrivage,
  motosDuLot,
  nomMarque,
  nomModele,
  auteur,
  onFermer,
  onModifier,
  onExporterPdf,
  onAnnuler,
  onRetablir,
  onSupprimer,
}: {
  arrivage: Arrivage;
  motosDuLot: Moto[];
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
  auteur: Auteur | null;
  onFermer: () => void;
  onModifier: () => void;
  onExporterPdf: () => void;
  onAnnuler: () => void;
  onRetablir: () => void;
  onSupprimer: () => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const compte = ecoulement(motosDuLot, arrivage.id);
  const papiers = completudePapiers(motosDuLot, arrivage.id);
  const vide = motosDuLot.length === 0;

  /**
   * **La quittance a quitté l'arrivage** (27 octobre 2026) : « supprime la
   * partie quittance dans arrivage ».
   *
   * Elle y avait été mise en S53 parce qu'elle arrive avec la moto, comme le
   * CMC. À l'usage, ce n'est pas là qu'on la traite : un lot s'ouvre pour
   * compter des motos et pointer les CMC, et deux colonnes de cases doublaient
   * le geste pour un papier qu'on suit ailleurs. La fiche de la moto garde la
   * sienne — le champ n'est pas touché, et rien de ce qui a été coché n'est
   * perdu.
   */
  const PAPIERS_DU_LOT: PapierMoto[] = ["cmc"];

  function basculerPapier(moto: Moto, papier: PapierMoto, recu: boolean) {
    if (!auteur) return;
    setErreur(null);
    const { enregistre } = marquerPapierRecu(moto.id, papier, recu, auteur);
    enregistre.catch((cause) => setErreur(messageErreurMoto(cause)));
  }

  const estEnMain = (moto: Moto, papier: PapierMoto) =>
    papier === "quittance" ? moto.quittanceRecue : moto.cmcRecu;

  const stats: { nom: string; valeur: number; couleur?: string }[] = [
    { nom: "Motos du lot", valeur: compte.total },
    { nom: "En stock", valeur: compte.restant },
    { nom: "Vendues", valeur: compte.vendues, couleur: "var(--color-solde)" },
    { nom: "CMC manquants", valeur: papiers.cmcManquants, couleur: "var(--color-alerte)" },
  ];

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre={arrivage.nom}
      taille="large"
      pied={
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onModifier} className="bouton bouton-discret">
              <Pencil aria-hidden="true" className="size-4" />
              Modifier
            </button>
            <button type="button" onClick={onExporterPdf} className="bouton bouton-discret">
              <Printer aria-hidden="true" className="size-4" />
              Exporter en PDF
            </button>
            {vide ? (
              <button
                type="button"
                onClick={onSupprimer}
                className="bouton bouton-discret text-alerte"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Supprimer
              </button>
            ) : arrivage.annule ? (
              <button type="button" onClick={onRetablir} className="bouton bouton-discret">
                <RotateCcw aria-hidden="true" className="size-4" />
                Rétablir
              </button>
            ) : (
              <button
                type="button"
                onClick={onAnnuler}
                className="bouton bouton-discret text-alerte"
              >
                <Ban aria-hidden="true" className="size-4" />
                Annuler le lot
              </button>
            )}
          </div>
          <button type="button" onClick={onFermer} className="ml-auto bouton bouton-principal">
            Fermer
          </button>
        </>
      }
    >
      <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.nom} className="cadre p-3">
                <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
                  {stat.nom}
                </p>
                <p
                  className="mt-0.5 font-code text-bloc tabular-nums"
                  style={{ color: stat.couleur ?? "var(--color-encre)" }}
                >
                  {formaterNombre(stat.valeur)}
                </p>
              </div>
            ))}
          </div>

          {arrivage.description && (
            <p
              className="cadre p-3 text-corps text-encre-doux"
              style={{ borderLeftWidth: "4px", borderLeftColor: "var(--color-goutte)" }}
            >
              {arrivage.description}
            </p>
          )}

          <EtatErreurSaisie message={erreur} />

          {vide ? (
            <p className="cadre p-6 text-center text-encre-doux">
              Ce lot ne porte aucune moto. Vous pouvez le supprimer.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-encre-doux">
                    <th className="p-2 font-medium">N° de cadre</th>
                    <th className="p-2 font-medium">Marque</th>
                    <th className="p-2 font-medium">Statut</th>
                    {PAPIERS_DU_LOT.map((papier) => (
                      <th key={papier} className="p-2 font-medium">
                        {LIBELLE_PAPIER[papier]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {motosDuLot.map((moto) => (
                    <tr key={moto.id} className="border-t border-bord">
                      <td className="p-2">
                        <span className="font-code break-all text-encre">{moto.numeroChassis}</span>
                      </td>
                      <td className="p-2 text-encre">
                        {nomMarque(moto.marqueId)}
                        {nomModele(moto.modeleId) ? ` ${nomModele(moto.modeleId)}` : ""}
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            moto.statut === "vendue" ? "pastille pastille-solde" : "pastille"
                          }
                        >
                          {LIBELLE_STATUT[moto.statut]}
                        </span>
                      </td>
                      {PAPIERS_DU_LOT.map((papier) => {
                        const enMain = estEnMain(moto, papier);
                        const nom = LIBELLE_PAPIER[papier];
                        return (
                          <td key={papier} className="p-2">
                            {/* **Deux choses distinctes, côte à côte.** La case
                                dit que le papier est dans le tiroir ; le bouton
                                joint sa photo. On peut avoir reçu la quittance
                                sans l'avoir scannée, et l'inverse — c'est écrit
                                sur `cmcRecu` dans le domaine, et l'écran doit
                                le laisser voir. Le bouton d'envoi était jusqu'ici
                                sur la fiche de la moto seulement, et il fallait
                                en rouvrir trente : « ajoute un bouton upload à
                                côté de quittance » (26 octobre 2026). */}
                            <div className="flex items-center gap-2">
                              <label className="inline-flex cursor-pointer items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={enMain}
                                  disabled={!auteur}
                                  onChange={(evenement) =>
                                    basculerPapier(moto, papier, evenement.target.checked)
                                  }
                                  className="size-4 accent-[var(--color-solde)]"
                                  aria-label={`${nom} reçu, moto ${moto.numeroChassis}`}
                                />
                                <span
                                  className={
                                    enMain ? "pastille pastille-solde" : "pastille pastille-retard"
                                  }
                                >
                                  {enMain ? `${nom} reçu` : `${nom} manquant`}
                                </span>
                              </label>

                              <BoutonScanPapier
                                moto={moto}
                                papier={papier}
                                compact
                                onErreur={setErreur}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </Modale>
  );
}
