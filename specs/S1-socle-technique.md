# S1 — Socle technique et coquille applicative

```
Statut     : à faire
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

- [ ] `npm install && npm run dev` démarre l'application ; `npm run emulators` démarre Auth, Firestore, Storage et Functions en local (D3)
- [ ] `npm test` exécute Vitest et les tests de règles Firestore ; `npm run test:e2e` exécute Playwright (D13)
- [ ] L'application est installable : manifeste valide, icônes, service worker enregistré, elle s'ouvre depuis l'écran d'accueil Android et iOS
- [ ] Rechargée hors ligne, l'application affiche sa coquille et la dernière donnée connue — pas une page d'erreur du navigateur
- [ ] La persistance Firestore hors ligne est active (`persistentLocalCache`, multi-onglets)
- [ ] Un indicateur d'état réseau est visible en permanence et distingue trois états : en ligne / hors ligne / synchronisation en cours, avec le nombre d'écritures en attente
- [ ] Une écriture faite hors ligne apparaît immédiatement dans l'interface et part d'elle-même au retour du réseau — vérifié par un test Playwright qui coupe le réseau
- [ ] La navigation principale (espaces, paramètres, déconnexion) est utilisable à une main sur un écran de 360 px
- [ ] Toute l'interface est en français ; les montants s'affichent en FCFA entiers via `Intl.NumberFormat`
- [ ] En-têtes de sécurité posés, CSP incluse (`SECURITY.md` §6)
- [ ] `.gitignore` couvre `.env*` ; un `.env.example` sans valeurs est versionné (`SECURITY.md` §2)

---

## Hors périmètre

Aucun écran métier, aucune donnée réelle. Pas de tableau de bord chiffré (S24) : l'accueil se contente
de mener aux espaces. Pas de connexion (S2) — la coquille est visible sans auth à ce stade.

---

## Notes techniques

Next.js App Router + Tailwind, TypeScript strict. Structure de dossiers imposée par `prompt.md` §3.1 :
`lib/firebase` (init client et admin séparés), `lib/domain` (types, enums, calculs purs et testés),
`lib/repositories` (accès Firestore), `components`.

Le service worker doit servir la coquille hors ligne sans jamais mettre en cache une réponse
authentifiée. Firestore gère seul le cache des données — le service worker ne double pas ce travail.

Point de vigilance : la persistance multi-onglets et le service worker se marchent parfois dessus.
Vérifier explicitement le scénario « deux onglets ouverts, réseau coupé ».

Formatage des montants et des dates centralisé dès maintenant dans `lib/domain` — c'est le genre
d'utilitaire qui se duplique en dix exemplaires si on ne le pose pas tôt (`ARCHITECTURE.md` §2).
