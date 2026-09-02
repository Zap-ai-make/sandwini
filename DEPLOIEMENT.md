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
