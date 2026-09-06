# CAHIER-UI.md — Cahier des charges de la refonte d'interface

```
PROJET     : SDI — gestion multi-boutique pour Sandwidi et frère (Burkina Faso)
OBJET      : refonte complète de l'architecture de l'information, de la disposition
             et de l'identité visuelle de l'application. Pas un habillage : une refonte.
STATUT     : à faire — commence par la phase 1 (maquettes), rien d'autre
DESTINÉ À  : l'agent qui reprend le projet dans une fenêtre de contexte neuve
```

---

## 0. Comment lire ce document

Ce fichier est au design ce que `prompt.md` est au fonctionnel : **le cahier des charges**. Il ne
remplace aucun contrat. L'ordre de préséance de `AGENTS.md` reste entier :

**`AGENTS.md` > `WORKFLOW.md` > `DESIGN.md` · `SECURITY.md` · `ARCHITECTURE.md` > ce fichier**

`DESIGN.md` dit *comment on travaille une interface*. Ce fichier dit *quelle interface, pour qui,
et ce qui est ouvert ou verrouillé*. En cas de contradiction, `DESIGN.md` l'emporte — et si ce
fichier te pousse vers un des trois patterns génériques de `DESIGN.md` §1, c'est ce fichier qui a
tort.

**À lire avant d'écrire une ligne**, dans cet ordre : `AGENTS.md`, `DESIGN.md` en entier,
`prompt.md` §1, §4, §13 et §14, puis la section 12 de ce document — « ce qu'il ne faut pas casser ».

**La phase 1 ne produit aucun code applicatif.** Elle produit des maquettes HTML statiques que le
commanditaire ouvrira dans son navigateur. On n'écrit pas une ligne de React tant qu'elles ne sont
pas validées. C'est une exigence explicite du client, pas une suggestion de méthode.

---

## 1. Le contexte réel

**L'entreprise.** Sandwidi et frère vend des motos neuves et d'occasion au Burkina Faso, sur
plusieurs boutiques, plus une boutique de pièces détachées. Le métier est porté par le magasin
physique : une boutique vend des motos, ou des pièces, ou les deux (D62).

**Qui utilise l'application.**

| Personne | Ce qu'elle fait | Ce qu'elle sait de l'informatique |
|---|---|---|
| **Le gérant** | Encaisse, vend, entre des motos en stock, suit les cartes grises. Toute la journée, un client en face. | Sait se servir de WhatsApp et d'Orange Money. Rien de plus. Ne lira jamais une notice. |
| **Le responsable** | Pilote plusieurs boutiques, arbitre, contrôle les chiffres. C'est lui le commanditaire. | Confortable, mais impatient : il veut voir l'état de son commerce en une seconde. |
| **Le client final** | Suit ses papiers depuis un lien reçu par WhatsApp. Post-MVP (S13). | Téléphone bas de gamme, connexion pauvre. |

**L'appareil de référence a changé.** Le produit a été dessiné mobile d'abord. **La cible est
désormais l'ordinateur** : écran 1280 à 1920 px, souris, clavier. C'est le poste du comptoir et
celui du responsable.

Le mobile ne disparaît pas — l'application reste une PWA installée, utilisable debout à côté d'une
moto — mais il n'est plus ce qui dicte la forme. Concrètement : **on dessine le bureau d'abord, et
on replie vers le mobile**, au lieu d'étirer un écran de téléphone.

**Le réseau est intermittent.** L'application fonctionne hors ligne : les saisies sont gardées sur
l'appareil et partent seules. Ce fait doit rester lisible en permanence — c'est la promesse
centrale du produit (`AGENTS.md`, D66).

**Ce qui est en jeu.** Le client a fait un investissement important et attend un logiciel qui ait
l'air d'un vrai logiciel. Le niveau visé est celui d'une bonne agence, pas celui d'un prototype
propre. Un gérant qui ouvre l'écran doit savoir quoi faire sans qu'on le lui explique.

---

## 2. Le diagnostic — ce qui ne va pas aujourd'hui

Ce n'est pas un problème de couleurs. C'est un problème de **structure**. Constats du
commanditaire, vérifiés dans le code :

1. **La barre latérale est vide.** Sur grand écran, `components/NavigationPrincipale.tsx` rend un
   rail de 224 px contenant trois à cinq liens, puis 90 % de vide vertical. Un rail qui ne porte
   rien n'est pas une navigation, c'est une marge.

2. **Tout est tassé au centre.** `app/(app)/layout.tsx` borne le contenu à `max-w-3xl` — 768 px —
   quel que soit l'écran. Sur un 1920, deux tiers de la surface ne servent à rien pendant que les
   listes se compriment. C'est un réglage mobile appliqué au bureau.

3. **La navigation est plate et amnésique.** Cinq entrées de même rang. À l'intérieur de l'espace
   motos, sept écrans (stock, entrée en stock, ventes, nouvelle vente, paiements, dossiers, reçus)
   n'apparaissent dans aucune navigation : on y arrive par des liens dispersés, et rien ne dit où
   l'on est.

4. **Aucune hiérarchie visuelle.** Chaque écran est la même chose : un titre `text-2xl`, un
   paragraphe gris, une liste dans un cadre à bord fin. Rien n'attire l'œil vers l'action
   principale. Le gérant ne peut pas deviner que « Nouvelle vente » est le geste du jour.

5. **La marque est absente.** Le logo de l'entreprise n'apparaît nulle part dans l'interface. Rien
   ne distingue cet écran d'un gabarit d'administration générique.

6. **Les tableaux n'existent pas.** Tout est en listes empilées, y compris des données qui se
   comparent colonne par colonne (stock, ventes, paiements). Sur un bureau, c'est un gaspillage de
   lecture.

7. **Aucun raccourci.** Pas de recherche globale, pas de raccourci clavier, pas d'action rapide.
   Sur un poste fixe utilisé huit heures par jour, c'est ce qui sépare un outil d'un formulaire.

**Ce qui marche déjà et mérite d'être gardé** — ne jette pas au nom de la nouveauté :

- Le **bandeau d'état** répond en permanence aux deux questions qui coûtent cher : *où j'écris* et
  *est-ce que c'est parti*. L'idée est juste ; c'est sa forme qui est à revoir.
- Le **vocabulaire** est bon : « Faire entrer une moto », « La moto reste au magasin jusqu'au
  dernier versement ». Les libellés du domaine (`lib/domain/*.ts`) sont écrits du point de vue du
  commerçant. **Reprends-les mot pour mot dans les maquettes.**
- Le **reçu imprimé** (`components/Recu.tsx` + la feuille `@media print`) fonctionne et sort
  correctement sur le papier.

---

## 3. Le mandat, et ses limites

### Ce qui est ouvert — tu peux tout remettre en question

- L'architecture de l'information complète : espaces, groupes, ordre, profondeur.
- La façon dont on accède aux espaces, et ce que voit chaque rôle.
- La coquille : barre latérale, en-tête, zone de travail, panneaux, modales.
- La palette, la typographie, l'échelle d'espacement, les rayons, les ombres, la densité.
- La signature visuelle du produit — aujourd'hui, la plaque d'immatriculation.
- Les patrons d'écran : liste ou tableau, page ou panneau latéral, formulaire long ou étapes.
- L'ajout de raccourcis clavier, d'une recherche globale, d'actions rapides.
- Le renommage d'un intitulé de navigation, si un mot est plus juste.

### Ce qui est verrouillé

- **Les règles métier.** Aucune ne bouge. Ne touche pas à `lib/domain/`, `firestore.rules`,
  `functions/`. Si une idée d'interface exige un changement de règle, écris-la dans les questions
  ouvertes — ne l'implémente pas.
- **Le français, et le vouvoiement.** Montants en FCFA entiers, sans décimales.
- **Le hors-ligne.** Aucun écran ne doit exiger le réseau, sauf ceux qui le disent déjà — envoi de
  fichier, création de compte. Voir §11.
- **Le cloisonnement des coûts et des marges** hors de portée du gérant (D2). Une maquette qui
  montre une marge à un gérant est un défaut de sécurité, pas une variante graphique.
- **Les non-négociables de `DESIGN.md`** : accessibilité, tous les états, zéro emoji brut,
  contraste AA, jamais la couleur seule.
- **Le rendu imprimé du reçu.** Il ne régresse pas. Voir §11.

---

## 4. La marque

### Le logo

Le client a fourni deux logos (`CamScanner 08-23-2026 13.22.pdf`). **C'est le second qui fait
foi.** Les deux sont extraits du PDF et disponibles :

- `design/marque/logo-se-fond-sombre.jpg` — **la référence**. Monogramme « SE » : le S et le E
  fondus en une seule forme, remplis d'un dégradé horizontal or → orange → rouge, posés sur un
  bleu nuit profond, avec une goutte bleue cyan → bleu qui part vers la gauche.
- `design/marque/logo-se-relief-mur.jpg` — le premier logo, gravé sur un mur, bleu et gris
  ardoise. Secours uniquement.

**Premier travail de la phase 1 : redessiner ce monogramme en SVG propre.** Le JPEG est un scan,
il ne peut pas servir dans l'interface. Un SVG net, un chemin par forme, les dégradés en
`linearGradient`, plus une variante monochrome pour le reçu imprimé et le favicon.

### Les couleurs de marque

Relevées à l'œil sur le scan. **Vérifie-les à la pipette sur le fichier** avant de les figer, et
ajuste-les si le contraste AA l'exige.

| Rôle | Valeur approchée | Usage |
|---|---|---|
| Nuit | `#14142B` | fond du logo, et candidat pour la coquille sombre |
| Or | `#E0A81A` | départ du dégradé du monogramme |
| Orange | `#DD7A28` | milieu |
| Rouge | `#C93C2E` | fin du dégradé |
| Cyan | `#2E9BC4` | départ de la goutte |
| Bleu | `#1F52A8` | fin de la goutte |

**Règle d'emploi du dégradé** : il appartient au monogramme. Un dégradé or → rouge étalé sur des
boutons, des cartes ou un en-tête est exactement le tic que `DESIGN.md` §1 interdit. Il peut
apparaître comme filet, comme accent d'un pixel, ou dans le logo — jamais comme fond de section.

### L'arbitrage à trancher : le jaune de plaque

Le produit a aujourd'hui une direction assumée et documentée dans `app/globals.css` : *le monde du
sujet est la plaque d'immatriculation, caractères noirs sur fond jaune* (`#f5c518`). C'est de là
que vient l'accent, et le bandeau hors-ligne devient une plaque jaune pleine.

Ce jaune et le dégradé or du logo se disputent le même registre. **Tranche, et consigne ta décision
dans `DECISIONS.md`.** Recommandation, à contredire si tu as mieux :

> La marque tient la **coquille** — barre latérale, en-tête, écran de connexion, favicon, en-tête
> du reçu. Le jaune de plaque cesse d'être une couleur de marque et redevient **un seul signal** :
> le code boutique et l'état hors ligne. Un signal qui n'apparaît qu'à deux endroits reste un
> signal ; un signal partout n'est plus qu'une couleur.

Si tu retires le jaune entièrement, tu dois lui trouver un remplaçant aussi peu ambigu pour dire
« hors ligne » d'un coup d'œil, en plein soleil, sans lire. Ce n'est pas une contrainte de goût :
c'est la seule erreur du produit qui détruit des données au lieu d'agacer.

### Le nom

Le dépôt appelle le produit **SDI**, le logo dit **SE**, l'entreprise s'appelle **Sandwidi et
frère**. Question ouverte (§19). En attendant : le monogramme SE est la marque, « SDI » reste le
nom de l'application. Ne fabrique pas un troisième nom.

---

## 5. La direction à établir

Avant de dessiner un seul écran, remplis le bloc de `DESIGN.md` §2 et **écris-le en tête du
livrable**. Il devient la référence de tous les écrans, et le client doit pouvoir le lire.

```
SUJET      : Quoi exactement, pour qui, et quel est le job unique de chaque écran ?
PALETTE    : 4 à 6 hex nommés, dérivés du logo et du métier — pas d'un défaut.
TYPO       : 2 à 3 rôles. Aujourd'hui : Archivo (display + body) et IBM Plex Mono
             (codes, plaques, châssis). Tu peux changer, mais dis pourquoi.
LAYOUT     : le concept d'agencement en une phrase, plus un wireframe ASCII.
SIGNATURE  : l'élément unique dont le client se souviendra.
```

Trois garde-fous propres à ce projet :

- **Pas de crème + serif + terracotta.** Pas de noir + un accent acide. Pas de layout « journal ».
  Ce sont les trois tells de `DESIGN.md` §1.
- **Pas de tableau de bord à cartes vides.** Les chiffres de supervision sont la spec S24, ils
  n'existent pas encore. Maquetter des cartes à zéro produit un tableau de bord qui ment — le
  projet a déjà tranché ce point deux fois (D63). Dessine la *place* des chiffres, avec des données
  factices crédibles, et dis clairement dans la galerie que c'est un aperçu.
- **La signature doit venir du métier.** La plaque, le numéro de châssis, le carnet de reçus à
  souches, la fiche de dossier, le compteur kilométrique : le sujet a ses propres objets. Puise là,
  pas dans une bibliothèque de composants.

---

## 6. L'architecture de l'information — le cœur du travail

C'est ici que se joue « le site n'est pas intuitif ». Le reste est de l'exécution.

### 6.1 Ce qui existe aujourd'hui

Deux rôles seulement (`lib/domain/roles.ts`) : `responsable` et `gerant`. Les accès client et
prestataire passent par un lien à jeton, sans compte — ils ne sont pas concernés ici.

Six espaces (`lib/domain/espaces.ts`), rendus à plat :

| Espace | Route | Visible par |
|---|---|---|
| Supervision | `/supervision` | le responsable seul |
| Accueil | `/dashboard` | le gérant seul |
| Motos | `/motos` | si le périmètre porte le métier motos |
| Pièces | `/pieces` | si le périmètre porte le métier pièces |
| Caisse | `/caisse` | tous |
| Réglages | `/parametres` | tous |

Et **sous** ces espaces, des écrans qui n'apparaissent dans aucune navigation :

```
/motos                    Stock motos            /parametres/entreprise     Entreprise
/motos/nouvelle           Faire entrer une moto  /parametres/boutiques      Boutiques
/motos/ventes             Ventes                 /parametres/utilisateurs   Utilisateurs
/motos/ventes/nouvelle    Nouvelle vente         /parametres/catalogue      Marques et modèles
/motos/paiements          Paiements              /parametres/referentiels   Provenances et frais
/motos/dossiers           Dossiers en attente    /parametres/prestataires   Prestataires
/motos/recus              Reçus                  /diagnostic                Synchronisation
/clients                  Clients                /pieces  /caisse           à venir (S20-S22)
```

Quinze écrans réels, une barre à cinq entrées, aucun second niveau. **C'est le défaut n°1.**

### 6.2 Ce qu'on attend de toi

Redessine l'architecture entière. Elle doit répondre à quatre questions, à tout instant et sans
cliquer :

1. **Où suis-je ?** — quel espace, quel écran, quelle boutique.
2. **Où puis-je aller ?** — tous les écrans de mon espace, visibles, pas devinés.
3. **Que dois-je faire maintenant ?** — l'action principale de l'écran saute aux yeux.
4. **Est-ce que mon travail est enregistré ?** — l'état de synchronisation, toujours lisible.

**La barre latérale doit porter le second niveau.** C'est la réponse directe au « la side bar est
vide ». Une piste, à valider ou à remplacer : un rail d'espaces étroit avec le logo en haut, et à
sa droite une colonne qui liste les écrans de l'espace courant, groupés par intention
(*Vendre* · *Suivre* · *Administrer*). Deux colonnes tiennent la gauche, la zone de travail prend
tout le reste.

Autres pistes légitimes, si tu les défends mieux : navigation supérieure à onglets avec sous-barre
contextuelle ; rail unique avec sections repliables ; palette de commandes qui prend le relais du
second niveau. **Le seul interdit est de reconduire une barre à cinq liens et du vide.**

### 6.3 Les rôles, à repenser aussi

Tu peux revoir la façon dont les espaces s'ouvrent, à condition de respecter trois faits :

- Le gérant **ne doit jamais** voir les coûts d'achat, les marges, les autres boutiques, ni la
  gestion des utilisateurs. C'est cloisonné en base, pas seulement à l'écran (D2).
- Le responsable doit pouvoir **changer de périmètre** — une boutique, ou toutes — et voir en
  permanence sur laquelle il travaille. Le sélecteur ne se cache pas dans un menu : on le lit là où
  on lit la réponse.
- Un gérant sans boutique attribuée, un compte sans rôle, une entreprise sans boutique : ces trois
  états existent et ont chacun leur écran. Ils ne disparaissent pas dans la refonte
  (`components/InvitationBoutique.tsx`, l'état `sans_role`, D68 bis).

Si tu penses qu'il faut un troisième rôle, un mode « caissier », ou que les réglages devraient
sortir de la barre principale : propose-le dans les questions ouvertes, chiffré en écrans. Ne le
construis pas de ta propre autorité.

---

## 7. La coquille bureau

Ce que la refonte doit installer — à défendre ou à améliorer :

- **Largeur.** Le contenu occupe la largeur disponible, avec une borne haute honnête (autour de
  1600 px, à toi de trancher) pour ne pas étirer les lignes de texte. Le `max-w-3xl` posé sur tout
  l'espace de travail disparaît. Les blocs de prose gardent leur `max-w-prose` : c'est une limite
  de lisibilité, pas de mise en page.
- **Densité.** Le bureau supporte plus d'information que le téléphone. Les cibles restent
  confortables, mais 56 px de hauteur de ligne partout est un réglage tactile appliqué à une
  souris. Prévois deux densités si tu le juges utile, sans en faire un réglage utilisateur.
- **Points de rupture.** ≥ 1280 : la disposition de référence. 1024–1280 : la colonne de second
  niveau peut se réduire aux icônes. 768–1024 : tablette, le rail se replie. < 768 : mobile,
  navigation basse dans la zone du pouce — l'acquis actuel, à préserver.
- **Zone d'action fixe.** Un formulaire long garde son bouton de validation visible : barre
  d'action collée en bas de la zone de travail, pas à deux mille pixels de défilement.
- **Panneaux plutôt que pages** quand le contexte compte. `FicheVente` et `FicheMoto` sont déjà des
  panneaux ; sur bureau, un panneau latéral qui garde la liste visible à gauche vaut mieux qu'une
  navigation aller-retour.
- **Raccourcis.** Recherche globale (`/` ou `Ctrl+K`), création rapide, navigation au clavier entre
  les espaces. À dessiner, pas seulement à mentionner.

---

## 8. Les patrons d'écran

Fixe-les une fois, applique-les partout. Un produit se reconnaît à ses patrons, pas à ses pages.

1. **Liste / tableau** — stock, ventes, paiements, reçus, clients, dossiers. Sur bureau : un vrai
   tableau, colonnes alignées, chiffres tabulaires (déjà actif globalement), en-têtes collés, tri,
   filtres persistants et lisibles, comptage des résultats. Sur mobile : repli en cartes.
2. **Fiche / détail** — une vente, une moto, un client. Identité en haut, faits ensuite, actions
   groupées et hiérarchisées : une principale, le reste discret. Les actions destructives ou
   irréversibles se distinguent sans crier.
3. **Formulaire** — entrée en stock, nouvelle vente, versement. Groupes courts et titrés, une
   colonne pour la saisie (jamais deux champs côte à côte s'ils se lisent en séquence), erreurs au
   champ **et** en tête, bouton qui dit ce qui se passe, conséquence annoncée avant la validation.
   `EFFET_MODE` dans `lib/domain/vente.ts` en est le bon exemple : garde-le.
4. **Hub** — supervision, accueil gérant, réglages. Choix clairs, hiérarchie assumée, pas une
   grille de cartes équivalentes qui laisse le regard sans point d'entrée.
5. **Feuille imprimée** — le reçu. Patron à part, aucune coquille, papier blanc. Voir §11.

---

## 9. Les écrans à maquetter

**Groupe A — obligatoire pour la revue.** Rien n'est validé sans ces neuf écrans.

| # | Écran | Rôle | Le job de l'écran |
|---|---|---|---|
| A1 | Connexion | — | Entrer, et comprendre un refus : mauvais identifiants, compte sans rôle, réseau absent. Premier contact avec la marque. |
| A2 | Supervision | responsable | Choisir ce que je regarde — toutes les boutiques, ou une — et voir d'un coup l'état du commerce. |
| A3 | Accueil gérant | gérant | Savoir ce que je fais aujourd'hui, et atteindre l'action du jour en un clic. |
| A4 | Stock motos | les deux | Retrouver une moto, savoir ce qui est disponible, en faire entrer une. |
| A5 | Nouvelle vente | les deux | Le geste central du produit : client, moto, prix, mode de paiement, premier versement. Long, doit rester serein. |
| A6 | Ventes (liste) + fiche vente | les deux | Retrouver une vente, voir ce qui reste dû, encaisser, imprimer, avancer les documents. |
| A7 | Dossiers en attente | les deux | Savoir qui détient quel papier, et ce qui est en retard. |
| A8 | Paiements — dettes et tranches | les deux | Qui doit quoi, et quelles motos sont retenues au magasin. |
| A9 | Réglages | responsable | Atteindre les six écrans d'administration sans les chercher. |

**Groupe B — la coquille et les états.** À livrer comme variantes des écrans du groupe A, pas comme
des pages séparées :

- B1 · barre latérale complète, espace motos, gérant — B2 · idem, responsable, périmètre « toutes »
- B3 · hors ligne, avec des saisies en attente — B4 · vide : aucune boutique, aucune vente
- B5 · chargement — B6 · erreur de lecture — B7 · refus d'accès expliqué
- B8 · mobile, largeur 390 px, deux écrans au choix — B9 · thème sombre, deux écrans au choix

**Groupe C — aperçu de la suite.** Optionnel mais souhaité : le client veut voir l'application
entière. Ces écrans ne seront pas implémentés dans cette refonte.

- C1 · Espace pièces — catalogue, vente au comptoir (S20/S21)
- C2 · Caisse — journal du jour, clôture (S22)
- C3 · Supervision avec ses chiffres (S24)
- C4 · Le reçu, rendu papier — existant, à revoir seulement s'il y gagne

**Marque-les sans ambiguïté comme un aperçu** dans la galerie, pour que personne ne les prenne pour
du travail livré.

---

## 10. Les états, tous dessinés

`DESIGN.md` §10 est non négociable. Pour chaque écran maquetté, tu dois avoir répondu :

- **vide** — une invitation à agir, jamais un trou ;
- **chargement** — pas un écran blanc, pas un saut de mise en page ;
- **clairsemé** (deux lignes) et **dense** (deux cents lignes) ;
- **erreur** — dit ce qui s'est passé et comment le corriger, ne s'excuse pas, et n'accuse aucune
  cause qu'il n'a pas vérifiée. Leçon coûteuse du projet : un message « pas de réseau » s'affichait
  pour un mot de passe faux ;
- **permission refusée** — explique, et propose une sortie ;
- **désactivé** — dit *pourquoi*, avant le geste, pas après l'échec ;
- **hors ligne** — le cas normal, pas une avarie ;
- **en attente d'envoi** — une saisie enregistrée localement se voit ;
- **destructif** — une confirmation qui nomme ce qui va disparaître.

Le livrable de la phase 1 doit montrer au moins : vide, chargement, erreur, hors ligne, refus.

---

## 11. Les non-négociables

**Accessibilité** (`DESIGN.md` §11) — focus clavier visible partout, tous les parcours réalisables
au clavier, noms accessibles corrects, décor masqué de l'arbre d'accessibilité, contraste AA
minimum, ordre de tabulation qui suit l'ordre visuel, pièges de focus gérés dans les panneaux et
les modales.

**Jamais la couleur seule.** Un retard, un statut, un métier, un moyen de paiement s'écrivent. Le
soleil sur un écran bon marché efface les nuances ; le daltonisme aussi.

**Zéro emoji brut.** Icônes `lucide-react` uniquement — la dépendance est déjà installée. Toute
icône porteuse de sens a un équivalent textuel.

**Chiffres tabulaires** sur tout ce qui s'aligne ou se compare. Déjà global dans `globals.css` : ne
le défais pas.

**Typographie française** — guillemets « … », apostrophe courbe ’, espace insécable avant les
signes doubles, le caractère … et non trois points. Le dépôt le fait déjà partout.

**Le hors-ligne.** Aucun écran n'exige le réseau, sauf l'envoi de fichier et la création de compte,
qui l'annoncent **avant** le geste — `components/PapiersMoto.tsx` est le modèle. Une maquette qui
suppose une connexion permanente est hors sujet.

**L'impression.** Le reçu est le seul rendu du produit qui devient un objet physique. Sa feuille
`@media print` dans `app/globals.css` fonctionne et a coûté cher à mettre au point : le thème
sombre y est neutralisé, la coquille retirée, les marges tenues par `@page`. **Si tu touches aux
jetons de couleur, revérifie le rendu imprimé** — une capture d'écran ordinaire ne le montre pas
(`DESIGN.md` §14, leçon de S10).

**Mode sombre** — un vrai mode, pas une inversion. Il existe aujourd'hui via `prefers-color-scheme`
et doit survivre.

---

## 12. Ce qu'il ne faut pas casser

Le produit a **315 tests unitaires, 230 tests de règles, 21 tests de déclencheurs et 7 tests bout
en bout** qui passent. La refonte ne doit pas les faire tomber. Deux catégories de dépendances.

**Les routes.** Les chemins listés au §6.1 sont utilisés par les tests bout en bout et par la liste
des écrans disponibles hors ligne (`next.config.ts`, `ECRANS_HORS_LIGNE`). Si tu déplaces une
route, mets à jour les deux, et dis-le.

**Les noms accessibles.** La suite Playwright interroge l'interface comme un humain — `getByRole`,
`getByLabel`. Ces noms sont donc un contrat. Les principaux :

- rôles de repère : `banner` (le bandeau d'état), `navigation` nommée « Navigation principale »,
  `status` (l'indicateur de synchronisation), `alert` (les erreurs), `article` (le reçu) ;
- le sélecteur de périmètre : `combobox` nommé « Boutique affichée » ;
- les titres de niveau 1 : « Connexion », « Supervision », « Boutiques », « Clients »,
  « Entreprise », « Marques et modèles », « Prestataires », « Provenances et frais » ;
- les boutons d'action : « Enregistrer la vente », « Enregistrer le versement », « Faire entrer en
  stock », « Enregistrer la fiche », « Imprimer le reçu », « Déposer chez un prestataire »,
  « Arrivé au magasin », « Remettre au client », « Non concerné par cette vente », « Créer la
  boutique », « Créer le client », « Nouveau client », « Se déconnecter » ;
- les libellés de champ : « Numéro de châssis », « Prix d'achat », « Prix convenu », « Montant
  reçu », « Avance versée », « Chercher dans le stock », « Chercher une vente », « Chercher un
  client », « Chercher un reçu ».

La liste complète se lit dans `e2e/*.spec.ts`. **Changer un libellé est permis** — le texte fait
partie du design — mais le test se met à jour dans le même commit, jamais après.

**Les composants existants à reprendre plutôt qu'à réécrire** (`DESIGN.md` §7) : `Recu`,
`PanneauRecu`, `FicheVente`, `FicheMoto`, `DossierDocuments`, `PapiersMoto`, `FormulaireClient`,
`ListeReferentiel`, `InvitationBoutique`, `BandeauEtat`, `GardeSession` / `GardeCapacite` /
`GardeEspace`. Leur logique est testée ; c'est leur habillage qui change.

---

## 13. Outillage

`DESIGN.md` §15 liste ce qui est disponible. Rien n'est obligatoire — mais sur ce chantier précis,
voici la position du projet.

**Déjà installé, à utiliser** : Tailwind v4 (les jetons vivent dans le bloc `@theme` de
`app/globals.css`), `lucide-react`, Playwright — `scripts/captures.mjs` fait déjà la boucle
code → capture → corrige.

**shadcn/ui — autorisé, cadré.** Le projet n'a aujourd'hui aucune bibliothèque de composants, et un
logiciel de bureau a besoin de menus, de dialogues, d'onglets et d'une palette de commandes
réellement accessibles. Les écrire à la main est un mauvais calcul : pièges de focus, ARIA,
navigation clavier. **Tu peux installer shadcn/ui**, à trois conditions :

1. seulement les composants effectivement utilisés — pas le catalogue ;
2. ils sont réhabillés avec les jetons du projet ; on ne ramène pas l'identité de shadcn ;
3. la décision est consignée dans `DECISIONS.md` avec ce qu'elle coûte en dépendances
   (`ARCHITECTURE.md` §1 : le meilleur code est celui qu'on n'écrit pas — mais l'accessibilité
   n'est jamais sacrifiée au minimalisme).

**Pour s'inspirer, pas pour copier** : 21st.dev (disponible en MCP), Aceternity UI à petite dose,
Open Design (151 systèmes de design réels, piloté par `DESIGN.md` comme contrat). On en tire un
principe, jamais un calque. Une référence qui ramène l'identité d'un autre produit est refusée.

**Discipline MCP** : moins de dix serveurs actifs (`ARCHITECTURE.md` §6). Active ce qui sert ce
chantier, désactive après.

`ECC.md` est une annexe facultative. Les seuls agents qui pourraient servir ici : `e2e-runner` et
`code-reviewer`.

---

## 14. Le livrable de la phase 1 — les maquettes

**Le client ouvre les maquettes dans son navigateur, regarde, commente. C'est le seul livrable de
la phase 1.**

### Format

- Répertoire `maquettes/` à la racine.
- **HTML statique, CSS pur, aucune dépendance, aucun build.** Le client doit pouvoir
  double-cliquer un fichier et le voir s'ouvrir, y compris sans connexion.
- Un fichier par écran : `maquettes/a4-stock-motos.html`, `maquettes/b3-hors-ligne.html`…
- Une feuille commune `maquettes/socle.css` qui **déclare les jetons du design comme variables
  CSS**. C'est cette feuille qui sera transcrite dans le bloc `@theme` de `app/globals.css` à la
  phase 2 : les jetons décidés ici sont ceux qui seront implémentés. Ne dessine pas avec des
  valeurs que tu ne comptes pas garder.
- Polices : système par défaut, ou une police web déposée **dans le répertoire**. Aucun appel
  réseau, aucun CDN — le fichier doit s'ouvrir hors ligne.
- Un peu de JavaScript en ligne est permis pour montrer une interaction : ouvrir un panneau,
  basculer un onglet, changer de thème. Pas de framework.

### La galerie

`maquettes/index.html` — la page d'entrée, celle que le client ouvre en premier. Elle contient :

- le bloc de direction du §5, lisible, en tête ;
- le logo redessiné et la palette, avec les valeurs ;
- la liste des écrans, groupés A / B / C, chacun avec **une phrase disant le job de l'écran** et un
  lien ;
- pour le groupe C, une mention explicite : *aperçu, non implémenté dans cette refonte* ;
- un mot sur ce qui reste à décider, pour que le client sache où porter son avis.

### Le contenu des maquettes

**Des données factices crédibles, jamais du lorem ipsum.** Le client doit se reconnaître.

- Boutiques : codes à trois lettres — `PTG` Pouytenga, `KDG` Koudougou, `OUA` Ouagadougou.
- Marques et modèles réellement vendus dans la région : Sanili, Apsonic, Haojue, Rato, Yamaha.
- Numéros de pièces au format réel : `PTG-2609-0042` — code boutique, année et mois, compteur.
- Montants FCFA entiers et plausibles : une moto neuve entre 450 000 et 1 200 000 FCFA ; un
  versement de 150 000. Jamais de décimales.
- Noms burkinabè, numéros de téléphone au format local.
- Vocabulaire exact du domaine — reprends les libellés de `lib/domain/vente.ts` et
  `lib/domain/moto.ts` : Comptant · Crédit · Tranches ; Impayée · Partiellement payée · Soldée ;
  Espèces · Orange Money · Moov Money · Wave ; Quittance · CMC · Carte grise · Plaque ; À faire ·
  Chez le prestataire · Revenu au magasin · Remis au client · Sans objet ; Neuve · Occasion ; En
  stock · Réservée · Vendue · Transférée.
- **Ne confonds jamais « crédit » et « tranches »** : crédit = la moto est partie, le client doit ;
  tranches = la moto reste au magasin, le magasin détient l'argent (`prompt.md` §13). C'est la
  confusion métier la plus coûteuse du projet.

### Ce que la phase 1 ne fait pas

Aucune modification de `app/`, `components/`, `lib/`, `firestore.rules`, `functions/`. Aucun test
touché. Les seules écritures autorisées hors de `maquettes/` : `design/marque/` pour le logo SVG,
`DECISIONS.md` pour les arbitrages, et ce fichier si une décision le contredit.

---

## 15. La boucle de revue

1. Tu livres la galerie et tu **annonces la direction du §5 en une réponse courte** : ce que tu as
   choisi et pourquoi, en français, sans jargon. Le client est développeur, mais c'est son commerce
   qui est en jeu.
2. Il ouvre `maquettes/index.html`, regarde, commente écran par écran.
3. Tu corriges. Tu ne défends pas une décision qu'il rejette deux fois.
4. On boucle jusqu'à validation explicite. **Rien ne passe en phase 2 sans elle.**

Entre deux tours, applique `DESIGN.md` §14 : regarde le rendu réel, et retire un élément.

---

## 16. La phase 2 — l'implémentation

Elle ne démarre qu'après validation. Elle s'écrit alors comme une spec normale au gabarit
`SPEC.template.md`, entre dans `specs/ROADMAP.md`, et suit `WORKFLOW.md`.

Ordre proposé, du socle vers les feuilles — chaque étape est un commit vérifié :

1. **Les jetons** — `app/globals.css` : palette, typographie, échelle d'espacement, rayons, mode
   sombre, feuille d'impression revérifiée. Rien d'autre ne change ; l'application doit encore
   tourner et les tests passer.
2. **La coquille** — `app/(app)/layout.tsx`, `NavigationPrincipale`, `BandeauEtat`, et les
   composants de navigation nouveaux. C'est là que le rail vide disparaît.
3. **Les patrons** — tableau, fiche, formulaire, hub, en composants réutilisables. Écrits une fois.
4. **Les écrans**, un par un, dans l'ordre du §9 groupe A. Un commit par écran, tests relancés.
5. **Vérification finale** — `npm test`, `npm run test:e2e`, `node scripts/captures.mjs`, plus les
   captures sous média `print`, plus la relecture des trois contrats.

Deux garde-fous :

- **La branche principale reste déployable** (`ARCHITECTURE.md` §11). Une refonte qui casse
  l'application pendant trois jours n'est pas acceptable sur un produit déjà en préversion.
- **Pas de refonte opportuniste du métier.** Si tu vois un défaut fonctionnel en chemin, note-le ;
  ne le corrige pas dans le même commit.

---

## 17. Critères d'acceptation

### Phase 1 — les maquettes

- [ ] Le monogramme SE est redessiné en SVG net, avec une variante monochrome.
- [ ] Le bloc de direction (§5) est écrit, spécifique au sujet, et n'est aucun des trois patterns
      génériques de `DESIGN.md` §1.
- [ ] L'arbitrage jaune de plaque / couleurs du logo est tranché et consigné dans `DECISIONS.md`.
- [ ] Les neuf écrans du groupe A sont maquettés, à 1440 px de large.
- [ ] Les neuf variantes du groupe B sont livrées, dont hors ligne, vide, chargement, erreur, refus,
      mobile 390 px et thème sombre.
- [ ] La barre latérale porte le second niveau : depuis n'importe quel écran de l'espace motos, les
      sept écrans de cet espace sont atteignables sans revenir en arrière.
- [ ] Aucune maquette n'utilise `max-w-3xl` ni son équivalent : la zone de travail occupe l'écran.
- [ ] Zéro emoji. Zéro lorem ipsum. Zéro montant à décimale. Zéro dégradé en fond de section.
- [ ] Le contraste AA est vérifié sur la palette, en clair et en sombre.
- [ ] Tout est atteignable au clavier avec un focus visible, dans les maquettes elles-mêmes.
- [ ] `maquettes/index.html` s'ouvre par double-clic, sans réseau, et présente la galerie complète.
- [ ] Le client a validé explicitement.

### Phase 2 — l'implémentation

- [ ] `npm test` : les 315 unitaires, 230 règles et 21 déclencheurs passent.
- [ ] `npm run test:e2e` : les tests bout en bout passent, libellés mis à jour dans le même commit
      si un texte a changé.
- [ ] `node scripts/captures.mjs` : les captures sont regardées, mobile et bureau, clair et sombre.
- [ ] Le reçu imprimé est photographié sous média `print` et n'a pas régressé.
- [ ] La checklist de `DESIGN.md` §14 est passée écran par écran.
- [ ] `specs/ROADMAP.md` et `DECISIONS.md` sont à jour.

---

## 18. Hors périmètre

Les fonctionnalités du backlog post-MVP (S13 à S27) — on ne les construit pas, on peut seulement en
dessiner un aperçu au titre du groupe C · les règles métier · le modèle de données · les règles
Firestore · les Cloud Functions · l'infrastructure et le déploiement · l'absence de sauvegarde
Firestore (point rouge de `SECURITY.md` §13, chantier à part) · la traduction en d'autres langues.

---

## 19. Questions ouvertes

À poser au commanditaire avant ou pendant la phase 1. Elles ne bloquent pas le démarrage : dessine
sous hypothèse, et dis laquelle.

1. **Le nom.** Le produit s'appelle SDI, le logo dit SE, l'entreprise est Sandwidi et frère. Que
   lit-on dans la barre latérale, sur l'écran de connexion, et en en-tête de reçu ?
2. **Le nom affiché du gérant.** Aujourd'hui l'application affiche l'adresse e-mail à la place du
   nom, parce que les comptes créés à la main n'ont pas de `displayName` — et ce nom s'imprime sur
   les reçus. Faut-il un champ « nom affiché » modifiable dans les réglages ? Défaut connu, signalé
   pendant S12, non corrigé.
3. **Le poste de travail.** Un seul ordinateur partagé au comptoir, ou un par gérant ? Cela change
   la place de la déconnexion et la question du compte resté ouvert.
4. **Le thème.** Faut-il un basculeur clair / sombre explicite, ou suit-on le réglage du système
   comme aujourd'hui ?
5. **La densité.** Le responsable préfère-t-il voir plus de lignes d'un coup, ou plus grand et plus
   aéré ?
6. **Le repère de boutique.** Faut-il un signe distinctif par boutique, pour que le responsable
   sache d'un coup d'œil où il est ? Si oui : jamais la couleur seule.

---

## 20. Le mot de la fin

Le produit fonctionne. Douze specs sont livrées, la logique métier est testée, le hors-ligne tient,
les reçus sortent. Ce qui manque n'est pas de la fonctionnalité : c'est **la forme qui rend cette
fonctionnalité évidente**.

Ne pas prendre de risque est aussi un risque (`DESIGN.md` §14). Une direction générique et sage est
exactement ce qu'on cherche à éviter ici. Dépense ta hardiesse à un seul endroit — la signature —
et que tout le reste soit calme, dense et discipliné.
