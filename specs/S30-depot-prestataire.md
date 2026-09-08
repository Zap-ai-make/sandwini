# S30 — Le dépôt chez un prestataire ne se termine jamais

```
Statut     : terminée
Périmètre  : MVP (correction d'une capacité livrée en S11)
Dépend de  : S11 (cycle des documents), S9 (sortie de caisse)
```

---

## Objectif

Le gérant confie la carte grise à un prestataire, verse l'avance, et le geste
est terminé : le formulaire se referme, la ligne dit qui détient le papier, et
l'étape suivante est offerte. **Y compris sans réseau** — c'est le cas normal
au comptoir, pas l'exception.

---

## Le symptôme, tel qu'il a été observé

Environ une fois sur deux, sur émulateurs : le dépôt s'inscrit à l'écran
(« Chez le prestataire »), puis plus rien. Le formulaire de dépôt reste ouvert
*par-dessus*, et le bouton de l'étape suivante n'apparaît jamais. Le gérant
voit deux choses contradictoires et n'a aucun geste pour sortir de là.

Deux scénarios bout en bout le portaient, dans `e2e/dossier.spec.ts` : « le
dépôt enregistre qui détient le document » et « le cycle complet ». Le second
expirait au bout de quatre minutes en attendant « Arrivé au magasin ».

---

## Le diagnostic de départ était faux, et c'est instructif

Cette spec a d'abord été écrite sous le titre « le dépôt est refusé par les
règles », sur la foi du message affiché au gérant :

```
PERMISSION_DENIED: false for 'create' @ L161, evaluation error at L835:24
```

**Ce message était une fausse piste, et il a coûté cher.** Ce qui l'a démonté,
dans l'ordre :

1. Le lot exact du dépôt, envoyé avec un jeton bien formé, **est accepté** —
   `regles/dossier.test.ts` le prouvait déjà, et un banc d'essai l'a confirmé
   avec le jeton du responsable.
2. `L161` n'était pas le coupable : c'est le joker de premier niveau
   `match /{referentiel}/{id}`, qui répond `false` pour toute collection racine.
3. Le geste, joué **seul**, passe en 47 secondes avec un jeton parfait et zéro
   refus. Il n'échoue qu'au milieu d'une série.
4. Enfin la mesure décisive : après l'échec, la vente **et son dépôt étaient
   bien enregistrés côté serveur** (`carte_grise -> chez_prestataire`). Rien
   n'avait été refusé. Le serveur avait dit oui ; c'est l'écran qui n'écoutait
   plus.

Deux leçons pour la prochaine fois. Un message d'erreur affiché n'est pas la
preuve que l'erreur qu'il nomme est celle qui fait échouer le test — ici les
refus venaient d'écritures voisines, dans la même minute. Et pendant
l'enquête, un banc d'essai `rules-unit-testing` lancé contre l'émulateur
partagé **a écrasé son jeu de règles** (`singleProjectMode`) : les numéros de
ligne du journal ont glissé de cinq, et une reproduction entière a porté sur
autre chose que le produit. Un instrument qui modifie ce qu'il mesure ne
mesure rien.

---

## La cause

`components/DossierDocuments.tsx` attendait l'accusé de réception du serveur
avant de refermer le formulaire :

```ts
await avancerDocument(...);   // ne se résout qu'à l'accusé de réception
setDepotOuvert(false);
```

et le rendu cachait les gestes suivants tant que le formulaire était ouvert :
`{suivants.length > 0 && !depotOuvert && (…)}`.

Or Firestore applique l'écriture au cache local **sur-le-champ** : la ligne
affiche le nouveau statut tout de suite, tandis que la promesse, elle, ne se
résout qu'au retour du serveur. Entre les deux, l'écran est bloqué dans un état
qu'il présente comme en cours alors qu'il est terminé. Hors ligne, cet
intervalle ne se ferme **jamais** : le dossier devient inutilisable exactement
là où le hors-ligne devait le rendre possible (`AGENTS.md`, « le hors-ligne se
cherche »). En ligne, il dure le temps que met la file d'écritures — quelques
dizaines de secondes dès qu'elle est encombrée, d'où l'intermittence.

Deux défauts du même chemin, trouvés avec :

- `avancerDocument` n'enveloppait pas son lot dans `suivreEcriture` : un dépôt
  en attente n'était **pas compté** dans le bandeau. Le module le dit lui-même —
  « une écriture qui oublie cette enveloppe est simplement invisible dans
  l'indicateur, ce qui est pire qu'une erreur ».
- Le `catch` affichait `cause.message` brut, c'est-à-dire le jargon anglais des
  règles Firestore, à quelqu'un qui tient un comptoir.

---

## Ce qui a été fait

Le patron existait déjà dans le dépôt, dans `FormulaireClient` : on n'attend
pas le serveur, on avance sur l'écriture locale, on rattache un `catch` pour le
refus tardif. S30 aligne le dossier dessus.

- `lib/repositories/dossier.ts` — `avancerDocument` valide sur-le-champ (une
  transition impossible ou un dépôt incomplet lèvent toujours immédiatement)
  puis **rend la promesse du lot sans l'attendre**, enveloppée dans
  `suivreEcriture`. Ajout de `messageErreurDossier`, sur le modèle de
  `messageErreurClient`.
- `components/DossierDocuments.tsx` — le geste referme le formulaire et rend la
  main tout de suite ; un refus tardif revient en français. L'état `envoi` et
  son tourniquet disparaissent : il n'y a plus rien à attendre, et un
  indicateur d'attente qui ne s'éteint jamais est un mensonge. Le garde-fou
  contre le double clic reste, sous forme de référence — il se lève au
  changement de statut.

---

## Critères d'acceptation

- [x] **La cause est nommée par une observation**, pas par déduction : l'état
      du serveur après l'échec montre le dépôt enregistré, et un test écrit
      avant le correctif échoue exactement sur le formulaire qui ne se referme
      pas.
- [x] **Un test échoue avant le correctif et passe après** :
      `e2e/dossier.spec.ts` « le dépôt se termine sans réseau : l'écran rend la
      main tout de suite ». Il coupe le réseau *avant* le dépôt — donc il porte
      sur la promesse du produit, pas sur le symptôme observé.
- [x] `e2e/dossier.spec.ts` passe **8/8, trois tours de suite**. « Le cycle
      complet » est passé de 240 s (expiration) à 8 s ; le fichier entier de
      8,5 min à 1,5 min. Les tests étaient lents pour la raison même qui les
      faisait échouer : chaque geste attendait un accusé de réception coincé
      dans une file encombrée.
- [x] Le gérant ne voit plus le texte brut de Firestore : `messageErreurDossier`
      traduit les trois refus qui peuvent l'atteindre.
- [x] L'écran n'annonce plus un état contradictoire : le formulaire et le
      statut ne coexistent plus.
- [x] Le lot reste un lot : statut, historique et sortie de caisse partent
      ensemble, inchangés.
- [x] **Aucune règle n'a été touchée.** Elles avaient raison depuis le début.

---

## Hors périmètre — et ce que l'enquête a laissé derrière

- **La reconnexion immédiate au retour du réseau (S27).** Le test hors ligne
  s'arrête volontairement avant « À jour » : la file ne repart qu'au bout de
  l'attente croissante du SDK, et D55 range cet indicateur parmi les signaux
  instables. Ce fichier avait déjà cessé d'observer ce signal une fois ; on ne
  recommence pas.
- **Une fragilité réelle des règles, trouvée en chemin et non corrigée.** Lire
  une clé absente de `request.auth.token` n'est pas un `false`, c'est une
  **erreur d'évaluation** — le moteur le dit mot pour mot :
  `firestore.rules:270:50, Property boutiqueId is undefined on object.` Un
  gérant dont le jeton n'aurait pas le claim `boutiqueId` verrait donc *toutes*
  ses écritures échouer, sans qu'aucune règle ne dise non. Aucun chemin du code
  actuel ne produit ce jeton, et le harnais de `regles/` ne peut pas le voir
  (il forge toujours un jeton complet). À traiter à part : `.get('boutiqueId',
  '')` transforme le plantage en refus propre, sans rien assouplir.
- **Restreindre `match /{referentiel}/{id}`** au trio qu'il vise : un joker de
  premier niveau salit tous les journaux et rend chaque refus ambigu. C'est ce
  qui a mis l'enquête sur une fausse piste pendant une heure.
- **Le même défaut vit sur `feat/S29-refonte-ecrans`**, dans
  `components/GestesDocument.tsx` — la machine à états extraite par S29 a
  emporté le `await`. À corriger avant la fusion, sinon S29 le réintroduit.
