import { coutTotal, lireEntier, validerCout, type CoutMoto, type Moto } from "./moto";

/**
 * Le prix d'achat posé après coup sur les motos d'un lot (20 novembre 2026).
 *
 * « Dans arrivage, ajouter le prix lors de modification pour que, quand on
 * oublie de renseigner le prix à l'enregistrement, on puisse se rattraper. »
 * Choix du commanditaire : un prix par moto, et un prix commun qui remplit
 * d'un coup celles qui n'en ont pas — on rattrape cent motos en une saisie, et
 * on corrige une moto à part.
 */

/**
 * Ce qu'on sait du prix d'une moto — trois réponses, pas deux (D82), comme
 * `EtatCout` dans `couts-motos.ts`. « Inconnu » n'est pas « absent » : la
 * lecture est tombée, le prix existe peut-être.
 */
export type EtatPrix =
  | { sorte: "connu"; cout: CoutMoto }
  | { sorte: "absent" }
  | { sorte: "inconnu" };

/**
 * Ce que la case d'une moto montre.
 *
 * Ce qu'on a tapé passe avant tout. Sinon le prix déjà posé, que le prix
 * commun ne remplace pas. Le prix commun ne remplit que les motos dont on sait
 * qu'elles n'ont rien : sur une moto dont la lecture est tombée, ou pas encore
 * arrivée, il écraserait peut-être le vrai, frais compris.
 */
export function prixAffiche(
  etat: EtatPrix | undefined,
  saisi: string | undefined,
  commun: string,
): string {
  if (saisi !== undefined) return saisi;
  if (etat?.sorte === "connu") return String(etat.cout.prixAchat);
  if (etat?.sorte === "absent") return commun.trim();
  return "";
}

export type CoutAPoser = { motoId: string; boutiqueId: string; cout: CoutMoto };

export type PrixDuLot =
  | { ok: true; couts: CoutAPoser[] }
  | { ok: false; erreur: string; rang: number };

/**
 * Les coûts à écrire, dans l'ordre des lignes, ou le refus de la première
 * ligne fautive.
 *
 * **Seuls les prix qui changent.** Réécrire le coût de cent motos pour en
 * corriger une salirait leur trace, comme pour les motos elles-mêmes
 * (`preparerCorrectionLot`).
 *
 * **Les frais d'entrée restent.** Le document du coût se réécrit en entier ;
 * on y remet donc les frais déjà posés, et le total est recalculé.
 *
 * **Un prix posé ne s'efface pas** : les règles ne suppriment jamais un coût,
 * et vider la case ferait croire à un retrait qui n'a pas lieu.
 */
export function preparerPrixDuLot(
  motos: readonly Pick<Moto, "id" | "boutiqueId">[],
  etats: ReadonlyMap<string, EtatPrix>,
  saisis: ReadonlyMap<string, string>,
  commun: string,
): PrixDuLot {
  const couts: CoutAPoser[] = [];

  for (const [rang, moto] of motos.entries()) {
    const etat = etats.get(moto.id);
    if (etat === undefined || etat.sorte === "inconnu") continue;

    const valeur = prixAffiche(etat, saisis.get(moto.id), commun).trim();
    if (valeur === "") {
      if (etat.sorte === "connu") {
        return { ok: false, erreur: "Un prix d’achat déjà posé ne s’efface pas : corrigez-le.", rang };
      }
      continue;
    }

    const probleme = validerCout({ prixAchat: valeur, fraisEntree: [] });
    if (probleme) return { ok: false, erreur: probleme, rang };
    const prixAchat = lireEntier(valeur) ?? 0;

    if (etat.sorte === "connu" && etat.cout.prixAchat === prixAchat) continue;

    const fraisEntree = etat.sorte === "connu" ? etat.cout.fraisEntree : [];
    couts.push({
      motoId: moto.id,
      boutiqueId: moto.boutiqueId,
      cout: { prixAchat, fraisEntree, coutTotal: coutTotal(prixAchat, fraisEntree) },
    });
  }

  return { ok: true, couts };
}
