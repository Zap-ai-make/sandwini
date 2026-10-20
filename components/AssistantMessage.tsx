"use client";

import { Camera, Check, Copy, Mic, Sparkles } from "lucide-react";
import { useState } from "react";

import { AssistantTexte } from "@/components/AssistantTexte";
import { LIBELLE_OUTIL } from "@/lib/ia/outils";
import { OUTILS_QUI_AGISSENT } from "@/lib/ia/gestes";
import { OUTILS_QUI_PREPARENT } from "@/lib/ia/propositions";

/**
 * Un message, d'un côté ou de l'autre.
 *
 * **Les deux voix ne se ressemblent pas, et c'est le point.** Le premier rendu
 * alignait la question à droite et la réponse à gauche, sur le même fond et
 * dans la même encre : en relisant une discussion, on ne distinguait plus qui
 * avait dit quoi. Le commanditaire l'a dit en voyant l'écran — « le texte de
 * l'utilisateur différent de celui de Gemini ».
 *
 * La question est donc **une bulle posée sur le sable**, courte et fermée : un
 * objet qu'on a déposé. La réponse n'a pas de bulle — elle occupe la feuille,
 * signée d'une pastille, comme un texte qu'on lit et non comme une réplique.
 * C'est la grammaire des chats qu'on connaît, transcrite dans les couleurs de
 * SDI plutôt que décalquée en gris.
 */

export function MessageHumain({
  texte,
  jointes,
}: {
  texte: string;
  /** Ce qui accompagnait la question : l'étiquette, le contenu ne se garde pas. */
  jointes?: readonly ("photo" | "voix")[];
}) {
  return (
    <div className="mt-6 flex justify-end first:mt-0">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-fond px-4 py-2.5">
        {jointes && jointes.length > 0 && (
          /* **Dit, parce qu'une question muette est incompréhensible à la
             relecture.** Sans cette ligne, une discussion ouverte le lendemain
             montrait une réponse sur un numéro de châssis sans qu'on voie d'où
             il sortait — et le contenu, lui, n'est pas gardé. */
          <p
            className={`flex items-center gap-1.5 text-sm text-encre-doux ${texte ? "mb-1" : ""}`}
          >
            {jointes.map((quoi, rang) => (
              <span key={rang} className="flex items-center gap-1">
                {quoi === "photo" ? (
                  <Camera aria-hidden="true" className="size-3.5" />
                ) : (
                  <Mic aria-hidden="true" className="size-3.5" />
                )}
                {quoi === "photo" ? "Photo" : "Message vocal"}
              </span>
            ))}
          </p>
        )}
        {texte && (
          <p className="whitespace-pre-wrap text-[0.975rem] leading-relaxed text-encre">{texte}</p>
        )}
      </div>
    </div>
  );
}

/** La pastille qui signe la réponse. Discrète : elle situe, elle ne décore pas. */
function Pastille() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-nuit text-coquille-encre"
    >
      <Sparkles className="size-3.5" />
    </span>
  );
}

/**
 * L'attente, nommée et alignée sur la réponse à venir.
 *
 * **Une animation muette ne dit rien.** Nommer la consultation en cours — « je
 * regarde le stock de motos » — transforme l'attente en information : on juge
 * que l'assistant a compris la question avant même qu'il réponde, et s'il a
 * compris de travers, on le voit tout de suite au lieu d'attendre sa phrase.
 *
 * Posée au même retrait que le texte qui va la remplacer, pour que la réponse
 * ne saute pas d'un cran en apparaissant.
 */
export function MessageReflexion({ quoi }: { quoi: string }) {
  return (
    <div className="mt-6 flex gap-3 first:mt-0">
      <Pastille />
      <p role="status" className="flex items-center gap-2 py-1 text-[0.975rem] text-encre-doux">
        {quoi}
        <span aria-hidden="true" className="flex gap-1">
          {[0, 1, 2].map((rang) => (
            <span
              key={rang}
              className="size-1.5 animate-bounce rounded-full bg-encre-doux"
              style={{ animationDelay: `${rang * 150}ms` }}
            />
          ))}
        </span>
      </p>
    </div>
  );
}

/**
 * Ce que l'assistant a consulté pour répondre.
 *
 * Un chiffre sans sa source se croit ou ne se croit pas ; avec elle, il se
 * vérifie. **Les gestes qui préparent une écriture n'en sont pas** : ils ne
 * consultent rien, et les ranger là affichait « lu : preparer_depense » sous
 * une réponse qui n'avait rien lu du tout — du code montré à un gérant. Les
 * gestes d'écran non plus : ouvrir une page n'est pas une source.
 */
function SourcesLues({ outils }: { outils: readonly string[] }) {
  const lectures = [...new Set(outils)].filter(
    (nom) => !OUTILS_QUI_PREPARENT.has(nom) && !OUTILS_QUI_AGISSENT.has(nom),
  );
  if (lectures.length === 0) return null;

  return (
    <p className="mt-2 text-xs text-encre-doux">
      {lectures.map((nom) => LIBELLE_OUTIL[nom] ?? "Consultation").join(" · ")}
    </p>
  );
}

/**
 * Recopier la réponse.
 *
 * Un chiffre tiré de l'assistant finit souvent dans un message WhatsApp au
 * patron : le retaper à la main est l'occasion de se tromper d'un zéro, sur
 * précisément les données où ça coûte.
 */
function BoutonCopier({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 1_600);
    } catch {
      /* Le presse-papiers est refusé hors contexte sécurisé. Rien à dire :
         l'utilisateur peut toujours sélectionner le texte à la main, et une
         alerte pour ça ferait plus de bruit que de service. */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copier()}
      aria-label={copie ? "Réponse copiée" : "Copier la réponse"}
      title="Copier"
      className="rounded p-1.5 text-encre-doux transition hover:bg-survol hover:text-encre"
    >
      {copie ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
    </button>
  );
}

export function MessageAssistant({
  texte,
  outils,
  enCours = false,
}: {
  texte: string;
  outils?: readonly string[];
  /** Vrai tant que le texte s'écrit : le curseur suit, et on ne propose pas de copier. */
  enCours?: boolean;
}) {
  return (
    <div className="mt-6 flex gap-3 first:mt-0">
      <Pastille />
      <div className="min-w-0 flex-1">
        <AssistantTexte texte={texte} enCours={enCours} />
        {!enCours && (
          <div className="mt-1 flex items-center gap-2">
            <BoutonCopier texte={texte} />
            {outils && <SourcesLues outils={outils} />}
          </div>
        )}
      </div>
    </div>
  );
}
