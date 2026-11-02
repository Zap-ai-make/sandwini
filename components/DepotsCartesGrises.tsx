"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TitreSection } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { LOT_A_DEPOSER, type DepotCarteGrise } from "@/lib/domain/depots-carte-grise";
import { depuisQuand, formaterDateCourte, formaterNombre } from "@/lib/domain/format";

/** L'adresse d'un lot : l'écran des dossiers, réduit à ceux-là. */
export function adresseDuLot(lot: string): string {
  return `/cartes-grises?lot=${encodeURIComponent(lot)}`;
}

/** Une ligne du tableau : un dépôt, ou le lot de ce qui n'est pas encore parti. */
type Ligne = { cle: string; depot: DepotCarteGrise | null; pris: number };

/**
 * Les dépôts de cartes grises (31 octobre 2026), seuls à l'écran depuis le
 * 2 novembre.
 *
 * « Le tableau de carte grise doit être intuitif comme celui des arrivages :
 * on voit combien est reçu, ce qui reste, le total pris, avec une barre de
 * progression. » Une ligne par paquet confié — un prestataire, un jour —, sur
 * le dessin du tableau des arrivages, pour que l'œil y retrouve ses repères.
 *
 * **Une ligne ouvre son lot.** Le classeur entier sous ce tableau faisait
 * deux écrans en un — « ce n'est pas intuitif et ça pollue » : il ne s'ouvre
 * plus que réduit au lot qu'on a choisi.
 *
 * **« À déposer » vient en tête** : ce qui n'est parti chez personne est la
 * seule file qui attend un geste, et une ligne qu'on vient de créer y arrive.
 */
export function DepotsCartesGrises({
  depots,
  aDeposer,
}: {
  depots: readonly DepotCarteGrise[];
  aDeposer: number;
}) {
  const router = useRouter();

  const lignes: Ligne[] = [
    ...(aDeposer > 0 ? [{ cle: LOT_A_DEPOSER, depot: null, pris: aDeposer }] : []),
    ...depots.map((depot) => ({ cle: depot.cle, depot, pris: depot.pris })),
  ];
  if (lignes.length === 0) return null;

  const colonnes: Colonne<Ligne>[] = [
    {
      cle: "depot",
      titre: "Dépôt",
      principal: true,
      rendu: ({ cle, depot }) => (
        /* Le lien sert le clavier et le lecteur d'écran ; la souris, elle, a
           toute la ligne. `stopPropagation` évite d'ouvrir deux fois. */
        <Link
          href={adresseDuLot(cle)}
          onClick={(evenement) => evenement.stopPropagation()}
          className="text-left font-medium text-encre hover:underline"
        >
          {depot === null ? (
            "À déposer"
          ) : (
            <>
              {depot.prestataireNom || "Prestataire non noté"}
              <span className="block text-corps font-normal text-encre-doux">
                {depot.deposeLe
                  ? `${formaterDateCourte(depot.deposeLe)} · ${depuisQuand(depot.deposeLe)}`
                  : "Date non notée"}
              </span>
            </>
          )}
        </Link>
      ),
    },
    {
      cle: "pris",
      titre: "Pris",
      chiffre: true,
      rendu: (ligne) => formaterNombre(ligne.pris),
    },
    {
      cle: "retour",
      titre: "Retour",
      rendu: ({ depot }) => (depot === null ? null : <BarreRetour depot={depot} />),
    },
    {
      cle: "etat",
      titre: "État",
      rendu: ({ depot }) =>
        depot === null ? null : (
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
      <div className="cadre cadre-tableau">
        <Tableau
          legende="Les dépôts de cartes grises, du plus récent au plus ancien. Une ligne ouvre ses dossiers."
          colonnes={colonnes}
          lignes={lignes}
          cleDe={(ligne) => ligne.cle}
          reglee={({ depot }) => depot !== null && depot.restent === 0}
          ouvrir={(ligne) => router.push(adresseDuLot(ligne.cle))}
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
