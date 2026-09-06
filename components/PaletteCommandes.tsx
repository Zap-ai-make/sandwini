"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/auth/session";
import {
  ESPACES,
  ecransVisibles,
  espacesVisibles,
  type Espace,
} from "@/lib/domain/espaces";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/**
 * La palette de commandes — `Ctrl K`.
 *
 * Sur un poste fixe utilisé huit heures par jour, c'est ce qui sépare un outil
 * d'un formulaire : atteindre n'importe quel écran sans lever la main du
 * clavier. Elle prend le relais du second niveau quand on sait déjà où l'on va.
 *
 * **Ce qu'elle cherche, et ce qu'elle ne cherche pas.** Elle liste les écrans
 * ouverts à la personne connectée, et rien d'autre. Chercher dans les motos,
 * les ventes et les clients demande un index consultable hors ligne — c'est un
 * chantier à part, pas une ligne de plus ici, et le dire vaut mieux que de
 * livrer une recherche qui ne trouve pas ce qu'on lui demande.
 *
 * Elle est bâtie sur `<dialog>` natif plutôt que sur une bibliothèque de
 * composants. Le navigateur donne le piège de focus, la fermeture par Échap, le
 * fond inerte et le retour du focus au déclencheur — c'est-à-dire tout ce pour
 * quoi on aurait installé Radix (`ARCHITECTURE.md` §1). Une dépendance de moins
 * à suivre, et un comportement que personne n'a à réimplémenter.
 */
type Entree = { href: string; libelle: string; espace: Espace };

/** Sans ça, « Reçus » ne se trouve pas en tapant « recus ». */
function sansAccent(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function PaletteCommandes() {
  const router = useRouter();
  const session = useSession();
  const { perimetre } = usePerimetre();
  const [ouverte, setOuverte] = useState(false);
  const [filtre, setFiltre] = useState("");
  const [choisi, setChoisi] = useState(0);
  const dialogue = useRef<HTMLDialogElement>(null);

  const connecte = session.statut === "connecte";
  const role = connecte ? session.utilisateur.role : null;

  const entrees = useMemo<Entree[]>(() => {
    if (!role) return [];
    return espacesVisibles(role, perimetre.metiers).flatMap((espace) =>
      ecransVisibles(espace, role).map(({ href, libelle }) => ({ href, libelle, espace })),
    );
  }, [role, perimetre.metiers]);

  const resultats = useMemo(() => {
    const cherche = sansAccent(filtre.trim());
    if (!cherche) return entrees;
    return entrees.filter(
      ({ libelle, espace }) =>
        sansAccent(libelle).includes(cherche) ||
        sansAccent(ESPACES[espace].libelle).includes(cherche),
    );
  }, [entrees, filtre]);

  useEffect(() => {
    function auClavier(evenement: KeyboardEvent) {
      if (!(evenement.ctrlKey || evenement.metaKey) || evenement.altKey) return;
      if (evenement.key.toLowerCase() !== "k") return;
      evenement.preventDefault();
      setOuverte((avant) => !avant);
    }
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, []);

  useEffect(() => {
    const boite = dialogue.current;
    if (!boite) return;
    if (ouverte && !boite.open) {
      setFiltre("");
      setChoisi(0);
      boite.showModal();
    } else if (!ouverte && boite.open) {
      boite.close();
    }
  }, [ouverte]);

  if (!connecte) return null;

  function aller(href: string) {
    setOuverte(false);
    router.push(href);
  }

  return (
    <>
      {/* Le champ n'en est pas un : c'est un bouton qui ouvre la palette. Un
          vrai champ ici promettrait qu'on peut taper dedans sans rien ouvrir,
          et il faudrait alors y afficher les résultats — deux endroits pour la
          même chose. */}
      <button
        type="button"
        onClick={() => setOuverte(true)}
        className="flex h-8 w-[min(360px,32vw)] shrink-0 items-center gap-2 rounded-champ border border-bord bg-fond px-2 text-left text-legende text-encre-doux hover:border-bord-fort max-md:w-auto max-md:justify-center"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="max-md:sr-only">Chercher un écran</span>
        <kbd className="ml-auto rounded-plaque border border-b-2 border-bord bg-papier px-1.5 font-code text-micro max-md:hidden">
          Ctrl K
        </kbd>
      </button>

      <dialog
        ref={dialogue}
        onClose={() => setOuverte(false)}
        aria-label="Chercher un écran"
        /* `mx-auto` n'est pas décoratif : la feuille de base de Tailwind remet les
           marges à zéro sur tous les éléments, et `<dialog>` perd le `margin:
           auto` qui le centre. Sans lui la palette se colle en haut à gauche —
           vu sur la capture, pas déduit. */
        className="mx-auto mt-[12vh] w-[min(560px,92vw)] rounded-carte border border-bord bg-papier p-0 text-encre shadow-menu backdrop:bg-nuit/45"
      >
        <div className="flex items-center gap-2 border-b border-bord px-3">
          <Search aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
          <input
            autoFocus
            value={filtre}
            onChange={(evenement) => {
              setFiltre(evenement.target.value);
              setChoisi(0);
            }}
            onKeyDown={(evenement) => {
              if (evenement.key === "ArrowDown") {
                evenement.preventDefault();
                setChoisi((rang) => Math.min(rang + 1, resultats.length - 1));
              } else if (evenement.key === "ArrowUp") {
                evenement.preventDefault();
                setChoisi((rang) => Math.max(rang - 1, 0));
              } else if (evenement.key === "Enter") {
                evenement.preventDefault();
                const cible = resultats[choisi];
                if (cible) aller(cible.href);
              }
            }}
            aria-label="Chercher un écran"
            placeholder="Nom d’un écran — ventes, dossiers, boutiques…"
            className="h-12 w-full bg-transparent text-champ outline-none placeholder:text-encre-doux"
          />
        </div>

        {resultats.length === 0 ? (
          <p className="px-4 py-6 text-encre-doux">
            Aucun écran ne porte ce nom. La palette ne cherche pas encore dans les motos, les
            ventes ni les clients.
          </p>
        ) : (
          <ul className="max-h-[46vh] overflow-y-auto py-1">
            {resultats.map(({ href, libelle, espace }, rang) => (
              <li key={`${espace}-${href}`}>
                <button
                  type="button"
                  onMouseEnter={() => setChoisi(rang)}
                  onClick={() => aller(href)}
                  className={[
                    "flex w-full items-center gap-3 px-4 py-2 text-left",
                    rang === choisi ? "bg-survol" : "",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1 truncate">{libelle}</span>
                  <span className="shrink-0 text-legende text-encre-doux">
                    {ESPACES[espace].libelle}
                  </span>
                  {rang === choisi && (
                    <CornerDownLeft aria-hidden="true" className="size-3.5 text-encre-doux" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}
