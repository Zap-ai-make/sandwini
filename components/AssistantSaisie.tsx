"use client";

import { ArrowUp, Camera, Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { enregistrerLaVoix, reduirePhoto, type Enregistrement } from "@/lib/ia/capture";
import { dureeLisible, type PieceJointe } from "@/lib/ia/media";

/**
 * La barre où l'on écrit sa question — ou bien où l'on montre, où l'on parle.
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
 *
 * **La photo et la voix sont des mains libres, pas des gadgets.** Un gérant qui
 * fait entrer une moto a les doigts gras et un numéro de dix-sept caractères à
 * recopier sans se tromper ; il photographie le cadre. Un gérant qui vend
 * pendant qu'un client attend n'ouvre pas huit champs ; il dicte. Les deux
 * arrivent ici comme des pièces jointes à la même question.
 */

/** Au-delà, la zone défile sur elle-même plutôt que de manger la conversation. */
const HAUTEUR_MAX = 160;

/** Les pièces déjà attachées, et de quoi en retirer une. */
function Jointes({
  pieces,
  surRetirer,
}: {
  pieces: readonly PieceJointe[];
  surRetirer: (rang: number) => void;
}) {
  if (pieces.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2 px-1">
      {pieces.map((piece, rang) => (
        <span
          key={rang}
          className="flex items-center gap-1.5 rounded-full bg-fond px-3 py-1 text-sm text-encre"
        >
          {piece.quoi === "photo" ? (
            <Camera aria-hidden="true" className="size-3.5" />
          ) : (
            <Mic aria-hidden="true" className="size-3.5" />
          )}
          {piece.quoi === "photo" ? "Photo" : "Message vocal"}
          <button
            type="button"
            onClick={() => surRetirer(rang)}
            aria-label={`Retirer ${piece.quoi === "photo" ? "la photo" : "le message vocal"}`}
            className="rounded-full p-0.5 text-encre-doux transition hover:text-encre"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function AssistantSaisie({
  valeur,
  surChangement,
  surEnvoi,
  occupe,
  pieces,
  surPiece,
  surRetirerPiece,
  surErreur,
}: {
  valeur: string;
  surChangement: (valeur: string) => void;
  surEnvoi: () => void;
  /** Vrai pendant qu'une réponse arrive : on n'empile pas deux questions. */
  occupe: boolean;
  pieces: readonly PieceJointe[];
  surPiece: (piece: PieceJointe) => void;
  surRetirerPiece: (rang: number) => void;
  surErreur: (message: string) => void;
}) {
  const zone = useRef<HTMLTextAreaElement | null>(null);
  const fichier = useRef<HTMLInputElement | null>(null);
  const enregistrement = useRef<Enregistrement | null>(null);

  const [enregistre, setEnregistre] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const [prepare, setPrepare] = useState(false);

  /* La hauteur se recalcule à chaque frappe, et aussi quand le texte est vidé
     par l'envoi — d'où la dépendance sur la valeur plutôt qu'un `onInput`. */
  useEffect(() => {
    const element = zone.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, HAUTEUR_MAX)}px`;
  }, [valeur]);

  /* Le compteur de l'enregistrement. Sans lui on ne sait pas si le micro
     écoute, et on parle dans le vide ou on s'arrête trop tôt. */
  useEffect(() => {
    if (!enregistre) return;
    const battement = setInterval(() => setSecondes((passees) => passees + 1), 1_000);
    return () => clearInterval(battement);
  }, [enregistre]);

  /* Quitter le panneau pendant qu'on parle doit couper le micro : son voyant
     resterait allumé sur l'appareil, ce qu'on ne pardonne pas à un logiciel
     de gestion. */
  useEffect(() => () => enregistrement.current?.abandonner(), []);

  const prendreLaPhoto = async (choisi: File | undefined) => {
    if (!choisi) return;
    setPrepare(true);
    try {
      surPiece(await reduirePhoto(choisi));
    } catch (cause) {
      surErreur((cause as Error)?.message ?? "Cette photo n’a pas pu être préparée.");
    } finally {
      setPrepare(false);
      /* Remis à zéro, sans quoi reprendre deux fois la même photo ne déclenche
         aucun changement et le second essai paraît ignoré. */
      if (fichier.current) fichier.current.value = "";
    }
  };

  const commencerAParler = async () => {
    try {
      enregistrement.current = await enregistrerLaVoix();
      setSecondes(0);
      setEnregistre(true);
    } catch {
      /* Refus d'autorisation, micro absent, page non sécurisée : trois causes,
         un seul geste à proposer. */
      surErreur("Le micro n’est pas accessible. Autorisez-le dans votre navigateur.");
    }
  };

  const terminerDeParler = async () => {
    const encours = enregistrement.current;
    enregistrement.current = null;
    setEnregistre(false);
    if (!encours) return;
    setPrepare(true);
    try {
      surPiece(await encours.arreter());
    } catch (cause) {
      surErreur((cause as Error)?.message ?? "Ce message vocal n’a pas pu être préparé.");
    } finally {
      setPrepare(false);
    }
  };

  const annulerLaVoix = () => {
    enregistrement.current?.abandonner();
    enregistrement.current = null;
    setEnregistre(false);
  };

  const pret = (valeur.trim() !== "" || pieces.length > 0) && !occupe && !prepare;

  if (enregistre) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-bord-fort bg-papier p-3">
        <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-alerte" />
        <p role="status" className="flex-1 font-mono tabular-nums text-encre">
          {dureeLisible(secondes)}
        </p>
        <button type="button" onClick={annulerLaVoix} className="bouton bouton-neutre">
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void terminerDeParler()}
          className="bouton bouton-principal gap-1.5"
        >
          <Square aria-hidden="true" className="size-3.5" />
          Terminer
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-bord-fort bg-papier p-2 transition focus-within:border-encre">
      <Jointes pieces={pieces} surRetirer={surRetirerPiece} />

      <div className="flex items-end gap-1">
        {/* `capture` ouvre l'appareil photo directement sur un téléphone, et
            laisse le choix du fichier sur un ordinateur. Pas de `getUserMedia` :
            l'appareil natif cadre mieux, met au point, et ne demande aucune
            autorisation à garder. */}
        <input
          ref={fichier}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(evenement) => void prendreLaPhoto(evenement.target.files?.[0])}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fichier.current?.click()}
          disabled={prepare}
          aria-label="Prendre une photo"
          title="Prendre une photo"
          className="rounded-xl p-2 text-encre-doux transition hover:bg-survol hover:text-encre"
        >
          <Camera aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => void commencerAParler()}
          disabled={prepare}
          aria-label="Enregistrer un message vocal"
          title="Enregistrer un message vocal"
          className="rounded-xl p-2 text-encre-doux transition hover:bg-survol hover:text-encre"
        >
          <Mic aria-hidden="true" className="size-5" />
        </button>

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
          placeholder={prepare ? "Préparation…" : "Posez votre question…"}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-[0.975rem] leading-relaxed text-encre outline-none placeholder:text-encre-doux"
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
    </div>
  );
}
