"use client";

import { useCallback, useState } from "react";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { useSession } from "@/lib/auth/session";
import { formaterMontant } from "@/lib/domain/format";
import type { Prestataire } from "@/lib/domain/prestataire";
import { validerPaquet, type SaisiePaquet } from "@/lib/domain/paquet";
import { LIBELLE_MOYEN, MOYENS_PAIEMENT, type DocumentDossier } from "@/lib/domain/vente";
import { messageErreurDossier } from "@/lib/repositories/dossier";
import { confierPaquet } from "@/lib/repositories/paquets";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";

/** Aujourd'hui au format d'un `<input type="date">`, sur l'horloge de l'appareil. */
function jourLocal(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Confier plusieurs cartes grises d'un coup (S53, arbitrages 2 et 6).
 *
 * **Le formulaire du dépôt unitaire, moins le document et plus le nombre.** Un
 * prestataire, une date, une avance, une date annoncée facultative — et la
 * liste de ce qui part, affichée pour qu'on la relise avant de valider : dix
 * cartes confiées à la mauvaise personne ne se rattrapent qu'en allant la voir.
 *
 * **L'avance est celle du paquet, pas celle d'une carte.** On tape ce qu'on
 * verse, une fois, parce que c'est un seul billet qui change de main. Le dépôt
 * la répartit ensuite sur les documents pour que la somme des dossiers retombe
 * sur la sortie de caisse ; l'écran, lui, ne demande qu'un chiffre.
 *
 * **On attend le serveur ici, et c'est l'exception.** Partout ailleurs le
 * produit rend la main tout de suite (D76). Mais un lot de `2N + 2` écritures
 * refusé en bloc ne laisse rien derrière lui : fermer la modale avant la
 * réponse afficherait dix cartes parties qui ne seraient jamais parties, et le
 * gérant les croirait chez le prestataire. Le bouton dit « Envoi… » le temps
 * que ça tranche.
 */
export function ConfierPaquetModal({
  cartes,
  boutiqueId,
  numeroDe,
  onFermer,
  onConfie,
}: {
  cartes: readonly DocumentDossier[];
  boutiqueId: string;
  numeroDe: (venteId: string) => string;
  onFermer: () => void;
  onConfie: () => void;
}) {
  const session = useSession();

  const souscrire = useCallback(
    (auChangement: (prestataires: Prestataire[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterPrestataires(auChangement, enErreur),
    [],
  );
  const { valeur: prestataires } = useAbonnement(
    souscrire,
    "La liste des prestataires n’a pas pu être lue.",
  );

  const [saisie, setSaisie] = useState<SaisiePaquet>({
    prestataireId: "",
    prestataireNom: "",
    deposeLe: jourLocal(new Date()),
    avance: "",
    moyenPaiement: "especes",
    disponibleLe: "",
    venteIds: cartes.map((carte) => carte.venteId),
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  /* Seuls les prestataires actifs qui traitent la carte grise : proposer les
     autres, c'est proposer une erreur que la base refusera. */
  const candidats = (prestataires ?? []).filter(
    (prestataire) => prestataire.actif && prestataire.typesDocuments.includes("carte_grise"),
  );

  function changer(partie: Partial<SaisiePaquet>) {
    setSaisie((ancienne) => ({ ...ancienne, ...partie }));
    setErreur(null);
  }

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || envoi) return;

    /* Validé ici avant de partir : le même refus vu côté serveur arriverait
       après que le lot a été monté, et son message parlerait de règles. */
    const probleme = validerPaquet(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    setEnvoi(true);
    try {
      await confierPaquet(saisie, cartes, boutiqueId, {
        uid: session.utilisateur.uid,
        nom: session.utilisateur.nom,
      });
      onConfie();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : messageErreurDossier(cause));
      setEnvoi(false);
    }
  }

  const montant = Number(saisie.avance.replace(/\s/g, ""));
  const part = Number.isFinite(montant) && montant > 0 ? Math.floor(montant / cartes.length) : null;

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre={`Confier ${cartes.length} cartes grises`}
      description="Un prestataire, une date, une avance. L’avance sort de la caisse en une seule fois."
    >
      {prestataires === null ? (
        <p className="text-corps text-encre-doux">Lecture des prestataires…</p>
      ) : candidats.length === 0 ? (
        <p className="text-corps text-encre">
          Aucun prestataire ne traite les cartes grises. Déclarez-en un dans Paramètres, puis
          revenez.
        </p>
      ) : (
        <form onSubmit={soumettre} className="space-y-4">
          <Champ id="paq-prestataire" libelle="Prestataire">
            <select
              id="paq-prestataire"
              value={saisie.prestataireId}
              onChange={(evenement) => {
                const choisi = candidats.find((c) => c.id === evenement.target.value);
                changer({
                  prestataireId: choisi?.id ?? "",
                  prestataireNom: choisi?.nom ?? "",
                });
              }}
              className="saisie"
            >
              <option value="">Choisissez…</option>
              {candidats.map((prestataire) => (
                <option key={prestataire.id} value={prestataire.id}>
                  {prestataire.nom}
                </option>
              ))}
            </select>
          </Champ>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ id="paq-depose" libelle="Date du dépôt">
              <input
                id="paq-depose"
                type="date"
                value={saisie.deposeLe}
                onChange={(evenement) => changer({ deposeLe: evenement.target.value })}
                className="saisie"
              />
            </Champ>

            <Champ id="paq-dispo" libelle="Annoncé pour le" facultatif>
              <input
                id="paq-dispo"
                type="date"
                value={saisie.disponibleLe}
                onChange={(evenement) => changer({ disponibleLe: evenement.target.value })}
                className="saisie"
              />
            </Champ>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              id="paq-avance"
              libelle="Avance versée"
              aide={
                part !== null
                  ? `Soit ${formaterMontant(part)} par carte, répartis sur les ${cartes.length} dossiers.`
                  : "Le total pour le paquet entier, en francs entiers."
              }
            >
              <input
                id="paq-avance"
                inputMode="numeric"
                value={saisie.avance}
                onChange={(evenement) => changer({ avance: evenement.target.value })}
                className="saisie"
              />
            </Champ>

            <Champ id="paq-moyen" libelle="Par quel moyen">
              <select
                id="paq-moyen"
                value={saisie.moyenPaiement}
                onChange={(evenement) =>
                  changer({
                    moyenPaiement: evenement.target.value as SaisiePaquet["moyenPaiement"],
                  })
                }
                className="saisie"
              >
                {MOYENS_PAIEMENT.map((moyen) => (
                  <option key={moyen} value={moyen}>
                    {LIBELLE_MOYEN[moyen]}
                  </option>
                ))}
              </select>
            </Champ>
          </div>

          {/* **Ce qui part, relu avant de valider.** C'est le seul endroit où la
              sélection se vérifie d'un coup d'œil : dans le tableau, elle est
              éparpillée sur autant de lignes. */}
          <div className="cadre p-3">
            <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
              Ce qui part
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {cartes.map((carte) => (
                <li key={carte.venteId} className="plaque-code text-corps text-encre">
                  {numeroDe(carte.venteId)}
                </li>
              ))}
            </ul>
          </div>

          <EtatErreurSaisie message={erreur} />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={envoi} className="bouton bouton-principal">
              {envoi ? "Envoi…" : "Confier le paquet"}
            </button>
            <button
              type="button"
              onClick={onFermer}
              disabled={envoi}
              className="bouton bouton-neutre"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </Modale>
  );
}
