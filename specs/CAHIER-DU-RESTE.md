# CAHIER DU RESTE — tout ce qui manque encore à SDI

*Établi le 11 septembre 2026, après relecture de `prompt.md` section par section
contre le code livré. Ce document est le cahier des charges de la fin du
logiciel : dix-sept étapes, dans l'ordre, chacune fermable seule.*

---

## 0. Ce que ce document est, et ce qu'il n'est pas

**Il est** la liste complète et ordonnée de ce qui reste à construire pour que
SDI réponde à l'intégralité de `prompt.md`, plus les six dettes que les vingt-
quatre lots livrés ont laissées derrière eux. Chaque étape y porte son besoin,
ses arbitrages déjà tranchés, son modèle de données, ses règles Firestore, ses
écrans et ce qui prouvera qu'elle est faite.

**Il n'est pas** un remplacement. `prompt.md` reste le besoin, `specs/ROADMAP.md`
reste la source de vérité de la progression, `DECISIONS.md` reste la mémoire des
arbitrages, `AGENTS.md` reste la façon de travailler. Ce cahier s'insère entre
eux : il dit *quoi*, dans *quel ordre*, et *avec quelles réponses déjà données*.

**Pourquoi il existe.** Jusqu'ici chaque lot naissait d'une spec écrite au moment
de le prendre, avec ses questions posées au commanditaire avant la première ligne
de code. C'est la bonne méthode et elle ne change pas. Mais elle suppose un
commanditaire joignable. Ce cahier prépare l'inverse : **il tranche d'avance tout
ce qui peut l'être**, marque comme tel ce qui est pris par défaut, et ne laisse
ouvertes que les questions dont une mauvaise réponse coûterait plus qu'un commit
de retour en arrière. Celles-là sont regroupées au §5, à poser en une seule fois.

---

## 1. L'analyse

### 1.1 La méthode

`prompt.md` a été relu du §1 au §17, et chaque exigence confrontée au code : les
vingt-six routes de `app/`, les trente-six modules de `lib/domain/`, les dix-huit
dépôts de `lib/repositories/`, les vingt-trois blocs `match` de `firestore.rules`
et les onze fonctions de `functions/src/index.ts`. Une exigence est dite **livrée**
quand un écran l'exerce et qu'un test la tient ; **écartée** quand un arbitrage
consigné l'a retirée ; **manquante** sinon.

### 1.2 Le relevé

| `prompt.md` | Ce qui est demandé | État | Étape |
|---|---|---|---|
| §1 | Les trois espaces, portés par le métier de la boutique | livré (S3bis, D62) | — |
| §3.3 | Numérotation hors-ligne `{CODE}-{AAMM}-{NNNN}` + réconciliation | livré (S7, D5) | Q1 |
| §3.4 | Persistance, écritures par le SDK, indicateur réseau et file | livré (D40, D66) | 2 |
| §3.5 | Audit sur chaque document, historique des changements de statut | livré | — |
| §4 | Rôles `responsable` / `gerant` en custom claims | livré (S2) | — |
| §4 | Rôle `client` par token, sans compte | **manque** | 4 |
| §4 | Rôle `prestataire` par token, sans compte, révocable | **manque** | 5 |
| §5.2 | `transfertsMotos` et le statut `transferee` | **manque** | 8 |
| §5.2 | `photos: string[]` sur la moto | **manque** | 12 |
| §5.4 | `motoConfrere { nomConfrere, coutReel }` | **manque** | 10 |
| §5.5 | `cmc/{id}` — stock, attribution, remise | **manque** | 6 |
| §5.6 | `echanges/{id}` — reprises | **manque** | 9 |
| §5.7 | `ventesPieces/{id}` — vente au comptoir | **manque** | 3 |
| §5.7 | `stockPieces/{…}` — quantité entretenue | **écarté** (D94) | — |
| §5.8 | `inventaires/{id}` — motos et pièces, comparaison | **manque** | 11 |
| §5.9 | `encaissements` — journal de caisse | livré (S22) | 14 |
| §6.1–6.4 | Vente, modes de paiement, dettes, tranches, recherche | livré (S8, S9) | — |
| §6.2 | Modification / annulation d'un versement | **manque** | 7 |
| §7.1, §7.3 | Cycle de vie des documents, dossiers en attente | livré (S11, S30) | — |
| §7.2 | CMC : enregistrement, attribution, remise, indicateurs | **manque** | 6 |
| §8 | Transfert de motos entre boutiques | **manque** | 8 |
| §8 | Moto prise chez un confrère | **manque** | 10 |
| §9 | Catalogue, stock, entrées, sorties autres | livré (S20) | — |
| §9 | Vente au comptoir, alertes rupture, blocage sur stock | **manque** | 3 |
| §9 | Transfert de pièces entre boutiques | **manque** | 8 |
| §10 | Reçu de vente moto, reçu de versement | livré (S10) | — |
| §10 | Reçu de vente de pièces | **manque** | 3 |
| §10 | Facture | **en attente d'un besoin** (S10) | Q2 |
| §10 | Coordonnées d'entreprise paramétrables | **écarté** (D71) | 13 |
| §11 | WhatsApp — quatre messages paramétrables | **manque** | 6 |
| §12.1 | Page client `/suivi/[token]` | **manque** | 4 |
| §12.2 | Page prestataire `/prestataire/[token]` | **manque** | 5 |
| §14 | Carte « pièces en alerte » en supervision | **manque** | 3 |
| §14 | Carte « CMC disponibles » en supervision | **manque** | 6 |
| §16 | Règles Firestore complètes | livré (S12), à étendre par étape | — |
| §17.1 | Ordre CMC / carte grise | ouvert | Q3 |
| §17.2 | Qui crée les motos en stock | **tranché** (D89, S39) | — |
| §17.3 | Dépenses hors ventes dans la caisse | **tranché** (S22) | — |
| §17.4 | Annulation d'une vente | ouvert | Q4–Q6 |

**Hors `prompt.md`** — six dettes relevées par les lots livrés, chacune déjà
inscrite au backlog avec sa mesure :

| Dette | Ce qu'elle coûte aujourd'hui | Étape |
|---|---|---|
| S40 | **Un contrôle d'unicité qui répond avant de savoir.** Six écrans concluent « pas de doublon » sur une liste encore vide pendant son chargement — dont celui du numéro de châssis. | 1 |
| S27 | La suite bout en bout est bruitée en permanence : 4 à 6 échecs par passe, aucun sur une assertion. Chaque lot à venir paie ce tri. | 2 |
| S32 | La palette du bandeau ne cherche que des écrans ; les maquettes lui font chercher des choses. | 15 |
| S33 | Le nom qui s'imprime au bas des reçus ne se change pas. | 13 |
| S35 | Le journal de caisse n'a pas la colonne « Qui » que la maquette `c2` montre. | 14 |
| S36 | Une version prête s'annonce, et demande de fermer l'application pour la prendre. | 16 |

### 1.3 Le compte

**Dix-sept étapes.** Onze viennent de `prompt.md`, six sont des dettes. Aucune
n'est un chantier de refonte : la coquille, les patrons, les jetons et les neuf
écrans existants ne bougent pas. Quatre étapes ouvrent des chemins que le produit
n'a jamais eus — deux pages publiques sans authentification (4 et 5), une
contre-passation comptable (7), un envoi de fichier (12) — et c'est là que le
soin se concentre.

---

## 2. L'ordre, et pourquoi celui-là

| # | Étape | Pourquoi ce rang |
|---|---|---|
| 1 | **S40** — le contrôle d'unicité qui répond avant de savoir | Un défaut de correction dans du code déjà livré, dont une occurrence laisse créer deux motos au même numéro de châssis. Petit, mécanique, et il n'a aucune raison d'attendre derrière seize lots. |
| 2 | **S27** — la reconnexion après coupure | Une dette de vérification qui taxe les quinze lots qui suivent. Se prend en premier ou se paie quinze fois. Bornée (voir l'étape). |
| 3 | **S21** — vente de pièces au comptoir | S20 a livré un métier à moitié : on tient un catalogue, on ne vend pas. Le type `sortie_vente` existe en base et dans les règles ; aucun écran ne l'écrit. |
| 4 | **S13** — lien de suivi client | Le différenciateur vis-à-vis du client. `tokenSuivi` est écrit sur chaque vente depuis S8 et ne sert à rien. |
| 5 | **S15** — page prestataire | Même machinerie serveur que l'étape 4 : rendu par Admin SDK, lecture par token, aucune règle Firestore ouverte à l'anonyme. Les construire à la suite, c'est l'écrire une fois. |
| 6 | **S16 + S14** — CMC et messages WhatsApp | Le CMC ferme le dossier documents, dernier maillon du MVP resté ouvert. WhatsApp ne peut venir qu'après les étapes 4 et 5 : sans lien, il n'y a rien à envoyer. |
| 7 | **S25** — annulation et correction | Aujourd'hui une vente saisie de travers reste de travers pour toujours. L'erreur de saisie est une certitude, pas un risque. Placé ici parce qu'il dépend des réponses Q4–Q6. |
| 8 | **S17** — transferts, motos et pièces | Les deux métiers d'un coup : les types de mouvement pièces existent déjà, le statut `transferee` attend son écran. |
| 9 | **S18** — échanges / reprises | Cas de vente fréquent, contournable à la main. Touche le cloisonnement des coûts (D2) — voir l'étape. |
| 10 | **S26** — motos de confrère | Petit, et il réutilise tel quel l'écran `/supervision/couts` livré par S39. |
| 11 | **S23** — inventaires | Exercice périodique. Dépend des étapes 3 et 8 pour avoir quelque chose à pointer. |
| 12 | **S19** — photos et papiers | Le seul geste du produit qui ne marchera jamais hors ligne. Il l'annonce (D66). |
| 13 | **S33** — renommer le nom affiché | Petit, isolé, une écriture et une règle. |
| 14 | **S35** — le nom du client au journal | Petit, dépend d'un arbitrage tranché ici. |
| 15 | **S32** — recherche globale | Demande une décision d'architecture, pas un index. Voir l'étape. |
| 16 | **S36** — appliquer une version en attente | Une piste non vérifiée, à mesurer. Peut se fermer sans bouton (D85). |
| 17 | **Clôture** — relecture, captures, mise à jour des contrats | Pas une fonctionnalité : ce qui rend les seize précédentes lisibles par le suivant. |

**Ce que cet ordre refuse.** Il ne commence pas par le plus visible. S27 ne
produit aucun écran et le commanditaire ne verra rien le premier jour — mais les
quinze lots suivants lancent chacun la suite bout en bout au moins deux fois, et
chaque passe coûte aujourd'hui entre vingt-cinq et quatre-vingts minutes plus le
tri de quatre à six faux échecs. C'est le seul endroit du plan où une journée
investie en rend plusieurs.

---

## 3. Les règles qui valent pour les dix-sept étapes

### 3.1 La forme d'un lot

Elle a fonctionné vingt-quatre fois ; elle ne change pas.

1. **La spec d'abord**, dans `specs/S<n>-<slug>.md`, au gabarit `SPEC.template.md`.
   Les arbitrages de ce cahier y sont recopiés avec leur statut — tranché par le
   commanditaire, ou pris par défaut.
2. **Le domaine pur** — `lib/domain/<sujet>.ts`, sans Firestore, sans React, sans
   horloge (le jour se passe en paramètre). Un test par arbitrage, qui **nomme**
   l'arbitrage.
3. **Les règles Firestore ensuite**, avec leurs tests, **avant** l'écran. Ce qu'un
   formulaire ne peut pas protéger se protège là. Un cloisonnement sans test de
   règles n'existe pas.
4. **Le dépôt**, puis **l'écran**, la maquette ouverte à côté du rendu.
5. **Regarder le rendu** — `node scripts/captures.mjs`, en clair et en sombre,
   dans les deux rôles, sur mobile et sur bureau. Et vérifier que le semis écrit
   ce que le produit écrit (D84).
6. **Les tests bout en bout**, sur ce que le lot promet, pas sur ce qu'il affiche.
7. **Fermer** : la décision dans `DECISIONS.md`, la ligne dans `specs/ROADMAP.md`,
   la section « ce qui a été livré » dans la spec, la ligne de cette étape cochée
   ici.

### 3.2 Ce qui ne se décide pas seul

Tout arbitrage qui change **ce que les données veulent dire**. Un arbitrage de
forme se prend ; un arbitrage de sens se pose. Ce cahier a déjà posé les siens au
§5 — si une question neuve apparaît en chemin et qu'elle touche le sens, elle
s'écrit dans la spec du lot, une réponse par défaut est prise et marquée, et le
travail continue. **On ne s'arrête pas.**

### 3.3 Le piège des émulateurs

```bash
cp .env.local.emulateurs .env.local   # avant tout
npm run emulators                      # terminal à part ; attendre 8181/9399/5301
npm run build                          # NEXT_PUBLIC_* est figé À LA COMPILATION
npm run test:e2e
rm .env.local                          # À LA FIN, toujours
```

Trois points qui coûtent une demi-journée chacun :

- `next dev` fige les `NEXT_PUBLIC_*` au démarrage. Retirer `.env.local` ne suffit
  pas, il faut **redémarrer le serveur**.
- **`npm run build` après `npm run dev` exige de purger `.next`.** Le
  développement compile avec Turbopack, la production avec webpack, et les deux
  partagent le répertoire. Un build mélangé échoue sur des symptômes qui
  accusent le dernier code écrit.
- Un harnais `@firebase/rules-unit-testing` lancé contre l'émulateur partagé **en
  écrase le jeu de règles**. Pour les règles, `npm run test:regles:isole`.

Les tests bout en bout ne visent **jamais** le vrai projet — le garde de
`playwright.config.ts` l'exige, ne pas le contourner.

### 3.4 Ce qui ne se fait pas

- **Aucune poussée sur `main`.** Une poussée déclenche un déploiement en
  production sur Vercel. Travailler sur une branche par étape, fusionner en
  `--no-ff` dans `main` en local, et laisser le commanditaire pousser.
- **Aucun secret dans le dépôt.** `.env*` est gitignoré et le reste.
- **Aucune suppression de données** sans arbitrage explicite. Une correction est
  une contre-passation, jamais un effacement (D10, D58).

### 3.5 Le numéro de version

`VERSION` vaut `1`. Il s'incrémente **une fois par livraison au comptoir**, pas
une fois par lot : il sert à ce qu'un gérant décrivant un défaut au téléphone
puisse dire ce qui tourne sur son appareil. Le passer à `2` quand les seize
étapes sont fermées, ou plus tôt si une livraison intermédiaire a lieu.

### 3.6 Les commandes

```bash
npm run dev                    # développement
npm run test:unite             # 452 tests, ~3 s
npm run test:regles:isole      # 283 tests de règles, émulateur isolé
npm run test:declencheurs      # 24 tests ; le premier passage paie un démarrage à froid
npm run test:e2e               # Playwright ; lire §3.3 d'abord
npm run amorcer                # compte responsable sur émulateurs
node scripts/captures.mjs      # le rendu réel, dans les deux thèmes et les deux rôles
```

---

## 4. Les dix-sept étapes

---

### Étape 1 — S40 : le contrôle d'unicité qui répond avant de savoir

**Ce que ça change.** Six écrans du produit vérifient qu'un nom, une référence ou
un numéro n'est pas déjà pris. Tous posent la question à une liste qui vient
d'une écoute Firestore, et tous écrivent la même chose :

```ts
const doublon = referenceDejaPrise(saisie.reference, catalogue ?? []);
```

`catalogue` vaut `null` tant que la première réponse de l'écoute n'est pas
arrivée. **Le `?? []` transforme « je ne sais pas encore » en « il n'y a rien »**,
et le contrôle répond « aucun doublon » à une question qu'il n'a pas posée. Le
doublon se crée.

**Comment il a été trouvé, et pourquoi ça compte.** Par le test bout en bout de
S20 « une référence déjà prise ne se crée pas deux fois », qui a échoué une passe
sur deux. La tentation était de le ranger avec le bruit de S27 — il en a toutes
les apparences : intermittent, sensible à la charge, invisible au rejeu isolé.
C'est exactement le mécanisme que D88 décrit : une chaîne de vérification bruyante
finit par avaler ce qu'elle devait montrer.

**L'occurrence qui fait le rang de cette étape.**
`app/(app)/motos/nouvelle/page.tsx:105` — `chassisDejaPris(saisie.numeroChassis,
stock ?? [])`. **Deux motos au même numéro de châssis.** Une référence de pièce en
double se répare ; deux motos au même châssis, ça se découvre à la préfecture,
sur un dossier de carte grise, des semaines plus tard.

**Les six endroits, à traiter ensemble.** C'est le corollaire de D92 : il ne
suffit pas de corriger celui qu'on a pris en défaut, il faut énumérer tous les
appelants.

| Fichier | Ce qui se duplique | Gravité |
|---|---|---|
| `app/(app)/motos/nouvelle/page.tsx:105` | Le numéro de châssis | **la plus haute** |
| `app/(app)/pieces/nouvelle/page.tsx:83` | La référence d'une pièce | **corrigé avec S20** |
| `app/(app)/parametres/catalogue/page.tsx:75` | Le nom d'une marque | moyenne |
| `app/(app)/parametres/catalogue/page.tsx:143` | Le nom d'un modèle | moyenne |
| `app/(app)/parametres/referentiels/page.tsx:79, 89` | Provenances, types de frais | basse |
| `components/ChoixOuNouveau.tsx:115` | La création à la volée dans le formulaire moto | moyenne |

**La forme du correctif**, telle qu'appliquée pour les pièces et à reprendre à
l'identique :

1. **Le garde dans la soumission** — `if (liste === null) { refuser ; return }`,
   avec un message qui dit ce qui manque et non « erreur ».
2. **Le bouton qui dit son état** — désactivé et renommé tant que la liste n'est
   pas là. Sans lui, le garde est un mur sans panneau ; avec lui, la course
   disparaît au lieu d'être rattrapée. C'est aussi ce qui donne au test quelque
   chose à attendre, plutôt qu'une temporisation.

**Ce qui prouve que c'est fait.**
- [ ] Les six appels ne reçoivent plus jamais `?? []`. Une recherche
      `grep -rn "?? \[\]" app/ components/` ne rend plus aucun contrôle
      d'unicité.
- [ ] Pour le châssis, un test bout en bout qui **échoue sur l'ancien code** :
      ouvrir le formulaire, soumettre immédiatement un châssis existant, et
      vérifier le refus (D79, les deux sens).
- [ ] Le bouton de chaque formulaire concerné annonce la lecture en cours, et se
      regarde en capture.

**Ce que l'étape ne fait pas.** Elle ne rend pas l'unicité *garantie* : deux
appareils hors ligne peuvent toujours créer le même châssis, et aucune règle
Firestore ne sait l'empêcher — c'est la même impossibilité que pour le stock
négatif (D94) et pour la numérotation (D5). Le rattrapage à la synchronisation
est un autre lot, qui n'est pas dans ce cahier. Ce qui est corrigé ici, c'est un
doublon créé **sur un seul appareil, avec du réseau** — c'est-à-dire le cas où
le produit avait toutes les informations pour refuser, et a répondu quand même.

---

### Étape 2 — S27 : la reconnexion après coupure

**Ce que ça change.** Rien à l'écran, et c'est assumé. Au comptoir, la file
d'écritures Firestore repart jusqu'à une minute après le retour du signal ; D66 a
fait baisser le rang de ce défaut côté produit. Ce qu'il coûte est ailleurs :
**la suite bout en bout rend un verdict rouge à chaque passe**, et un verdict
toujours rouge apprend à ranger le prochain vrai défaut avec le bruit. C'est
exactement le mécanisme qui a caché S37 pendant deux jours.

**Ce qu'on sait déjà.** Trois mesures, consignées : neuf échecs sur émulateurs
vieillis, six sur neufs, deux en rejouant ces six, zéro en rejouant ces deux —
l'ensemble qui échoue change à chaque passe, aucun test n'échoue deux fois de
suite. Puis, en S24 : quatre échecs sur une suite de vingt-neuf minutes, les
quatre **en expiration dans le décor**, aucun sur une assertion ; le quatrième,
qui avait échoué deux fois, passe en **7,1 s lancé seul** contre un budget de
180 s épuisé en suite chargée. Ce n'est pas une assertion lente : **c'est la file
d'écritures qui étouffe sous la contention.** La dernière passe mesurée (11
septembre) a confirmé la dégradation : 1 h 40 pour une suite qui en prenait 25,
sur des émulateurs démarrés le matin même.

**Ce qu'il faut chercher, dans cet ordre.**

1. **Mesurer d'abord, corriger ensuite.** Une passe complète sur émulateurs
   fraîchement démarrés, une seconde sur les mêmes émulateurs après deux heures.
   Si l'écart est celui qu'on croit, le coupable est l'état accumulé de
   l'émulateur Firestore, pas le produit.
2. **Le décor, pas les assertions.** Les échecs tombent dans `preparation.ts` et
   `aide.ts`. Regarder ce que le décor écrit, combien de documents, et si ces
   écritures attendent leur accusé de réception serveur — un décor qui attend le
   serveur à chaque document fabrique lui-même la contention qu'il mesure ensuite.
3. **La parade, si la cause n'est pas atteignable.** Émulateurs neufs avant chaque
   passe complète (un script `npm run test:e2e:propre` qui redémarre l'émulateur,
   attend ses ports, construit et lance), et le protocole de rejeu isolé écrit
   dans `e2e/README` ou en tête de `playwright.config.ts`.

**La borne.** Deux mesures et une tentative de correction. Si la suite ne
redescend pas sous **quinze minutes avec zéro échec inexpliqué**, appliquer la
parade, consigner la mesure dans une décision, et passer à l'étape 2. Cette étape
ne doit pas manger le cahier.

**Ce qui prouve que c'est fait.**
- [ ] Deux passes complètes mesurées, émulateurs neufs et vieillis, chiffres
      consignés dans la décision.
- [ ] Soit la cause est corrigée et la suite passe **deux fois de suite** sans
      échec inexpliqué, soit la parade est outillée et documentée.
- [ ] Le protocole de tri (rejouer isolément avant de conclure) est écrit là où
      on le lira, pas dans un message de commit.

---

### Étape 3 — S21 : la vente de pièces au comptoir

**Ce que ça change.** Le gérant vend une bougie. Aujourd'hui il ne peut pas : le
stock ne descend que par « Sortie · casse, usage interne », et rien n'enregistre
la recette. C'est le second métier qui devient entier.

**Ce qui existe déjà.** `lib/domain/piece.ts` (le stock, les six types de
mouvement dont `sortie_vente`, les quatre états, `validerMouvement`),
`lib/repositories/pieces.ts`, l'écran `/pieces` avec son catalogue et son panneau,
les règles de `pieces` et `mouvementsPieces`. Côté caisse, `encaissements` accepte
déjà `origine: 'vente_piece'` — **le journal de S22 affichera la vente sans
qu'une ligne change.** Côté reçu, `lib/domain/recu.ts` et `components/PanneauRecu.tsx`
portent la forme, à étendre aux lignes.

**Les arbitrages.**

1. **Le panier est multi-lignes, le client est facultatif** (`prompt.md` §9).
   Tranché par le cahier des charges.
2. **Le prix unitaire est pré-rempli depuis le catalogue et reste modifiable.**
   *Par défaut.* Le modèle `lignes: { …, prixUnitaire, total }` stocke le prix par
   ligne, ce qui n'a de sens que s'il peut différer du catalogue — et un comptoir
   négocie. Le prix du catalogue reste la valeur proposée ; l'écart se voit.
3. **Une pièce sans prix de vente ne se vend pas.** *Par défaut.* Le catalogue
   accepte `prixVente: null` (« à fixer ») depuis S20 ; l'ajouter au panier
   demanderait d'inventer un prix au comptoir. L'écran refuse **et propose de
   fixer le prix au même endroit** — c'est D90, la réparation sur place.
4. **Le stock insuffisant refuse la vente, sans possibilité de forcer.**
   *Tranché, contre `prompt.md` §9.* Le cahier des charges prévoit un forçage par
   le responsable, journalisé. Le commanditaire a tranché « pas de stock
   négatif », et S20 a construit la réponse : là où l'écran refuse, il propose
   l'entrée manquante au même endroit. Un chemin de forçage rouvrirait exactement
   le négatif qu'on vient d'interdire, et il serait emprunté — parce qu'il est
   plus court que d'aller saisir le carton. **L'écart au cahier des charges est
   assumé et doit être écrit dans la spec.**
5. **La numérotation** — voir **Q1** au §5. Par défaut : un compteur partagé avec
   les ventes de motos, de sorte qu'un numéro dicté au téléphone désigne une seule
   pièce comptable. Cela demande que `prochainCompteur` reçoive l'union des
   numéros des deux collections, et que `reconcilierNumeroVente` regarde les deux.
6. **Pas d'écran « Alertes » distinct.** *Par défaut, contre `prompt.md` §14.* Les
   filtres « Stock bas » et « Épuisé » de `/pieces` répondent déjà à la question,
   pour le même lecteur — D73. Ce qui manque vraiment est ailleurs : **une carte
   « pièces en alerte » en supervision**, pour le responsable qui ne regarde pas
   le catalogue. Elle fait partie de cette étape.

**Le modèle.**

```ts
ventesPieces/{id} {
  numero                  // {CODE}-{AAMM}-{NNNN}, cf. arbitrage 5
  boutiqueId
  date
  clientId?               // facultatif au comptoir
  lignes: { pieceId, reference, designation, quantite, prixUnitaire, total }[]
  total
  moyenPaiement: 'especes' | 'orange_money' | 'moov_money' | 'wave'
  ...audit
}
```

À la validation, **en un seul batch Firestore** : la `ventePieces`, un
`mouvementsPieces` de type `sortie_vente` par ligne (portant `ventePieceId`), et
un `encaissements` de sens `entree`, origine `vente_piece`, `origineRefId` =
l'identifiant de la vente. Un batch, parce que le stock qui descend sans recette
enregistrée, ou l'inverse, est un mensonge — et parce que le batch part dans la
file hors ligne comme une écriture unique.

**La désignation est recopiée dans la ligne**, pas référencée. Un reçu imprimé
six mois plus tard doit dire ce qui a été vendu, même si la référence a été
renommée depuis. C'est le même raisonnement que `coutMotoSnapshot`.

**Les règles.** `match /ventesPieces/{id}` : création par le comptoir de sa
boutique, `allow update, delete: if false` — une vente ne se retouche pas, elle
se contre-passe (étape 6). Validation de la forme des lignes : quantité entière
strictement positive, prix entier positif, `total == quantite * prixUnitaire`,
`total` de la vente égal à la somme des lignes, au plus une vingtaine de lignes.
Le lien vers `mouvementsPieces` ne peut pas être vérifié par une règle — c'est le
batch qui le tient, et un test bout en bout qui le prouve.

**Les écrans.**
- `/pieces/vendre` — le panier. Recherche de pièce, quantité, prix modifiable,
  lignes empilées avec leur total, moyen de paiement, client facultatif.
- Le reçu — `PanneauRecu` étendu aux lignes, avec la maquette `c4-recu.html`
  ouverte à côté. Il doit s'imprimer **hors ligne** et en thème sombre système
  (D77, quatre sélecteurs).
- La carte « pièces en alerte » en supervision (`ChiffresDuMois` + la page).

**Ce qui prouve que c'est fait.**
- [ ] Le domaine calcule un panier, son total et son refus sur stock insuffisant,
      sans Firestore ni horloge, un test par arbitrage.
- [ ] Les règles refusent une ligne à quantité nulle, un total qui ne somme pas,
      et toute retouche d'une vente enregistrée. Tests de règles à l'appui.
- [ ] **Une vente se passe réseau coupé** : le stock descend à l'écran
      immédiatement, le reçu s'imprime, l'encaissement apparaît au journal au
      retour du réseau. Vérifié, pas supposé.
- [ ] Le refus sur stock insuffisant propose l'entrée manquante, et l'entrée
      faite là débloque la vente sans changer d'écran.
- [ ] Le rendu est regardé en clair et en sombre, dans les deux rôles.

**Ce que l'étape ne fait pas.** Le transfert de pièces (étape 7), l'inventaire
(étape 10), la contre-passation d'une vente de pièces (étape 6), le prix d'achat
d'une référence — qui attend de savoir si une référence a un prix ou si chaque lot
a le sien (`prompt.md` §5.7 et §9 emploient le même mot pour les deux).

---

### Étape 4 — S13 : le lien de suivi client

**Ce que ça change.** Le client suit sa carte grise et sa plaque depuis son
téléphone, sans compte, sans appeler la boutique. C'est le différenciateur du
produit vis-à-vis du client, et c'est ce qui décharge le gérant du téléphone.

**Ce qui existe déjà.** `tokenSuivi` — 43 caractères base64url, tiré par
`crypto.getRandomValues` sur l'appareil, écrit sur chaque vente depuis S8
(`lib/domain/token.ts`). Il ne sert à rien aujourd'hui. Le cycle de vie des
documents et leurs statuts sont livrés (S11).

**Le chantier sensible, et pourquoi.** C'est la **première page publique** du
produit. Les règles Firestore n'ont aujourd'hui aucun chemin ouvert à un visiteur
anonyme, et il ne faut pas en ouvrir : `prompt.md` §2 et §12.1 imposent un rendu
**côté serveur via Admin SDK**, précisément pour que les règles restent fermées.
L'Admin SDK contourne les règles — c'est donc le code du Route Handler qui porte
seul le cloisonnement. Il doit être écrit comme tel : une fonction qui prend un
token et rend **exactement** les champs autorisés, jamais le document brut.

**Les arbitrages.**

1. **Rendu par Route Handler Next, pas par Cloud Function.** *Par défaut.*
   L'application est déjà déployée sur Vercel (D1) ; un Route Handler y vit sans
   infrastructure de plus. Il lui faut un compte de service Firebase dans les
   variables d'environnement de Vercel — **jamais dans le dépôt** (règle 2). Le
   noter dans `DEPLOIEMENT.md` : sans cette variable, la page publique rend une
   erreur, et c'est la seule partie du produit qui en dépend.
2. **La recherche par token est une requête sur `ventesMotos`** où
   `tokenSuivi == …`, ce qui demande un index simple à déclarer dans
   `firestore.indexes.json`.
3. **L'expiration se calcule à la lecture, pas par une tâche planifiée.**
   *Par défaut.* `prompt.md` §4 veut le token désactivé trente jours après la
   clôture du dossier. Une fonction planifiée qui va éteindre des tokens est un
   agrégat entretenu (D61) : elle échoue en silence et personne ne le voit. Le
   Route Handler compare `dateClotureDossier + 30 jours` à maintenant et rend
   « Lien expiré ». Rien à entretenir, rien à diverger.
4. **La page ne montre rien d'autre que le §12.1** : prénom et nom du client,
   marque et modèle de la moto, état de la carte grise, état de la plaque, date
   de disponibilité estimée, nom et téléphone de la boutique, un bouton WhatsApp
   vers la boutique. **Aucun montant, aucun nom de prestataire, aucun châssis,
   aucune autre vente.** Le châssis est retiré volontairement : il figure sur la
   page prestataire parce qu'il identifie la moto pour celui qui la traite, il
   n'apprend rien au client et il identifie un bien.
5. **Les statuts se traduisent en langage client** : `a_faire` → « En
   préparation », `chez_prestataire` → « En cours de traitement »,
   `revenu_magasin` → « Disponible en boutique », `remis_client` → « Remis »,
   `non_applicable` → le document n'apparaît pas.
6. **La page n'est pas hors ligne.** *Par défaut.* Elle est lue par le client sur
   son téléphone, pas par le comptoir. Elle ne va pas dans `ECRANS_HORS_LIGNE`.

**Les règles.** Aucune ne change. C'est le point : le chemin public ne passe pas
par elles. **Un test de règles doit figer cette absence** — qu'un visiteur
anonyme ne lise ni `ventesMotos`, ni ses `documents`, ni `clients` — sinon
quelqu'un ouvrira ce chemin plus tard en croyant réparer la page publique.

**Les écrans.** `/suivi/[token]` — une page légère, lisible sur un petit
téléphone, en français, sans coquille applicative : ni rail, ni bandeau, ni
sélecteur de boutique. Elle doit tenir sur un rendu 320 px. Trois états : le
dossier, « lien invalide », « lien expiré » — et les trois se regardent en
capture.

**Ce qui prouve que c'est fait.**
- [ ] Un token inconnu, un token mal formé et un token expiré rendent chacun leur
      page, sans jamais révéler qu'un dossier existe.
- [ ] La réponse HTTP ne contient **aucun** montant, **aucun** nom de prestataire,
      **aucun** autre dossier. Vérifié sur le corps de la réponse, pas à l'œil.
- [ ] Un test de règles fige qu'un anonyme ne lit rien dans Firestore.
- [ ] La page se lit sur 320 px de large, en clair et en sombre.

---

### Étape 5 — S15 : la page prestataire

**Ce que ça change.** Le prestataire voit les documents qu'on lui a confiés et
déclare lui-même « Document prêt ». Le gérant cesse de relancer au téléphone.

**Ce qui existe déjà.** `lib/domain/prestataire.ts`, `/parametres/prestataires`,
le statut `chez_prestataire` et son `prestataireId` sur chaque document (S11).
**Il manque le champ `token` sur le prestataire** — `prompt.md` §5.1 le prévoit,
le type ne le porte pas. Et toute la machinerie serveur de l'étape 3, à réutiliser
telle quelle.

**Les arbitrages.**

1. **Un token par prestataire, pas par dossier** (`prompt.md` §4). Tranché par le
   cahier des charges. Il est tiré par le responsable depuis les paramètres — donc
   **avec réseau**, ce qui est acceptable : créer un prestataire n'est pas un
   geste de comptoir.
2. **La révocation est une régénération.** *Par défaut.* Un bouton « Régénérer le
   lien » remplace le token ; l'ancien cesse de fonctionner à la seconde. Un
   champ « révoqué » séparé serait un second mécanisme pour le même besoin (D73).
3. **La seule action est « Document prêt »** → `revenu_magasin`, par un Route
   Handler qui vérifie le token **et** que le document lui est bien attribué. Le
   prestataire peut aussi corriger la date estimée — c'est lui qui la connaît.
4. **Il ne voit ni prix, ni paiements, ni les dossiers d'un autre prestataire.**
   Il voit : client, marque, modèle, châssis, type de document, date de dépôt,
   date estimée.
5. **L'écriture passe par l'Admin SDK côté serveur**, avec les champs d'audit
   renseignés au nom du prestataire (`createdByName` = son nom, `createdBy` =
   son identifiant de prestataire préfixé, pour qu'on distingue à la lecture une
   écriture de prestataire d'une écriture de gérant).

**Les règles.** Comme à l'étape 3 : rien ne s'ouvre, et un test fige l'absence.
En revanche `prestataires/{id}` gagne un champ `token` qu'un gérant **ne doit pas
lire** — `prompt.md` §16 l'exige. Aujourd'hui le gérant lit le prestataire pour
le choisir au dépôt. Deux voies : sortir le token dans `prestataires/{id}/prive/acces`
comme on l'a fait pour les coûts (D2), ou restreindre la lecture du document
entier au responsable et donner au gérant une liste réduite. **Par défaut : la
sous-collection `prive/`**, parce que le gérant a besoin du nom et du téléphone,
et que le mécanisme existe déjà, avec ses tests.

**Les écrans.** `/prestataire/[token]` — même sobriété que `/suivi`. Côté
application : `/parametres/prestataires` gagne le lien, le bouton de copie et le
bouton de régénération, avec une confirmation explicite (régénérer casse un lien
en circulation).

**Ce qui prouve que c'est fait.**
- [ ] Un prestataire ne voit que ses documents, mesuré avec deux prestataires et
      deux dossiers.
- [ ] « Document prêt » passe le document à `revenu_magasin` et l'écrit dans
      l'historique au nom du prestataire.
- [ ] Un token régénéré rend l'ancien inopérant **immédiatement**.
- [ ] Un test de règles fige qu'un gérant ne lit pas le token.

---

### Étape 6 — S16 + S14 : le CMC, puis les messages WhatsApp

Deux lots dans une étape parce qu'ils ferment la même boucle : le dossier
documents devient complet, et le client en est informé.

#### 5a — S16 : le stock de CMC

**Ce que ça change.** Le magasin détient un stock physique de cartes
d'immatriculation. Aujourd'hui le document `cmc` suit son cycle comme les trois
autres, mais rien ne dit combien il en reste ni laquelle a été donnée à qui.

**Les arbitrages.**

1. **Le CMC appartient à une boutique**, comme tout le reste.
2. **L'enregistrement se fait par lot, avec une plage de numéros.** *Par défaut.*
   Ils arrivent en carnets ; saisir cinquante numéros un par un au comptoir ne se
   fera pas, et ce qui ne se fait pas produit un stock faux. L'écran accepte un
   numéro seul ou une plage, et refuse une plage qui chevauche un numéro déjà
   enregistré.
3. **L'ordre attribution / dépôt de la carte grise reste libre** — voir **Q3**.
   Par défaut : les deux ordres restent permis, comme aujourd'hui.
4. **L'attribution d'un CMC à une vente** passe `cmc.statut` à `attribue`, écrit
   `cmcId` sur le document `cmc` de la vente et passe ce document à
   `revenu_magasin`. La remise au client passe `cmc.statut` à `remis`.
5. **Un CMC attribué ne se réattribue pas** sans passer par une libération
   explicite, tracée. Deux clients avec la même carte est le genre d'erreur qui se
   découvre à la préfecture.

**Le modèle.** `cmc/{id} { boutiqueId, numero, statut: 'disponible'|'attribue'|'remis', venteId?, dateAttribution?, dateRemise?, …audit }`.
La contrainte d'unicité du numéro dans une boutique ne peut pas être portée par
une règle Firestore — elle se tient au geste, et la plage refusée au chevauchement
en est la forme principale.

**Les écrans.** `/motos/cmc` — le stock, ses trois états, l'entrée par plage. Le
détail de vente gagne le choix d'un CMC disponible. La supervision gagne la carte
« CMC disponibles » et « attribués en attente de remise » (`prompt.md` §14).

#### 5b — S14 : les messages WhatsApp

**Ce que ça change.** Le gérant envoie le lien de suivi, ou prévient que les
documents sont prêts, en un bouton. Aujourd'hui il recopie à la main.

**Les arbitrages.**

1. **Des liens `wa.me` pré-remplis, sans API WhatsApp Business** — tranché par
   `prompt.md` §11.
2. **Quatre messages, modifiables par le responsable**, avec les variables
   `{nom}`, `{moto}`, `{lien}`, `{boutique}` : lien de suivi, documents
   disponibles, reçu, lien prestataire. Stockés dans `entreprise/messages`, à
   côté des réglages existants.
3. **Un modèle vidé revient au texte d'origine.** *Par défaut.* Un message vide
   produirait un envoi vide, et personne ne le verrait avant le client.
4. **`lienSuiviEnvoyeAt` s'écrit au clic**, en sachant que ça ne prouve pas
   l'envoi — `prompt.md` §11 l'assume explicitement. L'écran doit le dire :
   « lien préparé le … », pas « lien envoyé le … ».
5. **Le numéro se normalise en format international** avant d'entrer dans l'URL.
   `normaliserTelephone` existe déjà (`lib/domain/client.ts`) ; vérifier qu'il
   produit bien un numéro que `wa.me` accepte (indicatif sans `+`, sans espaces).
6. **Le bouton marche hors ligne** : construire une URL ne demande pas de réseau.
   C'est WhatsApp qui en aura besoin, et c'est son affaire.

**Ce qui prouve que c'est fait (5a + 5b).**
- [ ] Une plage de CMC s'enregistre, un chevauchement se refuse avec le numéro
      fautif nommé.
- [ ] Un CMC attribué puis remis suit ses trois états, et la carte de supervision
      compte juste.
- [ ] Les quatre messages se modifient, se vident et reviennent au texte d'origine.
- [ ] L'URL produite est correcte pour un numéro burkinabè saisi de quatre façons
      différentes (avec `+226`, avec `00226`, avec des espaces, sans indicatif).
- [ ] Les boutons s'affichent et construisent leur lien **réseau coupé**.

---

### Étape 7 — S25 : annuler et corriger

**Ce que ça change.** Aujourd'hui **une vente saisie de travers reste de travers
pour toujours**, et un versement mal saisi aussi. L'erreur de saisie au comptoir
n'est pas un risque, c'est une certitude hebdomadaire.

**Le lot le plus sensible du cahier.** Lire `DECISIONS.md` D10 et D58 avant la
première ligne. Trois principes, non négociables :

1. **Rien ne s'efface.** Une correction est une **contre-passation tracée** : le
   document fautif reste, un document inverse le neutralise, et les deux portent
   le lien vers l'autre. Les règles de `encaissements` l'annoncent déjà en
   commentaire depuis S22.
2. **Un versement ne se modifie ni ne se supprime, pour personne** — c'est déjà le
   cas dans les règles, et ça ne change pas.
3. **Tout passe par l'historique.** Qui, quand, pourquoi. Le motif est obligatoire.

**Les arbitrages** — voir **Q4**, **Q5** et **Q6** au §5. Réponses par défaut, si
elles restent sans réponse :

- **Q4 — qui a le droit ?** Par défaut : le **responsable seul**, conformément à
  la proposition de `prompt.md` §17.4. Un gérant qui peut défaire une vente peut
  défaire une recette.
- **Q5 — la moto revient-elle en stock ?** Par défaut : **oui**, `statut` repasse
  à `en_stock`, `venteId` est effacé. La moto est physiquement revenue ou n'est
  jamais partie ; la laisser « vendue » ferait mentir le stock, qui est ce qu'on
  regarde tous les jours.
- **Q6 — que deviennent les versements encaissés ?** Par défaut : chaque versement
  reçoit un **encaissement de sens inverse**, origine `autre`, libellé
  « Remboursement vente {numéro} ». La caisse du jour montre donc la sortie — ce
  qui est la vérité : l'argent est rendu.

**Le modèle.** Pas de nouvelle collection. `ventesMotos` gagne
`annulee: boolean`, `annuleeAt`, `annuleePar`, `motifAnnulation`. Une vente
annulée disparaît des listes de dettes, de tranches et des chiffres du mois, et
reste consultable depuis la recherche avec sa mention. Les documents du dossier
passent à `non_applicable`.

**Les règles.** L'annulation est une mise à jour de `ventesMotos` réservée au
responsable, qui exige les quatre champs ensemble et un motif non vide. Une vente
annulée ne se ré-annule pas, et ne se désannule pas — si l'annulation était
elle-même une erreur, on ressaisit la vente.

**Ce qui prouve que c'est fait.**
- [ ] Un gérant ne peut pas annuler, prouvé par un test de règles.
- [ ] Une vente annulée sort des dettes, des tranches, des chiffres du mois, et
      reste retrouvable.
- [ ] Les versements produisent leurs contre-passations, et la caisse du jour les
      montre en sortie.
- [ ] La moto redevient vendable, et le stock la recompte.
- [ ] Rien n'a été supprimé : le compte de documents avant et après est vérifié.

---

### Étape 8 — S17 : les transferts entre boutiques

**Ce que ça change.** Une moto ou un lot de pièces passe d'une boutique à l'autre
sans sortir du système.

**Les arbitrages.**

1. **Le transfert d'une moto se fait en deux temps.** *Par défaut, et c'est un
   écart au premier abord.* `prompt.md` §8 décrit un transfert immédiat — « la
   moto disparaît d'une boutique et apparaît dans l'autre ». Mais §5.2 prévoit un
   statut `transferee` qu'un transfert immédiat n'utiliserait jamais. Les deux se
   concilient ainsi : la boutique d'origine **envoie** (statut `transferee`, la
   moto quitte son stock), la boutique d'arrivée **reçoit** (statut `en_stock`,
   `boutiqueId` mis à jour). Entre les deux, la moto est sur la route, et
   l'inventaire de chaque boutique dit la vérité — ce qu'un transfert immédiat
   rendrait faux pendant deux jours. Les deux gestes fonctionnent hors ligne.
2. **Le transfert de pièces est déjà modélisé** : `transfert_sortie` et
   `transfert_entree` existent dans `MOUVEMENTS` depuis S20, avec leurs signes.
   Même logique en deux temps, portée par un `transfertsPieces/{id}` qui lie les
   deux mouvements.
3. **Un transfert ne s'annule pas, il se retransfère.** *Par défaut.* Même
   principe que le mouvement de stock : ce qui est parti est parti, on le renvoie.

**Les règles.** Le gérant d'origine crée l'envoi, le gérant de destination crée la
réception. Cela demande qu'un gérant **lise** les motos d'une autre boutique quand
elles lui sont destinées — `prompt.md` §16 le note comme un point à trancher.
*Par défaut :* lecture ouverte au gérant sur les motos dont le transfert en cours
le désigne comme destination, pas sur le stock entier de l'autre boutique.

---

### Étape 9 — S18 : les échanges et reprises

**Ce que ça change.** Le client donne son ancienne moto en partie de paiement.
Aujourd'hui il faut enregistrer deux opérations sans lien : une vente, et une
entrée en stock.

**Le point qui n'est pas évident, et qu'il faut traiter avec soin.** La reprise
crée une moto d'occasion dont le `prixAchat` vaut la valeur de reprise
(`prompt.md` §5.6). Or depuis S39 et D2, **le prix d'achat vit dans
`motos/{id}/prive/cout` et le gérant ne peut ni le lire ni l'écrire** — et c'est
le gérant qui négocie la reprise au comptoir. Trois voies :

- Ouvrir l'écriture du coût au gérant pour ce cas : **non**, c'est rouvrir le trou
  que S39 a bouché.
- Laisser la reprise sans coût, à poser par le responsable depuis
  `/supervision/couts` : possible, mais la valeur de reprise est **connue au
  comptoir**, et la faire ressaisir ailleurs invite à l'erreur.
- **La retenue :** la valeur de reprise s'écrit sur `echanges/{id}`, que le gérant
  peut lire — elle fait partie de l'accord, le client la connaît — et un
  **déclencheur** la recopie dans `motos/{motoRepriseId}/prive/cout`. Le gérant
  n'a jamais accès au coût d'une moto ; il déclare un prix négocié, ce qui est son
  métier. Le déclencheur écrit avec `create` et non `set` (D92).

**Les arbitrages.**

1. **La moto reprise entre en stock à la validation de l'échange**, en
   `etat: 'occasion'`, `provenanceId` = « reprise client », `origineEchangeId`.
2. **Le complément est la vente ordinaire** : `complementVerse = prixConvenu −
   valeurReprise`, et il suit le mode de paiement choisi comme n'importe quelle
   vente. L'échange n'est pas un quatrième mode de paiement.
3. **La provenance « reprise client » est créée si elle n'existe pas.** *Par
   défaut.* C'est D90 appliqué : une condition préalable se répare sur place.

---

### Étape 10 — S26 : les motos de confrère

**Ce que ça change.** On vend au client une moto qu'on est allé prendre chez un
autre revendeur. Elle n'est jamais entrée en stock.

**Ce qui rend ce lot petit.** S39 a livré `/supervision/couts` : l'écran où le
responsable pose les coûts des motos qui n'en ont pas, et le déclencheur
`rattraperMargeDuCout` qui fige la marge quand le coût arrive après la vente.
Une moto de confrère est **exactement ce cas**.

**Les arbitrages.**

1. **Le gérant saisit le nom du confrère, pas le coût.** *Par défaut, et c'est la
   cohérence avec D2 et S39.* `prompt.md` §5.4 met `coutReel` à côté de
   `nomConfrere` dans le même objet ; le coût part dans
   `ventesMotos/{id}/prive/cout`, le nom reste sur la vente.
2. **La vente de confrère ne touche pas le stock** : aucune moto n'est créée,
   aucun statut ne change. La fiche de vente porte la marque, le modèle et le
   châssis saisis à la main.
3. **La marge se calcule sur le coût réel** quand il arrive, par le déclencheur
   existant. Tant qu'il n'est pas posé, la vente apparaît dans
   `/supervision/couts` comme les autres.

---

### Étape 11 — S23 : les inventaires

**Ce que ça change.** Un arrêté périodique : ce que le système croit détenir,
confronté à ce qu'on trouve sur l'étagère.

**Le point d'architecture, et c'est un écart assumé.** `prompt.md` §5.8 décrit les
lignes comme un tableau dans le document d'inventaire. **Ne pas faire ça.** Deux
raisons : un pointage se fait à plusieurs, sur plusieurs appareils, et deux
écritures concurrentes sur un même tableau se perdent l'une l'autre — c'est
exactement D56, qui a interdit le dernier-écrivain-gagne sur les versements. Et un
inventaire de pièces peut dépasser la limite d'un mégaoctet par document.

**La forme retenue :** `inventaires/{id}` porte l'entête, et
`inventaires/{id}/lignes/{refId}` porte une ligne par référence. Chaque pointage
est une écriture indépendante, qui part dans la file hors ligne sans écraser
celle du voisin.

**Les arbitrages.**

1. **Les lignes attendues sont générées à la création** : motos `en_stock` et
   `reservee` de la boutique ; pièces avec quantité non nulle **ou** mouvement sur
   la période.
2. **Les écarts s'affichent pendant le pointage**, calculés à la lecture (D61).
3. **La validation d'un inventaire pièces propose de créer les mouvements
   `ajustement_inventaire`**, et ne les crée jamais sans confirmation. C'est le
   seul type de mouvement dont le signe dépend de la valeur — un ajustement peut
   retirer du stock.
4. **Un inventaire validé ne se rouvre pas.** *Par défaut.* Il est une photo
   datée ; le corriger, c'est en refaire un.
5. **La comparaison de deux inventaires** du même espace et de la même boutique
   est un écran de lecture pure.

**Ce que cette étape apporte en plus.** C'est l'arrêté périodique que D94
annonçait : au-delà de `SEUIL_MOUVEMENTS`, la quantité d'une pièce se calculera
depuis le dernier inventaire validé plus les mouvements postérieurs, au lieu de
tout rejouer. **Poser le calcul maintenant n'est pas demandé** — mais écrire
l'inventaire de façon à ce qu'il puisse le porter, oui.

---

### Étape 12 — S19 : les photos et les papiers

**Ce que ça change.** Une moto d'occasion se reconnaît sur photo, et les papiers
fournis se scannent.

**Le seul geste du produit qui ne marchera jamais hors ligne.** Firebase Storage
n'a pas de file d'attente locale. D66 a tranché : l'écran **l'annonce** au lieu
d'échouer en silence, et le lot reste terminé. Une file d'attente locale de
fichiers est un vrai chantier (D14) et n'est pas dans ce cahier.

**Les arbitrages.**

1. **La photo se redimensionne sur l'appareil avant l'envoi** — 1600 px sur le
   grand côté, JPEG qualité 80. *Par défaut.* Une photo de téléphone pèse cinq
   mégaoctets ; sur la connexion de Pouytenga, l'envoyer brute prend des minutes
   et échouera une fois sur deux. Le `canvas` du navigateur suffit, aucune
   dépendance.
2. **Au plus six photos par moto.** *Par défaut.* Au-delà, personne ne regarde et
   le stockage se paie.
3. **Le bouton dit qu'il demande du réseau**, avant le clic et pas après l'échec.
   Hors ligne, il est désactivé avec sa raison écrite.
4. **Les règles Storage** limitent le type (`image/*`), la taille (2 Mo après
   redimensionnement) et le chemin (`motos/{motoId}/…`), et n'autorisent que le
   comptoir de la boutique de la moto.

---

### Étape 13 — S33 : renommer le nom affiché

**Ce que ça change.** Le nom qui s'imprime au bas des reçus remis se corrige.
`a9:180-191` en fait une carte « Mon nom affiché » dans les réglages.

**Pourquoi ce n'est pas un habillage.** Le produit ne sait pas renommer un compte
(D72) : le nom vit dans `users/{uid}.nom` et dans les champs d'audit déjà écrits.
Renommer change **le nom à venir**, jamais les documents passés — et l'écran doit
le dire, sinon quelqu'un croira avoir corrigé un reçu déjà imprimé.

**Les arbitrages.** Chacun modifie son propre nom, et le responsable modifie celui
des autres depuis `/parametres/utilisateurs`. Une règle qui autorise l'écriture de
`nom` sur son propre document, et **rien d'autre** — surtout pas `role` ni
`boutiqueId`, qui sont des droits.

---

### Étape 14 — S35 : le nom du client au journal de caisse

**Ce que ça change.** La maquette `c2` montre une colonne « Qui » ; un
encaissement ne porte pas le nom du client.

**L'arbitrage.** Deux voies, et la seconde est retenue.

- Joindre `encaissements` et `clients` à la lecture : deux écoutes de plus, sur
  tous les appareils, tous les jours, pour une colonne.
- **Écrire le nom dans le libellé à l'encaissement.** *Par défaut.* L'écriture a
  lieu une fois, la lecture tous les jours. Touche S8 et S9 — donc les deux
  endroits qui créent un encaissement — et ne vaut que pour les mouvements à
  venir. Les anciens gardent leur libellé, qui n'est pas faux, seulement moins
  complet. Rien à rattraper : un rattrapage serait un agrégat entretenu (D61).

---

### Étape 15 — S32 : la recherche globale

**Ce que ça change.** La palette du bandeau ne cherche que des écrans ; les
maquettes lui font chercher des motos, des ventes et des clients.

**L'arbitrage d'architecture, et il est contre-intuitif.** Le backlog annonce
« demande un index consultable hors ligne ». **Ne pas construire d'index.** Les
collections que la recherche doit fouiller — motos, ventes, clients du périmètre —
sont **déjà écoutées** par les écrans du produit et **déjà en cache Firestore**.
La recherche se fait donc en mémoire sur ce qui est là, ce qui marche hors ligne
par construction et ne demande aucune collection neuve. C'est D61 appliqué : rien
d'entretenu, donc rien qui diverge.

**La borne est la même que celle de S24 et de S20**, et elle s'écrit d'avance :
au-delà de l'ordre de vingt mille documents, cette approche cesse d'être bonne, et
la réponse sera alors un index bâti à la lecture, pas un agrégat entretenu.

**Les arbitrages.** La recherche porte sur : numéro de vente, nom et téléphone du
client, châssis, référence et désignation de pièce. Comparaison réduite —
minuscules, accents retirés — comme `normaliserNom` le fait déjà. Au plus dix
résultats par famille, chacun menant à son écran.

---

### Étape 16 — S36 : appliquer une version en attente

**Ce que ça change.** Le produit annonce qu'une version est prête et demande de
fermer l'application pour la prendre.

**Ce qui est déjà mesuré (D85, quatre mesures).** Le message arrive bien au
service worker en attente, mais `skipWaiting` **ne se résout jamais tant qu'un
écran de l'application est ouvert** — les écoutes Firestore gardent la version
active occupée — et un rechargement complet n'y change rien. Le même message
depuis `/login`, sans session, active la nouvelle version immédiatement.

**La piste non vérifiée :** fermer les écoutes (`terminate()` ou `disableNetwork()`
sur l'instance Firestore) **avant** d'envoyer le message, puis recharger.

**La borne, et elle compte.** Si la mesure ne montre pas une activation fiable,
**fermer le lot sans bouton**, en consignant la mesure. Un bouton qui ne tient pas
sa promesse n'échoue pas bruyamment : il apprend à ne plus croire l'écran. C'est
la raison pour laquelle il n'y en a pas aujourd'hui.

---

### Étape 17 — La clôture

Pas une fonctionnalité. Ce qui rend les seize précédentes utilisables par le
suivant.

- [ ] `specs/ROADMAP.md` à jour : chaque lot livré déplacé dans son tableau, avec
      son paragraphe de fermeture.
- [ ] `DECISIONS.md` : une décision par arbitrage structurant, numérotée à la
      suite de D94.
- [ ] `prompt.md` §17 : les points ouverts qui ont reçu une réponse sont marqués
      comme tranchés, avec le renvoi vers la décision.
- [ ] `specs/REPRISE-POST-MVP.md` réécrit ou retiré — il décrit un état du monde
      qui n'existera plus.
- [ ] Une campagne de captures complète, en clair et en sombre, dans les deux
      rôles, sur mobile et sur bureau.
- [ ] La suite complète : unité, règles, déclencheurs, bout en bout. Chaque échec
      expliqué, aucun écarté comme « bruit » sans mesure.
- [ ] `VERSION` incrémenté.
- [ ] Un récapitulatif au commanditaire : ce qui a été livré, ce qui a été tranché
      par défaut et reste réversible, ce qui a été trouvé en chemin.

---

## 5. Les questions au commanditaire

**À poser en une seule fois, au tout début de la session d'implémentation.** Le
travail ne s'arrête pas en les attendant : chacune a une réponse par défaut, déjà
appliquée dans les étapes ci-dessus, et chacune se change en un commit. Seules
Q4, Q5 et Q6 méritent d'attendre — c'est pourquoi l'étape 6 est placée assez loin
dans l'ordre pour qu'une réponse ait le temps d'arriver.

| # | Question | Recommandation | Si sans réponse |
|---|---|---|---|
| **Q1** | Un reçu de vente de pièces et un reçu de vente de moto peuvent-ils porter le **même numéro** ? Aujourd'hui le format `{CODE}-{AAMM}-{NNNN}` ne distingue pas les deux natures. | **Non.** Un numéro dicté au téléphone doit désigner une seule pièce. Un compteur partagé entre les deux collections. | Compteur partagé. Coût : deux collections à lire pour numéroter, et la fonction de réconciliation à étendre. |
| **Q2** | La **facture** (troisième type du §10) répond-elle à un besoin réel ? Un client professionnel la demande-t-il ? | La construire **seulement si le besoin existe**. Les deux reçus couvrent le comptoir. | Non construite. Reste au backlog, comme depuis S10. |
| **Q3** | Le **CMC** est-il attribué **avant** ou **après** le dépôt de la carte grise chez le prestataire ? (`prompt.md` §17.1) | Laisser les deux ordres possibles, comme aujourd'hui. | Les deux ordres restent permis. |
| **Q4** | Qui peut **annuler une vente** ? | Le **responsable seul** (`prompt.md` §17.4). | Responsable seul. |
| **Q5** | Une vente annulée fait-elle **revenir la moto en stock** ? | **Oui** — sinon le stock ment. | Oui, `statut` repasse à `en_stock`. |
| **Q6** | Que deviennent les **versements déjà encaissés** d'une vente annulée ? | Une **contre-passation** par versement : la caisse du jour montre la sortie, rien n'est effacé. | Contre-passation. |
| **Q7** | Le transfert d'une moto se fait-il **en deux temps** (envoi puis réception) ou immédiatement ? | **Deux temps** : sinon l'inventaire de la boutique d'arrivée compte une moto encore sur la route. | Deux temps. |
| **Q8** | Combien de **photos** au maximum par moto, et faut-il pouvoir scanner les papiers fournis ? | Six photos, redimensionnées sur l'appareil. Les papiers : un champ de texte suffit aujourd'hui, il existe. | Six photos, pas de scan de papiers. |

---

## 6. Ce que ce cahier ne couvre pas

Pour que la borne soit lisible, et qu'on ne la franchisse pas par inadvertance.

- **Une file d'attente locale pour les fichiers.** D14 et D66 l'ont écartée ;
  l'étape 11 annonce la contrainte au lieu de la contourner.
- **Une application native.** La PWA est le choix, il tient.
- **La comptabilité.** Le produit tient une caisse et des reçus, pas un grand
  livre. Aucune écriture comptable normalisée, aucun export fiscal.
- **La gestion du personnel, des salaires, des stocks de consommables.**
- **Une API WhatsApp Business.** `prompt.md` §11 tranche pour les liens `wa.me`.
- **Le multi-devise, le multi-langue.** FCFA entier, français.
- **Une refonte d'interface.** La coquille, les jetons, les patrons et les neuf
  écrans livrés ne bougent pas. Les écrans neufs de ce cahier s'écrivent **dans**
  cette forme, maquette ouverte à côté.

---

*Fin du cahier. Dix-sept étapes, huit questions, et une règle qui les gouverne
toutes : ce qui n'a pas été vérifié n'est pas fait.*
