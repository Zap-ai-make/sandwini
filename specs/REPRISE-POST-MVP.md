# Reprise — implémenter le post-MVP de SDI

*Ce fichier est un brief de démarrage pour une session neuve. Il ne remplace
aucun document : il dit quoi lire, dans quel ordre, ce qui est déjà fait, et où
sont les pièges qui coûtent une journée si on les redécouvre.*

---

## 1. Ce qu'est ce produit

SDI est l'application de gestion d'un concessionnaire de motos à Pouytenga
(Burkina Faso), tenu par **ETS Sandwidi et Frères** : plusieurs boutiques, des
ventes au comptant / à crédit / en tranches, des versements, et le suivi des
dossiers administratifs de chaque moto. Next.js 16, TypeScript strict, Tailwind
v4, Firebase, PWA. **Tout est en français**, y compris les noms de variables et
de fonctions. Les montants sont des entiers en FCFA — aucune décimale, jamais.

La promesse centrale : **enregistrer une vente au comptoir sans réseau, savoir
ce qui reste dû, savoir où en est chaque document.** Le reste sert cette
promesse ou attend.

---

## 2. À lire avant d'écrire une ligne, dans cet ordre

1. `AGENTS.md` — la façon de travailler. Non négociable.
2. `WORKFLOW.md` — comment un lot naît, se vérifie et se ferme.
3. `DESIGN.md` — les règles visuelles. §5 en particulier : **jamais la couleur
   seule**.
4. `SECURITY.md` — §0 surtout : exposer le moins.
5. `ARCHITECTURE.md` — §1 : l'échelle 1, ne pas construire pour un appelant
   imaginaire.
6. `CAHIER-UI.md` puis `maquettes/index.html` — les maquettes validées par le
   commanditaire. Chaque écran s'écrit **avec sa maquette ouverte à côté du
   rendu**, pas de mémoire.
7. `DECISIONS.md` — 84 décisions. Ne pas tout lire d'un coup ; lire celles que
   le lot touche, et **toujours** D2, D50, D61, D63, D73, D76, D77, D82, D83,
   D84.
8. `specs/ROADMAP.md` — la source de vérité de la progression. C'est là qu'on
   voit ce qui reste.
9. `prompt.md` — le cahier des charges d'origine. §17 liste des points encore
   ouverts avec le responsable.

---

## 3. Où en est le produit

**Le MVP est livré** (S1 à S12, plus S3bis) : socle, authentification et rôles,
boutiques et périmètre, référentiels, stock motos, clients, numérotation
hors-ligne, vente, versements, reçus imprimables, dossiers documents, règles
Firestore durcies.

**La refonte d'interface est livrée** (S28, S29, S31) : jetons, coquille,
patrons, les neuf écrans, puis la mise en conformité avec les maquettes.

**Deux lots post-MVP sont livrés** : S24 (les chiffres de la supervision) et
S22 (la caisse — journal du jour et clôture).

**Les branches** : `main` porte tout jusqu'à S24 inclus et se déploie en
production sur Vercel à chaque poussée. `feat/S22-caisse` attend la décision du
commanditaire (voir §6).

Pour voir précisément ce qui reste : le tableau **« Backlog post-MVP, ordonné
par valeur »** de `specs/ROADMAP.md`.

---

## 4. Les règles de travail qui ne se devinent pas

**Travailler sur une branche, jamais sur `main`.** Une poussée sur `main`
déclenche un déploiement en production. Ça s'est déjà produit par inadvertance ;
c'est rattrapable, mais ça ne doit pas arriver.

**TERMINÉ = VÉRIFIÉ.** Code exécuté, tests lancés, **rendu regardé**. Un écran
qui compile n'est pas un écran fini. Les captures Playwright se rangent dans
`captures/` (gitignoré) et se regardent vraiment.

**Un échec bout en bout s'explique avant d'être écarté.** Jamais « c'est
flaky », toujours *pourquoi*. C'est ce qui a trouvé D82 et D84.

**Ce qui ne se décide pas seul** : tout arbitrage qui change ce que les données
*veulent dire*. On pose les questions dans la spec, avant la première ligne de
code, avec une recommandation pour chacune. Les réponses prises par défaut sont
marquées comme telles et chacune se change en un commit.

**Une correction fonctionnelle trouvée en chemin devient une entrée de backlog**,
pas du code immédiat — sauf si elle est dans le lot en cours.

### Le piège des émulateurs, qui coûte une demi-journée

```bash
cp .env.local.emulateurs .env.local   # avant tout
npm run emulators                      # terminal à part ; attendre 8181/9399/9599
npm run build                          # NEXT_PUBLIC_* est figé À LA COMPILATION
npm run test:e2e
rm .env.local                          # À LA FIN, toujours
```

`next dev` fige les `NEXT_PUBLIC_*` au démarrage : retirer `.env.local` ne suffit
pas, il faut **redémarrer le serveur**, sinon l'application continue de parler
aux émulateurs et refuse le compte réel sans dire pourquoi.

Un harnais `@firebase/rules-unit-testing` lancé contre l'émulateur partagé **en
écrase le jeu de règles**. Pour les tests de règles, utiliser
`npm run test:regles:isole`, qui démarre son propre émulateur.

Les tests bout en bout ne visent **jamais** le vrai projet : ils créent et
effacent boutiques, motos et ventes.

---

## 5. Les leçons déjà payées — ne pas les réapprendre

| Décision | Ce qu'elle évite |
|---|---|
| **D50 / S27** | La suite bout en bout est bruitée par la contention de la file d'écritures Firestore, pas par des défauts. Mesuré : un test qui échoue en suite chargée passe en **7,1 s lancé seul**. Rejouer avant de conclure, et expliquer chaque échec. |
| **D61** | Rien ne se recalcule par déclencheur si ça peut se calculer à la lecture : un agrégat entretenu diverge et ment hors ligne. |
| **D63** | Aucune carte à zéro. Un mois vide s'écrit en une phrase. |
| **D73** | Dédupliquer ce qui répond à la même question — **pour le même lecteur** (D78 pose la nuance). |
| **D76** | Un geste au comptoir n'attend jamais l'accusé de réception du serveur. |
| **D77** | La feuille d'impression se défait par le thème sombre **système** (`:root:not([data-theme="clair"])`), pas seulement par la bascule explicite. Quatre sélecteurs, toujours. |
| **D79** | Un test de régression se vérifie **dans les deux sens** : il doit échouer sur l'ancien code. |
| **D80** | La largeur d'un champ appartient à la mise en page. Lever une borne globale se paie par une mesure, pas par une relecture. |
| **D82** | `getDoc` lève `unavailable` quand le document n'est pas en cache et que la connexion est encombrée — l'état ordinaire après une vente. Un échec de lecture n'est pas une réponse : passer la main à une écoute. |
| **D84** | **Un semis qui n'écrit pas ce que le produit écrit ne vérifie rien.** Se copier sur le code d'écriture, jamais sur la maquette. Confronter un écran à sa maquette ne remplace pas de le confronter à ses données. |

---

## 6. Ce qui attend une réponse du commanditaire

**Ces questions bloquent ou orientent du travail. Les poser tôt.**

1. **La clôture de caisse a-t-elle un sens chez lui ?** Il a dit, après
   livraison : *« je ne comprends même pas ce qu'est une clôture, il n'y a rien
   à clôturer »*. Trois lectures — personne ne compte le tiroir ; l'argent ne
   dort pas au magasin et ce qu'il faudrait est une *remise* ; ou l'habitude
   n'existe pas encore. **Le journal du jour vaut dans les trois cas ; la
   clôture ne vaut que si quelqu'un compte.** La retirer = cacher un panneau,
   le domaine et les règles restent. `feat/S22-caisse` n'est pas fusionnée pour
   cette raison.
2. **L'ouverture de caisse** (`c2` dit « ouverte à 08:00 par… »). Aucun
   événement d'ouverture n'existe dans le modèle. En ajouter un changerait aussi
   le report du fonds.
3. Les points ouverts de `prompt.md` §17 encore sans réponse : l'ordre CMC /
   carte grise, qui crée les motos en stock, l'annulation de vente, les mentions
   légales sur les factures.

---

## 7. Le backlog, dans l'ordre de valeur

L'ordre est celui de `specs/ROADMAP.md`, qui fait foi. Ce qui suit ajoute ce
qu'on sait déjà de chaque lot.

### S13 + S14 — Lien de suivi client, puis messages WhatsApp
Le différenciateur vis-à-vis du client : il suit son dossier depuis son
téléphone, sans compte. `tokenSuivi` **existe déjà** sur chaque vente (43
caractères, base64url, écrit par S8). Chantier sensible : c'est la première page
**publique** du produit, lue sans authentification. Les règles Firestore n'ont
aujourd'hui aucun chemin ouvert à un visiteur anonyme — en ouvrir un demande de
la prudence et des tests dédiés. S14 dépend de S13 : sans lien, il n'y a presque
rien à envoyer.

### S25 — Annulation et correction d'une vente ou d'un versement
Aujourd'hui **une vente saisie de travers reste de travers pour toujours**.
L'erreur de saisie est une certitude, pas un risque. Opération sensible : lire
D10 et D58 avant de commencer. Un versement ne se modifie ni ne se supprime,
pour personne — la correction passe donc par une **contre-passation tracée**,
et les règles de `encaissements` l'annoncent déjà en commentaire. Demander
au commanditaire : qui a le droit, et la moto revient-elle en stock ?

### S20 + S21 — Pièces détachées
Un second métier entier. L'espace existe déjà en coquille
(`app/(app)/pieces/`), le métier `pieces` est porté par la boutique (D62), et la
maquette est `c1-pieces.html`. S21 (vente au comptoir) écrit des mouvements de
caisse `origine: 'vente_piece'` — que le journal de S22 affichera **sans aucun
changement**, l'entrée est déjà prévue.

### S23 — Inventaires
Exercice périodique. Dépend de S5 et S20.

### S15, S16, S17, S18, S19, S26
Prestataires en libre-service, stock de CMC, transferts inter-boutiques,
échanges/reprises, envois de fichiers, motos de confrère. Chacun est
contournable à la main aujourd'hui.

### Les petits, qui se prennent entre deux lots
- **S34** — le numéro de version, visible au comptoir. Le produit n'en expose
  aucun ; quand un gérant décrit un comportement au téléphone, rien ne dit ce
  qui tourne sur son appareil, et une PWA garde son ancienne version jusqu'à ce
  que le service worker passe la main. Petit, et c'est ce qui rend un rapport de
  défaut exploitable. **Le prendre en premier.**
- **S33** — renommer le nom affiché sur les reçus.
- **S35** — le nom du client dans le journal de caisse (voir D84).
- **S32** — recherche globale ; demande un index consultable hors ligne, donc
  une vraie spec.

### Et une dette de vérification
**S27** — la reconnexion après coupure. Ce n'est pas un défaut produit majeur
(D66 l'a fait baisser), mais c'est ce qui rend la suite bout en bout bruitée. Le
jour où on veut une suite fiable, c'est là qu'il faut chercher : **la file
d'écritures étouffe sous la contention**, pas les assertions.

---

## 8. La forme d'un lot, telle qu'elle a fonctionné

1. **Écrire la spec d'abord**, dans `specs/S<n>-<slug>.md`, et s'arrêter : poser
   les questions qui changent le sens des données, avec une recommandation pour
   chacune. Attendre les réponses. `specs/S22-caisse.md` et
   `specs/S24-supervision-chiffres.md` sont les deux modèles.
2. **Le domaine pur d'abord** — `lib/domain/<sujet>.ts`, sans Firestore, sans
   React, sans horloge (le jour se passe en paramètre). Un test par arbitrage,
   qui **nomme** l'arbitrage : c'est ce qui fait échouer un changement d'avis
   avant qu'il aille mentir à l'écran.
3. **Les règles Firestore ensuite**, avec leurs tests, avant l'écran : ce qu'un
   formulaire ne peut pas protéger se protège là.
4. **Le dépôt**, puis **l'écran**, maquette ouverte à côté.
5. **Regarder le rendu** sur émulateurs semés — et vérifier que le semis écrit
   ce que le produit écrit (D84).
6. **Les tests bout en bout**, sur ce que le lot promet et non sur ce qu'il
   affiche.
7. **Fermer** : la décision dans `DECISIONS.md`, la ligne dans
   `specs/ROADMAP.md`, la section « ce qui a été livré » dans la spec.

**Les messages de commit sont longs et disent le pourquoi**, pas le quoi. Ils
racontent ce qui a été trouvé en chemin, ce qui a été mesuré, et ce qui a été
écarté. Regarder `git log` pour le ton.

---

## 9. Commandes utiles

```bash
npm run dev                    # développement
npm run test:unite             # 388 tests, ~3 s
npm run test:regles:isole      # 250 tests de règles, émulateur isolé
npm run test:declencheurs      # 21 tests ; le premier passage paie un démarrage à froid
npm run test:e2e               # Playwright ; lire le piège des émulateurs au §4
npm run amorcer                # compte responsable sur émulateurs
```

Toutes les commandes se préfixent par `rtk` pour économiser des tokens
(`rtk npm run build`, `rtk git status`…). C'est sans effet sur le comportement.
