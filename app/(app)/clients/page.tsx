"use client";

import { MoreHorizontal, Phone, Plus, Search, ShoppingBag, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FormulaireClient } from "@/components/FormulaireClient";
import { EtatChargement, EtatErreur, EtatSansResultat, EtatVide } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { TetePage } from "@/components/patrons/Page";
import { chercherClients, formaterTelephone, nomComplet, type Client } from "@/lib/domain/client";
import { formaterDateCourte } from "@/lib/domain/format";
import type { Vente } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterVentes } from "@/lib/repositories/ventes";

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
  const { perimetre } = usePerimetre();
  const [recherche, setRecherche] = useState("");
  const [creation, setCreation] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const resultats = useMemo(() => chercherClients(clients, recherche), [clients, recherche]);

  /**
   * Les dates d'achat, lisibles sans entrer dans la fiche (26 octobre 2026).
   *
   * **Le fichier est commun, les ventes ne le sont pas.** Le fichier clients
   * traverse les boutiques (D16) ; les ventes, non — un gérant ne lit que
   * celles de la sienne (D2). Cette ligne montre donc ce que le compte a le
   * droit de voir : tout pour le responsable, sa boutique pour un gérant. Ce
   * n'est pas une approximation, c'est le cloisonnement qui s'applique.
   *
   * Les règles tranchent de toute façon ; ici on ne pose que la question la
   * plus large qu'on ait le droit de poser — une requête sur toutes les
   * boutiques serait refusée en bloc à un gérant, et la liste n'afficherait
   * plus aucune date.
   */
  const portee = perimetre.type === "toutes" ? null : perimetre.boutiqueId;
  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentes(portee, auChangement, enErreur),
    [portee],
  );
  const { valeur: ventes } = useAbonnement(
    souscrireVentes,
    "Les achats n’ont pas pu être lus.",
  );

  const achatsParClient = useMemo(() => {
    const table = new Map<string, Date[]>();
    for (const vente of ventes ?? []) {
      if (!vente.date) continue;
      const deja = table.get(vente.clientId);
      if (deja) deja.push(vente.date);
      else table.set(vente.clientId, [vente.date]);
    }
    /* Du plus récent au plus ancien : au comptoir, « il est venu quand déjà ? »
       veut dire la dernière fois. */
    for (const dates of table.values()) dates.sort((a, b) => b.getTime() - a.getTime());
    return table;
  }, [ventes]);

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
                achats={achatsParClient.get(client.id)}
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
  achats,
  ouvert,
  basculer,
}: {
  client: Client;
  clients: Client[];
  /** Les dates d'achat du client, de la plus récente à la plus ancienne. */
  achats: Date[] | undefined;
  ouvert: boolean;
  basculer: () => void;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span className="min-w-0 flex-1">
          {/* **Le nom n'est plus un lien** (26 octobre 2026, demande du
              commanditaire) : deux gestes partaient de la même ligne — ouvrir
              la fiche et corriger — et seul le premier se voyait. Les deux sont
              maintenant dans le menu, nommés, à la même place. */}
          {/* **Le numéro sous le nom, les dates à côté** (26 octobre 2026,
              deuxième passe du commanditaire : « laisse le numéro en bas du nom
              faut juste aligner les dates »). Le numéro appartient à
              l'identité, il se lit avec le nom ; les dates, elles, sont ce
              qu'on parcourt d'une ligne à l'autre, et empilées elles
              obligeaient l'œil à descendre.

              L'identité porte une largeur minimale pour que les dates
              commencent au même endroit sur chaque ligne — sans elle, elles
              dansaient d'un client à l'autre au gré de la longueur du nom, et
              « aligner » n'aurait rien voulu dire. Elle tombe sous `sm` : sur
              un téléphone, réserver 14rem écraserait les dates. */}
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="min-w-0 sm:min-w-56">
              <span className="block font-medium text-encre">{nomComplet(client)}</span>

              <span className="mt-0.5 flex items-center gap-1.5 text-sm text-encre-doux">
                <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="plaque-code">{formaterTelephone(client.telephone)}</span>
                {client.telephone2 && <span>· {formaterTelephone(client.telephone2)}</span>}
              </span>
            </span>

            {achats !== undefined && achats.length > 0 && (
              /* **Toutes les dates, et non la dernière**, c'est la demande : on
                 veut savoir d'un coup d'œil si quelqu'un est un habitué. */
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-encre-doux">
                <ShoppingBag aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="sr-only">
                  {achats.length === 1 ? "Un achat le" : `${achats.length} achats, les`}
                </span>
                {achats.map((date, rang) => (
                  <span key={date.getTime() + "-" + rang} className="plaque-code">
                    {formaterDateCourte(date)}
                    {rang < achats.length - 1 ? " ·" : ""}
                  </span>
                ))}
              </span>
            )}
          </span>
          {client.adresse && (
            <span className="block text-sm text-encre-doux">{client.adresse}</span>
          )}
          {client.note && <span className="block text-sm text-encre-doux">{client.note}</span>}
        </span>

        <MenuClient client={client} surModifier={basculer} />
      </div>

      <Modale ouvert={ouvert} onFermer={basculer} titre={`Modifier ${nomComplet(client)}`}>
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

/**
 * Les deux gestes d'une ligne, rangés derrière trois points.
 *
 * **Pourquoi un menu plutôt que deux boutons.** « Corriger » occupait le bout
 * de la ligne et « Voir » n'existait que sous le nom, invisible comme lien.
 * Deux boutons côte à côte auraient tenu, mais la liste s'allonge et chaque
 * ligne aurait porté deux cibles de quarante-quatre pixels pour un geste
 * qu'on fait rarement.
 *
 * **Il se ferme comme on s'y attend** : Échap, un clic à côté, ou le choix
 * d'une entrée. Sans ces trois-là, un menu ouvert suit le doigt d'écran en
 * écran.
 */
function MenuClient({ client, surModifier }: { client: Client; surModifier: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;

    function auClic(evenement: MouseEvent) {
      if (!boite.current?.contains(evenement.target as Node)) setOuvert(false);
    }
    function auClavier(evenement: KeyboardEvent) {
      if (evenement.key === "Escape") setOuvert(false);
    }

    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert]);

  return (
    <div ref={boite} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((avant) => !avant)}
        className="inline-flex size-11 items-center justify-center rounded-plaque border border-bord text-encre hover:bg-fond"
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
        <span className="sr-only">Actions pour {nomComplet(client)}</span>
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-carte border border-bord bg-papier shadow-panneau"
        >
          <Link
            role="menuitem"
            href={`/clients/${client.id}`}
            className="block px-3 py-2.5 text-corps text-encre hover:bg-survol"
          >
            Voir
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOuvert(false);
              surModifier();
            }}
            className="block w-full px-3 py-2.5 text-left text-corps text-encre hover:bg-survol"
          >
            Modifier
          </button>
        </div>
      )}
    </div>
  );
}
