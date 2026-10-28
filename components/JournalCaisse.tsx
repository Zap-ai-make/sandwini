"use client";

import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { LIBELLE_ORIGINE, montantSigne, type Mouvement } from "@/lib/domain/caisse";
import {
  formaterDateCourte,
  formaterHeure,
  formaterNombre,
} from "@/lib/domain/format";
import { LIBELLE_MOYEN } from "@/lib/domain/vente";

/**
 * Le journal d’une journée de caisse (`c2:84-149`).
 *
 * Six colonnes, une par question qu’on se pose en relisant sa journée : *quand,
 * de quelle nature, sur quelle pièce, saisi par qui, par quel moyen, combien*.
 * La sixième — « saisi par » — a été posée en S55 : la donnée était là depuis
 * S8 et ne s’affichait nulle part, alors que c’est la première chose qu’on
 * demande quand le compte ne tombe pas. C’est le
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
  avecDate,
  nomDuPoste,
}: {
  mouvements: Mouvement[];
  chargement: boolean;
  /**
   * Nomme le poste d'une dépense, pour la colonne « Objet ».
   *
   * **Le détail d'une dépense est devenu facultatif en S55**, et sans ce
   * repli la colonne affichait un tiret : le journal perdait la raison de la
   * sortie au moment même où l'écran de saisie cessait de l'exiger. Le poste
   * la porte désormais — « Loyer » vaut mieux qu'un tiret, et c'est ce que le
   * gérant a effectivement choisi.
   */
  nomDuPoste?: (id: string) => string;
  /**
   * La période couvre plus d'une journée : la date doit alors précéder l'heure.
   *
   * **Sans ce drapeau, le passage au mois rendait le journal illisible (S55).**
   * La colonne n'affichait que l'heure — ce qui suffisait tant que l'écran ne
   * montrait qu'un jour. Sur un mois, « 15:00 » se retrouvait au-dessus de
   * « 08:00 » parce qu'ils venaient de deux journées différentes, et plus rien
   * ne disait laquelle. Sur une seule journée, répéter la date à chaque ligne
   * serait du bruit : d'où le drapeau plutôt qu'une date systématique.
   */
  avecDate: boolean;
}) {
  const colonnes: Colonne<Mouvement>[] = [
    {
      cle: "heure",
      titre: avecDate ? "Quand" : "Heure",
      chiffre: true,
      rendu: (mouvement) => {
        if (!mouvement.date) return "—";
        const heure = formaterHeure(mouvement.date);
        return avecDate ? `${formaterDateCourte(mouvement.date)} ${heure}` : heure;
      },
    },
    /* L'origine, et non le poste de dépense : celui-ci se lit dans l'écran
       « Dépenses », avec son historique et ses totaux. Le journal dit ce qui
       s'est passé ; le classement comptable vit à côté (S55). */
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
      rendu: (mouvement) => {
        if (mouvement.libelle) return mouvement.libelle;
        /* Le poste prend le relais quand le détail est vide : il dit toujours
           où l'argent est parti, ce qu'un tiret ne dit pas. */
        if (mouvement.posteId && nomDuPoste) return nomDuPoste(mouvement.posteId);
        return <span className="text-encre-doux">—</span>;
      },
    },
    {
      /**
       * **Qui a saisi — et non pour qui (S55).** La maquette demandait une
       * colonne « Qui » en pensant au **client** ; celle-ci nomme l'opérateur.
       * Ce n'est pas la même question, et il ne faut pas que l'une passe pour
       * l'autre : le client reste au backlog (S35), faute d'être écrit dans un
       * encaissement.
       *
       * Celle-ci se rend tout de suite parce que la donnée est déjà là —
       * `createdByName` est sur chaque mouvement depuis S8 — et parce qu'elle
       * répond à la première question qu'on pose quand le tiroir est court le
       * soir : qui était au comptoir. Un livre de caisse sans nom sur ses
       * lignes ne se vérifie pas.
       */
      cle: "operateur",
      titre: "Saisi par",
      rendu: (mouvement) =>
        mouvement.operateur || <span className="text-encre-doux">—</span>,
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
      null
    );
  }

  return (
    /* Le cadre de liste du produit, avec sa barre de tête (`c2:85-88`) :
       `aria-busy` pendant la lecture dit à qui ne voit pas les lignes
       fantômes que le trajet n'est pas fini. */
    <div className="cadre cadre-tableau" aria-busy={chargement || undefined}>
      <div className="cadre-tete">
        <h2 className="text-bloc font-bold tracking-tight text-encre">Les mouvements</h2>

      </div>

      <Tableau
        legende="Mouvements de caisse de la période, du plus ancien au plus récent"
        colonnes={colonnes}
        lignes={mouvements}
        cleDe={(mouvement) => mouvement.id}
        chargement={chargement}
      />
    </div>
  );
}
