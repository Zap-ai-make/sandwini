# DECISIONS.md — Registre des choix

Exigé par le cahier des charges (`prompt.md` §0) : toute ambiguïté tranchée sans arbitrage humain est
consignée ici, avec sa raison. Une décision se relit, se conteste et se révise ; elle ne se devine pas.

---

## D1 — Hébergement : Vercel
`prompt.md` §2 (« Firebase Hosting ou Vercel, au choix, documenter »)

Vercel exécute le rendu serveur de Next.js App Router nativement, ce dont les pages publiques
`/suivi` et `/prestataire` ont besoin (§2 : rendu serveur obligatoire via Admin SDK). Firebase Hosting
seul ne sait pas faire de SSR ; il faudrait passer par App Hosting ou une Cloud Function de rendu,
soit une pièce de plus pour le même résultat.

*Conséquence :* Firebase reste la base de données, l'auth, le stockage et les Cloud Functions ; seule
la façade web est chez Vercel. La clé de service Admin SDK vit dans les variables d'environnement
Vercel, jamais dans le dépôt (`SECURITY.md` §2). Revenir sur ce choix reste possible : rien dans le
code ne dépend de Vercel en dehors de la configuration de déploiement.

## D2 — Coûts et marges cloisonnés hors de portée du gérant
`prompt.md` §5.2, §5.4, §8 — **arbitré par le responsable**

Le §8 réserve la marge au responsable, mais le §5.4 plaçait `coutMotoSnapshot` dans le document de
vente que le gérant doit lire pour travailler. Firestore ne sait pas masquer un champ : un document
lisible est lisible en entier. Le modèle est donc corrigé :

```
motos/{id}                     ← lisible par le gérant de la boutique
  /prive/cout                  ← responsable seul : prixAchat, fraisEntree[], coutTotal
ventesMotos/{id}               ← lisible par le gérant de la boutique
  /prive/marge                 ← responsable seul : coutMotoSnapshot, marge
```

*Conséquence :* les écrans du responsable font une lecture de plus par ligne affichée. Les écrans de
saisie du gérant n'y touchent pas et restent fonctionnels hors ligne. Le formulaire d'entrée en stock
écrit dans les deux documents dans le même batch (le gérant peut écrire le coût, cf. D4 — il ne peut
simplement pas le relire).

## D3 — Développement et vérification sur la Firebase Emulator Suite
**arbitré par le responsable**

Auth, Firestore, Storage et Functions tournent en local. Aucun secret n'est nécessaire pour démarrer,
et les règles de sécurité sont testables automatiquement (`@firebase/rules-unit-testing`).

*Conséquence :* un jeu de données de démonstration est versionné pour amorcer les émulateurs. Le
branchement sur un vrai projet Firebase est une étape de déploiement, pas de développement — les
trois environnements `dev` / `staging` / `prod` exigés par `ARCHITECTURE.md` §11 seront trois projets
Firebase distincts.

## D4 — Le gérant peut faire entrer une moto en stock
`prompt.md` §17.2 — **arbitré par le responsable**

C'est le seul choix compatible avec le hors-ligne : une moto qui arrive au comptoir doit pouvoir être
saisie immédiatement, sans dépendre de la disponibilité du responsable.

*Conséquence :* le gérant écrit `motos/{id}` et `motos/{id}/prive/cout` pour sa boutique, mais ne
relit jamais le second (D2). Il ne peut pas se corriger sur le coût après coup — seul le responsable
le peut. Compromis assumé : la saisie n'est pas bloquée, l'information reste cloisonnée.

## D5 — Numérotation hors-ligne : compteur local par appareil, réconciliation au serveur
`prompt.md` §3.3

Format `{CODE_BOUTIQUE}-{AAMM}-{NNNN}`, ex. `PTG-2608-0042`.

Chaque appareil tient un compteur en stockage local, amorcé au plus haut numéro connu pour la
boutique et le mois courant (lu depuis le cache Firestore, qui fonctionne hors ligne). Deux appareils
de la même boutique hors ligne au même moment peuvent produire le même numéro : à la synchronisation,
une Cloud Function détecte le doublon (`boutiqueId` + `numero`) et suffixe le document créé en second
d'un `-B`, `-C`… puis le marque comme renuméroté ; l'application le signale à l'utilisateur.

*Conséquence :* le numéro est lisible, unique après synchronisation, et jamais bloquant hors ligne.
Il n'est pas garanti séquentiel sans trou — un numéro peut manquer si une saisie est abandonnée.
C'est un identifiant de reçu, pas une séquence comptable légale ; si une numérotation continue
certifiée devient obligatoire, ce choix est à revoir (lié à D11).

## D6 — Tokens d'accès public
`prompt.md` §4 (« stockées hashées côté serveur si possible, sinon en clair mais non énumérables »)

32 octets tirés de `crypto.getRandomValues`, encodés en base64url.

- **Token de suivi client** : stocké **en clair** sur `ventesMotos/{id}`. Le cahier des charges exige
  que le gérant puisse renvoyer le lien à tout moment (§11) — un haché ne se renvoie pas. Le document
  n'est lisible que par le responsable et le gérant de la boutique concernée, et la valeur n'est pas
  énumérable.
- **Token prestataire** : stocké dans `prestataires/{id}/prive/token`, **responsable seul**. Le §16
  interdit qu'un gérant lise un token de prestataire ; comme pour D2, le seul moyen dans Firestore est
  de sortir le champ du document.

*Conséquence :* la révocation se fait en régénérant le token (le lien précédent cesse de fonctionner).
Le token client est désactivé automatiquement 30 jours après clôture du dossier, comme exigé au §4.

## D7 — Pas de lecture inter-boutiques pour le gérant au MVP
`prompt.md` §16 (« à trancher, documenter »)

Le gérant ne lit que les motos de sa boutique. Le seul besoin de lecture croisée évoqué par le cahier
des charges est le transfert entrant, et les transferts sont post-MVP (S17). En cas de doute, on
expose le moins (`SECURITY.md` §0).

*Conséquence :* la question se rouvre à S17. L'option pressentie est une lecture seule limitée aux
motos effectivement en transfert vers sa boutique, pas au stock entier des autres.

## D8 — Ordre CMC / dépôt de la carte grise : non contraint
`prompt.md` §17.1

L'attribution d'un CMC et le dépôt de la carte grise chez un prestataire sont deux documents
indépendants du dossier, chacun avec son propre cycle. Aucun ordre n'est imposé par le code.

## D9 — Dépenses hors ventes : le modèle les accepte, l'écran est post-MVP
`prompt.md` §17.3

`encaissements` avec `origine: 'depense'` couvre déjà le besoin structurellement. L'écran de saisie
arrive avec la caisse (S22).

## D10 — Annulation de vente : post-MVP, responsable seul
`prompt.md` §17.4

Opération sensible au sens de `AGENTS.md` règle 6 : elle remet une moto en stock, invalide des reçus
déjà remis au client et touche à de l'argent encaissé. Elle mérite sa propre spec (S25) plutôt qu'un
bouton glissé dans le MVP. Proposition retenue pour S25 : responsable uniquement, moto de retour en
stock, versements marqués remboursés, journalisation complète, jamais de suppression physique.

*Conséquence :* au MVP, une vente erronée se corrige en appelant le responsable. À accepter
explicitement au point d'arrêt 2.

## D11 — Mentions légales : champ libre paramétrable
`prompt.md` §17.5

Les paramètres entreprise portent un champ texte libre « mentions légales / identification fiscale »,
imprimé sur les reçus s'il est rempli. On n'invente pas une obligation fiscale qu'on ne connaît pas.

*Conséquence :* à confirmer avec le responsable avant la mise en production. Si un numéro
d'identification est obligatoire, le champ devient requis — pas de changement de structure.

## D12 — Reprise supérieure au prix convenu : refusée
`prompt.md` §5.6 (`complementVerse = prixConvenu − valeurReprise`)

Une valeur de reprise supérieure au prix de la moto neuve rendrait le complément négatif, c'est-à-dire
une dette du magasin envers le client, que le cahier des charges ne décrit nulle part. La saisie sera
bloquée avec un message explicite plutôt que de produire un montant négatif silencieux.

*Conséquence :* à valider lors de S18. Si le cas se produit réellement en boutique, il faudra le
décrire (remboursement ? avoir ?) avant de le coder.

## D13 — Outillage de test
`ARCHITECTURE.md` §4

- **Vitest** pour la logique métier pure de `lib/domain` (reste dû, marge, statut de dossier,
  numérotation) — c'est là qu'un bug coûte de l'argent réel.
- **`@firebase/rules-unit-testing`** pour les règles Firestore : chaque cloisonnement décidé ici (D2,
  D6, D7) est inutile s'il n'est pas testé.
- **Playwright** pour le rendu des écrans et, surtout, pour la vérification hors ligne — un écran de
  saisie qui ne fonctionne pas sans réseau est un écran cassé (`prompt.md` §3.4).

## D14 — Photos de motos : post-MVP (S19)
`prompt.md` §5.2, §8

Firebase Storage n'a pas de file d'attente hors ligne, contrairement à Firestore. Un envoi de photo
échoue sans réseau. Faire dépendre l'entrée en stock d'une photo contredirait le §3.4 (« chaque écran
de saisie doit fonctionner sans réseau »).

*Conséquence :* le champ `photos` existe dès S5 mais reste vide. S19 apportera une file d'attente
locale (IndexedDB) qui rejoue les envois au retour du réseau — c'est une capacité à part entière, pas
un détail d'un formulaire.

## D15 — Identité de l'entreprise : paramètre, pas constante
`prompt.md` §10

> **Renversée par D71** (revue des maquettes, S28). Le responsable ne veut pas
> saisir son identité : elle est désormais une constante de
> `lib/domain/entreprise.ts`. Ce qui suit décrit l'état antérieur, gardé parce
> qu'une décision effacée ne s'apprend pas.

Le nom de l'entreprise, son logo, ses adresses et téléphones sont saisis dans les paramètres par le
responsable, comme le cahier des charges l'exige. Aucun nom commercial n'est écrit en dur dans le
code ou l'interface.

*Conséquence :* le vrai nom de l'entreprise doit être fourni avant qu'un reçu ne soit remis à un
client, mais il ne bloque aucun développement. Nom communiqué depuis : **SDI — Sandwidi et frère**.
Il sera saisi dans les paramètres, pas écrit dans le code.

## D16 — Fichier clients commun à toutes les boutiques
`prompt.md` §3.2, §5.3 — **arbitré par le responsable**

Le §3.2 rattache chaque donnée opérationnelle à une boutique. Un client n'est pas une opération, c'est
une personne : `clients` ne porte donc pas de `boutiqueId`, et une même fiche sert toutes les
boutiques. Un client connu à Pouytenga est retrouvé à Koudougou sans ressaisie, et son historique
d'achats est complet.

*Conséquence assumée :* c'est la seule donnée qu'un gérant voit au-delà de sa boutique. Il peut
consulter les noms et téléphones de toute la clientèle — mais rien de ce qui s'y rattache : ni les
ventes, ni les montants, ni les dossiers des autres boutiques, qui restent cloisonnés par les règles
(D7). Le risque résiduel est l'extraction du fichier de contacts par un gérant, pas une fuite
financière. Si ce risque devient réel, la parade est la recherche stricte par numéro complet, sans
parcours de liste — elle se rajoute sans changer le modèle de données.

## D17 — Vulnérabilités npm résiduelles : cantonnées à l'outillage
`SECURITY.md` §9 — constaté en S1

`npm audit` signale 5 vulnérabilités modérées (`re2`, `uuid`, `@opentelemetry/core`,
`@google-cloud/pubsub`) toutes tirées par `firebase-tools`, la CLI qui lance les émulateurs.

Elles sont **absentes de l'arbre de production**, vérifié par correspondance de nom exact avec
`npm ls --omit=dev`. Les paquets `re2js` et `@opentelemetry/api` présents côté production sont
d'autres paquets, non concernés. `firebase-tools` est déjà en dernière version ; `npm audit fix
--force` casserait la CLI sans rien corriger en production.

*Conséquence :* exigence du §9 satisfaite — détectées, évaluées, tracées. À revérifier à chaque
montée de version de `firebase-tools`. Si l'une d'elles atteignait un jour l'arbre de production,
la décision se rouvre immédiatement.

## D18 — Ports d'émulateurs propres à SDI
Constaté en S1

La machine de développement fait tourner d'autres projets Firebase ; les ports par défaut (8080,
9099, 4000, 4400, 4500) étaient déjà pris. Plutôt que d'arrêter le travail de quelqu'un d'autre, SDI
prend un bloc à lui : **Firestore 8181, Auth 9399, Storage 9599, interface 4100, hub 4700, journal
4800**.

*Conséquence :* ces ports apparaissent à trois endroits — `firebase.json`, `lib/firebase/client.ts`
et `regles/socle.test.ts`. Les changer demande de toucher les trois.

## D19 — Le build passe par webpack, pas par Turbopack
Constaté en S1

Serwist génère le service worker via un plugin webpack. Turbopack, activé par défaut dans Next 16,
ne le supporte pas : le build échoue. Le script de build force donc `next build --webpack`.

Les alternatives — `@serwist/turbopack` (expérimental) ou le mode « configurateur » — apportent du
risque pour un gain de vitesse de compilation dont le projet n'a pas besoin. Le développement, lui,
garde Turbopack : le service worker y est désactivé de toute façon.

*Conséquence :* à revoir quand Serwist supportera Turbopack en version stable. Un seul drapeau à
retirer.

## D20 — L'indicateur réseau s'appuie sur `navigator.onLine`, avec une limite connue
`prompt.md` §3.4 — constaté en S1

`navigator.onLine` répond « en ligne » dès qu'une interface réseau est active, **même sans accès
Internet réel** — cas fréquent avec une connexion mobile faible ou un wifi captif. L'indicateur peut
donc afficher « À jour » alors que rien ne part.

Ce que le socle garantit malgré tout : le **compteur d'écritures en attente** ne ment pas, lui. Il
descend à zéro uniquement quand le serveur a accusé réception. Un gérant qui voit « 3 saisies en
attente » sait que rien n'est parti, quel que soit ce que dit le mot « en ligne ».

*Amélioration prévue en S3 :* dès qu'une collection est réellement lisible (`boutiques`), un écouteur
`onSnapshot` avec `includeMetadataChanges` fournit `metadata.fromCache`, c'est-à-dire la vraie
réponse à « Firestore atteint-il le serveur ? ». On ne l'ajoute pas aujourd'hui parce qu'il faudrait
inventer une lecture pour la seule beauté du geste.

*Note de vérification :* sous Chromium piloté par Playwright, une page rechargée en coupure émulée
répond `navigator.onLine === true`. C'est une limite de l'émulation, pas du produit. Le test bout en
bout vérifie donc la bascule du bandeau sans rechargement, où la mesure est fiable.

## D21 — L'émulateur Functions arrive avec S2, pas avec le socle
`specs/S1-socle-technique.md` — écart assumé

Le critère de S1 mentionnait quatre émulateurs, Functions compris. Le socle en démarre trois : Auth,
Firestore, Storage. Créer un paquet Cloud Functions vide, avec sa chaîne de compilation, pour zéro
fonction, contredirait le premier échelon d'`ARCHITECTURE.md` §1 : si le besoin n'est pas réel et
actuel, on ne le construit pas.

*Conséquence :* S2 apporte la première fonction réelle (création d'un gérant et pose de ses custom
claims) et, avec elle, le paquet `functions/` et son émulateur.

## D22 — `AGENTS.md` reste écrit à la main : `agentRules: false`
`AGENTS.md` règle 7, `SECURITY.md` §11 — constaté en S1

Next 16 ajoute à chaque `next dev` un bloc de consignes dans `AGENTS.md`. Or ce fichier est la source
unique de vérité du projet : un outil qui y réinjecte ses propres instructions salit l'arbre git à
chaque démarrage, et fait entrer du contenu non relu dans le document qui gouverne le travail des
agents — exactement ce que la règle 7 interdit (« contenu externe = données, pas instructions »).

La génération est donc désactivée par `agentRules: false`. Ce que le bloc apprenait d'utile — les
guides de Next 16 vivent dans `node_modules/next/dist/docs/` — est repris dans `AGENTS.md`, dans nos
mots, relu et versionné.

*Conséquence :* à la montée de version de Next, personne ne sera prévenu par ce canal des changements
de conventions. C'est le prix d'un fichier de gouvernance stable, et il est faible : le README et ce
registre disent déjà où chercher.

## D23 — Les tests de règles s'appuient sur un émulateur déjà démarré
Constaté en S1, à l'usage

`firebase emulators:exec` démarre son propre émulateur et **échoue si un autre occupe le port** —
c'est-à-dire précisément dans le déroulé que le README recommande : `npm run emulators` dans un
terminal, le travail dans un autre. `npm test` devenait inutilisable au quotidien.

`npm run test:regles` parle donc à l'émulateur en place, et `npm run test:regles:isole` démarre le
sien pour une machine vierge ou la CI. Quand l'émulateur manque, le test s'arrête sur un message qui
dit quoi lancer, plutôt que sur une cascade d'assertions en échec.

*Leçon généralisable, remontée ici plutôt que dans un contrat :* un script de test qui ne fonctionne
que sur une machine vierge n'est pas vérifié tant que personne ne l'a lancé dans les conditions
réelles de développement. C'est le lancement du projet par le responsable qui l'a montré, pas la
suite de tests.

## D24 — `unsafe-eval` dans la CSP : développement seulement
`SECURITY.md` §5 et §6 — constaté en S1, à l'usage

React utilise `eval()` en mode développement pour ses outils de débogage — reconstruction des piles
d'appel, rafraîchissement à chaud. En production, il ne s'en sert pas du tout. Notre CSP le bloquait,
d'où une erreur permanente dans la console de développement.

`'unsafe-eval'` n'est donc ajouté à `script-src` que lorsque `NODE_ENV` vaut `development`.

*Ce qui empêche la dérive :* un test bout en bout lit les en-têtes servis par le build de production
et échoue si `unsafe-eval` s'y trouve. Une CSP relâchée par accident ne se voit pas à l'œil ; elle se
voit dans un test. Le même test verrouille `default-src`, `object-src`, `frame-ancestors`, `base-uri`
et les quatre autres en-têtes de sécurité.

## D25 — Les tests bout en bout ont leur propre port
Constaté en S1, à l'usage

Playwright réutilisait un serveur déjà présent sur le port 3000 — donc, en pratique, le `npm run dev`
du développeur. La suite tournait alors contre un build de développement, où le service worker est
désactivé et la CSP plus permissive : elle rendait un verdict qui ne portait pas sur ce qu'on croyait
vérifier, en échouant sur les tests hors-ligne et sur les en-têtes.

Le serveur de test occupe désormais le **port 3100**, sans réutilisation possible : chaque exécution
démarre un serveur neuf sur le build courant.

*Leçon :* un harnais de test qui mesure ce qui traîne sur un port n'est pas un harnais. Elle est
jumelle de D23 — les deux ont été trouvées en lançant le projet pour de vrai, pas en le compilant.

## D26 — Limitation des tentatives de connexion : Firebase d'abord, l'écran ensuite
`SECURITY.md` §3 — S2

La protection réelle contre le bourrage d'identifiants est celle de Firebase Authentication, qui
applique ses propres quotas côté serveur et renvoie `auth/too-many-requests`. Nous n'avons ni serveur
d'authentification à nous, ni moyen de compter les tentatives ailleurs que sur l'appareil.

L'écran de connexion ajoute une pause de 30 secondes après cinq échecs. Ce n'est **pas** un contrôle
de sécurité — il se contourne en rechargeant la page — mais il coupe l'acharnement au comptoir et
rend la limite lisible pour quelqu'un qui se trompe de mot de passe.

*Conséquence :* si le projet passe un jour à Identity Platform, la protection contre les attaques par
force brute se règle côté console et non dans ce code.

## D27 — « Côté serveur » veut dire règles Firestore, pas session serveur
`specs/S2-auth-roles-utilisateurs.md`, `prompt.md` §16 — écart assumé

La spec demandait que les écrans réservés au responsable soient « refusés au gérant côté serveur, pas
seulement masqués ». Une session serveur — cookie signé plus middleware — supposerait un aller-retour
réseau à chaque navigation, ce qui contredit frontalement le §3.4 : l'application doit fonctionner
sans réseau.

L'intention de la règle est respectée autrement, et mieux :

- **Aucune donnée ne transite par le serveur Next.** Tout vient de Firestore, côté client. Il n'y a
  donc pas de contenu protégé à servir, et rien à fuir par une route.
- **Les règles Firestore refusent les lectures** qu'un gérant n'a pas le droit de faire, et elles
  sont testées dans les deux sens.
- **Les Cloud Functions revérifient le rôle** dans le jeton avant toute action administrative.

La garde de navigation (`components/GardeSession.tsx`) ne protège donc rien : elle évite qu'on tombe
sur un écran vide sans comprendre. Un gérant qui l'ignorerait obtiendrait une page dont toutes les
requêtes échouent.

*À revoir si un jour une page rend des données côté serveur* — les pages publiques client et
prestataire (S13, S15) en sont le cas, et elles passeront par l'Admin SDK avec vérification de jeton.

## D28 — Un gérant peut exister sans boutique jusqu'à S3
`specs/S2-auth-roles-utilisateurs.md`, `specs/S3-boutiques-perimetre.md` — S2

La roadmap fait dépendre S3 de S2, mais créer un gérant demande de lui attribuer une boutique — qui
n'existe pas encore. Plutôt que d'avancer un morceau de S3 dans S2, le `boutiqueId` est facultatif :
le compte se crée, se connecte, et l'application lui dit en toutes lettres « aucune boutique ne vous
est attribuée » au lieu de lui montrer des écrans vides.

*Conséquence :* S3 apportera le choix dans une liste et l'attribution aux comptes déjà créés. Le
champ existe déjà partout — modèle, claim, interface — donc il n'y a rien à migrer.

## D29 — Le SDK Admin se charge à l'appel, pas à l'import des Cloud Functions
S2 — trouvé en exécutant

Importer `firebase-admin` au niveau du module faisait mettre **12,9 secondes** au fichier de
fonctions pour se charger, au-dessus des 10 secondes que l'émulateur accorde à la découverte. Les
fonctions n'étaient tout simplement pas servies, et l'application affichait « le serveur n'a pas
répondu » sans autre indice.

Les imports sont donc faits dans les gestionnaires, à la première invocation : **651 ms** au
chargement du module. Le gain vaut aussi en production, où le démarrage à froid d'une fonction est
facturé et subi par l'utilisateur.

*Effet de bord traité :* la première invocation paie ce coût. Dans l'émulateur, elle atteignait
20 secondes et faisait échouer le premier test qui appelait une fonction. La préparation des tests
réveille donc le runtime avant de commencer — un test doit mesurer le produit, pas la lenteur d'un
démarrage à froid.

## D30 — Le code de la boutique est l'identifiant du document
`prompt.md` §5.1, §3.3 — S3

`boutiques/{code}`, trois lettres majuscules. Firestore ne sait pas imposer l'unicité d'un champ ;
en faire la clé du document la donne gratuitement, sans compteur ni transaction. Et le code entre
déjà dans les numéros de reçus (`PTG-2608-0042`, cf. D5), donc il ne peut pas changer de toute
façon : un code réécrit rendrait faux des documents déjà remis à des clients.

*Conséquence :* le code est définitif. L'interface le dit — le champ est verrouillé en modification
— et les règles le vérifient (`request.resource.data.code == resource.data.code`). Une boutique mal
codée se ferme et se recrée ; elle ne se renomme pas.

*Effet de bord traité :* `setDoc` sur un identifiant déjà pris serait une mise à jour déguisée, donc
un écrasement silencieux. Les règles l'empêchent en exigeant que `createdAt` vaille l'heure de la
requête, ce qu'une mise à jour ne produit jamais. Le formulaire prévient avant d'en arriver là.

## D31 — Le périmètre choisi est mémorisé par compte, dans `localStorage`
`prompt.md` §3.2 (« sélecteur global persisté en session ») — S3

`sessionStorage` aurait suivi la lettre du cahier des charges, mais sur le téléphone du comptoir
l'application se ferme et se rouvre vingt fois par jour : le responsable aurait ressaisi son choix à
chaque fois. La clé porte l'identifiant du compte, pour que deux personnes qui se relaient sur le
même appareil ne s'héritent pas leur périmètre, et la déconnexion l'efface avec le cache Firestore.

*Conséquence :* le périmètre est une préférence d'affichage, jamais une autorisation. Ce qu'un
gérant peut lire est décidé par son claim et par les règles ; ce que le responsable a choisi de
regarder ne change rien à ses droits.

## D32 — Changer la boutique d'un gérant révoque ses jetons
`prompt.md` §4 — S3

Le périmètre d'un gérant vit dans son custom claim, que les règles Firestore lisent pour décider ce
qu'il peut ouvrir. Le déplacer sans révoquer les jetons laisserait l'ancien périmètre valide jusqu'à
l'expiration du jeton, soit jusqu'à une heure : le gérant continuerait de lire et d'écrire dans une
boutique qui n'est plus la sienne.

*Conséquence :* le gérant est déconnecté et doit se reconnecter. L'écran le dit au responsable avant
qu'il valide, parce que le changement tombe souvent pendant que l'intéressé est en train de vendre.

## D20 bis — L'indicateur réseau croit désormais Firestore, pas le navigateur
S3 — l'amélioration annoncée en D20

Dès qu'une collection est réellement lisible (`boutiques`), l'écouteur ouvert avec
`includeMetadataChanges` fournit `metadata.fromCache` : la vraie réponse à « Firestore atteint-il le
serveur ? ». Quand le navigateur dit « en ligne » et que Firestore sert le cache, on croit Firestore.

Un délai de confirmation de 2,5 secondes évite le faux positif du démarrage, où Firestore sert
d'abord le cache avant de rattraper le serveur : un bandeau qui crie « hors ligne » à chaque
ouverture apprendrait à ne plus le regarder.

*Vérifié :* un test bout en bout coupe les requêtes vers Firestore **sans** couper le navigateur —
le cas du wifi captif — puis rouvre l'application, et vérifie que le bandeau bascule alors que
`navigator.onLine` vaut toujours `true`. C'est le cas que D20 décrivait sans pouvoir le mesurer.

*Limite mesurée, et pourquoi elle est acceptable :* le signal dit quand **Firestore** se sait hors
ligne, ce qui n'est pas instantané. Un flux d'écoute déjà ouvert et inactif ne s'aperçoit de rien
tant qu'il n'a rien à transmettre : en coupant le réseau sous une session en cours, le bandeau peut
rester à « À jour » plusieurs dizaines de secondes. Ce trou est couvert par ailleurs — c'est le
compteur d'écritures qui répond alors, et il répond tout de suite : la saisie bloquée affiche
« Envoi d'une saisie… » et n'en bouge pas. Autrement dit, les deux indicateurs se complètent :
`fromCache` attrape l'ouverture derrière un réseau muet, le compteur attrape la coupure en cours de
journée. Aucun des deux ne dit « À jour » quand une saisie n'est pas partie.

## D28 bis — Le gérant sans boutique n'est plus un état de transition
S3 — clôture de D28

S3 apporte la liste et l'attribution aux comptes déjà créés. Le `boutiqueId` reste pourtant
facultatif à la création : un responsable ouvre parfois le compte avant d'avoir déclaré la boutique,
et refuser la création l'obligerait à faire les choses dans un ordre qui n'est pas le sien. Le
compte existe alors sans périmètre, l'application le dit en toutes lettres, et un bouton le rattache.

## D33 — L'émulateur peut démarrer sans aucune fonction : on lui donne le temps, et on le vérifie
S3 — constaté en relançant les émulateurs

La découverte des fonctions dispose de **dix secondes** pour charger le code et lire ses exports.
Sur une machine occupée — un build en cours, un serveur Next à côté — ce budget se dépasse, et
l'émulateur démarre alors **sans servir une seule fonction**, tout en affichant « All emulators
ready ». Chaque appel reçoit un 404 que l'application traduit par « le serveur n'a pas répondu » :
un message de panne réseau pour un problème qui n'a rien de réseau. Quatre tests bout en bout ont
échoué loin de leur cause avant qu'on lise le journal de l'émulateur.

Deux corrections, parce qu'il y a deux défauts distincts :

- `scripts/emulateurs.mjs` porte `FUNCTIONS_DISCOVERY_TIMEOUT` à 60 secondes. Le chargement du
  module est mesuré à 1,8 s — le délai n'excuse aucun import lourd (D29 tient), il absorbe la
  variabilité de la machine. Sans lui, la découverte a effectivement mis plus de 10 s et moins de
  16 s.
- `e2e/preparation.ts` n'accepte plus qu'un port ouvert comme preuve : il appelle une fonction
  témoin et s'arrête si elle renvoie 404, en disant quoi taper.

*Troisième fois que ce piège coûte du temps* (D23, D25, puis D29) et toujours la même forme : **un
service qui répond n'est pas un service qui fonctionne.** Le préflight vérifie désormais la
capacité, pas la présence.

## D34 — La suite bout en bout tourne sur un seul worker
S3 — constaté en exécutant la suite complète

Toute la suite partage un jeu d'émulateurs, un compte responsable et une base. En parallèle, deux
fichiers créaient des comptes et appelaient les mêmes Cloud Functions au même moment : la suite
rendait un verdict différent d'une exécution à l'autre, et aucun de ces échecs ne portait sur le
produit — les mêmes tests passaient isolés.

*Conséquence :* la suite complète prend une minute au lieu de deux (le parallélisme perdait son
avance en délais d'attente). Un test qui échoue accuse le code, pas son voisin. Si la suite
s'allonge au point que ça pèse, la réponse sera d'isoler les données par worker — pas de remettre
du parallélisme sur un état partagé.

## D35 — Le logo de l'entreprise voyage dans Firestore, pas dans Storage
`prompt.md` §10 — S4

Un reçu doit s'imprimer **sans réseau**. Un logo servi depuis Firebase Storage demanderait une
requête au moment de l'impression, et Storage n'a pas de file d'attente hors ligne (D14) : le premier
reçu imprimé sur un appareil neuf, en coupure, sortirait sans en-tête.

L'image est donc réduite sur l'appareil (512 pixels au plus grand côté, PNG pour garder les aplats et
la transparence) et encodée en `data:` dans `entreprise/profil`. Elle arrive avec le cache Firestore
et s'imprime comme le reste.

*Conséquence :* une limite de taille, que Firestore impose de toute façon — 1 Mio par document. On la
fixe à 200 000 caractères, vérifiée côté domaine **et** côté règles, parce que ce document est relu à
chaque ouverture de l'application. Le dépôt d'un logo fonctionne d'ailleurs hors ligne, comme toute
écriture Firestore : c'est une exception de moins à la règle du §3.4.

## D36 — Les référentiels ont un identifiant tiré au sort, à l'inverse du code de boutique
`prompt.md` §5.1 — S4

Le code d'une boutique est sa clé (D30) parce qu'il est immuable par nature : il est imprimé sur des
reçus. Un nom de marque, lui, se corrige — « Yhamaha » saisi un lundi matin. S'il était la clé, la
correction créerait une seconde marque et couperait le stock en deux. La clé n'a donc aucun sens à
part identifier.

*Conséquence :* l'unicité du nom n'est plus donnée par la base. Elle est vérifiée à la saisie, sur une
forme réduite qui ignore la casse et les accents, et « Yamaha » proposé alors que « YAMAHA » existe
est refusé avec sa raison. Deux appareils hors ligne peuvent quand même créer le même nom deux fois ;
c'est un doublon visible et corrigeable, pas une perte de données.

**Un modèle, lui, est rattaché.** Les règles vérifient que sa marque **existe** et qu'elle ne change
jamais : un modèle orphelin apparaîtrait dans une liste de choix sans qu'on sache de quelle marque il
est, et déplacer un modèle rendrait fausses les motos déjà saisies.

## D37 — Le seuil d'inactivité des tranches attend S9
`prompt.md` §14 — S4

Le §14 le range dans les paramètres, donc dans cette spec. Il n'a pourtant d'effet qu'au moment où les
tranches existent (S9) : l'afficher ici donnerait un réglage qu'on peut changer sans que rien ne
change, ce qui est pire qu'un réglage absent.

*Conséquence :* il s'ajoutera à l'écran Entreprise en S9, avec sa valeur par défaut de 30 jours et la
liste qu'il alimente.

*Fait en S9 :* `seuilInactiviteTranches` vit sur `entreprise/profil`, borné entre 1 et 365 jours par
les règles, et alimente la liste des tranches inactives. Le champ est facultatif — une fiche saisie
avant S9 n'en a pas, et le défaut de trente jours prend le relais côté application.

## D38 — La date d'entrée vient de l'appareil, l'horodatage d'audit du serveur
`prompt.md` §3.4, §5.2 — S5

Deux dates cohabitent sur une moto et elles ne répondent pas à la même question.
`dateEntree` dit **quand la moto est arrivée au magasin** ; c'est une date métier, elle appartient à
l'appareil qui l'a saisie. `createdAt` dit **quand la donnée a été écrite** ; c'est une trace
d'audit, elle appartient au serveur.

Les confondre en mettant `serverTimestamp()` partout ferait entrer mercredi une moto saisie lundi
sans réseau — et le stock du lundi deviendrait faux rétroactivement.

*Conséquence :* une horloge d'appareil déréglée peut poser une date fausse. Les règles bornent donc
`dateEntree` à un jour dans le futur au plus : elles ne peuvent pas vérifier une date passée, mais
elles peuvent refuser l'absurde.

## D39 — Une vue de détail vit dans la route de sa liste, pas dans une route dynamique
`prompt.md` §3.4 — constaté en S5, en coupant le réseau

`/motos/[id]` est une route dynamique : le navigateur doit en demander le document au serveur, et le
service worker n'a jamais vu celui d'une moto saisie il y a dix secondes. Résultat mesuré : le
formulaire d'entrée fonctionnait parfaitement hors ligne, la moto s'enregistrait, et le bouton
« Voir la fiche » juste en dessous tombait sur la page de repli.

La fiche est donc un panneau de `/motos`, ouvert par `?moto=<id>`. Changer ce paramètre ne demande
rien à personne. Le service worker ignore ce paramètre lors de la recherche en cache — c'est vrai
pour nos écrans, rendus par le navigateur, où l'URL sans paramètre sert exactement le même document.

*Conséquence :* la liste des paramètres ignorés est explicite et pas un joker. `_rsc`, que Next
ajoute pour demander des **données** et non un document, doit continuer à ne pas correspondre au
cache de précharge. Tout nouveau paramètre d'état d'écran s'ajoute dans `app/sw.ts`.

## D40 — Tous les écrans sont mis en cache à l'installation, pas à la première visite
`prompt.md` §3.4 — constaté en S5

Le service worker ne gardait que les écrans **déjà visités**. Un gérant qui ouvre l'application sur
l'accueil et perd le réseau ne pouvait plus atteindre le formulaire d'entrée en stock : il n'y était
jamais allé sur cet appareil. C'est exactement ce que le produit promet de savoir faire.

La liste des écrans est donc déclarée dans `next.config.ts` et téléchargée à l'installation, pendant
qu'il y a du réseau.

*Conséquence :* une route de plus dans l'application est une ligne de plus dans cette liste. L'oubli
ne se voit qu'en coupure, donc au moins un test bout en bout traverse un écran jamais visité, réseau
coupé.

## D41 — La suite bout en bout repart d'une base vide
S5 — constaté après une journée d'exécutions

Chaque exécution héritait de la précédente : le sélecteur de boutique proposait cinquante entrées, la
collection `motos` en contenait des centaines, et des tests échouaient pour des raisons étrangères au
code qu'ils vérifient — jusqu'à ce que le bandeau du responsable affiche « Hors ligne » au milieu
d'un test. La même famille de piège que D23, D25, D33 : **un harnais qui mesure ce qui traîne n'est
pas un harnais.**

`e2e/preparation.ts` vide donc Firestore et Auth avant la première mesure. Effet mesuré : le fichier
`motos.spec.ts` est passé de 3 min 20 avec quatre échecs à 1 min 20 sans aucun.

*Conséquence assumée :* lancer la suite efface les données saisies à la main dans les émulateurs.
Elles ne survivent de toute façon pas à un redémarrage des émulateurs. En échange, les états
« aucune boutique », « aucune moto », « aucun compte » redeviennent atteignables.

## D42 — Le fichier clients a son écran, que l'arborescence du cahier ne prévoyait pas
`prompt.md` §2, §7 — S6

Le cahier des charges ne place les clients qu'à l'intérieur de l'écran de vente : « recherche par
téléphone/nom ou création à la volée ». Son arborescence ne comporte pas de `/clients`.

Cet écran existe quand même, pour deux raisons. D'abord parce qu'une spec doit être vérifiable seule
(`WORKFLOW.md` §3) et que l'écran de vente n'arrive qu'en S8 : sans lui, S6 n'aurait livré que du
code sans preuve d'usage. Ensuite parce que le fichier clients est la seule donnée partagée entre
boutiques (D16) et qu'on a besoin de le regarder — corriger un numéro mal noté n'a pas à passer par
une vente.

*Conséquence :* l'écran n'est pas dans la barre de navigation, qui reste les cinq espaces du cahier
des charges (§14). On y accède depuis l'accueil, et S8 y accédera depuis la vente. Si l'usage montre
que le détour coûte, la barre pourra changer — pas l'inverse.

## D43 — Le préflight réveille chaque fonction, pas seulement une
S6 — constaté en lisant le journal de l'émulateur

L'émulateur Functions démarre un runtime **par fonction**, à la première invocation. Le préflight
n'en réveillait qu'une (`creerGerant`) : les autres payaient leur démarrage au milieu d'un test, et
sur une machine chargée ce démarrage échoue :

```
!!  functions: Failed to handle request for function europe-west1-attribuerBoutique
!!  functions: Failed to start functions in …: Failed to load function.
```

Côté application, cela ressortait en « le serveur n'a pas répondu » — le même message trompeur qu'en
D33, pour une cause voisine mais distincte.

*Conséquence :* une fonction de plus dans `functions/src` est une ligne de plus dans la liste de
`e2e/preparation.ts`. Le réveil coûte une quinzaine de secondes une fois par exécution, au bon
endroit — avant la première mesure, et non au milieu.

## D44 — La clé de rapprochement des numéros est `numeroInitial`, qui ne bouge jamais
S7 — découvert en écrivant le test de la troisième pièce

La réconciliation cherche les pièces qui portent le même numéro. Le réflexe est de chercher sur
`numero` — et c'est faux, parce que `numero` est justement ce que la réconciliation modifie.

Le scénario qui le montre : trois appareils sortent `PTG-2608-0042`. La deuxième pièce arrive, reçoit
`-B`. La troisième arrive une heure plus tard et interroge `numero == "PTG-2608-0042"` : elle ne
trouve plus que la première, se croit deuxième, et réclame un `-B` déjà donné.

Chaque pièce porte donc deux champs : `numero`, celui qu'on imprime et que le serveur peut corriger,
et `numeroInitial`, celui que l'appareil a attribué et que **personne** ne réécrit ensuite. Le
rapprochement se fait sur le second.

*Conséquence :* les règles Firestore devront interdire toute modification de `numeroInitial` et
exiger qu'il soit égal à `numero` à la création (S8). L'application repère une pièce renumérotée en
comparant les deux champs — pas besoin d'un drapeau qui pourrait mentir.

## D45 — La collision se tranche à l'ordre d'arrivée au serveur, pas à l'heure de saisie
S7 — `prompt.md` §3.3 ne dit pas qui garde le numéro

Deux pièces, même numéro : l'une garde, l'autre est suffixée. Le cahier des charges ne dit pas
laquelle. On classe par `createdAt` — l'horodatage **serveur**, c'est-à-dire l'ordre d'arrivée —
l'identifiant du document départageant les ex æquo.

Deux raisons. L'heure de saisie vient d'un téléphone dont personne ne contrôle le réglage : un
appareil en retard d'une journée volerait son numéro à une vente déjà synchronisée, peut-être déjà
imprimée et remise au client. Et surtout, ce critère rend le verdict indépendant de l'ordre
d'exécution des déclencheurs : deux instances qui traitent la collision en même temps arrivent à la
même conclusion sans se parler. Une réconciliation qui aurait besoin d'un verrou serait une
réconciliation qui échoue au pire moment.

*Conséquence :* la pièce renumérotée n'est pas la plus récente au sens du comptoir, mais la plus
tardive à s'être synchronisée. C'est le bon comportement — celle qui est restée hors ligne trois
jours est celle dont le reçu n'a encore été comparé à rien.

## D46 — Le compteur de l'appareil survit à la déconnexion
S7 — `SECURITY.md` §6 demande d'effacer les traces locales à la déconnexion

La déconnexion vide le cache Firestore et le périmètre mémorisé. Le compteur de numérotation, lui,
reste.

Ce n'est pas une exception de confort. Le compteur a deux sources : ce que l'appareil a déjà
distribué, et ce qu'il connaît de la boutique par le cache. La déconnexion supprime la seconde ;
effacer la première en même temps ferait repartir l'appareil de `0001` et fabriquerait en série
exactement les doublons que le mécanisme existe pour éviter.

*Conséquence :* un appareil partagé garde une trace de l'activité — le rang atteint dans le mois,
sans aucune donnée de vente. C'est le minimum nécessaire, et cela ne dit rien qu'un coup d'œil au
carnet de reçus ne dirait pas. L'option qui expose le moins **ici** est celle qui écrit encore.

## D47 — Les deux moitiés de la numérotation ne partagent pas de code, mais un test
S7 — question posée par la séparation `lib/` / `functions/`

Le client fabrique les numéros, le serveur fabrique les suffixes ; le client relit les suffixes, le
serveur ne relit rien. Mettre ce code en commun demandait de sortir `functions/` de son `rootDir`,
ce qui déplace tout l'arbre compilé et fragilise le déploiement pour une trentaine de lignes.

On garde donc deux moitiés étanches — `lib/domain/numerotation.ts` et `functions/src/numerotation.ts`
— et on tient leur accord par un test d'aller-retour : tout suffixe produit par le serveur doit être
relu par le client, au bon rang, sur deux cents rangs.

*Conséquence :* le jour où l'alphabet change d'un côté, le test tombe. C'est la propriété qu'on
voulait ; un module partagé ne l'aurait pas donnée mieux.

## D48 — On demande l'application Admin par défaut, on ne compte pas les applications
S7 — la fonction mourait à chaque déclenchement

`admin()` initialisait le SDK si `getApps().length === 0`. Dans un déclencheur Firestore, ce test est
faux : `firebase-functions` a déjà créé sa **propre** application nommée pour reconstruire
l'instantané du document. Le compte n'est donc pas nul, l'initialisation est sautée, et l'appel
suivant meurt sur « The default Firebase app does not exist ».

Les fonctions appelables n'ont jamais montré le défaut — elles s'exécutent sans cet invité.

*Conséquence :* `admin()` demande `getApp()` et n'initialise que si l'appel échoue, puis passe
explicitement l'application à `getAuth()` et `getFirestore()`. « Aucune application » et « aucune
application par défaut » ne sont pas la même question ; poser la bonne coûtait trois lignes.

## D49 — Les déclencheurs ont leur propre harnais, et on réveille le runtime avant de mesurer
S7 — quatrième rencontre avec la même leçon

Un déclencheur ne se vérifie ni avec les tests unitaires (il lui faut deux émulateurs) ni avec les
tests de règles (qui démarrent Firestore seul) ni avec Playwright (il n'y a pas d'écran). D'où
`declencheurs/`, sur le modèle de `regles/`.

Et comme l'émulateur démarre un runtime **par fonction** à la première invocation (D43), le premier
test payait ce démarrage et échouait au bout de vingt-cinq secondes en accusant le code. Un
déclencheur n'a pas d'URL à réveiller : on le réveille de la seule façon qui existe, en provoquant
une vraie collision avant la première mesure et en attendant son verdict.

*Conséquence :* la suite passe de 164 secondes à 15. Le réveil sert aussi de vérification de câblage
— s'il échoue, le message dit quoi regarder dans le journal de l'émulateur plutôt que de laisser
cinq tests échouer un par un.

## D50 — Trois défauts du harnais rencontrés en vérifiant S7, et ce qui reste ouvert
S7 — la suite bout en bout échouait au hasard dans `motos.spec.ts`

La suite est tombée cinq fois de suite, sur un test différent à chaque exécution, tous dans le
fichier du stock. Le premier réflexe — « ma spec a cassé quelque chose » — a été vérifié puis écarté :
en retirant le déclencheur de S7 et en rejouant les mêmes fichiers, l'échec revenait. Trois causes
distinctes, dont deux sont corrigées.

**Un filtre qui cherchait une sous-chaîne.** `filter({ hasText: code })` cherche le texte *n'importe
où* et sans tenir compte de la casse. Le code de boutique tiré au hasard « NTR » se trouvait au
milieu de « Marché ce**ntr**al », et l'assertion résolvait six lignes à la fois. Les tests demandent
désormais le code en début de mot (`e2e/aide.ts`, `ligneDeBoutique`).

**Un outil de revue qui montrait autre chose que ce qu'on croyait.** `scripts/captures.mjs` choisit
une boutique avant de photographier les écrans qui en exigent une — et avalait silencieusement
l'échec de ce choix. Depuis S5, les captures de `motos/nouvelle` montraient donc l'invitation à
choisir une boutique, et la revue visuelle portait sur un écran vide sans que cela se voie. Le script
vérifie maintenant que le choix a pris, et s'arrête sinon.

**Ce qui reste ouvert : la reconnexion.** Après une coupure, le SDK Firestore rétablit sa connexion
avec une attente croissante qui peut approcher la minute ; le retour du réseau ne l'interrompt pas.
Le test « une moto se saisit et se consulte sans réseau » échoue donc encore par intermittence, en
fin de suite, quand l'émulateur est chargé. Il passe dix fois sur dix isolé, en dix secondes.

Ce n'est pas un défaut de la numérotation, et le corriger touche le socle réseau — hors du périmètre
de S7 (`WORKFLOW.md` §8). C'est **S27** au backlog : appeler `disableNetwork` à la coupure et
`enableNetwork` au retour, pour que la file reparte quand le signal revient et non quand le SDK a
fini d'attendre. Sur un marché à couverture intermittente, c'est le geste le plus visible du produit.

*Conséquence :* le budget d'assertion passe de cinq à quinze secondes, et celui des deux assertions
de reconnexion à soixante. Ces chiffres calibrent une attente réelle, ils ne masquent rien : une
donnée qui n'arrive pas fait toujours tomber le test. Le défaut restant est **connu, isolé et
inscrit** — pas contourné en silence.

## D51 — Le coût de la moto est figé par le serveur, parce qu'un gérant ne peut pas le lire
`prompt.md` §5.4, §8 — S8, le point le plus délicat de la spec

Le cahier des charges veut un `coutMotoSnapshot` figé au moment de la vente, et le §8 réserve la
marge au responsable. Les deux exigences se contredisent dès qu'un gérant vend : le coût vit dans
`motos/{id}/prive/cout`, que les règles lui refusent en lecture (D2). **Un navigateur ne peut pas
figer ce qu'il n'a pas le droit de lire.**

Trois issues ont été pesées :

- *Le client écrit la marge.* Impossible pour un gérant, et lui ouvrir la lecture du coût reviendrait
  à annuler D2 — c'est-à-dire le §8.
- *Pas d'instantané, on recalcule à l'affichage.* La marge changerait rétroactivement le jour où un
  coût se corrige. Le cahier dit « figé » ; recalculer, c'est autre chose.
- **Retenue : un déclencheur Firestore.** `figerMargeVente` lit le coût et écrit
  `ventesMotos/{id}/prive/marge`. Un seul chemin, identique pour le gérant et le responsable.

Ce n'est pas une écriture de saisie passée par le serveur — le §3.4 l'interdirait. La vente, elle,
est déjà écrite et le reçu déjà remis quand le déclencheur s'exécute ; son retard ne bloque personne,
parce que la marge est un chiffre de pilotage, lu au calme, jamais au comptoir.

*Conséquence, et elle est meilleure que prévu :* les règles ferment `prive/marge` en écriture à
**tout** navigateur, y compris celui du responsable. La marge n'est donc plus seulement cachée au
gérant, elle est **infalsifiable** — personne ne la retouche depuis l'application.

*Limite inscrite, à rouvrir avec l'écran de correction d'un coût :* le coût est lu à la
synchronisation, pas à la seconde de la vente. Aujourd'hui il est écrit une fois pour toutes à
l'entrée en stock, donc les deux valeurs coïncident. Le jour où un coût devient modifiable, cet écran
devra refuser de toucher une moto vendue, ou laisser cet instantané tranquille.

## D52 — Le premier versement appartient au lot de la vente, et porte son numéro
`prompt.md` §6.1 étape 5 — S8, frontière avec S9

Le §6.1 met le versement du jour dans le lot de la vente, alors que les versements sont S9. La
frontière retenue : **S8 écrit un versement, S9 possède leur cycle de vie.** Autrement dit S8 tient
la forme du document, ses règles, et sa création dans le lot ; S9 apporte les versements suivants,
les listes de dettes et de tranches, la correction et l'annulation.

L'exclure était impossible : une vente au comptant sans son versement afficherait « soldée » sans
qu'aucun encaissement n'existe — un mensonge comptable dès la première vente.

**Ce versement porte le numéro de la vente**, et non un numéro tiré du compteur de la boutique. La
raison est mécanique : le compteur de l'appareil s'amorce sur les numéros connus, qu'il lit dans la
collection `ventesMotos` (S7). Des numéros consommés par des versements — qui vivent dans une
sous-collection — resteraient invisibles à un appareil neuf, qui repartirait au milieu de la série et
fabriquerait précisément les doublons que le mécanisme existe pour éviter. Et sur le fond, c'est le
même reçu : celui qu'on tend au client avec les clés. **Une vente consomme un numéro, un seul.**

*Conséquence :* S9 choisit librement comment numéroter les versements suivants, en sachant que la
réconciliation serveur ne couvre aujourd'hui que `ventesMotos`.

## D53 — L'encaissement s'écrit dès maintenant, bien que la caisse soit post-MVP
`prompt.md` §5.9, §6.1 étape 5 — S8, arbitrage demandé

Le cahier veut un `encaissement` par versement ; l'écran de caisse est S22. Fallait-il écrire ce
document maintenant, ou l'ajouter avec son écran ?

Il s'écrit maintenant. `ARCHITECTURE.md` §1 dit de ne pas construire ce dont le besoin n'est pas
actuel — mais le besoin actuel, ici, c'est la **donnée**, pas l'écran : l'argent qui entre dans la
caisse aujourd'hui est une trace qui n'existera plus demain si on ne l'écrit pas. Ce qui est reporté
à S22, c'est la lecture, le journal et la clôture. Écrire un enregistrement n'est pas livrer une
fonctionnalité.

L'autre terme de la balance est franc : reconstituer après coup les encaissements des premières
ventes demanderait une migration sur des données réelles — une opération sensible (`AGENTS.md`
règle 6) — là où l'écriture immédiate coûte une trentaine de lignes de règles et aucun écran.

*Conséquence :* `categorieTranches` est posé dès l'encaissement, alors que rien ne le lit encore.
C'est justement le champ qu'on ne saurait pas recalculer plus tard : il dit si l'argent est une
recette ou un engagement, et cela dépend de l'état de la vente **à cet instant** (§6.2). La
collection est fermée en modification et en suppression : une écriture de caisse ne se retouche pas,
elle se contre-passe.

## D54 — Une attente de synchronisation ne se met qu'où un second navigateur regarde
S8 — trouvé en instrumentant la suite des ventes, après trois diagnostics faux

La suite bout en bout des ventes échouait de façons changeantes. Les trois premières explications
étaient fausses, et chacune a coûté une exécution complète :

- « Le produit est cassé » — écarté : la même page, sondée à la main, affichait la moto en une
  seconde. Ce sont les tests qui mentaient, pas l'écran.
- « L'écoute Firestore est en panne » — écarté aussi : le message n'était pas un délai de
  localisateur mais `Test timeout of 90000ms exceeded`. Le décor consommait le budget entier du test
  avant la première assertion.
- « Il faut attendre la synchronisation partout » — la correction qui a fait le plus de dégâts. Mise
  dans le décor de chaque test, cette attente a fait passer la suite de 4 à 12 minutes **et** l'a
  rendue plus fragile : l'attente elle-même expirait, et deux tests qui passaient se sont mis à
  échouer.

Le principe qui reste : **un navigateur qui vient d'écrire lit son propre cache et n'a rien à
attendre** — c'est même exactement la promesse du produit. L'attente n'a de sens que là où un
*second* navigateur doit voir les données, donc les avoir reçues du serveur. Dans cette suite, un
seul test est dans ce cas : celui où le gérant ouvre sa propre session.

*Mesuré :* 8 tests, 12 min 20 avec l'attente partout et deux échecs ; **4 min 30 sans, et zéro
échec**. Le test hors-ligne, lui, est passé de 3 min 6 et un échec à **13 secondes**.

*Conséquence, et c'est la leçon généralisable :* une attente ajoutée pour stabiliser un test doit
nommer ce qu'elle attend. « Que tout soit calme » n'est pas une condition — c'est une superstition
qui rend la suite lente, et lente veut dire fragile.

## D55 — Ce qui reste fragile dans la suite bout en bout, et pourquoi on le laisse
S8 — mesuré sur trois exécutions complètes

Deux tests échouent **en suite complète** et passent isolés. Ce ne sont pas des défauts introduits
par S8 — vérifié en rejouant chaque fichier seul, où il passe intégralement.

- `boutiques.spec.ts` › « un gérant créé sans boutique en reçoit une » (S3). Isolé : 8 tests, 8
  passés. En fin de suite chargée, la liste des comptes revient vide alors que la fonction a bien
  répondu « Compte créé ». La cause est celle de D50 : quand la file d'écritures est encombrée, le
  SDK Firestore sert un cache où `users` n'a jamais été chargé, et une collection jamais vue revient
  vide plutôt qu'en attente.
- `motos.spec.ts` › « une moto se saisit et se consulte sans réseau » (S5, déjà inscrit en D50).

*Ce qui a été fait pour ne pas propager le défaut :* le test équivalent de S8 n'interroge plus la
liste des comptes mais la confirmation de la fonction, qui prouve la même chose sans dépendre d'une
écoute encombrée. La correction de fond reste **S27** — rebrancher le réseau à la reprise plutôt
qu'attendre la fin du délai croissant du SDK.

*Chiffre de référence, suite complète :* 56 tests, 54 passés, les 2 ci-dessus en échec. Fichier par
fichier, tout passe.

*Mesuré à nouveau en S9, et le facteur manquait :* **l'ancienneté de l'instance d'émulateur compte
autant que la charge de la suite.** Le même fichier `paiements.spec.ts` est passé en 2 min 36 (7/7),
puis en 11 min 30 avec 2 échecs sur une instance d'émulateur vieille de plusieurs heures, puis à
nouveau en 7 min 24 (7/7) après un simple redémarrage des émulateurs — sans qu'une ligne de code
change entre les deux derniers.

Les échecs ne portaient jamais sur une assertion de S9 : ils tombaient tous dans le **décor**
(`getByLabel('Chercher dans le stock')`, le radio d'un client), c'est-à-dire sur une écoute Firestore
qui ne délivrait plus. C'est le défaut de D50, et la suite de S9 y est la plus exposée du projet
parce qu'elle est la plus gourmande en décor : sept tests qui chacun créent une boutique, des
référentiels, une moto, un client et une vente.

*Conséquence pratique, avant d'accuser le code :* un échec de décor dans cette suite se rejoue sur
des émulateurs redémarrés. Si l'échec persiste, alors seulement il porte sur le produit. La
correction de fond reste **S27**.

*Mesuré une troisième fois en S10, et le redémarrage ne suffit plus.* La règle ci-dessus a été
appliquée à la lettre — émulateurs redémarrés, fichier rejoué seul — et `paiements.spec.ts` est
resté à 5/7. Restait à savoir si S10 en était la cause. **Vérifié sur `master`, sans une ligne de
S10 : 6/7, le même test de remise en échec, sur la même attente de décor.** La suite complète, elle,
donne 65/67.

Deux chiffres à retenir de cette mesure. D'abord les échecs sont **tournants** : trois exécutions
consécutives ont fait tomber trois ensembles différents, jamais deux fois le même. Ensuite les durées
d'un test identique vont de 5,8 secondes à 2 minutes 6 selon l'exécution — un facteur vingt sur du
code inchangé. Ce n'est pas un produit qui échoue par intermittence, c'est un harnais dont la mesure
est bruitée.

*Ce que cela change, à partir de S10 :* le redémarrage des émulateurs ne suffit plus à disculper le
code, et « fichier par fichier, tout passe » n'est plus vrai. La comparaison qui tranche est
désormais celle-ci — **rejouer le même fichier sur `master`.** Si la branche et `master` échouent au
même endroit, l'échec est du harnais. La correction de fond reste S27, et son rang dans le backlog
n'a jamais été aussi mérité : c'est le même défaut qui gêne le produit sur le marché et la
vérification sur cette machine.

*Mesuré une quatrième fois en S3bis — cinq suites complètes, cinq ensembles disjoints.* Les verdicts
successifs sur une même branche : 74/74, puis 71/74, puis 67/74, puis 68/74 sur des émulateurs
fraîchement redémarrés. **Aucun test n'a échoué deux fois de suite**, et la durée de la suite est
allée de 10 min 54 à 37 min 06 sans qu'une ligne de code applicatif change entre les deux.

Deux enseignements que les mesures précédentes n'avaient pas isolés :

- **Le redémarrage des émulateurs n'améliore pas le taux** — il a donné 68/74 là où l'instance âgée
  donnait 67/74. Ce qui pèse est la charge pendant l'exécution, pas seulement l'âge de l'instance.
- **Il existe un signal plus rapide que le détour par `master`** : si l'ensemble des échecs ne
  contient aucun test écrit ou modifié par la branche, la question est tranchée sans changer de
  branche. La dernière mesure contenait `auth.spec.ts` « un mot de passe faux ne dit pas si le compte
  existe » — un test sans boutique, sans gérant et sans écriture, qui ne peut dépendre d'aucun
  changement de S3bis.

*Ce que S3bis en a tiré pour ses propres tests :* créer un compte est la seule opération de
l'application qui exige le réseau, et c'est la plus exposée. Une suite qui en crée trois rend le
piège trois fois plus probable. `e2e/espaces.spec.ts` en crée donc deux, et attend la confirmation de
la fonction plutôt que la ligne dans la liste des comptes — le remède déjà retenu en S8.

## D56 — Les versements font foi, les agrégats de la vente sont un cache d'affichage
`prompt.md` §3.4, §5.4 — S9, le point le plus délicat de la spec

Le cahier des charges met `totalPaye` et `resteDu` sur le document de vente (§5.4). Le hors-ligne
rend ce choix faux dans un cas précis, et ce cas n'est pas rare : **deux gérants sans réseau qui
encaissent chacun un versement sur la même vente écrivent tous deux ce champ.** La dernière écriture
gagne (§3.4), et un versement disparaît des totaux alors que son reçu est entre les mains du client.
Les sous-documents, eux, survivent tous les deux — une sous-collection n'a pas de dernière écriture
gagnante.

Trois issues ont été pesées :

- *Garder l'agrégat comme vérité.* C'est ce que S8 faisait, et c'est ce qui produit exactement le
  défaut ci-dessus. Un total de paiement faux n'est pas une gêne d'affichage : c'est de l'argent
  réclamé deux fois ou perdu.
- *Supprimer l'agrégat, tout recalculer à la lecture.* Juste, mais le cahier des charges le demande
  sur le document, et l'écran des ventes afficherait cinquante restes dus en ouvrant cinquante
  sous-collections.
- **Retenue : les deux, avec une hiérarchie explicite.** Les versements sont la source de vérité ;
  le parent est un cache. L'appareil l'écrit dans son lot pour que l'écran soit juste tout de suite,
  sans réseau. Un déclencheur, `recalculerPaiementsVente`, le recalcule depuis la sous-collection dès
  que l'écriture parvient au serveur — il est le seul à voir les versements de *tous* les appareils.

Le déclencheur n'a besoin d'aucun verrou : il relit la collection entière et écrit une valeur
absolue, jamais un incrément. Deux exécutions concurrentes tombent donc d'accord sans se parler,
comme la réconciliation des numéros (D45). Il s'abstient d'écrire quand les totaux sont déjà justes —
c'est-à-dire dans le cas ordinaire à un seul appareil — pour ne pas payer une écriture par versement
sur le document le plus sollicité du produit.

*Conséquence côté écrans, et c'est la moitié qui compte :* **l'interface additionne les versements
chargés, elle ne lit pas l'agrégat.** La fiche d'une vente écoute sa sous-collection ; les trois
listes de suivi écoutent un groupe de collections filtré par boutique. Le champ du parent ne sert que
de repli tant que les versements ne sont pas lus. C'est aussi ce que le §3.4 demande : les agrégats
se calculent côté client, jamais depuis le serveur.

*Conséquence côté règles :* `totalPaye` ne peut que **monter** depuis un navigateur, et jamais
dépasser le prix convenu. Un trop-perçu ne peut donc venir que du déclencheur, qui l'écrit tel quel —
et cette vente n'accepte alors plus aucun versement, ce qui est le comportement voulu. La remise de
la moto, elle, se garde sur `resteDu == 0` de l'état d'avant : cet agrégat ne peut se tromper que
dans le bon sens, puisque `totalPaye` n'additionne que des versements réels et reste donc inférieur
ou égal à la vérité.

*Limite inscrite :* un versement enregistré hors ligne reste invisible aux autres appareils jusqu'à
la synchronisation. Aucun mécanisme ne peut y changer quoi que ce soit — c'est la définition du
hors-ligne, pas un défaut de ce montage.

## D57 — Le reçu d'un versement dérive du numéro de la vente, il ne consomme pas de numéro
`prompt.md` §3.3, §10 — S9, suite de D52

D52 laissait S9 libre de numéroter les versements suivants, en prévenant que la réconciliation
serveur ne couvre que `ventesMotos`. Deux voies s'ouvraient.

- *Une seconde série de compteurs.* Elle respecterait le format du §3.3 à la lettre, mais le compteur
  d'un appareil s'amorce sur les numéros qu'il lit dans `ventesMotos` (S7) : des numéros consommés
  par des versements resteraient invisibles à un appareil neuf, qui repartirait au milieu de la série
  et fabriquerait précisément les doublons que le mécanisme existe pour éviter. Il faudrait alors
  étendre la réconciliation serveur à une sous-collection — du travail réel, pour un gain nul.
- **Retenue : le numéro de la vente, suivi du rang du reçu.** `PTG-2608-0042/V2` pour le deuxième
  encaissement. Le premier versement, écrit dans le lot de la vente (D52), porte le numéro nu : il
  est le rang 1. Le suffixe d'une vente renumérotée suit : `PTG-2608-0042-B/V2`.

Ce numéro n'est pas une nouvelle série mais la dérivation d'un numéro déjà conforme. `analyserNumero`
ne le reconnaît pas — vérifié par un test — donc il ne peut structurellement pas perturber le
compteur des ventes. Et il tient le §10 mieux qu'un numéro indépendant : un reçu doit être retrouvable
depuis la vente concernée, et celui-ci la porte écrite dessus.

*Le rang se lit sur les versements chargés,* d'où une règle d'écran : le formulaire n'apparaît
qu'une fois la sous-collection lue. Numéroter à l'aveugle serait pire que ne pas numéroter.

*Limite assumée :* deux appareils hors ligne qui encaissent sur **la même vente** produiront tous
deux un `/V2`. Les deux versements existent, les totaux restent justes après recalcul (D56), et seule
l'étiquette du reçu se répète — dans un seul dossier, où elle se voit. C'est un ordre de grandeur
moins grave qu'un compteur qui dérive pour toute une boutique, et cela ne demande aucun serveur.

## D58 — La remise de la moto ne retouche pas les encaissements passés
`prompt.md` §5.9, §6.2 — S9

À la remise d'une moto en tranches, l'argent détenu pour le compte du client devient une recette du
magasin. Fallait-il alors repasser sur les encaissements déjà écrits pour y retourner
`categorieTranches` ?

Non, et pour une raison qui n'est pas de commodité : **une écriture de caisse ne se retouche pas**
(D53), et les règles la ferment en modification pour tout le monde. Le drapeau dit ce qu'était
l'argent au moment où il est entré ; c'est un fait daté, pas un statut courant.

L'information n'est pas perdue pour autant : la vente porte `motoRemise` et `dateRemiseMoto`. Un
encaissement marqué `categorieTranches` appartient à une vente qui dit elle-même si — et quand —
l'engagement est devenu recette. La caisse (S22) lira les deux ensemble.

*Ce que la remise écrit, en revanche :* une entrée dans `ventesMotos/{id}/historique` (§3.5). Ce
n'est pas un doublon des champs de la vente — `updatedBy` sera écrasé par la prochaine écriture,
alors que ce geste-là doit rester attribuable. Un versement, lui, **est** sa propre trace : il
n'écrit rien dans l'historique.

*Conséquence :* la correction et l'annulation d'un versement restent hors de S9, y compris pour le
responsable. Le §6.2 les lui réserve ; ce sont des opérations sensibles sur de l'argent encaissé et
un reçu déjà remis, et elles rejoignent S25, qui traite déjà l'annulation d'une vente. Les règles
gardent donc `update, delete: if false` sur les versements, pour tous les rôles — arbitré avec le
responsable du projet, pas décidé seul.

## D59 — Un déclencheur ajouté au code des fonctions coûte un rechargement complet
S9 — constaté en vérifiant les déclencheurs

Après l'ajout de `recalculerPaiementsVente`, la première exécution de `npm run test:declencheurs` a
échoué sur `marge.test.ts` : son réveil de runtime (D43, D49) a dépassé son budget de 90 secondes,
alors que la fonction elle-même était intacte. Les exécutions suivantes passent en 16 secondes.

L'explication est le rechargement : l'émulateur Functions redécouvre tout le code après une
recompilation, et le premier déclencheur sollicité paie cette redécouverte en plus de son propre
démarrage à froid.

*Conséquence, à savoir avant d'accuser le code :* après un `npm run build:functions`, la première
exécution des tests de déclencheurs n'est pas une mesure. On la relance. Le réveil déjà en place
(D49) protège des démarrages à froid ordinaires, pas de celui-là.


## D60 — Le PDF sort de la boîte d'impression du navigateur, pas d'une bibliothèque
`prompt.md` §10 — S10, l'arbitrage de la spec

Le §10 propose « une librairie client type `jsPDF` ou `react-pdf` », et la fiche de S10 en héritait :
import dynamique, mise en cache par le service worker, sans quoi le PDF ne se génère pas hors ligne.
L'échelle d'`ARCHITECTURE.md` §1 impose de regarder le barreau 3 avant le barreau 4, et il tient :
**`window.print()` produit déjà un PDF.** « Enregistrer au format PDF » est une destination
d'impression native — le service d'impression d'Android l'offre, un ordinateur en fait son défaut —
et elle est entièrement locale, donc disponible en coupure.

Ce que la bibliothèque aurait apporté en plus est précis : un `File` en mémoire, que
`navigator.share({ files })` tend à WhatsApp en un geste. Ce que ça aurait coûté l'est aussi.

- Une centaine de kilo-octets à précharger **sur chaque appareil**, puisque nos écrans sont mis en
  cache à l'installation (D40). Un import dynamique n'y change rien : il déplace le moment du
  téléchargement, pas son obligation, dès lors qu'il doit être là avant la coupure.
- Et surtout : `jsPDF` ne sait pas rendre notre HTML. Il faudrait **recomposer le reçu une seconde
  fois** en appels de dessin — deux rendus du même document financier, tenus d'être identiques,
  dans deux langages différents. C'est la duplication silencieuse qu'`ARCHITECTURE.md` §2 interdit,
  sur le document où elle se paierait le plus cher : le jour où les deux divergent, le papier et le
  fichier envoyé au client ne disent plus la même chose.

**Retenu : impression navigateur seule.** Un seul rendu, celui de `components/Recu.tsx`, composé par
le moteur du navigateur pour l'écran, pour le papier et pour le PDF. Le partage porte le
récapitulatif en texte — numéro, montant, reste dû, ce que le §11 décrit comme message type 3 — via
Web Share quand elle existe, sinon le presse-papiers. Les deux sont natives et fonctionnent hors
ligne, elles aussi.

*Ce qui rouvrirait la décision :* un besoin exprimé d'envoyer la pièce jointe elle-même, et non son
récapitulatif. Il se traitera avec S14, dont l'envoi au client est le sujet — et la bibliothèque
s'ajoutera là, où le besoin est réel, plutôt qu'ici au cas où.

*Conséquence assumée :* le gérant qui veut un fichier passe par la boîte d'impression, soit un geste
de plus qu'un bouton « Télécharger ». En échange, aucune dépendance, aucun octet préchargé, et
l'impossibilité structurelle que le reçu imprimé et le reçu partagé divergent.

## D61 — Un reçu se recalcule, il ne se fige pas
`prompt.md` §10 — S10

La fiche de S10 demandait de figer les données à l'impression : « on ne recalcule pas un reste dû au
moment de réimprimer un vieux reçu, on réimprime ce que le client a reçu ce jour-là — le stocker
explicitement, ne pas le déduire ». L'intention est juste, la conclusion ne suit pas.

Elle supposerait qu'un recalcul puisse donner autre chose. Or les deux données dont le reçu dérive
sont **immuables**, et pas par convention : le prix convenu est fermé en écriture depuis S8, et un
versement ne se modifie ni ne se supprime, pour aucun rôle — les règles portent `update, delete: if
false` et S25 hérite de la correction (D58). Le total payé au jour d'un reçu est donc exactement la
somme des versements jusqu'à sa date, et le reste dû la soustraction correspondante. Le calcul ne
peut pas rendre un autre nombre que celui qui a été imprimé.

Stocker ces deux chiffres créerait une seconde copie de la vérité, sans en créer une seconde source.
Et une copie qui ne peut que se dégrader : elle serait écrite par l'appareil, donc exposée au même
écrasement hors ligne que les agrégats de la vente (D56), sur un document qui, lui, prétend faire foi.

*Conséquence :* aucune collection `recus`, aucun champ ajouté, aucune écriture au moment d'imprimer.
Un reçu est une **lecture** — `composerRecus(vente, versements)` — et son identifiant d'URL est le
couple de ceux dont il rend compte. Réimprimer six mois plus tard rend le même papier, et le test
bout en bout le vérifie en encaissant un versement de plus **après** celui qu'il rouvre.

*Le seul champ ajouté par S10 l'est pour une autre raison :* `operateur`, lu depuis la trace d'audit
`createdByName` déjà écrite. Le §10 exige de nommer l'opérateur sur le document ; `createdBy` n'est
qu'un identifiant de compte. Rien de neuf n'est écrit — seulement lu.

---

## D62 — Le métier est porté par la boutique, pas par un rayon

**Contexte.** `prompt.md` §3.2 et §5.7 supposaient que chaque boutique tenait à la
fois des motos et des pièces : `stockPieces/{boutiqueId}_{pieceId}` existe pour toute
boutique, et rien dans le modèle `boutiques` ne disait le contraire. La réalité de
l'entreprise est autre : il y a des boutiques de vente de motos, et une boutique de
pièces détachées. Ce sont des magasins différents, avec des gérants différents.

**Décision.** `boutiques` porte un champ `metiers: ('motos'|'pieces')[]`, au moins une
valeur, exigé par les règles Firestore à la création comme à la modification. Il décide
des espaces ouverts au gérant de cette boutique.

Un **tableau** plutôt qu'un `type` unique : rien n'interdit qu'un magasin finisse par
tenir les deux, et ce jour-là le modèle n'a pas à être repeint. Le coût est nul — un
tableau de deux valeurs au maximum, validé par `hasOnly` côté règles.

Contrairement au `code`, les métiers **se modifient**. Le code entre dans les numéros de
reçus déjà imprimés (D5, D30) ; les métiers n'apparaissent nulle part sur du papier.

**Conséquence sur les documents déjà écrits.** À la lecture, un document sans `metiers`
est lu comme portant les deux : c'est ce qu'il tenait avant cette décision, donc ce
défaut ne cache rien. Les règles, elles, exigent le champ à l'écriture — le défaut ne
survit pas à la première modification de la boutique.

**Écart assumé avec le cahier des charges**, qui a été corrigé en conséquence
(`prompt.md` §1, §3.2, §5.1, §13, §14, §15).

---

## D63 — La supervision est une section, pas un tableau de bord

**Contexte.** `prompt.md` §1 décrivait « deux espaces plus un tableau de bord
transversal », et §14 en faisait une page de cartes dans l'application commune. Le
besoin réel est un **troisième espace** : le responsable pilote plusieurs boutiques
qu'il ne peut pas toutes avoir sous les yeux, et sa place n'est pas au comptoir.

**Décision.** `/supervision` est une section réservée au responsable, gardée par la
capacité `acceder_supervision`. C'est là qu'il atterrit à la connexion, et c'est de là
qu'il choisit la boutique qu'il regarde. Le gérant en ignore l'existence : elle
n'apparaît pas dans sa navigation, et la garde explique le refus s'il suit un lien.

`/dashboard` reste l'accueil du **gérant** seul ; un responsable qui y arrive est
renvoyé vers sa supervision. Deux pages d'accueil qui diraient presque la même chose
divergeraient à la première évolution.

**Ce que S3bis livre, et ce qu'elle ne livre pas.** Le *lieu*, pas les *chiffres*. La
supervision liste les boutiques et ouvre chacune sur son espace. Les agrégats — ventes
du jour, encaissements, dettes, tranches, alertes — restent le sujet de S24 : les
afficher maintenant produirait des cartes à zéro, c'est-à-dire un tableau de bord qui
ment.

**Conséquence sur la coquille.** La navigation principale n'est plus une liste figée :
elle se déduit du rôle et des métiers du périmètre courant, par une fonction pure
(`lib/domain/espaces.ts`) partagée par la barre, les gardes de route et les accueils.
Sans ce point unique, la barre proposerait une entrée que l'écran refuserait ensuite.

---

## D64 — Une boutique existe à l'écran avant d'exister pour le serveur

*Trouvé en S3bis, en cherchant pourquoi un test tombait toujours au même endroit.*

Deux chemins d'écriture coexistent dans l'application, et ils ne voient pas le même monde
au même instant :

- Une **boutique** s'écrit par le SDK Firestore. Elle est prise par le cache local
  immédiatement, apparaît dans la liste, et part au serveur quand le réseau le permet.
  C'est toute la promesse hors-ligne, et c'est délibéré.
- Un **gérant rattaché à cette boutique** s'écrit par une Cloud Function, parce que le
  rattachement pose un custom claim que seul le SDK Admin peut poser. Cette fonction lit
  le **serveur**.

Enchaîner les deux trop vite donne donc `Cette boutique n'existe pas.` — alors que la
boutique existe, à l'écran, sous les yeux de la personne qui vient de la déclarer. Le
message accuse l'existence quand la vérité est l'acheminement.

**Ce qui a été fait.** Le helper de test `creerBoutique` attend désormais que le bandeau
annonce « À jour » avant de rendre la main : c'est le seul signal qui dise que la file
d'écritures est vidée. Cela a supprimé un échec qu'on attribuait au harnais depuis
plusieurs specs — il n'en était pas un.

**Ce qui reste ouvert, et qui touche le produit, pas les tests.** Un responsable qui
déclare une boutique puis crée son gérant dans la foulée, sur une liaison lente, lira ce
même message trompeur. Deux corrections possibles, à trancher :

1. Dire la vérité dans le message — « Cette boutique n'est pas encore parvenue au serveur.
   Attendez que le bandeau affiche « À jour ». » Peu coûteux, honnête, mais laisse
   l'utilisateur attendre sans rien faire.
2. Désactiver le rattachement d'un gérant tant que la file d'écritures n'est pas vide,
   avec la raison écrite à l'écran. Plus juste : on n'offre pas une action qui ne peut pas
   aboutir.

**Tranché en S12 : la seconde.** `useAcheminementBoutiques` dans l'écran des utilisateurs
lit l'état du réseau et de la file, désactive le rattachement et le choix de boutique à la
création d'un gérant, et écrit la raison — combien de saisies restent à partir, ou que
l'opération demande le serveur. Corriger le message aurait suffi à ne plus mentir ; refuser
le geste évite en plus de le faire échouer.

Le formulaire de création reste utilisable **sans** boutique pendant ce temps : un compte
peut être créé maintenant et rattaché plus tard. Bloquer les deux aurait transformé une
attente de quelques secondes en impasse.

La seconde vaut mieux et coûte peu. Elle n'a pas été faite ici parce qu'elle touche
l'écran des utilisateurs (S2), hors du périmètre de S3bis — mais elle ne doit pas se
perdre : **c'est le seul endroit connu où l'application promet une chose que le serveur
refuse.** Elle est à traiter avec S12, qui repasse sur les frontières client/serveur.

**Une piste voisine, non élucidée.** Deux tests préexistants continuent de tomber, et ils
ont un point commun : ils **ouvrent une session de gérant juste après avoir créé son
compte**. L'un voit sa liste de marques rester vide, l'autre reçoit « Vos droits ne
permettent pas de lire ces données » en ouvrant une vente de sa propre boutique. Les deux
ressemblent à quelque chose qui n'est pas encore parvenu là où on le lit — un claim, une
écriture, une écoute. C'est une meilleure piste que « bruit du harnais », et elle n'a pas
été suivie : elle relève de S2 et de S12. À ne pas reclasser en flakiness sans l'avoir
regardée — c'est l'erreur que S3bis a failli commettre sur le cas ci-dessus.

---

## D65 — Les quatre documents ne suivent pas le même chemin

*Trois versions de cette décision en une journée : la première était une supposition, la
seconde une demi-correction, celle-ci vient du responsable.*

Le cahier dessine un cycle unique (`prompt.md` §7.1) et l'applique aux quatre documents :

```
a_faire → chez_prestataire → revenu_magasin → remis_client
```

**Ce n'est pas ce que fait la maison.** Le trajet réel se sépare en deux.

| Document | Trajet réel |
|---|---|
| **Quittance** | Accompagne la moto à son arrivée. Le magasin reçoit le produit fini. |
| **CMC** | S'obtient au ministère avec la quittance — démarche menée **hors du périmètre de l'entreprise**. Le magasin reçoit le produit fini. |
| **Carte grise** | Confiée à un prestataire. |
| **Plaque** | Confiée à un prestataire. |

**Décision.** Le chemin dépend du **type** de document, pas seulement de son statut.

- Quittance et CMC : `a_faire → revenu_magasin → remis_client`. L'étape
  `chez_prestataire` n'existe pas pour eux — personne ne les détient jamais, et un nom de
  prestataire inscrit en face serait faux dans la liste des dossiers en attente (§7.3).
- Carte grise et plaque : le cycle complet, sans saut possible. C'est le dépôt qui dit qui
  détient le document ; le sauter priverait cette liste du seul renseignement qu'elle sert
  à donner.

**Deux passages restent refusés pour tous.**

- `chez_prestataire → non_applicable`. Déposer crée un encaissement de sortie pour l'avance
  versée (§7.1) ; écarter ensuite laisserait de l'argent sorti sans contrepartie. On écarte
  avant de déposer.
- Tout retour en arrière, et toute sortie de `remis_client` ou `non_applicable`. Corriger
  une erreur de saisie est une opération sensible, journalisée, réservée au responsable :
  c'est **S25**, au même titre que l'annulation d'une vente ou d'un versement (D10, D58).

**La leçon, qui vaut au-delà de cette décision.** Le cahier des charges décrivait un cycle
uniforme parce qu'il est plus simple à écrire, pas parce que le métier est ainsi. J'ai
d'abord comblé l'écart par une supposition plausible — et fausse. Une question posée au
début de S11 aurait coûté cinq minutes ; la supposition a coûté un module et ses tests,
écrits deux fois.

---

## D66 — Le hors-ligne se cherche, il ne commande plus

*Arbitrage du responsable, en cours de S11.*

`AGENTS.md` et `prompt.md` §0 posaient le hors-ligne en veto : « tout écran de saisie
fonctionne sans réseau », et « une spec dont la saisie ne marche pas hors ligne n'est pas
terminée ». Cette règle a façonné des décisions structurantes — écritures par le SDK
plutôt que par Cloud Function, agrégats calculés côté client (D53, D56), photos repoussées
en S19 (D14).

**Ce qui change.** Le hors-ligne reste recherché partout où il est possible, et tout ce qui
marche aujourd'hui sans réseau continue de marcher. Mais il cesse d'être un veto : là où la
technique ne le permet pas, l'écran **le dit** et la spec est terminée quand même.

**Ce qui ne change pas.** Les décisions déjà prises restent : une vente, un versement, une
entrée en stock passent toujours par le SDK. Elles ne coûtent rien à garder et ce sont les
gestes du comptoir, ceux qu'on fait debout, une main occupée.

**Ce que ça débloque.** L'envoi de fichier (D14). Firebase Storage n'a pas de file d'attente
hors ligne : un envoi sans réseau échoue. La règle précédente interdisait donc d'ajouter un
champ d'upload à un formulaire de saisie ; la nouvelle l'autorise, à condition que l'écran
annonce clairement que ce champ-là demande du réseau. **Deux exigences pratiques :** le
reste du formulaire s'enregistre sans le fichier, et le fichier reste ajoutable plus tard —
sans quoi une saisie faite au comptoir sans réseau serait perdue ou incomplète pour
toujours.

*Conséquence sur S27* (reconnexion immédiate au retour du réseau) : son rang baisse en
priorité produit, puisque le hors-ligne n'est plus la promesse centrale. Elle garde sa
valeur pour la **vérification** — c'est le défaut qui rend la suite bout en bout bruitée
(D55).

---

## D67 — La base de la préversion est en `nam5`, celle de production sera en Europe

*Constat de déploiement, S11.*

Le déploiement des règles a **créé** la base Firestore de `sandwini`, et faute d'emplacement
demandé, Google l'a placée dans `nam5` — multi-région États-Unis. Les déclencheurs le disent
en clair : `projects/sandwini/locations/nam5/triggers/…`, alors que les fonctions tournent en
`europe-west1`.

**L'emplacement d'une base Firestore ne se change pas.** Ni par une commande, ni par la
console : il faut créer une autre base et tout recopier.

**Pour la préversion, on garde.** C'est un environnement jetable (`DEPLOIEMENT.md` §4) ; le
détour par les États-Unis coûte quelques dizaines de millisecondes à chaque écriture, ce qui
ne change rien à ce que le responsable vient y regarder. Recréer la base pour cela
coûterait plus cher que le défaut.

**Pour la production, non.** Les utilisateurs sont au Burkina Faso, et une base américaine
leur ajoute un aller-retour transatlantique sur chaque lecture non mise en cache — sur des
téléphones et un réseau qui n'ont pas de marge. La base de production se crée
**explicitement** en `eur3`, *avant* le premier déploiement de règles :

```
firebase firestore:databases:create "(default)" --location eur3 --project <production>
```

À faire figurer dans la procédure de mise en production, parce que c'est une commande qu'on
ne peut passer qu'une fois.

---

## D68 — Le premier responsable s'amorce par une fonction jetable

*Constat de mise en ligne, S11.*

Le rôle est un **custom claim**, lu dans le jeton et jamais dans Firestore
(`lib/auth/session.tsx`). Trois faits s'enchaînent mal :

- la console Firebase crée des comptes, mais **ne sait pas poser de claim** ;
- `creerGerant` exige déjà un responsable pour en créer un autre ;
- `scripts/amorcer.mjs` refuse — à raison — de viser autre chose que les émulateurs.

Un projet neuf était donc une boucle fermée. Le commentaire du script disait « comme le
ferait un administrateur en production depuis la console Firebase » : c'était faux, et
c'est ce qui a masqué le trou.

**La sortie.** Une fonction HTTP `amorcerResponsable`, dans `functions/src/index.ts`,
qu'on déploie, qu'on appelle une fois, puis qu'on supprime. Trois gardes, qui échouent
toutes **fermé** :

1. l'appelant présente un jeton d'identité valide, et c'est **lui-même** qu'il promeut ;
2. elle refuse s'il y a plus d'un compte — elle ne choisit jamais qui promouvoir ;
3. elle refuse dès que ce compte porte un rôle — inerte après le premier succès.

Aucune clé de compte de service à télécharger, ce qui était l'objectif : `SECURITY.md` §2
interdit qu'une telle clé sorte de Vercel. Le jeton s'obtient par un appel direct à
Identity Toolkit avec la clé d'API publique ; le mot de passe ne quitte pas la machine de
l'administrateur.

**La première garde a été ajoutée après coup, et c'est la leçon.** La version d'origine
n'avait que les deux dernières. Elle n'était pas exploitable telle qu'elle a été employée
— s'inscrire pour devancer l'administrateur fait passer le nombre de comptes à deux et
*bloque* l'amorçage. Mais sa sûreté reposait sur l'**ordre des commandes** : créer le
compte avant de déployer. Déployée d'abord sur un projet vide, elle aurait promu le premier
inscrit venu, l'inscription par e-mail et mot de passe étant ouverte à quiconque détient la
clé d'API publique — laquelle part dans chaque navigateur.

Ce que le code n'impose pas, une procédure écrite ne l'impose pas non plus. Sur la
préversion l'enjeu était nul ; sur la production, avec de vraies données, dépendre d'un
ordre de commandes n'est pas une protection.

## D68 bis — Un compte sans rôle est un état, pas une absence de session

Le défaut trouvé le même jour : la connexion réussissait, `lireUtilisateur` ne trouvait pas
de rôle, et la session basculait sur `deconnecte`. L'écran de connexion restait donc là,
inchangé, **sans un mot**. Le mot de passe était bon ; rien ne le disait.

`Session` gagne un état `sans_role`, et l'écran de connexion l'explique. Confondre « mot de
passe refusé » et « compte à moitié créé » produisait la panne la plus décourageante du
produit : un formulaire qui accepte la saisie et ne fait rien, sans rien à tenter ensuite.

C'est exactement ce que `DESIGN.md` §10 demande d'éviter, et le rappel que l'inventaire des
états n'est pas une formalité : celui-ci manquait depuis le début et n'est apparu qu'au
premier vrai compte, créé à la main.

---

## D55 — cinquième mesure : distinguer l'émulateur muet du défaut de produit

*Ajout lors de S11.*

Un test de `e2e/dossier.spec.ts` échouait sur « Hors ligne · 1 saisie en attente » là où il
attendait « À jour ». Deux échecs de suite : de quoi conclure à un défaut. C'était faux, et
la méthode qui l'a montré vaut d'être notée.

**Ce qui a tranché, c'est la trace.** `npx playwright show-trace` contient les messages de
console du navigateur :

```
@firebase/firestore: Could not reach Cloud Firestore backend.
Backend didn't respond within 10 seconds.
```

Un refus de règles arrive en `permission-denied` et se lit dans cette même console. Il n'y
en avait aucun, et les 434 appels HTTP étaient en 200. Ce n'était donc pas une écriture
refusée mais un **transport muet** : l'émulateur avait cessé de répondre après avoir encaissé
la suite de règles complète.

**Trois vérifications, dans cet ordre**, avant d'accuser le produit :

1. Reproduire l'écriture exacte dans un test de règles — le lot entier, pas une écriture
   isolée : un `writeBatch` est accepté ou refusé en bloc. Ici il passait.
2. Lire les messages de console dans la trace. `permission-denied` accuse le code ;
   `Backend didn't respond` accuse la machine.
3. Rejouer sur un émulateur **fraîchement redémarré**. Ici : trois tests, 4,6 minutes,
   tous verts.

**Ce que l'épisode a quand même corrigé.** L'assertion fautive attendait « À jour » sur le
bandeau — c'est-à-dire l'indicateur de synchronisation, pas le comportement de S11. Elle a
été remplacée par un rechargement de page suivi d'une relecture de l'état : cela prouve que
le dépôt a survécu, ce que l'affichage optimiste seul ne prouvait pas. **Une assertion sur
un indicateur d'infrastructure n'a pas sa place dans un test de comportement métier** — elle
importe le bruit de D55 dans des suites qui n'ont rien à y voir.

---

## D69 — Une CSP trop stricte est une panne, et rien ne la surveillait

*Trouvé par le responsable, sur le projet réel, en essayant de créer un gérant.*

`connect-src` autorisait `googleapis.com`, `firebaseio.com` et `firebaseapp.com`. Les
fonctions appelables, elles, répondent sur `{region}-{projet}.cloudfunctions.net` — aucun
de ces trois. Le navigateur coupait donc **tous** les appels serveur avant qu'ils partent :
créer un gérant, le rattacher à une boutique, désactiver un compte.

**Ce que l'utilisateur lisait :** « Le serveur n'a pas répondu. Cette action demande du
réseau — réessayez une fois connecté. » Le message accusait le réseau, alors que la demande
n'avait jamais quitté la page.

**Pourquoi personne ne l'a vu pendant onze specs.** Les émulateurs répondent sur
`127.0.0.1`, explicitement autorisé quand `NEXT_PUBLIC_FIREBASE_EMULATEURS=1`. La panne
n'existait donc qu'en ligne, et rien ne tournait en ligne avant cette semaine.

**La leçon, qui dépasse le cas.** `e2e/socle.spec.ts` vérifiait depuis S1 que la CSP ne
**relâche** rien — pas d'`unsafe-eval`, `object-src 'none'`, `frame-ancestors 'none'`. Une
CSP trop **stricte** n'était surveillée par personne, alors qu'elle casse le produit tout
aussi sûrement. Un durcissement ne se teste que dans un sens par réflexe ; les deux sens
comptent. L'assertion miroir est ajoutée.

*Conséquence sur S12 :* la passe de durcissement devra vérifier chaque restriction dans les
deux sens — ce qui est refusé, et ce qui doit rester possible.

---

## D70 — La marque prend la coquille, le jaune redevient un signal

*Arbitrage demandé par `CAHIER-UI.md` §4, tranché à la phase 1 de la refonte d'interface.*

Le produit avait une direction assumée depuis le socle : le monde du sujet est la plaque
d'immatriculation, caractères noirs sur fond jaune, et l'accent `#f5c518` en découlait.
Le client a ensuite fourni son logo — un monogramme « SE » sur un bleu nuit profond, rempli
d'un dégradé or → orange → rouge, avec une goutte cyan → bleu. **Les deux se disputaient le
même registre** : un jaune d'accent partout, et un or de marque qui n'apparaissait nulle
part, puisque le logo était absent de l'interface.

**La décision.** La marque tient la coquille : le nuit `#14142b` habille le rail, la colonne
de navigation, l'en-tête de la galerie et l'écran de connexion. Le dégradé or → rouge reste
enfermé dans le monogramme, à une exception près — un filet de 2 px en tête de coquille.
Il n'apparaît jamais en fond de section : c'est précisément le tic que `DESIGN.md` §1
interdit.

Le `#f5c518` cesse d'être une couleur de marque et **redevient un signal, à deux emplois
seulement** : le repère de boutique (le code à trois lettres, en pavé plein aux proportions
d'une plaque) et l'état hors ligne (la bannière devient la plaque pleine). Un signal qui
n'apparaît qu'à deux endroits reste un signal ; un signal partout n'est plus qu'une couleur.

**Ce que l'arbitrage a ouvert, et qui n'était pas cherché.** Le logo porte *deux* dégradés,
et le produit a *deux* notions de choses en transit. On leur a donné un emploi chacun :

- la **goutte** (cyan → bleu, `#1f52a8`) dit *ce qui est parti et n'est pas revenu* — un
  papier chez le prestataire, une saisie en cours d'envoi ;
- la **braise** (fin du dégradé, `#c2372a`) dit *le retard et l'irréversible*.

Cela rend lisible une distinction que `BandeauEtat.tsx` faisait déjà sans la montrer :
**hors ligne** (aucun réseau, jaune plein) n'est pas **en attente d'envoi** (le réseau est
là, la file se vide, bleu). Le premier est un mode de travail normal ; le second est
transitoire. Les confondre coûtait une inquiétude injustifiée au comptoir.

**Ce qui ne change pas.** Le jaune et son encre ne basculent toujours pas avec le thème :
une plaque réelle ne change pas de couleur la nuit, et un `encre` inversé dessus produisait
du jaune clair sur jaune (acquis de S10, conservé). La braise `#c2372a` est le rouge du logo
assombri de justesse pour tenir 4,5:1 sur blanc **et** sur sa propre surface teintée ; le
logo, lui, garde son `#c93c2e` exact.

**Conséquence sur la signature.** La plaque était la signature visuelle du produit. Deux
signatures n'en font aucune : elle est rétrogradée en signal pur, et la signature devient
**la souche** — le numéro de pièce (`PTG-2609-0042`) dessiné comme un pavé arraché du
carnet, bord cranté. Il vient du métier — c'est le numéro que le gérant dicte au téléphone —
et non d'une bibliothèque de composants.

*À vérifier en phase 2 :* la transcription de ces jetons dans le bloc `@theme` de
`app/globals.css` doit être suivie d'une capture sous média `print`. Le reçu est le seul
rendu du produit qui devient un objet physique, et aucune capture d'écran ordinaire ne le
montre (leçon de S10).

---

## D71 — L'identité de l'entreprise est une constante, pas un réglage

*Demandé par le responsable pendant la revue des maquettes de la phase 1.*

Le produit prévoyait un écran « Entreprise » où le commanditaire saisirait sa raison
sociale, son adresse et ce qui s'imprime en tête des reçus. Il n'en veut pas : « je ne veux
pas que le réglage soit fait par le client, je veux qu'on le fasse dès à présent ».

**La décision.** Raison sociale, activité, siège, téléphone, IFU, RCCM et logo sont posés
en dur. En phase 2 ils vivent dans une constante de `lib/domain/entreprise.ts`, **pas dans
Firestore**. Trois raisons, dans cet ordre :

1. **Ça ne change pas.** Une raison sociale et un numéro RCCM sont fixés à la création de
   l'entreprise. Une donnée qui ne change jamais n'a rien à faire dans une collection
   modifiable — elle y gagne seulement la possibilité d'être cassée.
2. **Ça s'imprime sur un document commercial.** L'IFU et le RCCM sont obligatoires en tête
   d'une facture ou d'un reçu au Burkina Faso. Un champ que quelqu'un peut vider un
   vendredi soir produit le lundi des reçus non conformes, sans que rien n'alerte.
3. **Ça supprime un écran, une règle Firestore et un test.** `ARCHITECTURE.md` §1 : le
   meilleur code est celui qu'on n'écrit pas.

**Ce qui reste réglable, et c'est tout.** Le **nom affiché du gérant** — la seule donnée du
reçu qui vienne du compte connecté, et le seul réglage que l'application demande encore à
quelqu'un. Il répond au défaut signalé pendant S12 : l'application imprimait l'adresse
e-mail à la place du nom. On l'atteint par le bloc de compte en bas de la navigation, là où
l'on lit déjà qui est connecté sur un poste partagé — pas par une entrée de menu de plus.

**Ce qu'elle renverse.** D15 disait « paramètre, pas constante », et l'avait
tranché depuis `prompt.md` §10. Cette lecture n'était pas fausse : le cahier des
charges demandait bien un écran de saisie. C'est le commanditaire qui a changé
d'avis en voyant les maquettes, et son avis prime sur une lecture de son propre
cahier.

**Ce que ça change pour la phase 2 :** l'écran `/parametres/entreprise` cesse d'être un
formulaire et devient une carte en lecture seule. Les tests bout en bout qui remplissent ce
formulaire sont à retirer dans le même commit, et le titre de niveau 1 « Entreprise »
devient « Identité de l'entreprise » — un changement de libellé, donc un changement de
contrat de test (`CAHIER-UI.md` §12).

**Ce qui manque encore.** L'IFU et le numéro RCCM réels. Les maquettes portent
`00071842 R` et `BF-OUA-01-2016-A12-00847` : format correct, valeurs inventées. Elles sont
marquées « à confirmer » dans l'écran des réglages et dans la galerie. **Elles ne partent
pas en production telles quelles** — un numéro fiscal faux sur un reçu est un problème
juridique, pas un détail d'affichage.

---

## D72 — Pas de bibliothèque de composants : `<dialog>` suffit

*S28, commit de la coquille. `CAHIER-UI.md` §13 autorisait shadcn/ui sous trois
conditions et demandait que la décision soit consignée — elle l'est ici, y
compris parce qu'elle est négative.*

Le cahier de la refonte avait raison de poser la question : un logiciel de
bureau a besoin de menus, de dialogues et d'une palette de commandes
**réellement accessibles**, et les écrire à la main est le mauvais calcul
classique — pièges de focus, ARIA, navigation clavier, retour du focus au
déclencheur.

**Ce que le chantier a réellement demandé.** Un seul composant de ce genre : la
palette de commandes. Pas de menu déroulant, pas d'onglets, pas de tiroir — la
coquille est une grille CSS, et le sélecteur de périmètre est un `<select>`
natif depuis S3.

**Ce que `<dialog>` donne gratuitement**, avec `showModal()` : le piège de
focus, la fermeture par Échap, le fond inerte, le retour du focus au bouton qui
l'a ouvert, et le placement dans la couche supérieure sans `z-index` à
arbitrer. C'est-à-dire l'intégralité de ce pour quoi on aurait installé Radix.

**La décision.** Aucune bibliothèque de composants. `ARCHITECTURE.md` §1 :
le meilleur code est celui qu'on n'écrit pas — et une dépendance qu'on n'ajoute
pas est aussi une dépendance qu'on ne suit pas, qu'on ne met pas à jour, et dont
l'identité visuelle ne vient pas contaminer la nôtre.

**Ce qui ferait rouvrir la question**, et il faut le dire pour que la décision
ne se pétrifie pas : un menu contextuel à navigation clavier (les flèches dans
un `role="menu"`), une liste déroulante avec recherche, ou un tiroir redimensionnable.
Aucun n'est au programme de S29. Le jour où l'un le devient, on installe les
composants concernés — pas le catalogue — et on les réhabille avec les jetons du
projet.

**Une réserve honnête.** `<dialog>` demande `showModal()` en JavaScript : sans
lui, la palette ne s'ouvre pas. Ce n'est pas une régression d'accessibilité —
elle double la navigation, elle ne la remplace pas : tout ce qu'elle atteint est
dans la colonne de gauche, en HTML, sans script.

---

## D73 — Un patron est un composant s'il a une structure, une classe s'il n'a qu'une apparence

*S28, commit des patrons. La spec demandait « les patrons écrits une fois, en
composants réutilisables ». Écrits une fois, oui ; en composants, pas toujours.*

**Ce que le dépôt répétait.** Cent cadres blancs bordés, quarante-cinq boutons
de plaque, trente-deux champs de saisie, vingt-sept attentes, vingt-cinq
encadrés pointillés, et quatre copies mot pour mot du même refus de périmètre.
Ce n'est pas une abstraction spéculative qu'on va chercher : c'est de la
déduplication, échelle 2 d'`ARCHITECTURE.md` §1.

**La ligne de partage.** Un composant quand il y a une structure ou un
comportement à tenir — les états, la tête d'écran, le hub, le champ. Une classe
CSS quand il n'y a qu'une apparence et que l'élément qui la porte change d'un
appel à l'autre : `.cadre` habille tour à tour un `ul`, un `dl`, un `div`, une
`section`. Un composant l'aurait obligé à recevoir un `as` générique pour ne
rendre au bout du compte qu'une chaîne de classes — de la cérémonie autour du
vide.

**Ce que la ligne a rapporté, en plus du volume.** Trois défauts sont sortis du
bois au moment où la forme unique s'est écrite :

1. La bordure des champs prenait `--color-bord`, à 1,3:1 sur le papier. Le
   jeton `--color-bord-fort` existait, portait le calcul de contraste dans son
   commentaire, et n'était employé nulle part. `.saisie` le prend.
2. Le hub des réglages gardait sa propre copie des six écrans d'administration
   et les cloisonnait tous derrière `gerer_utilisateurs`, là où la colonne de
   gauche cloisonne chacun par sa propre capacité. Deux listes finissent
   toujours par répondre deux choses ; il n'y en a plus qu'une, dans
   `ECRANS_DE`.
3. Sans le `max-w-3xl` retiré au commit de la coquille, un champ « Nom »
   s'étirait sur 950 px. Vu sur une capture, pas déduit.

**Ce qu'on n'a pas écrit, et pourquoi.** Le tableau et le panneau latéral. Les
maquettes en fixent le dessin, mais aucun écran n'en a aujourd'hui — les écrire
ici aurait été deviner leur interface sans un seul appelant pour la démentir.
S29 les crée dans `components/patrons/` au premier écran qui les demande (A4 et
A6), et sa spec le dit noir sur blanc pour que le huitième écran ne redessine
pas le sien.

---

## D74 — Le seuil d'un panneau se mesure sur la zone de travail, pas sur la fenêtre

*S29, A6. Les maquettes font basculer la liste et sa fiche en deux colonnes dès
1152 px de fenêtre. À 1280 px, le rendu réel a démenti le nombre.*

**Ce que la fenêtre ne dit pas.** La coquille prend 296 px — rail et colonne des
écrans. À 1280 px de fenêtre il en reste 984 pour un panneau de 420 et un
tableau de six colonnes : « Paiement » sortait à moitié du cadre, vu sur capture
puis mesuré. La même fenêtre, colonne repliée, laisse 1264 px et le couple
respire. Une largeur de fenêtre ne dit rien de la place dont un composant
dispose ; seule sa boîte le sait.

**La bascule est donc une requête de conteneur**, à 68 rem de zone de travail.
Elle a un effet que le seuil de fenêtre n'aurait jamais eu : replier la colonne
des écrans (Ctrl B) fait apparaître la fiche à côté de sa liste. Le repli
récompense enfin le geste, au lieu de rendre du vide.

**En dessous, le panneau remplace la liste au lieu de s'empiler dessous.** Les
maquettes les empilent, ce qui tient avec leurs sept lignes ; avec deux cents
ventes, ouvrir une fiche demanderait de faire défiler toute la liste pour
l'atteindre. La liste est masquée, pas démontée : la recherche et les filtres
sont un état, et on les retrouve en fermant.

**Portée.** A6 (ventes), et tout écran qui posera une liste à côté d'un détail.
A7 applique le même raisonnement à son relais, qui remplace la file sous 1024 px
pour la même raison.

---

## D75 — La synchronisation revient dans le hub des réglages, sous son propre titre

*S29, A9. Renverse une décision de S28, que `lib/domain/espaces.test.ts`
gardait.*

**Ce que S28 avait décidé, et pourquoi.** « Synchronisation » n'est pas une
administration : elle n'exige aucun droit, elle décrit l'état d'un appareil. Le
hub des réglages ne montre que les écrans qui savent dire ce qu'on y fait ;
l'entrée n'ayant pas de phrase, elle en était écartée — volontairement, et un
test le tenait.

**Ce que la maquette A9 fait de la même tension.** Elle ne l'écarte pas : elle
lui donne une section à elle, « Cet appareil », et la phrase qui manquait — ce
qui attend ici n'attend pas ailleurs. La distinction est dite au lieu d'être
obtenue par une absence.

**Pourquoi c'est mieux.** Un écran présent dans la colonne de gauche et absent
du hub est un écran qu'on croit disparu. Le hub existe précisément pour
*expliquer* ses destinations ; celle-ci avait le plus besoin d'être expliquée.

**Ce que le test garde encore.** Il n'assertait plus l'absence de la phrase mais
ce qui reste vrai et structurant : cette entrée n'exige aucune capacité, donc
elle ne se range pas avec ce qui en exige une.

---

## D76 — Un geste au comptoir n'attend jamais l'accusé de réception du serveur

*S30. Le dépôt d'un document chez un prestataire ne se terminait jamais : le
formulaire restait ouvert par-dessus une ligne qui disait déjà « Chez le
prestataire », et l'étape suivante n'était plus offerte.*

**Ce qui était écrit.** `await avancerDocument(...)` puis `setDepotOuvert(false)`.
Lu vite, c'est la séquence évidente : on enregistre, puis on referme.

**Pourquoi c'est faux ici.** Une promesse d'écriture Firestore ne se résout
qu'à l'accusé de réception du serveur — `lib/reseau/file-ecritures.ts` le dit
en toutes lettres, et c'est même la raison d'être du compteur de la file. Le
cache local, lui, a déjà appliqué l'écriture. Attendre la promesse, c'est donc
tenir l'écran dans un état « en cours » alors que le travail est fait. Hors
ligne, l'attente ne se termine jamais et le dossier devient inutilisable —
exactement là où le hors-ligne devait sauver la mise.

**La règle.** Valider tout de suite, envoyer, avancer l'écran sur l'écriture
locale, rattacher un `catch` pour le refus tardif. Ce qui n'est pas encore
parti est annoncé par le bandeau, qui compte les écritures en attente — donc
toute écriture passe par `suivreEcriture`, sans exception. `FormulaireClient`
faisait déjà exactement cela ; le dossier était le seul écran à s'en écarter.

**Ce que ça coûte, et pourquoi c'est le bon prix.** Un refus du serveur arrive
après coup, hors du geste qui l'a causé. C'est le prix du hors-ligne, et il est
déjà payé partout ailleurs dans le produit. L'inverse — bloquer le comptoir
pour garder l'erreur près de son geste — revient à faire dépendre du réseau
une application faite pour s'en passer.

**Effet de bord mesuré.** La suite de bout en bout du dossier est passée de
8,5 minutes à 1,5 minute. Les tests étaient lents pour la raison même qui les
faisait échouer : chaque geste attendait un accusé de réception coincé dans
une file encombrée.

---

## D77 — La feuille d'impression ne se laisse défaire par aucun thème

*S31, le reçu. Vu sur `captures/s31/recu-papier-dark.png` : depuis une machine
réglée en sombre, le reçu sortait blanc sur nuit.*

**Le mécanisme.** Deux `@media` peuvent être vraies en même temps — on imprime
*et* la machine préfère le sombre. L'ordre de la source ne tranche alors qu'à
spécificité égale, et chaque branche d'une liste de sélecteurs compte la sienne
pour elle-même. Le bloc d'impression écrivait `:root`, à (0,1,0) ; le thème
sombre système écrit `:root:not([data-theme="clair"])`, à (0,2,0). Le sombre
gagnait, en silence, et personne ne l'aurait su avant la première cartouche
vidée.

**Le correctif n'est pas d'ajouter un sélecteur, c'est de tenir une règle.**
Toute règle qui pose la palette sombre doit avoir sa jumelle exacte dans le
bloc d'impression, même sélecteur, plus bas dans le fichier. Aujourd'hui elles
sont quatre : `:root`, `:root:not([data-theme="clair"])` (le réglage système),
`:root[data-theme="sombre"]` et `:root[data-theme="clair"]` (la bascule
explicite, dans les deux sens). Ajouter demain une cinquième façon de peindre
en sombre oblige à ajouter la cinquième branche ici.

**Pourquoi cette règle et pas une autre.** Le reçu est le seul rendu du produit
qui devient un objet physique : c'est la leçon de S10, et elle a maintenant un
mécanisme précis à surveiller plutôt qu'un principe. Un correctif de S31 avait
déjà couvert la bascule explicite en croyant avoir couvert le cas ; il avait
manqué le réglage système, qui est le cas courant — personne ne bascule un
thème, on hérite de celui du téléphone.

**Ce qui l'a trouvé, et ce qui ne l'aurait pas trouvé.** Une capture sous
`colorScheme: "dark"` puis `emulateMedia({ media: "print" })`. Ni le typage, ni
le lint, ni les 589 tests n'ont d'accès à une cascade CSS. `maquettes/socle.css`
porte le même trou à sa ligne 1624 : la maquette n'a jamais été imprimée depuis
un poste sombre.

---

## D78 — Deux lecteurs, deux textes : la déduplication s'arrête au destinataire

*S31, le reçu. `EFFET_MODE` existait, disait la bonne chose, et n'avait rien à
faire sur le papier du client.*

**La tentation.** « La moto reste au magasin jusqu'au dernier versement.
L'argent reçu est un engagement. » est déjà écrite, déjà testée, et parle bien
du mode « tranches ». La réutiliser sur le reçu coûte un import.

**Pourquoi c'est faux.** Cette phrase s'adresse au gérant à la seconde où il
valide : elle lui dit ce qu'il prend sur lui. Sur le papier que le client
emporte, sa seconde moitié ne dit plus rien d'utile — ce que le client relira
trois semaines plus tard, c'est *quand* il repartira avec sa moto. Ce n'est pas
le même énoncé traduit, c'est une autre information. Les fondre en une aurait
mal servi les deux, et la première correction demandée par l'un aurait dégradé
le texte de l'autre.

**La ligne de partage, en complément de D73.** D73 déduplique ce qui répond à
la même question ; il faut ajouter : *pour le même lecteur*. `LIBELLE_MODE`
(« Tranches ») est un nom, il est partagé. `EFFET_MODE` et `MENTION_RECU` sont
deux réponses, à deux personnes, à deux moments. Deux constantes voisines dans
le même fichier, avec le commentaire qui dit pourquoi elles ne fusionneront
pas — c'est ce commentaire qui empêchera la fusion, pas la distance.

**Le test qui existe déjà.** Les deux sont des `Record<ModePaiement, string>` :
un quatrième mode de paiement fait échouer la compilation aux deux endroits, et
oblige à écrire les deux textes. C'est la garde qu'on veut ici — pas qu'ils
restent identiques, mais qu'aucun ne soit oublié.

**Révisée par D81** pour ce qui est de `MENTION_RECU`, qui ne s'imprime plus.
La ligne de partage, elle, tient toujours : elle a seulement cessé d'avoir un
second lecteur à servir sur ce document-là.

---

## D79 — Un refus de règle doit être une décision, et nommer sa cause

*S31, dettes techniques. Deux défauts distincts se lisaient dans une seule
chaîne d'erreur, et c'est elle qui a servi de mesure avant et après.*

**Ce que le client recevait.** Un compte sans claim demandant `boutiques/PTG` :

    Property role is undefined on object. for 'get' @ L87,
    false for 'get' @ L159, false for 'get' @ L855

Trois choses ne vont pas. Le refus est un plantage, donc rendu pour la mauvaise
raison. Le nom de la clé manquante sort des règles et arrive dans le navigateur.
Et trois règles sont citées pour une décision, dont un joker sans rapport.

**Ce que la sonde a corrigé dans le diagnostic.** Le cahier disait « lire une
clé absente fait planter la règle *au lieu* de la faire refuser ». Une sonde
jetable — deux règles de trois lignes, dans un projet d'émulateur à part — a
montré que c'est vrai à moitié : le moteur plante bien, mais le plantage d'une
branche n'abat pas l'expression entière, un `||` le rattrape et la branche
suivante décide. Le défaut ne mordait donc que là où **les deux** branches
lisent le jeton. C'est pourquoi il était resté invisible : presque partout, un
OU le couvrait. Un remède appliqué sans cette sonde aurait été correct par
accident, et son commentaire aurait menti pour longtemps.

**Deux règles, tirées de là.**

1. *Toute lecture du jeton passe par `get(clé, défaut)`.* Le refus redevient une
   décision, et rien du jeton ne fuit vers le client.
2. *Pas de `match` à segment variable à la racine.* Il paraît économique — un
   bloc pour trois collections de même forme — mais il s'interpose sur **toutes**
   les collections du produit et se cite dans chacun de leurs refus. Trois
   chemins écrits en toutes lettres coûtent quatorze lignes et rendent chaque
   refus lisible. C'est ce joker qui a fait accuser les règles à tort en S30.

**Après :**

    false for 'get' @ L106, false for 'get' @ L909

La règle des boutiques, et le refus par défaut.

**Ce qui fige la correction.** Un test qui lit le message rendu au client et
refuse d'y trouver `is undefined`. Le premier test écrit ne valait rien — il
passait aussi sur l'ancienne règle, parce qu'il tombait sur un chemin couvert
par un OU. Un test de régression se vérifie dans les deux sens : sur le code
corrigé *et* sur le code fautif. Sans le second essai, on fige une croyance.

---

## D80 — La largeur d'un champ appartient à la mise en page, pas au champ

*S31, dettes techniques. `.saisie` portait `max-width: 32rem`.*

**Pourquoi c'était là.** Cinq écrans sans colonne tenue laissaient un champ
« Nom » s'étirer sur 950 px. La borne posée sur `.saisie` les couvrait tous
d'un coup.

**Pourquoi c'était faux.** Elle couvrait aussi les vingt autres, y compris ceux
dont la mise en page tenait déjà sa largeur — et une borne sur le contrôle
répond à une question que seul l'écran peut trancher : *de quelle place
dispose-t-on ici*. Un champ ne le sait pas. Le symptôme se voyait à l'envers :
un formulaire dans une colonne de 40 rem gardait ses champs à 32.

**La règle.** La largeur se pose là où on la voit — `.colonne-formulaire` sur le
bloc, `sm:max-w-80` sur une recherche. Un champ qui s'étire est un écran à qui
l'on a oublié sa colonne : cela se corrige sur cet écran-là, et cela se voit sur
une capture.

**Ce que la levée a révélé, et comment.** Un script parcourt quinze écrans à
1600 px, compte les `.saisie` et signale ceux qui dépassent 640 px. Trois
champs de recherche que plus rien ne bornait : les reçus à 1264 px, les ventes
à 707, les dossiers à 690. Aucun n'aurait été vu à l'œil, parce qu'il aurait
fallu ouvrir ces trois pages-là en pensant à les regarder. **Une borne globale
qu'on lève se paie par une mesure, pas par une relecture** — sinon on déplace
la dette au lieu de la payer.

---

## D81 — Le reçu ne porte que ce que le client y relira

*C5, l'allègement du reçu. Le commanditaire a désigné deux phrases et dit :
enlevez-les. La question n'était pas s'il fallait obéir, mais ce que le produit
perd et qui le rattrape.*

Deux mentions quittent le reçu, sur demande du commanditaire :

1. **L'encadré de renumérotation** — « Ce reçu remplace le n° …, renuméroté à
   la synchronisation. Seul le numéro ci-dessus fait foi. » (posé par D44)
2. **La conséquence du mode** — « La moto reste au magasin jusqu'au dernier
   versement… » (posée par D78, via `MENTION_RECU`)

**Ce que ça coûte, mesuré et non supposé.** Les deux étaient les *secondes*
occurrences de leur information, pas les seules :

- La renumérotation est annoncée sur la fiche de vente, en avis d'alerte, avec
  l'instruction qui manquait au papier : « Si le client détient un reçu portant
  l'ancien, remettez-lui le nouveau » (`FicheVente.tsx`). C'est le gérant qui
  agit, et c'est lui qui est prévenu.
- La conséquence du mode est dite deux fois au gérant : à la validation de la
  vente (`EFFET_MODE`, écran de saisie) et sur la fiche (« Non remise : la moto
  reste au magasin, il reste … à verser »). Deux tests bout en bout la
  vérifient — sur la fiche, pas sur le reçu : les retirer du reçu n'en casse
  aucun, ce qui est le signe que ce n'était pas là qu'ils la lisaient.

**Ce qui reste vrai, et qu'il faut dire.** Le client, lui, n'a plus la phrase
sur son papier. Elle passe du document à la parole : c'est le gérant qui la dit
en remettant le reçu. C'est un recul pour un client qui rouvre son papier trois
semaines plus tard — recul assumé par le commanditaire, qui connaît ses clients
et son comptoir mieux que ce fichier.

**Pourquoi c'est réversible en une ligne.** `MENTION_RECU` est supprimée mais
son texte est en commentaire à sa place, dans `vente.ts` ; `contenu.numeroRemis`
reste calculé par le domaine et reste testé (`recu.test.ts`). Rien n'a été
démonté sous la surface : seul l'affichage a été retiré. Le jour où le reçu
doit reprendre l'une des deux, c'est un bloc à recoller, pas une donnée à
reconstruire.

**La règle qu'on en tire.** Sur un document que quelqu'un emporte, chaque bloc
doit gagner sa place contre le silence, pas contre l'absence d'objection. Un
reçu à onze blocs n'est pas onze fois plus informatif qu'un reçu à huit : il est
plus difficile à parcourir, et c'est le montant reçu qu'on cherche dessus.

---

## D82 — Un échec de lecture n'est pas une réponse

*S24, la marge du mois. Le test bout en bout a regardé la carte pendant
soixante secondes après une vente ; elle est restée à « — ».*

**Le montage de départ, et son raisonnement.** Une marge est écrite une fois par
un déclencheur, puis fermée en écriture à tout navigateur : elle ne changera
jamais. Donc une lecture ponctuelle suffit, et les identifiants déjà demandés
sont retenus pour ne jamais les redemander — sans quoi une vente sans marge
serait relue à chaque rendu, sans fin. Chaque phrase est juste. La conclusion ne
l'était pas.

**Ce que la mesure a dit.** La marge existait bien dans la base — vérifié au SDK
Admin, `marge: 500000` — et le navigateur ne la voyait pas. La trace nomme la
cause&nbsp;:

```
FirebaseError: [code=unavailable]:
  Failed to get document because the client is offline.
```

`getDoc` ne refuse pas : il **échoue**. Le document n'était pas en cache, et la
connexion était encombrée — l'état exact d'un appareil qui vient d'enregistrer
une vente et vide encore sa file d'écritures. C'est-à-dire l'ordinaire du
comptoir, pas un cas de bord.

**L'erreur de conception.** Le code rangeait cet échec avec « pas de marge » et
marquait la vente comme demandée. Plus rien ne la redemandait : la carte disait
« — » jusqu'au rechargement suivant. **Trois états avaient été confondus en
deux** — *connu*, *inconnu pour de bon* (un refus de règle), et *pas encore
su* (une lecture tombée, un déclencheur en retard). Le troisième n'est pas une
réponse, et le traiter comme telle transforme une lenteur en perte.

**La règle.** Une lecture ponctuelle qui échoue passe la main à une écoute, et
l'écoute décide : elle délivre quand le réseau revient, elle se ferme sur un
vrai refus. L'écoute reste bornée à ce qui n'a pas répondu — zéro abonnement
dans le cas courant. On ne réessaie pas en boucle, on ne renonce pas non plus :
on attend, et l'attente a une fin.

**Le corollaire pour les tests.** Le premier symptôme ressemblait à un test mal
réglé, et l'était en partie : ouvrir l'écran avant que la file d'écritures soit
vide faisait mesurer la reprise de connexion du SDK (D50) au lieu des chiffres.
Les deux corrections étaient nécessaires, et l'ordre importe — **c'est en
expliquant l'échec au lieu de rallonger le délai qu'on a trouvé le défaut de
produit**. Un test qu'on rend patient sans l'avoir compris efface exactement ce
qu'il venait de trouver.
