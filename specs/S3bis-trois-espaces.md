# S3bis — Les trois espaces

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S3
```

---

## Objectif

L'entreprise tient des boutiques de motos et une boutique de pièces détachées, et le
responsable les pilote toutes. Chacun doit ouvrir l'application sur son espace : le
gérant sur le métier de sa boutique, le responsable sur sa supervision. Personne ne voit
un onglet qui ne mène nulle part.

---

## Critères d'acceptation

- [x] Une boutique déclare ce qu'elle vend — motos, pièces, ou les deux — et le
      formulaire refuse une boutique sans métier.
- [x] Le métier se corrige après coup ; le code, lui, reste définitif.
- [x] Les règles Firestore exigent au moins un métier connu, à la création comme à la
      modification, et refusent qu'un gérant s'ouvre un espace en changeant le sien.
- [x] Le gérant d'une boutique de motos n'a pas d'entrée « Pièces » dans sa navigation,
      ni de lien vers cet espace sur son accueil.
- [x] Le lien tapé à la main vers un espace fermé affiche un refus qui nomme la boutique
      et le métier manquant, avec un retour vers l'accueil.
- [x] Le responsable atterrit sur `/supervision` à la connexion ; le gérant sur
      `/dashboard`. Un responsable qui vise `/dashboard` est renvoyé à sa supervision.
- [x] La supervision liste les boutiques ouvertes avec leur métier écrit, et en ouvrir
      une fixe le périmètre puis mène à l'espace de son métier.
- [x] Le gérant qui vise `/supervision` lit « Réservé au responsable ».
- [x] Changer de boutique dans le bandeau change les espaces disponibles ; « Toutes les
      boutiques » ouvre l'union des métiers.
- [x] Les états sont couverts : chargement du périmètre (barre réduite aux espaces
      certains), aucune boutique (l'invitation existante prend la parole), erreur de
      lecture, permission refusée — cf. `DESIGN.md` §10.
- [x] Tout fonctionne hors ligne : les métiers voyagent dans le document de boutique
      déjà en cache, et `/supervision` est au précache du service worker (D40).

---

## Hors périmètre

Les chiffres de la supervision (S24) · l'espace pièces lui-même (S20, S21) · la caisse
(S22) · le filtrage des données par métier au-delà de la navigation — il n'existe encore
aucune donnée pièces à filtrer.

---

## Notes techniques

- `lib/domain/espaces.ts` : fonction pure, sur le modèle de `peut()` dans `roles.ts`.
  Une seule réponse à « cet espace lui est-il ouvert ? », partagée par la navigation, les
  gardes et les accueils — sans quoi la barre propose ce que l'écran refuse.
- `GardeEspace` rejoint `GardeCapacite` dans `components/GardeSession.tsx` : même forme,
  même ton, et le même avertissement — elles décident de ce qu'on **affiche**, la
  permission se joue dans les règles Firestore (D27).
- Les gardes sont posées sur des `layout.tsx` (`motos`, `supervision`) plutôt que sur
  chaque page : un seul endroit à tenir, et les écrans de S11 en héritent.
- Décisions : `DECISIONS.md` D62 (métiers de boutique) et D63 (la supervision est une
  section). Le cahier des charges a été corrigé en conséquence.

---

## Vérification

Déterministe, vert à chaque exécution : `tsc`, `eslint`, **265 tests unitaires**, **196 tests de
règles Firestore** (dont les cas métiers), build de production, et la revue visuelle sur le rendu
réel — clair et sombre, mobile et bureau (`captures/supervision-*.png`, `captures/boutiques-*.png`).

Bout en bout : **cinq suites complètes, cinq ensembles d'échecs disjoints**, entre 67 et 74 sur 74.
`e2e/espaces.spec.ts` est passé intégralement en suite complète et en exécution isolée ; la dernière
mesure ne contient aucun test écrit ou modifié par cette spec. C'est le défaut du harnais documenté
en `DECISIONS.md` D55, enrichi de cette quatrième mesure ; sa correction de fond est **S27**.

Deux défauts réels ont été trouvés par cette suite et corrigés : une troisième copie du helper de
création de boutique dans `e2e/numerotation.spec.ts`, qui ne cochait aucun métier (supprimée au
profit du helper partagé), et une assertion sur la liste des comptes qui tombait dans le piège de
D55 (remplacée par la confirmation de la fonction).
