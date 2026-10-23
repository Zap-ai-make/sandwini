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
 *
 * **La clé porte l'identifiant du compte**, comme celle du périmètre
 * (`lib/perimetre/memoire.ts`), et pour la même raison : sur la tablette du
 * comptoir, deux personnes se relaient toute la journée. Une clé commune aurait
 * montré au suivant les questions du précédent — et une question cite des noms
 * de clients, des montants, parfois une marge. La déconnexion efface tout,
 * comme elle efface déjà le cache Firestore.
 */

export type Bulle = {
  de: "humain" | "assistant";
  texte: string;
  outils?: string[];
  /**
   * Ce qui accompagnait la question — **une étiquette, jamais le contenu**.
   *
   * Une photo réduite pèse quelques centaines de kilooctets en base64. Vingt
   * discussions en garderaient plusieurs mégaoctets, c'est-à-dire au-delà du
   * quota de `localStorage` : l'écriture échouerait, et c'est tout l'historique
   * qui disparaîtrait pour une photo de trop.
   */
  jointes?: ("photo" | "voix")[];
};

export type Discussion = {
  id: string;
  /** La première question, raccourcie : c'est ce qui se reconnaît dans une liste. */
  titre: string;
  /** ISO, pour trier sans ambiguïté de fuseau. */
  quand: string;
  bulles: Bulle[];
};

const PREFIXE = "sdi.assistant.discussions.";

const cle = (uid: string) => `${PREFIXE}${uid}`;

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
export function lireDiscussions(uid: string): Discussion[] {
  if (typeof localStorage === "undefined" || !uid) return [];
  try {
    const brut = JSON.parse(localStorage.getItem(cle(uid)) ?? "[]");
    if (!Array.isArray(brut)) return [];
    return brut.filter(estDiscussion).sort((a, b) => b.quand.localeCompare(a.quand));
  } catch {
    return [];
  }
}

/* --- L'historique vu comme une source extérieure --------------------------
   Le stockage local est une source de vérité qui vit hors de React. Le lire
   dans un effet et le recopier dans un état obligeait à resynchroniser les
   deux à la main — et c'est exactement ce que le compilateur React refuse, à
   raison : un `setState` dans un effet déclenche un second rendu pour une
   donnée qui était déjà là.

   `useSyncExternalStore` demande un instantané **stable** : rendre un tableau
   neuf à chaque appel ferait boucler le rendu. D'où le cache, invalidé par les
   seules fonctions qui écrivent. */

const ecouteurs = new Set<() => void>();
let cache: { uid: string; discussions: Discussion[] } | null = null;

function signalerChangement(): void {
  cache = null;
  for (const ecouteur of ecouteurs) ecouteur();
}

export function souscrireAuxDiscussions(ecouteur: () => void): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

/** Le même tableau tant que rien n'a été écrit — c'est ce que React exige. */
export function instantaneDesDiscussions(uid: string): Discussion[] {
  if (cache === null || cache.uid !== uid) {
    cache = { uid, discussions: lireDiscussions(uid) };
  }
  return cache.discussions;
}

/** Côté serveur, il n'y a pas de stockage local : la liste est vide, et stable. */
export const AUCUNE_DISCUSSION: Discussion[] = [];

export function enregistrerDiscussion(uid: string, discussion: Discussion): void {
  if (typeof localStorage === "undefined" || !uid) return;
  /* Une discussion sans échange n'a rien à montrer dans une liste : on ouvre un
     « nouveau chat » bien plus souvent qu'on ne s'en sert. */
  if (discussion.bulles.length === 0) return;
  const gardees = [
    discussion,
    ...lireDiscussions(uid).filter((autre) => autre.id !== discussion.id),
  ]
    .sort((a, b) => b.quand.localeCompare(a.quand))
    .slice(0, GARDEES);
  try {
    localStorage.setItem(cle(uid), JSON.stringify(gardees));
  } catch {
    /* Quota dépassé : l'historique est un confort, et le perdre ne doit pas
       empêcher de poser la question suivante. */
  }
  signalerChangement();
}

export function oublierDiscussion(uid: string, id: string): void {
  if (typeof localStorage === "undefined" || !uid) return;
  const restantes = lireDiscussions(uid).filter((discussion) => discussion.id !== id);
  try {
    localStorage.setItem(cle(uid), JSON.stringify(restantes));
  } catch {
    /* Même raison que ci-dessus. */
  }
  signalerChangement();
}

/**
 * Efface les discussions de **tous** les comptes de cet appareil.
 *
 * Appelée à la déconnexion, à côté de `oublierPerimetres`. Tous les comptes et
 * pas seulement celui qui part : c'est la tablette qu'on rend, pas la session.
 * Quelqu'un qui se déconnecte au comptoir le fait en général parce qu'un autre
 * va s'en servir.
 */
export function oublierLesDiscussions(): void {
  if (typeof localStorage === "undefined") return;
  try {
    /* `length` et `key(i)` plutôt que `Object.keys` : c'est l'API que la norme
       définit pour parcourir un stockage, et la seule qui marche partout.
       Relevées d'abord, effacées ensuite — retirer pendant qu'on parcourt
       décale les index et en saute une sur deux. */
    const aEffacer: string[] = [];
    for (let rang = 0; rang < localStorage.length; rang += 1) {
      const nom = localStorage.key(rang);
      if (nom?.startsWith(PREFIXE)) aEffacer.push(nom);
    }
    for (const nom of aEffacer) localStorage.removeItem(nom);
    signalerChangement();
  } catch {
    /* Navigation privée, quota : ne jamais empêcher une déconnexion. */
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
