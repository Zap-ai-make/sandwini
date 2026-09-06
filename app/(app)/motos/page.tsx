"use client";

import { Plus, Receipt, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { FicheMoto } from "@/components/FicheMoto";
import { EtatChargement, EtatErreur, EtatSansResultat, EtatVide, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import {
  ETATS,
  FILTRES_VIDES,
  LIBELLE_ETAT,
  LIBELLE_STATUT,
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
 * je l'ai en stock ? ». D'où le châssis en évidence, dessiné comme la plaque —
 * c'est le numéro qu'on relève sur le cadre et qu'on compare caractère par
 * caractère.
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

  const boutiqueId = perimetre.boutiqueId;
  const souscrire = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );

  const sansPerimetre = perimetre.type === "aucune";
  const { valeur: stock, erreur } = useAbonnement(souscrire, "Le stock n’a pas pu être chargé.");

  const resultats = useMemo(() => filtrerMotos(stock ?? [], filtres), [stock, filtres]);
  const modelesDeLaMarque = filtres.marqueId
    ? catalogue.modeles.filter((modele) => modele.marqueId === filtres.marqueId)
    : catalogue.modeles;

  if (sansPerimetre)
    return (
      <SansBoutique
        titre="Stock motos"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : le stock n’a pas encore d’endroit où exister."
      />
    );

  return (
    <div>
      <TetePage
        titre="Stock motos"
        sousTitre={perimetre.type === "toutes" ? "Toutes les boutiques" : perimetre.nom}
        actions={
          /* Vendre est le geste quotidien, faire entrer une moto l’exception :
             c’est la vente qui porte l’accent de plaque. */
          <>
            <Link href="/motos/ventes/nouvelle" className="bouton bouton-plaque">
              <Receipt aria-hidden="true" className="size-4" />
              Nouvelle vente
            </Link>
            <Link href="/motos/ventes" className="bouton bouton-neutre">
              Ventes
            </Link>
            <Link href="/motos/dossiers" className="bouton bouton-neutre">
              Dossiers
            </Link>
            <Link href="/motos/nouvelle" className="bouton bouton-neutre">
              <Plus aria-hidden="true" className="size-4" />
              Faire entrer une moto
            </Link>
          </>
        }
      />

      <Recherche filtres={filtres} changer={setFiltres} />

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Filtre
          id="filtre-etat"
          libelle="État"
          valeur={filtres.etat}
          changer={(etat) => setFiltres((actuel) => ({ ...actuel, etat: etat as Filtres["etat"] }))}
          options={ETATS.map((etat) => ({ valeur: etat, libelle: LIBELLE_ETAT[etat] }))}
          tous="Tous les états"
        />
        <Filtre
          id="filtre-marque"
          libelle="Marque"
          valeur={filtres.marqueId}
          changer={(marqueId) => setFiltres((actuel) => ({ ...actuel, marqueId, modeleId: "" }))}
          options={catalogue.marques.map((m) => ({ valeur: m.id, libelle: m.nom }))}
          tous="Toutes les marques"
        />
        <Filtre
          id="filtre-modele"
          libelle="Modèle"
          valeur={filtres.modeleId}
          changer={(modeleId) => setFiltres((actuel) => ({ ...actuel, modeleId }))}
          options={modelesDeLaMarque.map((m) => ({ valeur: m.id, libelle: m.nom }))}
          tous="Tous les modèles"
        />
      </div>

      <EtatErreur message={erreur} className="mt-4" />

      {stock === null && !erreur ? (
        <EtatChargement className="mt-6">Chargement du stock…</EtatChargement>
      ) : (stock ?? []).length === 0 && !erreur ? (
        <StockVide perimetreEnCours={perimetreEnCours} />
      ) : resultats.length === 0 ? (
        <EtatSansResultat className="mt-6">
            Aucune moto ne correspond. Vérifiez le châssis saisi, ou élargissez les filtres.
          </EtatSansResultat>
      ) : (
        <>
          <p className="mt-6 text-sm text-encre-doux">
            {resultats.length === 1 ? "1 moto" : `${resultats.length} motos`}
            {resultats.length !== (stock ?? []).length && ` sur ${(stock ?? []).length}`}
          </p>
          <ul className="cadre cadre-liste mt-2">
            {resultats.map((moto) => (
              <li key={moto.id}>
                <Link
                  href={`/motos?moto=${moto.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-fond focus-visible:bg-fond"
                >
                  {/* Le châssis est dessiné comme la plaque : c'est le numéro
                      qu'on relève sur le cadre et qu'on compare caractère par
                      caractère. */}
                  <span className="plaque-code shrink-0 rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-xs leading-none text-encre-fixe">
                    {moto.numeroChassis}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-encre">
                      {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
                    </span>
                    <span className="block text-sm text-encre-doux">
                      {LIBELLE_ETAT[moto.etat]}
                      {moto.couleur ? ` · ${moto.couleur}` : ""}
                      {moto.annee ? ` · ${moto.annee}` : ""}
                      {moto.statut !== "en_stock" ? ` · ${LIBELLE_STATUT[moto.statut]}` : ""}
                      {perimetre.type === "toutes" ? ` · ${moto.boutiqueId}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {moto.prixVenteConseille !== null && (
                      <span className="block text-sm font-medium text-encre">
                        {formaterMontant(moto.prixVenteConseille)}
                      </span>
                    )}
                    <span className="block text-sm text-encre-doux">
                      {moto.dateEntree ? formaterDateCourte(moto.dateEntree) : "—"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
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
    <div className="mt-6">
      <label htmlFor="recherche-chassis" className="block text-sm font-medium text-encre">
        Chercher un châssis
      </label>
      <div className="relative mt-1.5">
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
          className="plaque-code saisie pr-3 pl-9 placeholder:font-sans placeholder:tracking-normal placeholder:text-encre-doux"
        />
      </div>
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
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-encre">
        {libelle}
      </label>
      <select
        id={id}
        value={valeur}
        onChange={(evenement) => changer(evenement.target.value)}
        className="saisie mt-1.5"
      >
        <option value="">{tous}</option>
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}

function StockVide({ perimetreEnCours }: { perimetreEnCours: boolean }) {
  if (perimetreEnCours) return null;
  return (
    <div className="mt-6">
      <EtatVide
        titre="Aucune moto en stock pour l’instant."
        action={
          <Link href="/motos/nouvelle" className="bouton bouton-plaque">
            <Plus aria-hidden="true" className="size-4" />
            Faire entrer une moto
          </Link>
        }
      >
        La première entrée demande une marque, un modèle et une provenance. S’ils manquent, ils se
        déclarent dans les réglages.
      </EtatVide>
    </div>
  );
}

