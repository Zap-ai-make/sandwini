"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ConfierPaquetModal } from "@/components/ConfierPaquetModal";
import { HistoriqueDesDeparts } from "@/components/HistoriqueDesDeparts";
import { PaquetsEnCours } from "@/components/PaquetsEnCours";
import { RelaisDocument } from "@/components/RelaisDocument";
import { ErreurDeLecture } from "@/components/patrons/Etats";
import { Onglets } from "@/components/patrons/Onglets";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { nomDuClient, normaliserNom } from "@/lib/domain/client";
import {
  chercherDossiers,
  dossiersEnAttente,
  LIBELLE_ETAT_PAPIER,
  passeParUnPrestataire,
  type EtatPapier,
  type PapierDuDossier,
  FILTRES_ETAT,
  LIBELLE_FILTRE_ETAT,
  type DossierEnAttente,
  type FiltreEtat,
} from "@/lib/domain/dossier";
import { compter } from "@/lib/domain/format";
import {
  LIBELLE_DOCUMENT,
  TYPES_DOCUMENT,
  type DocumentDossier,
  type TypeDocument,
  type Vente,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import type { Moto } from "@/lib/domain/moto";
import {
  cartesAConfier,
  cartesConfiables,
  historiqueDesDeparts,
  type PaquetCartesGrises,
} from "@/lib/domain/paquet";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterPaquets } from "@/lib/repositories/paquets";
import type { DossierCarteGrise } from "@/lib/domain/dossier-carte-grise";
import { ecouterDossiersCarteGrise } from "@/lib/repositories/dossiers-carte-grise";

/**
 * La liste vide, **partagée par tous les rendus**.
 *
 * Un `?? []` écrit dans un `useMemo` fabrique un tableau neuf à chaque rendu :
 * le compilateur React n'arrive plus à préserver la mémoïsation manuelle du
 * composant, et le signale en **erreur** de compilation. Une constante de
 * module a la même identité à chaque fois, et le problème disparaît.
 */
const AUCUN_DOSSIER: DossierCarteGrise[] = [];
import { ecouterDossiers, ecouterRetoursCartes, ecouterVentes } from "@/lib/repositories/ventes";

/**
 * Les dossiers en attente (§7.3).
 *
 * Une file, pas un journal : du plus ancien au plus récent, et l’on n’y voit
 * que ce qui reste à faire. Le tri et les filtres vivent dans
 * `lib/domain/dossier.ts`, en fonctions pures testées — l’écran ne fait que les
 * nourrir et les rendre.
 *
 * **Une seule colonne de papier : la carte grise** (16 octobre 2026). La
 * question que cet écran pose est « qui détient quel papier, et depuis quand ».
 * Or un seul des trois part chez quelqu'un. La quittance et le CMC arrivent
 * avec la moto et se cochent sur le lot à l'arrivée : ils n'attendent personne,
 * et deux colonnes qui répétaient « À faire » sur chaque ligne noyaient la
 * seule qu'on venait lire.
 *
 * Le commanditaire l'a tranché ainsi : « comme la quittance et le CMC sont
 * directement cochables dans la liste du lot, on peut se contenter de cela ».
 * La clôture a suivi dans le même mouvement (`dossierCloturable`) — sans quoi
 * cette file aurait montré des dossiers à carte grise verte, toujours
 * « ouverts », sans qu'une seule colonne ne dise pourquoi.
 *
 * Les colonnes ne se dérivent donc plus de `TYPES_DOCUMENT` mais des types qui
 * **passent par un prestataire**. Ce n'est pas un cas particulier écrit à la
 * main : la prochaine pièce confiée à l'extérieur reprendra cette colonne telle
 * quelle, comme la plaque l'avait fait jusqu'à S48.
 *
 * **Et le papier avance sans quitter l’écran.** Cliquer un document ouvre son
 * relais sous le tableau : le chemin entier, et le geste suivant. Il fallait
 * auparavant ouvrir la vente pour faire avancer un document, c’est-à-dire
 * quitter la file qu’on est en train de vider.
 *
 * **Tout est filtré en mémoire.** Le retard dépend de la date du jour : une
 * requête Firestore figée serait fausse dès le lendemain. Et un filtre qui ne
 * marcherait qu’en ligne ne servirait à rien au comptoir.
 */
export default function PageDossiers() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const { clients } = useFichierClients();
  const [recherche, setRecherche] = useState("");
  const [etat, setEtat] = useState<FiltreEtat | "">("");
  /* Le document dont on lit le relais. Sa clé, pas l’objet : celui-ci change à
     chaque écriture du serveur, et le relais doit suivre. */
  const [documentOuvert, setDocumentOuvert] = useState<string | null>(null);
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

  /* **L'écoute du stock est le coût de S53, et il est assumé.** L'état affiché
     d'un papier se calcule sur trois sources dont la MOTO (`quittanceRecue`,
     `cmcRecu`), que cet écran ne chargeait pas. C'est la même écoute que celle
     de l'écran des motos — une requête de plus sur une collection déjà lue
     ailleurs, pas une collection de plus — et c'est ce qui fait qu'une case
     cochée à l'arrivage avance le dossier sans qu'on y touche. */
  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: motos } = useAbonnement(
    souscrireStock,
    "Le stock n’a pas pu être lu.",
  );

  /* Les paquets de la boutique. La liste est courte par construction — un
     paquet vit quelques semaines — et le tri se fait en mémoire : un `orderBy`
     demanderait un index composite pour quelques dizaines de lignes. */
  const souscrirePaquets = useCallback(
    (auChangement: (paquets: PaquetCartesGrises[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterPaquets(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: paquets } = useAbonnement(
    souscrirePaquets,
    "Les paquets de cartes grises n’ont pas pu être lus.",
  );

  /* **Le jour où chaque carte est revenue, lu dans le journal des passages.**
     Rien ne l'enregistre sur le document — seulement le fait qu'elle soit
     revenue. Sans cette lecture, l'historique n'aurait de date de retour que
     pour l'avenir, et resterait muet sur tout ce qui s'est déjà passé. */
  const souscrireRetours = useCallback(
    (auChangement: (retours: Map<string, Date>) => void, enErreur: (cause: unknown) => void) =>
      ecouterRetoursCartes(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: retours, erreur: erreurRetours } = useAbonnement(
    souscrireRetours,
    "Les retours de cartes grises n’ont pas pu être lus.",
  );

  const souscrireDossiers = useCallback(
    (auChangement: (documents: DocumentDossier[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterDossiers(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: documents } = useAbonnement(
    souscrireDossiers,
    "L’état des dossiers n’a pas pu être lu.",
  );

  /**
   * Les dossiers de la nouvelle collection (S59).
   *
   * **Cet écran continue de lire les documents des ventes**, qui portent tout
   * l'existant. Cette seconde lecture ne sert pas à l'affichage : elle donne au
   * dépôt la seconde face des cartes, celle qu'il doit écrire pour que l'écran
   * des cartes grises ne continue pas d'annoncer au magasin une carte partie.
   *
   * Un échec ne bloque rien ici : la liste reste juste, et seul l'écran d'à
   * côté serait en retard — ce qui vaut mieux qu'un écran de dossiers qui
   * refuse de s'ouvrir.
   */
  const souscrireCartesGrises = useCallback(
    (auChangement: (dossiers: DossierCarteGrise[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterDossiersCarteGrise(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: dossiersCG } = useAbonnement(
    souscrireCartesGrises,
    "Les dossiers de carte grise n’ont pas pu être lus.",
  );


  const parClient = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);

  /* **La sélection est un ensemble d'identifiants de VENTE**, pas de documents :
     un document se recharge à chaque écriture du serveur, un identifiant non.
     Cocher une ligne puis voir la sélection se vider parce qu'une autre
     boutique a écrit serait incompréhensible. */
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [paquetOuvert, setPaquetOuvert] = useState(false);
  /* Deux vues du même sujet : ce qui attend, et ce qui est passé. Le client ne
     veut plus d'une file d'attente seule — « juste dossiers en cours,
     historiques de tout ce qui est parti ». */
  const [vue, setVue] = useState<"cours" | "historique">("cours");

  const basculer = useCallback((venteId: string, choisi: boolean) => {
    setChoisies((anciennes) => {
      const suivantes = new Set(anciennes);
      if (choisi) suivantes.add(venteId);
      else suivantes.delete(venteId);
      return suivantes;
    });
    /* `setChoisies` est stable, mais le compilateur React l'infère comme
       dépendance et refuse une liste qui ne la cite pas. Le dire ne change
       rien à l'exécution, et lui rend la mémoïsation du composant. */
  }, [setChoisies]);

  /* Ce qui peut partir, calculé UNE fois par `cartesConfiables` plutôt que relu
     case par case : c'est elle qui porte la règle — une carte déjà dehors n'y
     entre pas —, et la dupliquer dans le rendu la ferait diverger le jour où un
     statut s'ajouterait. */
  const confiables = useMemo(
    () => new Set(cartesConfiables(documents ?? []).map((carte) => carte.venteId)),
    [documents],
  );

  /**
   * La date du jour, prise **une fois par rendu**.
   *
   * Recalculée à chaque ligne, deux documents de la même liste pourraient être
   * jugés à des instants différents.
   *
   * **Et le calcul n'est plus mémoïsé à la main.** Il l'était, avec un
   * `new Date()` dans le corps du `useMemo` : la mémo promettait alors une
   * stabilité qu'elle n'avait pas, et le compilateur React refusait de
   * l'honorer — il abandonnait l'optimisation du composant entier, en silence
   * jusqu'à ce qu'une règle de lint le dise. Le compilateur mémoïse
   * lui-même ce qui peut l'être ; mentir sur la pureté d'un corps de mémo
   * l'empêchait de travailler.
   */
  const maintenant = new Date();
  const dossiers = dossiersEnAttente(
    ventes ?? [],
    documents ?? [],
    motos ?? [],
    { etat },
    maintenant,
  );

  /* **Tout ce qui peut partir, pas seulement ce qui est coché.** La modale
     laisse corriger la sélection sans fermer, ce qui demande qu'elle ait la
     liste entière sous la main — et c'est la même liste que celle montée
     depuis la fiche d'un prestataire, par la même fonction. */
  const aConfier = cartesAConfier(dossiers, dossiersCG ?? AUCUN_DOSSIER, (clientId) =>
    nomDuClient(parClient.get(clientId)),
  );

  /* L'historique se nourrit des paquets ET des documents : une carte confiée
     seule depuis le relais de son dossier ne crée aucun paquet, et l'oublier
     effacerait un départ — avec l'argent qu'il a sorti de la caisse. */
  const departs = useMemo(() => {
    if (paquets === null || documents === null) return null;
    /* **Un refus de lecture ne doit pas figer l'onglet sur « Lecture… ».** Le
       journal est la seule des trois lectures qui puisse manquer seule — c'est
       la plus récente, et celle dont la règle peut n'être pas encore déployée.
       Sans dates de retour, l'historique dit encore qui, combien et quand
       c'est parti : trois colonnes sur quatre valent mieux qu'un écran en
       attente perpétuelle. */
    if (retours === null && !erreurRetours) return null;
    return historiqueDesDeparts(
      paquets,
      documents,
      dossiersCG ?? AUCUN_DOSSIER,
      retours ?? new Map(),
      (venteId) => ({
        numero: ventes?.find((vente) => vente.id === venteId)?.numero ?? venteId,
        client: nomDuClient(
          parClient.get(ventes?.find((vente) => vente.id === venteId)?.clientId ?? ""),
        ),
      }),
      new Date(),
    );
  }, [paquets, documents, dossiersCG, retours, erreurRetours, ventes, parClient]);

  const resultats = useMemo(
    () =>
      chercherDossiers(
        dossiers.map((dossier) => ({
          dossier,
          nomNormalise: parClient.get(dossier.clientId)?.nomNormalise ?? "",
        })),
        recherche,
        normaliserNom,
      ).map((ligne) => ligne.dossier),
    [dossiers, recherche, parClient],
  );

  /* Le relais se nourrit de la collection, pas de la liste filtrée : un
     document qu’on vient de remettre au client sort de la file au moment même
     où l’on regarde son parcours, et il doit rester lisible jusqu’à ce qu’on
     ferme. */
  const choisi = useMemo(
    () => (documents ?? []).find((document) => cleDocument(document) === documentOuvert) ?? null,
    [documents, documentOuvert],
  );
  const venteChoisie = useMemo(
    () => (choisi ? (ventes ?? []).find((vente) => vente.id === choisi.venteId) : undefined),
    [ventes, choisi],
  );

  const colonnes = useMemo<Colonne<DossierEnAttente>[]>(() => {
    const liste: Colonne<DossierEnAttente>[] = [
      {
        cle: "numero",
        titre: "Pièce",
        principal: true,
        /* Le numéro mène à la vente : le dossier vit dans une vente, et c’est
           là qu’on trouve le client, la moto et l’argent quand la question
           dépasse le papier. */
        rendu: (dossier) => (
          <Link
            href={`/motos/ventes?vente=${dossier.venteId}`}
            className="plaque-code whitespace-nowrap text-encre underline-offset-2 hover:underline"
          >
            {dossier.numero}
          </Link>
        ),
      },
      {
        cle: "client",
        titre: "Client",
        principal: true,
        rendu: (dossier) => nomDuClient(parClient.get(dossier.clientId)),
      },
    ];

    /* **Une seule colonne : la carte grise** (demande du commanditaire,
       16 octobre 2026). La quittance et le CMC se cochent sur le lot à
       l'arrivée, et cela suffit : ils ont quitté le dossier, et la clôture ne
       les regarde plus non plus. Cette file ne montre désormais que ce qui est
       VRAIMENT en attente de quelqu'un — un papier parti chez un prestataire.

       Les colonnes se dérivaient de `TYPES_DOCUMENT` ; elles se dérivent
       maintenant du seul type qui passe par un prestataire, ce qui n'est pas
       un cas particulier écrit à la main : la prochaine pièce confiée à
       l'extérieur reprendra cette colonne telle quelle. */
    for (const type of TYPES_DOCUMENT.filter(passeParUnPrestataire)) {
      liste.push({
        cle: type,
        titre: LIBELLE_DOCUMENT[type],
        /* **La cellule lit l'état calculé, pas le statut stocké** (S53). Elle
           lisait `document.statut`, si bien qu'un CMC coché sur la moto
           restait affiché « À faire » : la case du comptoir n'aurait rien fait
           bouger ici, et c'est précisément ce que la spec exige. */
        rendu: (dossier) => (
          <span className="inline-flex items-center">
            {/* **La case ne s'affiche que sur ce qui peut partir** (S53). Une
                case grisée sur une carte déjà dehors inviterait à verser une
                seconde avance pour le même travail — et la base refuserait le
                lot entier, sans dire laquelle des dix a fauté.
                Et seulement en vue boutique : un paquet appartient à une
                boutique, `confierPaquet` en exige une. */}
            {type === "carte_grise" && boutiqueId !== null && confiables.has(dossier.venteId) && (
              <input
                type="checkbox"
                checked={choisies.has(dossier.venteId)}
                onChange={(evenement) => basculer(dossier.venteId, evenement.target.checked)}
                aria-label={`Confier la carte grise de ${dossier.numero}`}
                className="mr-2 size-4 accent-[var(--color-solde)]"
              />
            )}
            <CellulePapier
              papier={dossier.papiers.find((papier) => papier.type === type) ?? null}
              numero={dossier.numero}
              type={type}
              ouvert={cleDe(dossier.documents[type]) === documentOuvert}
              ouvrir={setDocumentOuvert}
            />
          </span>
        ),
      });
    }

    liste.push({
      cle: "detention",
      titre: "Chez qui, depuis",
      rendu: (dossier) => <Detenteur dossier={dossier} />,
    });

    /* Pas de colonne « Boutique » : les trois premières lettres du numéro de
       pièce la disent déjà, sur chaque ligne, et un second pavé jaune juste à
       côté ne fait que diluer le signal (D70). C'est ce que montrent les
       maquettes A6, A7 et A8 — aucune des trois n'a cette colonne, y compris
       pour le responsable qui regarde toutes les boutiques. Le stock (A4) la
       garde : une moto n'a pas de numéro de pièce, donc rien ne la porte. */
    return liste;
  }, [parClient, documentOuvert, boutiqueId, confiables, choisies, basculer]);

  const chargement = perimetreEnCours || ventes === null || documents === null;
  const filtreActif = Boolean(etat) || recherche.trim().length > 0;
  /* Rien à encadrer : un cadre vide, recherche et filtres compris, ferait
     croire à une file qu'on aurait mal interrogée (même règle qu'en A6). */
  const surTitre = useSurTitre("Motos");
  const fileVide = !chargement && !filtreActif && resultats.length === 0;
  /* Sauf si l'on est en train de regarder un papier : le dernier geste d'un
     dossier le fait sortir de la file, et voir le relais disparaître avec lui
     priverait de sa confirmation celui qui vient de le faire. */
  const rienNAttend = fileVide && !choisi;

  return (
    <div>
      <TetePage
        surTitre={surTitre}
        titre="Dossiers en cours"
      />

      {erreur && (
        <ErreurDeLecture
          titre="La file des dossiers n’a pas pu être lue"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/motos/ventes", libelle: "Aller aux ventes" }}
        >
          {erreur} Un document se fait aussi avancer depuis la fiche de sa vente, qui n’a pas
          besoin de cette lecture.
        </ErreurDeLecture>
      )}

      {/* **Deux onglets plutôt qu'un empilement** (20 octobre 2026). Mis l'un
          sous l'autre, l'historique aurait poussé la file hors de l'écran — et
          c'est la file qu'on vient voir dix fois par jour. `Onglets` démonte le
          panneau inactif ; les écoutes, elles, vivent ici et ne se rouvrent pas
          en changeant de vue. */}
      <Onglets
        libelle="Les dossiers"
        valeur={vue}
        changer={setVue}
        onglets={[
          {
            valeur: "cours",
            libelle: "En cours",
            contenu: (
              <>
      <PaquetsEnCours
        paquets={paquets}
        documents={documents}
        /* Lu sur les VENTES et non sur les dossiers : un paquet survit à la
           clôture de ses dossiers — une carte revenue sort de la file — et son
           numéro doit rester lisible dans le détail du paquet. */
        numeroDe={(venteId) => ventes?.find((vente) => vente.id === venteId)?.numero ?? venteId}
      />

      {/* La barre n'existe que quand quelque chose est coché : un bandeau
          permanent à zéro occuperait la place de la file sans rien dire. */}
      {choisies.size > 0 && boutiqueId !== null && (
        <div className="mb-5 cadre flex flex-wrap items-center justify-between gap-3 p-3">
          <p className="text-encre">
            {compter(choisies.size, "carte grise", "cartes grises")} sélectionnée
            {choisies.size > 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPaquetOuvert(true)}
              className="bouton bouton-principal"
            >
              Confier {compter(choisies.size, "carte grise", "cartes grises")}
            </button>
            <button
              type="button"
              onClick={() => setChoisies(new Set())}
              className="bouton bouton-neutre"
            >
              Tout décocher
            </button>
          </div>
        </div>
      )}

      {paquetOuvert && boutiqueId !== null && (
        <ConfierPaquetModal
          cartes={aConfier}
          choisies={[...choisies]}
          boutiqueId={boutiqueId}
          onFermer={() => setPaquetOuvert(false)}
          onConfie={() => {
            setPaquetOuvert(false);
            /* La sélection se vide après le dépôt : les cartes ne sont plus
               confiables, et les laisser cochées proposerait de les reconfier. */
            setChoisies(new Set());
          }}
        />
      )}

      {rienNAttend ? null : (
        <div
          className={
            choisi
              ? "grid gap-5 lg:max-h-[calc(100dvh-12rem)] lg:grid-rows-[minmax(0,1fr)_auto]"
              : undefined
          }
        >
          {/* Sous 1024 px, le relais remplace la file au lieu de s’ajouter sous
            elle : avec quarante dossiers repliés en cartes, il faudrait faire
            défiler tout l’écran pour atteindre le papier qu’on vient de
            choisir. Le tableau est masqué, pas démonté — la recherche et le
            filtre sont un état, et on les retrouve en fermant. */}
          <div
            className={`cadre cadre-tableau ${choisi ? "max-lg:hidden lg:max-h-none lg:min-h-0" : ""}`}
          >
            <div className="cadre-tete">
              <Recherche valeur={recherche} changer={setRecherche} />

              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Filtrer les dossiers"
              >
                <button
                  type="button"
                  className="filtre"
                  aria-pressed={etat === ""}
                  onClick={() => setEtat("")}
                >
                  Tous
                </button>
                {FILTRES_ETAT.map((valeur) => (
                  <button
                    key={valeur}
                    type="button"
                    className="filtre"
                    aria-pressed={etat === valeur}
                    onClick={() => setEtat((actuel) => (actuel === valeur ? "" : valeur))}
                  >
                    {LIBELLE_FILTRE_ETAT[valeur]}
                  </button>
                ))}
              </div>

              {/* `aria-live` sans `role` : la coquille n’a qu’un seul `status`,
                le bandeau réseau. */}
              <p
                aria-live="polite"
                aria-atomic="true"
                className="ml-auto text-corps text-encre-doux"
              >
                {chargement ? (
                  "Lecture des dossiers…"
                ) : (
                  <strong className="font-semibold text-encre">
                    {resultats.length === 1
                      ? "1 dossier en cours"
                      : `${resultats.length} dossiers en cours`}
                  </strong>
                )}
              </p>
            </div>

            {chargement ? (
              <Tableau
                legende="Lecture des dossiers"
                colonnes={colonnes}
                lignes={[]}
                cleDe={(dossier) => dossier.venteId}
                chargement
              />
            ) : resultats.length === 0 ? null : (
              <Tableau
                legende="Dossiers en cours : pour chaque vente, où en est la carte grise"
                colonnes={colonnes}
                lignes={resultats}
                cleDe={(dossier) => dossier.venteId}
                cleActive={choisi?.venteId ?? null}
                enRetard={(dossier) => dossier.enRetard}
              />
            )}
          </div>

          {choisi && (
            <RelaisDocument
              document={choisi}
              numero={venteChoisie?.numero ?? ""}
              dateVente={venteChoisie?.date ?? null}
              fermer={() => setDocumentOuvert(null)}
            />
          )}
        </div>
      )}
              </>
            ),
          },
          {
            valeur: "historique",
            libelle: "Historique",
            contenu: (
              <HistoriqueDesDeparts departs={departs} sansRetours={Boolean(erreurRetours)} />
            ),
          },
        ]}
      />
    </div>
  );
}


/**
 * Ce qui désigne un document sans ambiguïté : la vente, puis le type.
 *
 * Un document vit en `ventesMotos/{venteId}/documents/{type}` : son identifiant
 * est donc « carte_grise », le même pour toutes les ventes du monde. S’en servir
 * seul marquait toutes les cartes grises de l’écran d’un coup et ouvrait le
 * relais de la première venue — vu sur capture.
 */
function cleDocument(document: DocumentDossier): string {
  return `${document.venteId}/${document.type}`;
}

const cleDe = (document: DocumentDossier | null) => (document ? cleDocument(document) : null);

/**
 * Une case de papier : son état, et la porte vers son parcours.
 *
 * **L'état est calculé, pas stocké** (S53, D61). La case lisait
 * `document.statut` ; un CMC coché sur la moto restait alors affiché « À
 * faire », et le geste du comptoir ne faisait rien bouger ici.
 *
 * Le mot est celui du domaine, jamais un raccourci — « Chez le prestataire » et
 * non « Parti ». Un dossier dont le document n’est pas encore parvenu du
 * serveur laisse la case vide plutôt que d’afficher « À faire » : les deux ne
 * demandent pas le même geste.
 *
 * **Seule la carte grise ouvre un parcours.** Les deux autres papiers n'ont
 * plus d'étapes à promener depuis S53 : il n'y a pas de relais à lire, et un
 * bouton qui ouvre un panneau vide est une promesse non tenue. Ils s'affichent
 * donc en pastille muette.
 */
function CellulePapier({
  papier,
  numero,
  type,
  ouvert,
  ouvrir,
}: {
  papier: PapierDuDossier | null;
  numero: string;
  type: TypeDocument;
  ouvert: boolean;
  ouvrir: (id: string | null) => void;
}) {
  if (!papier || !papier.document) return <span className="text-encre-doux">—</span>;

  const mot = LIBELLE_ETAT_PAPIER[papier.etat];
  const classes = `pastille ${TON_PAPIER[papier.etat]}`;
  const document = papier.document;

  if (!passeParUnPrestataire(type)) {
    return <span className={classes}>{mot}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => ouvrir(ouvert ? null : cleDocument(document))}
      aria-current={ouvert ? "true" : undefined}
      /* Le nom accessible dit de quel papier et de quelle pièce il s’agit :
         replié en carte, le tableau n’a plus d’en-tête de colonne pour le
         dire, et vingt-huit boutons nommés « À faire » ne mènent nulle part. */
      aria-label={`${LIBELLE_DOCUMENT[type]} de ${numero} : ${mot}`}
      className={`${classes} pastille-bouton`}
    >
      {mot}
    </button>
  );
}

/* Jamais la couleur seule : le mot est écrit, la pastille ne fait que le
   doubler. Le vert dit fini, le bleu de la goutte dit parti et pas revenu, le
   gris dit qu’il n’y a rien encore. Le retard, lui, n’est pas un état : il se
   lit sur la colonne « Chez qui, depuis » et sur l’avis de tête. */
/**
 * Le ton de chaque état.
 *
 * **« Au magasin » est VERT** (demande du commanditaire, 16 octobre 2026).
 * Depuis que cette file ne suit plus que la carte grise, son retour au magasin
 * n'est pas une étape de transit : c'est la fin du parcours, le moment où le
 * dossier se clot. Le bleu disait « ça bouge encore » d'un papier qui ne bouge
 * plus. Le vert dit « c'est fait », et c'est ce qu'on vient chercher d'un coup
 * d'œil sur une file qu'on vide.
 *
 * `chez_prestataire` garde le bleu : lui est bien en transit, chez quelqu'un.
 */
const TON_PAPIER: Record<EtatPapier, string> = {
  a_faire: "",
  chez_prestataire: "pastille-transit",
  au_magasin: "pastille-solde",
  emporte: "pastille-solde",
  sans_objet: "",
};

/** Qui détient le dossier, et depuis combien de temps. */
function Detenteur({ dossier }: { dossier: DossierEnAttente }) {
  const { detention } = dossier;
  /* Rien n’est encore parti : les papiers restent à faire, et il n’y a
     personne à relancer. C’est une réponse à « chez qui », pas un blanc. */
  if (!detention) return <span className="text-encre-doux">personne</span>;
  /* **« au magasin » a quitté cette colonne** (16 octobre 2026). Elle désignait
     une quittance ou un CMC dans le tiroir ; ces deux papiers ont quitté le
     dossier, et la carte grise est finie dès son retour. La colonne répond
     désormais par un prestataire, ou par personne — ce qui est exactement la
     question qu'elle pose. */

  return (
    <span className={dossier.enRetard ? "font-semibold text-alerte" : undefined}>
      {detention.nom}
      {detention.depuisJours !== null && (
        <>
          {" · "}
          {/* « depuis 0 jour » n’est pas une durée : un dépôt du matin se dit
              « aujourd’hui », comme on le dirait au client au téléphone. */}
          {detention.depuisJours === 0 ? (
            "aujourd’hui"
          ) : (
            <span className="font-code whitespace-nowrap">
              {detention.depuisJours} {detention.depuisJours > 1 ? "jours" : "jour"}
            </span>
          )}
        </>
      )}
    </span>
  );
}

function Recherche({ valeur, changer }: { valeur: string; changer: (valeur: string) => void }) {
  /* Bornée comme les autres recherches du produit, et comme le socle des
     maquettes qui la fixe à `min(360px, 32vw)` (`socle.css:448`). Sans
     borne elle traversait la moitié de l'écran depuis que `.saisie` a
     rendu sa largeur à la mise en page — mesuré, pas estimé. */
  return (
    <div className="relative min-w-56 flex-1 sm:max-w-80">
      <label htmlFor="recherche-dossier" className="sr-only">
        Chercher un dossier
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
      />
      <input
        id="recherche-dossier"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Numéro, client ou prestataire"
        value={valeur}
        onChange={(evenement) => changer(evenement.target.value)}
        className="saisie pr-3 pl-9 placeholder:text-encre-doux"
      />
    </div>
  );
}
