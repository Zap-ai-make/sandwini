"use client";

import { History, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  MessageAssistant,
  MessageHumain,
  MessageReflexion,
} from "@/components/AssistantMessage";
import { AssistantSaisie } from "@/components/AssistantSaisie";
import { useSession } from "@/lib/auth/session";
import { trouverParNom } from "@/lib/domain/referentiel";
import { messageErreurAssistant, ouvrirConversation, type Conversation } from "@/lib/ia/assistant";
import { avancerDUnMot } from "@/lib/ia/flux-mot-a-mot";
import { cheminVentePreparee, type Geste } from "@/lib/ia/gestes";
import {
  enregistrerDiscussion,
  lireDiscussions,
  nouvelleDiscussion,
  oublierDiscussion,
  titreDe,
  type Bulle,
  type Discussion,
} from "@/lib/ia/historique";
import type { PieceJointe } from "@/lib/ia/media";
import { LIBELLE_OUTIL } from "@/lib/ia/outils";
import { resume, type Proposition } from "@/lib/ia/propositions";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { enregistrerSortieEspeces } from "@/lib/repositories/caisse";
import { usePostesDepense } from "@/lib/repositories/catalogue";
import { enregistrerMouvement } from "@/lib/repositories/pieces";
import { creerEntree } from "@/lib/repositories/referentiels";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";

/**
 * L'assistant, ouvert depuis le bandeau du haut.
 *
 * **Il demande du réseau, et il le dit.** C'est l'exception à D40 — tout le
 * reste du produit travaille hors ligne — et D66 exige qu'un geste qui a besoin
 * du réseau l'annonce au lieu d'échouer en silence. Coupé, le bouton reste
 * visible et explique ; il ne disparaît pas, et il ne mange pas une question.
 *
 * **Le rendu est séparé de l'arrivée** (S57). Le réseau livre le texte par
 * paquets très inégaux ; l'écran le reprend mot à mot, à cadence fixe. Voir
 * `lib/ia/flux-mot-a-mot.ts` : c'est ce découplage qui fait la différence entre
 * un texte qui sursaute et un texte qui s'écrit.
 */

/**
 * Ce qu'un geste d'écran laisse derrière lui, affiché au-dessus de la saisie.
 *
 * **Le panneau ne se referme pas tout seul.** Il le pourrait — on verrait
 * l'écran immédiatement — mais le geste part *avant* que le modèle ait écrit
 * sa phrase : on perdrait la réponse en route. Une barre dit donc ce qui vient
 * de s'ouvrir, et laisse le choix d'y aller.
 */
type Avis =
  | { quoi: "ouvert"; libelle: string }
  /** Un refus de l'appareil : micro fermé, photo illisible. */
  | { quoi: "souci"; texte: string }
  | { quoi: "boutique_requise"; libelle: string }
  | { quoi: "boutique_introuvable"; nom: string };

/** Un mot toutes les 40 ms, soit le rythme d'une main rapide. */
const CADENCE = 40;

/**
 * Ce qu'on propose quand la page est blanche.
 *
 * Trois, pas six : une liste de possibilités se lit comme un mode d'emploi, et
 * on referme. Elles disent surtout ce que l'assistant sait faire — consulter,
 * calculer, préparer — plutôt que de couvrir les espaces du produit.
 */
const SUGGESTIONS = [
  "Qu’est-ce qu’on a en stock ?",
  "Qui me doit encore de l’argent ?",
  "Note 15 000 de carburant",
];

/**
 * Le choix d'une boutique, là où il manque.
 *
 * **Le bandeau est derrière le panneau**, donc invisible : y renvoyer, c'était
 * désigner une porte qu'on ne voit pas. On pose le choix sur place, par la
 * même fonction que le bandeau appelle — donc le même périmètre pour toute
 * l'application.
 */
function ChoixBoutique({
  boutiques,
  choisir,
}: {
  boutiques: { id: string; nom: string; actif: boolean }[];
  choisir: (boutiqueId: string) => void;
}) {
  const ouvertes = boutiques.filter((boutique) => boutique.actif);
  if (ouvertes.length === 0) {
    return (
      <p className="mt-2 text-sm text-encre-doux">
        Aucune boutique ouverte n’est disponible sur ce compte.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {ouvertes.map((boutique) => (
        <button
          key={boutique.id}
          type="button"
          onClick={() => choisir(boutique.id)}
          className="rounded-full border border-bord-fort bg-papier px-3 py-1.5 text-sm text-encre transition hover:bg-survol"
        >
          {boutique.nom}
        </button>
      ))}
    </div>
  );
}

export function Assistant() {
  const session = useSession();
  const { perimetre, boutiques, choisir } = usePerimetre();
  const router = useRouter();
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

  /* **Deux textes, et pas un seul.** `cible` est ce que le réseau a livré ;
     `montre` est jusqu'où l'œil a suivi. Les confondre, c'est afficher les
     paquets du réseau — trois mots, puis deux phrases d'un coup. */
  const [cible, setCible] = useState("");
  const [montre, setMontre] = useState(0);
  /* La réponse terminée, en attente que le dévoilement la rattrape. La figer
     tout de suite ferait apparaître d'un bloc la fin qu'on était en train de
     lire arriver. */
  const [aFiger, setAFiger] = useState<Discussion | null>(null);

  /* Ce que l'assistant propose d'écrire, en attente du geste humain. Une seule
     à la fois : deux cartes empilées feraient valider la mauvaise. */
  const [proposition, setProposition] = useState<Proposition | null>(null);
  const [ecriture, setEcriture] = useState<"attente" | "en_cours" | "faite" | string>("attente");
  const [avis, setAvis] = useState<Avis | null>(null);
  /* Ce qu'on s'apprête à montrer ou à faire entendre. Vidé à l'envoi : une
     photo renvoyée par mégarde à la question suivante coûte des jetons et
     fait répondre à côté. */
  const [pieces, setPieces] = useState<PieceJointe[]>([]);

  const { postes } = usePostesDepense();

  const conversation = useRef<Conversation | null>(null);
  const filDeDiscussion = useRef<HTMLDivElement | null>(null);
  /* Vrai tant que l'utilisateur n'est pas remonté lire plus haut. Sans ça, le
     fil le ramènerait en bas à chaque mot — on ne pourrait pas relire une
     réponse pendant que la suivante s'écrit. */
  const colleEnBas = useRef(true);

  const occupe = enCours !== null || cible !== "" || aFiger !== null;

  /* La conversation tient l'historique côté SDK. Elle se refait quand le
     périmètre change, parce que le prompt système le nomme. */
  const perimetreCourant = perimetre.boutiqueId;
  useEffect(() => {
    conversation.current = null;
  }, [perimetreCourant]);

  useEffect(() => {
    if (ouvert) setDiscussions(lireDiscussions(uid));
  }, [ouvert, uid]);

  /* Le battement du dévoilement. Un `setTimeout` par pas plutôt qu'un
     intervalle : il s'arrête de lui-même quand la cible est rattrapée, et
     repart tout seul au morceau suivant. */
  useEffect(() => {
    if (montre >= cible.length) return;
    const minuteur = setTimeout(() => setMontre((vu) => avancerDUnMot(cible, vu)), CADENCE);
    return () => clearTimeout(minuteur);
  }, [cible, montre]);

  /* La réponse ne se fige en bulle qu'une fois entièrement dévoilée. */
  useEffect(() => {
    if (aFiger === null || montre < cible.length) return;
    setDiscussion(aFiger);
    enregistrerDiscussion(uid, aFiger);
    setDiscussions(lireDiscussions(uid));
    setAFiger(null);
    setCible("");
    setMontre(0);
  }, [aFiger, montre, cible, uid]);

  useEffect(() => {
    if (!colleEnBas.current) return;
    filDeDiscussion.current?.scrollTo({ top: filDeDiscussion.current.scrollHeight });
  }, [discussion.bulles, montre, enCours, proposition]);

  const demarrerUneNouvelle = useCallback(() => {
    conversation.current = null;
    setDiscussion(nouvelleDiscussion());
    setCible("");
    setMontre(0);
    setAFiger(null);
    setProposition(null);
    setAvis(null);
    setMontreHistorique(false);
  }, []);

  /**
   * Le geste qui engage, et le seul endroit de ce lot qui écrit.
   *
   * L'assistant a préparé ; ici c'est la personne qui valide, et les mêmes
   * fonctions de dépôt que les écrans emploient. Rien d'un chemin parallèle :
   * les règles Firestore valident cette écriture comme n'importe quelle autre,
   * et une dépense faite par l'assistant est indistinguable d'une dépense
   * saisie à la main — même forme, même audit, même journal.
   */
  const confirmer = useCallback(async () => {
    if (proposition === null || session.statut !== "connecte" || !perimetre.boutiqueId) return;
    const auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };
    setEcriture("en_cours");

    try {
      if (proposition.quoi === "depense") {
        /* On reconnaît le poste plutôt qu'on ne l'impose : « carburant »
           retrouve « Carburant ». Même chemin qu'à l'écran des dépenses, pour
           qu'un poste créé ici soit celui qu'on y retrouve. */
        const existant = trouverParNom(proposition.poste, postes);
        let posteId = existant?.id;
        if (!posteId) {
          const creation = creerEntree("postesDepense", proposition.poste, auteur);
          posteId = creation.id;
          creation.enregistre.catch(() => undefined);
        }
        /* L'écriture n'est pas attendue : hors ligne la promesse ne se résout
           jamais, et le bouton resterait bloqué sur une écriture pourtant déjà
           acquise au cache (D76). */
        enregistrerSortieEspeces(
          perimetre.boutiqueId,
          { montant: String(proposition.montant), libelle: proposition.libelle, posteId },
          auteur,
        ).catch(() => undefined);
      } else {
        enregistrerMouvement(
          {
            pieceId: proposition.pieceId,
            type: proposition.sens,
            quantite: String(proposition.quantite),
            note: proposition.note,
          },
          perimetre.boutiqueId,
          auteur,
        ).enregistre.catch(() => undefined);
      }
      setEcriture("faite");
    } catch (cause) {
      setEcriture((cause as Error)?.message ?? "L’enregistrement a échoué.");
    }
  }, [proposition, session, perimetre, postes]);

  /**
   * Exécuter un geste d'écran — **par la porte d'entrée**.
   *
   * `router.push` est ce que fait un lien de la navigation ; `choisir` est ce
   * que fait le sélecteur du bandeau. Aucun clic simulé, aucun champ rempli
   * dans le DOM : voir l'en-tête de `lib/ia/gestes.ts` pour les trois raisons
   * qui excluent l'autre chemin.
   */
  const executerGeste = useCallback(
    (geste: Geste) => {
      if (geste.quoi === "fermer") {
        setOuvert(false);
        return;
      }

      if (geste.quoi === "boutique") {
        /* Le rapprochement se fait ici parce que seul l'écran a la liste :
           « gare routière » doit retrouver « Gare routière », comme un poste de
           dépense retrouve le sien. */
        const ouvertes = boutiques.filter((boutique) => boutique.actif);
        const trouvee = trouverParNom(geste.nom, ouvertes);
        if (!trouvee) {
          setAvis({ quoi: "boutique_introuvable", nom: geste.nom });
          return;
        }
        choisir(trouvee.id);
        setAvis(null);
        return;
      }

      /* Une saisie a besoin d'une destination. Ouvrir le formulaire depuis
         « toutes les boutiques » poserait une vente sans magasin, et l'erreur
         ne se verrait qu'au moment d'enregistrer. */
      const exigeBoutique = geste.quoi === "vente" || geste.destination.exigeBoutique;
      const libelle = geste.quoi === "vente" ? "la vente" : geste.destination.libelle;
      if (exigeBoutique && !perimetre.boutiqueId) {
        setAvis({ quoi: "boutique_requise", libelle });
        return;
      }

      router.push(geste.quoi === "vente" ? cheminVentePreparee(geste) : geste.destination.chemin);
      setAvis({ quoi: "ouvert", libelle });
    },
    [boutiques, choisir, perimetre.boutiqueId, router],
  );

  const reprendre = useCallback((ancienne: Discussion) => {
    /* **La conversation repart à zéro côté modèle, et c'est assumé.** Relire
       une discussion d'hier sert à retrouver ce qui a été dit ; reconstruire
       son contexte chez Gemini coûterait tous les jetons de l'échange pour un
       usage rare. La question suivante repart donc d'un fil neuf. */
    conversation.current = null;
    setDiscussion(ancienne);
    setCible("");
    setMontre(0);
    setAFiger(null);
    setProposition(null);
    setAvis(null);
    setMontreHistorique(false);
  }, []);

  const envoyer = useCallback(
    async (question: string, jointes: readonly PieceJointe[] = []) => {
      if (session.statut !== "connecte") return;

      const avecQuestion: Bulle[] = [
        ...discussion.bulles,
        {
          de: "humain",
          texte: question,
          /* L'étiquette seule : voir `historique.ts`, garder les octets ferait
             sauter le quota de l'appareil et emporterait tout l'historique. */
          ...(jointes.length > 0 ? { jointes: jointes.map((piece) => piece.quoi) } : {}),
        },
      ];
      const enTete: Discussion = {
        ...discussion,
        titre:
          discussion.bulles.length === 0
            ? titreDe(question) || (jointes[0]?.quoi === "voix" ? "Message vocal" : "Photo")
            : discussion.titre,
        quand: new Date().toISOString(),
        bulles: avecQuestion,
      };
      setDiscussion(enTete);
      setSaisie("");
      setPieces([]);
      setCible("");
      setMontre(0);
      /* **La carte de la question précédente s'efface ici.** Laissée en place,
         elle survivait à la question suivante : on lisait une nouvelle réponse
         avec, dessous, un « Enregistrer » qui engageait l'ancienne dépense. */
      setProposition(null);
      setAvis(null);
      setEnCours("Réflexion…");
      /* Une nouvelle question se lit en bas : on y redescend même si on était
         remonté. */
      colleEnBas.current = true;

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

        const { texte, outils } = await conversation.current.envoyer(question, jointes, (progres) => {
          if (progres.quoi === "texte") {
            setCible(progres.texte);
            setEnCours(null);
            return;
          }
          if (progres.quoi === "proposition") {
            setProposition(progres.proposition);
            setEcriture("attente");
            return;
          }
          if (progres.quoi === "geste") {
            executerGeste(progres.geste);
            return;
          }
          if (progres.quoi === "attente") {
            /* Le serveur était occupé et on reprend tout seul. Le dire : trois
               secondes de silence après « Réflexion… » se lisent comme une
               panne, et le gérant renverrait sa question par-dessus. */
            setEnCours(`Le service est occupé, nouvelle tentative (${progres.reprise})…`);
            return;
          }
          setEnCours(
            progres.noms.map((nom: string) => LIBELLE_OUTIL[nom] ?? "Consultation").join(" · ") +
              "…",
          );
        });

        setEnCours(null);
        /* La cible prend le texte complet — le dévoilement finira de le
           rattraper — et la bulle attend ce rattrapage. */
        setCible(texte);
        setAFiger({ ...enTete, bulles: [...avecQuestion, { de: "assistant", texte, outils }] });
      } catch (cause) {
        /* La conversation est jetée : une session de chat qui a échoué garde un
           historique incohérent côté SDK, et la question suivante repartirait
           sur un état cassé. */
        conversation.current = null;
        setEnCours(null);
        setCible("");
        setMontre(0);
        setDiscussion({
          ...enTete,
          bulles: [...avecQuestion, { de: "assistant", texte: messageErreurAssistant(cause) }],
        });
      }
    },
    [session, perimetre, discussion, executerGeste],
  );

  if (session.statut !== "connecte") return null;

  const enTrainDEcrire = cible !== "";
  const vide = discussion.bulles.length === 0 && !enTrainDEcrire && enCours === null;

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
          className="fixed inset-0 z-50 flex justify-end bg-encre/40"
          onClick={(evenement) => {
            if (evenement.target === evenement.currentTarget) setOuvert(false);
          }}
        >
          <section className="flex h-full w-full max-w-[40rem] flex-col bg-papier shadow-2xl">
            <header className="flex items-center gap-1 border-b border-bord px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 font-semibold text-encre">
                  <Sparkles aria-hidden="true" className="size-4 text-encre-doux" />
                  Assistant
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
                className="rounded-lg p-2 text-encre-doux transition hover:bg-survol hover:text-encre"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setMontreHistorique((montreLa) => !montreLa)}
                aria-expanded={montreHistorique}
                aria-label="Discussions passées"
                title="Discussions passées"
                className="rounded-lg p-2 text-encre-doux transition hover:bg-survol hover:text-encre"
              >
                <History aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer l’assistant"
                className="rounded-lg p-2 text-encre-doux transition hover:bg-survol hover:text-encre"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </header>

            {montreHistorique && (
              <div className="max-h-64 overflow-y-auto border-b border-bord bg-fond/60 p-2">
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
                          className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm text-encre transition hover:bg-papier"
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
                          className="rounded-lg p-2 text-encre-doux transition hover:bg-papier hover:text-encre"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div
              ref={filDeDiscussion}
              onScroll={(evenement) => {
                const fil = evenement.currentTarget;
                colleEnBas.current = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 80;
              }}
              className="flex-1 overflow-y-auto px-5 py-6"
            >
              {vide && (
                <div className="flex h-full flex-col justify-center">
                  <p className="text-xl font-semibold text-encre">
                    Bonjour {session.utilisateur.nom.split(" ")[0]}.
                  </p>
                  <p className="mt-1 text-encre-doux">
                    Posez votre question sur vos motos, vos pièces, vos clients ou votre caisse.
                  </p>

                  <div className="mt-5 flex flex-col items-start gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void envoyer(suggestion)}
                        className="rounded-full border border-bord bg-fond px-4 py-2 text-sm text-encre transition hover:border-bord-fort hover:bg-survol"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <p className="mt-6 text-sm text-encre-doux">
                    Il consulte vos données avec vos propres droits : il ne voit rien que vous ne
                    puissiez voir. Il n’enregistre rien tout seul.
                  </p>
                </div>
              )}

              {discussion.bulles.map((bulle, rang) =>
                bulle.de === "humain" ? (
                  <MessageHumain key={rang} texte={bulle.texte} jointes={bulle.jointes} />
                ) : (
                  <MessageAssistant key={rang} texte={bulle.texte} outils={bulle.outils} />
                ),
              )}

              {enTrainDEcrire && (
                <MessageAssistant texte={cible.slice(0, montre)} enCours={montre < cible.length} />
              )}

              {enCours !== null && <MessageReflexion quoi={enCours} />}
            </div>

            {proposition !== null && (
              /* **La carte qui engage, et elle vit hors du fil.**

                 Dans le fil, elle défilait avec la conversation : une réponse
                 un peu longue la poussait sous le bord de l'écran, et le geste
                 le plus important du panneau devenait celui qu'on ne voyait
                 plus. Posée au-dessus de la barre de saisie, elle reste là tant
                 qu'on n'a pas tranché.

                 Elle redit en toutes lettres ce qui sera écrit : les règles
                 Firestore refusent une écriture mal formée, elles ne peuvent
                 rien contre une écriture valide et fausse. Seul quelqu'un qui
                 connaît sa journée voit que la sortie de 15 000 était de
                 1 500. */
              <section
                aria-label="Écriture à valider"
                className="border-t-2 border-encre bg-fond px-5 py-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-encre-doux">
                  {ecriture === "faite" ? "Enregistré" : "À valider"}
                </p>
                <p className="mt-1 text-encre">{resume(proposition)}</p>

                {!perimetre.boutiqueId ? (
                  /* **Le cul-de-sac d'avant.** La carte disait d'aller choisir
                     une boutique dans le bandeau — derrière le panneau, donc
                     invisible — et ne laissait aucun geste. On pose le choix
                     ici : c'est la même fonction que le bandeau appelle, donc
                     le même périmètre pour toute l'application. */
                  <div className="mt-3">
                    <p className="text-sm text-encre-doux">
                      Une écriture appartient à une boutique. Dans laquelle&nbsp;?
                    </p>
                    <ChoixBoutique boutiques={boutiques} choisir={choisir} />
                  </div>
                ) : ecriture === "faite" ? (
                  <div className="mt-3 flex items-center gap-3">
                    <p className="flex-1 text-sm text-encre-doux">
                      La ligne apparaît dans{" "}
                      {proposition.quoi === "depense"
                        ? "le journal de caisse"
                        : "le stock de la pièce"}
                      .
                    </p>
                    <button
                      type="button"
                      onClick={() => setProposition(null)}
                      className="bouton bouton-neutre"
                    >
                      Fermer
                    </button>
                  </div>
                ) : (
                  <>
                    {typeof ecriture === "string" &&
                      ecriture !== "attente" &&
                      ecriture !== "en_cours" && (
                        <p className="mt-2 text-sm text-encre">{ecriture}</p>
                      )}
                    <p className="mt-1 text-sm text-encre-doux">Dans {perimetre.nom}.</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void confirmer()}
                        disabled={ecriture === "en_cours"}
                        className="bouton bouton-principal"
                      >
                        {ecriture === "en_cours" ? "Enregistrement…" : "Enregistrer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProposition(null)}
                        className="bouton bouton-neutre"
                      >
                        Annuler
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            {avis !== null && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-bord bg-fond px-5 py-3">
                {avis.quoi === "ouvert" ? (
                  <>
                    <p className="flex-1 text-sm text-encre">
                      {avis.libelle.charAt(0).toUpperCase() + avis.libelle.slice(1)} vient de
                      s’ouvrir derrière ce panneau.
                      {avis.libelle === "la vente" && " Rien n’est enregistré tant que vous n’avez pas validé."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setOuvert(false);
                        setAvis(null);
                      }}
                      className="bouton bouton-neutre"
                    >
                      Voir l’écran
                    </button>
                  </>
                ) : (
                  <div className="flex-1">
                    <p className="text-sm text-encre">
                      {avis.quoi === "souci"
                        ? avis.texte
                        : avis.quoi === "boutique_requise"
                          ? `Pour ouvrir ${avis.libelle}, il faut d’abord une boutique.`
                          : `Je ne trouve pas de boutique « ${avis.nom} ».`}
                    </p>
                    {avis.quoi !== "souci" && (
                      <ChoixBoutique boutiques={boutiques} choisir={choisir} />
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-bord bg-papier px-5 py-4">
              {!enLigne ? (
                <p className="text-sm text-encre-doux">
                  L’assistant a besoin du réseau. Le reste de l’application continue de
                  fonctionner&nbsp;: vos saisies partiront au retour du signal.
                </p>
              ) : (
                <>
                  <AssistantSaisie
                    valeur={saisie}
                    surChangement={setSaisie}
                    surEnvoi={() => {
                      const question = saisie.trim();
                      /* Une photo ou une voix se suffit : au comptoir on tend
                         son téléphone sans commenter. */
                      if ((question || pieces.length > 0) && !occupe) void envoyer(question, pieces);
                    }}
                    occupe={occupe}
                    pieces={pieces}
                    surPiece={(piece) => setPieces((dejaLà) => [...dejaLà, piece])}
                    surRetirerPiece={(rang) =>
                      setPieces((dejaLà) => dejaLà.filter((_, place) => place !== rang))
                    }
                    surErreur={(message) => setAvis({ quoi: "souci", texte: message })}
                  />
                  <p className="mt-2 text-center text-xs text-encre-doux">
                    L’assistant peut se tromper. Vérifiez ce qui engage de l’argent.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
