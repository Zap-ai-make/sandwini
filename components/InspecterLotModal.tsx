"use client";

import { Ban, Pencil, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import {
  completudeCmc,
  ecoulement,
  type Arrivage,
} from "@/lib/domain/arrivage";
import { formaterDate, formaterNombre } from "@/lib/domain/format";
import { LIBELLE_STATUT, type Moto } from "@/lib/domain/moto";
import { marquerPapierRecu, messageErreurMoto } from "@/lib/repositories/motos";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Inspecter un lot (S43) — l'entête, ses compteurs, et la table de ses motos.
 *
 * Un modal large plutôt que le panneau latéral étroit : ce qu'on montre ici est
 * un tableau (cadre, marque, statut, CMC), pas huit faits. La case « CMC reçu »
 * écrit aussitôt (cache local), sans toucher au coût (D2). Les actions du lot —
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
  nomFournisseur,
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
  nomFournisseur: string;
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
  const cmc = completudeCmc(motosDuLot, arrivage.id);
  const vide = motosDuLot.length === 0;

  function basculerCmc(moto: Moto, recu: boolean) {
    if (!auteur) return;
    setErreur(null);
    const { enregistre } = marquerPapierRecu(moto.id, "cmc", recu, auteur);
    enregistre.catch((cause) => setErreur(messageErreurMoto(cause)));
  }

  const stats: { nom: string; valeur: number; couleur?: string }[] = [
    { nom: "Motos du lot", valeur: compte.total },
    { nom: "En stock", valeur: compte.restant },
    { nom: "Vendues", valeur: compte.vendues, couleur: "var(--color-solde)" },
    { nom: "CMC manquants", valeur: cmc.manquants, couleur: "var(--color-alerte)" },
  ];

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre={arrivage.nom}
      description={
        <>
          Expéditeur : {nomFournisseur}
          {arrivage.date ? ` — Arrivée ${formaterDate(arrivage.date)}` : ""}
          {arrivage.annule && (
            <span className="pastille pastille-retard ml-2">Annulé</span>
          )}
        </>
      }
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
                    <th className="p-2 font-medium">CMC</th>
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
                      <td className="p-2">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={moto.cmcRecu}
                            disabled={!auteur}
                            onChange={(evenement) => basculerCmc(moto, evenement.target.checked)}
                            className="size-4 accent-[var(--color-solde)]"
                            aria-label={`CMC reçu, moto ${moto.numeroChassis}`}
                          />
                          <span
                            className={
                              moto.cmcRecu ? "pastille pastille-solde" : "pastille pastille-retard"
                            }
                          >
                            {moto.cmcRecu ? "CMC reçu" : "CMC manquant"}
                          </span>
                        </label>
                      </td>
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
