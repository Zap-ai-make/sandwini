/**
 * Ce que l'assistant **prépare**, et qu'un humain seul valide.
 *
 * **L'arbitrage du commanditaire, le 19 octobre 2026** : « oui je valide l'IA
 * prépare et on confirme ». Il avait demandé que l'assistant puisse écrire ;
 * la réponse n'est pas de lui refuser, c'est de séparer les trois rôles.
 *
 * - L'assistant **prépare** : il fait le travail lent — retrouver la pièce,
 *   convertir « deux caisses de vingt » en quarante, choisir le bon poste.
 * - L'humain **valide** : il voit ce qui sera écrit, en toutes lettres, et
 *   c'est son geste qui engage.
 * - Les règles Firestore **refusent** : une écriture mal formée ne passe pas,
 *   quoi qu'ait compris le modèle.
 *
 * **Pourquoi les trois, et pas seulement le troisième.** Les règles attrapent
 * une écriture invalide ; elles ne peuvent rien contre une écriture *valide et
 * fausse* — le bon format, le mauvais montant. Seul quelqu'un qui connaît la
 * journée peut voir que la sortie de 15 000 était de 1 500. C'est le seul
 * endroit de ce lot qui peut coûter de l'argent réel, et la confirmation est sa
 * seule parade.
 *
 * Ce module est **pur** : il ne connaît ni Firestore ni React. Il transforme ce
 * que le modèle propose en une intention vérifiée, ou en un refus qui se lit.
 */

export type Proposition =
  | { quoi: "depense"; montant: number; libelle: string; poste: string }
  | {
      quoi: "mouvement_piece";
      pieceId: string;
      /** Recopiée pour l'affichage : la carte doit nommer la pièce, pas un identifiant. */
      reference: string;
      sens: "entree" | "sortie_autre";
      quantite: number;
      note: string;
    };

export type Refus = { erreur: string };

/** Les noms d'outils qui préparent une écriture plutôt que de lire. */
export const OUTILS_QUI_PREPARENT = new Set(["preparer_depense", "preparer_mouvement_piece"]);

const MONTANT_MAX = 1_000_000_000;
const QUANTITE_MAX = 1_000_000;

function entier(valeur: unknown): number | null {
  /* Le modèle rend parfois « 15000 », parfois 15000, parfois « 15 000 ». Les
     trois désignent le même billet ; refuser les deux premiers ferait échouer
     une proposition juste pour une question de forme. */
  const brut = typeof valeur === "string" ? valeur.replace(/[\s .]/g, "") : valeur;
  const nombre = Number(brut);
  if (!Number.isFinite(nombre) || !Number.isInteger(nombre)) return null;
  return nombre;
}

function texte(valeur: unknown): string {
  return typeof valeur === "string" ? valeur.trim() : "";
}

/**
 * Lit ce que le modèle propose, et refuse plutôt que de deviner.
 *
 * Un refus est rendu **au modèle**, qui doit alors redemander à l'utilisateur
 * ce qui manque. C'est préférable à une carte de confirmation à moitié remplie
 * où le champ vide se remarque mal.
 */
export function lireProposition(nom: string, args: Record<string, unknown>): Proposition | Refus {
  if (nom === "preparer_depense") {
    const montant = entier(args.montant);
    if (montant === null || montant <= 0) {
      return { erreur: "Le montant doit être un nombre de francs supérieur à zéro." };
    }
    if (montant > MONTANT_MAX) return { erreur: "Ce montant dépasse le maximum admis." };

    const poste = texte(args.poste);
    /* Exigé ici comme il l'est à l'écran (S55) : sans poste, « combien de
       carburant ce mois-ci » reste sans réponse, et le livre analytique
       retombe au rang de journal. */
    if (poste === "") {
      return { erreur: "Demandez à quel poste ranger cette dépense : carburant, loyer, autre." };
    }

    return { quoi: "depense", montant, libelle: texte(args.libelle), poste };
  }

  if (nom === "preparer_mouvement_piece") {
    const pieceId = texte(args.pieceId);
    if (pieceId === "") {
      return { erreur: "Trouvez d’abord la pièce au catalogue pour obtenir son identifiant." };
    }

    const quantite = entier(args.quantite);
    if (quantite === null || quantite <= 0) {
      return { erreur: "La quantité doit être un nombre entier supérieur à zéro." };
    }
    if (quantite > QUANTITE_MAX) return { erreur: "Cette quantité dépasse le maximum admis." };

    const sens = texte(args.sens);
    /* Seuls les deux types qu'un humain saisit à la main. Une sortie de vente
       naît d'une vente, jamais d'une phrase — la proposer ici ferait descendre
       le stock sans recette en face. */
    if (sens !== "entree" && sens !== "sortie_autre") {
      return { erreur: "Précisez s’il s’agit d’une entrée en stock ou d’une sortie." };
    }

    return {
      quoi: "mouvement_piece",
      pieceId,
      reference: texte(args.reference),
      sens,
      quantite,
      note: texte(args.note),
    };
  }

  return { erreur: `Geste inconnu : ${nom}.` };
}

export function estRefus(valeur: Proposition | Refus): valeur is Refus {
  return "erreur" in valeur;
}

/** La phrase que le modèle redit à l'utilisateur, pour qu'il sache quoi vérifier. */
export function resume(proposition: Proposition): string {
  if (proposition.quoi === "depense") {
    const detail = proposition.libelle ? ` — ${proposition.libelle}` : "";
    return `Sortie de ${proposition.montant} FCFA, rangée au poste « ${proposition.poste} »${detail}.`;
  }
  const geste = proposition.sens === "entree" ? "Entrée" : "Sortie";
  const quoi = proposition.reference || "cette pièce";
  return `${geste} de ${proposition.quantite} × ${quoi}.`;
}
