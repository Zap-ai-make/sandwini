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
      comptage des résultats, « Faire entrer une moto » comme action principale. **C'est ici
      que naît le patron `Tableau`**, dans `components/patrons/` : S28 ne l'a pas écrit
      faute d'un seul appelant pour en démentir l'interface, et les huit écrans suivants le
      reprennent au lieu d'en dessiner chacun un.
- [ ] **A5 Nouvelle vente** — une colonne, groupes courts et titrés, `EFFET_MODE` annoncé
      avant la validation, barre d'action collée en bas.
- [ ] **A6 Ventes** — tableau + `FicheVente` en panneau latéral, la liste reste visible.
      **C'est ici que naît le patron `PanneauLateral`** — même raison qu'en A4. `PanneauRecu`
      porte aujourd'hui le nom d'un panneau mais rend une page pleine ; il le devient ici.
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

**Un défaut de fond, repéré en S28, qui n'appartient pas à la refonte.** Le dépôt d'un
document chez un prestataire échoue une fois sur deux : la ligne affiche « Chez le
prestataire » — c'est l'écriture optimiste du cache local — puis le serveur refuse, et
`PERMISSION_DENIED … evaluation error at L717` s'affiche **brut** dans l'interface. La règle
n'accuse personne : elle évalue `resource.data` sur un document qui n'existe pas encore côté
serveur. Autrement dit le client met à jour un document de dossier avant que sa création ait
abouti.

Deux choses sont cassées, et aucune n'est graphique :
1. l'ordre des écritures — une mise à jour part avant que la création soit acquittée ;
2. le message — un code de règle Firestore n'a rien à faire sous les yeux d'un gérant
   (`DESIGN.md` §12).

Vérifié : `e2e/dossier.spec.ts` › « le cycle complet : déposé, revenu, remis » échoue de la
même façon, à la même ligne, **sur la branche de S28 comme sur le commit qui la précède** —
donc antérieur aux patrons. Ce n'est ni A4 ni A7 : cela demande sa propre spec, côté
`lib/repositories/dossier.ts` et non côté écran. À ne pas confondre avec le défaut de
disposition ci-dessus, qui, lui, était bien de la mise en page.

**Les champs restent à passer au patron.** `components/patrons/Champ.tsx` existe et tient
l'enveloppe — intitulé, saisie, aide, erreur — mais n'a que deux appelants : le reste des
formulaires garde ses paires `label`/`input` écrites à la main, une cinquantaine. Les
convertir maintenant les aurait posés à 48 px pour les reposer à 38 px avec la densité
bureau : deux passes au lieu d'une. A5 et A9 les prennent, en même temps que la hauteur.

**La colonne des écrans de formulaire reste à tenir.** En retirant `max-w-3xl`, S28 a rendu
la zone de travail à sa largeur — ce qu'il fallait pour les listes, et ce qui a étiré les
champs de saisie sur 950 px. Le patron `.saisie` les borne à 32 rem, ce qui répare le pire,
mais la carte qui les contient s'étend toujours sur toute la largeur : un titre « Ajouter un
prestataire » et son bouton flottent aux deux bouts d'une bande vide. A5 et A9 tiennent la
colonne entière, pas seulement les champs.

**Un défaut repéré en chemin — et réparé en chemin, sans qu'on le cherche.** Sur `/motos` en
390 px, la rangée d'actions rapides
(`app/(app)/motos/page.tsx`, `flex shrink-0 flex-wrap`) passe sous le bandeau collant quand
celui-ci grandit en mode hors ligne : le lien « Faire entrer une moto » devient
**inatteignable au clic**, et `e2e/motos.spec.ts` › « une moto se saisit et se consulte sans
réseau » échoue dessus — vérifié sur la branche de S28 comme sur la référence, donc antérieur
à la refonte. Ce n'est pas un défaut de synchronisation, contrairement à ce que D50 et D55
laissent croire pour ce fichier : c'est un défaut de disposition. Le `shrink-0` a disparu en
même temps que la rangée, quand la tête d'écran est devenue un patron — les actions se
replient désormais sous le titre, vérifié sur capture à 390 px. Ce n'est pas une correction
fonctionnelle glissée dans un autre lot (`CAHIER-UI.md` §16) : c'est la même ligne de code
qui portait le défaut et qui a été réécrite. A4 n'a plus rien à réparer ici.
