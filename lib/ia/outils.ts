import { collection, getDocs, limit, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase/client";

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
      "Le catalogue des pièces détachées de la boutique, avec prix d'achat, prix de vente et " +
      "seuil d'alerte. Le prix d'achat d'une pièce est visible du gérant, à l'inverse de celui " +
      "d'une moto. Sert à répondre « à combien je vends », « qu'est-ce que ça m'a coûté ».",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "mouvements_pieces",
    description:
      "Les mouvements de stock des pièces : entrées, sorties, ventes. La quantité en stock " +
      "d'une référence est la somme de ses mouvements — il n'existe aucun compteur. Sert à " +
      "répondre « combien il m'en reste », « qu'est-ce qui est en rupture ».",
    parameters: { type: "object", properties: {} },
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

async function lire(
  nomCollection: string,
  boutiqueId: string | null,
): Promise<Record<string, unknown>[]> {
  const base = collection(db(), nomCollection);
  /* Le filtre par boutique part dans la requête, et non après la lecture : un
     gérant qui demanderait une autre boutique se verrait refuser par les règles,
     mais le responsable, lui, a le droit de tout lire — c'est le périmètre qui
     borne, pas le rôle. */
  const requete = boutiqueId
    ? query(base, where("boutiqueId", "==", boutiqueId), limit(PLAFOND * 4))
    : query(base, limit(PLAFOND * 4));
  const instantane = await getDocs(requete);
  return instantane.docs.map((document) => ({ id: document.id, ...document.data() }));
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
        const motos = (await lire("motos", contexte.boutiqueId))
          .filter((moto) => moto.statut === "en_stock")
          .map(aplatir);
        const recherche = reduire(arguments_.recherche);
        const retenues = recherche
          ? motos.filter((moto) => reduire(Object.values(moto).join(" ")).includes(recherche))
          : motos;
        return { motos: retenues.slice(0, PLAFOND), combien: retenues.length };
      }

      case "chercher_client": {
        /* Les clients ne portent pas de boutique : une personne achète où elle
           veut, et couper son historique par magasin le rendrait faux. */
        const cherche = reduire(arguments_.nom);
        const trouves = (await lire("clients", null))
          .map(aplatir)
          .filter((client) => reduire(Object.values(client).join(" ")).includes(cherche));
        return { clients: trouves.slice(0, PLAFOND), combien: trouves.length };
      }

      case "ventes_recentes": {
        const ventes = (await lire("ventes", contexte.boutiqueId))
          .map(aplatir)
          .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
        return { ventes: ventes.slice(0, PLAFOND), combien: ventes.length };
      }

      case "catalogue_pieces": {
        const pieces = (await lire("pieces", contexte.boutiqueId)).map(aplatir);
        return { pieces: pieces.slice(0, PLAFOND), combien: pieces.length };
      }

      case "mouvements_pieces": {
        const mouvements = (await lire("mouvementsPieces", contexte.boutiqueId)).map(aplatir);
        return { mouvements: mouvements.slice(0, PLAFOND * 2), combien: mouvements.length };
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
