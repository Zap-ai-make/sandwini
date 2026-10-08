# S52 — Modifier, couper et supprimer un compte de gérant

```
Statut     : terminée
Périmètre  : post-MVP
Dépend de  : S2 (auth, rôles, utilisateurs), S3 (boutiques et périmètre)
```

---

## Objectif

Le responsable administre les comptes de ses gérants sans appeler personne :
il corrige un nom mal orthographié, change une adresse de connexion, repose un
mot de passe oublié au comptoir, coupe l'accès de quelqu'un qui est parti — et
supprime pour de bon un compte ouvert par erreur.

Aujourd'hui `lib/repositories/utilisateurs.ts` n'expose qu'une lecture, une
création et une activation. Un gérant qui quitte l'entreprise garde son compte
et ses sessions ouvertes tant que personne ne le désactive à la main, et une
adresse e-mail saisie de travers à la création ne se corrige nulle part.

---

## Les arbitrages du commanditaire

Tranchés le 8 octobre 2026, en réponse à trois questions posées avant
conception. Ils sont **tranchés**, pas pris par défaut : ils se respectent.

| # | Question | Réponse |
|---|---|---|
| 1 | Que couvre « modifier » ? | **Les quatre** : nom affiché, adresse e-mail, mot de passe, boutique de rattachement. |
| 2 | « Déconnecter » est-il un geste à part ? | **Non.** Il n'y a pas de bouton « Déconnecter ». Désactiver coupe l'accès *et* révoque les jetons, en un seul geste. |
| 3 | Qui a le droit ? | **Le responsable seul.** Un gérant ne touche à aucun compte, pas même au sien. |
| 4 | Supprimer un compte qui a signé ? | **Effacer seulement si rien n'a été signé.** Sinon le produit refuse et oriente vers la désactivation. |

---

## Critères d'acceptation

**Modifier**

- [x] Le responsable change le **nom affiché** d'un gérant ; `users/{uid}` et le profil d'authentification portent le nouveau nom.
- [x] L'écran **dit** que les ventes déjà signées gardent l'ancien nom. Un journal ne se réécrit pas.
- [x] Le responsable change l'**adresse e-mail** ; le gérant se connecte avec la nouvelle dès la fois suivante, et ses sessions ouvertes sont fermées.
- [x] Une adresse mal formée, ou déjà prise par un autre compte, est refusée avec une phrase utile.
- [x] Le responsable **repose un mot de passe** (10 caractères minimum, comme à la création) ; les sessions ouvertes sont fermées.
- [x] Le **rattachement à une boutique** se fait depuis le même écran — `attribuerBoutique` existe déjà et n'est pas réécrite.

**Couper**

- [x] Désactiver un compte ferme ses sessions en cours, et pas seulement sa prochaine connexion.
- [x] L'écran ne propose **aucun** bouton « Déconnecter » distinct (arbitrage 2).

**Supprimer**

- [x] Un compte qui n'a **rien signé** s'efface réellement : compte d'authentification *et* `users/{uid}`.
- [x] Un compte qui **a signé** refuse d'être effacé, et la phrase dit quoi faire à la place : le désactiver.
- [x] La suppression demande une confirmation explicite, qui nomme le compte visé.

**Les gardes — chacune avec son témoin, sinon elle n'existe pas**

- [x] Un **gérant** qui appelle l'une de ces fonctions est refusé (`permission-denied`).
- [x] Un appel **non authentifié** est refusé.
- [x] Le responsable ne peut ni se supprimer, ni se désactiver lui-même.
- [x] Un compte **responsable** n'est jamais la cible : ni modifié, ni désactivé, ni supprimé par ce chemin.
- [x] Un `uid` inexistant rend `not-found`, pas une erreur interne.

**Le reste**

- [x] Les états sont couverts : liste vide, chargement, erreur, et **« cette action demande du réseau »** (D66) — ces gestes passent par le serveur et ne fonctionnent pas hors ligne, comme `creerGerant`.
- [x] `npm run lint`, `npx tsc --noEmit`, `npm run test:unite`, la nouvelle suite `fonctions/`, et le rendu **regardé** en clair et en sombre.

---

## Hors périmètre

- **Qu'un gérant modifie son propre compte** — arbitrage 3. Ouvrir cette porte demanderait une seconde surface à protéger et à prouver ; elle n'est pas demandée.
- **La réinitialisation de mot de passe par e-mail.** Le mot de passe se repose au comptoir, de vive voix : c'est le geste réel du commerce, et il ne dépend d'aucune boîte mail que le gérant n'a peut-être pas.
- **Un journal des actions d'administration.** Les champs `updatedBy` / `updatedByName` de `users/{uid}` disent qui a touché au compte en dernier ; un historique complet est un autre lot.
- **La création de responsables.** `amorcer` fait le premier, et rien ici n'en fabrique un second.
- **La suppression des données signées** par un compte effacé. Un compte effaçable est, par construction, un compte qui n'a rien signé.

---

## Notes techniques

### Deux fonctions neuves, dans le grain existant

`creerGerant`, `changerActivationUtilisateur` et `attribuerBoutique` portent
chacune un verbe. On ajoute :

- **`modifierGerant({ uid, nom?, email?, motDePasse? })`** — les trois
  modifications d'identité partagent exactement les mêmes gardes et la même
  cible ; les séparer en trois fonctions tripliquerait ces gardes sans rien
  clarifier. Les champs absents ne sont pas touchés.
- **`supprimerGerant({ uid })`** — à part, parce qu'elle est **irréversible**.
  Elle mérite son nom, sa garde propre et ses témoins ; la noyer dans un
  correctif partiel la rendrait atteignable par distraction.

Elles reprennent telles quelles `exigerResponsable`, `texteObligatoire` et le
miroir audité dans `users/{uid}`.

### Ce qui révoque les jetons, et ce qui ne le révoque pas

Révoquent : l'**e-mail** (c'est l'identifiant de connexion) et le **mot de
passe**. Sans révocation, les sessions déjà ouvertes continuent jusqu'à
l'expiration du jeton, soit jusqu'à une heure — c'est exactement le
raisonnement déjà écrit dans `attribuerBoutique`.

Ne révoque pas : le **nom affiché**. Il ne change aucun droit, et déconnecter
quelqu'un pour une faute de frappe dans son nom serait une punition sans motif.

### « A-t-il signé quelque chose ? »

La question qui décide entre effacer et refuser. Elle se pose à **cinq**
collections, celles qui engagent l'argent ou le stock :

`ventesMotos` · `ventesPieces` · `encaissements` · `cloturesCaisse` ·
`mouvementsPieces`

Cinq lectures `where createdBy == uid limit 1`, sur un seul champ : aucun index
composite à déclarer.

**Pas les référentiels, et c'est un choix.** Avoir créé une entrée « Yamaha »
n'est pas une signature : l'inclure rendrait quasiment tout compte
indéboulonnable, et transformerait l'arbitrage 4 en interdiction pure. On
mesure ce qui engage, pas ce qui a été tapé.

### Ce qui ne bouge pas

`firestore.rules` **n'est pas modifié**. `users/{uid}` est déjà interdit en
écriture à tout client — seules les Cloud Functions y écrivent, parce qu'un rôle
modifiable depuis un navigateur n'est pas un rôle. La suppression du document
passe par le SDK Admin, hors de portée de ces règles.

### Les preuves, et c'est le gros du lot

**Aucune fonction appelable n'a de test aujourd'hui.** `creerGerant` et
`changerActivationUtilisateur` ne sont utilisées que comme décor dans
`e2e/preparation.ts` et dans les tests de déclencheurs : leur câblage est
exercé, leurs **gardes** ne sont prouvées nulle part. Pour un lot qui ajoute la
suppression de compte, c'est le point qui coûte, et c'est lui qu'il faut poser
d'abord.

On ouvre donc une suite `fonctions/`, sur le modèle exact de `declencheurs/` —
même harnais, même configuration séquentielle, `vitest.fonctions.config.mts` et
une entrée `test:fonctions` dans `package.json`. Elle appelle les fonctions via
le SDK client contre les émulateurs Auth et Functions, avec un vrai jeton de
gérant et un vrai jeton de responsable, et vérifie chacune des cinq gardes.

C'est une dette ouverte par S2 que ce lot referme pour tout le monde : les
fonctions existantes y gagnent leurs premiers témoins au passage.

### L'écran

`app/(app)/parametres/utilisateurs/page.tsx` existe et porte déjà la liste, le
formulaire de création et le rattachement. On y ajoute, par ligne, l'édition et
la suppression — en modale, patron `components/patrons/Modale.tsx`, comme S44 l'a
fait pour la vente et S49 pour le prix d'achat.

La suppression demande une confirmation qui **nomme le compte**, parce qu'une
liste de comptes se ressemble et qu'on clique sur la mauvaise ligne.

---

## Ce que la réalisation a changé

Trois écarts avec ce qui est écrit plus haut, et leurs raisons.

**Le dossier de tests s'appelle `appelables/`, pas `fonctions/`.** Il fait
pendant à `declencheurs/` — les deux natures de code serveur du produit — et
surtout il n'est pas à une lettre de `functions/`, le dossier du code lui-même,
sur un système de fichiers qui ne distingue pas la casse. La commande est
`npm run test:appelables`.

**La révocation ne se prouve pas comme prévu.** Deux témoins directs ont été
essayés contre l'émulateur Auth et aucun ne tient : `verifyIdToken(jeton, true)`
accepte encore un jeton émis dans la même seconde que la révocation (les deux
horodatages sont tronqués à la seconde), et le point de rafraîchissement rend un
**jeton neuf** après révocation — l'émulateur n'invalide pas les jetons de
rafraîchissement. Le témoin retenu est `tokensValidAfterTime`, lu avant et après,
avec un franchissement de tic de seconde pour que la troncature ne masque rien.
Le raisonnement est écrit dans `appelables/comptes.test.ts`, pour que personne ne
reparte sur les deux fausses pistes.

**Un défaut plus ancien que ce lot est tombé en regardant l'écran.** Le refus
d'effacement s'affichait « … doit rester lisible dans l'historique. **[400]** » :
`@firebase/functions` colle le code HTTP à la fin de chaque message d'erreur
appelable. Tout message serveur affiché depuis S2 le portait, sans que personne
l'ait vu d'assez près. La règle vit maintenant dans
`lib/firebase/erreur-appelable.ts`, avec ses témoins — dont un qui a trouvé au
passage qu'une cause `null` faisait tomber le traducteur d'erreurs, c'est-à-dire
le dernier endroit du produit où l'on peut se permettre de tomber.

---

Une fois la spec terminée : critères cochés, code vérifié (tests + rendu), revue
des trois contrats passée, commit effectué, statut mis à jour dans
`specs/ROADMAP.md`.
