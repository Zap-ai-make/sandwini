"use client";

import { TitreSection } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import type { DepotCarteGrise } from "@/lib/domain/depots-carte-grise";
import { depuisQuand, formaterDateCourte, formaterNombre } from "@/lib/domain/format";

/**
 * Les dépôts de cartes grises, au-dessus du classeur (31 octobre 2026).
 *
 * « Le tableau de carte grise doit être intuitif comme celui des arrivages :
 * on voit combien est reçu, ce qui reste, le total pris, avec une barre de
 * progression. » Une ligne par paquet confié — un prestataire, un jour —, sur
 * le dessin du tableau des arrivages, pour que l'œil y retrouve ses repères.
 *
 * **La ligne filtre le classeur, elle ne le remplace pas.** Le classeur à dix
 * colonnes reste la forme que le commanditaire connaît ; un clic sur un dépôt
 * n'y laisse que ses dossiers, un second clic les rend tous.
 */
export function DepotsCartesGrises({
  depots,
  choisi,
  choisir,
}: {
  depots: readonly DepotCarteGrise[];
  choisi: string | null;
  choisir: (cle: string | null) => void;
}) {
  if (depots.length === 0) return null;

  const colonnes: Colonne<DepotCarteGrise>[] = [
    {
      cle: "depot",
      titre: "Dépôt",
      principal: true,
      rendu: (depot) => (
        /* Le bouton sert le clavier et le lecteur d'écran ; la souris, elle,
           a toute la ligne. */
        <button
          type="button"
          onClick={(evenement) => {
            evenement.stopPropagation();
            choisir(depot.cle === choisi ? null : depot.cle);
          }}
          aria-pressed={depot.cle === choisi}
          className="text-left font-medium text-encre hover:underline"
        >
          {depot.prestataireNom || "Prestataire non noté"}
          <span className="block text-corps font-normal text-encre-doux">
            {depot.deposeLe
              ? `${formaterDateCourte(depot.deposeLe)} · ${depuisQuand(depot.deposeLe)}`
              : "Date non notée"}
          </span>
        </button>
      ),
    },
    {
      cle: "pris",
      titre: "Pris",
      chiffre: true,
      rendu: (depot) => formaterNombre(depot.pris),
    },
    {
      cle: "retour",
      titre: "Retour",
      rendu: (depot) => <BarreRetour depot={depot} />,
    },
    {
      cle: "etat",
      titre: "État",
      rendu: (depot) => (
        <div>
          {depot.restent === 0 ? (
            <span className="pastille pastille-solde">Tout est revenu</span>
          ) : (
            <span className="pastille pastille-retard">
              {formaterNombre(depot.restent)} dehors
            </span>
          )}
          <span className="mt-1 block text-legende text-encre-doux">
            {formaterNombre(depot.recus)} / {formaterNombre(depot.pris)}
          </span>
        </div>
      ),
    },
  ];

  return (
    <section aria-labelledby="titre-depots" className="mt-6">
      <TitreSection id="titre-depots">Les dépôts</TitreSection>
      <div className="cadre cadre-tableau lg:max-h-[24rem]">
        <Tableau
          legende="Les dépôts de cartes grises, du plus récent au plus ancien. Une ligne filtre le classeur sur ses dossiers."
          colonnes={colonnes}
          lignes={[...depots]}
          cleDe={(depot) => depot.cle}
          cleActive={choisi}
          reglee={(depot) => depot.restent === 0}
          ouvrir={(depot) => choisir(depot.cle === choisi ? null : depot.cle)}
        />
      </div>
    </section>
  );
}

/**
 * La barre du retour : la part revenue du paquet.
 *
 * Le même dessin que l'écoulement d'un arrivage (`BarreEcoulement`) : la piste,
 * la part pleine en vert, et les deux nombres dessous — une longueur se
 * compare, elle ne se lit pas.
 */
function BarreRetour({ depot }: { depot: DepotCarteGrise }) {
  const part = depot.pris === 0 ? 0 : Math.round((depot.recus / depot.pris) * 100);
  return (
    <div className="min-w-36">
      <div className="h-2 overflow-hidden rounded-full bg-fond">
        <div
          className="h-full rounded-full"
          style={{ width: `${part}%`, background: "var(--color-solde)" }}
        />
      </div>
      <p className="mt-1 text-legende text-encre-doux">
        <span className="font-semibold text-encre">{formaterNombre(depot.recus)}</span>{" "}
        reçu{depot.recus > 1 ? "s" : ""}
        {" · "}
        <span className="font-semibold text-encre">{formaterNombre(depot.restent)}</span>{" "}
        reste{depot.restent > 1 ? "nt" : ""}
      </p>
    </div>
  );
}
