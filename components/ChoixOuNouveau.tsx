"use client";

import { Check, Plus } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Champ } from "@/components/patrons/Champ";
import { useSession } from "@/lib/auth/session";
import {
  suggestionsDeChoix,
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
 * **La liste se tape** (23 novembre 2026) : « ajoute la recherche au niveau de
 * marque et modèle ». Choix du commanditaire, parmi « un champ de recherche
 * au-dessus de la liste » et « une liste qu’on tape » : on tape dans le champ,
 * les noms qui contiennent ce qu’on a tapé s’affichent dessous, on touche le
 * bon (`suggestionsDeChoix`). Ce n’est pas un champ libre pour autant — la
 * valeur reste l’identifiant d’une entrée, et un texte tapé qu’on ne choisit
 * pas est oublié en quittant le champ.
 *
 * **« + Ajouter « … » » vient de ce qu’on a tapé**, et seulement pour un nom
 * qui n’existe pas : l’ancien détour — choisir « + Ajouter… », puis taper dans
 * un second champ — disparaît. Le nom est d’abord cherché **sous forme
 * réduite**, sans casse ni accents, désactivées comprises : « apsonic » tapé le
 * jour où « Apsonic » existe rend l’existante au lieu d’en créer une seconde.
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
   * ne propose donc rien, ni choix ni ajout, jusqu'à ce qu'il sache.
   */
  toutes: Referentiel[] | null;
  invite: string;
  /**
   * Ce champ dépend d'un autre, pas encore renseigné (la marque, pour un
   * modèle). Il n'y a donc rien à proposer — mais **le champ n'est pas
   * désactivé pour autant** (S44) : un champ grisé ne dit pas *pourquoi*.
   * L'invite porte la raison, et la liste reste vide.
   */
  enAttente?: boolean;
  /** Marque le champ comme facultatif, comme le fait `Champ` ailleurs. */
  facultatif?: boolean;
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
  /* `null` tant qu'on ne tape pas : le champ montre alors le nom choisi. */
  const [texte, setTexte] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState(false);
  const [active, setActive] = useState(0);
  /* Un nom refusé à l'ajout, ou le refus du serveur — les seuls messages qui
     restent sous le champ (28 octobre 2026). */
  const [erreur, setErreur] = useState<string | null>(null);

  const choisie = (toutes ?? []).find((entree) => entree.id === valeur) ?? null;
  const affiche = texte ?? choisie?.nom ?? "";

  const { entrees, ajout } =
    enAttente || toutes === null
      ? { entrees: [] as Referentiel[], ajout: null }
      : suggestionsDeChoix(toutes, valeur, texte ?? "");
  const nombre = entrees.length + (ajout ? 1 : 0);
  const rang = Math.min(active, Math.max(nombre - 1, 0));
  const listeId = `${id}-choix`;

  function choisir(identifiant: string) {
    changer(identifiant);
    setTexte(null);
    setOuverte(false);
    setErreur(null);
  }

  function ajouter(nom: string) {
    if (session.statut !== "connecte" || toutes === null) return;
    const probleme = validerNom(nom, `${determinant} ${singulier}`);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    /* Le chemin d'écriture ne s'appuie pas sur ce que l'affichage a bien voulu
       montrer : il recherche lui-même l'existante. */
    const existante = trouverParNom(nom, toutes);
    if (existante) {
      choisir(existante.id);
      return;
    }
    const { id: nouvelle, enregistre } = creer(nom.trim(), {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    choisir(nouvelle);
    enregistre.catch(() =>
      /* L’entrée reste choisie : elle est dans le cache local, et la moto qui
         la cite partira avec. Ce qu’on annonce, c’est le refus du serveur. */
      setErreur(
        `« ${nom.trim()} » n’a pas été accepté${determinant === "cette" ? "e" : ""} par le serveur.`,
      ),
    );
  }

  /** Le geste de la ligne `rang` : choisir une entrée, ou ajouter le nom tapé. */
  function agir(cible: number) {
    if (cible < entrees.length) choisir(entrees[cible].id);
    else if (ajout) ajouter(ajout);
  }

  /* Quitter le champ oublie un texte qu'on n'a pas choisi : la valeur reste
     une entrée de la liste, jamais une saisie libre. Un champ vidé, lui, vide
     le choix — c'est ainsi qu'on retire un modèle facultatif. */
  function quitter() {
    if (texte !== null && texte.trim() === "") changer("");
    setTexte(null);
    setOuverte(false);
  }

  function touche(evenement: KeyboardEvent<HTMLInputElement>) {
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      setOuverte(true);
      setActive(Math.min(rang + 1, Math.max(nombre - 1, 0)));
    } else if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      setActive(Math.max(rang - 1, 0));
    } else if (evenement.key === "Enter") {
      /* Entrée choisit — et surtout n’envoie pas le formulaire qui entoure ce
         champ : la moto partirait sans sa marque. */
      if (ouverte && nombre > 0) {
        evenement.preventDefault();
        agir(rang);
      }
    } else if (evenement.key === "Escape") {
      setTexte(null);
      setOuverte(false);
    }
  }

  const montree = ouverte && nombre > 0;

  return (
    <Champ id={id} libelle={libelle} facultatif={facultatif} erreur={erreur}>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={montree}
          aria-controls={listeId}
          aria-autocomplete="list"
          aria-activedescendant={montree ? `${id}-option-${rang}` : undefined}
          aria-describedby={erreur ? `${id}-erreur` : undefined}
          value={affiche}
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
          placeholder={toutes === null ? "Lecture de la liste…" : invite}
          onFocus={() => setOuverte(true)}
          onBlur={quitter}
          onChange={(evenement) => {
            setTexte(evenement.target.value);
            setOuverte(true);
            setActive(0);
            setErreur(null);
          }}
          onKeyDown={touche}
          className="saisie"
        />

        {montree && (
          <ul
            id={listeId}
            role="listbox"
            /* Pas le libellé seul : le champ et sa liste porteraient le même
               nom, et « Marque » désignerait deux choses. */
            aria-label={`Suggestions — ${libelle}`}
            className="cadre absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto py-1 shadow-lg"
          >
            {entrees.map((entree, index) => (
              <li
                key={entree.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={entree.id === valeur}
                /* `mousedown` et non `click` : sans cela, le champ perd la main
                   avant que le choix ne se fasse, et `quitter` l'efface. */
                onMouseDown={(evenement) => {
                  evenement.preventDefault();
                  choisir(entree.id);
                }}
                className={[
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-corps text-encre",
                  index === rang ? "bg-survol" : "",
                ].join(" ")}
              >
                <span className={entree.id === valeur ? "font-semibold" : undefined}>
                  {entree.nom}
                  {entree.actif ? "" : " — hors liste"}
                </span>
                {entree.id === valeur && <Check aria-hidden="true" className="size-4 shrink-0" />}
              </li>
            ))}
            {ajout && (
              <li
                id={`${id}-option-${entrees.length}`}
                role="option"
                aria-selected={false}
                onMouseDown={(evenement) => {
                  evenement.preventDefault();
                  ajouter(ajout);
                }}
                className={[
                  "flex cursor-pointer items-center gap-2 border-t border-bord px-3 py-2.5 text-corps font-medium text-encre",
                  rang === entrees.length ? "bg-survol" : "",
                ].join(" ")}
              >
                <Plus aria-hidden="true" className="size-4 shrink-0" />
                Ajouter « {ajout} »
              </li>
            )}
          </ul>
        )}
      </div>
    </Champ>
  );
}
