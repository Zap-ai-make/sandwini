"use client";

import { AgentPlatformBackend, getAI, getGenerativeModel, ThinkingLevel } from "firebase/ai";
import { getApp } from "firebase/app";

import { activerAppCheck } from "@/lib/firebase/client";

import { DECLARATIONS, executerOutil, type ContexteOutils } from "./outils";
import { promptSysteme, type QuiParle } from "./prompt";
import {
  estRefus,
  lireProposition,
  OUTILS_QUI_PREPARENT,
  type Proposition,
} from "./propositions";
import { lireGeste, OUTILS_QUI_AGISSENT, type Geste } from "./gestes";
import type { PieceJointe } from "./media";
import { attenteAvantReessai, estSurcharge, statutHttp } from "./reessai";

/**
 * La conversation avec Gemini, par Firebase AI Logic.
 *
 * **Aucune clé d'API dans le client, et aucun serveur à nous.** Firebase AI
 * Logic signe les appels avec App Check (`lib/firebase/client.ts`) : sans lui,
 * le modèle refuse de répondre, et c'est exactement ce qui empêche un tiers de
 * recopier notre configuration publique pour appeler Gemini sur notre facture.
 *
 * **Le modèle n'atteint jamais la base.** Il demande un outil, et c'est ce
 * fichier qui l'exécute — donc avec le jeton de celui qui est connecté, donc
 * sous les règles Firestore. Voir l'en-tête de `outils.ts` : c'est là que vit
 * tout le raisonnement de sécurité de ce lot.
 */

/**
 * Flash par défaut, et c'est un arbitrage de coût autant que de vitesse.
 *
 * Les questions du comptoir — « combien il me reste de bougies », « qui me doit
 * de l'argent » — sont des lectures suivies d'une phrase. Le raisonnement lourd
 * d'`argon` s'y paierait sans rien améliorer. Le jour où une question demandera
 * vraiment de raisonner, le modèle se change ici, en un mot.
 */
const MODELE = "gemini-3.8-flash";

/**
 * **La facturation passe par le compte Google Cloud, et non par des crédits
 * prépayés.**
 *
 * Le premier essai réel a rendu « [429] Your prepayment credits are depleted » :
 * le backend Gemini Developer facture sur une cagnotte qu'il faut recharger à
 * la main, et qui s'épuise sans prévenir. Le commanditaire a choisi l'autre
 * voie — le projet est déjà en plan Blaze pour ses Cloud Functions, donc
 * l'assistant se facture là où tout le reste se facture déjà.
 *
 * `global` plutôt qu'une région nommée : c'est le défaut du SDK, et il route
 * vers la région où le modèle demandé existe. Fixer `europe-west1` gagnerait
 * quelques dizaines de millisecondes depuis Ouagadougou, mais ferait échouer
 * l'appel le jour où un modèle récent n'y est pas encore déployé — un arbitrage
 * qui se change ici, en un mot, si la latence devient gênante.
 */
const BACKEND = () => new AgentPlatformBackend();

/**
 * **Le réglage qui décide de l'attente ressentie.**
 *
 * Par défaut, un modèle de la série 3 choisit lui-même combien réfléchir avant
 * d'écrire son premier mot — et il réfléchit beaucoup. C'est ce silence, et non
 * le réseau, qui faisait patienter plusieurs secondes devant un écran vide sur
 * des questions aussi simples que « qu'est-ce qu'on a en stock ».
 *
 * `LOW` plutôt que `MINIMAL` : il reste un vrai choix à faire — quel outil
 * appeler, avec quels arguments — et couper net la réflexion dégraderait ce
 * choix, ce qui coûterait un aller-retour de plus. On la raccourcit, on ne la
 * supprime pas.
 *
 * Si un modèle futur refuse `thinkingLevel`, c'est ici que ça se verra : la
 * série 2.5 ne connaissait que `thinkingBudget`.
 */
const REFLEXION = ThinkingLevel.LOW;

/**
 * Une réponse de comptoir est courte. Ce plafond ne sert pas à tailler dans le
 * texte, mais à borner le pire cas — une boucle qui réciterait le catalogue.
 *
 * **Large exprès** : les jetons de réflexion se comptent dans ce budget. Le
 * serrer trop ferait dépenser le plafond à réfléchir et rendrait une réponse
 * coupée au milieu d'une phrase — une panne silencieuse, pire que la verbosité
 * qu'on cherchait à éviter.
 */
const REPONSE_MAX = 4096;

/**
 * Le nombre d'allers-retours d'outils qu'un tour s'autorise.
 *
 * Sans plafond, un modèle qui boucle sur un outil en erreur consommerait des
 * jetons jusqu'à épuisement — et la facture est réelle. Cinq suffisent
 * largement : chercher un client, lire ses ventes, répondre.
 */
const TOURS_MAX = 5;

export type Tour = { de: "humain" | "assistant"; texte: string };

/**
 * Ce qui se passe pendant qu'on attend.
 *
 * Le premier rendu laissait l'écran muet jusqu'à la réponse entière, parfois
 * dix secondes : le commanditaire a demandé qu'on voie l'assistant réfléchir.
 * Mais une animation seule ne dit rien ; nommer la lecture en cours — « je
 * regarde le stock » — transforme l'attente en information, et laisse juger si
 * l'assistant a compris la question avant même qu'il réponde.
 */
export type Progres =
  | { quoi: "outils"; noms: string[] }
  /** Le texte **cumulé** depuis le début, pas le seul morceau qui vient d'arriver. */
  | { quoi: "texte"; texte: string }
  /**
   * Le serveur était occupé, on reprend. Dit plutôt que caché : trois secondes
   * de silence inexpliqué se lisent comme une panne.
   */
  | { quoi: "attente"; reprise: number }
  /**
   * Une écriture **préparée**, que l'écran va faire confirmer.
   *
   * Elle remonte par ce chemin plutôt que dans la réponse finale : la carte
   * doit apparaître dès que le modèle la compose, pendant qu'il rédige encore
   * sa phrase. L'utilisateur voit ce qui sera écrit avant d'avoir fini de lire.
   */
  | { quoi: "proposition"; proposition: Proposition }
  /**
   * Un geste à faire **sur l'écran** : ouvrir une page, changer de boutique,
   * refermer le panneau.
   *
   * Il remonte par ce chemin parce que ce fichier n'a ni routeur ni
   * périmètre — et ne doit pas en avoir. Voir `gestes.ts` : l'assistant passe
   * par la porte d'entrée de l'application, jamais par une souris simulée.
   */
  | { quoi: "geste"; geste: Geste };

export type Conversation = {
  /** Rend le texte de la réponse, et la liste des outils réellement employés. */
  envoyer: (
    question: string,
    pieces?: readonly PieceJointe[],
    surProgres?: (progres: Progres) => void,
  ) => Promise<{ texte: string; outils: string[] }>;
};

/**
 * Ce qu'on dit au modèle quand la personne n'a rien tapé.
 *
 * Une photo ou une voix envoyée seule est une demande complète au comptoir :
 * on tend son téléphone, on ne commente pas. Mais un message sans texte laisse
 * le modèle décrire l'image au lieu d'agir, alors on dit l'intention.
 */
const CONSIGNE_SANS_MOTS: Record<PieceJointe["quoi"], string> = {
  photo: "Voici une photo. Regarde-la et fais ce qu’elle appelle.",
  voix: "Écoute ce message et fais ce qu’il demande.",
};

export function ouvrirConversation(quiParle: QuiParle, contexte: ContexteOutils): Conversation {
  /* **App Check s'allume ici, et nulle part ailleurs.**

     Firebase AI Logic est le seul produit du projet en application forcée : il
     refuse de servir le modèle sans jeton. Auth et Firestore, eux, ne sont
     qu'en surveillance. L'allumer au démarrage de l'application faisait donc
     dépendre la **connexion** d'un script de Google — et le jour où ce script
     n'a pas pu se charger sur le site déployé, plus personne n'a pu entrer.
     Voir `lib/firebase/client.ts` : la panne y est racontée en entier. */
  activerAppCheck();

  const ia = getAI(getApp(), { backend: BACKEND() });
  const modele = getGenerativeModel(ia, {
    model: MODELE,
    systemInstruction: promptSysteme(quiParle),
    generationConfig: {
      thinkingConfig: { thinkingLevel: REFLEXION },
      maxOutputTokens: REPONSE_MAX,
    },
    tools: [{ functionDeclarations: DECLARATIONS as unknown as [] }],
  });

  /* `startChat` tient l'historique : le modèle doit se souvenir de « et son
     numéro ? » après « qui est Ouédraogo ». */
  const discussion = modele.startChat();

  return {
    async envoyer(
      question: string,
      pieces?: readonly PieceJointe[],
      surProgres?: (progres: Progres) => void,
    ) {
      const employes: string[] = [];
      let cumul = "";

      /* Les pièces d'abord, le texte ensuite : c'est l'ordre que Gemini lit le
         mieux quand une question porte sur ce qu'on lui montre. */
      const jointes = pieces ?? [];
      const dit = question.trim() || (jointes[0] ? CONSIGNE_SANS_MOTS[jointes[0].quoi] : question);
      const premier =
        jointes.length === 0
          ? dit
          : [
              ...jointes.map((piece) => ({
                inlineData: { mimeType: piece.type, data: piece.donnees },
              })),
              { text: dit },
            ];

      /**
       * Un tour en flux : le texte arrive par morceaux et part aussitôt à
       * l'écran.
       *
       * `cumul` traverse les tours sans être remis à zéro : quand le modèle
       * parle, lit un outil, puis reprend, les deux moitiés appartiennent à la
       * même réponse. L'effacer entre les deux ferait disparaître sous les yeux
       * ce qui venait d'être lu.
       *
       * **Et il reprend tout seul quand le serveur est occupé.** Voir
       * `reessai.ts` : un 429 n'est pas un forfait dépassé, c'est une file
       * pleine à l'instant T. Le SDK n'ajoute la question à son historique
       * qu'en cas de succès — on l'a vérifié dans sa source — donc renvoyer le
       * même message est sans effet de bord, et c'est ce qui rend cette boucle
       * sûre.
       */
      const tourEnFlux = async (envoi: Parameters<typeof discussion.sendMessageStream>[0]) => {
        for (let reprise = 0; ; reprise += 1) {
          /* Ce qui est déjà parti à l'écran ne se rejoue pas : reprendre après
             un flux entamé réécrirait le début de la phrase. */
          const dejaDit = cumul;
          try {
            const flux = await discussion.sendMessageStream(envoi);
            for await (const morceau of flux.stream) {
              const texte = morceau.text();
              if (!texte) continue;
              cumul += texte;
              surProgres?.({ quoi: "texte", texte: cumul });
            }
            return flux.response;
          } catch (cause) {
            const attente =
              cumul === dejaDit && estSurcharge(cause) ? attenteAvantReessai(reprise) : null;
            if (attente === null) throw cause;
            surProgres?.({ quoi: "attente", reprise: reprise + 1 });
            await new Promise((resoudre) => setTimeout(resoudre, attente));
          }
        }
      };

      let reponse = { response: await tourEnFlux(premier) };

      for (let tour = 0; tour < TOURS_MAX; tour += 1) {
        const appels = reponse.response.functionCalls() ?? [];
        if (appels.length === 0) break;

        surProgres?.({ quoi: "outils", noms: appels.map((appel) => appel.name) });

        /* Les gestes qui préparent une écriture remontent à l'écran. La même
           lecture pure sert deux fois — ici pour la carte, dans `executerOutil`
           pour ce que le modèle redit — plutôt qu'un aller-retour d'état entre
           les deux. */
        /* Les gestes d'écran partent tout de suite : attendre la fin de la
           phrase ferait ouvrir la page après qu'on a fini de lire « j'ouvre
           les paiements ». */
        for (const appel of appels) {
          if (!OUTILS_QUI_AGISSENT.has(appel.name)) continue;
          const geste = lireGeste(appel.name, (appel.args ?? {}) as Record<string, unknown>);
          if (!estRefus(geste)) surProgres?.({ quoi: "geste", geste });
        }

        for (const appel of appels) {
          if (!OUTILS_QUI_PREPARENT.has(appel.name)) continue;
          const proposition = lireProposition(
            appel.name,
            (appel.args ?? {}) as Record<string, unknown>,
          );
          if (!estRefus(proposition)) surProgres?.({ quoi: "proposition", proposition });
        }

        /* En parallèle : le modèle demande volontiers deux lectures d'un coup,
           et les enchaîner doublerait l'attente au comptoir. */
        const resultats = await Promise.all(
          appels.map(async (appel) => {
            employes.push(appel.name);
            const donnees = await executerOutil(
              appel.name,
              (appel.args ?? {}) as Record<string, unknown>,
              contexte,
            );
            return { functionResponse: { name: appel.name, response: donnees } };
          }),
        );

        reponse = { response: await tourEnFlux(resultats) };
      }

      const texte = cumul.trim();
      return {
        /* Un modèle qui ne rend rien est un cas réel — filtre de sécurité,
           plafond de tours atteint. Le silence serait pris pour une panne de
           l'écran, donc on le nomme. */
        texte: texte || "Je n’ai pas pu formuler de réponse. Reformule ta question ?",
        outils: employes,
      };
    },
  };
}

/**
 * Traduit les refus de Gemini en phrases qui disent quoi faire.
 *
 * **Et laisse toujours l'erreur brute dans la console.** La première version
 * n'affichait que la phrase traduite : un échec d'App Check s'y présentait
 * comme un `fetch` raté, donc comme « le réseau est coupé » — dit à quelqu'un
 * dont tout le reste de l'application fonctionnait. Un message rassurant posé
 * sur un diagnostic faux coûte plus cher que pas de message du tout, et il a
 * fallu le code brut pour s'en apercevoir.
 */
export function messageErreurAssistant(cause: unknown): string {
  const brut = `${(cause as { code?: string }).code ?? ""} ${(cause as Error)?.message ?? ""}`;
  const statut = statutHttp(cause);
  console.error("[assistant] échec brut :", cause);

  /* `401` autant que `403` : Firebase AI Logic rend 401 quand le jeton App
     Check manque, et 403 quand il est refusé. Le premier essai du
     commanditaire a rendu 401, que ce filtre ne reconnaissait pas. */
  if (statut === 401 || statut === 403 || /app-?check|unauthorized|appCheck/i.test(brut)) {
    /* Le refus le plus probable au premier essai, et le plus déroutant : tout
       le reste de l'application marche. */
    return "L’assistant n’est pas encore autorisé sur cet appareil. Signalez-le au responsable : c’est un réglage à faire une fois, pas une panne.";
  }
  /* **Deux refus portent le même 429, et ils n'appellent pas le même geste.**
     Une file pleine se vide en quelques secondes ; des crédits épuisés,
     jamais. Dire « réessayez » à qui doit payer l'envoie attendre un retour
     qui n'arrivera pas — c'est la faute que ce commentaire existe pour
     empêcher de refaire. */
  if (/credits? (are )?depleted|billing|prepayment|out of credits/i.test(brut)) {
    return "L’assistant n’a plus de crédit pour répondre. Prévenez le responsable : attendre n’y changera rien.";
  }
  /* On n'arrive ici qu'**après** les reprises automatiques de `reessai.ts` :
     le service était occupé plusieurs secondes d'affilée. Le message ne parle
     donc plus de « limite d'appels », qui laissait croire à un forfait
     dépassé, et qui envoyait chercher un quota à relever là où il n'y en a
     aucun — la capacité est partagée, pas achetée. */
  if (statut === 429 || statut === 503 || /quota|resource-exhausted|rate.?limit/i.test(brut)) {
    return "L’assistant est très demandé en ce moment et n’a pas pu répondre, malgré plusieurs tentatives. Reposez la question dans un instant.";
  }
  if (statut === 404 || /not.?enabled|disabled|SERVICE_DISABLED|has not been used/i.test(brut)) {
    /* L'API Gemini pas encore activée sur le projet : le cas du premier jour,
       et il n'a rien d'un problème de réseau. */
    return "L’assistant n’est pas encore ouvert sur cette installation. Signalez-le au responsable.";
  }
  /* « Hors ligne » ne s'affirme que si le navigateur le dit lui-même. Le
     déduire d'un `fetch` raté désignait le réseau pour toutes les pannes, et
     envoyait chercher un défaut là où il n'y en avait pas. */
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "L’assistant a besoin du réseau, et il est coupé. Le reste de l’application continue de fonctionner.";
  }
  return "L’assistant n’a pas répondu. Réessayez ; si cela se reproduit, signalez-le au responsable.";
}
