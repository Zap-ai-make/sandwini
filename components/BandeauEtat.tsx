"use client";

import { Check, CloudOff, RefreshCw } from "lucide-react";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";

/**
 * Le bandeau d’état — la signature visuelle de l’application (DESIGN.md §2).
 *
 * Dessiné comme une plaque d’immatriculation, parce que c’est l’objet que ce
 * logiciel passe sa vie à suivre. Au repos il s’efface ; hors ligne il devient
 * la plaque jaune pleine et occupe le regard.
 *
 * Il répond en permanence aux deux questions qui coûtent cher quand on se
 * trompe : **où j’écris** et **est-ce que c’est parti**. Dans une application
 * multi-boutique qui fonctionne sans réseau, ce sont les deux seules erreurs
 * qui détruisent des données plutôt que d’agacer l’utilisateur.
 */

function libelleAttente(nombre: number): string {
  if (nombre <= 0) return "";
  return nombre === 1 ? "1 saisie en attente" : `${nombre} saisies en attente`;
}

export function BandeauEtat({ code = "SDI", contexte }: { code?: string; contexte?: string }) {
  const { etat, enAttente } = useEtatReseau();

  const horsLigne = etat === "hors_ligne";

  const message =
    etat === "hors_ligne"
      ? ["Hors ligne", libelleAttente(enAttente)].filter(Boolean).join(" · ")
      : etat === "envoi"
        ? `Envoi ${enAttente === 1 ? "d’une saisie" : enAttente > 1 ? `de ${enAttente} saisies` : "en cours"}…`
        : "À jour";

  const Icone = etat === "hors_ligne" ? CloudOff : etat === "envoi" ? RefreshCw : Check;

  return (
    <header
      className={[
        "sticky top-0 z-40 flex items-center gap-3 border-b px-3 py-2",
        horsLigne ? "border-plaque-bord bg-plaque" : "border-bord bg-papier",
      ].join(" ")}
    >
      {/* Le bloc-plaque. Hors ligne, le bandeau passe au jaune : la plaque
          s’inverse en négatif pour rester lisible et pour que le basculement
          se voie du coin de l’œil, sans lire. */}
      <span
        className={[
          "plaque-code rounded-plaque border px-2 py-1 text-sm leading-none",
          horsLigne
            ? "border-encre-fixe bg-encre-fixe text-plaque"
            : "border-plaque-bord bg-plaque text-encre-fixe",
        ].join(" ")}
      >
        {code}
      </span>

      {contexte ? (
        <span
          className={[
            "min-w-0 flex-1 truncate text-sm font-medium",
            horsLigne ? "text-encre-fixe" : "text-encre",
          ].join(" ")}
        >
          {contexte}
        </span>
      ) : (
        <span className="flex-1" />
      )}

      {/* aria-live : le passage hors ligne doit être annoncé, pas seulement
          coloré. Et le texte porte toute l’information — jamais la couleur
          seule (DESIGN.md §5). */}
      <span
        role="status"
        aria-live="polite"
        className={[
          "flex shrink-0 items-center gap-1.5 text-sm",
          // Sur la plaque jaune, l’encre est fixe : elle ne suit pas le thème.
          horsLigne
            ? "font-semibold text-encre-fixe"
            : etat === "envoi"
              ? "text-encre"
              : "text-encre-doux",
        ].join(" ")}
      >
        <Icone
          aria-hidden="true"
          className={["size-4 shrink-0", etat === "envoi" ? "animate-spin" : ""].join(" ")}
        />
        {message}
      </span>
    </header>
  );
}
