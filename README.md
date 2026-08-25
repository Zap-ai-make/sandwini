# SDI — Gestion

Application de gestion pour **SDI (Sandwidi et frère)**, commerce multi-boutique de vente de motos :
ventes, paiements échelonnés, dossiers administratifs (quittance, CMC, carte grise, plaque) et pièces
détachées.

Elle est conçue pour être utilisée debout, au comptoir, sur un téléphone Android bon marché, **sans
réseau**. Ce n'est pas une option de confort : chaque écran de saisie doit fonctionner hors ligne.

- Le cahier des charges fait foi : [`prompt.md`](prompt.md).
- La progression et le découpage : [`specs/ROADMAP.md`](specs/ROADMAP.md).
- Les choix tranchés et leurs raisons : [`DECISIONS.md`](DECISIONS.md).
- Les règles de travail : [`AGENTS.md`](AGENTS.md).

---

## Démarrer de zéro

Prérequis : **Node 22+** et un **JDK 17+** (l'émulateur Firestore tourne sur la JVM).

```bash
npm install
cp .env.example .env.local        # aucune valeur secrète : les émulateurs suffisent
npm run emulators                 # dans un premier terminal (compile aussi les Cloud Functions)
npm run amorcer                   # crée le compte responsable initial
npm run dev                       # dans un troisième, puis http://localhost:3000
```

Se connecter avec **responsable@sdi.test** / **responsable-sdi-2026**. Ce compte n'existe que sur les
émulateurs&nbsp;: `scripts/amorcer.mjs` refuse de s'exécuter ailleurs. En production, le premier
responsable se crée une fois depuis la console Firebase.

Aucun compte Firebase n'est nécessaire pour développer : tout tourne sur la Firebase Emulator Suite
en local (cf. `DECISIONS.md` D3).

**Les ports des émulateurs sont propres à ce projet** — Firestore 8181, Auth 9399, Storage 9599,
interface 4100 — parce que les ports par défaut entrent en conflit avec d'autres projets Firebase sur
la même machine (D18). Ils sont déclarés dans `firebase.json` et repris dans `lib/firebase/client.ts`.

---

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm run dev` | Serveur de développement. Le service worker y est désactivé (cf. plus bas). |
| `npm run build` | Build de production, service worker compris. |
| `npm start` | Sert le build de production. |
| `npm run emulators` | Auth, Firestore et Storage en local. |
| `npm run test:unite` | Logique métier pure (Vitest). |
| `npm run test:regles` | Règles Firestore. **Demande les émulateurs déjà démarrés.** |
| `npm run test:regles:isole` | Idem, mais démarre son propre émulateur. Pour une machine vierge ou la CI — échoue si un émulateur occupe déjà le port. |
| `npm test` | Les tests unitaires et les règles. |
| `npm run test:e2e` | Playwright, **dont la vérification hors-ligne**. Demande un build à jour ; sert le build sur le port 3100, sans toucher à votre `npm run dev`. |
| `npm run lint` | ESLint. |
| `npm run icones` | Régénère les icônes PWA depuis leur source SVG. |
| `npm run amorcer` | Crée le compte responsable initial sur les émulateurs. |
| `npm run build:functions` | Compile les Cloud Functions seules. |

### Vérifier le hors-ligne

C'est la propriété la plus importante du produit, et elle ne se vérifie que sur un build réel : en
développement le service worker est désactivé, parce qu'un cache actif complique le rechargement sans
rien apprendre.

```bash
npm run build && npm run test:e2e
```

À la main, l'écran **Réglages → Vérifier la synchronisation** (`/diagnostic`) écrit un document sans
importance et montre son trajet : accepté sur l'appareil tout de suite, confirmé par le serveur plus
tard. Coupez le réseau et regardez le bandeau.

---

## Comment le code est rangé

```
app/
  (app)/          écrans authentifiés — coquille commune, navigation, bandeau d'état
  hors-ligne/     page de repli du service worker
  sw.ts           service worker (Serwist)
lib/
  domain/         types, calculs et règles métier — purs, testés, sans Firestore
  firebase/       initialisation du SDK, connexion aux émulateurs
  auth/           session, rôle courant, déconnexion
  reseau/         état réseau et compteur d'écritures en attente
  repositories/   accès Firestore
components/       composants d'interface partagés
functions/        Cloud Functions (création de comptes, activation)
regles/           tests des règles Firestore
e2e/              tests Playwright
scripts/          génération d'icônes, captures de revue visuelle
```

Deux règles qui expliquent la plupart des choix :

1. **Les écritures passent par le SDK Firestore, jamais par une Cloud Function appelée depuis un
   écran de saisie.** C'est ce qui permet à la file d'attente hors-ligne de fonctionner.
2. **Les coûts et les marges vivent dans des sous-collections `prive/`.** Firestore ne sait pas
   masquer un champ : un document lisible est lisible en entier (D2).

---

## Direction visuelle

Fixée avant le premier écran, elle est décrite en tête de [`app/globals.css`](app/globals.css). En
résumé : la palette vient de la **plaque d'immatriculation** — encre noire sur jaune — qui est
l'objet que ce logiciel passe sa vie à suivre. Le blanc pur remplace le crème parce que l'écran se
lit en plein soleil.

La signature du produit est le **bandeau d'état** : discret quand tout est envoyé, plaque jaune
pleine dès que le réseau tombe.

`npm run build && npm start`, puis `node scripts/captures.mjs` produit les captures de revue dans
`captures/` (clair, sombre, mobile, bureau, hors ligne).

---

## Sécurité

- Aucun secret dans le dépôt. Les valeurs `NEXT_PUBLIC_FIREBASE_*` ne sont pas des secrets : elles
  partent dans le navigateur. **La protection réelle des données, ce sont les règles Firestore**, et
  chaque règle est couverte par un test dans `regles/`.
- Refus par défaut dans `firestore.rules` : un utilisateur non authentifié n'a aucun accès direct.
- Les pages publiques client et prestataire (S13, S15) passeront par l'Admin SDK côté serveur, jamais
  par une ouverture des règles.
- **Le rôle vit dans un custom claim**, jamais dans un document modifiable. Personne n'écrit dans
  `users/{uid}` depuis un navigateur — pas même le responsable ; seules les Cloud Functions y
  touchent. C'est ce qui rend structurellement impossible de se promouvoir soi-même.
- Les écrans réservés au responsable sont refusés par les **règles Firestore** et par la vérification
  du rôle dans les Cloud Functions, pas par une session serveur — qui imposerait un aller-retour
  réseau à chaque navigation et casserait le hors-ligne (D27).
- Le contrat complet : [`SECURITY.md`](SECURITY.md).

---

## Deux contraintes d'outillage à connaître

- **Le build passe explicitement par webpack** (`next build --webpack`). Serwist génère le service
  worker via un plugin webpack, que Turbopack — défaut de Next 16 — ne supporte pas encore (D19).
  En développement, Serwist n'est pas appelé du tout : sa seule présence dans la configuration
  empêchait `npm run dev` de démarrer.
- **`agentRules: false`** dans `next.config.ts` : sans cela, `next dev` réécrit un bloc de consignes
  dans `AGENTS.md` à chaque démarrage. Ce fichier se tient à la main (D22).
- **`firebase-tools` traîne 5 vulnérabilités modérées** signalées par `npm audit`. Elles sont
  cantonnées à l'outillage de développement et absentes de l'arbre de production, vérifié par nom
  exact ; la CLI est déjà en dernière version (D17).
