/**
 * La vente de pièces au comptoir (S21).
 *
 * **Le second métier devient entier.** Depuis S20 le magasin tient un catalogue
 * et un stock ; il ne vendait pas. Le type `sortie_vente` existait dans
 * `MOUVEMENTS` et dans les règles, et aucun écran ne l'écrivait.
 *
 * Ce module ne contient que du calcul : ni Firestore, ni React, ni horloge.
 *
 * **Quatre arbitrages sont inscrits ici**, et chacun a son test.
 *
 * *Le panier est multi-lignes, le client est facultatif* (`prompt.md` §9). On
 * vend une bougie à quelqu'un qui passe ; lui demander son nom avant de prendre
 * son argent ferait tenir la file.
 *
 * *Le prix unitaire est proposé par le catalogue et reste modifiable.* Le modèle
 * stocke un prix **par ligne**, ce qui n'aurait aucun sens s'il ne pouvait pas
 * différer du catalogue — et un comptoir négocie. L'écart se voit à l'écran.
 *
 * *Une pièce sans prix de vente ne se vend pas.* Le catalogue accepte
 * `prixVente: null` — « à fixer » — depuis S20. L'ajouter au panier demanderait
 * d'inventer un prix au comptoir. L'écran refuse **et propose de fixer le prix
 * au même endroit** (D90).
 *
 * *Le stock insuffisant refuse la vente, sans possibilité de forcer.* C'est un
 * écart assumé à `prompt.md` §9, qui prévoyait un forçage journalisé par le
 * responsable. Le commanditaire a tranché « pas de stock négatif », et S20 a
 * construit la réponse : là où l'écran refuse, il propose l'entrée manquante au
 * même endroit. Un chemin de forçage rouvrirait exactement le négatif qu'on
 * vient d'interdire — et il serait emprunté, parce qu'il est plus court que
 * d'aller saisir le carton.
 *
 * **La désignation est recopiée dans la ligne, pas référencée.** Un reçu
 * imprimé six mois plus tard doit dire ce qui a été vendu, même si la référence
 * a été renommée depuis. Même raisonnement que `coutMotoSnapshot` (D2).
 */

import { formaterMontant } from "./format";
import {
  etatStock,
  lireEntier,
  MONTANT_MAX,
  QUANTITE_MAX,
  type EtatStock,
  type Piece,
} from "./piece";
import { reduire } from "./referentiel";
import { LIBELLE_MOYEN, type MoyenPaiement } from "./vente";

/**
 * Au plus vingt lignes par vente.
 *
 * Ce n'est pas une limite technique : c'est la borne d'un ticket de comptoir.
 * Au-delà, on n'est plus dans une vente à un client debout mais dans une
 * livraison, qui demandera son propre geste. La règle Firestore porte la même
 * borne, parce qu'un formulaire ne protège pas une collection.
 */
export const LIGNES_MAX = 20;

/** Une ligne du panier, telle qu'elle sera figée dans le document. */
export type LigneVentePiece = {
  pieceId: string;
  /** Recopiée, jamais relue : voir l'en-tête de ce module. */
  reference: string;
  designation: string;
  quantite: number;
  prixUnitaire: number;
  /**
   * Ce que la pièce avait coûté **ce jour-là**, recopié pour la même raison que
   * la désignation : si la même bougie est rachetée plus cher le mois suivant,
   * la marge des ventes passées ne doit pas changer derrière le dos de celui
   * qui les a faites.
   *
   * Nul quand le catalogue ne portait pas encore de prix d'achat. La marge est
   * alors inconnue, et `0` ne la remplace pas — ce serait affirmer que la pièce
   * n'a rien coûté, et gonfler la marge d'autant.
   */
  prixAchatUnitaire: number | null;
  total: number;
};

export type VentePiece = {
  id: string;
  numero: string;
  boutiqueId: string;
  date: Date | null;
  /**
   * Le client, facultatif — vide au comptoir anonyme, et c'est le cas courant.
   *
   * **Ce champ porte désormais le nom tapé au comptoir**, pas un identifiant de
   * fiche : le commanditaire a tranché « juste le nom, facultatif » (pas de
   * compte ni de solde). La clé du document reste `clientId` parce que la règle
   * `ventePieceValide` en fige l'ensemble des clés (`hasOnly`) : la renommer
   * exigerait un déploiement des règles sur `sandwini` avant la moindre vente,
   * et une vente refusée faute de ce déploiement est le défaut que
   * [[regles-vertes-en-local-jamais-deployees]] a déjà coûté. Les ventes
   * d'avant S21bis peuvent encore y porter un identifiant de fiche ; l'écran
   * résout « id connu → nom, sinon la chaîne est le nom » (choix de l'assistant).
   */
  clientId: string;
  lignes: LigneVentePiece[];
  total: number;
  moyenPaiement: MoyenPaiement;
  /**
   * Qui a établi la vente, recopié de la trace d'audit pour le pied du reçu
   * « Établi par » (S64). Vide quand la trace manque — un reçu n'annonce pas
   * un opérateur inventé.
   */
  operateur: string;
};

/* --- Le panier ------------------------------------------------------------ */

export type SaisieLigne = {
  pieceId: string;
  quantite: string;
  prixUnitaire: string;
};

export type SaisiePanier = {
  lignes: SaisieLigne[];
  /**
   * Le nom du client, tapé au comptoir et facultatif (§9). Vide = « quelqu'un
   * qui passe ». Il est recopié tel quel dans le document, sous la clé
   * `clientId` que la règle fige (voir l'en-tête de `VentePiece.clientId`).
   */
  nomClient: string;
  /**
   * Toujours « espèces ». L'écran ne demande plus le moyen de paiement — une
   * vente de pièces au comptoir est payée comptant, et le commanditaire a
   * demandé de retirer ce choix. Le champ reste au modèle parce que
   * l'encaissement et la règle l'exigent ; il ne varie simplement plus.
   */
  moyenPaiement: MoyenPaiement;
};

export const PANIER_VIDE: SaisiePanier = {
  lignes: [],
  nomClient: "",
  moyenPaiement: "especes",
};

/**
 * Ce qui empêche une pièce d'entrer au panier, ou `null` si rien ne l'empêche.
 *
 * Rendu comme une **raison nommée** plutôt qu'un booléen : l'écran doit proposer
 * la réparation qui correspond, et « fixez son prix » n'est pas « faites entrer
 * un lot » (D90).
 *
 * **Tout refus porte un nom, sans exception.** Un chemin qui refuserait sans
 * rien rendre laisserait l'écran sans rien à dire : le gérant cliquerait,
 * la pièce ne viendrait pas, et aucun message n'expliquerait pourquoi. C'est
 * précisément ce que cette union existe pour empêcher — le panier plein en
 * fait donc partie, au même titre que le prix manquant.
 */
export type RefusAjout =
  | "sans_prix"
  | "inactive"
  | "stock_incoherent"
  | "epuise"
  | "deja_au_panier"
  | "panier_plein";

export const MESSAGE_REFUS: Record<RefusAjout, string> = {
  sans_prix: "Cette pièce n’a pas encore de prix de vente.",
  inactive: "Cette référence a été retirée du catalogue.",
  stock_incoherent: "Le stock de cette pièce est négatif : il manque une entrée.",
  epuise: "Cette pièce n’est pas en stock ici.",
  deja_au_panier: "Cette pièce est déjà au panier : changez sa quantité.",
  panier_plein: `Le panier est complet : ${LIGNES_MAX} lignes au plus.`,
};

export function refusAjout(
  piece: Piece,
  stock: number,
  panier: readonly SaisieLigne[],
): RefusAjout | null {
  if (!piece.actif) return "inactive";
  if (piece.prixVente === null) return "sans_prix";
  /* Un stock négatif ne se vend pas davantage qu'un stock vide, mais il ne se
     dit pas « épuisé » : ce n'est pas « il n'y en a plus », c'est « ma saisie
     est incohérente » — la confusion que D82 nomme. La réparation est la même
     (faire entrer ce qui manque), le diagnostic ne l'est pas, et c'est le
     diagnostic qui évite qu'on recommande un réapprovisionnement inutile. */
  if (stock < 0) return "stock_incoherent";
  if (stock === 0) return "epuise";
  if (panier.some((ligne) => ligne.pieceId === piece.id)) return "deja_au_panier";
  /* En dernier, et l'ordre compte : quand la pièce est déjà au panier **et**
     que le panier est plein, « changez sa quantité » est la phrase utile. */
  if (panier.length >= LIGNES_MAX) return "panier_plein";
  return null;
}

/**
 * Ajoute une pièce au panier avec le prix du catalogue comme proposition.
 *
 * Rend le panier inchangé si l'ajout est refusé : l'appelant a déjà demandé
 * `refusAjout` pour dire pourquoi, et un second endroit qui déciderait serait un
 * second endroit à corriger. **Un seul garde-fou, donc** — `refusAjout` porte
 * aussi la borne des vingt lignes, là où un second `if` muet ici rendait le
 * panier inchangé sans que personne puisse dire pourquoi.
 */
export function ajouterAuPanier(panier: SaisiePanier, piece: Piece, stock: number): SaisiePanier {
  if (refusAjout(piece, stock, panier.lignes) !== null) return panier;
  return {
    ...panier,
    lignes: [
      ...panier.lignes,
      { pieceId: piece.id, quantite: "1", prixUnitaire: String(piece.prixVente ?? 0) },
    ],
  };
}

export function retirerDuPanier(panier: SaisiePanier, pieceId: string): SaisiePanier {
  return { ...panier, lignes: panier.lignes.filter((ligne) => ligne.pieceId !== pieceId) };
}

export function changerLigne(
  panier: SaisiePanier,
  pieceId: string,
  partie: Partial<SaisieLigne>,
): SaisiePanier {
  return {
    ...panier,
    lignes: panier.lignes.map((ligne) =>
      ligne.pieceId === pieceId ? { ...ligne, ...partie } : ligne,
    ),
  };
}

/* --- Ce que le panier vaut ------------------------------------------------- */

/**
 * Le total d'une ligne, ou `null` si la saisie n'est pas encore un nombre.
 *
 * `null` plutôt que zéro : un champ vide n'est pas une ligne à zéro franc, et
 * les confondre afficherait un total faux pendant la frappe — le même
 * aplatissement que D95, en plus discret.
 */
export function totalLigne(ligne: SaisieLigne): number | null {
  const quantite = lireEntier(ligne.quantite);
  const prix = lireEntier(ligne.prixUnitaire);
  if (quantite === null || prix === null) return null;
  if (quantite <= 0) return null;
  return quantite * prix;
}

/** Le total du panier, en ne comptant que les lignes déjà complètes. */
export function totalPanier(lignes: readonly SaisieLigne[]): number {
  return lignes.reduce((somme, ligne) => somme + (totalLigne(ligne) ?? 0), 0);
}

/* --- La validation --------------------------------------------------------- */

/**
 * Valide le panier entier.
 *
 * `stocks` est la quantité disponible par pièce, comptée depuis les mouvements
 * (S20). **`null` veut dire « pas encore lu »** et interdit la décision — D95 :
 * une absence de lecture n'est pas une réponse, et c'est ici qu'une vente
 * sortirait un stock qu'on n'a pas compté.
 */
export function validerPanier(
  panier: SaisiePanier,
  pieces: ReadonlyMap<string, Piece>,
  stocks: ReadonlyMap<string, number> | null,
): string | null {
  if (panier.lignes.length === 0) return "Ajoutez au moins une pièce au panier.";
  if (panier.lignes.length > LIGNES_MAX) {
    return `Une vente au comptoir ne dépasse pas ${LIGNES_MAX} lignes.`;
  }
  if (stocks === null) {
    return "Le stock n’a pas fini d’arriver. Réessayez dans un instant.";
  }

  for (const ligne of panier.lignes) {
    const piece = pieces.get(ligne.pieceId);
    if (!piece) return "Une pièce du panier n’existe plus au catalogue.";

    const quantite = lireEntier(ligne.quantite);
    if (quantite === null || quantite <= 0) {
      return `${piece.reference} : la quantité s’écrit en chiffres entiers, supérieure à zéro.`;
    }
    if (quantite > QUANTITE_MAX) {
      return `${piece.reference} : la quantité dépasse le maximum admis.`;
    }

    const prix = lireEntier(ligne.prixUnitaire);
    if (prix === null || prix <= 0) {
      return `${piece.reference} : le prix s’écrit en chiffres entiers, supérieur à zéro.`;
    }
    if (prix > MONTANT_MAX) return `${piece.reference} : le prix dépasse le maximum admis.`;

    const disponible = stocks.get(ligne.pieceId) ?? 0;
    if (quantite > disponible) {
      /* Trois phrases et non deux : un stock négatif n'est pas une rupture,
         c'est une écriture manquante, et le dire évite d'envoyer commander ce
         qui est peut-être déjà sur l'étagère (D82). */
      if (disponible < 0) {
        return `${piece.reference} : le stock est négatif ici. Une entrée manque — saisissez-la avant de vendre.`;
      }
      return disponible === 0
        ? `${piece.reference} n’est plus en stock ici. Faites d’abord entrer un lot.`
        : `${piece.reference} : il n’y en a que ${disponible} en stock ici.`;
    }
  }

  return null;
}

/**
 * Fige le panier en lignes de document.
 *
 * À n'appeler qu'après `validerPanier` : la référence et la désignation y sont
 * **recopiées**, et les totaux calculés une fois pour toutes.
 */
export function figerLignes(
  panier: SaisiePanier,
  pieces: ReadonlyMap<string, Piece>,
): LigneVentePiece[] {
  return panier.lignes.map((ligne) => {
    const piece = pieces.get(ligne.pieceId);
    const quantite = lireEntier(ligne.quantite) ?? 0;
    const prixUnitaire = lireEntier(ligne.prixUnitaire) ?? 0;
    return {
      pieceId: ligne.pieceId,
      reference: piece?.reference ?? "",
      designation: piece?.designation ?? "",
      quantite,
      prixUnitaire,
      /* `?? null` et non `?? 0` : une pièce absente de la carte, ou sans coût
         connu, laisse la marge inconnue plutôt que de l'inventer. */
      prixAchatUnitaire: piece?.prixAchat ?? null,
      total: quantite * prixUnitaire,
    };
  });
}

/**
 * La marge d'une ligne : l'écart entre ce qu'on a encaissé et ce que la pièce
 * avait coûté, multiplié par la quantité.
 *
 * `null` quand le coût est inconnu. Ce n'est pas la même chose que zéro, et
 * c'est le même partage qu'au mois des motos (`lib/domain/chiffres.ts`) :
 * *connu*, *connu et nul*, *pas su*. Les confondre transforme une ignorance en
 * affirmation.
 */
export function margeLigne(ligne: LigneVentePiece): number | null {
  if (ligne.prixAchatUnitaire === null) return null;
  return (ligne.prixUnitaire - ligne.prixAchatUnitaire) * ligne.quantite;
}

/**
 * La marge d'une vente : la somme des lignes dont on connaît le coût.
 *
 * Une ligne sans coût est **ignorée**, pas comptée à zéro. La vente dont
 * aucune ligne n'est connue rend `null` : l'écran écrira alors un tiret, et
 * non un chiffre qui mentirait par le bas.
 */
export function margeVentePiece(vente: { lignes: readonly LigneVentePiece[] }): number | null {
  const connues = vente.lignes.filter((ligne) => ligne.prixAchatUnitaire !== null);
  if (connues.length === 0) return null;
  return connues.reduce((somme, ligne) => somme + (margeLigne(ligne) ?? 0), 0);
}

/** La marge d'un lot de ventes, `null` tant qu'aucune n'est connue. */
export function margeDesVentesPieces(
  ventes: readonly { lignes: readonly LigneVentePiece[] }[],
): number | null {
  const connues = ventes
    .map((vente) => margeVentePiece(vente))
    .filter((marge): marge is number => marge !== null);
  if (connues.length === 0) return null;
  return connues.reduce((somme, marge) => somme + marge, 0);
}

/**
 * Le libellé de l'encaissement, qui porte le nom du client quand on le connaît.
 *
 * S35 tranche le principe : le nom s'écrit **à l'encaissement**, pas à la
 * lecture — une écriture contre une jointure quotidienne sur tous les
 * appareils. Ici il est facultatif, comme le client.
 */
export function libelleEncaissement(numero: string, nomClient: string): string {
  const propre = nomClient.trim();
  return propre ? `Pièces ${numero} · ${propre}` : `Pièces ${numero}`;
}

/* --- Les alertes de la supervision ----------------------------------------- */

export type PieceEnAlerte = {
  piece: Piece;
  quantite: number;
  /**
   * `anomalie`, `epuise` ou `bas` — jamais `en_stock`.
   *
   * L'état plutôt qu'un booléen « épuisée » : un stock négatif et un stock à
   * zéro appellent deux phrases différentes, et les aplatir enverrait commander
   * un carton là où c'est une écriture qui manque (D82).
   */
  etat: EtatStock;
};

/** L'ordre d'urgence de la carte. `en_stock` n'y figure jamais, mais le type l'exige. */
const RANG_ALERTE: Record<EtatStock, number> = { anomalie: 0, epuise: 1, bas: 2, en_stock: 3 };

/**
 * Les pièces qui demandent un réapprovisionnement, pour la carte de supervision
 * (`prompt.md` §14).
 *
 * **Pas d'écran « Alertes » distinct**, et c'est un écart assumé : les filtres
 * « Stock bas » et « Épuisé » de `/pieces` répondent déjà à la question, pour le
 * même lecteur (D73). Ce qui manquait, c'est le **responsable**, qui ne regarde
 * pas le catalogue — d'où cette carte, et rien de plus.
 *
 * **Seules les références que ce périmètre a réellement tenues.** Le catalogue
 * est commun à l'entreprise, le stock ne l'est pas : une pièce que Koudougou
 * n'a jamais vendue ni reçue n'est pas « épuisée » là-bas, elle n'y a jamais
 * été. Les compter comme des ruptures noierait les vraies sous des centaines de
 * fausses, et une carte de décision qui crie tous les jours ne se lit plus. Le
 * test est l'existence d'un mouvement, c'est-à-dire la présence dans `stocks` —
 * pas la valeur, qui vaut zéro dans les deux cas.
 *
 * Les incohérences d'abord — un chiffre auquel on ne peut pas se fier empêche
 * de décider quoi que ce soit —, puis les épuisées, qui sont la vente qu'on
 * rate aujourd'hui.
 */
export function piecesEnAlerte(
  pieces: readonly Piece[],
  stocks: ReadonlyMap<string, number>,
): PieceEnAlerte[] {
  return pieces
    .filter((piece) => piece.actif && stocks.has(piece.id))
    .map((piece) => {
      const quantite = stocks.get(piece.id) ?? 0;
      return { piece, quantite, etat: etatStock(quantite, piece.seuilAlerte) };
    })
    .filter((ligne) => ligne.etat !== "en_stock")
    .sort((a, b) => {
      const rang = RANG_ALERTE[a.etat] - RANG_ALERTE[b.etat];
      if (rang !== 0) return rang;
      if (a.quantite !== b.quantite) return a.quantite - b.quantite;
      return a.piece.reference.localeCompare(b.piece.reference, "fr", { numeric: true });
    });
}

/* --- L'historique des ventes et son reçu (S64) ---------------------------- */

/**
 * Tri d'affichage de la liste des ventes : la plus récente en haut.
 *
 * Une date absente passe en dernier plutôt qu'en tête : c'est une anomalie
 * (une vente écrit sa date à la saisie), et la hisser au sommet ferait croire
 * qu'elle vient d'arriver. À dates égales, le numéro départage, décroissant.
 */
export function comparerVentesPieces(a: VentePiece, b: VentePiece): number {
  const ta = a.date ? a.date.getTime() : -Infinity;
  const tb = b.date ? b.date.getTime() : -Infinity;
  if (ta !== tb) return tb - ta;
  return b.numero.localeCompare(a.numero, "fr", { numeric: true });
}

/**
 * Une vente répond-elle à ce qu'on cherche ? Numéro, nom du client, ou
 * référence/désignation d'une de ses pièces — comme au comptoir, où l'on tape
 * ce qu'on a sous la main. Casse et accents ignorés ; une requête vide laisse
 * tout passer.
 *
 * Le nom du client est passé par l'écran : pour une vente récente, c'est le nom
 * tapé au comptoir (porté par `clientId`) ; pour une vente ancienne, c'est le
 * nom résolu depuis le fichier des clients. L'écran tranche entre les deux.
 */
export function venteCorrespond(vente: VentePiece, nomClient: string, requete: string): boolean {
  const cible = reduire(requete);
  if (!cible) return true;
  const foin = reduire(
    [
      vente.numero,
      nomClient,
      ...vente.lignes.map((ligne) => `${ligne.reference} ${ligne.designation}`),
    ].join(" "),
  );
  return foin.includes(cible);
}

/** « Plaquette de frein avant », ou « Plaquette… +2 autres » au-delà d'une ligne. */
export function resumeDesignations(vente: VentePiece): string {
  const [premiere, ...reste] = vente.lignes;
  if (!premiere) return "—";
  return reste.length === 0
    ? premiere.designation
    : `${premiere.designation} +${reste.length} autre${reste.length > 1 ? "s" : ""}`;
}

/** Le nombre d'articles vendus, quantités comprises. */
export function nombreArticles(vente: VentePiece): number {
  return vente.lignes.reduce((somme, ligne) => somme + ligne.quantite, 0);
}

/**
 * Le récapitulatif texte qu'on partage par WhatsApp ou SMS (§11), pour une
 * vente de pièces. Court et sans mise en forme : il voyage en clair.
 */
export function textePartageVentePiece(
  vente: VentePiece,
  nomClient: string,
  raisonSociale: string,
): string {
  const lignes = [
    raisonSociale,
    `Reçu ${vente.numero}`,
    nomClient ? `Client : ${nomClient}` : null,
    ...vente.lignes.map(
      (ligne) => `  ${ligne.quantite} × ${ligne.designation} — ${formaterMontant(ligne.total)}`,
    ),
    `Total : ${formaterMontant(vente.total)} (${LIBELLE_MOYEN[vente.moyenPaiement]})`,
    "Acquitté.",
  ];
  return lignes.filter((l) => l !== null).join("\n");
}
