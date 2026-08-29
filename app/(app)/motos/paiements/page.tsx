"use client";

import { ArrowLeft, Clock, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSession } from "@/lib/auth/session";
import { formaterAnciennete, formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import { SEUIL_INACTIVITE_DEFAUT, type Entreprise } from "@/lib/domain/entreprise";
import type { Moto } from "@/lib/domain/moto";
import {
  dettes,
  estInactive,
  suivrePaiements,
  totalDetenu,
  totalDu,
  tranchesEnCours,
  type LignePaiement,
  type Vente,
  type Versement,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { ecouterEntreprise } from "@/lib/repositories/entreprise";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Le suivi des paiements — les trois listes du §6.3.
 *
 * Elles répondent à trois questions que le gérant se pose sans ouvrir de
 * dossier : qui me doit de l'argent, combien je détiens pour le compte de
 * clients, et lesquels de ces clients ont cessé de verser.
 *
 * **Les deux premières ne doivent jamais se confondre**, et c'est la raison
 * d'être de cet écran plutôt que d'une seule liste « impayés » : une dette est
 * de l'argent qui manque au magasin, une tranche est de l'argent qu'il détient
 * et qui peut repartir. Les additionner ferait un chiffre qui ne veut rien
 * dire — d'où deux totaux, deux vocabulaires, jamais un cumul.
 *
 * Tout est calculé en mémoire à partir des versements chargés, jamais depuis un
 * agrégat serveur (`prompt.md` §3.4, `DECISIONS.md` D56) : ces listes doivent
 * s'ouvrir sans réseau comme le reste du produit.
 */
const VUES = ["dettes", "tranches", "inactives"] as const;
type Vue = (typeof VUES)[number];

const LIBELLE_VUE: Record<Vue, string> = {
  dettes: "Dettes",
  tranches: "Tranches en cours",
  inactives: "Tranches inactives",
};

export default function PagePaiements() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();
  const [vue, setVue] = useState<Vue>("dettes");

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

  const souscrireEntreprise = useCallback(
    (auChangement: (entreprise: Entreprise) => void, enErreur: (cause: unknown) => void) =>
      ecouterEntreprise(auChangement, enErreur),
    [],
  );
  const { valeur: entreprise } = useAbonnement(
    souscrireEntreprise,
    "Le seuil d’inactivité n’a pas pu être lu.",
  );
  const seuil = entreprise?.seuilInactiviteTranches ?? SEUIL_INACTIVITE_DEFAUT;

  const lignes = useMemo(
    () => suivrePaiements(ventes ?? [], versements ?? [], new Date()),
    [ventes, versements],
  );

  const listeDettes = useMemo(() => dettes(lignes), [lignes]);
  const listeTranches = useMemo(() => tranchesEnCours(lignes), [lignes]);
  const listeInactives = useMemo(
    () => listeTranches.filter((ligne) => estInactive(ligne, seuil)),
    [listeTranches, seuil],
  );

  const nomClient = useCallback(
    (clientId: string) => clients.find((client) => client.id === clientId)?.nom ?? "Client inconnu",
    [clients],
  );
  const moto = useCallback(
    (motoId: string) => (stock ?? []).find((fiche) => fiche.id === motoId),
    [stock],
  );

  if (perimetre.type === "aucune") return <SansBoutique />;

  const chargement = (ventes === null || versements === null) && !erreur && !erreurVersements;
  const liste =
    vue === "dettes" ? listeDettes : vue === "tranches" ? listeTranches : listeInactives;
  const compte: Record<Vue, number> = {
    dettes: listeDettes.length,
    tranches: listeTranches.length,
    inactives: listeInactives.length,
  };

  return (
    <div>
      {/* Le retour va aux ventes, d'où l'on vient : c'est l'écran de l'argent,
          et c'est lui qui porte le lien vers celui-ci. L'en-tête du stock, lui,
          reste à deux actions — un troisième bouton s'y chevauchait sur un
          écran de téléphone. */}
      <Link
        href="/motos/ventes"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Ventes
      </Link>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">Paiements</h1>
      <p className="mt-1 text-sm text-encre-doux">
        {perimetre.type === "toutes" ? "Toutes les boutiques" : perimetre.nom}
      </p>

      {/* Trois listes, une à la fois : au comptoir on cherche une réponse
          précise, pas un tableau de bord à faire défiler.

          Des boutons pressés, pas un `role="tablist"` : de vrais onglets
          demandent un `tabpanel` associé et une navigation aux flèches, et un
          motif ARIA à moitié posé annonce à un lecteur d'écran une structure
          qui n'existe pas. Ici ce sont trois filtres, et `aria-pressed` le dit
          exactement. */}
      <div
        role="group"
        aria-label="Listes de suivi des paiements"
        className="mt-6 flex flex-wrap gap-2"
      >
        {VUES.map((identifiant) => {
          const active = vue === identifiant;
          return (
            <button
              key={identifiant}
              type="button"
              aria-pressed={active}
              onClick={() => setVue(identifiant)}
              className={[
                "inline-flex h-11 items-center gap-2 rounded-plaque border px-3 text-sm font-medium",
                active
                  ? "border-plaque-bord bg-plaque text-encre-fixe"
                  : "border-bord text-encre hover:bg-papier",
              ].join(" ")}
            >
              {LIBELLE_VUE[identifiant]}
              <span className="tabular-nums opacity-80">{compte[identifiant]}</span>
            </button>
          );
        })}
      </div>

      {(erreur || erreurVersements) && (
        <p role="alert" className="mt-4 text-sm text-alerte">
          {erreur ?? erreurVersements}
        </p>
      )}

      {chargement ? (
        <p className="mt-6 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement des paiements…
        </p>
      ) : (
        <>
          <EnTete vue={vue} liste={liste} seuil={seuil} />
          {liste.length === 0 ? (
            <Vide vue={vue} perimetreEnCours={perimetreEnCours} seuil={seuil} />
          ) : (
            <ul className="mt-3 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
              {liste.map((ligne) => (
                <li key={ligne.vente.id}>
                  <LignePaiementVue
                    ligne={ligne}
                    vue={vue}
                    seuil={seuil}
                    nomClient={nomClient(ligne.vente.clientId)}
                    moto={moto(ligne.vente.motoId)}
                    catalogue={catalogue}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Le total en tête de liste, et le mot qui dit de quel argent il s'agit.
 *
 * « Dû » et « détenu » ne sont pas des synonymes élégants l'un de l'autre :
 * l'un manque en caisse, l'autre y est et peut en repartir.
 */
function EnTete({ vue, liste, seuil }: { vue: Vue; liste: LignePaiement[]; seuil: number }) {
  if (vue === "dettes") {
    return (
      <Somme
        libelle="Total dû par les clients"
        montant={totalDu(liste)}
        precision={`${liste.length} ${liste.length > 1 ? "ventes à crédit non soldées" : "vente à crédit non soldée"}`}
      />
    );
  }

  const motos = `${liste.length} ${liste.length > 1 ? "motos à livrer" : "moto à livrer"}`;
  return (
    <Somme
      libelle="Total détenu pour le compte des clients"
      montant={totalDetenu(liste)}
      precision={
        vue === "tranches" ? motos : `${motos} · sans versement depuis ${seuil} jours ou plus`
      }
    />
  );
}

function Somme({
  libelle,
  montant,
  precision,
}: {
  libelle: string;
  montant: number;
  precision: string;
}) {
  return (
    <section className="mt-6 rounded-plaque border-2 border-plaque-bord bg-papier px-4 py-3">
      <h2 className="text-sm text-encre-doux">{libelle}</h2>
      <p className="mt-1 text-2xl font-semibold text-encre tabular-nums">
        {formaterMontant(montant)}
      </p>
      <p className="mt-1 text-sm text-encre-doux">{precision}</p>
    </section>
  );
}

function LignePaiementVue({
  ligne,
  vue,
  seuil,
  nomClient,
  moto,
  catalogue,
}: {
  ligne: LignePaiement;
  vue: Vue;
  seuil: number;
  nomClient: string;
  moto: Moto | undefined;
  catalogue: Catalogue;
}) {
  const { vente } = ligne;
  const inactive = vente.modePaiement === "tranches" && estInactive(ligne, seuil);

  return (
    <Link
      href={`/motos/ventes?vente=${vente.id}`}
      className="block px-4 py-3 hover:bg-fond focus-visible:bg-fond"
    >
      {/* Le numéro prend sa propre ligne, comme sur la fiche. Serré à côté du
          nom, il volait la largeur à l'identité du client et au montant, et
          tout se brisait en quatre lignes sur un téléphone. */}
      <span className="plaque-code inline-block rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-xs leading-none text-encre-fixe">
        {vente.numero}
      </span>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium text-encre">{nomClient}</span>
          <span className="block text-sm text-encre-doux">
            {moto
              ? `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)} · ${moto.numeroChassis}`
              : "Moto hors de ce périmètre"}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold text-encre tabular-nums">
            {formaterMontant(vue === "dettes" ? ligne.resteDu : ligne.totalPaye)}
          </span>
          <span className="block text-sm text-encre-doux">
            {vue === "dettes" ? "reste dû" : "détenu"}
          </span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-encre-doux">
        <span>Vendue {formaterAnciennete(ligne.anciennete)}</span>
        <span aria-hidden="true" className="text-bord">
          |
        </span>
        <span>
          {ligne.dernierVersementAt
            ? `Dernier versement le ${formaterDateCourte(ligne.dernierVersementAt)}`
            : "Aucun versement"}
        </span>
        {/* Le signalement est écrit, pas seulement coloré : on lit cet écran en
            plein soleil (DESIGN.md §5). */}
        {inactive && (
          <span className="inline-flex items-center gap-1 rounded-plaque border border-plaque-bord bg-plaque/15 px-2 py-0.5 text-encre">
            <Clock aria-hidden="true" className="size-3.5" />
            {ligne.joursSansVersement} jours sans versement
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * Les listes vides. Elles ne sont pas des trous : dans cet écran, une liste
 * vide est une bonne nouvelle, et le texte le dit.
 */
function Vide({
  vue,
  perimetreEnCours,
  seuil,
}: {
  vue: Vue;
  perimetreEnCours: boolean;
  seuil: number;
}) {
  if (perimetreEnCours) return null;

  const texte: Record<Vue, string> = {
    dettes: "Aucune dette : toutes les ventes à crédit sont soldées.",
    tranches: "Aucune moto retenue au magasin en attente de son dernier versement.",
    inactives: `Aucune tranche sans versement depuis ${seuil} jours. Le seuil se règle dans Réglages, fiche Entreprise.`,
  };

  return (
    <p className="mt-3 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
      {texte[vue]}
    </p>
  );
}

function SansBoutique() {
  const session = useSession();
  const estResponsable = session.statut === "connecte" && session.utilisateur.role === "responsable";

  return (
    <div className="max-w-prose">
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Paiements</h1>
      <p className="mt-3 text-encre-doux">
        {estResponsable
          ? "Aucune boutique n’est déclarée : il n’y a encore ni dette ni tranche à suivre."
          : "Aucune boutique ne vous est attribuée. Vos écrans resteront vides tant que le responsable ne vous en aura pas donné une."}
      </p>
      {estResponsable && (
        <Link
          href="/parametres/boutiques"
          className="mt-6 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          Créer une boutique
        </Link>
      )}
    </div>
  );
}
