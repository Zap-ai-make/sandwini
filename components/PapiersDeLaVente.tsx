"use client";

import { CloudUpload, ExternalLink, LoaderCircle, WifiOff } from "lucide-react";
import { useState } from "react";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { TitrePanneau } from "@/components/patrons/PanneauLateral";
import { useSession } from "@/lib/auth/session";
import {
  LIBELLE_PAPIER,
  normaliserPlaque,
  PLAQUE_LONGUEUR_MAX,
  validerFichierPapier,
  type Moto,
} from "@/lib/domain/moto";
import type { PapiersEmportes, Vente } from "@/lib/domain/vente";
import { lireUrlPapier, messageErreurMoto, poserPlaque } from "@/lib/repositories/motos";
import { envoyerScanCarteGrise, marquerEmporte } from "@/lib/repositories/ventes";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";

/** Les deux papiers qui peuvent partir avec le client. La carte grise, jamais. */
const EMPORTABLES = ["quittance", "cmc"] as const;
type Emportable = (typeof EMPORTABLES)[number];

/**
 * Ce que le client a emporté, le scan de la carte grise, et la plaque (S53).
 *
 * **Le seul geste de comptoir qui reste pour la quittance et le CMC.** Leur
 * disponibilité se coche sur la moto, souvent des semaines avant la vente ; le
 * dossier n'a plus d'étape à promener. Ce qui se décide ici, c'est si le client
 * est parti avec.
 *
 * **La carte grise n'a pas de case d'emport**, et c'est une règle du métier, pas
 * un oubli : « la carte grise n'est jamais disponible à l'achat ». Elle est
 * encore chez le prestataire le jour de la vente. Lui faire une case serait
 * promettre un geste que personne ne peut faire.
 */
export function PapiersDeLaVente({ vente, moto }: { vente: Vente; moto: Moto | null }) {
  return (
    <section>
      <TitrePanneau>Les papiers du client</TitrePanneau>
      <ul className="divide-y divide-bord">
        {EMPORTABLES.map((papier) => (
          <li key={papier} className="py-3">
            <CaseEmporte vente={vente} moto={moto} papier={papier} />
          </li>
        ))}
      </ul>

      <ScanCarteGrise vente={vente} moto={moto} />
      <ChampPlaque moto={moto} />
    </section>
  );
}

/**
 * Une case « emporté », fermée tant que la moto ne porte pas le papier.
 *
 * **On ne remet pas ce qu'on n'a pas.** Les règles Firestore ne peuvent pas
 * tenir cette condition : elles ne savent pas joindre la moto, et recopier
 * l'état de la moto sur la vente serait rouvrir la contradiction que S53 ferme.
 * C'est donc l'écran qui la tient — et la phrase dit pourquoi la case est
 * fermée, sinon elle passe pour une panne.
 */
function CaseEmporte({
  vente,
  moto,
  papier,
}: {
  vente: Vente;
  moto: Moto | null;
  papier: Emportable;
}) {
  const session = useSession();
  const [erreur, setErreur] = useState<string | null>(null);

  const enMain = papier === "quittance" ? (moto?.quittanceRecue ?? false) : (moto?.cmcRecu ?? false);
  const emporte = (vente.emporte as PapiersEmportes)[papier];
  const nom = LIBELLE_PAPIER[papier];
  const accord = papier === "quittance" ? "emportée" : "emporté";

  /* Décocher reste possible sur un papier déjà emporté : c'est la correction
     d'une erreur de saisie, et elle doit rester faisable même si le papier a
     entre-temps quitté le tiroir. */
  const ferme = session.statut !== "connecte" || (!enMain && !emporte);

  function basculer(valeur: boolean) {
    if (session.statut !== "connecte") return;
    setErreur(null);
    const { enregistre } = marquerEmporte(vente.id, papier, valeur, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    enregistre.catch((cause) => setErreur(messageErreurMoto(cause)));
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label
          className={`inline-flex items-center gap-2.5 ${ferme ? "text-encre-doux" : "cursor-pointer text-encre"}`}
        >
          <input
            type="checkbox"
            checked={emporte}
            disabled={ferme}
            onChange={(evenement) => basculer(evenement.target.checked)}
            className="size-4 accent-[var(--color-solde)]"
          />
          {`${nom} ${accord}`}
        </label>
        <span
          className={
            emporte
              ? "pastille pastille-solde"
              : enMain
                ? "pastille pastille-transit"
                : "pastille"
          }
        >
          {emporte ? "Emporté par le client" : enMain ? "Au magasin" : "À faire"}
        </span>
      </div>

      {!enMain && !emporte && (
        <p className="mt-1 text-legende text-encre-doux">
          {`La moto ne porte pas encore ${papier === "quittance" ? "sa quittance" : "son CMC"}. Cochez-${papier === "quittance" ? "la" : "le"} sur la fiche de la moto.`}
        </p>
      )}

      <EtatErreurSaisie message={erreur} />
    </>
  );
}

/**
 * Le scan de la carte grise, déposé au retour du prestataire.
 *
 * **Le seul geste de cet écran qui exige du réseau.** Firebase Storage n'a pas
 * de file d'attente hors ligne, contrairement à Firestore : un envoi sans
 * réseau échoue, il ne se met pas en attente. L'écran le dit **avant** le geste
 * plutôt que de laisser croire à une file qui n'existe pas — c'est la condition
 * à laquelle D66 a levé l'interdiction d'ajouter des champs d'envoi.
 */
function ScanCarteGrise({ vente, moto }: { vente: Vente; moto: Moto | null }) {
  const session = useSession();
  const { enLigne } = useEtatReseau();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const chemin = vente.carteGriseChemin;

  async function envoyer(fichier: File) {
    if (session.statut !== "connecte" || !moto) return;
    setErreur(null);
    const probleme = validerFichierPapier(fichier);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setEnvoi(true);
    try {
      await envoyerScanCarteGrise(vente.id, moto.id, fichier, {
        uid: session.utilisateur.uid,
        nom: session.utilisateur.nom,
      });
    } catch (cause) {
      setErreur(messageErreurMoto(cause));
    } finally {
      setEnvoi(false);
    }
  }

  async function ouvrir() {
    if (!chemin) return;
    setErreur(null);
    try {
      window.open(await lireUrlPapier(chemin), "_blank", "noopener");
    } catch {
      setErreur("Le fichier n’a pas pu être ouvert. Il faut du réseau pour le lire.");
    }
  }

  return (
    <div className="mt-4 border-t border-bord pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-encre">Scan de la carte grise</span>

        {chemin ? (
          <button type="button" onClick={ouvrir} className="bouton bouton-discret">
            <ExternalLink aria-hidden="true" className="size-4" />
            Ouvrir
          </button>
        ) : !enLigne ? (
          /* Dit avant le geste, et non après son échec : un bouton qui accepte
             un fichier puis le perd est pire qu'un bouton absent. */
          <span className="inline-flex items-center gap-1.5 text-legende text-encre-doux">
            <WifiOff aria-hidden="true" className="size-4" />
            Il faut du réseau pour envoyer un scan
          </span>
        ) : (
          <label className="bouton bouton-discret cursor-pointer">
            {envoi ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <CloudUpload aria-hidden="true" className="size-4" />
            )}
            {envoi ? "Envoi…" : "Envoyer le scan"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              disabled={envoi || moto === null}
              onChange={(evenement) => {
                const fichier = evenement.target.files?.[0];
                evenement.target.value = "";
                if (fichier) void envoyer(fichier);
              }}
            />
          </label>
        )}
      </div>

      <EtatErreurSaisie message={erreur} />
    </div>
  );
}

/**
 * Le numéro de plaque, saisi au retour de la carte grise.
 *
 * **Il écrit sur la MOTO, pas sur la vente** : une plaque appartient à l'engin,
 * elle lui survit à une revente, et l'inventaire la relit sans rouvrir un
 * dossier. La saisie est ici parce que c'est là que se trouve le gérant au
 * moment du retour — le lieu du geste et le lieu de la donnée ne sont pas
 * forcément le même.
 */
function ChampPlaque({ moto }: { moto: Moto | null }) {
  const session = useSession();
  const [saisie, setSaisie] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /* `null` veut dire « on n'a pas encore touché au champ » : il affiche alors ce
     que la moto porte, et suit les écritures venues d'un autre appareil. Dès la
     première frappe, la saisie en cours prend le dessus (D82). */
  const valeur = saisie ?? moto?.plaque ?? "";
  const propre = normaliserPlaque(valeur);
  const inchangee = propre === (moto?.plaque ?? "");

  function enregistrer() {
    if (session.statut !== "connecte" || !moto) return;
    setErreur(null);
    const { enregistre } = poserPlaque(moto.id, valeur, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    /* La saisie se relâche tout de suite : l'écriture optimiste fait suivre la
       moto, et garder la saisie masquerait une correction venue d'ailleurs. */
    setSaisie(null);
    enregistre.catch((cause) => setErreur(messageErreurMoto(cause)));
  }

  return (
    <div className="mt-4 border-t border-bord pt-4">
      <label htmlFor="plaque-vente" className="block text-sm font-medium text-encre">
        Numéro de plaque
      </label>
      <div className="mt-1 flex flex-wrap items-start gap-2">
        <input
          id="plaque-vente"
          type="text"
          value={valeur}
          maxLength={PLAQUE_LONGUEUR_MAX}
          autoComplete="off"
          placeholder="11 AA 1234"
          disabled={session.statut !== "connecte" || moto === null}
          onChange={(evenement) => setSaisie(evenement.target.value)}
          className="saisie plaque-code w-40"
        />
        <button
          type="button"
          onClick={enregistrer}
          disabled={inchangee || session.statut !== "connecte" || moto === null}
          className="bouton bouton-principal"
        >
          Enregistrer la plaque
        </button>
      </div>
      <p className="mt-1 text-legende text-encre-doux">
        Elle se range sur la moto, et se relit dans l’inventaire.
      </p>

      <EtatErreurSaisie message={erreur} />
    </div>
  );
}
