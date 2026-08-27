"use client";

import { LoaderCircle, Phone, Plus, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { FormulaireClient } from "@/components/FormulaireClient";
import { chercherClients, formaterTelephone, type Client } from "@/lib/domain/client";
import { useFichierClients } from "@/lib/repositories/fichier-clients";

/**
 * Le fichier clients.
 *
 * Un seul geste compte ici : retrouver quelqu'un. On tape ce qu'on a — les
 * chiffres relevés sur un carnet ou les premières lettres d'un nom — et la
 * liste se réduit. C'est pourquoi la recherche occupe le haut de l'écran et
 * que la création n'est qu'un bouton à côté : on cherche vingt fois pour une
 * création.
 *
 * Le fichier est commun à toutes les boutiques (`DECISIONS.md` D16) : il n'y a
 * donc pas de sélecteur de périmètre ici, et c'est volontaire.
 */
export default function PageClients() {
  const { clients, chargement, erreur } = useFichierClients();
  const [recherche, setRecherche] = useState("");
  const [creation, setCreation] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const resultats = useMemo(() => chercherClients(clients, recherche), [clients, recherche]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-encre">Clients</h1>
          <p className="mt-1 text-sm text-encre-doux">Commun à toutes les boutiques</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreation((ouvert) => !ouvert);
            setConfirmation(null);
          }}
          aria-expanded={creation}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
        >
          <UserPlus aria-hidden="true" className="size-4" />
          {creation ? "Fermer" : "Nouveau client"}
        </button>
      </div>

      {creation && (
        <section className="mt-6 rounded-plaque border border-bord bg-papier p-4">
          <h2 className="font-semibold text-encre">Nouveau client</h2>
          <div className="mt-4">
            <FormulaireClient
              clients={clients}
              surEnregistrement={(_, saisie) => {
                setConfirmation(`${saisie.nom.trim()} est enregistré.`);
                setCreation(false);
              }}
              surAnnulation={() => setCreation(false)}
            />
          </div>
        </section>
      )}

      {confirmation && (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-solde">
          {confirmation}
        </p>
      )}

      <div className="mt-6">
        <label htmlFor="recherche-client" className="block text-sm font-medium text-encre">
          Chercher un client
        </label>
        <div className="relative mt-1.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
          />
          <input
            id="recherche-client"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Un numéro, ou le début d’un nom"
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

      {chargement ? (
        <p className="mt-6 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement du fichier…
        </p>
      ) : clients.length === 0 && !erreur ? (
        <div className="mt-6 rounded-plaque border border-dashed border-bord p-4">
          <p className="text-encre">Aucun client pour l’instant.</p>
          <p className="mt-1 max-w-prose text-sm text-encre-doux">
            Ils se créent ici, ou au moment d’une vente — sans quitter l’écran de vente.
          </p>
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="mt-4 inline-flex h-12 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
          >
            <Plus aria-hidden="true" className="size-4" />
            Créer le premier
          </button>
        </div>
      ) : resultats.length === 0 ? (
        <p className="mt-6 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Personne ne correspond. Vérifiez le numéro, ou créez la fiche.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-encre-doux">
            {resultats.length === 1 ? "1 client" : `${resultats.length} clients`}
            {resultats.length !== clients.length && ` sur ${clients.length}`}
          </p>
          <ul className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
            {resultats.map((client) => (
              <LigneClient
                key={client.id}
                client={client}
                clients={clients}
                ouvert={ouvert === client.id}
                basculer={() => setOuvert((actuel) => (actuel === client.id ? null : client.id))}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function LigneClient({
  client,
  clients,
  ouvert,
  basculer,
}: {
  client: Client;
  clients: Client[];
  ouvert: boolean;
  basculer: () => void;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-encre">{client.nom}</span>
          <span className="flex items-center gap-1.5 text-sm text-encre-doux">
            <Phone aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="plaque-code">{formaterTelephone(client.telephone)}</span>
            {client.telephone2 && <span>· {formaterTelephone(client.telephone2)}</span>}
          </span>
          {client.adresse && (
            <span className="block text-sm text-encre-doux">{client.adresse}</span>
          )}
          {client.note && <span className="block text-sm text-encre-doux">{client.note}</span>}
        </span>

        <button
          type="button"
          onClick={basculer}
          aria-expanded={ouvert}
          className="inline-flex h-11 shrink-0 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
        >
          {ouvert ? "Annuler" : "Corriger"}
        </button>
      </div>

      {ouvert && (
        <div className="mt-3 rounded-plaque border border-bord bg-fond p-4">
          <h3 className="text-sm font-semibold text-encre">Corriger {client.nom}</h3>
          <div className="mt-4">
            <FormulaireClient
              clients={clients}
              existant={client}
              surEnregistrement={basculer}
              surAnnulation={basculer}
            />
          </div>
        </div>
      )}
    </li>
  );
}
