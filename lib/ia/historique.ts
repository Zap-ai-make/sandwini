/**
 * Les discussions passées, gardées **sur l'appareil**.
 *
 * **Pourquoi pas Firestore.** Une discussion n'est pas une pièce comptable :
 * rien de ce qui s'y dit n'engage l'entreprise, et les chiffres qu'elle cite
 * vivent déjà dans les écrans. L'écrire en base créerait un second endroit où
 * lire des montants — la divergence la plus pénible à diagnostiquer — plus une
 * collection, des règles, et des quotas de lecture pour du bavardage.
 *
 * **Conséquence assumée, et à dire à l'utilisateur** : l'historique ne suit pas
 * d'un téléphone à l'autre, et il part avec le cache du navigateur. C'est le
 * bon compromis pour ce qu'il contient.
 */

export type Bulle = { de: "humain" | "assistant"; texte: string; outils?: string[] };

export type Discussion = {
  id: string;
  /** La première question, raccourcie : c'est ce qui se reconnaît dans une liste. */
  titre: string;
  /** ISO, pour trier sans ambiguïté de fuseau. */
  quand: string;
  bulles: Bulle[];
};

const CLE = "sdi.assistant.discussions";

/** Au-delà, les plus anciennes tombent : le stockage local est petit et partagé. */
const GARDEES = 20;

const LONGUEUR_TITRE = 60;

export function titreDe(question: string): string {
  const propre = question.trim().replace(/\s+/g, " ");
  if (propre === "") return "Sans titre";
  if (propre.length <= LONGUEUR_TITRE) return propre;
  /* Couper au dernier mot entier : « Qu'est-ce qu'on a en sto… » se lit, pas
     « Qu'est-ce qu'on a en s… ». */
  const coupe = propre.slice(0, LONGUEUR_TITRE);
  const espace = coupe.lastIndexOf(" ");
  return `${espace > 20 ? coupe.slice(0, espace) : coupe}…`;
}

/** Vrai quand une valeur relue a bien la forme d'une discussion. */
function estDiscussion(valeur: unknown): valeur is Discussion {
  const candidat = valeur as Discussion;
  return (
    typeof candidat?.id === "string" &&
    typeof candidat?.titre === "string" &&
    typeof candidat?.quand === "string" &&
    Array.isArray(candidat?.bulles) &&
    candidat.bulles.every(
      (bulle) =>
        (bulle?.de === "humain" || bulle?.de === "assistant") && typeof bulle?.texte === "string",
    )
  );
}

/**
 * Relit les discussions, et ne fait jamais tomber l'écran.
 *
 * Le stockage local est modifiable à la main et survit aux changements de
 * format : une entrée abîmée doit coûter une discussion perdue, jamais un
 * assistant qui refuse de s'ouvrir.
 */
export function lireDiscussions(): Discussion[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "[]");
    if (!Array.isArray(brut)) return [];
    return brut.filter(estDiscussion).sort((a, b) => b.quand.localeCompare(a.quand));
  } catch {
    return [];
  }
}

export function enregistrerDiscussion(discussion: Discussion): void {
  if (typeof localStorage === "undefined") return;
  /* Une discussion sans échange n'a rien à montrer dans une liste : on ouvre un
     « nouveau chat » bien plus souvent qu'on ne s'en sert. */
  if (discussion.bulles.length === 0) return;
  const gardees = [discussion, ...lireDiscussions().filter((autre) => autre.id !== discussion.id)]
    .sort((a, b) => b.quand.localeCompare(a.quand))
    .slice(0, GARDEES);
  try {
    localStorage.setItem(CLE, JSON.stringify(gardees));
  } catch {
    /* Quota dépassé : l'historique est un confort, et le perdre ne doit pas
       empêcher de poser la question suivante. */
  }
}

export function oublierDiscussion(id: string): void {
  if (typeof localStorage === "undefined") return;
  const restantes = lireDiscussions().filter((discussion) => discussion.id !== id);
  try {
    localStorage.setItem(CLE, JSON.stringify(restantes));
  } catch {
    /* Même raison que ci-dessus. */
  }
}

export function nouvelleDiscussion(): Discussion {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `d-${Date.now()}`,
    titre: "Nouvelle discussion",
    quand: new Date().toISOString(),
    bulles: [],
  };
}
