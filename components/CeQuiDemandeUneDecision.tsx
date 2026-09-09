"use client";

import { ArrowRight, Check, Coins, FolderClock } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { EtatChargement, EtatErreur } from "@/components/patrons/Etats";
import {
  dossiersEnAttente,
  estEnRetard,
  FILTRES_DOSSIERS_VIDES,
} from "@/lib/domain/dossier";
import { SEUIL_INACTIVITE_DEFAUT, type ReglagesEntreprise } from "@/lib/domain/entreprise";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import {
  estInactive,
  LIBELLE_DOCUMENT,
  suivrePaiements,
  tranchesEnCours,
  type DocumentDossier,
  type Vente,
  type Versement,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterReglages } from "@/lib/repositories/entreprise";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterDossiers, ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Ce qui demande une décision, toutes boutiques réunies.
 *
 * La supervision répond d’abord à « laquelle je regarde ». Une fois ce choix
 * fait, la deuxième question du responsable n’est pas « combien ai-je vendu »
 * — c’est « qu’est-ce qui traîne ». Cette section-là y répond avec des lignes
 * réelles, sur lesquelles on clique, et non avec des compteurs.
 *
 * **Pourquoi ce n’est pas le tableau de bord que D63 repousse.** D63 refuse
 * les cartes de chiffres agrégés tant que S24 n’existe pas, parce qu’un
 * indicateur à zéro ment sur l’état du commerce. Ici il n’y a aucun agrégat :
 * ce sont des dossiers et des ventes nommés, chacun ouvrable, et quand il n’y
 * en a aucun l’écran l’écrit en toutes lettres au lieu d’afficher « 0 ».
 *
 * **Deux sortes de retard, et pas une troisième.** Le dossier en retard : un
 * prestataire a annoncé une date, elle est passée (`estEnRetard`). La tranche
 * inactive : aucun versement depuis le seuil réglé (`estInactive`). Les deux
 * sont des notions définies, testées, et réglées ailleurs dans le produit.
 *
 * La maquette montrait une troisième ligne, « crédit échu ». Elle n’existe
 * pas : une vente à crédit n’a pas de date d’échéance dans ce produit, et
 * décider qu’un crédit est en retard au bout de N jours serait inventer une
 * règle de gestion — celle-là revient au responsable, pas au logiciel. Le jour
 * où il en fixe une, elle se règle comme le seuil des tranches et cette
 * section l’affiche.
 */
const MAX_LIGNES = 6;

type Ligne = {
  cle: string;
  href: string;
  numero: string;
  client: string;
  quoi: string;
  precision: string;
  montant: number | null;
  sorte: "dossier" | "tranche";
};

export function CeQuiDemandeUneDecision({
  /**
   * Le même calcul sert deux écrans. Chez le responsable il s’appelle « ce qui
   * demande une décision » — toutes boutiques réunies, c’est un arbitrage.
   * Chez le gérant il s’appelle « à faire aujourd’hui » — dans sa boutique,
   * c’est du travail. Le périmètre fait la différence, et il vient déjà du
   * bandeau ; seul le titre change.
   */
  titre = "Ce qui demande une décision",
  className,
}: {
  titre?: string;
  className?: string;
} = {}) {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const { clients } = useFichierClients();
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

  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVersementsDuPerimetre(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: versements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  const souscrireReglages = useCallback(
    (auChangement: (r: ReglagesEntreprise | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterReglages(auChangement, enErreur),
    [],
  );
  const { valeur: reglages } = useAbonnement(
    souscrireReglages,
    "Le seuil d’inactivité n’a pas pu être lu.",
  );
  const seuil = reglages?.seuilInactiviteTranches ?? SEUIL_INACTIVITE_DEFAUT;

  const nomDuClient = useMemo(
    () => new Map(clients.map((client) => [client.id, client.nom])),
    [clients],
  );

  /* La date du jour est figée pour tout le calcul : deux lignes de la même
     liste jugées à des instants différents se contrediraient. */
  const lignes = useMemo<Ligne[]>(() => {
    if (!ventes || !documents || !versements) return [];
    const maintenant = new Date();
    const nom = (id: string) => nomDuClient.get(id) ?? "Client inconnu";

    const enRetard: Ligne[] = dossiersEnAttente(
      ventes,
      documents,
      { ...FILTRES_DOSSIERS_VIDES, etat: "en_retard" },
      maintenant,
    )
      .map((dossier) => {
        const document = dossier.enCours.find((d) => estEnRetard(d.disponibleLe, maintenant));
        return {
          cle: `dossier-${dossier.venteId}`,
          href: `/motos/dossiers`,
          numero: dossier.numero,
          client: nom(dossier.clientId),
          quoi: `${LIBELLE_DOCUMENT[document?.type ?? "carte_grise"]} en retard`,
          precision: document?.disponibleLe
            ? `annoncée pour le ${formaterDateCourte(document.disponibleLe)}`
            : "",
          montant: null,
          sorte: "dossier" as const,
        };
      });

    const inactives: Ligne[] = tranchesEnCours(suivrePaiements(ventes, versements, maintenant))
      .filter((ligne) => estInactive(ligne, seuil))
      .map((ligne) => ({
        cle: `tranche-${ligne.vente.id}`,
        href: "/motos/paiements",
        numero: ligne.vente.numero,
        client: nom(ligne.vente.clientId),
        quoi: "Tranche sans versement",
        precision:
          ligne.joursSansVersement === null
            ? ""
            : `depuis ${ligne.joursSansVersement} jours — le seuil est à ${seuil}`,
        montant: ligne.resteDu,
        sorte: "tranche" as const,
      }));

    return [...enRetard, ...inactives];
  }, [ventes, documents, versements, nomDuClient, seuil]);

  const chargement =
    perimetreEnCours || ventes === null || documents === null || versements === null;

  return (
    <section className={className ?? ""}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-bloc font-semibold text-encre">{titre}</h2>
        <Link href="/motos/dossiers" className="bouton bouton-discret">
          Tous les dossiers
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      <EtatErreur message={erreur} className="mb-3" />

      {chargement ? (
        <EtatChargement>Lecture des dossiers et des tranches…</EtatChargement>
      ) : lignes.length === 0 ? (
        /* Pas un compteur à zéro : une phrase vraie. « Rien n’attend » est une
           information utile au responsable ; « 0 » ne l’est pas. */
        <p className="flex items-center gap-3 text-encre-doux">
          <Check aria-hidden="true" className="size-4 shrink-0 text-solde" />
          Rien n’attend de décision&nbsp;: aucun document en retard, aucune tranche inactive.
        </p>
      ) : (
        <>
          <ul className="cadre cadre-liste">
            {lignes.slice(0, MAX_LIGNES).map((ligne) => (
              <li key={ligne.cle}>
                <Link
                  href={ligne.href}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 hover:bg-survol"
                >
                  {ligne.sorte === "dossier" ? (
                    <FolderClock aria-hidden="true" className="size-4 shrink-0 text-alerte" />
                  ) : (
                    <Coins aria-hidden="true" className="size-4 shrink-0 text-alerte" />
                  )}
                  <span className="plaque-code shrink-0 font-medium text-encre">
                    {ligne.numero}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-encre">{ligne.client}</span>
                  <span className="text-corps text-alerte">{ligne.quoi}</span>
                  {ligne.precision && (
                    <span className="text-corps text-encre-doux">{ligne.precision}</span>
                  )}
                  {ligne.montant !== null && (
                    <span className="ml-auto font-code font-medium text-encre">
                      {formaterMontant(ligne.montant)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {lignes.length > MAX_LIGNES && (
            <p className="mt-2 text-corps text-encre-doux">
              {lignes.length - MAX_LIGNES} autres attendent aussi. Les dossiers se traitent dans{" "}
              <Link href="/motos/dossiers" className="underline">
                Dossiers en attente
              </Link>
              , les tranches dans{" "}
              <Link href="/motos/paiements" className="underline">
                Paiements
              </Link>
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}
