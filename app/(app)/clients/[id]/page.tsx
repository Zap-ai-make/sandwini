"use client";

import { Phone, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { FicheVente } from "@/components/FicheVente";
import { FormulaireClient } from "@/components/FormulaireClient";
import { PanneauRecu } from "@/components/PanneauRecu";
import { ErreurDeLecture, EtatChargement, EtatVide, PastillePaiement } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { AvecPanneau } from "@/components/patrons/PanneauLateral";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { formaterTelephone, nomComplet } from "@/lib/domain/client";
import { formaterDateCourte, formaterNombre } from "@/lib/domain/format";
import { LIBELLE_MODE, ventesDuClient, type Vente } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterVentes } from "@/lib/repositories/ventes";

/**
 * La fiche d'un client : qui il est, et ce qu'il a acheté (S54).
 *
 * Demandé ainsi : « si on clique sur un client on doit atterrir sur sa fiche,
 * historique de ses achats ». Un client n'avait aucune page à lui — son nom
 * n'était qu'une ligne du fichier, et rien ne répondait à « qu'est-ce que
 * celui-là nous a pris ».
 *
 * **Une page et non un panneau latéral.** Le dossier d'un client se met en
 * favori, s'imprime, se passe par message ; un panneau ne fait rien de tout
 * cela. C'est aussi le montage qu'a déjà la fiche d'un fournisseur (S50), et
 * deux écrans qui répondent à la même question doivent se ressembler.
 *
 * **Aucune règle Firestore n'a été ouverte, et c'est le point d'architecture.**
 * L'écran n'interroge pas « les ventes du client X » : il écoute les ventes de
 * son périmètre — celles que les règles laissent déjà lire — et
 * `ventesDuClient` trie en mémoire. Le fichier clients, lui, est commun à
 * toutes les boutiques (D16), mais les ventes ne le sont pas (D7).
 *
 * La conséquence se dit à l'écran au lieu de se cacher : un gérant voit les
 * achats faits **dans sa boutique**, et la fiche l'écrit sous le tableau. Le
 * commanditaire a tranché en ces termes — ouvrir une lecture d'argent pour un
 * confort d'affichage ne se rattrape pas.
 */
export default function PageClient() {
  const parametres = useParams<{ id: string }>();
  const clientId = parametres.id;
  /* La fiche d'un achat s'ouvre **ici**, en panneau, et non en déposant le
     lecteur dans l'onglet Ventes : on consulte l'achat d'un client depuis son
     dossier, on n'en sort pas (S54). L'adresse porte l'état, donc le panneau
     survit à un rechargement et se passe par lien. */
  const recherche = useSearchParams();
  const venteOuverte = recherche.get("vente");
  const recuOuvert = recherche.get("recu");
  const base = `/clients/${clientId}`;
  const surTitre = useSurTitre("Clients");
  const { perimetre } = usePerimetre();
  const boutiqueId = perimetre.boutiqueId;
  const { clients, lus, chargement, erreur: erreurClients } = useFichierClients();
  const [correction, setCorrection] = useState(false);

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      perimetre.type === "aucune"
        ? () => {}
        : ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId, perimetre.type],
  );
  const { valeur: ventes, erreur: erreurVentes } = useAbonnement(
    souscrireVentes,
    "Les achats n’ont pas pu être chargés.",
  );

  const client = clients.find((candidat) => candidat.id === clientId) ?? null;
  const achats = useMemo(() => ventesDuClient(ventes ?? [], clientId), [ventes, clientId]);

  const colonnes = useMemo<Colonne<Vente>[]>(
    () => [
      {
        cle: "numero",
        titre: "Pièce",
        principal: true,
        rendu: (vente) => (
          <Link href={`${base}?vente=${vente.id}`} className="lien font-code">
            {vente.numero}
          </Link>
        ),
      },
      {
        cle: "date",
        titre: "Date",
        /* Une date absente veut dire « saisi à l'instant, pas encore parvenu au
           serveur », et non « sans date » (D82). */
        rendu: (vente) => (vente.date ? formaterDateCourte(vente.date) : "à l’instant"),
      },
      { cle: "boutique", titre: "Boutique", rendu: (vente) => <span className="plaque-code">{vente.boutiqueId}</span> },
      { cle: "mode", titre: "Mode", rendu: (vente) => LIBELLE_MODE[vente.modePaiement] },
      {
        cle: "reste",
        titre: "Reste dû (FCFA)",
        titreReplie: "Reste dû",
        chiffre: true,
        rendu: (vente) => (vente.resteDu > 0 ? formaterNombre(vente.resteDu) : "—"),
      },
      {
        cle: "paiement",
        titre: "Paiement",
        rendu: (vente) => <PastillePaiement statut={vente.statutPaiement} />,
      },
    ],
    [base],
  );

  if (erreurClients)
    return (
      <ErreurDeLecture
        titre="Ce client n’a pas pu être lu"
        sortie={{ href: "/clients", libelle: "Revenir au fichier" }}
      >
        {erreurClients}
      </ErreurDeLecture>
    );

  if (chargement) return <EtatChargement>Lecture du fichier client…</EtatChargement>;

  if (!client)
    return (
      <div>
        <TetePage surTitre={surTitre} retour={{ href: "/clients", libelle: "Clients" }} titre="Client" />
        <EtatVide titre="Ce client n’existe pas">
          Il a peut-être été retiré du fichier, ou l’adresse est inexacte.
        </EtatVide>
      </div>
    );

  return (
    <div>
      <TetePage
        surTitre={surTitre}
        retour={{ href: "/clients", libelle: "Clients" }}
        titre={nomComplet(client)}
        actions={
          <button type="button" onClick={() => setCorrection(true)} className="bouton bouton-discret">
            <Pencil aria-hidden="true" className="size-4" />
            Corriger
          </button>
        }
      />

      <section aria-label="Coordonnées" className="mt-6 cadre p-4 sm:p-5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-corps text-encre">
          <span className="inline-flex items-center gap-1.5">
            <Phone aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
            <span className="plaque-code">{formaterTelephone(client.telephone)}</span>
          </span>
          {client.telephone2 && (
            <span className="plaque-code text-encre-doux">{formaterTelephone(client.telephone2)}</span>
          )}
        </p>
        {client.adresse && <p className="mt-1 text-corps text-encre-doux">{client.adresse}</p>}
        {client.note && <p className="mt-1 text-corps text-encre-doux">{client.note}</p>}
      </section>

      <h2 className="mt-6 text-bloc font-semibold text-encre">Ses achats</h2>

      {erreurVentes ? (
        <ErreurDeLecture titre="Les achats n’ont pas pu être lus">{erreurVentes}</ErreurDeLecture>
      ) : achats.length === 0 && ventes !== null ? (
        <EtatVide titre="Aucun achat enregistré">
          Ce client est au fichier, mais aucune vente ne lui est encore rattachée.
        </EtatVide>
      ) : (
        <AvecPanneau
          panneau={
            recuOuvert ? (
              <PanneauRecu
                cle={recuOuvert}
                base={base}
                libelleRetour="Le client"
                libelleRevenir="Revenir au client"
              />
            ) : venteOuverte ? (
              <FicheVente id={venteOuverte} base={base} />
            ) : null
          }
        >
          <div className="mt-3">
            <Tableau
              legende={`Achats de ${nomComplet(client)}, du plus récent au plus ancien`}
              colonnes={colonnes}
              lignes={achats}
              cleDe={(vente) => vente.id}
              chargement={ventes === null}
              cleActive={venteOuverte}
            />
          </div>
        </AvecPanneau>
      )}

      {/* **Dit, et non caché.** Un gérant ne lit que les ventes de sa boutique
          (D7) : sans cette phrase, une fiche incomplète se lirait comme une
          fiche vide, et quelqu'un en conclurait qu'un client n'a rien acheté
          alors qu'il a acheté ailleurs. */}
      {boutiqueId !== null && (
        <p className="mt-3 text-legende text-encre-doux">
          Seuls les achats faits dans cette boutique sont affichés. Le fichier client, lui, est
          commun à toutes les boutiques.
        </p>
      )}

      <Modale
        ouvert={correction}
        onFermer={() => setCorrection(false)}
        titre={`Corriger ${nomComplet(client)}`}
      >
        <FormulaireClient
          clients={lus}
          existant={client}
          surEnregistrement={() => setCorrection(false)}
          surAnnulation={() => setCorrection(false)}
        />
      </Modale>
    </div>
  );
}
