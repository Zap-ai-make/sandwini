"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Champ } from "@/components/patrons/Champ";
import { useSession } from "@/lib/auth/session";
import {
  optionsAvecChoix,
  trouverParNom,
  validerNom,
  type Referentiel,
} from "@/lib/domain/referentiel";

/**
 * Une liste de choix qui sait accueillir ce qu’elle ne contient pas encore.
 *
 * **Le problème qu’elle règle** (S39). Le formulaire d’entrée en stock faisait
 * choisir la marque dans un `<select>` alimenté par un référentiel que seul le
 * responsable remplissait. Référentiel vide, écran barré : un panneau
 * remplaçait le formulaire et renvoyait vers les réglages. Le gérant à qui il
 * manquait « Apsonic » un samedi matin ne pouvait pas s’en sortir seul — même
 * en trouvant l’écran, les règles lui refusaient l’écriture. Il attendait un
 * appel, une moto devant lui.
 *
 * **Ce qu’on ne veut pas perdre au passage.** Le raisonnement d’origine était
 * juste : sans liste, « la même marque finit écrite de trois façons », et le
 * stock se coupe en autant de morceaux. Un champ libre à suggestions n’empêche
 * rien — il propose, et la deuxième orthographe passe quand même.
 *
 * **Ce qu’on fait à la place.** La liste reste la seule source ; c’est
 * l’endroit où on la remplit qui change. « + Ajouter… » ouvre un champ sur
 * place, sans quitter l’écran ni perdre ce qui est déjà tapé, et le nom saisi
 * est d’abord cherché **sous forme réduite** — sans casse ni accents. S’il
 * existe, on sélectionne l’existant et on le dit, au lieu d’en créer un second.
 * « apsonic » tapé le jour où « Apsonic » existe ne dédouble donc rien.
 *
 * Les désactivées comptent dans cette recherche : retaper un nom, c’est le
 * vouloir, et en créer un double couperait le stock en deux exactement comme
 * l’aurait fait la troisième orthographe.
 */
export function ChoixOuNouveau({
  id,
  libelle,
  singulier,
  determinant,
  valeur,
  changer,
  toutes,
  invite,
  enAttente = false,
  facultatif = false,
  aide,
  creer,
}: {
  id: string;
  libelle: string;
  /** « marque », « modèle », « provenance » — pour les phrases de l’écran. */
  singulier: string;
  /** « cette » ou « ce » : le français a besoin de savoir, comme dans `ListeReferentiel`. */
  determinant: "cette" | "ce";
  valeur: string;
  changer: (valeur: string) => void;
  /**
   * Toutes les entrées connues, actives ou non — ou `null` tant que l'écoute
   * n'a pas répondu. Le filtrage se fait ici.
   *
   * **La nullité n'est pas décorative** (S40). Ce composant ne se contente pas
   * d'afficher la liste : il décide, à l'ajout, si le nom saisi y figure déjà.
   * Tant qu'il ne l'a pas lue, il ne peut pas répondre — et un `?? []` chez
   * l'appelant lui ferait répondre « libre » sur du vide fabriqué (D95). Il
   * retire donc « + Ajouter… » de la liste jusqu'à ce qu'il sache.
   */
  toutes: Referentiel[] | null;
  invite: string;
  /**
   * Ce champ dépend d'un autre, pas encore renseigné (la marque, pour un
   * modèle). Il n'y a donc rien à proposer — mais **le champ n'est pas
   * désactivé pour autant** (S44).
   *
   * Il l'était, et le `disabled:opacity-60` le faisait lire comme verrouillé :
   * on croyait le modèle interdit alors qu'il était simplement en attente. Un
   * champ grisé ne dit pas *pourquoi*, et `DESIGN.md` §10 demande que l'état
   * désactivé se justifie **avant** le geste, pas après l'échec. L'invite
   * porte donc la raison, le champ garde l'aspect et le focus de son voisin,
   * et seule « + Ajouter… » se retire — on ne peut pas créer un modèle sans
   * savoir chez quelle marque le ranger.
   */
  enAttente?: boolean;
  /**
   * Marque le champ comme facultatif, comme le fait `Champ` ailleurs.
   *
   * Posé sur la branche « choisir » uniquement : quand on bascule en création,
   * le nom qu'on tape est, lui, bien requis — écrire « (facultatif) » au-dessus
   * d'un champ dont la validation refuse le vide serait un mensonge d'écran.
   */
  facultatif?: boolean;
  aide?: string;
  /**
   * Écrit la nouvelle entrée et rend son identifiant **tout de suite**, sans
   * attendre le serveur : hors ligne la promesse ne se résout jamais, et la
   * marque doit être sélectionnable dans la seconde.
   */
  creer: (nom: string, auteur: { uid: string; nom: string }) => {
    id: string;
    enregistre: Promise<void>;
  };
}) {
  const session = useSession();
  const [saisieOuverte, setSaisieOuverte] = useState(false);
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  /* Le champ prend la main dès qu’il s’ouvre : sans cela, le geste demande un
     second appui pour commencer à taper — sur un téléphone, au comptoir, c’est
     la moitié du bénéfice qui part. */
  useEffect(() => {
    if (saisieOuverte) champ.current?.focus();
  }, [saisieOuverte]);

  /* Pour l'affichage, « pas encore lu » et « vide » donnent le même menu : un
     `?? []` est ici sans conséquence, et c'est la frontière exacte que D95
     trace — aplatir pour lire, jamais pour décider. */
  const options = optionsAvecChoix(toutes ?? [], valeur);
  const nouveau = determinant === "cette" ? "Nouvelle" : "Nouveau";
  const un = determinant === "cette" ? "une" : "un";

  function ouvrir() {
    setNom("");
    setErreur(null);
    setNote(null);
    setSaisieOuverte(true);
  }

  function fermer() {
    setSaisieOuverte(false);
    setErreur(null);
  }

  function enregistrer() {
    if (session.statut !== "connecte") return;
    const probleme = validerNom(nom, `${determinant} ${singulier}`);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    /* Ce garde ne devrait pas se déclencher — l'option « + Ajouter… » n'existe
       pas tant que la liste manque — mais il reste : le chemin d'écriture ne
       s'appuie pas sur ce que l'affichage a bien voulu montrer. */
    if (toutes === null) {
      setErreur("La liste n’a pas fini d’arriver. Réessayez dans un instant.");
      return;
    }

    const existante = trouverParNom(nom, toutes);
    if (existante) {
      changer(existante.id);
      setNote(`« ${existante.nom} » existait déjà : c’est ${determinant === "cette" ? "elle" : "lui"} qui est retenu${determinant === "cette" ? "e" : ""}.`);
      fermer();
      return;
    }

    const { id: nouvelle, enregistre } = creer(nom.trim(), {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    enregistre.catch(() =>
      /* L’entrée reste sélectionnée : elle est dans le cache local, et la moto
         qui la cite partira avec. Ce qu’on annonce, c’est que le serveur l’a
         refusée — pas que le geste n’a rien fait. */
      setNote(`« ${nom.trim()} » n’a pas été accepté${determinant === "cette" ? "e" : ""} par le serveur.`),
    );
    changer(nouvelle);
    setNote(`« ${nom.trim()} » ajouté${determinant === "cette" ? "e" : ""} à la liste.`);
    fermer();
  }

  if (saisieOuverte) {
    return (
      <Champ id={`${id}-nouveau`} libelle={`${nouveau} ${singulier}`} erreur={erreur}>
        <div className="flex flex-wrap gap-2">
          <input
            ref={champ}
            id={`${id}-nouveau`}
            value={nom}
            maxLength={60}
            autoComplete="off"
            aria-describedby={erreur ? `${id}-nouveau-erreur` : undefined}
            onChange={(evenement) => setNom(evenement.target.value)}
            /* Entrée valide la nouvelle entrée — et surtout n’envoie pas le
               formulaire qui entoure ce champ, ce qu’elle ferait sinon : la
               moto serait enregistrée sans sa marque. */
            onKeyDown={(evenement) => {
              if (evenement.key === "Enter") {
                evenement.preventDefault();
                enregistrer();
              }
              if (evenement.key === "Escape") fermer();
            }}
            className="saisie h-11 min-w-0 flex-1"
          />
          <button type="button" onClick={enregistrer} className="bouton bouton-principal">
            <Check aria-hidden="true" className="size-4" />
            Ajouter
          </button>
          <button
            type="button"
            onClick={fermer}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-plaque border border-bord text-encre hover:bg-fond"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Annuler l’ajout</span>
          </button>
        </div>
      </Champ>
    );
  }

  return (
    <Champ id={id} libelle={libelle} facultatif={facultatif} aide={note ?? aide}>
      <select
        id={id}
        value={valeur}
        aria-describedby={note || aide ? `${id}-aide` : undefined}
        onChange={(evenement) => {
          if (evenement.target.value === NOUVELLE) {
            ouvrir();
            return;
          }
          setNote(null);
          changer(evenement.target.value);
        }}
        className="saisie"
      >
        {/* L'invite dit l'attente au lieu de proposer un choix qu'on ne peut
            pas encore faire : un menu vide et un menu pas encore lu se
            ressemblent trop pour qu'on laisse le lecteur trancher. */}
        <option value="">{toutes === null ? "Lecture de la liste…" : invite}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.nom}
            {option.actif ? "" : " — hors liste"}
          </option>
        ))}
        {!enAttente && toutes !== null && (
          <option value={NOUVELLE}>
            + Ajouter {un} {singulier}…
          </option>
        )}
      </select>
    </Champ>
  );
}

/* Une valeur qu’aucun identifiant Firestore ne peut porter : ils font vingt
   caractères alphanumériques, sans souligné. */
const NOUVELLE = "__nouvelle__";
