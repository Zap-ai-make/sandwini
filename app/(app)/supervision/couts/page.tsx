"use client";

import { Search, Wallet } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { FraisEntree } from "@/components/FraisEntree";
import { ErreurDeLecture, EtatErreurSaisie, EtatVide } from "@/components/patrons/Etats";
import { Avis } from "@/components/patrons/Avis";
import { Modale } from "@/components/patrons/Modale";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { useSession } from "@/lib/auth/session";
import { formaterDate, formaterMontant } from "@/lib/domain/format";
import {
  COUT_VIDE,
  LIBELLE_STATUT,
  construireCout,
  coutTotalSaisie,
  validerCoutPose,
  type Moto,
  type SaisieCout,
} from "@/lib/domain/moto";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { useCoutsDesMotos, type EtatCout } from "@/lib/repositories/couts-motos";
import { ecouterStock, messageErreurMoto, poserCoutMoto } from "@/lib/repositories/motos";

/**
 * Les prix d’achat — S39.
 *
 * **Pourquoi cet écran existe.** Le gérant ne saisit plus le prix d’achat : il
 * fait entrer la moto, un point c’est tout. Une moto peut donc rester sans coût,
 * et sans un endroit pour le poser après coup, sa marge serait muette pour
 * toujours. Le commanditaire a dit où : « le responsable verra les motos sans
 * prix d’achat, c’est à lui d’ajouter, et ça restera dans son espace. »
 *
 * **Il est fait pour être descendu, pas visité.** Le filtre s’ouvre sur « à
 * renseigner », et le formulaire s’ouvre sous la ligne qu’on touche : un
 * arrivage de six motos se solde en six saisies sans jamais changer d’écran.
 *
 * **Trois états et non deux.** Une lecture de coût peut tomber ; la moto est
 * alors rangée dans « lecture tombée », jamais dans « à renseigner ». Sans quoi
 * le responsable ressaisirait par-dessus un prix d’achat qui existe déjà (D82).
 */
export default function PageCouts() {
  const { perimetre } = usePerimetre();
  const catalogue = useCatalogue();
  const surTitre = useSurTitre("Supervision");

  const boutiqueId = perimetre.boutiqueId;
  const sansPerimetre = perimetre.type === "aucune";
  const souscrire = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );
  const {
    valeur: motos,
    erreur,
    echec,
    reessayer: relireLeStock,
  } = useAbonnement(souscrire, "Le stock n’a pas pu être lu.");

  const { etats, chargement, noter, reessayer } = useCoutsDesMotos(motos);
  const [filtre, setFiltre] = useState<Filtre>("a_renseigner");
  const [recherche, setRecherche] = useState("");
  const [ouverte, setOuverte] = useState<string | null>(null);

  const comptes = useMemo(() => compter(motos ?? [], etats), [motos, etats]);
  const lignes = useMemo(
    () =>
      (motos ?? [])
        .filter((moto) => retenue(etats.get(moto.id), filtre))
        .filter((moto) => correspondAuChassis(moto.numeroChassis, recherche)),
    [motos, etats, filtre, recherche],
  );

  if (echec) {
    return (
      <div>
        <TetePage surTitre={surTitre} titre="Prix d’achat" />
        <ErreurDeLecture
          titre="Le stock n’a pas pu être lu"
          echec={echec}
          reessayer={relireLeStock}
          sortie={{ href: "/supervision", libelle: "Revenir à la supervision" }}
        >
          {erreur} Sans la liste des motos, cet écran ne sait pas de quels prix d’achat il manque.
        </ErreurDeLecture>
      </div>
    );
  }

  const colonnes: Colonne<Moto>[] = [
    {
      cle: "moto",
      titre: "Moto",
      principal: true,
      rendu: (moto) => (
        <button
          type="button"
          onClick={() => setOuverte(ouverte === moto.id ? null : moto.id)}
          aria-expanded={ouverte === moto.id}
          /* Souligne toujours, pas au survol : c'est le seul moyen d'ouvrir
             la saisie, et il n'y a pas de survol au doigt. Un element qui
             agit doit se voir agir (DESIGN.md §11). */
          className="text-left font-medium text-encre underline decoration-bord underline-offset-4 hover:decoration-encre"
        >
          {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
        </button>
      ),
    },
    {
      cle: "chassis",
      titre: "Numéro de châssis",
      titreReplie: "Châssis",
      chiffre: true,
      rendu: (moto) => moto.numeroChassis,
    },
    {
      cle: "entree",
      titre: "Entrée le",
      rendu: (moto) => (moto.dateEntree ? formaterDate(moto.dateEntree) : "—"),
    },
    {
      cle: "statut",
      titre: "Statut",
      /* Une moto vendue peut très bien attendre son coût — c'est même le cas
         qui presse, sa marge restant muette tant qu'il manque. Le déclencheur
         `rattraperMargeDuCout` la comble dès que le prix d'achat arrive. */
      rendu: (moto) => LIBELLE_STATUT[moto.statut],
    },
    {
      cle: "cout",
      titre: "Coût d’entrée",
      chiffre: true,
      rendu: (moto) => <ValeurCout etat={etats.get(moto.id)} />,
    },
  ];

  return (
    <div>
      <TetePage
        surTitre={surTitre}
        titre="Prix d’achat"
        sousTitre="Ce que chaque moto a coûté. Les gérants ne le saisissent pas et ne le voient pas ; c’est ici qu’il se pose."
      />

      {comptes.inconnu > 0 && (
        <Avis ton="transit" titre="Des coûts n’ont pas pu être lus" className="mb-4" role="status">
          <p>
            {comptes.inconnu === 1
              ? "Une moto n’a pas répondu"
              : `${comptes.inconnu} motos n’ont pas répondu`}{" "}
            — le réseau, sans doute. Elles ne sont pas comptées comme « à renseigner » : elles ont
            peut-être déjà leur prix d’achat.{" "}
            <button type="button" onClick={reessayer} className="font-semibold underline">
              Redemander
            </button>
          </p>
        </Avis>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RechercheChassis valeur={recherche} changer={setRecherche} />
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrer les motos">
        {FILTRES.map(({ cle, libelle }) => (
          <button
            key={cle}
            type="button"
            onClick={() => setFiltre(cle)}
            aria-pressed={filtre === cle}
            className={[
              "inline-flex h-11 items-center gap-2 rounded-plaque border px-3 text-sm font-medium",
              filtre === cle
                ? "border-2 border-encre bg-papier font-semibold text-encre"
                : "border-bord bg-papier text-encre hover:bg-fond",
            ].join(" ")}
          >
            {libelle}
            <span className="text-encre-doux">{comptes[cle === "toutes" ? "total" : cle]}</span>
          </button>
        ))}
      </div>

      {lignes.length === 0 && !chargement ? (
        /* **Le filtre ne décide de la phrase que s'il y a quelque chose à
           filtrer.** Sur une base sans aucune moto, « tout est renseigné » se
           félicite d'un travail que personne n'a fait — un état vide qui ment
           dans le sens rassurant, ce que D63 refuse pour les cartes à zéro et
           qui vaut tout autant pour une phrase. */
        <EtatVide titre={VIDE[comptes.total === 0 ? "toutes" : filtre].titre}>
          {VIDE[comptes.total === 0 ? "toutes" : filtre].phrase}
        </EtatVide>
      ) : (
        <Tableau
          legende="Les motos en stock et l’état de leur prix d’achat"
          colonnes={colonnes}
          lignes={lignes}
          cleDe={(moto) => moto.id}
          chargement={chargement && lignes.length === 0}
          cleActive={ouverte}
        />
      )}

      {ouverte && motos && (
        <PoserLeCout
          key={ouverte}
          moto={motos.find((moto) => moto.id === ouverte)!}
          etat={etats.get(ouverte)}
          fermer={() => setOuverte(null)}
          noter={noter}
        />
      )}
    </div>
  );
}

/* --- Le formulaire de pose ------------------------------------------------ */

/* Le pied de la modale vit hors du `<form>` — c'est ce qui l'empêche de défiler
   avec le corps. Le bouton de soumission le rejoint donc par `form=`, qui est
   fait pour ça. */
const FORMULAIRE_COUT = "formulaire-prix-achat";

function PoserLeCout({
  moto,
  etat,
  fermer,
  noter,
}: {
  moto: Moto;
  etat: EtatCout | undefined;
  fermer: () => void;
  noter: (motoId: string, etat: EtatCout) => void;
}) {
  const session = useSession();
  const catalogue = useCatalogue();

  /* La saisie repart du coût connu quand il y en a un : on corrige une valeur,
     on ne la retape pas de mémoire. La clé sur la moto remonte le formulaire
     à zéro quand on passe à la ligne suivante — sans elle, le prix de la
     précédente resterait affiché sous le nom de la suivante. */
  const [saisie, setSaisie] = useState<SaisieCout>(() => depuisEtat(etat));
  const [erreur, setErreur] = useState<string | null>(null);

  const total = coutTotalSaisie(saisie);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;

    const probleme = validerCoutPose(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    const cout = construireCout(saisie);
    if (!cout) return;

    setErreur(null);
    poserCoutMoto(moto.id, moto.boutiqueId, cout, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurMoto(cause)));

    /* On note l'état localement plutôt que de relire : hors ligne, la lecture
       rendrait le document du cache — donc la même chose — et en ligne elle
       coûterait un aller-retour pour confirmer ce qu'on vient d'écrire. */
    noter(moto.id, { sorte: "connu", cout });
    fermer();
  }

  return (
    <Modale
      ouvert
      onFermer={fermer}
      titre="Prix d’achat"
      description={
        <span className="flex items-center gap-2">
          <Wallet aria-hidden="true" className="size-4" />
          {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
          {" — "}
          <span className="plaque-code">{moto.numeroChassis}</span>
        </span>
      }
      pied={
        /* Les actions au pied du cadre, hors du corps qui défile : c'est la
           garantie que le patron prend à sa charge, et la raison pour laquelle
           ce formulaire la gagne en passant en modale — le panneau en ligne
           poussait ses boutons hors de l'écran dès que les frais d'entrée
           s'allongeaient. Le bouton de soumission vise le formulaire par son
           `form`, puisqu'il n'est plus dedans. */
        <div className="flex flex-wrap gap-2">
          <button type="submit" form={FORMULAIRE_COUT} className="bouton bouton-principal">
            Enregistrer le prix d’achat
          </button>
          <button type="button" onClick={fermer} className="bouton bouton-neutre">
            Fermer
          </button>
        </div>
      }
    >
      <form id={FORMULAIRE_COUT} onSubmit={soumettre} noValidate>
        <div>
          <label htmlFor="pose-prix-achat" className="block text-sm font-medium text-encre">
            Prix d’achat
          </label>
          <input
            id="pose-prix-achat"
            inputMode="numeric"
            autoFocus
            value={saisie.prixAchat}
            onChange={(evenement) =>
              setSaisie((actuel) => ({ ...actuel, prixAchat: evenement.target.value }))
            }
            className="saisie mt-1.5"
          />
        </div>

        <FraisEntree
          lignes={saisie.fraisEntree}
          changer={(fraisEntree) => setSaisie((actuel) => ({ ...actuel, fraisEntree }))}
          types={catalogue.typesFrais.filter((type) => type.actif)}
        />

        <p className="mt-4 flex items-baseline justify-between gap-4 border-t border-bord pt-3">
          <span className="text-sm font-medium text-encre">Coût total d’entrée</span>
          <span className="text-lg font-semibold text-encre">{formaterMontant(total)}</span>
        </p>

        <EtatErreurSaisie message={erreur} className="mt-3" />
      </form>
    </Modale>
  );
}

function depuisEtat(etat: EtatCout | undefined): SaisieCout {
  if (etat?.sorte !== "connu") return COUT_VIDE;
  return {
    prixAchat: `${etat.cout.prixAchat}`,
    fraisEntree: etat.cout.fraisEntree.map((ligne) => ({
      typeFraisId: ligne.typeFraisId,
      montant: `${ligne.montant}`,
      note: ligne.note,
    })),
  };
}

/* --- Filtres et comptes --------------------------------------------------- */

type Filtre = "a_renseigner" | "renseignes" | "toutes";

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: "a_renseigner", libelle: "À renseigner" },
  { cle: "renseignes", libelle: "Renseignés" },
  { cle: "toutes", libelle: "Toutes" },
];

const VIDE: Record<Filtre, { titre: string; phrase: string }> = {
  a_renseigner: {
    titre: "Tout est renseigné",
    phrase: "Chaque moto en stock porte son prix d’achat. Les marges sont calculables.",
  },
  renseignes: {
    titre: "Aucun prix d’achat posé",
    phrase: "Les motos entrées par les gérants attendent le leur, dans l’onglet « À renseigner ».",
  },
  toutes: {
    titre: "Aucune moto en stock",
    phrase: "Les motos apparaîtront ici au fur et à mesure des entrées en stock.",
  },
};

function retenue(etat: EtatCout | undefined, filtre: Filtre): boolean {
  if (filtre === "toutes") return true;
  /* Tant qu'on ne sait pas, la moto n'entre dans aucun des deux camps : elle
     n'est ni à renseigner ni renseignée. Elle reste visible sous « Toutes ». */
  if (etat === undefined || etat.sorte === "inconnu") return false;
  return filtre === "a_renseigner" ? etat.sorte === "absent" : etat.sorte === "connu";
}

function compter(
  motos: readonly Moto[],
  etats: ReadonlyMap<string, EtatCout>,
): Record<"a_renseigner" | "renseignes" | "total" | "inconnu", number> {
  let a_renseigner = 0;
  let renseignes = 0;
  let inconnu = 0;
  for (const moto of motos) {
    const etat = etats.get(moto.id);
    if (etat?.sorte === "absent") a_renseigner += 1;
    else if (etat?.sorte === "connu") renseignes += 1;
    else if (etat?.sorte === "inconnu") inconnu += 1;
  }
  return { a_renseigner, renseignes, total: motos.length, inconnu };
}

function ValeurCout({ etat }: { etat: EtatCout | undefined }) {
  if (etat === undefined) return <span className="text-encre-doux">…</span>;
  if (etat.sorte === "connu") return <>{formaterMontant(etat.cout.coutTotal)}</>;
  if (etat.sorte === "absent") return <span className="text-encre-doux">À renseigner</span>;
  return <span className="text-encre-doux">Lecture tombée</span>;
}

/**
 * Cherche une moto par son châssis, sur cet écran seulement.
 *
 * **Sans casse ni séparateur.** Un châssis se relève sur le cadre, se recopie
 * sur un bon de livraison, se retape ici : les espaces et les tirets ne
 * survivent pas à ce trajet, et exiger la forme exacte ferait échouer la
 * recherche sur une saisie juste. C'est le même traitement que la recherche des
 * ventes applique déjà au châssis (`chercherVentes`).
 *
 * **Une sous-chaîne, pas un début.** On tape souvent les quatre derniers
 * caractères, seuls lisibles sur une plaque gravée.
 */
function correspondAuChassis(chassis: string, recherche: string): boolean {
  const cherche = recherche.toUpperCase().replace(/[\s-]+/g, "");
  if (cherche.length === 0) return true;
  return chassis.toUpperCase().replace(/[\s-]+/g, "").includes(cherche);
}

function RechercheChassis({
  valeur,
  changer,
}: {
  valeur: string;
  changer: (valeur: string) => void;
}) {
  /* Bornée comme les autres recherches du produit (`socle.css:448`). */
  return (
    <div className="relative min-w-56 flex-1 sm:max-w-80">
      <label htmlFor="recherche-chassis" className="sr-only">
        Chercher un numéro de châssis
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
      />
      <input
        id="recherche-chassis"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Numéro de châssis"
        value={valeur}
        onChange={(evenement) => changer(evenement.target.value)}
        /* En `font-code` : c'est ainsi que le châssis s'affiche dans la
           colonne, et une recherche qui ne ressemble pas à ce qu'elle cherche
           se relit mal caractère par caractère. */
        className="saisie pr-3 pl-9 font-code placeholder:font-sans placeholder:text-encre-doux"
      />
    </div>
  );
}
