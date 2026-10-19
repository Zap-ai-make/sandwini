"use client";

import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSession } from "@/lib/auth/session";
import { messageErreurAssistant, ouvrirConversation, type Conversation } from "@/lib/ia/assistant";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";

/**
 * L'assistant, ouvert depuis le bandeau du haut.
 *
 * **Il demande du réseau, et il le dit.** C'est l'exception à D40 — tout le
 * reste du produit travaille hors ligne — et D66 exige qu'un geste qui a besoin
 * du réseau l'annonce au lieu d'échouer en silence. Le commanditaire a précisé
 * le contexte : « les 3,5/4 y'a la connexion, c'est souvent les coupures qui
 * font perdre ». Donc coupé, le bouton reste visible et explique ; il ne
 * disparaît pas, et il ne mange pas une question.
 *
 * La conversation ne survit pas à un rechargement, et c'est volontaire : rien
 * de ce qui s'y dit n'est une pièce comptable, et l'écrire en base créerait un
 * second endroit où lire des chiffres que les écrans donnent déjà.
 */

type Bulle = { de: "humain" | "assistant"; texte: string; outils?: string[] };

export function Assistant() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const { enLigne } = useEtatReseau();

  const [ouvert, setOuvert] = useState(false);
  const [bulles, setBulles] = useState<Bulle[]>([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);

  /* La conversation tient l'historique côté SDK : la recréer à chaque question
     ferait oublier « et son numéro ? » juste après « qui est Ouédraogo ». Elle
     se refait quand le périmètre change, parce que le prompt le nomme. */
  const conversation = useRef<Conversation | null>(null);
  const filDeDiscussion = useRef<HTMLDivElement | null>(null);

  const perimetreCourant = perimetre.boutiqueId;
  useEffect(() => {
    conversation.current = null;
  }, [perimetreCourant]);

  useEffect(() => {
    filDeDiscussion.current?.scrollTo({ top: filDeDiscussion.current.scrollHeight });
  }, [bulles, enCours]);

  const envoyer = useCallback(
    async (question: string) => {
      if (session.statut !== "connecte") return;

      setBulles((actuel) => [...actuel, { de: "humain", texte: question }]);
      setSaisie("");
      setEnCours(true);

      try {
        conversation.current ??= ouvrirConversation(
          {
            nom: session.utilisateur.nom,
            role: session.utilisateur.role,
            nomBoutique: perimetre.boutiqueId ? perimetre.nom : null,
            aujourdhui: new Date(),
          },
          { boutiqueId: perimetre.boutiqueId },
        );

        const { texte, outils } = await conversation.current.envoyer(question);
        setBulles((actuel) => [...actuel, { de: "assistant", texte, outils }]);
      } catch (cause) {
        /* La conversation est jetée : une session de chat qui a échoué garde un
           historique incohérent côté SDK, et la question suivante repartirait
           sur un état cassé. */
        conversation.current = null;
        setBulles((actuel) => [
          ...actuel,
          { de: "assistant", texte: messageErreurAssistant(cause) },
        ]);
      } finally {
        setEnCours(false);
      }
    },
    [session, perimetre],
  );

  if (session.statut !== "connecte") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-expanded={ouvert}
        className="bouton bouton-neutre gap-1.5"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        Assistant
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-label="Assistant"
          className="fixed inset-0 z-50 flex justify-end bg-encre/30"
          onClick={(evenement) => {
            if (evenement.target === evenement.currentTarget) setOuvert(false);
          }}
        >
          <section className="flex h-full w-full max-w-[32rem] flex-col border-l border-bord bg-fond">
            <header className="flex items-center justify-between border-b border-bord p-4">
              <div>
                <h2 className="font-semibold text-encre">Assistant</h2>
                <p className="text-sm text-encre-doux">
                  {perimetre.nom}
                  {!enLigne && " — hors ligne"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer l’assistant"
                className="bouton bouton-neutre"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </header>

            <div ref={filDeDiscussion} className="flex-1 overflow-y-auto p-4">
              {bulles.length === 0 && (
                <div className="encadre-vide">
                  <p className="text-encre">Posez votre question sur vos données.</p>
                  <p className="mt-1 text-sm text-encre-doux">
                    « Qu’est-ce qu’on a en stock ? » · « Qui me doit encore de l’argent ? » ·
                    « Combien il me reste de bougies ? »
                  </p>
                  <p className="mt-3 text-sm text-encre-doux">
                    L’assistant lit vos données avec vos propres droits : il ne voit rien que vous
                    ne puissiez voir. Il n’enregistre rien tout seul.
                  </p>
                </div>
              )}

              {bulles.map((bulle, rang) => (
                <div
                  key={rang}
                  className={bulle.de === "humain" ? "mt-3 text-right" : "mt-3"}
                >
                  {/* `whitespace-pre-wrap` et non du Markdown rendu : le texte
                      vient d'un modèle, et l'interpréter comme du balisage
                      ouvrirait une porte que rien ne surveille. */}
                  <p
                    className={
                      bulle.de === "humain"
                        ? "inline-block max-w-[85%] rounded-lg bg-accent-doux px-3 py-2 text-left text-encre"
                        : "whitespace-pre-wrap text-encre"
                    }
                  >
                    {bulle.texte}
                  </p>
                  {bulle.outils && bulle.outils.length > 0 && (
                    /* Ce qu'il a lu pour répondre. Un chiffre sans sa source se
                       croit ou ne se croit pas ; avec elle, il se vérifie. */
                    <p className="mt-1 text-xs text-encre-doux">
                      lu : {[...new Set(bulle.outils)].join(", ").replace(/_/g, " ")}
                    </p>
                  )}
                </div>
              ))}

              {enCours && <p className="mt-3 text-sm text-encre-doux">Lecture de vos données…</p>}
            </div>

            <form
              onSubmit={(evenement) => {
                evenement.preventDefault();
                const question = saisie.trim();
                if (question && !enCours) void envoyer(question);
              }}
              className="border-t border-bord p-4"
            >
              {!enLigne ? (
                <p className="text-sm text-encre-doux">
                  L’assistant a besoin du réseau. Le reste de l’application continue de
                  fonctionner&nbsp;: vos saisies partiront au retour du signal.
                </p>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={saisie}
                    onChange={(evenement) => setSaisie(evenement.target.value)}
                    aria-label="Votre question"
                    placeholder="Votre question…"
                    className="saisie flex-1"
                  />
                  <button
                    type="submit"
                    disabled={enCours || saisie.trim() === ""}
                    className="bouton bouton-principal"
                  >
                    {enCours ? "…" : "Envoyer"}
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      )}
    </>
  );
}
