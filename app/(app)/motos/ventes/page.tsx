"use client";

import { LoaderCircle, Plus, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { FicheVente } from "@/components/FicheVente";
import { useSession } from "@/lib/auth/session";
import { normaliserNom, type Client } from "@/lib/domain/client";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import {
  LIBELLE_MODE,
  LIBELLE_STATUT_PAIEMENT,
  chercherVentes,
  comparerVentes,
  estRenumerotee,
  resumerDossier,
  type DocumentDossier,
  type Vente,
  type VenteCherchable,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterDossiers, ecouterVentes } from "@/lib/repositories/ventes";

/**
 * Les ventes de la boutique.
 *
 * Un champ unique en haut, comme le demande le §6.4 : on tape ce qu'on a — le
 * nom du client, son numéro, le numéro du reçu qu'il tend, ou le châssis relevé
 * sur la moto — et la liste se réduit. C'est le geste qu'on répète vingt fois
 * par jour ; enregistrer une vente n'arrive que quelques fois.
 *
 * Tout est filtré en mémoire, sur des collections chargées entières : une
 * recherche qui ne marche qu'en ligne ne sert à rien dans une application dont
 * le hors-ligne est la promesse.
 */
export default function PageVentes() {
  return (
    <Suspense fallback={null}>
      <AiguillageVentes />
    </Suspense>
  );
}

function AiguillageVentes() {
  const venteOuverte = useSearchParams().get("vente");
  return venteOuverte ? <FicheVente id={venteOuverte} /> : <Ventes />;
}

function Ventes() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();
  const [recherche, setRecherche] = useState("");

  const boutiqueId = perimetre.boutiqueId;

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: ventes, erreur } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être chargées.",
  );

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être chargé.");

  /* Une seule écoute pour l'état des dossiers de tout l'écran, plutôt qu'une par
     ligne : cinquante ventes affichées feraient cinquante flux ouverts. */
  const souscrireDossiers = useCallback(
    (auChangement: (documents: DocumentDossier[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterDossiers(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: dossiers } = useAbonnement(
    souscrireDossiers,
    "L’état des dossiers n’a pas pu être lu.",
  );

  const cherchables = useMemo<Cherchable[]>(() => {
    const parClient = new Map(clients.map((client) => [client.id, client]));
    const parMoto = new Map((stock ?? []).map((moto) => [moto.id, moto]));
    const parVente = new Map<string, DocumentDossier[]>();
    for (const document of dossiers ?? []) {
      parVente.set(document.venteId, [...(parVente.get(document.venteId) ?? []), document]);
    }

    return [...(ventes ?? [])].sort(comparerVentes).map((vente) => {
      const client = parClient.get(vente.clientId);
      const moto = parMoto.get(vente.motoId);
      return {
        vente,
        client,
        moto,
        documents: parVente.get(vente.id) ?? [],
        nomNormalise: client?.nomNormalise ?? "",
        telephones: client
          ? [client.telephoneNormalise, client.telephone, client.telephone2]
              .map((valeur) => valeur.replace(/[^0-9]/g, ""))
              .filter(Boolean)
          : [],
        chassis: moto?.numeroChassis ?? "",
      };
    });
  }, [ventes, clients, stock, dossiers]);

  const resultats = useMemo(
    () => chercherVentes(cherchables, recherche, normaliserNom),
    [cherchables, recherche],
  );

  if (perimetre.type === "aucune") return <SansBoutique />;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-encre">Ventes</h1>
          <p className="mt-1 text-sm text-encre-doux">
            {perimetre.type === "toutes" ? "Toutes les boutiques" : perimetre.nom}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/motos/ventes/nouvelle"
            className="inline-flex h-12 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
          >
            <Plus aria-hidden="true" className="size-4" />
            Nouvelle vente
          </Link>
          <Link
            href="/motos/paiements"
            className="inline-flex h-12 items-center rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier"
          >
            Paiements
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="recherche-vente" className="block text-sm font-medium text-encre">
          Chercher une vente
        </label>
        <div className="relative mt-1.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
          />
          <input
            id="recherche-vente"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Nom, téléphone, numéro de reçu ou châssis"
            value={recherche}
            onChange={(evenement) => setRecherche(evenement.target.value)}
            className="h-12 w-full rounded-plaque border border-bord bg-papier pr-3 pl-9 text-encre placeholder:text-encre-doux"
          />
        </div>
      </div>

      {erreur && (
        <p role="alert" className="mt-4 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {ventes === null && !erreur ? (
        <p className="mt-6 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement des ventes…
        </p>
      ) : (ventes ?? []).length === 0 && !erreur ? (
        <AucuneVente perimetreEnCours={perimetreEnCours} />
      ) : resultats.length === 0 ? (
        <p className="mt-6 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Aucune vente ne correspond. Essayez le numéro de téléphone, ou le numéro du reçu.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-encre-doux">
            {resultats.length === 1 ? "1 vente" : `${resultats.length} ventes`}
            {resultats.length !== cherchables.length && ` sur ${cherchables.length}`}
          </p>
          <ul className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
            {resultats.map((ligne) => (
              <li key={ligne.vente.id}>
                <LigneVente ligne={ligne} catalogue={catalogue} montrerBoutique={perimetre.type === "toutes"} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

type Cherchable = VenteCherchable & {
  client: Client | undefined;
  moto: Moto | undefined;
  documents: DocumentDossier[];
};

function LigneVente({
  ligne,
  catalogue,
  montrerBoutique,
}: {
  ligne: Cherchable;
  catalogue: ReturnType<typeof useCatalogue>;
  montrerBoutique: boolean;
}) {
  const { vente, client, moto, documents } = ligne;

  return (
    <Link
      href={`/motos/ventes?vente=${vente.id}`}
      className="block px-4 py-3 hover:bg-fond focus-visible:bg-fond"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="plaque-code shrink-0 rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-xs leading-none text-encre-fixe">
          {vente.numero}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-encre">{client?.nom ?? "Client inconnu"}</span>
          <span className="block text-sm text-encre-doux">
            {moto
              ? `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)} · ${moto.numeroChassis}`
              : "Moto hors de ce périmètre"}
            {montrerBoutique ? ` · ${vente.boutiqueId}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-medium text-encre">{formaterMontant(vente.prixConvenu)}</span>
          <span className="block text-sm text-encre-doux">
            {vente.date ? formaterDateCourte(vente.date) : "—"}
          </span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {/* Jamais la couleur seule : le reste dû est écrit, le statut aussi
            (DESIGN.md §5). */}
        <span className={vente.resteDu === 0 ? "text-solde" : "text-encre"}>
          {LIBELLE_STATUT_PAIEMENT[vente.statutPaiement]}
          {vente.resteDu > 0 && ` · reste ${formaterMontant(vente.resteDu)}`}
        </span>
        <span aria-hidden="true" className="text-bord">
          |
        </span>
        <span className="text-encre-doux">{LIBELLE_MODE[vente.modePaiement]}</span>
        <span aria-hidden="true" className="text-bord">
          |
        </span>
        <span className="text-encre-doux">{resumerDossier(documents)}</span>
        {estRenumerotee(vente) && (
          <span className="inline-flex items-center gap-1 rounded-plaque border border-plaque-bord bg-plaque/15 px-2 py-0.5 text-encre">
            <TriangleAlert aria-hidden="true" className="size-3.5" />
            Renuméroté
          </span>
        )}
      </div>
    </Link>
  );
}

function AucuneVente({ perimetreEnCours }: { perimetreEnCours: boolean }) {
  if (perimetreEnCours) return null;
  return (
    <div className="mt-6 rounded-plaque border border-dashed border-bord p-4">
      <p className="text-encre">Aucune vente enregistrée pour l’instant.</p>
      <p className="mt-1 max-w-prose text-sm text-encre-doux">
        Une vente demande une moto en stock et un client. Le client peut se créer au moment de la
        vente, sans quitter l’écran.
      </p>
      <Link
        href="/motos/ventes/nouvelle"
        className="mt-4 inline-flex h-12 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
      >
        <Plus aria-hidden="true" className="size-4" />
        Enregistrer la première
      </Link>
    </div>
  );
}

function SansBoutique() {
  const session = useSession();
  const estResponsable = session.statut === "connecte" && session.utilisateur.role === "responsable";

  return (
    <div className="max-w-prose">
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Ventes</h1>
      <p className="mt-3 text-encre-doux">
        {estResponsable
          ? "Aucune boutique n’est déclarée : une vente n’a pas encore d’endroit où exister."
          : "Aucune boutique ne vous est attribuée. Vos écrans resteront vides tant que le responsable ne vous en aura pas donné une."}
      </p>
      {estResponsable && (
        <Link
          href="/parametres/boutiques"
          className="mt-6 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          Créer une boutique
        </Link>
      )}
    </div>
  );
}
