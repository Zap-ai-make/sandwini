"use client";

import { AgentPlatformBackend, getAI, getGenerativeModel } from "firebase/ai";
import { getApp } from "firebase/app";

import { DECLARATIONS, executerOutil, type ContexteOutils } from "./outils";
import { promptSysteme, type QuiParle } from "./prompt";
import {
  estRefus,
  lireProposition,
  OUTILS_QUI_PREPARENT,
  type Proposition,
} from "./propositions";

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
   * Une écriture **préparée**, que l'écran va faire confirmer.
   *
   * Elle remonte par ce chemin plutôt que dans la réponse finale : la carte
   * doit apparaître dès que le modèle la compose, pendant qu'il rédige encore
   * sa phrase. L'utilisateur voit ce qui sera écrit avant d'avoir fini de lire.
   */
  | { quoi: "proposition"; proposition: Proposition };

export type Conversation = {
  /** Rend le texte de la réponse, et la liste des outils réellement employés. */
  envoyer: (
    question: string,
    surProgres?: (progres: Progres) => void,
  ) => Promise<{ texte: string; outils: string[] }>;
};

export function ouvrirConversation(quiParle: QuiParle, contexte: ContexteOutils): Conversation {
  const ia = getAI(getApp(), { backend: BACKEND() });
  const modele = getGenerativeModel(ia, {
    model: MODELE,
    systemInstruction: promptSysteme(quiParle),
    tools: [{ functionDeclarations: DECLARATIONS as unknown as [] }],
  });

  /* `startChat` tient l'historique : le modèle doit se souvenir de « et son
     numéro ? » après « qui est Ouédraogo ». */
  const discussion = modele.startChat();

  return {
    async envoyer(question: string, surProgres?: (progres: Progres) => void) {
      const employes: string[] = [];
      let cumul = "";

      /**
       * Un tour en flux : le texte arrive par morceaux et part aussitôt à
       * l'écran.
       *
       * `cumul` traverse les tours sans être remis à zéro : quand le modèle
       * parle, lit un outil, puis reprend, les deux moitiés appartiennent à la
       * même réponse. L'effacer entre les deux ferait disparaître sous les yeux
       * ce qui venait d'être lu.
       */
      const tourEnFlux = async (envoi: Parameters<typeof discussion.sendMessageStream>[0]) => {
        const flux = await discussion.sendMessageStream(envoi);
        for await (const morceau of flux.stream) {
          const texte = morceau.text();
          if (!texte) continue;
          cumul += texte;
          surProgres?.({ quoi: "texte", texte: cumul });
        }
        return flux.response;
      };

      let reponse = { response: await tourEnFlux(question) };

      for (let tour = 0; tour < TOURS_MAX; tour += 1) {
        const appels = reponse.response.functionCalls() ?? [];
        if (appels.length === 0) break;

        surProgres?.({ quoi: "outils", noms: appels.map((appel) => appel.name) });

        /* Les gestes qui préparent une écriture remontent à l'écran. La même
           lecture pure sert deux fois — ici pour la carte, dans `executerOutil`
           pour ce que le modèle redit — plutôt qu'un aller-retour d'état entre
           les deux. */
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
  console.error("[assistant] échec brut :", cause);

  /* `401` autant que `403` : Firebase AI Logic rend 401 quand le jeton App
     Check manque, et 403 quand il est refusé. Le premier essai du
     commanditaire a rendu 401, que ce filtre ne reconnaissait pas. */
  if (/app-?check|40[13]|unauthorized|permission|appCheck/i.test(brut)) {
    /* Le refus le plus probable au premier essai, et le plus déroutant : tout
       le reste de l'application marche. */
    return "L’assistant n’est pas encore autorisé sur cet appareil (App Check). Voir la console du navigateur pour le détail.";
  }
  /* **Deux refus portent le même 429, et ils n'appellent pas le même geste.**
     Une limite de débit se dissipe en attendant ; des crédits épuisés, jamais.
     Dire « réessayez dans quelques minutes » à qui doit payer l'envoie
     attendre un retour qui n'arrivera pas — c'est la faute que ce commentaire
     existe pour empêcher de refaire. */
  if (/credits? (are )?depleted|billing|prepayment|out of credits/i.test(brut)) {
    return "Les crédits Gemini du projet sont épuisés. Rechargez la facturation du projet Firebase — attendre ne suffira pas.";
  }
  if (/quota|429|resource-exhausted|rate.?limit/i.test(brut)) {
    return "L’assistant a atteint sa limite d’appels pour le moment. Réessayez dans quelques minutes.";
  }
  if (/not.?enabled|disabled|SERVICE_DISABLED|has not been used|404/i.test(brut)) {
    /* L'API Gemini pas encore activée sur le projet : le cas du premier jour,
       et il n'a rien d'un problème de réseau. */
    return "L’API Gemini n’est pas activée sur ce projet Firebase. Console Firebase → AI Logic.";
  }
  /* « Hors ligne » ne s'affirme que si le navigateur le dit lui-même. Le
     déduire d'un `fetch` raté désignait le réseau pour toutes les pannes, et
     envoyait chercher un défaut là où il n'y en avait pas. */
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "L’assistant a besoin du réseau, et il est coupé. Le reste de l’application continue de fonctionner.";
  }
  return "L’assistant n’a pas répondu. Le détail est dans la console du navigateur (touche F12).";
}
