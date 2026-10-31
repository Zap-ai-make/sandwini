"use client";

import { ChevronDown, Download, FileSpreadsheet, Printer } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { nomDeBoutique } from "@/lib/domain/boutique";
import { motosEnClasseur, nomFichierExport } from "@/lib/domain/export";
import { TYPE_CLASSEUR } from "@/lib/domain/xlsx";
import { formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/**
 * Le bouton qui emporte les motos cochées (S50).
 *
 * **Un classeur Excel, et non plus du CSV (S54).** Le commanditaire ouvre ces
 * fichiers dans Excel : autant lui en donner un. Le format est monté à la main
 * dans `lib/domain/xlsx.ts`, sans dépendance.
 *
 * **Le fichier se fabrique sur l'appareil**, d'un bout à l'autre : `Blob` et
 * `URL.createObjectURL` vivent dans le navigateur, et rien ne part au serveur.
 * L'export marche donc au comptoir coupure faite, comme le reste (D66) — ce
 * qu'un export rendu par une Cloud Function n'aurait pas fait.
 *
 * **Aucun prix n'en sort**, et la raison est dans `lib/domain/export.ts` : ce
 * n'est pas une préférence de colonnes, c'est le mur D2 appliqué à un fichier
 * qui circule par définition.
 */
export function ExportMotos({
  motos,
  nomMarque,
  nomModele,
  toutCocher,
  toutDecocher,
  actions,
}: {
  /** Les motos cochées, dans l'ordre de l'écran. */
  motos: Moto[];
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
  toutCocher: () => void;
  toutDecocher: () => void;
  /**
   * Ce qu'on peut faire d'autre de la même sélection, posé après l'export.
   *
   * **Une seule barre pour une seule sélection.** Le déplacement groupé (26
   * octobre 2026) lit exactement les mêmes cases que l'export ; lui donner sa
   * propre barre aurait fait deux façons de choisir des lignes dans un écran
   * qui n'en demande qu'une. Le geste vient de l'appelant, parce que lui seul
   * connaît les boutiques et l'auteur.
   */
  actions?: ReactNode;
}) {
  const { boutiques } = usePerimetre();
  const [echec, setEchec] = useState<string | null>(null);
  /* Le menu des deux formats (27 octobre 2026) : « enlève Excel, et quand on
     clique dessus, deux options : PDF et Excel ». Le bouton ne promet plus un
     format dans son nom — il ouvre le choix. */
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;

    function auClic(evenement: MouseEvent) {
      if (!boite.current?.contains(evenement.target as Node)) setOuvert(false);
    }
    function auClavier(evenement: KeyboardEvent) {
      if (evenement.key === "Escape") setOuvert(false);
    }

    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert]);

  function exporter() {
    setEchec(null);
    try {
      /* Plus d'indicateur d'ordre des octets à poser : un classeur déclare son
         codage dans son XML, là où un CSV sans marque sortait « Côte d'Ivoire »
         en « CÃ´te d'Ivoire ». */
      const blob = new Blob([motosEnClasseur(motos, nomMarque, nomModele, (id) => nomDeBoutique(boutiques, id))], {
        type: TYPE_CLASSEUR,
      });
      const adresse = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = adresse;
      lien.download = nomFichierExport(new Date());
      lien.click();
      /* Révoquée tout de suite : l'adresse a déjà été lue par le clic, et la
         garder retiendrait le fichier entier en mémoire jusqu'au rechargement
         de la page. */
      URL.revokeObjectURL(adresse);
    } catch {
      setEchec("Le fichier n’a pas pu être créé. Réessayez.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Le compte est écrit, pas seulement montré par les cases : on décide
          d'exporter sur ce nombre-là, et le relire en comptant des cases
          cochées dans une liste de quarante n'est pas une vérification. */}
      <p aria-live="polite" aria-atomic="true" className="text-corps text-encre">
        <strong className="font-semibold">
          {motos.length === 0
            ? "Aucune moto cochée"
            : motos.length === 1
              ? "1 moto cochée"
              : `${formaterNombre(motos.length)} motos cochées`}
        </strong>
      </p>

      <button type="button" onClick={toutCocher} className="bouton bouton-discret">
        Tout cocher
      </button>
      {motos.length > 0 && (
        <button type="button" onClick={toutDecocher} className="bouton bouton-discret">
          Tout décocher
        </button>
      )}

      <div ref={boite} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={ouvert}
          onClick={() => setOuvert((avant) => !avant)}
          disabled={motos.length === 0}
          className="bouton bouton-principal"
        >
          <Download aria-hidden="true" className="size-4" />
          Exporter
          <ChevronDown aria-hidden="true" className="size-4" />
        </button>

        {ouvert && (
          <div
            role="menu"
            className="absolute left-0 z-20 mt-1 w-56 overflow-hidden rounded-carte border border-bord bg-papier shadow-panneau"
          >
            {/* **Le PDF passe par la boîte d'impression du navigateur** (D60) :
                c'est elle qui propose « Enregistrer au format PDF », sans
                réseau et sans un octet de bibliothèque. Elle emporte la liste
                telle qu'elle est filtrée à l'écran — et non les seules motos
                cochées, qu'aucune page imprimée ne saurait distinguer. */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOuvert(false);
                window.print();
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-encre hover:bg-survol"
            >
              <Printer aria-hidden="true" className="size-4 shrink-0" />
              PDF (la liste affichée)
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOuvert(false);
                exporter();
              }}
              className="flex w-full items-center gap-2 border-t border-bord px-3 py-2.5 text-left text-encre hover:bg-survol"
            >
              <FileSpreadsheet aria-hidden="true" className="size-4 shrink-0" />
              Excel ({formaterNombre(motos.length)} cochée
              {motos.length > 1 ? "s" : ""})
            </button>
          </div>
        )}
      </div>

      {actions}

      {echec && (
        <p role="alert" className="text-corps text-alerte">
          {echec}
        </p>
      )}
    </div>
  );
}
