"use client";

import { useCallback, useMemo } from "react";
import type { Moto } from "@/lib/domain/moto";
import { peserBoutiques, type PeseeBoutique } from "@/lib/domain/pesee";
import type { MouvementPiece, Piece } from "@/lib/domain/piece";
import type { Vente } from "@/lib/domain/vente";
import type { VentePiece } from "@/lib/domain/vente-piece";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterCatalogue, ecouterMouvements } from "@/lib/repositories/pieces";
import { ecouterVentes } from "@/lib/repositories/ventes";
import { ecouterVentesPieces } from "@/lib/repositories/ventes-pieces";
import { ecouterRetoursPieces } from "@/lib/repositories/retours-pieces";
import type { RetourPiece } from "@/lib/domain/retour";

export {
  PESEE_VIDE,
  additionnerPesees,
  type PeseeBoutique,
  type PeseeMotos,
  type PeseePieces,
} from "@/lib/domain/pesee";

/**
 * Les écoutes qui alimentent la pesée des cartes de supervision (S24, S47).
 *
 * Le calcul lui-même vit dans `lib/domain/pesee.ts`, pur et testé ; ici il n'y
 * a que le branchement.
 *
 * **Aucune écoute nouvelle n'est ouverte côté motos.** Les ventes et le stock
 * sont déjà lus par les écrans du périmètre courant ; ici on les relit sur le
 * périmètre entier, une fois. C'est la même décision qu'au reçu (D61) : ce qui
 * se recalcule à la lecture ne peut pas diverger de ce dont il est tiré, et
 * continue de fonctionner hors ligne.
 *
 * **Côté pièces, les écoutes sont conditionnelles, et il fallait qu'elles le
 * soient.** Le journal des mouvements se lit en entier — c'est ce que borne
 * `SEUIL_MOUVEMENTS` — et le payer sur une entreprise qui ne vend que des motos
 * serait une lecture sans lecteur. `avecPieces` reprend donc exactement la
 * garde que l'écran applique déjà à `PiecesEnAlerte` ; quand les deux sont
 * montés sur le périmètre « toutes les boutiques », ils demandent la même
 * requête, et le SDK Firestore ne l'ouvre qu'une fois.
 */
export function usePeseeDesBoutiques(avecPieces: boolean): {
  pesee: ReadonlyMap<string, PeseeBoutique>;
  chargement: boolean;
} {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  /* Les cartes montrent toutes les boutiques : on lit donc sur le périmètre de
     l'entreprise, quel que soit celui qui est sélectionné dans le bandeau. Un
     gérant n'atteint jamais cet écran (la garde de capacité le refuse), donc
     aucune règle n'est mise en défaut. */
  const global = perimetre.type !== "aucune";
  const globalPieces = global && avecPieces;

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      global ? ecouterVentes(null, auChangement, enErreur) : () => {},
    [global],
  );
  const { valeur: ventes } = useAbonnement(souscrireVentes, "Les ventes n’ont pas pu être lues.");

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      global ? ecouterStock(null, auChangement, enErreur) : () => {},
    [global],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être lu.");

  const souscrireVentesPieces = useCallback(
    (auChangement: (ventes: VentePiece[]) => void, enErreur: (cause: unknown) => void) =>
      globalPieces ? ecouterVentesPieces(null, auChangement, enErreur) : () => {},
    [globalPieces],
  );
  const { valeur: ventesPieces } = useAbonnement(
    souscrireVentesPieces,
    "Les ventes de pièces n’ont pas pu être lues.",
  );

  const souscrireCatalogue = useCallback(
    (auChangement: (pieces: Piece[]) => void, enErreur: (cause: unknown) => void) =>
      globalPieces ? ecouterCatalogue(null, auChangement, enErreur) : () => {},
    [globalPieces],
  );
  const { valeur: catalogue } = useAbonnement(
    souscrireCatalogue,
    "Le catalogue des pièces n’a pas pu être lu.",
  );

  const souscrireMouvements = useCallback(
    (auChangement: (mouvements: MouvementPiece[]) => void, enErreur: (cause: unknown) => void) =>
      globalPieces ? ecouterMouvements(null, auChangement, enErreur) : () => {},
    [globalPieces],
  );
  const { valeur: mouvements } = useAbonnement(
    souscrireMouvements,
    "Les mouvements de pièces n’ont pas pu être lus.",
  );

  /* Les retours retranchent la recette et la marge (S67). Lus sur le même
     périmètre et sous la même garde `avecPieces` que les ventes de pièces. */
  const souscrireRetours = useCallback(
    (auChangement: (retours: RetourPiece[]) => void, enErreur: (cause: unknown) => void) =>
      globalPieces ? ecouterRetoursPieces(null, auChangement, enErreur) : () => {},
    [globalPieces],
  );
  const { valeur: retoursPieces } = useAbonnement(
    souscrireRetours,
    "Les retours de pièces n’ont pas pu être lus.",
  );

  return useMemo(
    () => ({
      pesee: peserBoutiques(
        { ventes, stock, ventesPieces, retoursPieces, catalogue, mouvements },
        new Date(),
      ),
      chargement:
        perimetreEnCours ||
        (global && (ventes === null || stock === null)) ||
        (globalPieces &&
          (ventesPieces === null ||
            retoursPieces === null ||
            catalogue === null ||
            mouvements === null)),
    }),
    [
      ventes,
      stock,
      ventesPieces,
      retoursPieces,
      catalogue,
      mouvements,
      perimetreEnCours,
      global,
      globalPieces,
    ],
  );
}
