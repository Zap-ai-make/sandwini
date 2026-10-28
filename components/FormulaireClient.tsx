"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth/session";
import {
  LONGUEUR_ADRESSE_MAX,
  LONGUEUR_NOM_MAX,
  LONGUEUR_NOTE_MAX,
  LONGUEUR_TELEPHONE_MAX,
  SAISIE_CLIENT_VIDE,
  formaterTelephone,
  nomComplet,
  telephoneDejaPris,
  validerClient,
  type Client,
  type SaisieClient,
} from "@/lib/domain/client";
import { creerClient, messageErreurClient, modifierClient } from "@/lib/repositories/clients";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";

/**
 * Créer ou corriger un client.
 *
 * Le même formulaire sert les deux : les champs sont identiques, et le seul
 * écart — un numéro déjà pris n'est pas un doublon quand c'est le sien — se
 * dit en une ligne. En écrire deux versions, c'était s'assurer qu'elles
 * divergent.
 *
 * Le contrôle du numéro se fait ici, avant l'envoi : la base ne sait pas
 * imposer l'unicité d'un champ, et un refus qui n'arriverait qu'à la
 * synchronisation arriverait trop tard.
 */
export function FormulaireClient({
  clients,
  existant,
  surEnregistrement,
  surAnnulation,
  surFicheExistante,
}: {
  /**
   * Le fichier, pour reconnaître un numéro déjà connu — ou `null` tant que
   * l'écoute n'a pas répondu, ce qui n'autorise aucun verdict (S40).
   */
  clients: Client[] | null;
  /** Absent : on crée. Présent : on corrige. */
  existant?: Client;
  surEnregistrement?: (id: string, saisie: SaisieClient) => void;
  surAnnulation?: () => void;
  /**
   * Ce qu'on fait de la fiche reconnue quand le numéro ou la pièce est déjà
   * pris. L'écran de vente s'en sert pour adopter le client au lieu d'en créer
   * un second ; là où ce n'est pas proposé, le rapprochement reste un avis.
   */
  surFicheExistante?: (client: Client) => void;
}) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieClient>(
    existant
      ? {
          nom: existant.nom,
          prenom: existant.prenom,
          telephone: existant.telephone,
          telephone2: existant.telephone2,
          adresse: existant.adresse,
          note: existant.note,
        }
      : SAISIE_CLIENT_VIDE,
  );
  const [erreur, setErreur] = useState<string | null>(null);
  /* La fiche qu'on a reconnue, gardée à part de l'erreur : on ne se contente
     plus de refuser, on la propose. */
  const [rapproche, setRapproche] = useState<Client | null>(null);

  const changer = (partie: Partial<SaisieClient>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;

    const probleme = validerClient(saisie);
    if (probleme) {
      setErreur(probleme);
      setRapproche(null);
      return;
    }

    /* Un fichier pas encore lu n'est pas un fichier vide. Sans ce garde, le
       contrôle répond « numéro libre » sur une liste qu'il n'a pas lue, et la
       même personne existe deux fois — avec ses dettes d'un côté et ses
       versements de l'autre (D95). */
    if (clients === null) {
      setErreur("Le fichier clients n’a pas fini d’arriver. Réessayez dans un instant.");
      setRapproche(null);
      return;
    }

    /* **Une seule clé de rapprochement depuis le 26 octobre 2026** : le
       téléphone. Le numéro de pièce passait devant — un téléphone change de
       main, un numéro de pièce non — mais le commanditaire a retiré le champ,
       et un contrôle sur une donnée qu'on ne saisit plus ne rapproche rien.
       Celui-ci propose la fiche trouvée au lieu de refuser sèchement : un mur
       sans panneau apprend surtout à ne plus lire l'écran (D95). */
    const doublon = telephoneDejaPris(saisie.telephone, clients, existant?.id);
    if (doublon) {
      setRapproche(doublon);
      setErreur(null);
      return;
    }

    setErreur(null);
    setRapproche(null);
    const auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };

    if (existant) {
      modifierClient(existant.id, saisie, auteur).catch((cause) =>
        setErreur(messageErreurClient(cause)),
      );
      surEnregistrement?.(existant.id, saisie);
      return;
    }

    /* L'identifiant existe avant que l'écriture n'aboutisse : c'est ce qui
       permettra à l'écran de vente (S8) de rattacher la vente au client créé à
       l'instant, réseau ou pas. */
    const { id, enregistre } = creerClient(saisie, auteur);
    enregistre.catch((cause) => setErreur(messageErreurClient(cause)));
    setSaisie(SAISIE_CLIENT_VIDE);
    surEnregistrement?.(id, saisie);
  }

  const prefixe = existant ? `client-${existant.id}` : "nouveau-client";

  /* La largeur appartient au formulaire, pas au champ : sans cela, un « Nom »
     s'étirait sur toute la zone de travail dès que la borne de `.saisie` a été
     levée. */
  return (
    <form onSubmit={soumettre} className="colonne-formulaire max-w-[40rem]" noValidate>
      <ChampsClient prefixe={prefixe} saisie={saisie} changer={changer} />

      {rapproche && (
        <FicheReconnue
          client={rapproche}
          surUtilisation={surFicheExistante}
          surAbandon={() => setRapproche(null)}
        />
      )}

      <EtatErreurSaisie message={erreur} className="mt-3" />

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={clients === null} className="bouton bouton-principal">
          {clients === null ? "Lecture du fichier…" : existant ? "Enregistrer" : "Créer le client"}
        </button>
        {surAnnulation && (
          <button type="button" onClick={surAnnulation} className="bouton bouton-neutre">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Les champs d'un client, sans formulaire ni bouton autour.
 *
 * **Deux écrans les posent, et pour deux gestes différents.** Le fichier
 * clients les enveloppe dans un `<form>` avec son bouton : là, créer un client
 * *est* le geste. La modale de vente, elle, ne les enveloppe de rien — le
 * client neuf n'y a pas d'étape à lui, il part avec la vente (S44, corrigé
 * après essai du commanditaire).
 *
 * Les extraire n'est pas de l'élégance : c'est ce qui empêche les deux écrans
 * de diverger sur ce qu'on demande d'une personne. Et c'est ce qui permet à la
 * modale de n'avoir **aucun `<form>` imbriqué**, ce que son commentaire de tête
 * promettait déjà sans pouvoir le tenir.
 */
export function ChampsClient({
  prefixe,
  saisie,
  changer,
}: {
  prefixe: string;
  saisie: SaisieClient;
  changer: (partie: Partial<SaisieClient>) => void;
}) {
  /**
   * **Plus rien n'est replié** (27 octobre 2026, demande du commanditaire) :
   * « second numéro reste ouvert par défaut, ainsi que note ».
   *
   * Le repli datait du jour où la fiche portait cinq champs dont trois ne
   * servaient qu'une fois sur dix. Il en reste quatre depuis que le numéro de
   * pièce est parti, et le bouton coûtait désormais plus qu'il ne faisait
   * gagner : un geste pour atteindre un champ qu'on remplit souvent.
   */

  return (
    <>
      <div className="space-y-4">
        {/* Le nom et le prénom côte à côte : ce sont deux moitiés d'une même
            information, et les empiler ferait lire deux questions là où il n'y
            en a qu'une. C'est la seule paire de l'écran — partout ailleurs,
            un champ par ligne (`CAHIER-UI.md` §8.3). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampClient
            id={`${prefixe}-nom`}
            libelle="Nom"
            valeur={saisie.nom}
            maximum={LONGUEUR_NOM_MAX}
            changer={(nom) => changer({ nom })}
          />
          <ChampClient
            id={`${prefixe}-prenom`}
            libelle="Prénom"
            facultatif
            valeur={saisie.prenom}
            maximum={LONGUEUR_NOM_MAX}
            changer={(prenom) => changer({ prenom })}
          />
        </div>
        {/* **Le téléphone et l'adresse côte à côte, comme le nom et le
            prénom** (27 octobre 2026) : « divise le champ téléphone comme nom
            et prénom et mets l'adresse pour le second champ ». Les deux
            répondent à la même question — où joindre cette personne — et
            l'adresse remontait du repli, où elle se faisait oublier. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampClient
            id={`${prefixe}-telephone`}
            libelle="Téléphone"
            type="tel"
            valeur={saisie.telephone}
            maximum={LONGUEUR_TELEPHONE_MAX}
            changer={(telephone) => changer({ telephone })}
          />
          <ChampClient
            id={`${prefixe}-adresse`}
            libelle="Adresse"
            facultatif
            valeur={saisie.adresse}
            maximum={LONGUEUR_ADRESSE_MAX}
            changer={(adresse) => changer({ adresse })}
          />
        </div>

        <div className="space-y-4">
          <ChampClient
            id={`${prefixe}-telephone2`}
            libelle="Second téléphone"
            type="tel"
            facultatif
            valeur={saisie.telephone2}
            maximum={LONGUEUR_TELEPHONE_MAX}
            changer={(telephone2) => changer({ telephone2 })}
          />
          <div>
            <label htmlFor={`${prefixe}-note`} className="block text-sm font-medium text-encre">
              Note <span className="font-normal text-encre-doux">(facultatif)</span>
            </label>
            <textarea
              id={`${prefixe}-note`}
              rows={2}
              value={saisie.note}
              maxLength={LONGUEUR_NOTE_MAX}
              onChange={(evenement) => changer({ note: evenement.target.value })}
              className="saisie mt-1.5"
            />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * La fiche qu'on a reconnue avant de créer un doublon.
 *
 * **Proposer vaut mieux que refuser.** Le contrôle disait « ce numéro est déjà
 * celui de X » et s'arrêtait là : la personne se retrouvait devant un mur, sans
 * geste pour en sortir, et le réflexe était de changer un chiffre pour passer —
 * ce qui fabrique exactement le doublon qu'on voulait empêcher. Ici la fiche
 * est nommée, et le geste qui l'adopte est à côté d'elle.
 */
export function FicheReconnue({
  client,
  surUtilisation,
  surAbandon,
}: {
  client: Client;
  surUtilisation?: (client: Client) => void;
  surAbandon: () => void;
}) {
  return (
    <div
      role="status"
      className="mt-3 rounded-champ border-l-[3px] border-l-goutte bg-goutte-surface p-3"
    >
      <p className="text-encre">
        <strong className="font-semibold">Cette personne est déjà dans le fichier.</strong>{" "}
        {nomComplet(client)} — {formaterTelephone(client.telephone)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {surUtilisation && (
          <button
            type="button"
            onClick={() => surUtilisation(client)}
            className="bouton bouton-principal"
          >
            Utiliser cette fiche
          </button>
        )}
        <button type="button" onClick={surAbandon} className="bouton bouton-neutre">
          Corriger ma saisie
        </button>
      </div>
    </div>
  );
}

/**
 * Le champ de ce formulaire : l'enveloppe vient du patron, la saisie reste ici.
 *
 * Ce qui justifie qu'il subsiste, c'est `maximum` et le `inputMode` déduit du
 * type — deux détails propres au fichier clients, qui n'ont rien à faire dans
 * un patron partagé.
 */
function ChampClient({
  id,
  libelle,
  valeur,
  maximum,
  changer,
  type = "text",
  facultatif = false,
}: {
  id: string;
  libelle: string;
  valeur: string;
  maximum: number;
  changer: (valeur: string) => void;
  type?: string;
  facultatif?: boolean;
}) {
  return (
    <Champ id={id} libelle={libelle} facultatif={facultatif}>
      <input
        id={id}
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        value={valeur}
        maxLength={maximum}
        onChange={(evenement) => changer(evenement.target.value)}
        className="saisie"
      />
    </Champ>
  );
}
