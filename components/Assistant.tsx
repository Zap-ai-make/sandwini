"use client";

import { History, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AssistantTexte } from "@/components/AssistantTexte";
import { useSession } from "@/lib/auth/session";
import { messageErreurAssistant, ouvrirConversation, type Conversation } from "@/lib/ia/assistant";
import {
  enregistrerDiscussion,
  lireDiscussions,
  nouvelleDiscussion,
  oublierDiscussion,
  titreDe,
  type Bulle,
  type Discussion,
} from "@/lib/ia/historique";
import { LIBELLE_OUTIL } from "@/lib/ia/outils";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";

/**
 * L'assistant, ouvert depuis le bandeau du haut.
 *
 * **Il demande du réseau, et il le dit.** C'est l'exception à D40 — tout le
 * reste du produit travaille hors ligne — et D66 exige qu'un geste qui a besoin
 * du réseau l'annonce au lieu d'échouer en silence. Coupé, le bouton reste
 * visible et explique ; il ne disparaît pas, et il ne mange pas une question.
 *
 * **Trois choses que le premier rendu n'avait pas**, et que le commanditaire a
 * demandées en voyant sa première réponse :
 *
 * - le texte arrive **au fil de l'eau** au lieu de tomber d'un bloc après dix
 *   secondes de silence ;
 * - l'attente est **nommée** — « Lecture du stock de motos » — parce qu'une
 *   animation muette ne dit pas si l'assistant a compris la question ;
 * - les discussions se gardent, et on peut en ouvrir une nouvelle. Sur
 *   l'appareil seulement : voir `lib/ia/historique.ts` pour pourquoi ce n'est
 *   pas Firestore.
 */

/** Les trois points de la réflexion. Décalés pour que l'œil lise un mouvement. */
function Reflexion({ quoi }: { quoi: string }) {
  return (
    <p role="status" className="mt-3 flex items-center gap-2 text-sm text-encre-doux">
      <span aria-hidden="true" className="flex gap-1">
        {[0, 1, 2].map((rang) => (
          <span
            key={rang}
            className="size-1.5 animate-bounce rounded-full bg-encre-doux"
            style={{ animationDelay: `${rang * 150}ms` }}
          />
        ))}
      </span>
      {quoi}
    </p>
  );
}

export function Assistant() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const { enLigne } = useEtatReseau();

  /* L'historique est cloisonné par compte : deux personnes qui se relaient sur
     la tablette du comptoir ne s'héritent pas leurs questions. */
  const uid = session.statut === "connecte" ? session.utilisateur.uid : "";

  const [ouvert, setOuvert] = useState(false);
  const [montreHistorique, setMontreHistorique] = useState(false);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [discussion, setDiscussion] = useState<Discussion>(() => nouvelleDiscussion());
  const [saisie, setSaisie] = useState("");
  /* `null` = au repos. Une chaîne = ce qu'on est en train de faire, affiché tel
     quel : « Réflexion… », « Lecture du stock de motos ». */
  const [enCours, setEnCours] = useState<string | null>(null);
  /* Le texte qui arrive, avant d'être figé en bulle. Séparé des bulles pour que
     chaque morceau ne réécrive pas toute la liste. */
  const [enFlux, setEnFlux] = useState("");

  const conversation = useRef<Conversation | null>(null);
  const filDeDiscussion = useRef<HTMLDivElement | null>(null);

  /* La conversation tient l'historique côté SDK. Elle se refait quand le
     périmètre change, parce que le prompt système le nomme. */
  const perimetreCourant = perimetre.boutiqueId;
  useEffect(() => {
    conversation.current = null;
  }, [perimetreCourant]);

  useEffect(() => {
    if (ouvert) setDiscussions(lireDiscussions(uid));
  }, [ouvert, uid]);

  useEffect(() => {
    filDeDiscussion.current?.scrollTo({ top: filDeDiscussion.current.scrollHeight });
  }, [discussion.bulles, enFlux, enCours]);

  const demarrerUneNouvelle = useCallback(() => {
    conversation.current = null;
    setDiscussion(nouvelleDiscussion());
    setEnFlux("");
    setMontreHistorique(false);
  }, []);

  const reprendre = useCallback((ancienne: Discussion) => {
    /* **La conversation repart à zéro côté modèle, et c'est assumé.** Relire
       une discussion d'hier sert à retrouver ce qui a été dit ; reconstruire
       son contexte chez Gemini coûterait tous les jetons de l'échange pour un
       usage rare. La question suivante repart donc d'un fil neuf. */
    conversation.current = null;
    setDiscussion(ancienne);
    setEnFlux("");
    setMontreHistorique(false);
  }, []);

  const envoyer = useCallback(
    async (question: string) => {
      if (session.statut !== "connecte") return;

      const avecQuestion: Bulle[] = [...discussion.bulles, { de: "humain", texte: question }];
      const enTete: Discussion = {
        ...discussion,
        titre: discussion.bulles.length === 0 ? titreDe(question) : discussion.titre,
        quand: new Date().toISOString(),
        bulles: avecQuestion,
      };
      setDiscussion(enTete);
      setSaisie("");
      setEnFlux("");
      setEnCours("Réflexion…");

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

        const { texte, outils } = await conversation.current.envoyer(question, (progres) => {
          if (progres.quoi === "texte") {
            setEnFlux(progres.texte);
            setEnCours(null);
            return;
          }
          setEnCours(
            progres.noms.map((nom) => LIBELLE_OUTIL[nom] ?? "Lecture").join(" · ") + "…",
          );
        });

        const complete: Discussion = {
          ...enTete,
          bulles: [...avecQuestion, { de: "assistant", texte, outils }],
        };
        setDiscussion(complete);
        enregistrerDiscussion(uid, complete);
        setDiscussions(lireDiscussions(uid));
      } catch (cause) {
        /* La conversation est jetée : une session de chat qui a échoué garde un
           historique incohérent côté SDK, et la question suivante repartirait
           sur un état cassé. */
        conversation.current = null;
        setDiscussion({
          ...enTete,
          bulles: [...avecQuestion, { de: "assistant", texte: messageErreurAssistant(cause) }],
        });
      } finally {
        setEnFlux("");
        setEnCours(null);
      }
    },
    [session, perimetre, discussion],
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
          <section className="flex h-full w-full max-w-[34rem] flex-col border-l border-bord bg-fond">
            <header className="flex items-center gap-2 border-b border-bord p-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-encre">
                  {discussion.bulles.length === 0 ? "Assistant" : discussion.titre}
                </h2>
                <p className="truncate text-sm text-encre-doux">
                  {perimetre.nom}
                  {!enLigne && " — hors ligne"}
                </p>
              </div>
              <button
                type="button"
                onClick={demarrerUneNouvelle}
                aria-label="Nouvelle discussion"
                title="Nouvelle discussion"
                className="bouton bouton-neutre"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setMontreHistorique((montre) => !montre)}
                aria-expanded={montreHistorique}
                aria-label="Discussions passées"
                title="Discussions passées"
                className="bouton bouton-neutre"
              >
                <History aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer l’assistant"
                className="bouton bouton-neutre"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </header>

            {montreHistorique && (
              <div className="max-h-64 overflow-y-auto border-b border-bord p-2">
                {discussions.length === 0 ? (
                  <p className="p-2 text-sm text-encre-doux">
                    Aucune discussion gardée. Elles restent sur cet appareil.
                  </p>
                ) : (
                  <ul>
                    {discussions.map((ancienne) => (
                      <li key={ancienne.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => reprendre(ancienne)}
                          className="min-w-0 flex-1 truncate rounded px-2 py-2 text-left text-sm text-encre hover:bg-accent-doux"
                        >
                          {ancienne.titre}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            oublierDiscussion(uid, ancienne.id);
                            setDiscussions(lireDiscussions(uid));
                          }}
                          aria-label={`Oublier « ${ancienne.titre} »`}
                          className="bouton bouton-neutre"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div ref={filDeDiscussion} className="flex-1 overflow-y-auto p-4">
              {discussion.bulles.length === 0 && enFlux === "" && (
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

              {discussion.bulles.map((bulle, rang) => (
                <div key={rang} className={bulle.de === "humain" ? "mt-4 text-right" : "mt-4"}>
                  {bulle.de === "humain" ? (
                    <p className="inline-block max-w-[85%] rounded-lg bg-accent-doux px-3 py-2 text-left text-encre">
                      {bulle.texte}
                    </p>
                  ) : (
                    <>
                      <AssistantTexte texte={bulle.texte} />
                      {bulle.outils && bulle.outils.length > 0 && (
                        /* Ce qu'il a lu pour répondre. Un chiffre sans sa source
                           se croit ou ne se croit pas ; avec elle, il se
                           vérifie. */
                        <p className="mt-2 text-xs text-encre-doux">
                          lu&nbsp;:{" "}
                          {[...new Set(bulle.outils)]
                            .map((nom) => LIBELLE_OUTIL[nom] ?? nom)
                            .join(", ")
                            .toLowerCase()}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}

              {enFlux !== "" && (
                <div className="mt-4">
                  <AssistantTexte texte={enFlux} />
                </div>
              )}

              {enCours !== null && <Reflexion quoi={enCours} />}
            </div>

            <form
              onSubmit={(evenement) => {
                evenement.preventDefault();
                const question = saisie.trim();
                if (question && enCours === null && enFlux === "") void envoyer(question);
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
                    disabled={enCours !== null || enFlux !== "" || saisie.trim() === ""}
                    className="bouton bouton-principal"
                  >
                    Envoyer
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
