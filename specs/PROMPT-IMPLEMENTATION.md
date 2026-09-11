# Le prompt à coller dans une fenêtre neuve

*Copier tout ce qui est entre les deux lignes de tirets.*

---

Tu reprends SDI, l'application de gestion d'ETS Sandwidi et Frères (vente de
motos à Pouytenga, Burkina Faso). Le dépôt est à jour, l'arbre est propre, et
vingt-quatre lots sont livrés.

**Ta mission : exécuter `specs/CAHIER-DU-RESTE.md` en entier, de l'étape 1 à
l'étape 17, sans t'arrêter.** Ce fichier est le cahier des charges de la fin du
logiciel. Il a été écrit après une relecture complète de `prompt.md` contre le
code, il porte pour chaque étape le besoin, les arbitrages déjà tranchés, le
modèle de données, les règles Firestore, les écrans et ce qui prouve que c'est
fait. Lis-le en entier avant d'écrire une ligne.

## À lire d'abord, dans cet ordre

1. `AGENTS.md` — la façon de travailler, non négociable.
2. `specs/CAHIER-DU-RESTE.md` — ton plan, en entier.
3. `WORKFLOW.md`, `DESIGN.md`, `SECURITY.md`, `ARCHITECTURE.md` — les contrats.
4. `DECISIONS.md` — 95 décisions. Pas tout d'un coup : celles que le lot touche,
   et toujours D2, D50, D56, D61, D63, D73, D76, D79, D82, D84, D88, D92, D94, D95.
5. `CAHIER-UI.md` puis `maquettes/index.html` — chaque écran s'écrit avec sa
   maquette ouverte à côté du rendu, jamais de mémoire.
6. `prompt.md` — le cahier des charges d'origine, pour le détail métier.

## Le commanditaire s'absente

Il est le propriétaire de l'entreprise, pas un développeur. Il répond en
français et il tranche vite quand la question est bien posée. **Mais il ne sera
pas là.**

**Donc : pose toutes tes questions en une seule fois, dans ton premier message,
puis continue sans attendre.** Le §5 du cahier en contient huit, déjà formulées,
chacune avec sa recommandation et sa réponse par défaut. Reprends-les telles
quelles, ajoute celles que ta lecture fait naître, et **applique les réponses par
défaut** pour tout ce qui reste sans réponse. Chaque défaut est marqué comme tel
dans la spec du lot et se change en un commit.

Ne t'arrête jamais pour demander une confirmation. Les seules exceptions sont
celles d'`AGENTS.md` règle 6 : une suppression de données réelles, une migration,
un envoi massif. Il n'y en a aucune dans ce cahier.

## Comment tu travailles

Pour chaque étape, dans cet ordre — c'est ce qui a fonctionné vingt-quatre fois :

1. **La spec d'abord**, dans `specs/S<n>-<slug>.md`, au gabarit
   `SPEC.template.md`. Y recopier les arbitrages du cahier avec leur statut.
2. **Le domaine pur** — `lib/domain/`, sans Firestore, sans React, sans horloge.
   Un test par arbitrage, qui nomme l'arbitrage.
3. **Les règles Firestore**, avec leurs tests, **avant** l'écran. Un
   cloisonnement sans test de règles n'existe pas.
4. **Le dépôt**, puis **l'écran**, maquette ouverte à côté.
5. **Regarder le rendu** — `node scripts/captures.mjs`, clair et sombre, les deux
   rôles, mobile et bureau. Et vérifier que le semis écrit ce que le produit
   écrit (D84).
6. **Les tests bout en bout**, sur ce que le lot promet, pas sur ce qu'il
   affiche.
7. **Fermer** : la décision dans `DECISIONS.md`, la ligne dans
   `specs/ROADMAP.md`, la section « ce qui a été livré » dans la spec, la case
   cochée dans le cahier.

**Une branche par étape**, fusionnée en `--no-ff` dans `main` en local.

## Ce qui ne se fait pas

- **Aucune poussée**, ni sur `main` ni ailleurs. Une poussée sur `main` déclenche
  un déploiement en production sur Vercel. Le commanditaire poussera lui-même.
- **Aucun secret dans le dépôt.** `.env*` est gitignoré et le reste.
- **Aucun effacement de données.** Une correction est une contre-passation
  tracée (D10, D58).
- **Aucun échec de test écarté comme « flaky ».** Toujours *pourquoi*. C'est ce
  qui a trouvé D82, D84 et D95 — dont le dernier ressemblait trait pour trait à
  du bruit de contention et créait des doublons.

## Le piège qui coûte une demi-journée

```bash
cp .env.local.emulateurs .env.local   # avant tout
npm run emulators                      # terminal à part ; attendre « All emulators ready »
rm -rf .next                           # dev compile en Turbopack, build en webpack : les mélanger casse
npm run build                          # NEXT_PUBLIC_* est figé À LA COMPILATION
npm run test:e2e
rm .env.local                          # À LA FIN, toujours
```

`next dev` fige les `NEXT_PUBLIC_*` au démarrage : retirer `.env.local` ne suffit
pas, il faut redémarrer le serveur. Pour les tests de règles,
`npm run test:regles:isole`, qui démarre son propre émulateur — un harnais
`@firebase/rules-unit-testing` lancé contre l'émulateur partagé en écrase le jeu
de règles.

**Les émulateurs vieillissent.** Une suite complète prend 25 min sur des
émulateurs neufs et 90 min sur ceux du matin, avec deux à trois fois plus
d'échecs. Les redémarrer avant chaque passe complète. C'est l'objet de l'étape 2.

## Où tu en es

L'état de départ : `main`, arbre propre, 23 commits d'avance sur `origin/main`.
452 tests d'unité, 283 tests de règles, 24 tests de déclencheurs, lint sans
erreur. La suite bout en bout compte 97 tests et elle est bruitée — c'est connu,
mesuré, et c'est l'étape 2.

Commence par lire le cahier, puis pose tes questions, puis attaque l'étape 1.

---
