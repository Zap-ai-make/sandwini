# DEPLOIEMENT.md — Mettre une préversion en ligne

> **But :** que le responsable puisse ouvrir l'application depuis son téléphone, à tout
> moment, et voir où en est le travail — au lieu d'avancer à l'aveugle.

Cette préversion est l'environnement **`staging`** exigé par `ARCHITECTURE.md` §11 : des
secrets, une base et des comptes distincts de la production. On ne la remplit jamais de
données réelles de clients.

---

## 1. Ce que je ne peux pas faire à votre place

Trois choses demandent **votre** compte, et personne d'autre ne peut les créer :

| | À créer | Où |
|---|---|---|
| 1 | Un projet Firebase, nommé par exemple `sdi-preview` | console.firebase.google.com |
| 2 | Un compte Vercel relié à ce dépôt | vercel.com |
| 3 | Le premier compte responsable, dans ce projet Firebase | Console Firebase → Authentication |

Dans le projet Firebase, activez **Authentication** (méthode « E-mail/mot de passe »),
**Firestore**, **Storage**, et passez le projet au plan **Blaze** — les Cloud Functions
l'exigent. Le trafic d'une préversion reste dans les quotas gratuits.

---

## 2. Ce que vous me transmettez, et comment

**Les valeurs de configuration du client** — celles qui commencent par
`NEXT_PUBLIC_FIREBASE_`. Console Firebase → Paramètres du projet → « Vos applications » →
application Web. **Ce ne sont pas des secrets** : elles partent dans le navigateur de
chaque visiteur, et ce sont les règles Firestore qui protègent les données. Vous pouvez me
les donner directement.

**La clé de compte de service — jamais.** Elle donne un accès total à la base, en dehors
de toute règle. Ne me l'envoyez pas, ne la collez nulle part dans une conversation, ne la
mettez pas dans le dépôt (`SECURITY.md` §2). Vous la déposez vous-même dans les variables
d'environnement Vercel, et vous me dites seulement que c'est fait. Si elle a déjà circulé
quelque part, révoquez-la et régénérez-en une.

---

## 3. Ce que je fais ensuite

1. `firebase use --add` pour ajouter le projet de préversion à `.firebaserc`, à côté de
   `sdi-dev`.
2. Déploiement des **règles Firestore** et des **index** sur ce projet. C'est le premier
   geste, avant toute donnée : une base sans règles est une base ouverte.
3. Déploiement des **Cloud Functions**.
4. Configuration du projet Vercel : les variables `NEXT_PUBLIC_FIREBASE_*`, avec
   `NEXT_PUBLIC_FIREBASE_EMULATEURS` **absent ou à 0** — c'est ce qui débranche les
   émulateurs.
5. Déploiement, puis vérification de la checklist `SECURITY.md` §13 sur l'URL réelle.
6. Je vous rends l'adresse et les identifiants du compte responsable.

---

## 4. Ce que la préversion n'est pas

- **Ce n'est pas la production.** Les données y sont jetables ; je peux la vider sans
  prévenir pour rejouer un scénario.
- **Ce n'est pas un environnement de test automatisé.** Les tests continuent de tourner
  sur les émulateurs (`DECISIONS.md` D3) : ils ont besoin d'une base vide à chaque
  exécution, ce qu'on ne fait pas sur un environnement que quelqu'un regarde.
- **Elle ne reçoit pas de vraies données clients.** Noms, téléphones et montants réels
  appartiennent à la production, avec ses propres accès.

---

## 5. En attendant vos accès

L'application tourne en local sur cette machine, avec les émulateurs — voir le `README`.
Ce que vous y voyez est exactement ce qui sera déployé : c'est le même build.

---

## 6. Journal de la mise en ligne de `sandwini`

Trois obstacles se sont présentés. Aucun n'est propre à ce projet ; ils se
représenteront à la mise en production, d'où ces notes.

### La découverte des fonctions expire au bout de 10 s

```
Error: User code failed to load. Cannot determine backend specification. Timeout after 10000.
```

Avant de déployer, la CLI lance le code compilé et l'interroge pour savoir quelles
fonctions il déclare. Elle accorde dix secondes. Sur cette machine, le seul chargement du
module en prend près de quatre à froid — le reste n'a pas la marge.

Ce n'est pas une erreur de code : `functions/src/index.ts` charge déjà le SDK Admin
paresseusement, précisément pour ce genre de délai. Le remède est le délai lui-même :

```
FUNCTIONS_DISCOVERY_TIMEOUT=120 npx firebase deploy --only functions --project sandwini
```

### Le premier déploiement de 2ᵉ génération échoue à moitié

Les trois fonctions **appelables** sont passées ; les trois **déclencheurs Firestore** ont
été refusés :

> Permission denied while using the Eventarc Service Agent […] it may take a few minutes
> before all necessary permissions are propagated.

Le déploiement venait d'activer `eventarc.googleapis.com` et d'en créer l'agent de service ;
les droits n'étaient pas encore propagés quand les déclencheurs les ont demandés. **Relancer
la même commande quelques minutes plus tard suffit** — la seconde passe saute les fonctions
inchangées et ne crée que les trois manquantes. Rien à corriger dans le code.

### Les images de conteneur s'accumulent et se facturent

Chaque déploiement laisse une image dans Artifact Registry. Sans politique de nettoyage,
elles s'entassent et finissent par coûter. Une fois par projet et par région :

```
npx firebase functions:artifacts:setpolicy --project sandwini --location europe-west1 --days 3
```

### La construction Vercel contrôle du code que Vercel n'installe pas

```
functions/src/index.ts(1,24): error TS2307: Cannot find module 'firebase-functions'
Failed to type check.
Error: Command "npm run build" exited with 1
```

Le `tsconfig.json` de la racine déclarait `include: ["**/*.ts"]` — donc
`functions/src/index.ts` faisait partie du programme contrôlé par `next build`. En local
il se résout, parce que `functions/node_modules` existe. Vercel, lui, n'installe que les
dépendances de la racine : `firebase-functions` et `firebase-admin` n'y sont nulle part.
Les `implicitly has an 'any' type` qui suivent ne sont que la conséquence des modules
introuvables, pas des défauts distincts.

**Le remède** est une exclusion, et une seule — celle du fichier concerné, pas du dossier :

```json
"exclude": ["node_modules", "functions/src/index.ts"]
```

Exclure `functions/` en bloc aurait été trop large. `functions/src/numerotation.test.ts`
importe `lib/domain/numerotation.ts` : il compare délibérément la logique du client à
celle du serveur (D5), il appartient donc au programme de la racine. L'écarter aurait
privé de contrôle de types un fichier que plus rien n'aurait vérifié — `strict` cesse de
s'appliquer sans que personne ne le voie.

`index.ts` reste vérifié par `npm run build:functions`, avec le tsconfig et les paquets du
sous-projet. **Règle à retenir :** tout nouveau fichier de `functions/src` qui importe
`firebase-functions` ou `firebase-admin` s'ajoute à cette exclusion.

Pour reproduire la condition de Vercel sans attendre un déploiement :

```
mv functions/node_modules functions/.absent && npx tsc --noEmit; mv functions/.absent functions/node_modules
```

### Les variables `NEXT_PUBLIC_` ne se déclarent jamais en « Secret »

Symptôme trompeur : **la construction réussit**, le site s'affiche, et l'écran de connexion
annonce lui-même « Firebase n'est pas configuré sur cet appareil » — alors que les six
variables sont bel et bien enregistrées dans Vercel.

Vercel propose deux types au moment de la saisie :

| | Lisible après enregistrement | Disponible à la construction |
|---|---|---|
| **Secret** | non | non |
| **Config** | oui | oui |

Or `NEXT_PUBLIC_*` n'a de sens qu'à la construction : Next inscrit ces valeurs **en dur**
dans le JavaScript envoyé au navigateur. Déclarées « Secret », elles ne sont pas fournies à
cette étape ; le paquet est construit avec `projectId` vide, et
`configurationPresente = Boolean(config.projectId)` ([lib/firebase/client.ts:81](lib/firebase/client.ts#L81))
bascule l'application sur son écran « pas configuré ».

C'est aussi une erreur de fond : ces valeurs partent dans le navigateur de **chaque
visiteur**. Les traiter en secrets ne protège rien et rend impossible toute vérification —
une valeur tronquée à la copie ne peut plus être ni relue ni comparée, seulement écrasée.
Le type **Config** est le bon.

**Deux vérifications sans attendre un déploiement**, une fois le site en ligne :

```
# 1. La configuration est-elle dans le paquet servi ?
curl -s <url>/login | grep -oE 'src="[^"]*\.js"'   # puis chercher le projectId dans ces chunks

# 2. Les émulateurs ont-ils fui en production ?
curl -sI <url>/login | grep -i content-security-policy
```

Sur la seconde : `next.config.ts` n'ajoute `http://127.0.0.1:*` au `connect-src` que si
`NEXT_PUBLIC_FIREBASE_EMULATEURS` vaut `1` à la construction. **L'en-tête CSP du site est
donc un témoin fiable de la valeur qu'avait ce drapeau** — un hôte local dans `connect-src`
en production signifie que le drapeau a fui, et que l'application cherche Firebase dans le
téléphone du visiteur.

### Ce que valent les en-têtes en ligne

Vérifié sur le site réel, hors émulateurs, le 2 septembre 2026 : `Content-Security-Policy`
(sans `unsafe-eval`, sans hôte local), `Strict-Transport-Security` à deux ans avec
`includeSubDomains; preload`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` fermant caméra, micro et géolocalisation. Le reste de la checklist
`SECURITY.md` §13 demande une session ouverte, donc des variables correctes.

### Ce qui est en ligne

Règles Firestore et index · six fonctions en `europe-west1` (`creerGerant`,
`changerActivationUtilisateur`, `attribuerBoutique`, `reconcilierNumeroVente`,
`figerMargeVente`, `recalculerPaiementsVente`) · politique de nettoyage à 3 jours.

Base Firestore en `nam5` — voir `DECISIONS.md` D67 : à ne pas reproduire en production,
où l'emplacement se choisit explicitement, une seule fois, avant tout.
