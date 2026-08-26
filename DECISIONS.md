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
