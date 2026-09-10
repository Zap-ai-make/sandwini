"use client";

import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { EtatVide } from "@/components/patrons/Etats";
import { LIBELLE_ORIGINE, montantSigne, type Mouvement } from "@/lib/domain/caisse";
import { formaterHeure, formaterNombre } from "@/lib/domain/format";
import { LIBELLE_MOYEN } from "@/lib/domain/vente";

/**
 * Le journal d’une journée de caisse (`c2:84-149`).
 *
 * Six colonnes, une par question qu’on se pose en relisant sa journée : *quand,
 * quelle pièce, de quelle nature, pour qui, par quel moyen, combien*. C’est le
 * patron `Tableau` du produit et non une liste de cartes — des montants qu’on
 * ne peut pas lire les uns sous les autres ne se comparent pas, et une caisse
 * ne se relit que par comparaison.
 *
 * **Le signe est dans le montant, ici et nulle part ailleurs.** En base, un
 * mouvement porte un montant toujours positif et un `sens` ; à l’écran, une
 * sortie s’affiche en négatif, parce que c’est ainsi qu’on lit une colonne de
 * caisse. Les deux représentations ne se croisent qu’à cet endroit — c’est
 * `montantSigne` qui fait le passage, et il n’y en a pas d’autre.
 */
export function JournalCaisse({
  mouvements,
  chargement,
  jourEstPasse,
}: {
  mouvements: Mouvement[];
  chargement: boolean;
  /** Une journée passée sans mouvement n’est pas la même chose qu’une journée qui commence. */
  jourEstPasse: boolean;
}) {
  const colonnes: Colonne<Mouvement>[] = [
    {
      cle: "heure",
      titre: "Heure",
      chiffre: true,
      rendu: (mouvement) => (mouvement.date ? formaterHeure(mouvement.date) : "—"),
    },
    { cle: "nature", titre: "Nature", rendu: (m) => LIBELLE_ORIGINE[m.origine] },
    {
      cle: "objet",
      titre: "Objet",
      principal: true,
      /* Le libellé écrit par le geste qui a produit le mouvement : « Vente
         PTG-2609-0041 », « Avance Zongo — Carte grise », ou la raison d'une
         sortie d'espèces. C'est lui qu'on rapproche du papier posé sur le
         comptoir, parce que c'est lui qui porte le numéro.

         **La maquette montrait deux colonnes ici — « Pièce » et « Qui » — et
         le modèle n'en nourrit qu'une.** `origineRefId` est un identifiant
         Firestore (`prompt.md` §5.9 le dit : « venteId, versementId… »), pas
         un numéro imprimé : l'afficher mettait « hDgIoVtmr1SwOLm0axV7 » sous
         les yeux d'un gérant. Et le nom du client ne figure nulle part dans un
         encaissement. Vu au banc, sur la suite bout en bout, après une capture
         qui semblait parfaite parce que le semis écrivait ce que le produit
         n'écrit pas. Le manque est au backlog (S35) — il se comble en écrivant
         le nom dans le libellé à l'encaissement, ce qui touche S8 et S9. */
      rendu: (mouvement) => mouvement.libelle || <span className="text-encre-doux">—</span>,
    },
    { cle: "moyen", titre: "Moyen", rendu: (m) => LIBELLE_MOYEN[m.moyenPaiement] },
    {
      cle: "montant",
      titre: "Montant",
      chiffre: true,
      rendu: (mouvement) => {
        const signe = montantSigne(mouvement);
        return (
          /* Jamais la couleur seule (`DESIGN.md` §5) : c’est le moins qui dit
             la sortie, et la couleur ne fait que la retrouver plus vite. */
          <span className={signe < 0 ? "text-alerte" : undefined}>
            {signe < 0 ? "−" : ""}
            {formaterNombre(Math.abs(signe))}
          </span>
        );
      },
    },
  ];

  if (!chargement && mouvements.length === 0) {
    return (
      <EtatVide titre={jourEstPasse ? "Rien ce jour-là" : "Rien encore aujourd’hui"}>
        {jourEstPasse
          ? "Aucun mouvement n’a été enregistré ce jour-là — la boutique était fermée, ou tout s’est fait ailleurs."
          : "Les ventes, les versements et les sorties d’espèces apparaîtront ici au fur et à mesure."}
      </EtatVide>
    );
  }

  return (
    /* Le cadre de liste du produit, avec sa barre de tête (`c2:85-88`) :
       `aria-busy` pendant la lecture dit à qui ne voit pas les lignes
       fantômes que le trajet n'est pas fini. */
    <div className="cadre cadre-tableau" aria-busy={chargement || undefined}>
      <div className="cadre-tete">
        <h2 className="text-bloc font-bold tracking-tight text-encre">Les mouvements</h2>

        {/* Le comptage se lit avant le tableau. Il sert deux fois : il dit
            d'abord que la journée arrive, puis combien elle a compté — et
            « 6 mouvements » se rapproche du carnet qu'on tenait avant, où l'on
            comptait les lignes du doigt. `aria-live` sans `role` : la coquille
            n'a qu'un seul `status`, et c'est le bandeau réseau. */}
        <p aria-live="polite" aria-atomic="true" className="ml-auto text-corps text-encre-doux">
          {chargement ? (
            "Lecture de la journée…"
          ) : (
            <strong className="font-semibold text-encre">
              {mouvements.length === 1 ? "1 mouvement" : `${mouvements.length} mouvements`}
            </strong>
          )}
        </p>
      </div>

      <Tableau
        legende="Mouvements de caisse de la journée, du plus ancien au plus récent"
        colonnes={colonnes}
        lignes={mouvements}
        cleDe={(mouvement) => mouvement.id}
        chargement={chargement}
      />
    </div>
  );
}
