"use client";

import { LoaderCircle, Plus, Receipt, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { FicheMoto } from "@/components/FicheMoto";
import { useSession } from "@/lib/auth/session";
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

  if (sansPerimetre) return <SansBoutique />;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-encre">Stock motos</h1>
          <p className="mt-1 text-sm text-encre-doux">
            {perimetre.type === "toutes" ? "Toutes les boutiques" : perimetre.nom}
          </p>
        </div>
        {/* Vendre est le geste quotidien, faire entrer une moto l’exception :
            c’est la vente qui porte l’accent de plaque. */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/motos/ventes/nouvelle"
            className="inline-flex h-12 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
          >
            <Receipt aria-hidden="true" className="size-4" />
            Nouvelle vente
          </Link>
          <Link
            href="/motos/ventes"
            className="inline-flex h-12 items-center rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier"
          >
            Ventes
          </Link>
          <Link
            href="/motos/dossiers"
            className="inline-flex h-12 items-center rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier"
          >
            Dossiers
          </Link>
          <Link
            href="/motos/nouvelle"
            className="inline-flex h-12 items-center gap-2 rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier"
          >
            <Plus aria-hidden="true" className="size-4" />
            Faire entrer une moto
          </Link>
        </div>
      </div>

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

      {erreur && (
        <p role="alert" className="mt-4 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {stock === null && !erreur ? (
        <p className="mt-6 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement du stock…
        </p>
      ) : (stock ?? []).length === 0 && !erreur ? (
        <StockVide perimetreEnCours={perimetreEnCours} />
      ) : resultats.length === 0 ? (
        <p className="mt-6 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Aucune moto ne correspond. Vérifiez le châssis saisi, ou élargissez les filtres.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-encre-doux">
            {resultats.length === 1 ? "1 moto" : `${resultats.length} motos`}
            {resultats.length !== (stock ?? []).length && ` sur ${(stock ?? []).length}`}
          </p>
          <ul className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
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
          className="plaque-code h-12 w-full rounded-plaque border border-bord bg-papier pr-3 pl-9 text-encre placeholder:font-sans placeholder:tracking-normal placeholder:text-encre-doux"
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
        className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
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
    <div className="mt-6 rounded-plaque border border-dashed border-bord p-4">
      <p className="text-encre">Aucune moto en stock pour l’instant.</p>
      <p className="mt-1 max-w-prose text-sm text-encre-doux">
        La première entrée demande une marque, un modèle et une provenance. S’ils manquent, ils se
        déclarent dans les réglages.
      </p>
      <Link
        href="/motos/nouvelle"
        className="mt-4 inline-flex h-12 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
      >
        <Plus aria-hidden="true" className="size-4" />
        Faire entrer une moto
      </Link>
    </div>
  );
}

function SansBoutique() {
  const session = useSession();
  const estResponsable = session.statut === "connecte" && session.utilisateur.role === "responsable";

  return (
    <div className="max-w-prose">
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Stock motos</h1>
      <p className="mt-3 text-encre-doux">
        {estResponsable
          ? "Aucune boutique n’est déclarée : le stock n’a pas encore d’endroit où exister."
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
