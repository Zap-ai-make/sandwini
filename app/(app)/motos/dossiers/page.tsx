"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { RelaisDocument } from "@/components/RelaisDocument";
import { Avis } from "@/components/patrons/Avis";
import { EtatErreur, EtatSansResultat, EtatVide } from "@/components/patrons/Etats";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { normaliserNom } from "@/lib/domain/client";
import {
  chercherDossiers,
  dossiersEnAttente,
  FILTRES_ETAT,
  LIBELLE_FILTRE_ETAT,
  type DossierEnAttente,
  type FiltreEtat,
} from "@/lib/domain/dossier";
import { formaterDateCourte } from "@/lib/domain/format";
import {
  LIBELLE_DOCUMENT,
  LIBELLE_STATUT_DOCUMENT,
  TYPES_DOCUMENT,
  type DocumentDossier,
  type StatutDocument,
  type TypeDocument,
  type Vente,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterDossiers, ecouterVentes } from "@/lib/repositories/ventes";

/**
 * Les dossiers en attente (§7.3).
 *
 * Une file, pas un journal : du plus ancien au plus récent, et l’on n’y voit
 * que ce qui reste à faire. Le tri et les filtres vivent dans
 * `lib/domain/dossier.ts`, en fonctions pures testées — l’écran ne fait que les
 * nourrir et les rendre.
 *
 * **Une colonne par document.** L’écran empilait des cartes qui listaient, en
 * petites lignes grises, les documents encore en cours d’une vente. La question
 * qu’on lui pose est « qui détient quel papier » : elle se compare d’un dossier
 * à l’autre, donc elle se range en colonnes. Les quatre documents y sont
 * toujours, réglés compris — c’est en voyant les trois premiers remis qu’on
 * comprend qu’il ne manque que le quatrième.
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
  const { valeur: ventes, erreur } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être chargées.",
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

  const parClient = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);

  /* La date du jour est figée au rendu : recalculée à chaque ligne, deux
     documents de la même liste pourraient être jugés à des instants
     différents. */
  const dossiers = useMemo(
    () => dossiersEnAttente(ventes ?? [], documents ?? [], { etat }, new Date()),
    [ventes, documents, etat],
  );

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
        rendu: (dossier) => parClient.get(dossier.clientId)?.nom ?? "Client inconnu",
      },
    ];

    for (const type of TYPES_DOCUMENT) {
      liste.push({
        cle: type,
        titre: LIBELLE_DOCUMENT[type],
        rendu: (dossier) => (
          <CelluleDocument
            document={dossier.documents[type]}
            numero={dossier.numero}
            type={type}
            ouvert={cleDe(dossier.documents[type]) === documentOuvert}
            ouvrir={setDocumentOuvert}
          />
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
  }, [parClient, documentOuvert]);

  const chargement = perimetreEnCours || ventes === null || documents === null;
  const enRetard = dossiers.filter((dossier) => dossier.enRetard);
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
        titre="Dossiers en attente"
        sousTitre="Les quatre documents ne suivent pas le même chemin. Un dossier se ferme quand les quatre sont remis, ou déclarés sans objet."
      />

      <EtatErreur message={erreur} className="mb-4" />

      {/* Ce qui dépasse la date annoncée se dit avant la liste, et se nomme :
          un compteur au-dessus d’un tableau se lit comme une décoration, un nom
          de client se lit comme un appel à passer. Pas de `role="alert"` — cet
          état est déjà là à l’ouverture, il n’interrompt rien (cf. `Avis`). */}
      {enRetard.length > 0 && (
        <Avis
          ton="alerte"
          titre={
            enRetard.length === 1
              ? "Un dossier dépasse la date annoncée"
              : `${enRetard.length} dossiers dépassent la date annoncée`
          }
          className="mb-5"
        >
          {enRetard.slice(0, 3).map((dossier) => (
            <p key={dossier.venteId}>
              <span className="plaque-code">{dossier.numero}</span>
              {" · "}
              {parClient.get(dossier.clientId)?.nom ?? "Client inconnu"}
              {" · "}
              {retardDe(dossier)}
            </p>
          ))}
          {enRetard.length > 3 && <p>et {enRetard.length - 3} autres.</p>}
        </Avis>
      )}

      {rienNAttend ? (
        <FileVide />
      ) : (
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
                  Ouverts
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
                      ? "1 dossier ouvert"
                      : `${resultats.length} dossiers ouverts`}
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
            ) : resultats.length === 0 ? (
              fileVide ? (
                <FileVide className="m-4" />
              ) : (
                <EtatSansResultat className="m-4">
                  Aucun dossier ne correspond. Essayez le numéro de la pièce, le nom du client ou
                  celui du prestataire, ou élargissez les filtres.
                </EtatSansResultat>
              )
            ) : (
              <Tableau
                legende="Dossiers ouverts : pour chaque vente, où en est chacun des quatre documents"
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
    </div>
  );
}

/** La file est vide, et c’est une bonne nouvelle : il n’y a rien à aller chercher. */
function FileVide({ className }: { className?: string }) {
  return (
    <EtatVide titre="Aucun dossier n’attend." className={className}>
      Tous les documents des ventes en cours sont remis au client, ou déclarés sans objet.
    </EtatVide>
  );
}

/**
 * Ce qui désigne un document sans ambiguïté : la vente, puis le type.
 *
 * Un document vit en `ventesMotos/{venteId}/documents/{type}` : son identifiant
 * est donc « carte_grise », le même pour toutes les ventes du monde. S’en servir
 * seul marquait les quatre cartes grises de l’écran d’un coup et ouvrait le
 * relais de la première venue — vu sur capture.
 */
function cleDocument(document: DocumentDossier): string {
  return `${document.venteId}/${document.type}`;
}

const cleDe = (document: DocumentDossier | null) => (document ? cleDocument(document) : null);

/**
 * Une case de document : le mot, et la porte vers son parcours.
 *
 * Le mot est celui du domaine, jamais un raccourci — « Revenu au magasin » et
 * non « Revenu ». Un dossier dont le document n’est pas encore parvenu du
 * serveur laisse la case vide plutôt que d’afficher « À faire » : les deux ne
 * demandent pas le même geste.
 */
function CelluleDocument({
  document,
  numero,
  type,
  ouvert,
  ouvrir,
}: {
  document: DocumentDossier | null;
  numero: string;
  type: TypeDocument;
  ouvert: boolean;
  ouvrir: (id: string | null) => void;
}) {
  if (!document) return <span className="text-encre-doux">—</span>;

  return (
    <button
      type="button"
      onClick={() => ouvrir(ouvert ? null : cleDocument(document))}
      aria-current={ouvert ? "true" : undefined}
      /* Le nom accessible dit de quel document et de quelle pièce il s’agit :
         replié en carte, le tableau n’a plus d’en-tête de colonne pour le
         dire, et vingt-huit boutons nommés « À faire » ne mènent nulle part. */
      aria-label={`${LIBELLE_DOCUMENT[type]} de ${numero} : ${LIBELLE_STATUT_DOCUMENT[document.statut]}`}
      className={`pastille pastille-bouton ${TON_DOCUMENT[document.statut]}`}
    >
      {LIBELLE_STATUT_DOCUMENT[document.statut]}
    </button>
  );
}

/* Jamais la couleur seule : le mot est écrit, la pastille ne fait que le
   doubler. Le vert dit réglé, le bleu de la goutte dit parti et pas revenu, le
   gris dit qu’il n’y a rien encore. Le retard, lui, n’est pas un statut : il se
   lit sur la colonne « Chez qui, depuis » et sur l’avis de tête. */
const TON_DOCUMENT: Record<StatutDocument, string> = {
  a_faire: "",
  chez_prestataire: "pastille-transit",
  revenu_magasin: "pastille-solde",
  remis_client: "pastille-solde",
  non_applicable: "",
};

/** Qui détient le dossier, et depuis combien de temps. */
function Detenteur({ dossier }: { dossier: DossierEnAttente }) {
  const { detention } = dossier;
  /* Rien n’est encore parti : les papiers restent à faire, et il n’y a
     personne à relancer. C’est une réponse à « chez qui », pas un blanc. */
  if (!detention) return <span className="text-encre-doux">personne</span>;
  if (detention.chez === "magasin") return <span className="text-encre-doux">au magasin</span>;

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

/** Le retard d’un dossier, dit avec le document et la date qu’on a promise. */
function retardDe(dossier: DossierEnAttente): string {
  const document = dossier.enCours.find((candidat) => candidat.disponibleLe !== null);
  if (!document?.disponibleLe) return "date annoncée dépassée";
  return `${LIBELLE_DOCUMENT[document.type].toLowerCase()} annoncée pour le ${formaterDateCourte(document.disponibleLe)}`;
}

function Recherche({ valeur, changer }: { valeur: string; changer: (valeur: string) => void }) {
  return (
    <div className="relative min-w-56 flex-1">
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
