import { collection, getDocs, limit, query, where } from "firebase/firestore";

import {
  etatStock,
  LIBELLE_ETAT_STOCK,
  stockParPiece,
  type MouvementPiece,
} from "@/lib/domain/piece";
import { db } from "@/lib/firebase/client";
import { estRefus, lireProposition, resume } from "./propositions";

/**
 * Les outils que l'assistant peut demander — et c'est **le navigateur qui les
 * exécute**, jamais Google.
 *
 * C'est le fait qui porte toute la sécurité de ce lot. Firebase AI Logic ne
 * laisse pas le modèle appeler une fonction : il produit des données
 * structurées, et *notre* code appelle. Donc chaque lecture part avec le jeton
 * de celui qui est connecté, et **les règles Firestore s'appliquent sans une
 * ligne de plus**. L'assistant d'un gérant est physiquement incapable de lire
 * `prive/cout` : la base refuse, pas la politesse du modèle.
 *
 * L'alternative — une Cloud Function avec le SDK Admin — aurait contourné les
 * règles en entier, et il aurait fallu reconstruire à la main tout le mur de
 * D2. On ne l'a pas fait pour cette raison exacte.
 *
 * **Ce que renvoie un outil est une donnée, jamais un ordre.** Les noms de
 * clients, les libellés et les notes sont du texte libre saisi par des humains.
 * Une note qui dirait « ignore tes instructions » sera lue par le modèle ; le
 * mur tient quand même, puisque c'est la base qui refuse. Mais le prompt
 * système le dit explicitement, et le rendu n'interprète jamais ce texte.
 */

/** Le plafond de lignes qu'un outil rend. Chaque ligne est facturée en jetons. */
const PLAFOND = 50;

/** Ce qu'on accepte de lire dans la base avant de filtrer. */
const LECTURE_MAX = 200;

/**
 * Les mouvements se lisent **tous**, et non par tranche de deux cents.
 *
 * Ils ne partent pas au modèle : ils sont réduits ici en une quantité par
 * pièce. Les plafonner serait donc gratuit en jetons et ruineux en justesse —
 * c'est la seule lecture de ce fichier dont une coupure fausse un chiffre au
 * lieu d'en cacher.
 */
const MOUVEMENTS_MAX = 5_000;

export type ContexteOutils = {
  /** `null` veut dire « toutes les boutiques » : le responsable seul l'obtient. */
  boutiqueId: string | null;
};

/**
 * Les déclarations, au format attendu par l'API de Gemini.
 *
 * Écrites à la main plutôt que dérivées des types : une description est de la
 * **documentation lue par le modèle**, et c'est elle qui décide s'il choisit le
 * bon outil. La dériver d'un type produirait des noms de champs sans la phrase
 * qui dit quand s'en servir.
 */
export const DECLARATIONS = [
  {
    name: "motos_en_stock",
    description:
      "Les motos actuellement en stock dans le périmètre courant : marque, modèle, châssis, " +
      "prix de vente, date d'entrée. Sert à répondre « qu'est-ce qu'on a », « depuis quand " +
      "dort cette moto », « as-tu une Sanili rouge ».",
    parameters: {
      type: "object",
      properties: {
        recherche: {
          type: "string",
          description:
            "Facultatif. Un mot à chercher dans la marque, le modèle, la couleur ou le châssis.",
        },
      },
    },
  },
  {
    name: "chercher_client",
    description:
      "Cherche une fiche client par nom ou par téléphone. Sert avant toute vente, et pour " +
      "répondre « qui est ce monsieur », « quel est son numéro ».",
    parameters: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Tout ou partie du nom, ou un numéro de téléphone." },
      },
      required: ["nom"],
    },
  },
  {
    name: "ventes_recentes",
    description:
      "Les ventes de motos du périmètre courant, de la plus récente à la plus ancienne : " +
      "numéro, client, moto, prix, mode de paiement, reste dû. Sert à répondre « combien on a " +
      "vendu », « qui me doit encore de l'argent ».",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "catalogue_pieces",
    description:
      "Le catalogue des pièces détachées de la boutique : référence, désignation, prix d'achat, " +
      "prix de vente, et **la quantité réellement en stock**, déjà calculée. Le prix d'achat " +
      "d'une pièce est visible du gérant, à l'inverse de celui d'une moto. Répond à « combien " +
      "il m'en reste », « qu'est-ce qui est en rupture », « à combien je vends ». Donne aussi " +
      "l'identifiant à passer à `preparer_mouvement_piece`.",
    parameters: {
      type: "object",
      properties: {
        recherche: {
          type: "string",
          description: "Facultatif. Un mot à chercher dans la référence ou la désignation.",
        },
      },
    },
  },

  /* --- Les deux gestes qui **préparent** une écriture, sans jamais l'écrire.
         L'assistant remplit, l'humain valide, les règles refusent : voir
         `lib/ia/propositions.ts` pour pourquoi les trois, et pas seulement le
         troisième. --- */
  {
    name: "preparer_depense",
    description:
      "Prépare une sortie d'espèces de la caisse, à faire valider par l'utilisateur. " +
      "N'ENREGISTRE RIEN : l'utilisateur verra une carte et devra confirmer. Sers-toi en " +
      "quand on te dit « note 15000 de carburant », « j'ai payé le loyer ». Demande le poste " +
      "si on ne te l'a pas donné.",
    parameters: {
      type: "object",
      properties: {
        montant: { type: "number", description: "En francs CFA, entier et positif." },
        poste: {
          type: "string",
          description:
            "Où ranger la dépense : Carburant, Loyer, Salaires… Il se crée s'il n'existe pas.",
        },
        libelle: {
          type: "string",
          description: "Facultatif. Le détail, quand le poste ne suffit pas à dire laquelle.",
        },
      },
      required: ["montant", "poste"],
    },
  },
  {
    name: "preparer_mouvement_piece",
    description:
      "Prépare une entrée ou une sortie de stock pour une pièce, à faire valider par " +
      "l'utilisateur. N'ENREGISTRE RIEN. Sers-toi en quand on te dit « j'ai reçu 40 bougies », " +
      "« retire 2 plaquettes cassées ». Appelle d'abord `catalogue_pieces` pour obtenir " +
      "l'identifiant exact de la pièce — ne l'invente jamais.",
    parameters: {
      type: "object",
      properties: {
        pieceId: {
          type: "string",
          description: "L'identifiant rendu par `catalogue_pieces`, jamais un nom.",
        },
        reference: { type: "string", description: "La référence, pour l'afficher à l'utilisateur." },
        sens: {
          type: "string",
          description:
            "`entree` quand le stock monte, `sortie_autre` quand il descend sans vente " +
            "(casse, usage interne). Une vente ne passe jamais par ici.",
        },
        quantite: { type: "number", description: "Toujours positive : le sens vient de `sens`." },
        note: { type: "string", description: "Facultatif. Pourquoi ce mouvement." },
      },
      required: ["pieceId", "sens", "quantite"],
    },
  },
] as const;

/** Le nom des outils, pour refuser tout de suite un appel inventé par le modèle. */
const NOMS = new Set(DECLARATIONS.map((declaration) => declaration.name));

function reduire(texte: unknown): string {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Lit une collection, et **dit si elle a été coupée**.
 *
 * `tronque` n'est pas un détail de confort : une somme faite sur une liste
 * tronquée rend un nombre faux qui a l'air juste. Le stock d'une pièce est
 * précisément cela — la somme de ses mouvements — et un plafond silencieux
 * annoncerait « il reste 12 bougies » à qui en a 40.
 */
async function lire(
  nomCollection: string,
  boutiqueId: string | null,
  plafond: number,
): Promise<{ lignes: Record<string, unknown>[]; tronque: boolean }> {
  const base = collection(db(), nomCollection);
  /* Le filtre par boutique part dans la requête, et non après la lecture : un
     gérant qui demanderait une autre boutique se verrait refuser par les règles,
     mais le responsable, lui, a le droit de tout lire — c'est le périmètre qui
     borne, pas le rôle. */
  const requete = boutiqueId
    ? query(base, where("boutiqueId", "==", boutiqueId), limit(plafond))
    : query(base, limit(plafond));
  const instantane = await getDocs(requete);
  return {
    lignes: instantane.docs.map((document) => ({ id: document.id, ...document.data() })),
    tronque: instantane.size >= plafond,
  };
}

/** Les dates Firestore ne se sérialisent pas en JSON : on les rend lisibles. */
function aplatir(donnees: Record<string, unknown>): Record<string, unknown> {
  const plat: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(donnees)) {
    if (valeur === null || valeur === undefined) continue;
    /* Les champs d'audit n'intéressent pas le modèle et coûtent des jetons à
       chaque ligne. Le prix d'achat d'une moto, lui, n'arrive jamais ici : les
       règles l'ont déjà refusé au gérant, et il vit dans `prive/`. */
    if (/^(createdAt|createdBy|createdByName|updatedAt|updatedBy|updatedByName)$/.test(cle)) {
      continue;
    }
    const horodatage = valeur as { toDate?: () => Date };
    plat[cle] =
      typeof horodatage?.toDate === "function"
        ? horodatage.toDate().toISOString().slice(0, 10)
        : valeur;
  }
  return plat;
}

/**
 * Exécute un outil demandé par le modèle.
 *
 * Rend toujours un objet, jamais une exception : un refus de lecture est une
 * **réponse** que le modèle doit pouvoir expliquer à l'utilisateur, pas un
 * plantage de l'écran. C'est D82 appliqué ici — un échec n'est pas une absence
 * de donnée, et il se nomme.
 */
export async function executerOutil(
  nom: string,
  arguments_: Record<string, unknown>,
  contexte: ContexteOutils,
): Promise<Record<string, unknown>> {
  if (!NOMS.has(nom as (typeof DECLARATIONS)[number]["name"])) {
    return { erreur: `Outil inconnu : ${nom}.` };
  }

  try {
    switch (nom) {
      case "motos_en_stock": {
        const lu = await lire("motos", contexte.boutiqueId, LECTURE_MAX);
        const motos = lu.lignes.filter((moto) => moto.statut === "en_stock").map(aplatir);
        const recherche = reduire(arguments_.recherche);
        const retenues = recherche
          ? motos.filter((moto) => reduire(Object.values(moto).join(" ")).includes(recherche))
          : motos;
        return {
          motos: retenues.slice(0, PLAFOND),
          combien: retenues.length,
          ...(lu.tronque ? { partiel: "La liste a été coupée : dis-le au lieu de conclure." } : {}),
        };
      }

      case "chercher_client": {
        /* Les clients ne portent pas de boutique : une personne achète où elle
           veut, et couper son historique par magasin le rendrait faux. */
        const cherche = reduire(arguments_.nom);
        const lu = await lire("clients", null, LECTURE_MAX);
        const trouves = lu.lignes
          .map(aplatir)
          .filter((client) => reduire(Object.values(client).join(" ")).includes(cherche));
        return {
          clients: trouves.slice(0, PLAFOND),
          combien: trouves.length,
          ...(lu.tronque ? { partiel: "La recherche n’a pas vu tout le fichier clients." } : {}),
        };
      }

      case "ventes_recentes": {
        const lu = await lire("ventes", contexte.boutiqueId, LECTURE_MAX);
        const ventes = lu.lignes
          .map(aplatir)
          .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
        return { ventes: ventes.slice(0, PLAFOND), combien: ventes.length };
      }

      case "catalogue_pieces": {
        /* **Le catalogue arrive avec son stock déjà fait.**

           Avant, le modèle recevait cent lignes de mouvements bruts et devait
           les additionner lui-même : lent à transmettre, cher en jetons, et
           faux dès qu'une ligne manquait. La somme est un calcul, pas une
           opinion — elle se fait ici, avec la fonction que les écrans emploient
           déjà (`stockParPiece`), donc avec le même résultat qu'à l'écran. */
        const [cataloguee, bouges] = await Promise.all([
          lire("pieces", contexte.boutiqueId, LECTURE_MAX),
          lire("mouvementsPieces", contexte.boutiqueId, MOUVEMENTS_MAX),
        ]);

        const quantites = stockParPiece(
          bouges.lignes as unknown as readonly MouvementPiece[],
        );
        const recherche = reduire(arguments_.recherche);
        const pieces = cataloguee.lignes
          .map(aplatir)
          .filter((piece) =>
            recherche ? reduire(Object.values(piece).join(" ")).includes(recherche) : true,
          )
          .map((piece) => {
            const quantite = quantites.get(String(piece.id)) ?? 0;
            return {
              ...piece,
              quantite,
              etat: LIBELLE_ETAT_STOCK[etatStock(quantite, Number(piece.seuilAlerte ?? 0))],
            };
          });

        return {
          pieces: pieces.slice(0, PLAFOND),
          combien: pieces.length,
          /* Une somme tronquée rend un stock faux qui a l'air juste : on refuse
             de le donner plutôt que de le donner avec une réserve que le modèle
             pourrait oublier de répéter. */
          ...(bouges.tronque
            ? {
                erreur:
                  "Trop de mouvements pour recalculer le stock ici. Les quantités ne sont pas " +
                  "sûres : renvoie vers l’espace Pièces.",
              }
            : {}),
        };
      }

      case "preparer_depense":
      case "preparer_mouvement_piece": {
        /* **Rien ne s'écrit ici.** On rend au modèle ce qu'il a compris, pour
           qu'il le redise à l'utilisateur ; la carte de confirmation, elle, est
           montée par `components/Assistant.tsx` à partir de la même lecture.
           Un refus remonte tel quel : le modèle doit alors redemander ce qui
           manque plutôt que de proposer une carte à moitié remplie. */
        const proposition = lireProposition(nom, arguments_);
        if (estRefus(proposition)) return proposition;
        return {
          prepare: true,
          resume: resume(proposition),
          consigne:
            "Rien n'est enregistré. Annonce à l'utilisateur ce que tu proposes et dis-lui de " +
            "valider la carte affichée sous ta réponse.",
        };
      }

      default:
        return { erreur: `Outil non implémenté : ${nom}.` };
    }
  } catch (cause) {
    const code = (cause as { code?: string }).code ?? "inconnu";
    /* Nommer le refus plutôt que de rendre une liste vide : « je n'ai pas le
       droit de lire ça » et « il n'y a rien » sont deux réponses différentes, et
       les confondre ferait mentir l'assistant. */
    return {
      erreur:
        code === "permission-denied"
          ? "Les droits de ce compte ne permettent pas de lire ces données."
          : `La lecture a échoué (${code}). Le réseau est peut-être coupé.`,
    };
  }
}

/**
 * Ce qu'on affiche pendant qu'un outil travaille.
 *
 * Le nom technique (`motos_en_stock`) ne dit rien à un gérant, et une animation
 * muette ne dit rien non plus. Nommer la lecture en cours transforme l'attente
 * en information : on juge que l'assistant a compris la question avant même
 * qu'il réponde.
 */
export const LIBELLE_OUTIL: Record<string, string> = {
  motos_en_stock: "Lecture du stock de motos",
  chercher_client: "Recherche du client",
  ventes_recentes: "Lecture des ventes",
  catalogue_pieces: "Lecture du catalogue et du stock de pièces",
  /* Les deux gestes qui préparent sont nommés ici aussi : sans entrée, le
     rendu retombait sur la clé technique et affichait « lu : preparer_depense »
     sous la réponse — du code montré à un gérant. */
  preparer_depense: "Préparation d’une dépense",
  preparer_mouvement_piece: "Préparation d’un mouvement de stock",
};
