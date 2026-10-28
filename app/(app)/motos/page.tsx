"use client";

import { Plus, Search, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { FicheMoto } from "@/components/FicheMoto";
import {
  ErreurDeLecture,
  EtatVide,
  SansBoutique,
} from "@/components/patrons/Etats";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { ExportMotos } from "@/components/ExportMotos";
import { MotosParties } from "@/components/MotosParties";
import { RepartitionStock } from "@/components/RepartitionStock";
import { Statut } from "@/components/StatutMoto";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { formaterDateCourte, formaterNombre } from "@/lib/domain/format";
import {
  FILTRES_VIDES,
  filtrerMotos,
  type Filtres,
  type Moto,
} from "@/lib/domain/moto";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { DeplacerMotosModal } from "@/components/DeplacerMotosModal";
import { useSession } from "@/lib/auth/session";
import type { Boutique } from "@/lib/domain/boutique";
import { peut } from "@/lib/domain/roles";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterArrivages } from "@/lib/repositories/arrivages";
import { ecouterBoutiques } from "@/lib/repositories/boutiques";
import { ecouterFournisseurs } from "@/lib/repositories/fournisseurs";
import { ecouterStock } from "@/lib/repositories/motos";
import type { Arrivage } from "@/lib/domain/arrivage";
import type { Fournisseur } from "@/lib/domain/fournisseur";

/**
 * Le stock.
 *
 * L'écran répond à une question posée debout, devant une moto : « celle-ci,
 * je l'ai en stock ? ». D'où le châssis en tête de ligne, en Plex Mono — c'est
 * le numéro qu'on relève sur le cadre et qu'on compare caractère par caractère.
 *
 * **Il empilait des cartes ; c'est un tableau.** Une moto occupait toute la
 * largeur d'un 1920 pour dire cinq mots, et comparer deux prix demandait de les
 * chercher dans deux blocs de texte. Chaque fait a maintenant sa colonne
 * (`CAHIER-UI.md` §8.1) ; le patron `Tableau` naît ici et les écrans suivants
 * le reprennent.
 *
 * **Le châssis n'est plus dessiné en plaque jaune.** Le jaune n'a que deux
 * emplois — le code boutique et le hors ligne (D70) —, et un stock entier de
 * plaques jaunes en faisait un décor plutôt qu'un signal. Le seul jaune qui
 * reste sur cet écran est celui de la colonne « Boutique », qui est justement
 * un code boutique.
 *
 * **Une seule action en tête : faire entrer une moto.** Les trois liens qui
 * l'accompagnaient — Nouvelle vente, Ventes, Dossiers — sont mot pour mot ceux
 * de la colonne de gauche depuis S28 : les répéter ici ne donnait pas un
 * raccourci, cela noyait le seul geste que cet écran-là commande.
 *
 * Filtres et recherche travaillent en mémoire : le stock d'une boutique se
 * compte en dizaines, et une recherche qui ne marche qu'en ligne ne sert à rien
 * dans une application dont c'est la promesse.
 */
/**
 * La fiche d'une moto est un panneau de cet écran, pas une route à part.
 *
 * Une route `/motos/[id]` est dynamique : le navigateur doit en demander le
 * document au serveur, et le service worker n'a jamais vu celui d'une moto
 * saisie il y a dix secondes. Hors ligne, ouvrir sa fiche tombait sur la page
 * de repli — juste après un formulaire qui, lui, avait parfaitement fonctionné
 * sans réseau (D39). Ici, changer de `?moto=` ne demande rien à personne.
 */
export default function PageMotos() {
  return (
    <Suspense fallback={null}>
      <AiguillageMotos />
    </Suspense>
  );
}

function AiguillageMotos() {
  const motoOuverte = useSearchParams().get("moto");
  return motoOuverte ? <FicheMoto id={motoOuverte} /> : <Stock />;
}

function Stock() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const session = useSession();
  const catalogue = useCatalogue();
  const router = useRouter();
  const [deplacement, setDeplacement] = useState(false);
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  /* Les motos cochées pour l'export (S50). Un `Set` d'identifiants plutôt qu'un
     drapeau porté par chaque moto : la liste se recharge en direct à chaque
     écriture Firestore, et un état posé sur les objets repartirait avec eux. */
  const [cochees, setCochees] = useState<ReadonlySet<string>>(new Set());
  /* Avant tout retour anticipé : un hook appelé sous condition change
     l'ordre des hooks d'un rendu à l'autre (règle de React, vue par le lint). */
  const surTitre = useSurTitre("Motos");

  const boutiqueId = perimetre.boutiqueId;
  const souscrire = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );

  const sansPerimetre = perimetre.type === "aucune";
  const {
    valeur: stock,
    erreur,
    echec,
    reessayer,
  } = useAbonnement(souscrire, "Le stock n’a pas pu être chargé.");

  /**
   * De qui vient cette moto — la colonne qui remplace « État » et « Année ».
   *
   * **Deux lectures pour un nom, et c'est le chemin qu'il faut.** La moto ne
   * porte pas son fournisseur : elle porte son arrivage, et c'est l'arrivage
   * qui sait de qui le lot vient. Recopier le nom sur chaque moto aurait fait
   * mentir le stock le jour où un fournisseur est renommé.
   *
   * Une moto entrée à la main n'a pas d'arrivage : elle n'a donc pas de
   * fournisseur à montrer, et la cellule le dit par un tiret plutôt que par un
   * vide qu'on prendrait pour un chargement.
   */
  const souscrireArrivages = useCallback(
    (auChangement: (arrivages: Arrivage[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterArrivages(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: arrivages } = useAbonnement(
    souscrireArrivages,
    "Les arrivages n’ont pas pu être chargés.",
  );

  const souscrireFournisseurs = useCallback(
    (auChangement: (fournisseurs: Fournisseur[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterFournisseurs(auChangement, enErreur),
    [],
  );
  const { valeur: fournisseurs } = useAbonnement(
    souscrireFournisseurs,
    "Les fournisseurs n’ont pas pu être chargés.",
  );

  const fournisseurDe = useMemo(() => {
    const nomParId = new Map((fournisseurs ?? []).map((f) => [f.id, f.nom]));
    const fournisseurParArrivage = new Map(
      (arrivages ?? []).map((arrivage) => [arrivage.id, arrivage.fournisseurId]),
    );
    return (arrivageId: string | null) => {
      if (!arrivageId) return "—";
      const id = fournisseurParArrivage.get(arrivageId);
      return (id && nomParId.get(id)) || "—";
    };
  }, [arrivages, fournisseurs]);

  /* Les boutiques servent au déplacement groupé seul : la liste des
     destinations, et le nom qu'on lit dans la confirmation. */
  const souscrireBoutiques = useCallback(
    (auChangement: (liste: Boutique[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterBoutiques(auChangement, enErreur),
    [],
  );
  const { valeur: boutiques } = useAbonnement(
    souscrireBoutiques,
    "La liste des boutiques n’a pas pu être lue.",
  );

  const resultats = useMemo(() => filtrerMotos(stock ?? [], filtres), [stock, filtres]);
  const modelesDeLaMarque = filtres.marqueId
    ? catalogue.modeles.filter((modele) => modele.marqueId === filtres.marqueId)
    : catalogue.modeles;

  const toutesBoutiques = perimetre.type === "toutes";
  const basculer = useCallback((id: string) => {
    setCochees((actuel) => {
      const suivant = new Set(actuel);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }, []);

  const colonnes = useMemo<Colonne<Moto>[]>(() => {
    const liste: Colonne<Moto>[] = [
      {
        /* La case de l'export (S50). Une colonne ordinaire : le patron
           `Tableau` n'a pas eu à apprendre la sélection pour un seul écran, et
           `rendu` suffisait déjà à poser ce qu'on veut dans une cellule.
           L'étiquette nomme le châssis — « Choisir » répété quarante fois ne
           dit à personne *laquelle* on choisit. */
        cle: "choix",
        titre: "Export",
        rendu: (moto) => (
          <input
            type="checkbox"
            checked={cochees.has(moto.id)}
            onChange={() => basculer(moto.id)}
            /* La ligne entière ouvre la fiche depuis le 27 octobre 2026 : sans
               cette coupure, cocher une moto pour l'export l'ouvrirait du même
               clic, et la liste se déroberait sous la main. */
            onClick={(evenement) => evenement.stopPropagation()}
            aria-label={`Choisir la moto ${moto.numeroChassis} pour l’export`}
            className="size-4 accent-encre"
          />
        ),
      },
      {
        cle: "chassis",
        /* « Numéro de châssis » (`a4:104`), le nom qui figure sur la carte
           grise et sur le formulaire d’entrée en stock. « Châssis » seul
           désigne la pièce, pas son numéro. */
        titre: "Numéro de châssis",
        titreReplie: "Châssis",
        principal: true,
        rendu: (moto) => (
          <Link
            href={`/motos?moto=${moto.id}`}
            className="plaque-code text-encre underline-offset-2 hover:underline"
          >
            {moto.numeroChassis}
          </Link>
        ),
      },
      {
        cle: "modele",
        titre: "Marque et modèle",
        principal: true,
        rendu: (moto) =>
          `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)}`,
      },
      /* **« État » et « Année » ont cédé la place au fournisseur** (26 octobre
         2026, demande du commanditaire). Les deux premières se lisaient sur la
         fiche sans qu'on les compare jamais d'une ligne à l'autre ; de qui
         vient une moto est au contraire la question qu'on se pose en balayant
         le stock. Elles restent sur la fiche de la moto. */
      {
        cle: "fournisseur",
        titre: "Fournisseur",
        rendu: (moto) => fournisseurDe(moto.arrivageId),
      },
      { cle: "couleur", titre: "Couleur", rendu: (moto) => moto.couleur || "—" },
      {
        /* La devise est titrée une fois, en tête de colonne : « 695 000 FCFA »
           répété cent fois ne dit rien de plus et casse l'alignement. */
        cle: "prix",
        titre: "Prix conseillé (FCFA)",
        chiffre: true,
        rendu: (moto) =>
          moto.prixVenteConseille === null ? "—" : formaterNombre(moto.prixVenteConseille),
      },
      { cle: "statut", titre: "Statut", rendu: (moto) => <Statut statut={moto.statut} /> },
      {
        cle: "entree",
        titre: "Entrée",
        chiffre: true,
        rendu: (moto) => (moto.dateEntree ? formaterDateCourte(moto.dateEntree) : "—"),
      },
    ];
    /* La colonne n'existe que quand la question se pose. Pour un gérant, toutes
       les lignes portent la même boutique : ce serait une colonne constante. */
    if (toutesBoutiques) {
      liste.splice(2, 0, {
        cle: "boutique",
        titre: "Boutique",
        rendu: (moto) => (
          <span className="plaque-code rounded-plaque border border-plaque-bord bg-plaque px-1.5 py-0.5 text-legende leading-none text-encre-fixe">
            {moto.boutiqueId}
          </span>
        ),
      });
    }
    return liste;
  }, [catalogue, toutesBoutiques, cochees, basculer, fournisseurDe]);

  if (sansPerimetre)
    return (
      <SansBoutique
        titre="Stock motos"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : le stock n’a pas encore d’endroit où exister."
      />
    );

  const total = (stock ?? []).length;
  const chargement = stock === null && !erreur;

  return (
    <div className="ecran-plein">
      <TetePage
        surTitre={surTitre}
        titre="Stock motos"
        /* Le geste n'existe que dans une boutique (S54). Une moto entre
           quelque part : sur « Toutes les boutiques », il n'y a pas de
           `boutiqueId` à lui donner, et le bouton n'ouvrait que sur un écran
           qui demandait de choisir. Le rail applique la même règle par
           `exigeBoutique` ; ici c'est la même décision, prise au même endroit
           que la lecture du périmètre. */
        actions={
          /* Le bouton ne disparaît plus hors d'une boutique : il mène à l'écran
             de saisie, qui pose lui-même la question du lieu (S54). */
          <Link href="/motos/nouvelle" className="bouton bouton-principal">
            <Plus aria-hidden="true" className="size-4" />
            Faire entrer une moto
          </Link>
        }
      />

      {/* Le comptage par marque, replié. Posé ici et non dans la branche du
          tableau : il rend `null` sur une liste vide, donc il s'efface tout
          seul pendant le chargement, sur une erreur et sur un stock vide — ce
          qui évite de l'enfermer dans un fragment et de décaler tout le cadre.
          Il compte ce que l'écran montre, filtres compris. */}
      <RepartitionStock
        motos={resultats}
        filtre={resultats.length !== total}
        nomMarque={catalogue.nomMarque}
        nomModele={catalogue.nomModele}
      />

      {/* Ce qui a quitte cette boutique (S17). Meme traitement que le bloc
          ci-dessus : il rend `null` quand il n'y a rien, donc il s'efface seul
          et n'a pas besoin d'etre enferme dans une condition ici. Rien pour le
          responsable sur « Toutes les boutiques » : une moto deplacee entre
          deux de ses boutiques n'est partie de nulle part de son point de vue. */}
      <MotosParties boutiqueId={boutiqueId} />

      {/* Une erreur avant toute donnée ne laisse rien à encadrer : le cadre
          vide, filtres compris, ferait croire à un stock à zéro. C'est le bloc
          de `b6` qui prend la place — il nomme, il explique, il propose de
          réessayer et il offre une sortie. */}
      {erreur && stock === null ? (
        <ErreurDeLecture
          titre="Le stock n’a pas pu être lu"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/motos/ventes", libelle: "Aller aux ventes" }}
        >
          {erreur} Les motos déjà lues aujourd’hui restent sur cet appareil. Faire entrer une moto
          fonctionne normalement&nbsp;: ce geste n’a pas besoin de cette lecture.
        </ErreurDeLecture>
      ) : !chargement && total === 0 ? (
        <StockVide perimetreEnCours={perimetreEnCours} />
      ) : (
        /* `aria-busy` pendant la lecture : les lignes fantômes disent à l'œil
           que ça arrive, cet attribut le dit à qui ne les voit pas. */
        <div className="cadre cadre-tableau" aria-busy={chargement || undefined}>
          <div className="cadre-tete">
            <Recherche filtres={filtres} changer={setFiltres} />

            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Filtrer le stock"
            >
              <Filtre
                id="filtre-marque"
                libelle="Marque"
                valeur={filtres.marqueId}
                changer={(marqueId) =>
                  setFiltres((actuel) => ({ ...actuel, marqueId, modeleId: "" }))
                }
                options={catalogue.marques.map((marque) => ({
                  valeur: marque.id,
                  libelle: marque.nom,
                }))}
                tous="Toutes les marques"
              />
              <Filtre
                id="filtre-modele"
                libelle="Modèle"
                valeur={filtres.modeleId}
                changer={(modeleId) => setFiltres((actuel) => ({ ...actuel, modeleId }))}
                options={modelesDeLaMarque.map((modele) => ({
                  valeur: modele.id,
                  libelle: modele.nom,
                }))}
                tous="Tous les modèles"
              />
            </div>


            {/* L'export, sous les filtres : on coche ce que les filtres ont
                laissé, donc la barre appartient à la même tête d'écran. Elle
                n'apparaît qu'une fois le stock arrivé — proposer d'exporter
                zéro moto pendant le chargement serait proposer un fichier
                vide. */}
            {!chargement && (
              <div className="w-full border-t border-bord pt-3">
                <ExportMotos
                  motos={resultats.filter((moto) => cochees.has(moto.id))}
                  nomMarque={catalogue.nomMarque}
                  nomModele={catalogue.nomModele}
                  toutCocher={() => setCochees(new Set(resultats.map((moto) => moto.id)))}
                  toutDecocher={() => setCochees(new Set())}
                  /* **Le même lot de cases sert les deux gestes** (26 octobre
                     2026). On coche une fois, et on choisit ensuite ce qu'on
                     en fait : un fichier, ou un camion. */
                  actions={
                    <button
                      type="button"
                      onClick={() => setDeplacement(true)}
                      disabled={cochees.size === 0}
                      className="bouton bouton-neutre"
                    >
                      <Truck aria-hidden="true" className="size-4" />
                      Transférer
                    </button>
                  }
                />
              </div>
            )}
          </div>

          {chargement ? (
            <Tableau
              legende="Chargement du stock"
              colonnes={colonnes}
              lignes={[]}
              cleDe={(moto) => moto.id}
              chargement
            />
          ) : resultats.length === 0 ? (
            null
          ) : (
            <Tableau
              legende="Motos du stock, de la plus récemment entrée à la plus ancienne"
              colonnes={colonnes}
              lignes={resultats}
              cleDe={(moto) => moto.id}
              /* Comme la liste des ventes (27 octobre 2026) : « de même que la
                 page stock moto ». Le lien du châssis reste pour le clavier. */
              ouvrir={(moto) => router.push(`/motos?moto=${moto.id}`)}
            />
          )}
        </div>
      )}

      {deplacement && session.statut === "connecte" && (
        <DeplacerMotosModal
          motos={resultats.filter((moto) => cochees.has(moto.id))}
          boutiques={boutiques ?? []}
          auteur={{ uid: session.utilisateur.uid, nom: session.utilisateur.nom }}
          /* Le responsable seul lit le coût privé, donc lui seul peut en
             corriger la boutique quand la moto déménage (D2). */
          voitLesCouts={peut(session.utilisateur.role, "voir_marges")}
          onFermer={() => {
            setDeplacement(false);
            /* Les cases se vident : celles qui sont parties ne sont plus dans
               la liste, et garder cochées celles qui restent ferait croire que
               l'envoi les a oubliées. */
            setCochees(new Set());
          }}
        />
      )}
    </div>
  );
}

function Recherche({
  filtres,
  changer,
}: {
  filtres: Filtres;
  changer: (mise: (actuel: Filtres) => Filtres) => void;
}) {
  return (
    <div className="relative min-w-56 flex-1 sm:max-w-80">
      {/* Le nom du contrat (`CAHIER-UI.md` §12), et celui de la maquette
          (`a4:75`). « Chercher un châssis » disait moins que ce que le champ
          fait — il retrouve aussi une marque et un modèle —, et surtout il
          n’était pas le nom sous lequel le reste du produit désigne ce geste :
          la même recherche, sur l’écran de vente, s’appelle déjà « Chercher
          dans le stock ». Deux noms pour un même geste, et c’est la personne
          qui l’entend au lecteur d’écran qui paie la différence. */}
      <label htmlFor="recherche-chassis" className="sr-only">
        Chercher dans le stock
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
        placeholder="Les derniers caractères suffisent"
        value={filtres.recherche}
        onChange={(evenement) =>
          changer((actuel) => ({ ...actuel, recherche: evenement.target.value }))
        }
        className="plaque-code saisie h-11 pr-3 pl-9 text-corps placeholder:font-sans placeholder:tracking-normal placeholder:text-encre-doux lg:h-8"
      />
    </div>
  );
}

function Filtre({
  id,
  libelle,
  valeur,
  changer,
  options,
  tous,
}: {
  id: string;
  libelle: string;
  valeur: string;
  changer: (valeur: string) => void;
  options: { valeur: string; libelle: string }[];
  tous: string;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {libelle}
      </label>
      <select
        id={id}
        value={valeur}
        onChange={(evenement) => changer(evenement.target.value)}
        className="filtre-choix"
      >
        <option value="">{tous}</option>
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </>
  );
}

function StockVide({ perimetreEnCours }: { perimetreEnCours: boolean }) {
  if (perimetreEnCours) return null;
  /* Le cadre reste, et le vide s'y installe : c'est ce que montre `b4:92`. Un
     vide qui remplace aussi la boîte laisse la page nue, et l'écran a l'air
     cassé plutôt que neuf. La tête du cadre — recherche et filtres — ne
     revient pas : filtrer un stock vide n'a pas de sens, et la maquette ne la
     garde pas non plus. */
  return (
    <div className="cadre">
    <EtatVide
      className="p-4"
      /* Même règle qu'en tête d'écran : le bouton existe toujours, et c'est
         l'écran de saisie qui demande la boutique quand elle manque (S54). Un
         écran vide dont le seul bouton a disparu est précisément ce qui a fait
         croire au commanditaire que la saisie était cassée. */
      action={
        <Link href="/motos/nouvelle" className="bouton bouton-principal">
          <Plus aria-hidden="true" className="size-4" />
          Faire entrer une moto
        </Link>
      }
    />
    </div>
  );
}
