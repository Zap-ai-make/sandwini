"use client";

import { ArrowLeft, Lock, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { useSession } from "@/lib/auth/session";
import { formaterDate, formaterMontant } from "@/lib/domain/format";
import { LIBELLE_ETAT, LIBELLE_STATUT, type CoutMoto, type Moto } from "@/lib/domain/moto";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { ecouterCoutMoto, ecouterMoto } from "@/lib/repositories/motos";

/**
 * La fiche d'une moto.
 *
 * Deux lectures pour un même objet, et c'est le cœur du modèle : la moto, que
 * le gérant lit pour la vendre, et son coût, que seul le responsable peut lire.
 * L'écran ne cache pas cette coupure — il la nomme, pour qu'un gérant qui ne
 * voit pas les montants comprenne que ce n'est pas une panne (D2).
 *
 * Ce n'est pas une route à part mais un panneau de `/motos`, ouvert par le
 * paramètre `?moto=`. Une route `/motos/[id]` obligeait le navigateur à
 * demander un document que le service worker n'avait jamais vu : hors ligne,
 * la fiche d'une moto qu'on venait de saisir tombait sur la page de repli
 * (D39).
 */
export function FicheMoto({ id }: { id: string }) {
  const session = useSession();
  const catalogue = useCatalogue();

  const souscrire = useCallback(
    (auChangement: (moto: Moto | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterMoto(id, auChangement, enErreur),
    [id],
  );
  const { valeur: moto, erreur } = useAbonnement(souscrire, "Cette moto n’a pas pu être chargée.");

  const estResponsable = session.statut === "connecte" && session.utilisateur.role === "responsable";

  return (
    <div>
      <Link
        href="/motos"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Stock
      </Link>

      {erreur ? (
        <p role="alert" className="mt-6 text-alerte">
          {erreur}
        </p>
      ) : moto === null ? (
        <p className="mt-6 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement de la fiche…
        </p>
      ) : (
        <>
          <span className="plaque-code mt-3 inline-block rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-sm leading-none text-encre-fixe">
            {moto.numeroChassis}
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">
            {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
          </h1>

          <dl className="mt-6 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
            <Ligne titre="État" valeur={LIBELLE_ETAT[moto.etat]} />
            <Ligne titre="Statut" valeur={LIBELLE_STATUT[moto.statut]} />
            <Ligne titre="Boutique" valeur={moto.boutiqueId} code />
            <Ligne titre="Provenance" valeur={catalogue.nomProvenance(moto.provenanceId)} />
            {moto.couleur && <Ligne titre="Couleur" valeur={moto.couleur} />}
            {moto.annee !== null && <Ligne titre="Année" valeur={String(moto.annee)} />}
            {moto.numeroMoteur && <Ligne titre="Numéro de moteur" valeur={moto.numeroMoteur} code />}
            <Ligne
              titre="Entrée en stock"
              valeur={moto.dateEntree ? formaterDate(moto.dateEntree) : "—"}
            />
            {moto.prixVenteConseille !== null && (
              <Ligne
                titre="Prix de vente conseillé"
                valeur={formaterMontant(moto.prixVenteConseille)}
              />
            )}
          </dl>

          {moto.papiersFournis.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
                Papiers fournis
              </h2>
              <ul className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
                {moto.papiersFournis.map((papier) => (
                  <li key={papier} className="px-4 py-2.5 text-encre">
                    {papier}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {estResponsable ? <Cout id={id} catalogue={catalogue} /> : <CoutMasque />}
        </>
      )}
    </div>
  );
}

function Ligne({ titre, valeur, code = false }: { titre: string; valeur: string; code?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-encre-doux">{titre}</dt>
      <dd className={["text-right text-encre", code ? "plaque-code" : ""].join(" ")}>{valeur}</dd>
    </div>
  );
}

/**
 * Ce que le responsable voit, et lui seul.
 *
 * Le catalogue lui est passé plutôt que rappelé : `useCatalogue()` ouvre
 * quatre écoutes Firestore, et les rouvrir ici les doublait sur un écran qui
 * affiche pourtant les mêmes listes.
 */
function Cout({ id, catalogue }: { id: string; catalogue: Catalogue }) {
  const souscrire = useCallback(
    (auChangement: (cout: CoutMoto | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterCoutMoto(id, auChangement, enErreur),
    [id],
  );
  const { valeur: cout, erreur } = useAbonnement(souscrire, "Le coût n’a pas pu être chargé.");

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Coût d’entrée
      </h2>

      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-alerte">
          {erreur}
        </p>
      ) : cout === null ? (
        <p className="mt-2 flex items-center gap-3 text-sm text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement…
        </p>
      ) : (
        <dl className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          <Ligne titre="Prix d’achat" valeur={formaterMontant(cout.prixAchat)} />
          {cout.fraisEntree.map((frais, index) => (
            <Ligne
              key={index}
              titre={`${catalogue.nomTypeFrais(frais.typeFraisId)}${frais.note ? ` — ${frais.note}` : ""}`}
              valeur={formaterMontant(frais.montant)}
            />
          ))}
          <div className="flex items-baseline justify-between gap-4 bg-fond px-4 py-3">
            <dt className="text-sm font-medium text-encre">Coût total</dt>
            <dd className="text-right text-lg font-semibold text-encre">
              {formaterMontant(cout.coutTotal)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/**
 * Ce que le gérant voit à la place.
 *
 * Dire « réservé au responsable » vaut mieux que ne rien afficher : un blanc se
 * lit comme une panne, une explication se lit comme une règle (DESIGN.md §10).
 */
function CoutMasque() {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Coût d’entrée
      </h2>
      <p className="mt-2 flex gap-3 rounded-plaque border border-dashed border-bord p-4 text-sm text-encre-doux">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Le prix d’achat et les frais sont réservés au responsable. Vous les avez saisis à l’entrée
          de la moto&nbsp;; ils ne se relisent pas ici.
        </span>
      </p>
    </section>
  );
}
