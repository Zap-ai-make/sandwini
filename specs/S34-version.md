# S34 — Le numéro de version, visible au comptoir

```
Statut     : en cours
Périmètre  : post-MVP
Dépend de  : aucune
```

---

## Objectif

Quand un gérant appelle pour décrire un comportement, on doit pouvoir lui
demander **ce qui tourne sur son appareil** et obtenir une réponse en une
phrase. Aujourd'hui rien ne le dit : l'application n'expose aucun numéro de
version, et une PWA continue de servir son ancienne version tant que le service
worker n'a pas passé la main. Un rapport de défaut porte donc sur un logiciel
qu'on n'identifie pas — et une correction déployée n'est pas une correction
reçue.

Ce lot rend deux choses lisibles au comptoir : **quelle version tourne ici**, et
**s'il en existe une plus récente qui attend**.

---

## Ce qui existe déjà, et qui n'est pas à refaire

- **La maquette le demande déjà.** `a1:25` pose le pied de la page de connexion
  à « SDI · version 12 ». C'est le seul endroit des maquettes où un numéro
  apparaît. Le produit y écrit « SDI » tout court
  (`app/(auth)/login/page.tsx:232`). L'audit le classe **manque de données**,
  pas défaut de rendu (`AUDIT-CONFORMITE-MAQUETTES.md:102`, entrée A1.3) — il
  ne manquait pas une ligne de mise en page, il manquait un numéro à afficher.
- **L'endroit où le lire une fois connecté existe aussi.** Les réglages ont une
  section « Cet appareil » (`app/(app)/parametres/page.tsx:179-188`) qui ne
  contient aujourd'hui que la synchronisation, sous la phrase « Cette page est
  propre à l'appareil du comptoir ». C'est exactement la nature d'un numéro de
  version : une propriété de l'appareil, pas de l'entreprise.
- **L'écran de diagnostic** (`app/(app)/diagnostic/page.tsx`) se décrit lui-même
  comme « l'écran vers lequel envoyer un gérant qui demande *est-ce que c'est
  parti ?* ». C'est déjà l'écran d'assistance téléphonique du produit.
- **Le service worker est en place et se met à jour à chaque build.**
  `next.config.ts` calcule une `REVISION` par compilation, et `app/sw.ts`
  déclare `skipWaiting: true` et `clientsClaim: true`. La mécanique de
  remplacement existe donc ; ce lot ne l'invente pas, il en expose l'état — et
  pose la question 5 sur le réglage qu'elle a aujourd'hui.
- **`package.json` porte déjà un champ `version`** (`0.1.0`), que rien ne lit et
  que rien n'a jamais incrémenté.

Rien de tout cela ne se réécrit. Ce lot ajoute un numéro, deux endroits où le
lire, et une phrase quand une version plus récente attend.

---

## D'où vient la forme

De `a1:25` pour la connexion — « SDI · version 12 », en pied, dans la fonte de
code déjà utilisée là (`font-code text-micro tracking-widest text-coquille-muet`).

Pour l'écran connecté, aucune maquette ne montre de version : la forme se déduit
de la section qui l'accueille. « Cet appareil » est une section de faits, et le
produit a déjà son patron pour ça — la liste `<dl>` de couples titre/valeur
(`Fait`, utilisé juste en dessous par « Votre compte »).

---

## Les cinq questions, et ce qu'elles pèsent

**Aucune n'est technique.** Chacune change ce que le numéro *veut dire* pour
celui qui le lit à voix haute au téléphone. Elles sont posées avant la première
ligne de code, avec une recommandation, conformément à la façon de travailler du
projet.

### 1. Le numéro est-il un entier, une date, ou une empreinte ?

La maquette dit « version 12 » : un entier. C'est le format qu'on lit au
téléphone sans épeler. Trois options :

| Option | Ce qu'on dit au téléphone | Ce qu'on y perd |
|---|---|---|
| **(a) Entier** — « version 12 » | Court, mémorisable, se note à la main | Ne dit pas *quand* ; il faut une table qui relie 12 à un contenu |
| **(b) Date de build** — « version du 10 septembre » | Jamais fausse, jamais oubliée | Deux déploiements le même jour portent le même nom |
| **(c) Empreinte git** — « version 48cab17 » | Identifie exactement le code | Illisible à voix haute, impossible à noter sans faute |

**Recommandation : (a), l'entier de la maquette, en pied de connexion — et
l'entier *plus* la date de build et l'empreinte courte sur l'écran connecté.**
Le gérant dit « version 12 » ; celui qui dépanne, s'il en a besoin, lui fait
lire la ligne complète. Les trois formats ne s'opposent pas, ils s'adressent à
deux lecteurs (D78).

### 2. Qui incrémente l'entier, et quand ?

Un numéro posé à la main peut être oublié. Un numéro oublié **ment** : deux
logiciels différents disent le même nombre, et le dépannage repart sur une
fausse piste. C'est le risque propre de ce lot, et il est plus grave que
l'absence de numéro qu'il vient corriger.

- **(a) À la main, dans le commit qui ferme un lot.** Le geste rejoint ceux qui
  existent déjà à la fermeture : la décision dans `DECISIONS.md`, la ligne dans
  `specs/ROADMAP.md`. Un numéro par lot livré — « version 12 » veut dire
  « le produit tel qu'il était à la fin du douzième lot ».
- **(b) Automatiquement, depuis le build.** Impossible à oublier, mais il n'y a
  pas de compteur monotone fiable à disposition : Vercel expose une empreinte
  de commit, pas un numéro de build croissant. L'automatisme ne produit donc
  pas un entier, il produit (b) ou (c) de la question 1.

**Recommandation : (a), à la main — mais jamais seul.** La date de build,
elle, est automatique et ne s'oublie pas. Si l'entier est oublié, deux versions
diront « 12 » avec deux dates différentes, et la date tranchera. L'oubli dégrade
la précision au lieu de fabriquer un mensonge. C'est ce qui rend (a) tenable.

### 3. Où le numéro se lit-il ?

- **(a) Connexion seulement**, comme la maquette. Strictement conforme, mais le
  gérant qui appelle est connecté depuis trois jours — il n'a pas vu cet écran.
- **(b) Connexion + « Cet appareil » dans les réglages.** Deux endroits, deux
  lecteurs : l'un avant d'entrer, l'autre quand on cherche.
- **(c) En permanence dans la coquille**, sous le pied de la colonne. Un numéro
  sous les yeux de quelqu'un qui n'en a jamais besoin, tous les jours.

**Recommandation : (b).** (c) met un chiffre de dépannage dans le décor
quotidien du comptoir ; les maquettes ne le demandent nulle part, et le pied de
la colonne dit déjà qui est connecté.

### 4. Le produit dit-il qu'une version plus récente attend ?

C'est le vrai contenu de ce lot. Un numéro seul répond à « qu'est-ce qui
tourne ? » ; il ne répond pas à « pourquoi la correction déployée hier ne
change rien ici ? ».

- **(a) Le numéro seul.** Le plus petit. Laisse entière la moitié pénible du
  problème : personne au comptoir ne sait que son appareil est en retard.
- **(b) Le numéro, plus une phrase quand une version est prête, plus un bouton
  qui recharge.** Le rapport de défaut se transforme en correction reçue en un
  geste, pendant l'appel.

**Recommandation : (b).** C'est ce que la ligne de la roadmap promet — « une
PWA garde son ancienne version jusqu'à ce que le service worker passe la
main ». Discret : une phrase et un bouton dans « Cet appareil », rien qui
s'interpose, rien qui clignote au milieu d'une vente.

### 5. Une mise à jour peut-elle emporter une saisie en cours ?

**Cette question est la sensible, et elle porte sur un réglage qui existe déjà
aujourd'hui.** `app/sw.ts` déclare `skipWaiting: true` avec `clientsClaim:
true` : dès qu'un nouveau service worker est installé, il prend la main sur les
onglets ouverts. La page continue d'exécuter le code déjà chargé, mais tout
morceau de code demandé *ensuite* — une navigation, un panneau qui s'ouvre —
est cherché dans le nouveau cache, où l'ancien fichier n'existe plus. Le geste
échoue alors sans rien dire d'utile, et il échoue **au pire moment possible :
celui où le gérant vient de changer d'écran, donc en pleine saisie**.

Ce n'est pas un défaut introduit par ce lot ; c'est un défaut que ce lot est le
premier à regarder en face, parce qu'il est le premier à s'occuper des versions.

- **(a) Ne pas y toucher.** Hors périmètre déclaré, entrée de backlog.
- **(b) Retirer `skipWaiting` : la nouvelle version s'installe et attend.**
  L'onglet ouvert finit sa journée sur la version avec laquelle il l'a
  commencée — cohérente d'un bout à l'autre. Elle passe au rechargement
  suivant, que le bouton de la question 4 rend explicite.

**Recommandation : (b).** Une mise à jour n'a aucune raison de s'imposer à un
comptoir en train de vendre ; c'est l'esprit de D76, où un geste au comptoir
n'attend et ne subit rien du serveur. Et (b) rend (4b) nécessaire plutôt que
décoratif : sans bouton, une version qui attend attendrait indéfiniment.

**C'est le seul point de ce lot qui touche à un comportement déjà en
production.** Il ne se tranche pas seul.

---

## Ce qui a été tranché

**Les cinq réponses suivent les cinq recommandations.** Ce n'est pas le cas
habituel — en S22, c'est la réponse qui allait *contre* la recommandation qui a
produit la décision la plus utile (D83). Ici l'accord est complet, y compris sur
le point sensible.

1. **L'entier de la maquette**, en pied de connexion. La date de build et
   l'empreinte courte l'accompagnent, mais seulement sur l'écran connecté : deux
   lecteurs, deux textes (D78).
2. **L'entier se pose à la main**, dans le commit qui ferme un lot, à côté de la
   décision et de la ligne de roadmap. La date, elle, est automatique et rattrape
   l'oubli.
3. **Deux endroits** : le pied de connexion et la section « Cet appareil » des
   réglages. Pas dans la coquille.
4. **Le produit annonce la version qui attend**, avec un bouton qui recharge.
5. **`skipWaiting` est retiré.** Une mise à jour n'interrompt jamais une saisie
   en cours ; elle attend le rechargement, que le bouton de la réponse 4 rend
   explicite. C'est le seul point de ce lot qui change un comportement déjà
   déployé, et c'est pour cela qu'il a été posé en question plutôt que décidé.

**Un arbitrage n'a pas été posé en question, parce qu'il ne change le sens de
rien : le premier numéro est 1.** Le produit a connu une vingtaine de lots, mais
aucun ne s'annonçait — on ne peut pas désigner au téléphone une version qui n'a
jamais dit son nom. « Aucun numéro affiché » devient donc une information
exacte et utile : *plus ancien que la version 1*. Numéroter 20 pour honorer une
histoire que le produit ne sait pas restituer serait une précision inventée.

---

## Conception

*Rédigé sous les réponses ci-dessus.*

**Le domaine d'abord, sans horloge et sans navigateur.** `lib/domain/version.ts`
compose ce qui s'affiche à partir de trois entrées brutes — l'entier, l'horodatage
de build, l'empreinte courte — et rend deux textes : la ligne courte de la
connexion et la ligne complète de l'écran connecté. C'est là que se figent les
arbitrages : ce qu'on affiche quand l'empreinte manque (build local), ce qu'on
affiche quand la date manque, et le fait qu'un entier absent ne s'invente pas.
Un test par arbitrage, qui le nomme.

**Les valeurs entrent à la compilation, pas à l'exécution.** `next.config.ts`
les pose en `NEXT_PUBLIC_*` : l'entier vient d'un fichier `VERSION` d'une ligne
à la racine, la date de l'instant du build, l'empreinte de
`VERCEL_GIT_COMMIT_SHA` sinon de `git rev-parse`.

*Pourquoi un fichier plutôt que le champ `version` de `package.json`* : ce
champ existe déjà, vaut `0.1.0`, ne veut rien dire pour un paquet privé, et
n'accepte pas un entier nu — npm attend un semver. Poser « 12 » à côté de
« 0.1.0 » mettrait deux nombres qui se disent tous les deux la version, ce qui
est exactement la confusion que ce lot existe pour supprimer. Un fichier d'une
ligne se lit sans ambiguïté par qui ferme un lot.

Elles sont donc dans le paquet, lisibles **hors ligne** — ce qui est
la seule façon acceptable ici : l'écran qui dit la version doit fonctionner
quand rien ne fonctionne, puisque c'est l'écran qu'on ouvre quand rien ne
fonctionne. Corollaire connu du projet : `NEXT_PUBLIC_*` est figé à la
compilation, un `npm run dev` déjà lancé ne verra pas le changement.

**L'état de mise à jour vient du registre du service worker**, pas d'une requête
réseau : `registration.waiting` non nul veut dire qu'une version est prête. Un
petit module de `lib/reseau/` l'écoute et le rend en état React, sur le modèle
de `etat-reseau.ts`. Le bouton envoie `SKIP_WAITING` au service worker en
attente puis recharge la page — c'est-à-dire que `skipWaiting` cesse d'être une
option de compilation posée une fois pour toutes et devient **un geste du
comptoir**, au moment choisi par celui qui tient la caisse.

**Aucune écriture, aucune lecture Firestore, aucune règle nouvelle.** Ce lot ne
touche à aucune donnée métier : il n'y a rien à cloisonner et rien à protéger
côté serveur. C'est ce qui en fait un petit lot.

**Les deux écrans** : le pied de `login/page.tsx` passe de « SDI » à « SDI ·
version N » ; « Cet appareil » gagne une liste `<dl>` de faits au-dessus de son
lien de synchronisation, et la phrase de mise à jour quand il y en a une.

---

## Hors périmètre, et pourquoi

- **Un historique des versions dans l'application.** Ce qui a changé se lit dans
  `git log` et dans `specs/ROADMAP.md` ; personne au comptoir ne le demandera.
- **Une mise à jour forcée à distance.** Il faudrait un canal serveur, donc une
  lecture en ligne, pour un produit dont la promesse est de marcher sans réseau.
- **Un rapport de défaut envoyé depuis l'application.** C'est un autre lot, et
  il n'a pas été demandé. Le téléphone est le canal, et ce lot lui donne ce qui
  lui manquait.
- **Renommer le compte affiché** — c'est S33, qui touche la même zone d'écran
  et reste séparé.

---

## Ce qui prouvera que c'est fait

- [ ] Le pied de la page de connexion affiche « SDI · version N », avec la même
      classe typographique que la maquette `a1:25`.
- [ ] Les réglages, section « Cet appareil », affichent la version, la date de
      build et l'empreinte courte.
- [ ] Les trois valeurs sont lisibles **avec le réseau coupé** (test bout en
      bout hors ligne).
- [ ] Quand une nouvelle version est installée et en attente, l'écran le dit et
      propose de recharger ; après rechargement, le numéro affiché a changé.
- [ ] Une saisie en cours n'est jamais interrompue par l'arrivée d'une nouvelle
      version (dépend de la réponse à la question 5).
- [ ] Les tests d'unité nomment chaque arbitrage de `lib/domain/version.ts`,
      y compris les cas dégradés (pas d'empreinte, pas de date).
- [ ] Le rendu est **regardé** en clair et en sombre, sur les deux écrans,
      capture à l'appui — et confronté à `a1-connexion.html` ouvert à côté.
- [ ] La vérification passe par un **build réel**, pas par `npm run dev` : le
      service worker n'existe qu'en production, et les `NEXT_PUBLIC_*` ne sont
      figés qu'à la compilation.

---

## Ce qui a été livré

*À remplir à la fermeture.*
