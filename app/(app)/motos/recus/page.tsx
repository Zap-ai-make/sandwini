"use client";

import { LoaderCircle, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { PanneauRecu } from "@/components/PanneauRecu";
import { useSession } from "@/lib/auth/session";
import { normaliserNom } from "@/lib/domain/client";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import {
  LIBELLE_TYPE_RECU,
  chercherRecus,
  comparerRecus,
  composerRecus,
  filtrerParDates,
  type ContenuRecu,
  type RecuCherchable,
} from "@/lib/domain/recu";
import type { Vente, Versement } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Les reçus (`prompt.md` §10).
 *
 * Le §10 demande un écran « filtrable par numéro, date et client ». Il répond à
 * une question précise et fréquente : le client revient avec un papier froissé,
 * ou sans papier du tout, et il faut retrouver le reçu pour le réimprimer.
 *
 * **Rien n'est lu ici qui ne le soit déjà ailleurs.** Les reçus ne sont pas
 * stockés : ils se composent depuis les ventes et leurs versements
 * (`DECISIONS.md` D61), lus par les mêmes écoutes que l'écran des paiements.
 * Un écran de plus, pas une collection de plus — et il s'ouvre hors ligne comme
 * le reste, parce qu'il ne demande rien au serveur.
 */
export default function PageRecus() {
  return (
    <Suspense fallback={null}>
      <AiguillageRecus />
    </Suspense>
  );
}

function AiguillageRecus() {
  /* Un panneau ouvert par `?recu=`, comme les fiches moto et vente : une route
     dynamique `/recus/[id]` ne survivrait pas à une coupure (D39). */
  const recuOuvert = useSearchParams().get("recu");
  return recuOuvert ? <PanneauRecu cle={recuOuvert} /> : <Recus />;
}

type Ligne = RecuCherchable & { nomClient: string };

function Recus() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const { clients } = useFichierClients();
  const [recherche, setRecherche] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");

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

  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVersementsDuPerimetre(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: versements, erreur: erreurVersements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  const lignes = useMemo<Ligne[]>(() => {
    const parVente = new Map<string, Versement[]>();
    /* `ecouterVersementsDuPerimetre` rend la liste triée par date : le
       regroupement conserve cet ordre, dont dépend le cumul de chaque reçu. */
    for (const versement of versements ?? []) {
      const liste = parVente.get(versement.venteId);
      if (liste) liste.push(versement);
      else parVente.set(versement.venteId, [versement]);
    }
    const parClient = new Map(clients.map((client) => [client.id, client]));

    return (ventes ?? [])
      .flatMap((vente) => composerRecus(vente, parVente.get(vente.id) ?? []))
      .sort(comparerRecus)
      .map((recu) => {
        const client = parClient.get(recu.vente.clientId);
        return {
          recu,
          nomClient: client?.nom ?? "Client inconnu",
          nomNormalise: client?.nomNormalise ?? "",
        };
      });
  }, [ventes, versements, clients]);

  const resultats = useMemo(
    () => filtrerParDates(chercherRecus(lignes, recherche, normaliserNom), du, au),
    [lignes, recherche, du, au],
  );

  if (perimetre.type === "aucune") return <SansBoutique />;

  const chargement = (ventes === null || versements === null) && !erreur && !erreurVersements;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Reçus</h1>
      <p className="mt-1 text-sm text-encre-doux">
        {perimetre.type === "toutes" ? "Toutes les boutiques" : perimetre.nom}
      </p>

      <div className="mt-6">
        <label htmlFor="recherche-recu" className="block text-sm font-medium text-encre">
          Chercher un reçu
        </label>
        <div className="relative mt-1.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
          />
          <input
            id="recherche-recu"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Numéro du reçu ou nom du client"
            value={recherche}
            onChange={(evenement) => setRecherche(evenement.target.value)}
            className="h-12 w-full rounded-plaque border border-bord bg-papier pr-3 pl-9 text-encre placeholder:text-encre-doux"
          />
        </div>
      </div>

      {/* Deux champs de date natifs plutôt qu'un calendrier maison : le
          navigateur en propose un adapté à l'appareil, traduit, accessible au
          clavier, et il ne pèse rien (`ARCHITECTURE.md` §1, échelle 3). */}
      <div className="mt-3 flex flex-wrap gap-3">
        <ChampDate id="recu-du" libelle="Du" valeur={du} changer={setDu} />
        <ChampDate id="recu-au" libelle="Au" valeur={au} changer={setAu} />
        {(du || au) && (
          <button
            type="button"
            onClick={() => {
              setDu("");
              setAu("");
            }}
            className="mt-6 inline-flex h-12 items-center rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-papier"
          >
            Toutes les dates
          </button>
        )}
      </div>

      {(erreur || erreurVersements) && (
        <p role="alert" className="mt-4 text-sm text-alerte">
          {erreur ?? erreurVersements}
        </p>
      )}

      {chargement ? (
        <p className="mt-6 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement des reçus…
        </p>
      ) : lignes.length === 0 ? (
        <AucunRecu perimetreEnCours={perimetreEnCours} />
      ) : resultats.length === 0 ? (
        <p className="mt-6 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Aucun reçu ne correspond. Essayez le nom du client, ou élargissez les dates.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-encre-doux">
            {resultats.length === 1 ? "1 reçu" : `${resultats.length} reçus`}
            {resultats.length !== lignes.length && ` sur ${lignes.length}`}
          </p>
          <ul className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
            {resultats.map((ligne) => (
              <li key={ligne.recu.cle}>
                <LigneRecu recu={ligne.recu} nomClient={ligne.nomClient} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ChampDate({
  id,
  libelle,
  valeur,
  changer,
}: {
  id: string;
  libelle: string;
  valeur: string;
  changer: (valeur: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-encre">
        {libelle}
      </label>
      <input
        id={id}
        type="date"
        value={valeur}
        onChange={(evenement) => changer(evenement.target.value)}
        className="mt-1.5 h-12 rounded-plaque border border-bord bg-papier px-3 text-encre"
      />
    </div>
  );
}

function LigneRecu({ recu, nomClient }: { recu: ContenuRecu; nomClient: string }) {
  return (
    <Link
      href={`/motos/recus?recu=${recu.cle}`}
      className="block px-4 py-3 hover:bg-fond focus-visible:bg-fond"
    >
      <span className="plaque-code inline-block rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-xs leading-none text-encre-fixe">
        {recu.numero}
      </span>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium text-encre">{nomClient}</span>
          <span className="block text-sm text-encre-doux">
            {LIBELLE_TYPE_RECU[recu.type]} · {recu.date ? formaterDateCourte(recu.date) : "—"}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold text-encre tabular-nums">
            {formaterMontant(recu.montantEncaisse)}
          </span>
          {/* Le reste dû du jour du reçu, pas celui d'aujourd'hui : c'est ce
              que le papier annonce (D61). */}
          <span className="block text-sm text-encre-doux">
            {recu.resteDu === 0 ? "soldé" : `reste ${formaterMontant(recu.resteDu)}`}
          </span>
        </span>
      </div>
    </Link>
  );
}

function AucunRecu({ perimetreEnCours }: { perimetreEnCours: boolean }) {
  if (perimetreEnCours) return null;
  return (
    <div className="mt-6 rounded-plaque border border-dashed border-bord p-4">
      <p className="text-encre">Aucun reçu pour l’instant.</p>
      <p className="mt-1 max-w-prose text-sm text-encre-doux">
        Un reçu naît d’une vente : le premier apparaîtra ici dès qu’une moto sera vendue.
      </p>
      <Link
        href="/motos/ventes/nouvelle"
        className="mt-4 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
      >
        Enregistrer une vente
      </Link>
    </div>
  );
}

function SansBoutique() {
  const session = useSession();
  const estResponsable = session.statut === "connecte" && session.utilisateur.role === "responsable";

  return (
    <div className="max-w-prose">
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Reçus</h1>
      <p className="mt-3 text-encre-doux">
        {estResponsable
          ? "Aucune boutique n’est déclarée : un reçu n’a pas encore d’en-tête à porter."
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
