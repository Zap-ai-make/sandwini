"use client";

import { TrendingUp } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { CartesDuMois, Repartition } from "@/components/ChiffresDuMois";
import { GardeCapacite } from "@/components/GardeSession";
import { ErreurDeLecture, EtatChargement, EtatVide } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import {
  chiffresDuMois,
  cleMois,
  derniersMois,
  libelleMois,
  moisDe,
  partsParBoutique,
  partsParMode,
  type Mois,
} from "@/lib/domain/chiffres";
import { peut } from "@/lib/domain/roles";
import type { Vente, Versement } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useMarges } from "@/lib/repositories/marges";
import { ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Les chiffres du mois — S24, `c3-supervision-chiffres.html`.
 *
 * **Ce que D63 attendait.** « La supervision est une section, pas un tableau de
 * bord ; aucune carte à zéro. » Cet écran ne renverse pas cette décision : il en
 * remplit la condition. Les chiffres existent enfin, et un mois sans rien
 * l’écrit en une phrase plutôt qu’en quatre zéros alignés.
 *
 * **Tout se calcule à la lecture**, sur les collections déjà écoutées par le
 * reste du produit. Aucun agrégat entretenu par déclencheur : ce qui se
 * recalcule à l’ouverture ne peut pas diverger de ce dont il est tiré, et
 * surtout il continue de fonctionner hors ligne (D61). Le seuil où ce choix
 * cesse d’être bon est écrit dans la spec, pour être connu d’avance plutôt
 * qu’improvisé.
 */
export default function PageChiffres() {
  return (
    <GardeCapacite capacite="acceder_supervision">
      <Chiffres />
    </GardeCapacite>
  );
}

function Chiffres() {
  const session = useSession();
  const { perimetre, boutiques } = usePerimetre();
  const [mois, setMois] = useState<Mois>(() => moisDe(new Date()));

  const role = session.statut === "connecte" ? session.utilisateur.role : null;
  const avecMarge = role !== null && peut(role, "voir_marges");
  const boutiqueId = perimetre.boutiqueId;
  const sansPerimetre = perimetre.type === "aucune";

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );
  const { valeur: ventes, erreur, echec, reessayer } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être lues.",
  );

  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterVersementsDuPerimetre(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );
  const { valeur: versements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  /* Seules les ventes du mois affiché : la marge se lit document par document,
     et il n'y a aucune raison de demander celles qu'on ne montre pas. */
  const ventesDuMois = useMemo(
    () =>
      (ventes ?? []).filter(
        (vente) => vente.date !== null && cleMois(moisDe(vente.date)) === cleMois(mois),
      ),
    [ventes, mois],
  );
  const marges = useMarges(avecMarge ? ventesDuMois : null);

  const nomDeLaBoutique = useCallback(
    (id: string) => boutiques.find((boutique) => boutique.id === id)?.nom ?? id,
    [boutiques],
  );

  const chiffres = useMemo(
    () => chiffresDuMois(mois, ventes ?? [], versements ?? [], marges),
    [mois, ventes, versements, marges],
  );
  const parBoutique = useMemo(
    () => partsParBoutique(mois, ventes ?? [], nomDeLaBoutique),
    [mois, ventes, nomDeLaBoutique],
  );
  const parMode = useMemo(() => partsParMode(mois, ventes ?? []), [mois, ventes]);

  const ou = perimetre.type === "boutique" ? perimetre.nom : "Toutes les boutiques";
  const chargement = !sansPerimetre && (ventes === null || versements === null) && !erreur;

  return (
    <div>
      <TetePage
        retour={{ href: "/supervision", libelle: "Supervision" }}
        surTitre={`${ou} · ${libelleMois(mois)}`}
        titre="Les chiffres"
        actions={<ChoixDuMois mois={mois} choisir={setMois} />}
      />

      {erreur ? (
        <ErreurDeLecture
          titre="Les chiffres n’ont pas pu être calculés"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/supervision", libelle: "Retour à la supervision" }}
        >
          {erreur} Les ventes et les paiements restent consultables depuis leurs écrans.
        </ErreurDeLecture>
      ) : chargement ? (
        <EtatChargement className="mt-6">Lecture des ventes et des versements…</EtatChargement>
      ) : chiffres.vide ? (
        /* Décision 6 : une phrase, pas quatre zéros alignés. Un mois sans rien
           est une information ; « 0 · 0 · 0 · 0 » n'en est pas une (D63). */
        <EtatVide
          icone={<TrendingUp aria-hidden="true" className="size-10" />}
          titre={`Aucune vente en ${libelleMois(mois)}`}
          className="mt-6"
        >
          Rien n’a été vendu ni encaissé ce mois-là. Choisissez un autre mois, ou enregistrez une
          vente pour voir les chiffres apparaître.
        </EtatVide>
      ) : (
        <div className="mt-6 grid gap-8">
          <CartesDuMois chiffres={chiffres} mois={mois} avecMarge={avecMarge} />

          <Repartition
            id="titre-par-boutique"
            titre="Par boutique"
            parts={parBoutique}
            unite="motos"
          />

          <Repartition
            id="titre-par-mode"
            titre="Par mode de paiement"
            parts={parMode}
            unite="ventes"
          >
            <p className="mt-4 max-w-prose text-corps text-encre-doux">
              «&nbsp;Crédit&nbsp;» et «&nbsp;tranches&nbsp;» ne se totalisent pas ensemble&nbsp;:
              dans un cas le client doit de l’argent au magasin, dans l’autre le magasin détient de
              l’argent et retient la moto.
            </p>
          </Repartition>
        </div>
      )}
    </div>
  );
}

/**
 * Le choix du mois : les douze derniers, du plus récent au plus ancien.
 *
 * Un `select` natif, comme les autres filtres du produit : il est accessible
 * sans une ligne de JavaScript, il s’ouvre au clavier, et D72 refuse la
 * bibliothèque de composants qu’un menu dessiné à la main réclamerait.
 *
 * Douze mois n’a pas été arbitré par le commanditaire — c’est ma
 * recommandation, et elle tient dans une constante (`MOIS_OFFERTS`).
 */
function ChoixDuMois({ mois, choisir }: { mois: Mois; choisir: (mois: Mois) => void }) {
  const offerts = useMemo(() => derniersMois(new Date()), []);

  return (
    <div>
      <label htmlFor="choix-mois" className="sr-only">
        Mois affiché
      </label>
      <select
        id="choix-mois"
        className="saisie h-11 w-auto pr-2 lg:h-9"
        value={cleMois(mois)}
        onChange={(evenement) => {
          const trouve = offerts.find((offert) => cleMois(offert) === evenement.target.value);
          if (trouve) choisir(trouve);
        }}
      >
        {offerts.map((offert) => (
          <option key={cleMois(offert)} value={cleMois(offert)}>
            {libelleMois(offert)}
          </option>
        ))}
      </select>
    </div>
  );
}
