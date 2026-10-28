"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { CartesVentes } from "@/components/CartesVentes";
import { FicheVente } from "@/components/FicheVente";
import { PanneauRecu } from "@/components/PanneauRecu";
import { FiltrePeriode } from "@/components/patrons/FiltrePeriode";
import { ModaleVente } from "@/components/ModaleVente";
import { lireVentePreparee } from "@/lib/ia/gestes";
import {
  ErreurDeLecture,
  EtatVide,
  PastillePaiement,
  SansBoutique,
} from "@/components/patrons/Etats";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { AvecPanneau } from "@/components/patrons/PanneauLateral";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import {
  formaterTelephone,
  nomDuClient,
  normaliserNom,
  type Client,
} from "@/lib/domain/client";
import { nomDeBoutique } from "@/lib/domain/boutique";
import { formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import {
  LIBELLE_MODE,
  LIBELLE_STATUT_PAIEMENT,
  STATUTS_PAIEMENT,
  bilanVentes,
  chercherVentes,
  comparerVentes,
  type StatutPaiement,
  type Vente,
  type VenteCherchable,
} from "@/lib/domain/vente";
import {
  PLAGE_VIDE,
  bornesPeriode,
  dansLaPeriode,
  type Periode,
  type PlagePeriode,
} from "@/lib/domain/periode";
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
  const parametres = useSearchParams();
  const venteOuverte = parametres.get("vente");
  /* Les reçus n'ont plus d'écran à eux (S54) : ils s'ouvrent dans le panneau
     de cet écran-ci. Le reçu l'emporte sur la fiche quand les deux paramètres
     sont là — on vient de cliquer dessus, c'est lui qu'on veut voir. */
  const recuOuvert = parametres.get("recu");
  /* La modale s'ouvre par un paramètre d'écran, comme les fiches : une route
     `/motos/ventes/nouvelle` obligeait le navigateur à demander au serveur un
     document que le service worker sert déjà sous `/motos/ventes` (D39). Le
     paramètre `nouvelle` est donc ignoré par le cache de précharge — la ligne
     est dans `app/sw.ts`, et l'oubli ne se verrait qu'en coupure. */
  const modaleOuverte = parametres.get("nouvelle") === "1";
  const router = useRouter();
  const { perimetre, boutiques, chargement: perimetreEnCours } = usePerimetre();
  const toutesBoutiques = perimetre.type === "toutes";
  /* Avant tout retour anticipé : un hook appelé sous condition change l'ordre
     des hooks d'un rendu à l'autre (règle de React, vue par le lint). */
  const surTitre = useSurTitre("Motos");
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<StatutPaiement | "">("");
  /* La période n'est pas un paramètre d'écran, à la différence de la vente
     ouverte et de la modale : un lien « ce mois-ci » partagé ne veut plus dire
     la même chose le mois suivant, et l'état local ne pose pas la question. */
  const [periode, setPeriode] = useState<Periode>("tout");
  const [plage, setPlage] = useState<PlagePeriode>(PLAGE_VIDE);

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

  /* `maintenant` est figé sur la durée du rendu : calculer les bornes et le
     libellé sur deux `new Date()` différents ferait diverger l'un de l'autre à
     la seconde près d'un changement de mois. */
  const maintenant = useMemo(() => new Date(), []);

  /* La période borne le périmètre : les cartes et le tableau lisent la même
     liste. La recherche et le statut, eux, servent à retrouver une ligne dans
     ce périmètre — ils ne redéfinissent pas ce dont on parle, et le comptage
     « 3 ventes sur 12 » dit déjà leur effet. */
  const duPerimetre = useMemo(() => {
    const bornes = bornesPeriode(periode, maintenant, plage);
    if (bornes === null) return cherchables;
    return cherchables.filter((ligne) => dansLaPeriode(ligne.vente.date, bornes));
  }, [cherchables, periode, plage, maintenant]);

  const resultats = useMemo(() => {
    const trouves = chercherVentes(duPerimetre, recherche, normaliserNom);
    return statut ? trouves.filter((ligne) => ligne.vente.statutPaiement === statut) : trouves;
  }, [duPerimetre, recherche, statut]);

  const colonnes = useMemo<Colonne<Cherchable>[]>(() => {
    const liste: Colonne<Cherchable>[] = [
      /* **La colonne « Pièce » est partie** (26 octobre 2026, demande du
         commanditaire). Le numéro de reçu reste dans le panneau de la vente,
         où on le lit quand on en a besoin ; en tête de liste il servait
         surtout de poignée pour ouvrir la ligne. C'est donc le nom du client
         qui porte le lien désormais — c'est par lui qu'on cherche. */
      {
        cle: "client",
        titre: "Client",
        principal: true,
        rendu: (ligne) => (
          <Link
            href={`/motos/ventes?vente=${ligne.vente.id}`}
            aria-current={ligne.vente.id === venteOuverte ? "true" : undefined}
            className="block text-encre underline-offset-2 hover:underline"
          >
            {nomDuClient(ligne.client)}
            {/* Le numéro sous le nom : au comptoir, deux clients portent le
                même nom et c'est le téléphone qui les départage — c'est aussi
                ce qu'on compose pour rappeler un impayé. */}
            {ligne.client?.telephone && (
              <span className="block font-code text-legende font-normal text-encre-doux">
                {formaterTelephone(ligne.client.telephone)}
              </span>
            )}
          </Link>
        ),
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
      /* **Le châssis revient, et il coûte de la largeur.** Il avait été retiré
         parce que dix-sept caractères insécables poussaient « Paiement » hors
         du cadre. Le commanditaire le redemande : c'est par lui qu'on relie un
         papier à une ligne. Le tableau défile donc de côté sur un petit écran,
         et c'est le prix assumé. */
      {
        cle: "chassis",
        titre: "Numéro de châssis",
        titreReplie: "Châssis",
        chiffre: true,
        rendu: (ligne) => ligne.moto?.numeroChassis ?? "—",
      },
      { cle: "mode", titre: "Mode", rendu: (ligne) => LIBELLE_MODE[ligne.vente.modePaiement] },
      /* **Les trois montants se lisent ensemble, dans cet ordre** : ce qui a
         été convenu, ce qui est rentré, ce qui manque. Pris isolément, « reste
         dû : 415 000 » ne dit pas si le client a versé la moitié ou rien. */
      {
        cle: "prix",
        titre: "Prix de vente (FCFA)",
        titreReplie: "Prix de vente",
        chiffre: true,
        rendu: (ligne) => formaterNombre(ligne.vente.prixConvenu),
      },
      {
        cle: "verse",
        titre: "Versé (FCFA)",
        titreReplie: "Versé",
        chiffre: true,
        rendu: (ligne) => formaterNombre(ligne.vente.totalPaye),
      },
      {
        /* La devise est titrée une fois, en tête de colonne. **Zéro et non un
           tiret** : le tiret se lisait « on ne sait pas », là où une vente
           soldée dit quelque chose de précis — il ne reste rien à percevoir. */
        cle: "reste",
        titre: "Reste dû (FCFA)",
        chiffre: true,
        rendu: (ligne) => formaterNombre(ligne.vente.resteDu),
      },
      {
        cle: "paiement",
        titre: "Paiement",
        rendu: (ligne) => <PastillePaiement statut={ligne.vente.statutPaiement} />,
      },
    ];
    /* **La colonne « Boutique » revient sur « Toutes les boutiques »** (28
       octobre 2026). Elle avait été écartée parce que le numéro de pièce
       portait déjà le code de la boutique ; ce numéro a quitté la liste le 26,
       et plus rien ne distinguait une vente d'une autre — « tout est
       mélangé », dit le commanditaire. Sur une seule boutique, elle serait
       constante : elle n'y paraît pas. */
    if (toutesBoutiques) {
      liste.splice(1, 0, {
        cle: "boutique",
        titre: "Boutique",
        rendu: (ligne) => nomDeBoutique(boutiques, ligne.vente.boutiqueId),
      });
    }
    return liste;
  }, [catalogue, venteOuverte, toutesBoutiques, boutiques]);

  if (perimetre.type === "aucune")
    return (
      <SansBoutique
        titre="Ventes"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : une vente n’a pas encore d’endroit où exister."
      />
    );

  /* Enregistrer une vente réclame un `boutiqueId` : le geste n'existe pas tant
     qu'aucune boutique n'est choisie (S54). */
  const dansUneBoutique = perimetre.type === "boutique";

  /* `total` est le registre entier : c'est lui qui décide si la boutique n'a
     jamais rien vendu — une période vide n'est pas un registre vide, et
     proposer « enregistrez la première vente » à qui consulte le mois dernier
     serait faux. */
  const total = cherchables.length;
  const chargement = ventes === null && !erreur;
  const bilan = bilanVentes(duPerimetre.map((ligne) => ligne.vente));

  /* Ouvrir et fermer la modale ne perd pas la fiche ouverte derrière : les
     deux paramètres d'écran cohabitent, et fermer l'une ne referme pas
     l'autre. */
  const adresse = (avecModale: boolean) => {
    const parts = [
      venteOuverte ? `vente=${venteOuverte}` : null,
      avecModale ? "nouvelle=1" : null,
    ].filter(Boolean);
    return parts.length > 0 ? `/motos/ventes?${parts.join("&")}` : "/motos/ventes";
  };
  const ouvrirLaModale = () => router.push(adresse(true), { scroll: false });
  const fermerLaModale = () => router.replace(adresse(false), { scroll: false });

  return (
    <div className="ecran-plein">
      <TetePage
        surTitre={surTitre}
        titre="Ventes"
        /* Une vente se fait dans une boutique (S54) : sur « Toutes les
           boutiques », il n'y a pas de `boutiqueId` à inscrire dessus, et le
           bouton n'ouvrait qu'une modale qui l'aurait réclamé. Absent plutôt
           que grisé — un bouton grisé invite à chercher ce qui le débloque
           (`DESIGN.md`), alors que la réponse est dans le bandeau du haut.
           Même geste que sur `/pieces` et sur le stock. */
        actions={
          dansUneBoutique ? (
            <button type="button" onClick={ouvrirLaModale} className="bouton bouton-principal">
              <Plus aria-hidden="true" className="size-4" />
              Nouvelle vente
            </button>
          ) : null
        }
      />

      {/* Lus des ventes déjà affichées, jamais stockés (D61), et sans marge
          (D2). Ils portent le périmètre courant : « toutes boutiques » les
          somme, une boutique les borne — c'est l'écoute qui en décide, pas
          cette carte. */}
      {/* Au-dessus des cartes, et non dans l'en-tête du tableau avec la
          recherche : c'est lui qui décide ce que les quatre chiffres
          additionnent. Rangé en bas avec les autres filtres, on l'actionnerait
          à 390 px sans voir bouger ce qu'il change — les cartes seraient déjà
          sorties de l'écran. La recherche et les statuts, eux, restent là où
          ils agissent, sur le tableau. */}
      <FiltrePeriode
        periode={periode}
        changer={setPeriode}
        plage={plage}
        changerPlage={setPlage}
        className="mb-4"
      />

      <CartesVentes bilan={bilan} />

      {modaleOuverte && (
        /* L’assistant ouvre cette modale déjà remplie en passant par l’adresse
           (S57). Un paramètre illisible est ignoré, pas repris : une adresse
           se bricole à la main. */
        <ModaleVente onFermer={fermerLaModale} depart={lireVentePreparee(parametres) ?? undefined} />
      )}

      <AvecPanneau
        panneau={
          recuOuvert ? (
            <PanneauRecu cle={recuOuvert} />
          ) : venteOuverte ? (
            <FicheVente id={venteOuverte} />
          ) : null
        }
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
          <AucuneVente
            perimetreEnCours={perimetreEnCours}
            dansUneBoutique={dansUneBoutique}
            surCreation={ouvrirLaModale}
          />
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
              null
            ) : (
              <Tableau
                legende="Ventes de la boutique, de la plus récente à la plus ancienne"
                colonnes={colonnes}
                lignes={resultats}
                cleDe={(ligne) => ligne.vente.id}
                cleActive={venteOuverte}
                /* **La ligne entière ouvre la fiche** (27 octobre 2026) : « fais
                   que toute la ligne de la vente puisse ouvrir la fiche, pas le
                   nom uniquement ». Le lien du nom reste — une `<tr>` ne se met
                   pas au clavier, et lui seul sert le clavier et le lecteur
                   d'écran. */
                ouvrir={(ligne) => router.push(`/motos/ventes?vente=${ligne.vente.id}`)}
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
function Recherche({
  valeur,
  changer,
}: {
  valeur: string;
  changer: (valeur: string) => void;
}) {
  /* Bornée comme les autres recherches du produit, et comme le socle des
     maquettes qui la fixe à `min(360px, 32vw)` (`socle.css:448`). Sans
     borne elle traversait la moitié de l'écran depuis que `.saisie` a
     rendu sa largeur à la mise en page — mesuré, pas estimé. */
  return (
    <div className="relative min-w-56 flex-1 sm:max-w-80">
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

function AucuneVente({
  perimetreEnCours,
  dansUneBoutique,
  surCreation,
}: {
  perimetreEnCours: boolean;
  dansUneBoutique: boolean;
  surCreation: () => void;
}) {
  if (perimetreEnCours) return null;
  return (
    <EtatVide
      /* Même règle qu'en tête d'écran (S54) : sans boutique, le geste n'a pas
         de destination, et le vide dit alors quoi faire d'abord. */
      action={
        dansUneBoutique ? (
          <button type="button" onClick={surCreation} className="bouton bouton-principal">
            <Plus aria-hidden="true" className="size-4" />
            Enregistrer la première
          </button>
        ) : undefined
      }
    />
  );
}
