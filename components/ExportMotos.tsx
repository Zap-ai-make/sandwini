"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { motosEnClasseur, nomFichierExport } from "@/lib/domain/export";
import { TYPE_CLASSEUR } from "@/lib/domain/xlsx";
import { formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";

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
}: {
  /** Les motos cochées, dans l'ordre de l'écran. */
  motos: Moto[];
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
  toutCocher: () => void;
  toutDecocher: () => void;
}) {
  const [echec, setEchec] = useState<string | null>(null);

  function exporter() {
    setEchec(null);
    try {
      /* Plus d'indicateur d'ordre des octets à poser : un classeur déclare son
         codage dans son XML, là où un CSV sans marque sortait « Côte d'Ivoire »
         en « CÃ´te d'Ivoire ». */
      const blob = new Blob([motosEnClasseur(motos, nomMarque, nomModele)], {
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

      <button
        type="button"
        onClick={exporter}
        disabled={motos.length === 0}
        className="bouton bouton-principal"
      >
        <Download aria-hidden="true" className="size-4" />
        Exporter (Excel)
      </button>

      {echec && (
        <p role="alert" className="text-corps text-alerte">
          {echec}
        </p>
      )}
    </div>
  );
}
