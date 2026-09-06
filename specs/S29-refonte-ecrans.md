# S29 — Refonte de l'interface : les écrans

```
Statut     : à faire
Périmètre  : post-MVP — chantier de refonte, cf. CAHIER-UI.md §16
Dépend de  : S28
```

---

## Objectif

Chacun des neuf écrans du groupe A prend la forme validée dans les maquettes : le stock
devient un vrai tableau plein cadre, la nouvelle vente reste sereine sur toute sa longueur,
la liste des ventes garde sa fiche à droite sans perdre la ligne qu'on lisait. Le gérant
n'a plus besoin qu'on lui explique quoi faire en ouvrant un écran.

---

## Critères d'acceptation

Un commit par écran, tests relancés à chaque fois, dans l'ordre du `CAHIER-UI.md` §9 :

- [ ] **A1 Connexion** — et ses trois refus distincts : identifiants faux, compte sans rôle,
      réseau absent. Un mot de passe faux ne dit jamais « pas de réseau » (leçon du projet).
- [ ] **A2 Supervision** — le choix du périmètre d'abord, l'état réel ensuite. **Aucune
      carte de chiffre à zéro** tant que S24 n'existe pas (D63).
- [ ] **A3 Accueil gérant** — l'action du jour atteignable en un clic.
- [ ] **A4 Stock motos** — tableau pleine largeur, en-têtes collés, filtres persistants,
      comptage des résultats, « Faire entrer une moto » comme action principale.
- [ ] **A5 Nouvelle vente** — une colonne, groupes courts et titrés, `EFFET_MODE` annoncé
      avant la validation, barre d'action collée en bas.
- [ ] **A6 Ventes** — tableau + `FicheVente` en panneau latéral, la liste reste visible.
- [ ] **A7 Dossiers en attente** — qui détient quel papier, et ce qui est en retard. Le
      relais des quatre documents avance sans recharger la page.
- [ ] **A8 Paiements** — **deux sections séparées et nommées** : Dettes (crédit) et Tranches
      (moto retenue). Jamais mêlées dans un même tableau.
- [ ] **A9 Réglages** — les écrans d'administration atteints sans les chercher, et
      « Identité de l'entreprise » en lecture seule (D71).
- [ ] Pour chaque écran : vide, chargement (sans saut de mise en page), erreur, hors ligne,
      refus expliqué avec une sortie, désactivé qui dit *pourquoi* avant le geste.
- [ ] Aucun coût d'achat ni marge sur un écran de gérant, sur aucun de ces neuf écrans (D2).
- [ ] Crédit et tranches ne sont confondus nulle part.
- [ ] Le vocabulaire du domaine est repris mot pour mot de `lib/domain/`.
- [ ] `npm test`, `npm run test:e2e`, `node scripts/captures.mjs` passent et sont regardés ;
      le reçu est rephotographié sous média `print`.
- [ ] La checklist `DESIGN.md` §14 est passée écran par écran — dont « une chose à retirer ? ».
- [ ] `specs/ROADMAP.md` et `DECISIONS.md` sont à jour.

---

## Hors périmètre

Les écrans du groupe C : pièces (S20/S21), caisse (S22), chiffres de supervision (S24). Ils
ont été maquettés comme aperçus et le restent. Toute correction fonctionnelle repérée en
chemin se note et se traite à part.

---

## Notes techniques

Les patrons de S28 sont écrits : ces neuf commits les **appliquent**, ils ne les inventent
pas. Si un écran demande un patron qui n'existe pas, c'est le signe que S28 était incomplète —
on l'ajoute au socle, pas dans l'écran.

Chaque écran est confronté à sa maquette avant d'être commité, pas de mémoire.

**Un défaut repéré en chemin, à corriger ici et pas avant** (`CAHIER-UI.md` §16 : on le note,
on ne le commit pas dans un autre lot). Sur `/motos` en 390 px, la rangée d'actions rapides
(`app/(app)/motos/page.tsx`, `flex shrink-0 flex-wrap`) passe sous le bandeau collant quand
celui-ci grandit en mode hors ligne : le lien « Faire entrer une moto » devient
**inatteignable au clic**, et `e2e/motos.spec.ts` › « une moto se saisit et se consulte sans
réseau » échoue dessus — vérifié sur la branche de S28 comme sur la référence, donc antérieur
à la refonte. Ce n'est pas un défaut de synchronisation, contrairement à ce que D50 et D55
laissent croire pour ce fichier : c'est un défaut de disposition, et A4 le fait disparaître
en sortant ces actions de la rangée qui déborde.
