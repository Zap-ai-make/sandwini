# S28 — Refonte de l'interface : jetons, coquille et patrons

```
Statut     : à faire
Périmètre  : post-MVP — chantier de refonte, cf. CAHIER-UI.md §16
Dépend de  : S12 (dernière spec MVP), maquettes de la phase 1 validées
```

---

## Objectif

Le gérant ouvre l'application et voit enfin où il est, où il peut aller et ce qu'il doit
faire : la barre latérale porte les écrans de son espace au lieu de cinq liens et du vide,
et la zone de travail occupe l'écran au lieu de 768 px au milieu d'un 1920. Le responsable
retrouve l'identité de son entreprise dans le produit qu'il a payé.

Cette spec ne redessine aucun écran métier : elle installe le socle — les jetons, la
coquille, les patrons — sur lequel S29 les reprendra un par un. À sa fin, l'application
tourne, tous les tests passent, et les écrans existants vivent déjà dans la nouvelle
coquille sans avoir été réécrits.

---

## Critères d'acceptation

- [ ] Les jetons de `maquettes/socle.css` sont transcrits dans le bloc `@theme` de
      `app/globals.css` : palette, typographie, échelle d'espacement, rayons, durées et
      courbes d'animation. Aucune valeur qui n'ait été validée dans les maquettes.
- [ ] Le mode sombre est écrit en trois temps (système, clair forcé, sombre forcé) et
      reste un vrai mode, pas une inversion.
- [ ] La feuille `@media print` est revérifiée **après** le changement de jetons, et le reçu
      est photographié sous média `print` : il n'a pas régressé (`DESIGN.md` §14, leçon S10).
- [ ] `app/(app)/layout.tsx` ne borne plus la zone de travail à `max-w-3xl` : elle prend la
      largeur disponible, bornée à 1600 px. Les blocs de prose gardent leur `max-w-prose`.
- [ ] `NavigationPrincipale` devient rail d'espaces + colonne d'écrans groupés par intention
      (*Vendre* · *Suivre* · *Administrer*). Depuis n'importe quel écran de l'espace motos,
      les sept écrans de cet espace sont atteignables sans revenir en arrière.
- [ ] La colonne se replie sur ses icônes (bouton du bandeau, `Ctrl B`), l'état est retenu
      d'une page à l'autre, et **aucun écran ne devient inatteignable une fois repliée**.
- [ ] Le repli est animé comme dans les maquettes : la grille elle-même morphe (`@property
      --colonne`), les libellés s'effacent avant que la place ne se referme.
- [ ] Sous `prefers-reduced-motion: reduce`, toutes les animations de la refonte deviennent
      instantanées et **rien ne cesse de fonctionner** — vérifié, pas supposé.
- [ ] `BandeauEtat` est réhabillé : périmètre, recherche globale, état de synchronisation,
      et le jaune de plaque réduit à ses deux emplois (code boutique, hors ligne) — D70.
- [ ] `< 768 px` : la navigation basse dans la zone du pouce est préservée. `768–1024` : le
      rail se replie. `1024–1280` : la colonne se réduit aux icônes. `≥ 1280` : référence.
- [ ] Les patrons sont écrits une fois, en composants réutilisables : tableau, fiche,
      formulaire, hub, panneau latéral, états (vide, chargement, erreur, refus, hors ligne).
- [ ] Les noms accessibles du contrat `CAHIER-UI.md` §12 sont intacts : `banner`,
      `navigation` « Navigation principale », `status`, `alert`, `article`, le `combobox`
      « Boutique affichée ». Tout libellé changé est mis à jour dans `e2e/` **dans le même
      commit**.
- [ ] `npm test` : 315 unitaires, 230 règles, 21 déclencheurs passent. `npm run test:e2e`
      passe.
- [ ] `node scripts/captures.mjs` : les captures sont regardées, mobile et bureau, clair et
      sombre.
- [ ] La branche principale reste déployable à chaque commit (`ARCHITECTURE.md` §11).

---

## Hors périmètre

La refonte des écrans métier eux-mêmes — c'est S29. Toute correction fonctionnelle repérée
en chemin : elle se note, elle ne se commit pas ici (`CAHIER-UI.md` §16). Les écrans du
groupe C des maquettes (pièces, caisse, chiffres de supervision) restent des aperçus :
S20-S24. L'IFU et le RCCM réels tant que le commanditaire ne les a pas fournis (D71).

---

## Notes techniques

**L'ordre des commits**, du socle vers les feuilles, chacun vérifié :

1. `app/globals.css` — les jetons seuls. Rien d'autre ne change ; l'application doit encore
   tourner, l'impression être revérifiée, les tests passer. C'est le commit qui a le plus de
   chances de casser silencieusement le reçu.
2. `lib/domain/entreprise.ts` — la constante d'identité (D71), et `/parametres/entreprise`
   qui devient une carte en lecture seule. Le H1 passe de « Entreprise » à « Identité de
   l'entreprise » : contrat de test, donc `e2e/referentiels.spec.ts` dans le même commit,
   et les tests qui remplissaient ce formulaire sont retirés là aussi.
3. `app/(app)/layout.tsx` + `NavigationPrincipale` — la coquille, le rail, la colonne, le
   repli. C'est là que le défaut n°1 disparaît.
4. `BandeauEtat` — réhabillage, recherche globale, palette de commandes.
5. Les patrons, en composants.

**shadcn/ui.** `CAHIER-UI.md` §13 l'autorise sous trois conditions. Position à confirmer au
moment du commit 5 : les maquettes n'ont eu besoin que d'un dialogue, d'un panneau latéral et
d'une palette de commandes. Si Radix ne sert qu'à ces trois-là, on l'installe pour le piège
de focus et l'ARIA — les écrire à la main est le mauvais calcul que le contrat désigne. La
décision et son coût en dépendances vont dans `DECISIONS.md`.

**À reprendre, pas à réécrire** (`DESIGN.md` §7) : `Recu`, `PanneauRecu`, `FicheVente`,
`FicheMoto`, `DossierDocuments`, `PapiersMoto`, `FormulaireClient`, `ListeReferentiel`,
`InvitationBoutique`, `GardeSession` / `GardeCapacite` / `GardeEspace`. Leur logique est
testée ; c'est leur habillage qui change.

**Les routes ne bougent pas.** Si l'une devait bouger, `next.config.ts` (`ECRANS_HORS_LIGNE`)
et les tests bout en bout se mettent à jour ensemble — et c'est dit.

**Sécurité.** Aucun coût d'achat ni marge ne doit apparaître sur un écran de gérant. La
refonte de la coquille ne touche pas au cloisonnement (D2), mais elle change ce qui est
affiché : chaque écran repris est relu sur ce point.
