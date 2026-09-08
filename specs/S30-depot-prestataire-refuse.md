# S30 — Le dépôt chez un prestataire est refusé par les règles

```
Statut     : à faire
Périmètre  : MVP (correction d'une capacité livrée en S11)
Dépend de  : S11 (cycle des documents), S9 (sortie de caisse)
```

---

## Objectif

Le gérant confie la carte grise à un prestataire, verse l'avance, et le dépôt
est enregistré. Aujourd'hui, environ une fois sur deux, il voit le dépôt
s'inscrire à l'écran puis un message technique en anglais s'afficher à sa
place — et il n'a aucun moyen de savoir si l'argent est sorti de la caisse, si
le prestataire est enregistré, ni s'il doit recommencer.

C'est le seul défaut nommé et reproductible qui reste ouvert sur le produit.

---

## Le symptôme, tel qu'il a été observé

Le 7 septembre 2026, sur émulateurs froids, **quatre tours sur six**. Deux
scénarios bout en bout le portent, tous deux dans `e2e/dossier.spec.ts` :
« le dépôt enregistre qui détient le document, et sort l'avance de la caisse »
et « le cycle complet : déposé, revenu, remis ».

Ce que le gérant voit, mot pour mot :

```
PERMISSION_DENIED: false for 'create' @ L161, evaluation error at L835:24
```

Et il le voit **pendant que la ligne du document affiche « Chez le
prestataire »** : le cache local a appliqué l'écriture avant que le serveur ne
la refuse. Le formulaire de dépôt reste ouvert derrière. L'écran dit donc deux
choses contradictoires en même temps, dont aucune n'est actionnable.

---

## Ce qui est déjà établi — et ce que ça élimine

Ces points sont acquis, ils n'ont pas à être réinstruits :

1. **Ce n'est pas un désaccord de forme entre le lot et les règles.**
   `regles/dossier.test.ts`, bloc « le lot complet du dépôt », envoie
   exactement les trois écritures de `lib/repositories/dossier.ts` — le statut,
   la ligne d'historique, la sortie de caisse — et le lot passe. La charge utile
   est conforme.

2. **Ce n'est pas la transition.** `transitionAutorisee` puis `validerDepot`
   tournent avant l'ouverture du lot et lèvent leurs propres phrases, en
   français.

3. **Le refus porte sur une création, pas sur la modification du document.**
   `'create'` : l'écriture en cause est celle de `encaissements/{id}`, la sortie
   de caisse de l'avance.

4. **`L161` est du bruit attendu, pas la cause.** `match /{referentiel}/{id}`
   est un joker de premier niveau : il attrape *toute* collection racine,
   `encaissements` comprise, et répond `false` pour un gérant. Sa présence dans
   le message signale seulement que l'autre règle candidate n'a pas répondu
   « oui ».

5. **Le vrai signal est `evaluation error`.** Une règle qui *tombe en erreur*,
   ce n'est pas une règle qui refuse : c'est une expression qui ne s'évalue pas.
   `L835:24` est le début de la condition du `allow create` de
   `match /encaissements/{encaissementId}` — une seule expression qui court de
   la ligne 835 à la ligne 837. L'erreur peut donc naître dans n'importe laquelle
   de ses trois parties, `encaissementValide`, `traceCreation` ou
   `peutVendrePour`.

6. **Le filet de règles ne peut pas, par construction, attraper ce défaut.**
   Le harnais de `regles/` frappe la base avec
   `env.authenticatedContext(uid, { role: "gerant", boutiqueId: "PTG" })` : le
   jeton y porte toujours ses deux claims. Tout ce qui dépend de la *forme du
   jeton réel* est hors de portée de ces tests aujourd'hui.

---

## Les hypothèses, et l'expérience qui tranche chacune

Aucune n'est retenue d'avance. Elles sont écrites pour que la première heure de
travail soit une mesure, pas une relecture.

**H1 — un claim absent du jeton.** `estGerantDe` lit
`request.auth.token.boutiqueId`. En Firestore, lire une clé absente d'une map
est une **erreur d'évaluation**, pas un `false`. Les claims sont posés par une
Cloud Function ; tant que l'ID token n'a pas été rafraîchi, `boutiqueId` peut
manquer. Cela expliquerait l'intermittence sans rien supposer d'autre.
*Ce qui tranche :* relever `getIdTokenResult().claims` juste avant
`lot.commit()` dans le scénario qui échoue, et ajouter un cas de règles avec un
jeton privé de `boutiqueId`.

**H2 — l'horodatage.** `traceCreation` pose `serverTimestamp()`, et la règle
exige `createdAt == request.time` ; `dateAppareil` compare la date métier, issue
de l'horloge de l'appareil (D38), à `request.time`. Un lot rejoué depuis la file
hors ligne ne s'évalue pas à l'instant où il a été formé.
*Ce qui tranche :* rejouer le dépôt réseau coupé puis rétabli, et comparer avec
un dépôt en ligne.

**H3 — le rejeu de la file.** Le lot part de la file d'écritures après
reconnexion, avec un jeton qui a pu être rafraîchi entre-temps. D50 et D55
documentent déjà l'instabilité de cette fenêtre.
*Ce qui tranche :* le journal du moteur de règles de l'émulateur
(`firestore-debug.log`) horodate chaque évaluation et nomme l'expression fautive.

C'est ce journal qui doit décider, pas le raisonnement ci-dessus.

---

## Critères d'acceptation

- [ ] La cause est **nommée par une observation** : le journal du moteur de
      règles montre l'expression qui tombe en erreur. Une hypothèse confirmée
      par la disparition du symptôme ne compte pas — un défaut intermittent
      disparaît tout seul une fois sur deux.
- [ ] Un test de règles **échoue sur cette cause avant le correctif** et passe
      après. Le test précède le correctif, sinon il ne prouve rien.
- [ ] `e2e/dossier.spec.ts` « le dépôt enregistre qui détient le document » et
      « le cycle complet » passent **dix tours de suite** sur émulateurs froids.
- [ ] Le gérant ne voit **jamais** le texte brut de Firestore. Si un refus reste
      possible, l'écran dit en français ce qui s'est passé et ce qu'il faut
      faire ; le formulaire reste ouvert avec sa saisie, comme pour l'avance
      nulle.
- [ ] L'écran **n'annonce pas un dépôt que la base a refusé** : soit l'état
      revient visiblement en arrière, soit il s'annonce comme en attente. Deux
      affirmations contradictoires à l'écran, c'est le défaut lui-même.
- [ ] Le statut, l'historique et la sortie de caisse restent **indissociables** :
      le lot reste un lot. Un document déposé dont l'argent n'est pas sorti de la
      caisse est l'état le plus coûteux à démêler.
- [ ] Les états sont couverts — vide, chargement, erreur (`DESIGN.md` §10).
- [ ] **Aucune règle n'est assouplie pour faire passer un test**
      (`SECURITY.md` §0). Si `estGerantDe` doit être durci, il l'est dans le sens
      qui expose le moins. Un refus qui protège la caisse vaut mieux qu'un dépôt
      qui passe.

---

## Hors périmètre

- **La reconnexion immédiate au retour du réseau** — c'est S27, et elle a sa
  propre entrée au backlog. S30 ne ferme que le dépôt.
- **L'annulation ou la contre-passation d'un encaissement** — S22 et S25.
- **Le reste du bruit bout en bout de la famille synchronisation** (D50, D55).
  Si le correctif l'assainit aussi, tant mieux ; ce n'est pas un critère.
- **La forme de l'écran** : A6 et A7 sont livrés. On n'y touche que si le
  message d'erreur l'exige.
- **Restreindre `match /{referentiel}/{id}`** au trio de collections qu'il vise.
  C'est un vrai sujet — un joker de premier niveau salit tous les journaux et
  rend chaque refus ambigu — mais c'est une passe de durcissement, pas ce
  défaut. À porter au backlog si l'enquête confirme la gêne.

---

## Notes techniques

**Où regarder :**

- `lib/repositories/dossier.ts` — le lot des trois écritures. C'est le seul
  endroit qui les assemble.
- `components/GestesDocument.tsx` ligne 67 — `setErreur(cause.message)`.
  C'est par là que le jargon des règles arrive sous les yeux du gérant. Le
  chemin est le même pour tous les gestes de document, sur la fiche de vente
  comme dans la file des dossiers (A7) : ce qui se corrige ici se corrige aux
  deux endroits.
- `firestore.rules` — `encaissementValide` et le `match /encaissements` aux
  lignes 810 à 840, `estGerantDe` ligne 269, le joker ligne 158.
- `regles/dossier.test.ts` — « le lot complet du dépôt » existe déjà et passe.
  Le cas à ajouter porte sur la *forme du jeton*, pas sur la forme des données.

**Méthode de vérification.** Les tests bout en bout ne visent jamais le vrai
projet — ils créent et effacent boutiques, motos et ventes :

```
mv .env.local.emulateurs .env.local
npm run emulators          # attendre 8181 / 9399 / 9599
npm run build              # NEXT_PUBLIC_* est figé à la compilation
npm run test:e2e
```

et retirer `.env.local` à la fin, pour rendre au commanditaire son choix du
projet `sandwini`.

Un échec bout en bout s'explique avant d'être écarté (D50, D55). La machine
fait parfois tourner la suite QA d'un autre projet : vérifier la charge du
processeur avant de conclure quoi que ce soit sur un délai dépassé.

**Ce défaut est déjà revenu une fois.** Le bloc « le lot complet du dépôt » de
`regles/dossier.test.ts` a été écrit pour une panne du même endroit — un dépôt
affiché qui n'était jamais parti, coincé derrière « Hors ligne · 1 saisie en
attente ». Ce test a fermé la porte de la *forme des données* ; il en restait
une autre. C'est la raison pour laquelle le premier critère d'acceptation exige
une observation et non une disparition.
