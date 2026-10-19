"use client";

import { Bike, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { FicheMoto } from "@/components/FicheMoto";
import {
  ErreurDeLecture,
  EtatSansResultat,
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
  ETATS,
  FILTRES_VIDES,
  LIBELLE_ETAT,
  filtrerMotos,
  type Filtres,
  type Moto,
} from "@/lib/domain/moto";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterStock } from "@/lib/repositories/motos";

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
  const catalogue = useCatalogue();
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
  /* Ce qui fait entrer une moto réclame un `boutiqueId` : sur « Toutes les
     boutiques », le geste n'a nulle part où aboutir (S54). */
  const dansUneBoutique = perimetre.type === "boutique";
  const {
    valeur: stock,
    erreur,
    echec,
    reessayer,
  } = useAbonnement(souscrire, "Le stock n’a pas pu être chargé.");

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
      { cle: "etat", titre: "État", rendu: (moto) => LIBELLE_ETAT[moto.etat] },
      { cle: "couleur", titre: "Couleur", rendu: (moto) => moto.couleur || "—" },
      { cle: "annee", titre: "Année", chiffre: true, rendu: (moto) => moto.annee ?? "—" },
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
  }, [catalogue, toutesBoutiques, cochees, basculer]);

  if (sansPerimetre)
    return (
      <SansBoutique
        titre="Stock motos"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : le stock n’a pas encore d’endroit où exister."
      />
    );

  const total = (stock ?? []).length;
  /* Compté sur ce que l'écran montre, pas sur le stock entier : « 12 motos sur
     128 · 96 en stock » ferait croire que 96 des 12 lignes sont disponibles. */
  const enStock = resultats.filter((moto) => moto.statut === "en_stock").length;
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
        <StockVide perimetreEnCours={perimetreEnCours} dansUneBoutique={dansUneBoutique} />
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
              <button
                type="button"
                className="filtre"
                aria-pressed={filtres.etat === ""}
                onClick={() => setFiltres((actuel) => ({ ...actuel, etat: "" }))}
              >
                Tous les états
              </button>
              {ETATS.map((etat) => (
                <button
                  key={etat}
                  type="button"
                  className="filtre"
                  aria-pressed={filtres.etat === etat}
                  onClick={() =>
                    setFiltres((actuel) => ({ ...actuel, etat: actuel.etat === etat ? "" : etat }))
                  }
                >
                  {LIBELLE_ETAT[etat]}
                </button>
              ))}

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

            {/* Le comptage se lit avant le tableau : c'est lui qui dit si les
                filtres ont mangé la moto qu'on cherchait. Annoncé poliment, il
                sert deux fois — il dit d'abord que le stock arrive, puis ce que
                les filtres ont laissé, à qui ne voit pas le tableau changer.
                `aria-live` sans `role` : la coquille n'a qu'un seul `status`,
                et c'est le bandeau réseau. */}
            <p aria-live="polite" aria-atomic="true" className="ml-auto text-corps text-encre-doux">
              {chargement ? (
                "Chargement du stock…"
              ) : (
                <>
                  <strong className="font-semibold text-encre">
                    {resultats.length === 1 ? "1 moto" : `${resultats.length} motos`}
                  </strong>
                  {resultats.length !== total && ` sur ${total}`} · {enStock} en stock
                </>
              )}
            </p>

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
            <EtatSansResultat className="m-4">
              Aucune moto ne correspond. Vérifiez le châssis saisi, ou élargissez les filtres.
            </EtatSansResultat>
          ) : (
            <Tableau
              legende="Motos du stock, de la plus récemment entrée à la plus ancienne"
              colonnes={colonnes}
              lignes={resultats}
              cleDe={(moto) => moto.id}
            />
          )}
        </div>
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

function StockVide({
  perimetreEnCours,
  dansUneBoutique,
}: {
  perimetreEnCours: boolean;
  dansUneBoutique: boolean;
}) {
  if (perimetreEnCours) return null;
  /* Le cadre reste, et le vide s'y installe : c'est ce que montre `b4:92`. Un
     vide qui remplace aussi la boîte laisse la page nue, et l'écran a l'air
     cassé plutôt que neuf. La tête du cadre — recherche et filtres — ne
     revient pas : filtrer un stock vide n'a pas de sens, et la maquette ne la
     garde pas non plus. */
  return (
    <div className="cadre">
    <EtatVide
      icone={<Bike aria-hidden="true" />}
      titre="Aucune moto en stock pour l’instant."
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
    >
      {dansUneBoutique
        ? "La première entrée demande une marque, un modèle et une provenance. S’ils manquent, ils se déclarent dans les réglages."
        : "Aucune des boutiques n’a de moto en stock. La saisie vous demandera laquelle reçoit la première."}
    </EtatVide>
    </div>
  );
}
