"use client";

import { PackageCheck, Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";

import { DepotsCartesGrises } from "@/components/DepotsCartesGrises";
import { GardeEspace } from "@/components/GardeSession";
import { LigneModale } from "@/components/GestesDossierCarteGrise";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { ErreurDeLecture, EtatChargement } from "@/components/patrons/Etats";
import { Onglets } from "@/components/patrons/Onglets";
import { TetePage } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { useSession } from "@/lib/auth/session";
import { normaliserNom } from "@/lib/domain/client";
import {
  depotsDeCartesGrises,
  dossiersDuLot,
  LOT_A_DEPOSER,
  nombreADeposer,
  type DepotCarteGrise,
} from "@/lib/domain/depots-carte-grise";
import {
  aMarquerRecu,
  chercherDossiers,
  ENTETES_LIGNE,
  ORDRE_LIGNE,
  rangerDossiers,
  type CleColonneLigne,
  type DossierCarteGrise,
} from "@/lib/domain/dossier-carte-grise";
import { formaterDateCourte, formaterNombre } from "@/lib/domain/format";
import type { Prestataire } from "@/lib/domain/prestataire";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import {
  ecouterDossiersCarteGrise,
  marquerRetoursMagasin,
  messageErreurDossierCarteGrise,
} from "@/lib/repositories/dossiers-carte-grise";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";

/**
 * Les dossiers de carte grise, tenus comme son classeur (S59).
 *
 * **Ses dix colonnes, sous ses noms et dans son ordre.** Demande du
 * commanditaire, et le motif est le bon : « il s'est familiarisé avec et ne
 * veut pas de changement ». Un entête traduit — `CHASIS` devenu « Châssis » —
 * lui ferait relire la colonne à chaque ligne. L'ordre et les entêtes viennent
 * de `ORDRE_LIGNE`, la même liste que la modale de saisie : la ligne qu'on
 * remplit et la ligne qu'on relit ne peuvent pas diverger.
 *
 * **Plus aucun bouton dans les lignes.** Il y en avait deux, « C'est revenu »
 * et « Remettre » ; il les a retirés. Le geste est désormais le même qu'au
 * tableur : on ouvre la ligne, on remplit la case, on enregistre. Le statut ne
 * se choisit plus, il se déduit du remplissage.
 *
 * **Deux onglets subsistent, et ce ne sont pas des colonnes.** Son fichier est
 * une seule feuille ; mais entre le dépôt et le retrait il passe presque un an,
 * et mêler les dossiers rendus à ceux qu'on attend enterrerait les seconds. Le
 * partage porte sur les lignes montrées, jamais sur ce qu'une ligne dit.
 */
export default function PageDossiersCarteGrise() {
  /* `useSearchParams` exige une frontière Suspense pour la génération
     statique : sans elle, le build échoue sur cette page. */
  return (
    <GardeEspace espace="cartes_grises">
      <Suspense fallback={null}>
        <Ecran />
      </Suspense>
    </GardeEspace>
  );
}

type Panneau = "cours" | "historique";

const AUCUN_PRESTATAIRE: Prestataire[] = [];

/**
 * **Deux vues, une adresse** (2 novembre 2026). Sans `?lot=`, l'écran ne montre
 * que les dépôts ; avec, le classeur réduit à ce lot. Le lot vit dans
 * l'adresse et non dans un état : le bouton retour du téléphone ramène ainsi
 * à la liste des dépôts, comme on s'y attend.
 */
function Ecran() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const lot = useSearchParams().get("lot");
  const [creation, setCreation] = useState(false);

  /**
   * **Toute l'entreprise dès que le périmètre porte le métier.** C'est ce que
   * le métier veut dire : elle traite les papiers de l'entreprise, pas ceux
   * d'un magasin. Une boutique motos, elle, ne voit que les siens.
   *
   * Les règles tranchent pour de bon (D27) ; ici on ne fait que poser la
   * question la plus large que le compte ait le droit de poser.
   */
  const traiteTout = perimetre.metiers.includes("cartes_grises");
  const portee = traiteTout ? null : perimetre.boutiqueId;

  const { valeur, erreur, echec, reessayer } = useAbonnement<DossierCarteGrise[]>(
    useCallback(
      (auChangement, enErreur) => ecouterDossiersCarteGrise(portee, auChangement, enErreur),
      [portee],
    ),
    "Les dossiers n’ont pas pu être lus.",
  );

  /* Les noms déjà connus, pour les proposer dans `TRANSITE`. Leur absence ne
     bloque rien : la case accepte un nom tapé, parce qu'il confie aussi à des
     gens qu'il n'a pas enregistrés. */
  const { valeur: prestataires } = useAbonnement<Prestataire[]>(
    useCallback((ok, ko) => ecouterPrestataires(ok, ko), []),
    "La liste des prestataires n’a pas pu être chargée.",
  );

  const depots = useMemo(() => depotsDeCartesGrises(valeur ?? []), [valeur]);
  const aDeposer = useMemo(() => nombreADeposer(valeur ?? []), [valeur]);
  /* Le lot ouvert borne le classeur avant la recherche : on cherche alors un
     nom dans ce paquet-là. Sans lot, la recherche porte sur tous les
     dossiers — celui qui cherche un client ne sait pas dans quel lot il est. */
  const dossiers = useMemo(
    () => (lot === null ? (valeur ?? []) : dossiersDuLot(valeur ?? [], lot)),
    [valeur, lot],
  );

  if (session.statut !== "connecte") return null;
  const auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };

  /* Une ligne appartient à la boutique des cartes grises : sans boutique
     choisie, il n'y a pas de propriétaire à lui donner. */
  const boutiqueId = perimetre.boutiqueId;
  const connus = prestataires ?? AUCUN_PRESTATAIRE;
  const depot = lot === null ? null : (depots.find((candidat) => candidat.cle === lot) ?? null);

  return (
    <div>
      <TetePage
        retour={lot === null ? undefined : { href: "/cartes-grises", libelle: "Les dépôts" }}
        titre={lot === null ? "Dossiers" : titreDuLot(lot, depot)}
        actions={
          boutiqueId !== null ? (
            <button
              type="button"
              onClick={() => setCreation(true)}
              className="bouton bouton-principal"
            >
              <Plus aria-hidden="true" className="size-4" />
              Nouvelle ligne
            </button>
          ) : undefined
        }
      />

      {/* **La liste entière manque, et l'écran n'a plus rien à montrer.** Un
          bandeau au-dessus d'un tableau vide laisserait croire qu'il n'y a
          aucun dossier — ce qui est la pire des deux réponses possibles ici. */}
      {erreur !== null ? (
        <ErreurDeLecture
          titre="Les dossiers n’ont pas pu être lus"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/prestataires", libelle: "Voir les prestataires" }}
        >
          Sans cette lecture, impossible de dire ce qui est dehors ni chez qui. La liste des
          prestataires, elle, reste consultable.
        </ErreurDeLecture>
      ) : (
        /* La clé remet la recherche et l'onglet à zéro d'une vue à l'autre :
           un mot cherché dans un lot ne doit pas masquer les dépôts au retour. */
        <Vue
          key={lot ?? ""}
          lot={lot}
          dossiers={dossiers}
          chargement={valeur === null}
          lotVide={lot !== null && lot !== LOT_A_DEPOSER && valeur !== null && depot === null}
          depots={lot === null ? <DepotsCartesGrises depots={depots} aDeposer={aDeposer} /> : null}
          boutiqueId={boutiqueId}
          prestataires={connus}
          auteur={auteur}
        />
      )}

      {creation && boutiqueId !== null && (
        <LigneModale
          dossier={null}
          boutiqueId={boutiqueId}
          prestataires={connus}
          auteur={auteur}
          onFermer={() => setCreation(false)}
        />
      )}
    </div>
  );
}

/** Le titre d'un lot ouvert : le prestataire et le jour, comme dans le tableau. */
function titreDuLot(lot: string, depot: DepotCarteGrise | null): string {
  if (lot === LOT_A_DEPOSER) return "À déposer";
  if (depot === null) return "Dépôt";
  const nom = depot.prestataireNom || "Prestataire non noté";
  return depot.deposeLe ? `${nom} · ${formaterDateCourte(depot.deposeLe)}` : nom;
}

/**
 * Ce qui se montre sous le titre : la recherche, puis les dépôts ou le
 * classeur.
 *
 * **Le classeur ne paraît que dans un lot, ou pour une recherche.** Sur la
 * liste des dépôts, taper un nom remplace le tableau par les dossiers trouvés,
 * tous lots confondus ; vider le champ le rend.
 *
 * **Les retraits se lisent depuis la liste, sans ouvrir de lot** (2 novembre
 * 2026) : « impossible d'y accéder directement ». Le premier onglet y montre
 * les dépôts, le second tous les dossiers retirés, quel que soit leur lot.
 */
function Vue({
  lot,
  dossiers,
  chargement,
  lotVide,
  depots,
  boutiqueId,
  prestataires,
  auteur,
}: {
  lot: string | null;
  dossiers: readonly DossierCarteGrise[];
  chargement: boolean;
  /** Le lot de l'adresse n'a plus de dossier : son dernier a changé de dépôt. */
  lotVide: boolean;
  depots: ReactNode;
  boutiqueId: string | null;
  prestataires: Prestataire[];
  auteur: { uid: string; nom: string };
}) {
  const [panneau, setPanneau] = useState<Panneau>("cours");
  const [recherche, setRecherche] = useState("");

  /* **La recherche porte sur les deux onglets à la fois.** C'est la demande, et
     c'est la bonne : celui qui cherche un nom ne sait pas si le papier est
     encore dehors ou déjà rendu — c'est même souvent la question qu'il pose. */
  const { cours, termines } = rangerDossiers(chercherDossiers(dossiers, recherche, normaliserNom));
  const classeur = lot !== null || recherche.trim() !== "";

  /* Le retour est déjà en tête de page : seul le constat reste ici. */
  if (lotVide) return <p className="mt-6 text-corps text-encre">Ce dépôt n’a plus aucun dossier.</p>;

  return (
    <>
      <div className="mt-6">
        <label htmlFor="recherche-dossier" className="block text-sm font-medium text-encre">
          Chercher un dossier
        </label>
        <div className="relative mt-1.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
          />
          <input
            id="recherche-dossier"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Un nom, un téléphone, un châssis, une plaque, une date…"
            value={recherche}
            onChange={(evenement) => setRecherche(evenement.target.value)}
            /* Bornée comme les autres recherches du produit : un champ qui
               traverse l'écran fait perdre le début de la ligne à l'œil. */
            className="saisie pr-3 pl-9 placeholder:text-encre-doux sm:max-w-96"
          />
        </div>
      </div>

      <Onglets
        className="mt-6"
        libelle="Les dossiers"
        valeur={panneau}
        changer={setPanneau}
        onglets={[
          {
            valeur: "cours",
            libelle: classeur ? `Dépôt${cours.length > 0 ? ` (${cours.length})` : ""}` : "Dépôts",
            contenu: !classeur ? (
              chargement ? (
                <EtatChargement>Lecture des dossiers…</EtatChargement>
              ) : (
                depots
              )
            ) : (
              <Liste
                dossiers={cours}
                chargement={chargement}
                boutiqueId={boutiqueId}
                prestataires={prestataires}
                auteur={auteur}
                /* Le retour en bloc ne vaut que pour le dépôt : c'est là que
                   vivent les dossiers partis chez un prestataire. */
                permettreRetour
              />
            ),
          },
          {
            valeur: "historique",
            libelle: `Retrait${termines.length > 0 ? ` (${termines.length})` : ""}`,
            contenu: (
              <Liste
                dossiers={termines}
                chargement={chargement}
                boutiqueId={boutiqueId}
                prestataires={prestataires}
                auteur={auteur}
              />
            ),
          },
        ]}
      />
    </>
  );
}

function Liste({
  dossiers,
  chargement,
  boutiqueId,
  prestataires,
  auteur,
  permettreRetour = false,
}: {
  dossiers: DossierCarteGrise[];
  chargement: boolean;
  boutiqueId: string | null;
  prestataires: Prestataire[];
  auteur: { uid: string; nom: string };
  /** Le dépôt seul : ses dossiers chez un prestataire peuvent rentrer en bloc. */
  permettreRetour?: boolean;
}) {
  const [ouvert, setOuvert] = useState<DossierCarteGrise | null>(null);

  /**
   * Ce que chaque colonne montre — une entrée par clé, pas une de plus.
   *
   * Le tableau est ensuite monté en parcourant `ORDRE_LIGNE`, et non cette
   * liste : l'ordre vient du domaine, le même que celui de la modale. Oublier
   * une colonne devient une erreur de compilation, pas une colonne absente que
   * personne ne remarque.
   */
  const rendus: Record<CleColonneLigne, (dossier: DossierCarteGrise) => ReactNode> = {
    tel: (dossier) => dossier.clientTelephone || "—",
    /* **Toute la ligne s'ouvre au clic**, et ce bouton n'est plus là pour la
       souris : il est là pour le clavier et le lecteur d'écran, qui n'ont pas
       de prise sur une `<tr>`. D'où le souligné disparu — il faisait vieux, et
       il promettait un lien là où la ligne entière répond. `stopPropagation`
       évite d'ouvrir deux fois pour un seul clic. */
    client: (dossier) => (
      <button
        type="button"
        onClick={(evenement) => {
          evenement.stopPropagation();
          setOuvert(dossier);
        }}
        className="text-left"
      >
        {dossier.clientNom || "—"}
        {/* La vente a été annulée alors que la carte était déjà partie
            (S25) : la ligne reste jusqu'au retour, et le dit. */}
        {dossier.venteAnnulee && (
          <span className="pastille pastille-retard ml-2 align-middle">Vente annulée</span>
        )}
      </button>
    ),
    moto: (dossier) => dossier.motoLibelle || "—",
    chassis: (dossier) => dossier.numeroChassis || "—",
    /* `√` dans son fichier, `√` ici : c'est la marque qu'il y lit. */
    recu: (dossier) => (dossier.recu ? "√" : "—"),
    credit: (dossier) => (dossier.credit === null ? "—" : formaterNombre(dossier.credit)),
    reception: (dossier) => dossier.remisATelephone || "—",
    retrait: (dossier) => (dossier.remisLe ? formaterDateCourte(dossier.remisLe) : "—"),
    depot: (dossier) => (dossier.deposeLe ? formaterDateCourte(dossier.deposeLe) : "—"),
    immatriculation: (dossier) => dossier.immatriculation || "—",
    transite: (dossier) => dossier.prestataireNom || "—",
  };

  /* Chiffres et codes : alignés à droite, en Plex Mono, insécables. */
  const CHIFFRES: readonly CleColonneLigne[] = [
    "tel",
    "chassis",
    "credit",
    "reception",
    "immatriculation",
  ];

  const lignesColonnes: Colonne<DossierCarteGrise>[] = ORDRE_LIGNE.map((cle) => ({
    cle,
    titre: ENTETES_LIGNE[cle],
    principal: cle === "client",
    chiffre: CHIFFRES.includes(cle),
    rendu: rendus[cle],
  }));

  /* **Les dossiers à marquer reçus, et ceux qu'on coche.** Ce sont ceux partis
     chez un prestataire, plus ceux rentrés sans que la case Reçu le dise
     (`aMarquerRecu`). Un `Set` des identifiants *décochés* plutôt que cochés :
     on les coche tous d'office — « souvent il peut ramener une partie, 80,
     qu'on puisse décocher ceux qui ne sont pas de retour » — et on retient ce
     que l'utilisateur retire, pas ce qu'il garde. Ainsi un dossier qui arrive
     après coup est coché sans qu'on ait à y penser. */
  const [decoches, setDecoches] = useState<ReadonlySet<string>>(new Set());
  const [erreurRetour, setErreurRetour] = useState<string | null>(null);

  const partis = useMemo(() => dossiers.filter(aMarquerRecu), [dossiers]);
  const aRentrer = useMemo(
    () => partis.filter((dossier) => !decoches.has(dossier.id)),
    [partis, decoches],
  );
  const montrerRetour = permettreRetour && partis.length > 0;

  function basculer(id: string) {
    setDecoches((avant) => {
      const suivant = new Set(avant);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  function marquerRetours() {
    if (aRentrer.length === 0) return;
    setErreurRetour(null);
    /* L'écriture n'est pas attendue (D76) : hors ligne elle part en file, les
       lignes basculent dans le cache et quittent le dépôt tout de suite. Un
       refus tardif remonte ici. */
    marquerRetoursMagasin(aRentrer, auteur).catch((cause) =>
      setErreurRetour(messageErreurDossierCarteGrise(cause)),
    );
    setDecoches(new Set());
  }

  const colonnes: Colonne<DossierCarteGrise>[] = montrerRetour
    ? [
        {
          cle: "retour",
          titre: "Marquer",
          rendu: (dossier) =>
            aMarquerRecu(dossier) ? (
              <input
                type="checkbox"
                checked={!decoches.has(dossier.id)}
                onChange={() => basculer(dossier.id)}
                /* La ligne entière ouvre la fiche : sans cette coupure, cocher
                   le retour l'ouvrirait du même clic. */
                onClick={(evenement) => evenement.stopPropagation()}
                aria-label={`Marquer ${dossier.clientNom || "ce dossier"} reçu`}
                className="size-4 accent-encre"
              />
            ) : (
              <span aria-hidden="true">—</span>
            ),
        },
        ...lignesColonnes,
      ]
    : lignesColonnes;

  if (chargement) {
    return <EtatChargement className="mt-3">Chargement des dossiers…</EtatChargement>;
  }
  if (dossiers.length === 0) {
    return null;
  }

  return (
    <>
      {montrerRetour && (
        /* **Le retour d'un paquet, d'un seul geste** (27 octobre 2026). Les
           cases sont cochées d'office ; on décoche ce qui n'est pas rentré, et
           on valide le reste en bloc. */
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-carte border border-bord bg-fond p-3">
          <PackageCheck aria-hidden="true" className="size-5 shrink-0 text-encre-doux" />
          <p className="text-corps text-encre">
            <strong className="font-semibold">{formaterNombre(partis.length)}</strong> à marquer
            reçu{partis.length > 1 ? "s" : ""},{" "}
            <strong className="font-semibold">{formaterNombre(aRentrer.length)}</strong> coché
            {aRentrer.length > 1 ? "s" : ""}.
          </p>
          <button
            type="button"
            onClick={() => setDecoches(new Set(partis.map((dossier) => dossier.id)))}
            className="bouton bouton-discret"
          >
            Tout décocher
          </button>
          <button
            type="button"
            onClick={() => setDecoches(new Set())}
            className="bouton bouton-discret"
          >
            Tout cocher
          </button>
          <button
            type="button"
            onClick={marquerRetours}
            disabled={aRentrer.length === 0}
            className="bouton bouton-principal"
          >
            <PackageCheck aria-hidden="true" className="size-4" />
            Marquer {formaterNombre(aRentrer.length)} reçu
            {aRentrer.length > 1 ? "s" : ""}
          </button>
          <EtatErreurSaisie message={erreurRetour} />
        </div>
      )}

      <Tableau
        legende="Les dossiers de carte grise, ceux qui n’ont pas encore été confiés d’abord, puis du plus ancien dépôt. Les lignes reçues sont sur fond vert. Le nom du propriétaire ouvre la ligne."
        /* Ses noms gardent leur casse : les capitales de tableau feraient de
           `Reci` et `Depot` d'autres mots à l'œil de celui qui les relit. */
        entetesLitterales
        /* « Si on clique sur la ligne, ça doit ouvrir la fiche » — demande du
           commanditaire, 24 octobre 2026. */
        ouvrir={setOuvert}
        /* « Un fond vert clair pour tous les reçus, ça s'identifie
           immédiatement » — 28 octobre 2026. C'est la case Reçu qui décide,
           dans les deux onglets. */
        reglee={(dossier) => dossier.recu}
        colonnes={colonnes}
        lignes={dossiers}
        cleDe={(dossier) => dossier.id}
      />

      {ouvert !== null && (
        <LigneModale
          dossier={ouvert}
          /* Une ligne déjà écrite garde sa boutique : celle du périmètre ne sert
             qu'à la création, et les règles refusent qu'elle change. */
          boutiqueId={boutiqueId ?? ouvert.boutiqueId}
          prestataires={prestataires}
          auteur={auteur}
          onFermer={() => setOuvert(null)}
        />
      )}
    </>
  );
}
