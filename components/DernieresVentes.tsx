"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { ErreurDeLecture, EtatChargement, PastillePaiement } from "@/components/patrons/Etats";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import { comparerVentes, LIBELLE_MODE, type Vente } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes } from "@/lib/repositories/ventes";

/**
 * Les dernières ventes, toutes boutiques — la seconde section d’A2
 * (`a2:184-196`).
 *
 * **Ce n’est pas le tableau de bord que D63 repousse.** Aucun chiffre n’est
 * agrégé : ce sont six ventes nommées, chacune ouvrable, exactement comme la
 * section du dessus liste des dossiers. « 22 ventes ce mois » serait un
 * agrégat, et attend S24 ; « voici les six dernières » n’en est pas un, et se
 * lit sans qu’on ait à croire un total sur parole.
 *
 * **Elle répond à une autre question que celle du dessus.** « Ce qui demande
 * une décision » dit ce qui traîne ; celle-ci dit ce qui s’est passé — le
 * responsable qui ouvre l’écran le matin veut savoir si les comptoirs ont
 * travaillé hier, et il n’a pas à ouvrir trois écrans de boutique pour cela.
 * D’où l’ordre de la maquette, et pas l’inverse : on ouvre la supervision pour
 * décider, pas pour se féliciter.
 *
 * **La colonne « Boutique » est ici, comme dans le tableau du dessus.** La
 * décision du 9 septembre l’a retirée d’A6, A7 et A8, où les trois premières
 * lettres du numéro de pièce la disent déjà. A2 est le seul écran où l’on
 * compare les boutiques *entre elles*, et sa maquette la porte (`a2:196`).
 */
const MAX_LIGNES = 6;

type Ligne = {
  vente: Vente;
  client: string;
  moto: string;
};

export function DernieresVentes({ className }: { className?: string } = {}) {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();

  const boutiqueId = perimetre.boutiqueId;
  /* Sans périmètre, on n'écoute rien (D7) : une écoute sans boutique est une
     lecture de *toutes* les boutiques, que les règles refusent — elle poserait
     une erreur rouge devant quelqu'un qui n'y peut rien. */
  const sansPerimetre = perimetre.type === "aucune";

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );
  const { valeur: ventes, erreur } = useAbonnement(
    souscrireVentes,
    "Les dernières ventes n’ont pas pu être lues.",
  );

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être lu.");

  const lignes = useMemo<Ligne[]>(() => {
    const nomDuClient = new Map(clients.map((client) => [client.id, client.nom]));
    const parMoto = new Map((stock ?? []).map((moto) => [moto.id, moto]));

    return [...(ventes ?? [])]
      .sort(comparerVentes)
      .slice(0, MAX_LIGNES)
      .map((vente) => {
        const moto = parMoto.get(vente.motoId);
        return {
          vente,
          client: nomDuClient.get(vente.clientId) ?? "Client inconnu",
          moto: moto
            ? `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)}`
            : "Moto hors de ce périmètre",
        };
      });
  }, [ventes, stock, clients, catalogue]);

  const colonnes: Colonne<Ligne>[] = [
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
      cle: "boutique",
      titre: "Boutique",
      rendu: (ligne) => (
        <span className="plaque-code rounded-plaque border border-plaque-bord bg-plaque px-1.5 py-0.5 text-legende leading-none text-encre-fixe">
          {ligne.vente.boutiqueId}
        </span>
      ),
    },
    { cle: "client", titre: "Client", principal: true, rendu: (ligne) => ligne.client },
    { cle: "moto", titre: "Moto", rendu: (ligne) => ligne.moto },
    { cle: "mode", titre: "Mode", rendu: (ligne) => LIBELLE_MODE[ligne.vente.modePaiement] },
    {
      /* La devise est titrée une fois, en tête de colonne — six montants
         suivis de « FCFA » six fois, c'est la devise qu'on lit, pas le
         chiffre. */
      cle: "prix",
      titre: "Prix convenu (FCFA)",
      chiffre: true,
      rendu: (ligne) => formaterNombre(ligne.vente.prixConvenu),
    },
    {
      cle: "paiement",
      titre: "Paiement",
      rendu: (ligne) => <PastillePaiement statut={ligne.vente.statutPaiement} />,
    },
  ];

  const chargement = perimetreEnCours || (!sansPerimetre && ventes === null && !erreur);

  return (
    <section className={className ?? ""}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-bloc font-bold tracking-tight text-encre">Les dernières ventes</h2>
        <Link href="/motos/ventes" className="bouton bouton-discret">
          Toutes les ventes
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {erreur ? (
        <ErreurDeLecture titre="Les dernières ventes n’ont pas pu être lues">
          {erreur} Les ventes se consultent quand même depuis leur propre écran.
        </ErreurDeLecture>
      ) : chargement ? (
        <EtatChargement>Lecture des ventes…</EtatChargement>
      ) : lignes.length === 0 ? (
        /* Une phrase, et non « 0 ». Sur une installation neuve c'est même
           l'information la plus utile de l'écran : il reste à vendre. */
        <p className="text-encre-doux">
          Aucune vente enregistrée pour l’instant. La première apparaîtra ici.
        </p>
      ) : (
        <div className="cadre cadre-tableau">
          <Tableau
            legende="Les six dernières ventes, toutes boutiques"
            colonnes={colonnes}
            lignes={lignes}
            cleDe={(ligne) => ligne.vente.id}
          />
        </div>
      )}
    </section>
  );
}
