"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Chiffre } from "@/components/patrons/Chiffre";
import { compter, formaterAnciennete } from "@/lib/domain/format";
import {
  JOURS_DORMANTE,
  motosDetenues,
  plusAnciennes,
  repartirParAge,
  stockParBoutique,
} from "@/lib/domain/inventaire";
import type { Moto } from "@/lib/domain/moto";

/** Assez pour agir dans la journée, trop peu pour redevenir une liste. */
const ANCIENNES_MONTREES = 5;

/**
 * L'inventaire : ce qu'on détient, et depuis combien de temps (S55).
 *
 * **L'onglet s'appelait « Inventaire » et n'en contenait aucun.** Il ne portait
 * qu'un bilan de ventes et des dettes de clients. Le commanditaire ouvrait
 * l'écran en s'attendant à ses motos et y trouvait de la comptabilité ; ce bloc
 * est ce qui manquait.
 *
 * **Il tient sur deux niveaux sans être deux écrans.** Le périmètre les porte
 * déjà : un gérant est verrouillé sur sa boutique et lit son stock à lui, le
 * responsable bascule sur « Toutes les boutiques » et obtient l'agrégat, où
 * seule la répartition par boutique s'ajoute. Deux écrans auraient fini par
 * répondre deux choses différentes à « combien de motos ».
 *
 * **Aucun prix n'y entre, et ce n'est pas un oubli.** Un inventaire répond à
 * « qu'est-ce que j'ai, et depuis quand » — tout se lit sur le document de la
 * moto, celui que le gérant lit déjà. Les coûts restent derrière le mur de D2 ;
 * les faire venir ici aurait fermé l'écran à la moitié de ceux qui en ont
 * l'usage, pour une colonne dont la lecture ne dépend pas.
 */
export function InventaireStock({
  motos,
  maintenant,
  nomMarque,
  nomModele,
  nomDeLaBoutique,
  agrege,
}: {
  motos: readonly Moto[];
  /**
   * Figé par l'écran : recalculer `new Date()` à chaque rendu ferait bouger les
   * âges sous les yeux et relancerait les animations de chiffre pour rien.
   */
  maintenant: Date;
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
  nomDeLaBoutique: (id: string) => string;
  /** Vrai quand le périmètre couvre plusieurs boutiques : le niveau responsable. */
  agrege: boolean;
}) {
  const detenues = useMemo(() => motosDetenues(motos), [motos]);
  const tranches = useMemo(() => repartirParAge(motos, maintenant), [motos, maintenant]);
  const anciennes = useMemo(
    () => plusAnciennes(motos, maintenant, ANCIENNES_MONTREES),
    [motos, maintenant],
  );
  const parBoutique = useMemo(
    () => (agrege ? stockParBoutique(motos, nomDeLaBoutique) : []),
    [agrege, motos, nomDeLaBoutique],
  );

  const dormantes = tranches.find((tranche) => tranche.alerte)?.compte ?? 0;

  return (
    <section aria-labelledby="titre-inventaire">
      <h2 id="titre-inventaire" className="mb-3 text-bloc font-bold tracking-tight text-encre">
        Ce que vous détenez
      </h2>

      {detenues.length === 0 ? (
        /* D63 : une phrase, pas quatre tranches à zéro. Un stock vide est un
           fait, pas une répartition. */
        null
      ) : (
        <div className="cadre p-4 sm:p-5">
          <p className="font-code text-chiffre leading-tight tabular-nums text-encre">
            <Chiffre valeur={compter(detenues.length, "moto")} />
          </p>

          <h3 className="mt-5 mb-3 border-t border-bord pt-4 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
            Depuis combien de temps
          </h3>
          <ul className="grid gap-3">
            {tranches.map((tranche) => (
              <li
                key={tranche.cle}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)_7.5rem]"
              >
                <span
                  className={
                    tranche.alerte && tranche.compte > 0
                      ? "font-medium text-alerte"
                      : "font-medium text-encre"
                  }
                >
                  {tranche.libelle}
                </span>
                <span className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-fond sm:order-none sm:col-span-1">
                  <span
                    aria-hidden="true"
                    className={`block h-full ${tranche.alerte ? "bg-alerte" : "bg-goutte"}`}
                    style={{ width: `${tranche.pourcentage}%` }}
                  />
                </span>
                <span className="text-right text-legende text-encre-doux sm:text-left">
                  <span className="font-code text-corps text-encre">{tranche.compte}</span> ·{" "}
                  {tranche.sens}
                </span>
              </li>
            ))}
          </ul>

          {/* **Le seul endroit de l'écran qui demande un geste.** Le reste
              décrit ; cette phrase-là désigne un problème et sa taille. Elle ne
              paraît que s'il existe : une alerte permanente cesse d'être lue
              (`DESIGN.md` §5). */}
          {dormantes > 0 && (
            <p className="mt-4 rounded-plaque bg-alerte-surface p-3 text-corps text-encre">
              {compter(dormantes, "moto")} {dormantes > 1 ? "attendent" : "attend"} depuis plus de{" "}
              {JOURS_DORMANTE} jours. Au-delà, une moto coûte plus qu’elle ne rapporte : il faut la
              remettre en avant, la déplacer vers une boutique qui vend ce modèle, ou revoir son
              prix.
            </p>
          )}

          {anciennes.length > 0 && (
            <>
              <h3 className="mt-5 mb-3 border-t border-bord pt-4 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
                Les plus anciennes
              </h3>
              {/* Un chiffre global ne se traite pas ; une moto nommée, si. Le
                  lien ouvre sa fiche dans le stock, là où l'on agit dessus. */}
              <ul className="grid gap-2">
                {anciennes.map(({ moto, age }) => (
                  <li
                    key={moto.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                  >
                    <Link href={`/motos?moto=${moto.id}`} className="lien">
                      {nomMarque(moto.marqueId)} {nomModele(moto.modeleId)}{" "}
                      {/* **La plaque s'ajoute au châssis, elle ne le remplace
                          pas** (S53). C'est ce qui justifie de l'avoir rangée
                          sur la moto plutôt que sur la vente : l'inventaire la
                          relit sans rouvrir un dossier. Et les deux servent :
                          la plaque désigne la moto de loin, le châssis se
                          vérifie accroupi devant le cadre. Un identifiant qui
                          change de nature selon qu'un champ est rempli se
                          parcourt moins bien qu'une colonne stable. */}
                      {moto.plaque !== null && (
                        <span className="plaque-code text-legende text-encre-doux">
                          {moto.plaque}{" "}
                        </span>
                      )}
                      <span className="font-code text-legende text-encre-doux">
                        {moto.numeroChassis}
                      </span>
                    </Link>
                    <span
                      className={`text-corps tabular-nums ${
                        age > JOURS_DORMANTE ? "text-alerte" : "text-encre-doux"
                      }`}
                    >
                      {formaterAnciennete(age)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Le niveau du responsable. Chez un gérant la liste n'aurait qu'une
              ligne, qui répéterait le total du haut. */}
          {parBoutique.length > 1 && (
            <>
              <h3 className="mt-5 mb-3 border-t border-bord pt-4 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
                Où il se trouve
              </h3>
              <ul className="grid gap-3">
                {parBoutique.map((part) => (
                  <li
                    key={part.cle}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)_7.5rem]"
                  >
                    <span className="font-medium text-encre">{part.libelle}</span>
                    <span className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-fond sm:order-none sm:col-span-1">
                      <span
                        aria-hidden="true"
                        className="block h-full bg-goutte"
                        style={{ width: `${part.pourcentage}%` }}
                      />
                    </span>
                    <span className="text-right text-legende text-encre-doux sm:text-left">
                      {compter(part.compte, "moto")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
