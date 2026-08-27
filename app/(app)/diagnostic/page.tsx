"use client";

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { useState } from "react";
import { configurationPresente, db } from "@/lib/firebase/client";
import { formaterDateHeure } from "@/lib/domain/format";
import { prochainNumero } from "@/lib/numerotation/compteur";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";

type Essai = { id: string; ecritA: Date; etat: "en_attente" | "confirme" | "refuse"; motif?: string };

/**
 * Vérification de la synchronisation.
 *
 * Écrit un document sans importance et montre le trajet complet : accepté
 * localement tout de suite, confirmé par le serveur plus tard. C’est la preuve
 * exécutable de la contrainte n°1 du cahier des charges (§3.4), et l’écran vers
 * lequel envoyer un gérant qui demande « est-ce que c’est parti ? ».
 *
 * Il reste après le socle : c’est un outil d’assistance, pas un échafaudage.
 */
export default function Diagnostic() {
  const { etat, enLigne, enAttente } = useEtatReseau();
  const [essais, setEssais] = useState<Essai[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ecrireUnEssai() {
    setErreur(null);
    const reference = doc(db(), "diagnostics", crypto.randomUUID());
    const essai: Essai = { id: reference.id, ecritA: new Date(), etat: "en_attente" };
    setEssais((liste) => [essai, ...liste]);

    const marquer = (etat: Essai["etat"], motif?: string) =>
      setEssais((liste) => liste.map((e) => (e.id === essai.id ? { ...e, etat, motif } : e)));

    try {
      /* La promesse d’écriture ne se résout qu’à l’accusé de réception du
         serveur. Hors ligne elle reste en suspens, et c’est précisément ce que
         `suivreEcriture` compte pour le bandeau. */
      await suivreEcriture(
        setDoc(reference, { ecritA: serverTimestamp(), origine: "diagnostic" }),
      );
      marquer("confirme");
    } catch (cause) {
      marquer("refuse", cause instanceof Error ? cause.message : "cause inconnue");
    }
  }

  if (!configurationPresente) {
    return (
      <section className="max-w-prose">
        <h1 className="text-2xl font-semibold tracking-tight text-encre">Synchronisation</h1>
        <p className="mt-4 flex gap-3 rounded-plaque border border-bord bg-papier p-4 text-encre">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-alerte" />
          <span>
            Firebase n’est pas configuré sur cet appareil. Copiez <code className="font-code">.env.example</code>{" "}
            vers <code className="font-code">.env.local</code>, puis lancez les émulateurs avec{" "}
            <code className="font-code">npm run emulators</code>.
          </span>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Synchronisation</h1>
      <p className="mt-2 max-w-prose text-encre-doux">
        Cet écran écrit un document sans importance pour montrer le trajet d’une saisie. Coupez le
        réseau&nbsp;: l’écriture est acceptée tout de suite et part d’elle-même au retour.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-plaque border border-bord bg-bord">
        <div className="bg-papier p-4">
          <dt className="text-sm text-encre-doux">Réseau</dt>
          <dd className="mt-1 font-medium text-encre">{enLigne ? "En ligne" : "Hors ligne"}</dd>
        </div>
        <div className="bg-papier p-4">
          <dt className="text-sm text-encre-doux">En attente d’envoi</dt>
          <dd className="mt-1 font-medium text-encre">
            {enAttente} {enAttente === 1 ? "saisie" : "saisies"}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={ecrireUnEssai}
        className="mt-4 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe hover:brightness-95"
      >
        Écrire un test de synchronisation
      </button>

      {erreur && <p className="mt-3 text-sm text-alerte">{erreur}</p>}

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Tests de cette session
      </h2>
      {essais.length === 0 ? (
        <p className="mt-3 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Aucun test pour l’instant. Le bouton ci-dessus en écrit un.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          {essais.map((essai) => (
            <li key={essai.id} className="flex items-center gap-3 px-4 py-3">
              {essai.etat === "confirme" ? (
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-solde" />
              ) : essai.etat === "refuse" ? (
                <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-alerte" />
              ) : (
                <CircleDashed aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-encre">
                  {essai.etat === "confirme"
                    ? "Confirmé par le serveur"
                    : essai.etat === "refuse"
                      ? "Refusé"
                      : "Enregistré ici, en attente d’envoi"}
                </span>
                <span className="plaque-code block text-xs text-encre-doux">
                  {formaterDateHeure(essai.ecritA)}
                  {essai.motif ? ` · ${essai.motif}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Numerotation />

      <p className="mt-6 max-w-prose text-sm text-encre-doux">
        État global&nbsp;:{" "}
        {etat === "a_jour"
          ? "tout est parti."
          : etat === "envoi"
            ? "envoi en cours."
            : "hors ligne, les saisies attendent le réseau."}
      </p>
    </section>
  );
}

/**
 * Le prochain numéro que cet appareil donnera.
 *
 * Affiché ici parce que c’est une question d’appareil, pas de compte : deux
 * téléphones du même comptoir n’en sont pas au même endroit, et c’est
 * précisément ce qui rend les doublons possibles (`DECISIONS.md` D5). Montrer
 * le numéro sans le consommer évite d’ouvrir un trou dans la série.
 */
function Numerotation() {
  const { chargement, perimetre } = usePerimetre();

  if (chargement) {
    return (
      <section className="mt-8">
        <TitreNumerotation />
        <p className="mt-3 rounded-plaque border border-bord bg-papier p-4 text-encre-doux">
          Chargement des boutiques…
        </p>
      </section>
    );
  }

  if (perimetre.type !== "boutique") {
    return (
      <section className="mt-8">
        <TitreNumerotation />
        <p className="mt-3 max-w-prose rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          {perimetre.type === "toutes"
            ? "Un numéro appartient à une boutique. Choisissez-en une dans le bandeau pour voir le prochain numéro de cet appareil."
            : "Aucune boutique attribuée à ce compte : il n’y a pas de numéro à donner."}
        </p>
      </section>
    );
  }

  /* La liste des numéros déjà connus viendra du cache Firestore quand les
     ventes existeront (S8). D’ici là, seul le compteur de l’appareil parle —
     et c’est déjà lui qui garantit que deux saisies d’affilée hors ligne ne
     portent pas le même numéro. */
  const numero = prochainNumero(
    { boutiqueId: perimetre.boutiqueId ?? perimetre.code, code: perimetre.code },
    [],
  );

  return (
    <section className="mt-8">
      <TitreNumerotation />
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-plaque border border-bord bg-papier p-4">
        <span className="text-sm text-encre-doux">{perimetre.nom}</span>
        <span data-test="prochain-numero" className="plaque-code text-lg font-semibold text-encre">
          {numero}
        </span>
      </p>
      <p className="mt-3 max-w-prose text-sm text-encre-doux">
        Ce numéro se calcule sur l’appareil&nbsp;: il est disponible sans réseau, et c’est ce qui
        permet de remettre un reçu au comptoir pendant une coupure. Si un autre appareil de la même
        boutique attribue le même numéro pendant ce temps, le serveur le corrigera à la
        synchronisation et l’application le signalera.
      </p>
    </section>
  );
}

function TitreNumerotation() {
  return (
    <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
      Prochain numéro de cet appareil
    </h2>
  );
}
