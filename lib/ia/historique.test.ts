import { beforeEach, describe, expect, it } from "vitest";

import {
  enregistrerDiscussion,
  lireDiscussions,
  nouvelleDiscussion,
  oublierDiscussion,
  oublierLesDiscussions,
  titreDe,
} from "./historique";

/* Un stockage local en mémoire : ces tests portent sur la logique, pas sur le
   navigateur, et un vrai `localStorage` les rendrait dépendants d'un
   environnement de test lourd. */
function poserStockage() {
  const donnees = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (cle: string) => donnees.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => void donnees.set(cle, valeur),
    removeItem: (cle: string) => void donnees.delete(cle),
    clear: () => donnees.clear(),
    /* `key` et `length` sont de vrais membres ici : `oublierLesDiscussions`
       parcourt le stockage par l'API standard, et un faux qui ne la sert pas
       ferait passer un test pour une raison étrangère au code. */
    key: (rang: number) => [...donnees.keys()][rang] ?? null,
    get length() {
      return donnees.size;
    },
  } as Storage;
  return donnees;
}

describe("le titre d'une discussion", () => {
  it("reprend la première question telle quelle quand elle est courte", () => {
    expect(titreDe("Qu’est-ce qu’on a en stock ?")).toBe("Qu’est-ce qu’on a en stock ?");
  });

  it("coupe au mot entier plutôt qu’au milieu", () => {
    const question =
      "Combien de motos avons-nous vendues ce mois-ci dans la boutique de Pouytenga exactement";
    const titre = titreDe(question);

    expect(titre.endsWith("…")).toBe(true);
    expect(titre.length).toBeLessThanOrEqual(62);

    /* **Le dernier mot n'est pas tronqué.** Dit autrement, et c'est ce qui se
       vérifie vraiment : le titre est un début exact de la question, et là où
       il s'arrête, la question avait une espace. « …dans la… » est donc bon,
       « …dans la bouti… » ne le serait pas. */
    const sansPoints = titre.slice(0, -1);
    expect(question.startsWith(sansPoints)).toBe(true);
    expect(question[sansPoints.length]).toBe(" ");
  });

  it("ne rend jamais un titre vide", () => {
    expect(titreDe("   ")).toBe("Sans titre");
  });
});

describe("les discussions gardées sur l’appareil", () => {
  beforeEach(() => poserStockage());

  it("relit ce qu’elle a écrit, de la plus récente à la plus ancienne", () => {
    enregistrerDiscussion("u1", {
      id: "a",
      titre: "Ancienne",
      quand: "2026-10-01T08:00:00.000Z",
      bulles: [{ de: "humain", texte: "salut" }],
    });
    enregistrerDiscussion("u1", {
      id: "b",
      titre: "Récente",
      quand: "2026-10-19T08:00:00.000Z",
      bulles: [{ de: "humain", texte: "stock ?" }],
    });
    expect(lireDiscussions("u1").map((discussion) => discussion.id)).toEqual(["b", "a"]);
  });

  it("n’enregistre pas une discussion sans échange", () => {
    /* On ouvre un « nouveau chat » bien plus souvent qu'on ne s'en sert : sans
       cette garde, la liste se remplit d'entrées vides. */
    enregistrerDiscussion("u1", nouvelleDiscussion());
    expect(lireDiscussions("u1")).toEqual([]);
  });

  it("remplace une discussion plutôt que de la dupliquer", () => {
    const base = {
      id: "a",
      titre: "T",
      quand: "2026-10-19T08:00:00.000Z",
      bulles: [{ de: "humain" as const, texte: "un" }],
    };
    enregistrerDiscussion("u1", base);
    enregistrerDiscussion("u1", { ...base, bulles: [...base.bulles, { de: "assistant", texte: "deux" }] });
    const relues = lireDiscussions("u1");
    expect(relues).toHaveLength(1);
    expect(relues[0].bulles).toHaveLength(2);
  });

  it("en oublie une sans toucher aux autres", () => {
    enregistrerDiscussion("u1", {
      id: "a",
      titre: "A",
      quand: "2026-10-19T08:00:00.000Z",
      bulles: [{ de: "humain", texte: "un" }],
    });
    enregistrerDiscussion("u1", {
      id: "b",
      titre: "B",
      quand: "2026-10-18T08:00:00.000Z",
      bulles: [{ de: "humain", texte: "deux" }],
    });
    oublierDiscussion("u1", "a");
    expect(lireDiscussions("u1").map((discussion) => discussion.id)).toEqual(["b"]);
  });

  it("ne garde que les vingt dernières", () => {
    for (let rang = 0; rang < 25; rang += 1) {
      enregistrerDiscussion("u1", {
        id: `d${rang}`,
        titre: `T${rang}`,
        quand: new Date(Date.UTC(2026, 9, 1, 0, rang)).toISOString(),
        bulles: [{ de: "humain", texte: "x" }],
      });
    }
    expect(lireDiscussions("u1")).toHaveLength(20);
  });

  it("survit à un stockage abîmé au lieu de faire tomber l’écran", () => {
    /* Le stockage local se modifie à la main et survit aux changements de
       format. Une entrée cassée doit coûter une discussion, jamais l'assistant
       entier. */
    const donnees = poserStockage();
    donnees.set("sdi.assistant.discussions.u1", "{ceci n’est pas du JSON");
    expect(lireDiscussions("u1")).toEqual([]);

    donnees.set("sdi.assistant.discussions.u1", JSON.stringify([{ nawak: true }, null, 42]));
    expect(lireDiscussions("u1")).toEqual([]);
  });

  it("ne montre jamais à un compte les discussions d’un autre", () => {
    /* **Le cas réel, et il n'a rien d'exotique.** Sur la tablette du comptoir,
       un gérant et le responsable se relaient toute la journée. Une clé commune
       aurait montré au suivant les questions du précédent — et une question cite
       des noms de clients, des montants, parfois une marge. Même raison, même
       remède que `lib/perimetre/memoire.ts`. */
    enregistrerDiscussion("gerant-1", {
      id: "a",
      titre: "Mes ventes",
      quand: "2026-10-19T08:00:00.000Z",
      bulles: [{ de: "humain", texte: "combien j’ai vendu ?" }],
    });
    expect(lireDiscussions("gerant-1")).toHaveLength(1);
    expect(lireDiscussions("responsable-1")).toEqual([]);
  });

  it("efface les discussions de tous les comptes à la déconnexion", () => {
    /* Tous, et pas seulement celui qui part : on rend la tablette, pas la
       session. */
    const bulles = [{ de: "humain" as const, texte: "x" }];
    enregistrerDiscussion("a", { id: "1", titre: "A", quand: "2026-10-19T08:00:00.000Z", bulles });
    enregistrerDiscussion("b", { id: "2", titre: "B", quand: "2026-10-19T08:00:00.000Z", bulles });

    oublierLesDiscussions();

    expect(lireDiscussions("a")).toEqual([]);
    expect(lireDiscussions("b")).toEqual([]);
  });

  it("ne garde rien sans identifiant de compte", () => {
    enregistrerDiscussion("", {
      id: "x",
      titre: "X",
      quand: "2026-10-19T08:00:00.000Z",
      bulles: [{ de: "humain", texte: "x" }],
    });
    expect(lireDiscussions("")).toEqual([]);
  });

  it("donne un identifiant différent à chaque nouvelle discussion", () => {
    expect(nouvelleDiscussion().id).not.toBe(nouvelleDiscussion().id);
  });
});
