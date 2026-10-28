"use client";

import { Search, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { GardeEspace } from "@/components/GardeSession";
import { PanneauVentePiece } from "@/components/PanneauVentePiece";
import {
  ErreurDeLecture,
  EtatSansResultat,
  EtatVide,
} from "@/components/patrons/Etats";
import { FiltrePeriode } from "@/components/patrons/FiltrePeriode";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { AvecPanneau } from "@/components/patrons/PanneauLateral";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { nomDuClient } from "@/lib/domain/client";
import { formaterDate, formaterMontant } from "@/lib/domain/format";
import {
  PLAGE_VIDE,
  bornesPeriode,
  dansLaPeriode,
  libellePeriode,
  type Periode,
  type PlagePeriode,
} from "@/lib/domain/periode";
import {
  comparerVentesPieces,
  nombreArticles,
  resumeDesignations,
  venteCorrespond,
  type VentePiece,
} from "@/lib/domain/vente-piece";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterVentesPieces } from "@/lib/repositories/ventes-pieces";

export default function PageVentesPieces() {
  return (
    <GardeEspace espace="pieces">
      {/* `useSearchParams` impose cette frontière, sinon tout l'écran bascule en
          rendu dynamique. Repli vide : l'écran porte déjà son chargement. */}
      <Suspense fallback={null}>
        <VentesPieces />
      </Suspense>
    </GardeEspace>
  );
}

/**
 * L'historique des ventes de pièces (S64).
 *
 * **La liste ne quitte pas l'écran quand on ouvre un reçu.** Comme pour les
 * ventes de motos, c'est un tableau et le reçu s'ouvre dans un panneau à sa
 * droite ; la ligne ouverte se marque, et on passe de l'une à l'autre sans
 * reperdre sa recherche.
 *
 * Tout est filtré **en mémoire**, sur la collection chargée entière : une
 * recherche qui ne marche qu'en ligne ne sert à rien dans une application dont
 * le hors-ligne est la promesse. Le reçu, lui, est servi au panneau depuis
 * cette même liste — aucune seconde lecture.
 */
function VentesPieces() {
  const { perimetre } = usePerimetre();
  const router = useRouter();
  const parametres = useSearchParams();
  const surTitre = useSurTitre("Pièces");
  const venteOuverte = parametres.get("vente");

  const boutiqueId = perimetre.boutiqueId;
  const surUneBoutique = perimetre.type === "boutique";

  const [recherche, setRecherche] = useState("");
  const [periode, setPeriode] = useState<Periode>("tout");
  const [plage, setPlage] = useState<PlagePeriode>(PLAGE_VIDE);

  const souscrire = useCallback(
    (auChangement: (ventes: VentePiece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentesPieces(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: ventes, erreur, echec, reessayer } = useAbonnement(
    souscrire,
    "Les ventes n’ont pas pu être lues.",
  );

  const { clients } = useFichierClients();
  const nomParClient = useMemo(
    () => new Map(clients.map((client) => [client.id, nomDuClient(client)])),
    [clients],
  );
  /* Les ventes récentes portent le nom tapé au comptoir dans `clientId` ; les
     anciennes y portent un identifiant de fiche. On résout donc « id connu →
     nom de la fiche, sinon la chaîne EST le nom » — les deux générations
     s'affichent et se cherchent sans migration. */
  const nomDeVente = useCallback(
    (vente: VentePiece) => nomParClient.get(vente.clientId) || vente.clientId,
    [nomParClient],
  );

  const maintenant = useMemo(() => new Date(), []);

  const triees = useMemo(() => [...(ventes ?? [])].sort(comparerVentesPieces), [ventes]);

  const duPerimetre = useMemo(() => {
    const bornes = bornesPeriode(periode, maintenant, plage);
    if (bornes === null) return triees;
    return triees.filter((vente) => dansLaPeriode(vente.date, bornes));
  }, [triees, periode, plage, maintenant]);

  const resultats = useMemo(
    () =>
      duPerimetre.filter((vente) => venteCorrespond(vente, nomDeVente(vente), recherche)),
    [duPerimetre, nomDeVente, recherche],
  );

  const chargement = ventes === null;
  const total = triees.length;
  const nomPeriode = libellePeriode(periode, maintenant, plage);

  const venteAffichee = venteOuverte
    ? (ventes ?? []).find((vente) => vente.id === venteOuverte)
    : undefined;

  const colonnes: Colonne<VentePiece>[] = [
    {
      cle: "numero",
      titre: "Reçu",
      chiffre: true,
      rendu: (vente) => (
        <Link
          href={`/pieces/ventes?vente=${vente.id}`}
          className="plaque-code text-encre underline decoration-bord underline-offset-4 hover:decoration-encre"
        >
          {vente.numero}
        </Link>
      ),
    },
    {
      cle: "date",
      titre: "Date",
      rendu: (vente) => (vente.date ? formaterDate(vente.date) : "—"),
    },
    {
      cle: "client",
      titre: "Client",
      rendu: (vente) =>
        nomDeVente(vente) || <span className="text-encre-doux">Comptoir</span>,
    },
    {
      cle: "articles",
      titre: "Articles",
      principal: true,
      rendu: (vente) => (
        <>
          {resumeDesignations(vente)}
          <span className="block text-sm text-encre-doux">
            {nombreArticles(vente)} article{nombreArticles(vente) > 1 ? "s" : ""}
          </span>
        </>
      ),
    },
    {
      cle: "total",
      titre: "Total",
      chiffre: true,
      rendu: (vente) => formaterMontant(vente.total),
    },
  ];

  return (
    <div className="ecran-plein">
      <TetePage
        surTitre={surTitre}
        titre="Ventes"
        sousTitre={
          surUneBoutique
            ? "Les ventes de pièces de cette boutique, de la plus récente à la plus ancienne."
            : "Les ventes de pièces de toutes les boutiques réunies. Choisissez-en une pour n’en voir qu’une."
        }
        actions={
          surUneBoutique ? (
            <Link href="/pieces/vendre" className="bouton bouton-principal">
              <ShoppingCart aria-hidden="true" className="size-4" />
              Vendre
            </Link>
          ) : null
        }
      />

      <FiltrePeriode
        periode={periode}
        changer={setPeriode}
        plage={plage}
        changerPlage={setPlage}
        className="mb-4"
      />

      <AvecPanneau
        panneau={venteAffichee ? <PanneauVentePiece vente={venteAffichee} /> : null}
      >
        {erreur && ventes === null ? (
          <ErreurDeLecture
            titre="La liste des ventes n’a pas pu être lue"
            echec={echec}
            reessayer={reessayer}
            sortie={{ href: "/pieces", libelle: "Aller au catalogue" }}
          >
            {erreur} Les ventes déjà lues aujourd’hui restent consultables sur cet appareil.
          </ErreurDeLecture>
        ) : !chargement && total === 0 ? (
          <EtatVide
            titre="Aucune vente de pièces"
            action={
              surUneBoutique ? (
                <Link href="/pieces/vendre" className="bouton bouton-principal">
                  Enregistrer une vente
                </Link>
              ) : undefined
            }
          >
            Les ventes faites au comptoir apparaîtront ici, avec leur reçu.
          </EtatVide>
        ) : (
          <div className="cadre cadre-tableau">
            <div className="cadre-tete">
              <div className="relative min-w-56 flex-1 sm:max-w-80">
                <label htmlFor="recherche-vente-piece" className="sr-only">
                  Chercher une vente
                </label>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
                />
                <input
                  id="recherche-vente-piece"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  placeholder="Numéro de reçu, client, ou pièce"
                  value={recherche}
                  onChange={(evenement) => setRecherche(evenement.target.value)}
                  className="saisie pr-3 pl-9 placeholder:text-encre-doux"
                />
              </div>

              <p
                aria-live="polite"
                aria-atomic="true"
                className="ml-auto text-corps text-encre-doux"
              >
                {chargement ? (
                  "Chargement des ventes…"
                ) : (
                  <>
                    <strong className="font-semibold text-encre">
                      {resultats.length === 1 ? "1 vente" : `${resultats.length} ventes`}
                    </strong>
                    {resultats.length !== total && ` sur ${total}`} · {nomPeriode}
                  </>
                )}
              </p>
            </div>

            {chargement ? (
              <Tableau
                legende="Chargement des ventes"
                colonnes={colonnes}
                lignes={[]}
                cleDe={(vente) => vente.id}
                chargement
              />
            ) : resultats.length === 0 ? (
              <EtatSansResultat className="m-4">
                Aucune vente ne correspond. Essayez un autre terme, ou élargissez la période.
              </EtatSansResultat>
            ) : (
              <Tableau
                legende="Ventes de pièces, de la plus récente à la plus ancienne"
                colonnes={colonnes}
                lignes={resultats}
                cleDe={(vente) => vente.id}
                cleActive={venteOuverte}
                ouvrir={(vente) => router.push(`/pieces/ventes?vente=${vente.id}`)}
              />
            )}
          </div>
        )}
      </AvecPanneau>
    </div>
  );
}
