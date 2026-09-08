"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  estEnRetard,
  etapesRelais,
  joursEcoules,
  passeParUnPrestataire,
  type EtapeRelais,
} from "@/lib/domain/dossier";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import {
  LIBELLE_DOCUMENT,
  LIBELLE_STATUT_DOCUMENT,
  type DocumentDossier,
} from "@/lib/domain/vente";
import { GestesDocument } from "@/components/GestesDocument";

/**
 * Le relais d'un document : où en est ce papier, et quel est le geste suivant.
 *
 * `CAHIER-UI.md` §7.3 demande à cet écran de répondre à « qui détient quel
 * papier ». Le tableau y répond pour quarante dossiers d'un coup ; le relais y
 * répond pour celui qu'on traite, en montrant le chemin **entier** — d'où le
 * document vient, où il est, ce qui reste. C'est ce que ni une pastille ni une
 * liste de statuts ne disent : qu'il manque encore deux étapes avant que le
 * client reparte avec sa carte grise.
 *
 * **Il n'y a pas de bouton grisé.** La maquette grise « Remettre au client » et
 * ajoute une phrase pour expliquer ce qu'il attend. Le relais le dit déjà, et
 * mieux : l'étape « Revenu au magasin » est là, en gris, avant celle-là. Un
 * bouton grisé invite à chercher ce qui le débloquerait ; une étape qui reste à
 * franchir dit où le chercher (cf. `GestesDocument`).
 *
 * **Il s'ouvre et se ferme sans changer d'adresse.** À la différence de la fiche
 * d'une vente, qui vit dans un paramètre d'écran parce qu'on veut pouvoir la
 * rouvrir ou la partager (D39), le relais est un geste de travail : on le
 * déplie le temps de faire avancer un papier, et le tableau reste la
 * destination.
 */
export function RelaisDocument({
  document,
  numero,
  dateVente,
  fermer,
}: {
  document: DocumentDossier;
  /** Le numéro de la pièce, celui qui se dicte au téléphone. */
  numero: string;
  /** La date de la vente : c'est elle qui ouvre le dossier, donc le parcours. */
  dateVente: Date | null;
  fermer: () => void;
}) {
  /* Le relais s’ouvre loin du bouton qui l’appelle — sous le tableau sur
     bureau, à la place du tableau sur téléphone. Sans ce déplacement du focus,
     le clavier repartirait du haut de la page et un lecteur d’écran ne dirait
     rien de ce qui vient d’apparaître (`DESIGN.md` §11). Il ne se rejoue que
     lorsqu’on change de document, pas quand celui-ci avance. */
  const titre = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titre.current?.focus();
  }, [document.venteId, document.type]);

  const etapes = etapesRelais(document.type, document.statut);
  const aujourdhui = new Date();
  const enRetard =
    document.statut === "chez_prestataire" && estEnRetard(document.disponibleLe, aujourdhui);
  const joursDeRetard = enRetard ? joursEcoules(document.disponibleLe, aujourdhui) : null;

  return (
    <section aria-labelledby="titre-relais" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2
          ref={titre}
          tabIndex={-1}
          id="titre-relais"
          className="text-bloc font-bold tracking-tight text-encre"
        >
          {LIBELLE_DOCUMENT[document.type]} de <span className="plaque-code">{numero}</span>
        </h2>

        {/* Jamais la couleur seule : le retard est écrit, et chiffré — « en
            retard » ne se traite pas comme « en retard de 17 jours ». */}
        {enRetard && (
          <span className="pastille pastille-retard">
            {joursDeRetard === null
              ? "En retard"
              : `En retard de ${joursDeRetard} ${joursDeRetard > 1 ? "jours" : "jour"}`}
          </span>
        )}

        <button
          type="button"
          onClick={fermer}
          aria-label={`Fermer le suivi de ${LIBELLE_DOCUMENT[document.type].toLowerCase()}`}
          className="bouton bouton-discret ml-auto"
        >
          <X aria-hidden="true" className="size-4" />
          Fermer
        </button>
      </div>

      <div className="cadre p-4">
        {etapes.length === 0 ? (
          <p className="text-corps text-encre">
            Ce document ne concerne pas cette vente : il a été écarté du dossier, et n’a donc pas de
            parcours.
          </p>
        ) : (
          <ol className="relais">
            {etapes.map((etape, rang) => (
              <li key={etape.statut} data-etape={etape.etat}>
                <span className="relais-rang" aria-hidden="true">
                  {rang + 1}
                </span>
                <span className="relais-nom">
                  {LIBELLE_STATUT_DOCUMENT[etape.statut]}
                  {/* Le point coloré ne s'entend pas : l'étape en cours se dit. */}
                  {etape.etat === "cours" && <span className="sr-only"> — étape en cours</span>}
                </span>
                <span className="relais-quand">{legende(etape, document, dateVente)}</span>
              </li>
            ))}
          </ol>
        )}

        <GestesDocument document={document} className="mt-5" />
      </div>
    </section>
  );
}

/**
 * Ce qu'on sait de chaque étape : une date, un nom, ou ce qui reste à venir.
 *
 * Le produit n'enregistre pas de date de retour au magasin — seulement le
 * dépôt, la disponibilité annoncée et la remise. On écrit donc ce qu'on a, et
 * rien d'autre : une date inventée sous une étape franchie serait pire qu'un
 * blanc, parce qu'elle se recopierait dans une discussion avec le client.
 */
function legende(etape: EtapeRelais, document: DocumentDossier, dateVente: Date | null): string {
  const franchie = etape.etat !== "attente";

  switch (etape.statut) {
    case "a_faire":
      return dateVente ? `ouvert le ${formaterDateCourte(dateVente)}` : "ouvert avec la vente";

    case "chez_prestataire": {
      if (!franchie) return "à venir";
      const chez = document.prestataireNom || "un prestataire";
      const depose = document.deposeLe
        ? `, déposé le ${formaterDateCourte(document.deposeLe)}`
        : "";
      const avance = document.avance !== null ? `, avance ${formaterMontant(document.avance)}` : "";
      return `${chez}${depose}${avance}`;
    }

    case "revenu_magasin":
      if (franchie) return "au magasin";
      /* « Aucune date annoncée » n’a de sens que pour un papier confié à
         quelqu’un : la quittance et le CMC arrivent faits, personne ne promet
         de date pour eux, et l’écrire ferait attendre un retour. */
      if (!passeParUnPrestataire(document.type)) return "à venir";
      return document.disponibleLe
        ? `annoncé le ${formaterDateCourte(document.disponibleLe)}`
        : "aucune date annoncée";

    case "remis_client":
      if (!franchie) return "à venir";
      return document.remisLe ? `remis le ${formaterDateCourte(document.remisLe)}` : "remis";

    /* `non_applicable` n'est pas une étape d'un parcours : `etapesRelais` rend
       une liste vide pour un document écarté, et l'écran le dit en une phrase. */
    default:
      return "";
  }
}
