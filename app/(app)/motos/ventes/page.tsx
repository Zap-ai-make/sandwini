"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { FicheVente } from "@/components/FicheVente";
import {
  ErreurDeLecture,
  EtatSansResultat,
  EtatVide,
  SansBoutique,
} from "@/components/patrons/Etats";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { AvecPanneau } from "@/components/patrons/PanneauLateral";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { normaliserNom, type Client } from "@/lib/domain/client";
import { formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import {
  LIBELLE_MODE,
  LIBELLE_STATUT_PAIEMENT,
  STATUTS_PAIEMENT,
  chercherVentes,
  comparerVentes,
  type StatutPaiement,
  type Vente,
  type VenteCherchable,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes } from "@/lib/repositories/ventes";

/**
 * Les ventes de la boutique.
 *
 * Un champ unique en haut, comme le demande le §6.4 : on tape ce qu'on a — le
 * nom du client, son numéro, le numéro du reçu qu'il tend, ou le châssis relevé
 * sur la moto — et la liste se réduit. C'est le geste qu'on répète vingt fois
 * par jour ; enregistrer une vente n'arrive que quelques fois.
 *
 * **La liste ne quitte plus l'écran quand on ouvre une vente.** Elle empilait
 * des cartes, et la fiche les remplaçait : on revenait, la recherche était à
 * refaire et la position perdue. C'est un tableau, et la fiche s'ouvre à sa
 * droite dans un panneau — ce que `CAHIER-UI.md` §7 demande pour tout écran où
 * le contexte compte. La ligne ouverte se marque, on passe de l'une à l'autre
 * sans rien reperdre.
 *
 * Tout est filtré en mémoire, sur des collections chargées entières : une
 * recherche qui ne marche qu'en ligne ne sert à rien dans une application dont
 * le hors-ligne est la promesse.
 */
export default function PageVentes() {
  return (
    <Suspense fallback={null}>
      <Ventes />
    </Suspense>
  );
}

function Ventes() {
  const venteOuverte = useSearchParams().get("vente");
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  /* Avant tout retour anticipé : un hook appelé sous condition change l'ordre
     des hooks d'un rendu à l'autre (règle de React, vue par le lint). */
  const surTitre = useSurTitre("Motos");
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<StatutPaiement | "">("");

  const boutiqueId = perimetre.boutiqueId;

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const {
    valeur: ventes,
    erreur,
    echec,
    reessayer,
  } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être chargées.",
  );

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être chargé.");

  const cherchables = useMemo<Cherchable[]>(() => {
    const parClient = new Map(clients.map((client) => [client.id, client]));
    const parMoto = new Map((stock ?? []).map((moto) => [moto.id, moto]));

    return [...(ventes ?? [])].sort(comparerVentes).map((vente) => {
      const client = parClient.get(vente.clientId);
      const moto = parMoto.get(vente.motoId);
      return {
        vente,
        client,
        moto,
        nomNormalise: client?.nomNormalise ?? "",
        telephones: client
          ? [client.telephoneNormalise, client.telephone, client.telephone2]
              .map((valeur) => valeur.replace(/[^0-9]/g, ""))
              .filter(Boolean)
          : [],
        chassis: moto?.numeroChassis ?? "",
      };
    });
  }, [ventes, clients, stock]);

  const resultats = useMemo(() => {
    const trouves = chercherVentes(cherchables, recherche, normaliserNom);
    return statut ? trouves.filter((ligne) => ligne.vente.statutPaiement === statut) : trouves;
  }, [cherchables, recherche, statut]);

  const colonnes = useMemo<Colonne<Cherchable>[]>(() => {
    const liste: Colonne<Cherchable>[] = [
      {
        cle: "numero",
        titre: "Pièce",
        principal: true,
        rendu: (ligne) => (
          <Link
            href={`/motos/ventes?vente=${ligne.vente.id}`}
            aria-current={ligne.vente.id === venteOuverte ? "true" : undefined}
            className="plaque-code whitespace-nowrap text-encre underline-offset-2 hover:underline"
          >
            {ligne.vente.numero}
          </Link>
        ),
      },
      {
        cle: "client",
        titre: "Client",
        principal: true,
        rendu: (ligne) => ligne.client?.nom ?? "Client inconnu",
      },
      {
        /* Le modèle seul. Le châssis y a figuré une capture durant — la
           recherche l'accepte, et une ligne qui ne le montre pas ne dit pas
           pourquoi elle a répondu — mais dix-sept caractères en Plex Mono
           insécables poussaient le tableau au-delà de la place que le panneau
           lui laisse : la colonne « Paiement » sortait à moitié du cadre. Il
           est dans le panneau, à deux lignes de là, sur la vente qu'on vient
           d'ouvrir. */
        cle: "moto",
        titre: "Moto",
        rendu: (ligne) =>
          ligne.moto
            ? `${catalogue.nomMarque(ligne.moto.marqueId)} ${catalogue.nomModele(ligne.moto.modeleId)}`
            : "Moto hors de ce périmètre",
      },
      { cle: "mode", titre: "Mode", rendu: (ligne) => LIBELLE_MODE[ligne.vente.modePaiement] },
      {
        /* La devise est titrée une fois, en tête de colonne. Le tiret dit
           « rien à percevoir » sans faire croire à une donnée manquante. */
        cle: "reste",
        titre: "Reste dû (FCFA)",
        chiffre: true,
        rendu: (ligne) =>
          ligne.vente.resteDu === 0 ? "—" : formaterNombre(ligne.vente.resteDu),
      },
      {
        cle: "paiement",
        titre: "Paiement",
        rendu: (ligne) => <Paiement statut={ligne.vente.statutPaiement} />,
      },
    ];
    /* Pas de colonne « Boutique » : les trois premières lettres du numéro de
       pièce la disent déjà, sur chaque ligne, et un second pavé jaune juste à
       côté ne fait que diluer le signal (D70). C'est ce que montrent les
       maquettes A6, A7 et A8 — aucune des trois n'a cette colonne, y compris
       pour le responsable qui regarde toutes les boutiques. Le stock (A4) la
       garde : une moto n'a pas de numéro de pièce, donc rien ne la porte. */
    return liste;
  }, [catalogue, venteOuverte]);

  if (perimetre.type === "aucune")
    return (
      <SansBoutique
        titre="Ventes"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : une vente n’a pas encore d’endroit où exister."
      />
    );

  const total = cherchables.length;
  const enCours = resultats.filter((ligne) => ligne.vente.resteDu > 0).length;
  const chargement = ventes === null && !erreur;

  return (
    <div>
      <TetePage
        surTitre={surTitre}
        titre="Ventes"
        actions={
          <Link href="/motos/ventes/nouvelle" className="bouton bouton-principal">
            <Plus aria-hidden="true" className="size-4" />
            Nouvelle vente
          </Link>
        }
      />

      <AvecPanneau
        panneau={venteOuverte ? <FicheVente id={venteOuverte} /> : null}
      >
        {/* Une erreur avant toute donnée ne laisse rien à encadrer : le cadre
            vide, filtres compris, ferait croire à une boutique sans vente. */}
        {erreur && ventes === null ? (
          <ErreurDeLecture
            titre="La liste des ventes n’a pas pu être lue"
            echec={echec}
            reessayer={reessayer}
            sortie={{ href: "/motos", libelle: "Aller au stock" }}
          >
            {erreur} Les ventes déjà lues aujourd’hui restent consultables sur cet appareil, et une
            nouvelle vente peut être enregistrée normalement&nbsp;: elle n’a pas besoin de cette
            lecture.
          </ErreurDeLecture>
        ) : !chargement && total === 0 ? (
          <AucuneVente perimetreEnCours={perimetreEnCours} />
        ) : (
          <div className="cadre cadre-tableau">
            <div className="cadre-tete">
              <Recherche valeur={recherche} changer={setRecherche} />

              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Filtrer les ventes"
              >
                <button
                  type="button"
                  className="filtre"
                  aria-pressed={statut === ""}
                  onClick={() => setStatut("")}
                >
                  Toutes
                </button>
                {STATUTS_PAIEMENT.map((valeur) => (
                  <button
                    key={valeur}
                    type="button"
                    className="filtre"
                    aria-pressed={statut === valeur}
                    onClick={() => setStatut((actuel) => (actuel === valeur ? "" : valeur))}
                  >
                    {LIBELLE_STATUT_PAIEMENT[valeur]}
                  </button>
                ))}
              </div>

              {/* Le comptage se lit avant le tableau : c'est lui qui dit si la
                  recherche a mangé la vente qu'on cherchait. `aria-live` sans
                  `role` : la coquille n'a qu'un seul `status`, le bandeau. */}
              <p aria-live="polite" aria-atomic="true" className="ml-auto text-corps text-encre-doux">
                {chargement ? (
                  "Chargement des ventes…"
                ) : (
                  <>
                    <strong className="font-semibold text-encre">
                      {resultats.length === 1 ? "1 vente" : `${resultats.length} ventes`}
                    </strong>
                    {resultats.length !== total && ` sur ${total}`} · {enCours} en cours
                  </>
                )}
              </p>
            </div>

            {chargement ? (
              <Tableau
                legende="Chargement des ventes"
                colonnes={colonnes}
                lignes={[]}
                cleDe={(ligne) => ligne.vente.id}
                chargement
              />
            ) : resultats.length === 0 ? (
              <EtatSansResultat className="m-4">
                Aucune vente ne correspond. Essayez le numéro de téléphone, le numéro du reçu, ou
                élargissez les filtres.
              </EtatSansResultat>
            ) : (
              <Tableau
                legende="Ventes de la boutique, de la plus récente à la plus ancienne"
                colonnes={colonnes}
                lignes={resultats}
                cleDe={(ligne) => ligne.vente.id}
                cleActive={venteOuverte}
              />
            )}
          </div>
        )}
      </AvecPanneau>
    </div>
  );
}

type Cherchable = VenteCherchable & {
  client: Client | undefined;
  moto: Moto | undefined;
};

/* Jamais la couleur seule : le mot est écrit, la pastille ne fait que le
   doubler. L'impayé prend la braise — c'est du retard —, le partiel le bleu de
   la goutte : quelque chose est parti et n'est pas revenu (D70). */
const TON_PAIEMENT: Record<StatutPaiement, string> = {
  impaye: "pastille-retard",
  partiel: "pastille-transit",
  solde: "pastille-solde",
};

function Paiement({ statut }: { statut: StatutPaiement }) {
  return (
    <span className={`pastille ${TON_PAIEMENT[statut]}`}>{LIBELLE_STATUT_PAIEMENT[statut]}</span>
  );
}

function Recherche({
  valeur,
  changer,
}: {
  valeur: string;
  changer: (valeur: string) => void;
}) {
  return (
    <div className="relative min-w-56 flex-1">
      <label htmlFor="recherche-vente" className="sr-only">
        Chercher une vente
      </label>
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
        value={valeur}
        onChange={(evenement) => changer(evenement.target.value)}
        className="saisie pr-3 pl-9 placeholder:text-encre-doux"
      />
    </div>
  );
}

function AucuneVente({ perimetreEnCours }: { perimetreEnCours: boolean }) {
  if (perimetreEnCours) return null;
  return (
    <EtatVide
      titre="Aucune vente enregistrée pour l’instant."
      action={
        <Link href="/motos/ventes/nouvelle" className="bouton bouton-principal">
          <Plus aria-hidden="true" className="size-4" />
          Enregistrer la première
        </Link>
      }
    >
      Une vente demande une moto en stock et un client. Le client peut se créer au moment de la
      vente, sans quitter l’écran.
    </EtatVide>
  );
}
