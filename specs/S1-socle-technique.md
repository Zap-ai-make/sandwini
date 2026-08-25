# S1 — Socle technique et coquille applicative

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : aucune
```

---

## Objectif

Un gérant ouvre l'application sur son téléphone, l'installe depuis le navigateur, et voit une coquille
qui s'affiche même quand le réseau est coupé, avec un indicateur qui lui dit franchement s'il est en
ligne et combien de saisies attendent d'être envoyées.

---

## Critères d'acceptation

- [x] `npm install && npm run dev` démarre l'application ; `npm run emulators` démarre Auth, Firestore et Storage en local (D3). **Écart : l'émulateur Functions arrive avec S2, qui apporte la première fonction — cf. D21.**
- [x] `npm test` exécute Vitest et les tests de règles Firestore ; `npm run test:e2e` exécute Playwright (D13)
- [x] L'application est installable : manifeste valide, icônes 192/512 + maskable, service worker enregistré
- [x] Rechargée hors ligne, l'application affiche sa coquille — pas une page d'erreur du navigateur
- [x] La persistance Firestore hors ligne est active (`persistentLocalCache`, multi-onglets)
- [x] Un indicateur d'état réseau est visible en permanence et distingue trois états : à jour / envoi en cours / hors ligne, avec le nombre d'écritures en attente
- [x] Une écriture faite hors ligne apparaît immédiatement dans l'interface et part d'elle-même au retour du réseau — vérifié par un test Playwright qui coupe le réseau
- [x] La navigation principale est utilisable à une main sur un écran de 360 px — vérifié : 5 entrées, hauteur ≥ 44 px, aucun débordement horizontal
- [x] Toute l'interface est en français ; les montants s'affichent en FCFA entiers via `Intl.NumberFormat`
- [x] En-têtes de sécurité posés, CSP incluse (`SECURITY.md` §6)
- [x] `.gitignore` couvre `.env*` ; un `.env.example` sans valeurs est versionné (`SECURITY.md` §2)

**Vérification :** 19 tests unitaires, 11 tests de règles, 7 tests bout en bout. Rendu regardé en
clair et en sombre, mobile et bureau, en ligne et hors ligne (`captures/`).

---

## Hors périmètre

Aucun écran métier, aucune donnée réelle. Pas de tableau de bord chiffré (S24) : l'accueil se contente
de mener aux espaces. Pas de connexion (S2) — la coquille est visible sans auth à ce stade.

---

## Notes techniques

Next.js 16 (App Router) + Tailwind v4, TypeScript strict. Structure de dossiers conforme à
`prompt.md` §3.1.

Le service worker (Serwist) ne s'occupe que de la coquille ; Firestore tient seul le cache des
données et la file d'écritures. Doubler ce travail produirait deux caches qui se contredisent.

**Ce que la vérification a fait remonter, et qui valait le détour :**

1. La CSP de production bloquait les émulateurs, parce qu'elle se liait à `NODE_ENV` plutôt qu'au
   drapeau « on parle aux émulateurs ». Les tests bout en bout tournant sur un build de production,
   l'écriture hors-ligne échouait en `auth/network-request-failed`. Corrigé — et c'est exactement le
   genre de panne qu'un test qui « compile » n'aurait jamais montrée.
2. La navigation s'affichait **en haut** sur téléphone : premier enfant d'un `flex-col`, son
   `bottom-0` ne servait à rien. Vu à la capture, pas au code.
3. En mode sombre, l'inversion des tokens rendait le texte illisible **sur la plaque jaune**. La
   plaque est une surface de couleur fixe, pas une surface d'interface : d'où `--color-encre-fixe`
   et `--color-plaque-bord`, qui ne basculent jamais.

Limite connue de l'indicateur réseau : `navigator.onLine` ment sur une connexion sans Internet réel.
Le compteur d'écritures, lui, ne ment pas. Amélioration prévue en S3 — cf. D20.

---

Spec terminée : critères cochés, code vérifié (tests + rendu), revue des trois contrats passée,
commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
