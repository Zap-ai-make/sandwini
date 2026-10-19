"use client";

import { Phone, Plus, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FormulaireClient } from "@/components/FormulaireClient";
import { EtatChargement, EtatErreur, EtatSansResultat, EtatVide } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { TetePage } from "@/components/patrons/Page";
import { chercherClients, formaterTelephone, nomComplet, type Client } from "@/lib/domain/client";
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
  const { clients, lus, chargement, erreur } = useFichierClients();
  const [recherche, setRecherche] = useState("");
  const [creation, setCreation] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const resultats = useMemo(() => chercherClients(clients, recherche), [clients, recherche]);

  return (
    <div>
      <TetePage
        titre="Clients"
        sousTitre="Commun à toutes les boutiques"
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                setCreation(true);
                setConfirmation(null);
              }}
              className="bouton bouton-principal"
            >
              <UserPlus aria-hidden="true" className="size-4" />
              Nouveau client
            </button>
          </>
        }
      />

      {/* En modale depuis S54, à la demande du commanditaire. Le repli en
          accordéon poussait la liste vers le bas au moment précis où l'on venait
          de chercher quelqu'un — on perdait de vue ce qu'on cherchait pour
          créer la fiche de quelqu'un d'autre. */}
      <Modale ouvert={creation} onFermer={() => setCreation(false)} titre="Nouveau client">
        <FormulaireClient
          clients={lus}
          surEnregistrement={(_, saisie) => {
            setConfirmation(`${nomComplet(saisie)} est enregistré.`);
            setCreation(false);
          }}
          surAnnulation={() => setCreation(false)}
        />
      </Modale>

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
            /* Bornée comme la recherche du stock : un champ de recherche ne
               gagne rien à traverser l'écran, et l'œil ne retrouve plus le
               début de la ligne. */
            className="saisie pr-3 pl-9 placeholder:text-encre-doux sm:max-w-80"
          />
        </div>
      </div>

      <EtatErreur message={erreur} className="mt-4" />

      {chargement ? (
        <EtatChargement className="mt-6">Chargement du fichier…</EtatChargement>
      ) : clients.length === 0 && !erreur ? (
        <EtatVide
          titre="Aucun client pour l’instant."
          className="mt-6"
          action={
            <button type="button" onClick={() => setCreation(true)} className="bouton bouton-principal">
              <Plus aria-hidden="true" className="size-4" />
              Créer le premier
            </button>
          }
        >
          Ils se créent ici, ou au moment d’une vente — sans quitter l’écran de vente.
        </EtatVide>
      ) : resultats.length === 0 ? (
        <EtatSansResultat className="mt-6">
          Personne ne correspond. Vérifiez le numéro, ou créez la fiche.
        </EtatSansResultat>
      ) : (
        <>
          <p className="mt-6 text-sm text-encre-doux">
            {resultats.length === 1 ? "1 client" : `${resultats.length} clients`}
            {resultats.length !== clients.length && ` sur ${clients.length}`}
          </p>
          <ul className="mt-2 cadre cadre-liste">
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
          {/* Le nom mène à la fiche (S54) : c'est le geste qu'on fait dix fois
              par jour, et il n'avait jusqu'ici aucune destination. */}
          <Link href={`/clients/${client.id}`} className="lien block font-medium">
            {nomComplet(client)}
          </Link>
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
          className="inline-flex h-11 shrink-0 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
        >
          Corriger
        </button>
      </div>

      <Modale ouvert={ouvert} onFermer={basculer} titre={`Corriger ${nomComplet(client)}`}>
        <FormulaireClient
          clients={clients}
          existant={client}
          surEnregistrement={basculer}
          surAnnulation={basculer}
        />
      </Modale>
    </li>
  );
}
