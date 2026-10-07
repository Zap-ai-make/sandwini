"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ErreurDeLecture, EtatVide, SansBoutique } from "@/components/patrons/Etats";
import { FiltrePeriode } from "@/components/patrons/FiltrePeriode";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { nomDuClient } from "@/lib/domain/client";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { SEUIL_INACTIVITE_DEFAUT, type ReglagesEntreprise } from "@/lib/domain/entreprise";
import { formaterDateCourte, formaterMontant, formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import {
  PLAGE_VIDE,
  bornesPeriode,
  libellePeriode,
  type Periode,
  type PlagePeriode,
} from "@/lib/domain/periode";
import {
  FILTRES_PAIEMENT,
  LIBELLE_FILTRE_PAIEMENT,
  LIBELLE_MODE,
  LIBELLE_STATUT_PAIEMENT,
  dettes,
  estInactive,
  filtrerPaiements,
  paiementsDeLaPeriode,
  paiementsEchelonnes,
  suivrePaiements,
  totalDetenu,
  totalDu,
  tranchesEnCours,
  type FiltrePaiement,
  type LignePaiement,
  type StatutPaiement,
  type Vente,
  type Versement,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { ecouterReglages } from "@/lib/repositories/entreprise";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Le suivi des paiements (§6.3).
 *
 * **Une liste, deux notions qui restent nommées.** L'écran a porté deux
 * tableaux séparés, chacun sous sa phrase d'explication ; le commanditaire les
 * a trouvés lourds à l'usage et a demandé une liste unique (S48). La séparation
 * quitte donc la mise en page pour entrer dans la ligne : une colonne **Mode**
 * dit sur chaque vente si la moto est partie (*crédit*) ou si elle est retenue
 * (*tranches*).
 *
 * **Ce que cette fusion n'a pas le droit de perdre.** Une *dette* est de
 * l'argent qui manque au magasin ; une *tranche* est de l'argent que le magasin
 * détient pour le compte du client, et qui peut repartir. Les additionner
 * donnerait un chiffre qui ne veut rien dire — c'est la confusion métier la plus
 * coûteuse du projet (`AGENTS.md`, §13). D'où **deux totaux distincts** en tête,
 * jamais une somme, et le mot du mode sur chaque ligne plutôt qu'au-dessus d'un
 * tableau qu'on déroule.
 *
 * **Une seule rangée de filtres** : « Crédit » dit où est la moto,
 * « Partiellement payées » et « Soldées » disent où en est l'argent. Le
 * raisonnement est dans `filtrerPaiements`.
 *
 * **L'écran porte tout le paiement échelonné, soldé compris.** Il ne gardait
 * que ce qui attendait — une file de relance —, et « Soldées » n'y aurait donc
 * jamais rien rendu. Les pastilles « Tranches » et « Impayées » sont parties
 * dans le même mouvement : chacune ne faisait que répéter une colonne déjà
 * visible, « Mode » pour l'une, « État » pour l'autre.
 *
 * **La liste des tranches inactives a disparu il y a longtemps.** Elle était un
 * filtre de la seconde ; l'information vit dans la colonne « État » — « Aucun
 * versement depuis 60 jours » —, dans le filet rouge de la ligne, et dans le
 * comptage en tête. Une liste dont chaque élément se lit déjà dans une autre
 * n'est pas une liste, c'est un tri.
 *
 * Tout est calculé en mémoire à partir des versements chargés, jamais depuis un
 * agrégat serveur (`prompt.md` §3.4, D56) : cette liste doit s'ouvrir sans
 * réseau comme le reste du produit.
 */
export default function PagePaiements() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();

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

  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVersementsDuPerimetre(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: versements, erreur: erreurVersements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être chargé.");

  const souscrireReglages = useCallback(
    (auChangement: (reglages: ReglagesEntreprise) => void, enErreur: (cause: unknown) => void) =>
      ecouterReglages(auChangement, enErreur),
    [],
  );
  const { valeur: reglages } = useAbonnement(
    souscrireReglages,
    "Le seuil d’inactivité n’a pas pu être lu.",
  );
  const seuil = reglages?.seuilInactiviteTranches ?? SEUIL_INACTIVITE_DEFAUT;

  const surTitre = useSurTitre("Motos");

  /* État local, comme les filtres des Ventes : une période dans l'URL
     obligerait à décider ce que devient un lien « ce mois-ci » ouvert le mois
     suivant. */
  const [filtre, setFiltre] = useState<FiltrePaiement>("tout");
  const [periode, setPeriode] = useState<Periode>("tout");
  const [plage, setPlage] = useState<PlagePeriode>(PLAGE_VIDE);

  /* Figé sur la durée du rendu : l'ancienneté d'une dette et les bornes de la
     période doivent se calculer sur le même instant. */
  const maintenant = useMemo(() => new Date(), []);

  const lignes = useMemo(
    () => suivrePaiements(ventes ?? [], versements ?? [], maintenant),
    [ventes, versements, maintenant],
  );

  /* « Les paiements de septembre » : une ligne paraît si elle a reçu de
     l'argent dans la période, pas si la vente y a été conclue. Le filtre
     s'applique avant le partage entre dettes et tranches, donc les deux
     en-têtes — « 1 vente · 415 000 FCFA dus » — le suivent d'eux-mêmes. */
  const retenues = useMemo(
    () => paiementsDeLaPeriode(lignes, bornesPeriode(periode, maintenant, plage)),
    [lignes, periode, plage, maintenant],
  );

  /* Une seule liste (S48), élargie à tout le paiement échelonné : les ventes
     soldées y restent, sans quoi la pastille « Soldées » ne rendrait rien. Les
     deux totaux restent calcules a part : additionner une dette et une tranche
     donnerait un chiffre qui ne veut rien dire. */
  const echelonnes = useMemo(() => paiementsEchelonnes(retenues), [retenues]);
  const lignesVues = useMemo(() => filtrerPaiements(echelonnes, filtre), [echelonnes, filtre]);

  /* `dettes` et `tranchesEnCours` plutôt qu'un filtre sur le mode : depuis que
     la liste porte aussi les soldées, le mode ne suffit plus à dire ce qui est
     encore engagé. Une tranche soldée dont la moto est partie n'est plus de
     l'argent détenu — la compter annoncerait une somme que le magasin a déjà
     rendue en moto. Ces deux fonctions écartent ces cas d'elles-mêmes. */
  const duParLesClients = useMemo(() => totalDu(dettes(lignesVues)), [lignesVues]);
  const detenuPourEux = useMemo(() => totalDetenu(tranchesEnCours(lignesVues)), [lignesVues]);
  const inactives = useMemo(
    () => lignesVues.filter((ligne) => estInactive(ligne, seuil) && ligne.resteDu > 0),
    [lignesVues, seuil],
  );

  const nomClient = useCallback(
    (clientId: string) => nomDuClient(clients.find((client) => client.id === clientId)),
    [clients],
  );
  const moto = useCallback(
    (motoId: string) => (stock ?? []).find((fiche) => fiche.id === motoId),
    [stock],
  );

  const colonnes = useMemo<Colonne<LignePaiement>[]>(
    () => [
      {
        cle: "numero",
        titre: "Pièce",
        principal: true,
        rendu: (ligne) => (
          <Link
            href={`/motos/ventes?vente=${ligne.vente.id}`}
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
        rendu: (ligne) => nomClient(ligne.vente.clientId),
      },
      { cle: "moto", titre: "Moto", rendu: (ligne) => nomMoto(ligne, moto, catalogue) },
      /* La colonne qui porte, à elle seule, ce que les deux bandeaux disaient.
         Un mot par ligne — « Crédit » ou « Tranches » — au lieu d'une phrase
         au-dessus d'un tableau : la mention voyage avec la ligne, et ne se
         perd pas quand on défile. Sans elle, cette liste additionnerait dans
         l'esprit du lecteur une dette et un dépôt (`AGENTS.md`, §13). */
      {
        cle: "mode",
        titre: "Mode",
        rendu: (ligne) => (
          <span className="whitespace-nowrap font-medium text-encre">
            {LIBELLE_MODE[ligne.vente.modePaiement]}
          </span>
        ),
      },
      /* Le prix convenu de la maquette n’est pas ici : il vaut exactement
         « déjà versé + reste dû », et sa colonne poussait « Action » hors du
         cadre à 1280 px, colonne des écrans dépliée — un geste qu’on ne voit
         pas est un geste qui n’existe pas. Il se lit sur la fiche, à un clic. */
      {
        cle: "verse",
        titre: "Déjà versé",
        chiffre: true,
        rendu: (ligne) => formaterNombre(ligne.totalPaye),
      },
      {
        /* « Reste à percevoir » couvre les deux modes sans mentir sur aucun :
           c'est ce que le magasin attend encore, que le client le doive ou
           qu'il complète un dépôt. « Reste dû » aurait fait du tranches une
           dette, ce qu'il n'est pas. */
        cle: "reste",
        titre: "Reste à percevoir",
        titreReplie: "Reste",
        chiffre: true,
        rendu: (ligne) => formaterNombre(ligne.resteDu),
      },
      {
        cle: "dernier",
        titre: "Dernier versement",
        titreReplie: "Dernier",
        chiffre: true,
        rendu: (ligne) =>
          ligne.dernierVersementAt ? formaterDateCourte(ligne.dernierVersementAt) : "aucun",
      },
      {
        cle: "etat",
        titre: "État",
        rendu: (ligne) =>
          estInactive(ligne, seuil) && ligne.resteDu > 0 ? (
            <span className="pastille pastille-retard">
              Aucun versement depuis {ligne.joursSansVersement} jours
            </span>
          ) : (
            <Etat statut={ligne.statutPaiement} />
          ),
      },
      {
        cle: "action",
        titre: "Action",
        rendu: (ligne) =>
          ligne.vente.modePaiement === "tranches" && ligne.resteDu === 0 ? (
            /* Le geste du jour : la moto peut sortir. C'est la seule ligne de
               l'écran qui appelle une action plutôt qu'un encaissement, et elle
               se voit depuis la liste — sans quoi une moto soldée dort au
               magasin sans que personne le sache. */
            <Link
              href={`/motos/ventes?vente=${ligne.vente.id}`}
              aria-label={`Remettre la moto de ${ligne.vente.numero}`}
              className="bouton bouton-principal h-9 px-3 text-legende"
            >
              Remettre la moto
            </Link>
          ) : (
            <Encaisser vente={ligne.vente.id} numero={ligne.vente.numero} />
          ),
      },
    ],
    [nomClient, moto, catalogue, seuil],
  );

  if (perimetre.type === "aucune")
    return (
      <SansBoutique
        titre="Paiements"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : il n’y a encore ni dette ni tranche à suivre."
      />
    );

  const chargement = (ventes === null || versements === null) && !erreur && !erreurVersements;
  const nomPeriode = libellePeriode(periode, maintenant, plage);

  return (
    <div className="ecran-plein">
      <TetePage surTitre={surTitre} titre="Paiements" />

      {/* Le mode et l'état d'abord, la période ensuite : on choisit ce qu'on
          regarde avant de choisir quand. */}
      <div
        className="mb-3 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filtrer les paiements"
      >
        {FILTRES_PAIEMENT.map((valeur) => (
          <button
            key={valeur}
            type="button"
            className="filtre"
            aria-pressed={filtre === valeur}
            onClick={() => setFiltre(valeur)}
          >
            {LIBELLE_FILTRE_PAIEMENT[valeur]}
          </button>
        ))}
      </div>

      <FiltrePeriode
        periode={periode}
        changer={setPeriode}
        plage={plage}
        changerPlage={setPlage}
        className="mb-4"
      />

      {(erreur ?? erreurVersements) && (
        <ErreurDeLecture
          titre="Les paiements n’ont pas pu être lus"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/motos/ventes", libelle: "Aller aux ventes" }}
        >
          {erreur ?? erreurVersements} Un versement s’enregistre aussi depuis la fiche de sa vente,
          qui n’a pas besoin de cette lecture.
        </ErreurDeLecture>
      )}

      {/* **Deux totaux, jamais leur somme.** Les clients doivent de l'argent au
          magasin ; le magasin en détient pour le compte des clients. Un seul
          chiffre les mêlerait, et c'est précisément ce que la liste unique
          rendait possible — d'où deux phrases, séparées par un point médian. */}
      <p aria-live="polite" aria-atomic="true" className="mb-3 text-corps text-encre-doux">
        {chargement ? (
          "Lecture des paiements…"
        ) : lignesVues.length === 0 ? (
          ""
        ) : (
          <>
            <strong className="font-semibold text-encre">
              {compter(lignesVues.length, "vente", "ventes")}
            </strong>
            {duParLesClients > 0 && ` · ${formaterMontant(duParLesClients)} dus par les clients`}
            {detenuPourEux > 0 && ` · ${formaterMontant(detenuPourEux)} détenus pour eux`}
            {inactives.length > 0 &&
              ` · ${inactives.length} sans versement depuis ${seuil} jours ou plus`}
          </>
        )}
      </p>

      {!chargement && lignesVues.length === 0 ? (
        <EtatVide titre={titreDuVide(filtre, nomPeriode)}>{phraseDuVide(filtre, nomPeriode)}</EtatVide>
      ) : (
        <div className="cadre cadre-tableau">
          <Tableau
            legende="Ventes dont il reste quelque chose à percevoir. La colonne « Mode » dit où est la moto. Montants en francs CFA."
            colonnes={colonnes}
            lignes={lignesVues}
            cleDe={(ligne) => ligne.vente.id}
            chargement={chargement}
            enRetard={(ligne) => estInactive(ligne, seuil) && ligne.resteDu > 0}
          />
        </div>
      )}

      {perimetreEnCours && <span className="sr-only">Chargement du périmètre…</span>}
    </div>
  );
}

/**
 * L'état vide, qui doit dire **laquelle** des trois absences on regarde.
 *
 * « Aucune vente échelonnée » est un registre neuf ; « aucun versement en août » n'en est
 * pas une, et « rien sous Soldées » n'est qu'un filtre trop
 * serré. Les confondre ferait croire à un registre à jour — la même faute que
 * D63 relève sur les compteurs à zéro, transposée à une phrase.
 */
function titreDuVide(filtre: FiltrePaiement, nomPeriode: string | null): string {
  if (nomPeriode) return `Aucun versement reçu — ${nomPeriode}.`;
  if (filtre !== "tout") return `Rien sous « ${LIBELLE_FILTRE_PAIEMENT[filtre]} ».`;
  return "Aucune vente à paiement échelonné.";
}

function phraseDuVide(filtre: FiltrePaiement, nomPeriode: string | null): string {
  if (nomPeriode)
    return "Aucune vente n’a reçu d’argent sur cette période. Ce qui reste à percevoir est visible sur « Tout ».";
  if (filtre !== "tout")
    return "Le filtre ne laisse rien passer. Les autres ventes échelonnées sont visibles sur « Tout ».";
  /* Le comptant ne figure pas sur cet écran : il se solde à la saisie. Un
     magasin qui ne vendrait qu'au comptant verra donc cette phrase, et elle
     doit lui dire que ce n'est pas une anomalie. */
  return "Aucun crédit ni aucune vente en tranches n’a encore été enregistré. Les ventes au comptant ne figurent pas ici : elles sont soldées dès la saisie.";
}

/* Jamais la couleur seule : le mot est écrit, la pastille ne fait que le
   doubler. Même correspondance qu'en A6 — l'impayé prend la braise, le partiel
   le bleu de la goutte, le soldé le vert (D70). */
const TON_PAIEMENT: Record<StatutPaiement, string> = {
  impaye: "pastille-retard",
  partiel: "pastille-transit",
  solde: "pastille-solde",
};

function Etat({ statut }: { statut: StatutPaiement }) {
  return (
    <span className={`pastille ${TON_PAIEMENT[statut]}`}>{LIBELLE_STATUT_PAIEMENT[statut]}</span>
  );
}

/**
 * Le geste, depuis la liste.
 *
 * C'est un lien, pas un bouton : encaisser demande un montant, un moyen et une
 * référence, et ce formulaire vit dans la fiche de la vente — l'écrire une
 * seconde fois ici en ferait deux à corriger. Le nom accessible dit sur quelle
 * pièce, sans quoi l'écran offrirait sept liens nommés « Encaisser ».
 */
function Encaisser({ vente, numero }: { vente: string; numero: string }) {
  return (
    <Link
      href={`/motos/ventes?vente=${vente}`}
      aria-label={`Encaisser un versement sur ${numero}`}
      className="bouton bouton-neutre h-9 px-3 text-legende"
    >
      Encaisser
    </Link>
  );
}

function nomMoto(
  ligne: LignePaiement,
  moto: (motoId: string) => Moto | undefined,
  catalogue: Catalogue,
): string {
  const fiche = moto(ligne.vente.motoId);
  return fiche
    ? `${catalogue.nomMarque(fiche.marqueId)} ${catalogue.nomModele(fiche.modeleId)}`
    : "Moto hors de ce périmètre";
}

function compter(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`;
}
