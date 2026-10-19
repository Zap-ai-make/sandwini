"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * La barre où l'on écrit sa question.
 *
 * **Une zone de texte, pas un champ d'une ligne.** Une question de comptoir
 * tient en six mots, mais « note 15 000 de carburant pour le groupe de la
 * boutique de la gare » n'y tenait pas : le champ faisait défiler le début hors
 * de vue, et on relisait à l'aveugle ce qu'on allait envoyer. Elle grandit donc
 * avec le texte, jusqu'à une limite — au-delà, c'est elle qui défile, pas le
 * panneau.
 *
 * **Entrée envoie, Maj+Entrée va à la ligne.** C'est la convention de tous les
 * chats, et la main l'a déjà apprise ailleurs.
 */

/** Au-delà, la zone défile sur elle-même plutôt que de manger la conversation. */
const HAUTEUR_MAX = 160;

export function AssistantSaisie({
  valeur,
  surChangement,
  surEnvoi,
  occupe,
}: {
  valeur: string;
  surChangement: (valeur: string) => void;
  surEnvoi: () => void;
  /** Vrai pendant qu'une réponse arrive : on n'empile pas deux questions. */
  occupe: boolean;
}) {
  const zone = useRef<HTMLTextAreaElement | null>(null);

  /* La hauteur se recalcule à chaque frappe, et aussi quand le texte est vidé
     par l'envoi — d'où la dépendance sur la valeur plutôt qu'un `onInput`. */
  useEffect(() => {
    const element = zone.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, HAUTEUR_MAX)}px`;
  }, [valeur]);

  const pret = valeur.trim() !== "" && !occupe;

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-bord-fort bg-papier p-2 transition focus-within:border-encre">
      <textarea
        ref={zone}
        rows={1}
        value={valeur}
        onChange={(evenement) => surChangement(evenement.target.value)}
        onKeyDown={(evenement) => {
          if (evenement.key !== "Enter" || evenement.shiftKey) return;
          evenement.preventDefault();
          if (pret) surEnvoi();
        }}
        aria-label="Votre question"
        placeholder="Posez votre question…"
        className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.975rem] leading-relaxed text-encre outline-none placeholder:text-encre-doux"
      />
      <button
        type="button"
        onClick={surEnvoi}
        disabled={!pret}
        aria-label="Envoyer la question"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-encre text-papier transition disabled:bg-bord disabled:text-encre-doux"
      >
        <ArrowUp aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
