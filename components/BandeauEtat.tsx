"use client";

import { Check, ChevronDown, CloudOff, RefreshCw } from "lucide-react";
import { useId } from "react";
import { usePerimetre } from "@/lib/perimetre/perimetre";
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
 *
 * Pour le responsable, la plaque n’est pas qu’un affichage : c’est le sélecteur
 * de périmètre lui-même. Le choix se fait donc là où la réponse se lit, et non
 * dans un menu qu’il faudrait aller rouvrir pour vérifier.
 */

function libelleAttente(nombre: number): string {
  if (nombre <= 0) return "";
  return nombre === 1 ? "1 saisie en attente" : `${nombre} saisies en attente`;
}

export function BandeauEtat() {
  const { etat, enAttente } = useEtatReseau();
  const { perimetre, boutiques, peutChoisir, choisir } = usePerimetre();
  const idNom = useId();

  const horsLigne = etat === "hors_ligne";

  const message =
    etat === "hors_ligne"
      ? ["Hors ligne", libelleAttente(enAttente)].filter(Boolean).join(" · ")
      : etat === "envoi"
        ? `Envoi ${enAttente === 1 ? "d’une saisie" : enAttente > 1 ? `de ${enAttente} saisies` : "en cours"}…`
        : "À jour";

  const Icone = etat === "hors_ligne" ? CloudOff : etat === "envoi" ? RefreshCw : Check;

  /* Hors ligne, le bandeau passe au jaune : la plaque s’inverse en négatif pour
     rester lisible et pour que le basculement se voie du coin de l’œil, sans
     lire. Les deux variantes servent aussi bien au texte fixe qu’au sélecteur. */
  const plaque = horsLigne
    ? "border-encre-fixe bg-encre-fixe text-plaque"
    : "border-plaque-bord bg-plaque text-encre-fixe";

  return (
    <header
      className={[
        "sticky top-0 z-40 flex items-center gap-3 border-b px-3 py-2",
        horsLigne ? "border-plaque-bord bg-plaque" : "border-bord bg-papier",
      ].join(" ")}
    >
      {peutChoisir ? (
        <span className="relative shrink-0">
          {/* Le nom complet de la boutique est juste à côté ; il sert ici de
              description au sélecteur, pour qu’un lecteur d’écran annonce
              « Pouytenga » et pas seulement « PTG ». */}
          <select
            aria-label="Boutique affichée"
            aria-describedby={idNom}
            value={perimetre.boutiqueId ?? ""}
            onChange={(evenement) => choisir(evenement.target.value || null)}
            className={[
              "plaque-code h-8 cursor-pointer appearance-none rounded-plaque border py-1 pr-7 pl-2 text-sm leading-none",
              plaque,
            ].join(" ")}
          >
            <option value="">SDI</option>
            {boutiques
              .filter((boutique) => boutique.actif)
              .map((boutique) => (
                <option key={boutique.id} value={boutique.id}>
                  {boutique.code}
                </option>
              ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className={[
              "pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2",
              horsLigne ? "text-plaque" : "text-encre-fixe",
            ].join(" ")}
          />
        </span>
      ) : (
        <span
          className={[
            "plaque-code flex h-8 shrink-0 items-center rounded-plaque border px-2 text-sm leading-none",
            plaque,
          ].join(" ")}
        >
          {perimetre.code}
        </span>
      )}

      <span
        id={idNom}
        className={[
          "min-w-0 flex-1 truncate text-sm font-medium",
          horsLigne ? "text-encre-fixe" : perimetre.type === "aucune" ? "text-encre-doux" : "text-encre",
        ].join(" ")}
      >
        {perimetre.nom}
      </span>

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
