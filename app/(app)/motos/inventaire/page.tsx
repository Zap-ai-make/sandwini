"use client";

import { useCallback, useMemo, useState } from "react";
import { BilanPeriode } from "@/components/BilanPeriode";
import { InventaireStock } from "@/components/InventaireStock";
import { CartesDuMois, Repartition } from "@/components/ChiffresDuMois";
import { ErreurDeLecture, EtatChargement } from "@/components/patrons/Etats";
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
import { formaterMontant } from "@/lib/domain/format";
import { peut } from "@/lib/domain/roles";
import type { Moto } from "@/lib/domain/moto";
import type { Vente, Versement } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { useMarges } from "@/lib/repositories/marges";
import { ecouterStock } from "@/lib/repositories/motos";
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
/**
 * **Plus de garde de capacité, et c'est la demande du commanditaire (S55) :**
 * « l'inventaire doit se faire à deux niveaux, pour chaque gérant et pour le
 * superviseur qui agrège tout ».
 *
 * L'écran était fermé par `acceder_supervision`, que seul le responsable
 * possède. Un gérant ne pouvait donc pas savoir ce qu'il détenait ni depuis
 * quand — alors que c'est lui qui range les motos dans la cour, et le seul à
 * pouvoir agir le jour même sur celle qui dort depuis quatre mois.
 *
 * **Rien ne s'ouvre pour autant.** Le périmètre borne déjà les lectures : un
 * gérant n'écoute que sa boutique, et les règles Firestore refuseraient le
 * reste. Les marges et les coûts restent derrière `voir_marges` **dans**
 * l'écran, document par document, comme avant — le mur de D2 n'a jamais été
 * cette garde-ci, il est en sous-collection `prive/` (D2, D27).
 */
export default function PageChiffres() {
  return <Chiffres />;
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

  /* L'inventaire lit les motos, pas les ventes : c'est la seule écoute de
     l'écran qui réponde à « qu'est-ce que j'ai ». Elle suit le même périmètre
     que les autres, donc les deux niveaux sortent du même code. */
  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );
  const { valeur: motos, erreur: erreurStock } = useAbonnement(
    souscrireStock,
    "Le stock n’a pas pu être lu.",
  );

  const catalogue = useCatalogue();
  /* Figé au montage : pris à chaque rendu, les âges bougeraient sous les yeux
     et relanceraient les animations de chiffre sans qu'il se soit rien passé. */
  const maintenant = useMemo(() => new Date(), []);

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

  /* Le total se tire des parts affichées plutôt que d'un champ voisin : deux
     sources pour un seul nombre finissent toujours par diverger d'un arrondi,
     et c'est la phrase du chapeau qui aurait tort. */
  const totalDesVentes = useMemo(
    () => parBoutique.reduce((somme, part) => somme + part.montant, 0),
    [parBoutique],
  );

  const ou = perimetre.type === "boutique" ? perimetre.nom : "Toutes les boutiques";
  /* Un gérant n'a pas de supervision où revenir : le renvoyer là-bas le
     déposerait sur un refus. Il revient à son espace, d'où il vient. */
  const retour =
    role !== null && peut(role, "acceder_supervision")
      ? { href: "/supervision", libelle: "Supervision" }
      : { href: "/motos", libelle: "Motos" };
  const chargement = !sansPerimetre && (ventes === null || versements === null) && !erreur;

  return (
    <div>
      <TetePage
        retour={retour}
        surTitre={`${ou} · ${libelleMois(mois)}`}
        titre="Inventaire"
        actions={<ChoixDuMois mois={mois} choisir={setMois} />}
      />

      {/* Le bilan de période (S50), au-dessus des cartes du mois et avec son
          propre sélecteur : les deux ne répondent pas à la même question, et
          leur faire partager une période obligerait l'un des deux à mentir sur
          ce qu'il montre.

          **Il n'attend que les ventes**, et c'est une correction. Je l'avais
          accroché à `chargement`, qui attend *aussi* les versements — dont ce
          bloc ne se sert pas. Un bilan complet restait donc invisible tant que
          la seconde écoute n'avait pas répondu, et elle peut ne jamais
          répondre : l'écran ne relève pas l'erreur des versements, si bien
          qu'un échec de ce côté laisse la page en lecture pour toujours. Faire
          dépendre un bloc de données qu'il n'emploie pas, c'est hériter des
          pannes des autres. */}
      {/* **L'inventaire vient en premier, et il ne dépend pas des ventes.**
          L'onglet s'appelle « Inventaire » : ce qu'on détient doit être la
          première chose lue. Et un magasin peut très bien n'avoir rien vendu du
          mois tout en ayant trente motos dans la cour — accrocher ce bloc au
          vide des ventes aurait caché le stock précisément les mois où il pèse
          le plus lourd. */}
      {!erreurStock && !sansPerimetre && motos !== null && (
        <div className="mt-6 mb-8">
          <InventaireStock
            motos={motos}
            maintenant={maintenant}
            nomMarque={catalogue.nomMarque}
            nomModele={catalogue.nomModele}
            nomDeLaBoutique={nomDeLaBoutique}
            agrege={perimetre.type === "toutes"}
          />
        </div>
      )}

      {!erreur && !sansPerimetre && ventes !== null && <BilanPeriode ventes={ventes} />}

      {erreur ? (
        <ErreurDeLecture
          titre="L’inventaire n’a pas pu être calculé"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: retour.href, libelle: `Retour à ${retour.libelle.toLowerCase()}` }}
        >
          {erreur} Les ventes et les paiements restent consultables depuis leurs écrans.
        </ErreurDeLecture>
      ) : chargement ? (
        <EtatChargement className="mt-6">Lecture des ventes et des versements…</EtatChargement>
      ) : chiffres.vide ? (
        /* Décision 6 : une phrase, pas quatre zéros alignés. Un mois sans rien
           est une information ; « 0 · 0 · 0 · 0 » n'en est pas une (D63). */
        null
      ) : (
        <div className="mt-6 grid gap-8">
          <CartesDuMois chiffres={chiffres} mois={mois} avecMarge={avecMarge} />

          {/* **Le chapeau, et pourquoi il manquait (S55).** Les deux sections
              affichent le même total, à quelques pixels l'une de l'autre, sans
              rien qui le dise : le commanditaire a lu « 915 000 » deux fois et
              n'a pas compris s'il devait les additionner. Ils ne s'additionnent
              pas — c'est un seul mois, coupé deux fois. La phrase le pose avant
              que la question se forme. */}
          <div className="grid gap-8">
            <p className="max-w-prose text-corps text-encre-doux">
              Les deux découpages ci-dessous portent sur le <strong className="font-semibold text-encre">même
              total</strong> — {formaterMontant(totalDesVentes)} vendus en {libelleMois(mois)}. Le premier dit
              où, le second comment : ils ne s’additionnent pas.
            </p>

            <Repartition
              id="titre-par-boutique"
              titre="Par boutique"
              parts={parBoutique}
              unite="moto"
              seule="Seule boutique à avoir vendu ce mois-ci."
            />

            <Repartition
              id="titre-par-mode"
              titre="Par mode de paiement"
              parts={parMode}
              unite="vente"
              seule="Seul mode de paiement employé ce mois-ci."
            >
              <p className="mt-4 max-w-prose text-corps text-encre-doux">
                «&nbsp;Crédit&nbsp;» et «&nbsp;tranches&nbsp;» ne se totalisent pas ensemble&nbsp;:
                dans un cas le client doit de l’argent au magasin, dans l’autre le magasin détient
                de l’argent et retient la moto.
              </p>
            </Repartition>
          </div>
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
