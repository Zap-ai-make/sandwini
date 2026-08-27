"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth/session";
import {
  LONGUEUR_ADRESSE_MAX,
  LONGUEUR_NOM_MAX,
  LONGUEUR_NOTE_MAX,
  LONGUEUR_TELEPHONE_MAX,
  SAISIE_CLIENT_VIDE,
  telephoneDejaPris,
  validerClient,
  type Client,
  type SaisieClient,
} from "@/lib/domain/client";
import { creerClient, messageErreurClient, modifierClient } from "@/lib/repositories/clients";

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
}: {
  /** Le fichier, pour reconnaître un numéro déjà connu. */
  clients: Client[];
  /** Absent : on crée. Présent : on corrige. */
  existant?: Client;
  surEnregistrement?: (id: string, saisie: SaisieClient) => void;
  surAnnulation?: () => void;
}) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieClient>(
    existant
      ? {
          nom: existant.nom,
          telephone: existant.telephone,
          telephone2: existant.telephone2,
          adresse: existant.adresse,
          note: existant.note,
        }
      : SAISIE_CLIENT_VIDE,
  );
  const [erreur, setErreur] = useState<string | null>(null);

  const changer = (partie: Partial<SaisieClient>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;

    const probleme = validerClient(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    const doublon = telephoneDejaPris(saisie.telephone, clients, existant?.id);
    if (doublon) {
      setErreur(`Ce numéro est déjà celui de ${doublon.nom}.`);
      return;
    }

    setErreur(null);
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

  return (
    <form onSubmit={soumettre} noValidate>
      <div className="space-y-4">
        <Champ
          id={`${prefixe}-nom`}
          libelle="Nom"
          valeur={saisie.nom}
          maximum={LONGUEUR_NOM_MAX}
          changer={(nom) => changer({ nom })}
        />
        <Champ
          id={`${prefixe}-telephone`}
          libelle="Téléphone"
          type="tel"
          valeur={saisie.telephone}
          maximum={LONGUEUR_TELEPHONE_MAX}
          changer={(telephone) => changer({ telephone })}
          aide="Huit chiffres suffisent. L’indicatif est ajouté tout seul."
        />
        <Champ
          id={`${prefixe}-telephone2`}
          libelle="Second téléphone"
          type="tel"
          facultatif
          valeur={saisie.telephone2}
          maximum={LONGUEUR_TELEPHONE_MAX}
          changer={(telephone2) => changer({ telephone2 })}
        />
        <Champ
          id={`${prefixe}-adresse`}
          libelle="Adresse"
          facultatif
          valeur={saisie.adresse}
          maximum={LONGUEUR_ADRESSE_MAX}
          changer={(adresse) => changer({ adresse })}
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
            className="mt-1.5 w-full rounded-plaque border border-bord bg-papier px-3 py-2 text-encre"
          />
        </div>
      </div>

      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-alerte">
        {erreur ?? ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          className="inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          {existant ? "Enregistrer" : "Créer le client"}
        </button>
        {surAnnulation && (
          <button
            type="button"
            onClick={surAnnulation}
            className="inline-flex h-12 items-center rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-fond"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function Champ({
  id,
  libelle,
  valeur,
  maximum,
  changer,
  type = "text",
  facultatif = false,
  aide,
}: {
  id: string;
  libelle: string;
  valeur: string;
  maximum: number;
  changer: (valeur: string) => void;
  type?: string;
  facultatif?: boolean;
  aide?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-encre">
        {libelle}
        {facultatif && <span className="font-normal text-encre-doux"> (facultatif)</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        value={valeur}
        maxLength={maximum}
        onChange={(evenement) => changer(evenement.target.value)}
        className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
      />
      {aide && <p className="mt-1 text-sm text-encre-doux">{aide}</p>}
    </div>
  );
}
