"use client";

import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { getApp } from "firebase/app";

import { DECLARATIONS, executerOutil, type ContexteOutils } from "./outils";
import { promptSysteme, type QuiParle } from "./prompt";

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
 * Le nombre d'allers-retours d'outils qu'un tour s'autorise.
 *
 * Sans plafond, un modèle qui boucle sur un outil en erreur consommerait des
 * jetons jusqu'à épuisement — et la facture est réelle. Cinq suffisent
 * largement : chercher un client, lire ses ventes, répondre.
 */
const TOURS_MAX = 5;

export type Tour = { de: "humain" | "assistant"; texte: string };

export type Conversation = {
  /** Rend le texte de la réponse, et la liste des outils réellement employés. */
  envoyer: (question: string) => Promise<{ texte: string; outils: string[] }>;
};

export function ouvrirConversation(quiParle: QuiParle, contexte: ContexteOutils): Conversation {
  const ia = getAI(getApp(), { backend: new GoogleAIBackend() });
  const modele = getGenerativeModel(ia, {
    model: MODELE,
    systemInstruction: promptSysteme(quiParle),
    tools: [{ functionDeclarations: DECLARATIONS as unknown as [] }],
  });

  /* `startChat` tient l'historique : le modèle doit se souvenir de « et son
     numéro ? » après « qui est Ouédraogo ». */
  const discussion = modele.startChat();

  return {
    async envoyer(question: string) {
      const employes: string[] = [];
      let reponse = await discussion.sendMessage(question);

      for (let tour = 0; tour < TOURS_MAX; tour += 1) {
        const appels = reponse.response.functionCalls() ?? [];
        if (appels.length === 0) break;

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

        reponse = await discussion.sendMessage(resultats);
      }

      const texte = reponse.response.text().trim();
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

  if (/app-?check|403|unauthorized|permission|appCheck/i.test(brut)) {
    /* Le refus le plus probable au premier essai, et le plus déroutant : tout
       le reste de l'application marche. */
    return "L’assistant n’est pas encore autorisé sur cet appareil (App Check). Voir la console du navigateur pour le détail.";
  }
  if (/quota|429|resource-exhausted/i.test(brut)) {
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
