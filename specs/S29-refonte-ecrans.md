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

- [x] **A1 Connexion** — et ses trois refus distincts : identifiants faux, compte sans rôle,
      réseau absent. Un mot de passe faux ne dit jamais « pas de réseau » (leçon du projet).
      Chaque refus est désormais **nommé puis expliqué** au lieu d'une ligne rouge : un titre
      qui dit la situation, une phrase qui dit quoi tenter, et un ton qui dit de quelle nature
      elle est — rouge pour ce qui est refusé, bleu de la goutte pour le compte qui attend son
      rôle, jaune de plaque pour le réseau absent (D70). Le patron `Avis` naît ici.
- [x] **A2 Supervision** — le choix du périmètre d'abord, en cartes qu'on balaie d'un
      regard ; « ce qui demande une décision » ensuite, en lignes nommées et ouvrables.
      **Aucune carte de chiffre à zéro** (D63) : quand rien n'attend, l'écran l'écrit en
      toutes lettres plutôt que d'afficher « 0 ». La maquette portait une troisième sorte de
      retard, « crédit échu » : elle n'a pas été construite, parce qu'une vente à crédit n'a
      pas de date d'échéance dans ce produit et qu'en fixer une au bout de N jours serait
      inventer une règle de gestion qui revient au responsable.
      **Reste à photographier** : la section peuplée. Il faut pour cela un dossier déposé chez
      un prestataire avec une date dépassée — c'est-à-dire le chemin d'écriture cassé décrit
      plus bas. Le rendu vide et le rendu en attente ont été vus ; les lignes reposent sur
      `dossiersEnAttente` et `estInactive`, deux fonctions pures déjà couvertes par des tests.
- [x] **A3 Accueil gérant** — l'action du jour atteignable en un clic. L'écran listait les
      espaces de la boutique, c'est-à-dire exactement ce que la colonne de gauche porte depuis
      S28 : un accueil qui répète la navigation ne fait rien, on le traverse sans le lire. Il
      porte maintenant un seul geste en grand — la vente, le geste quotidien — puis « à faire
      aujourd'hui » et « ce que j'ai fait aujourd'hui ».
      Un défaut trouvé en le construisant : sans boutique attribuée, une écoute sans périmètre
      est une lecture de **toutes** les boutiques, que les règles refusent à un gérant (D7).
      L'accueil aurait affiché une erreur rouge pour toute réponse à quelqu'un qui n'y peut
      rien. Les deux sections ne se montent donc pas dans ce cas, et le sous-titre dit
      « Aucune boutique attribuée » au lieu de « Toutes les boutiques » — vérifié sur capture.
- [x] **A4 Stock motos** — tableau pleine largeur, en-têtes collés, filtres persistants,
      comptage des résultats, « Faire entrer une moto » comme action principale. Le patron
      `Tableau` naît ici, dans `components/patrons/`, avec ce que les huit écrans suivants
      reprennent : colonnes alignées, chiffres tabulaires et insécables, en-tête collé,
      repli en cartes, lignes fantômes de chargement. Il ne porte **ni tri, ni sélection,
      ni pagination** : `CAHIER-UI.md` §8.1 mentionne le tri, aucun des neuf écrans ne le
      demande, et une colonne triable inventée ici serait à refaire au premier écran qui en
      aurait vraiment besoin.
      Trois choses ont été retirées plutôt qu'ajoutées. Les liens « Nouvelle vente »,
      « Ventes » et « Dossiers » en tête d'écran — mot pour mot ceux de la colonne de gauche
      depuis S28 : les répéter ne donnait pas un raccourci, cela noyait le seul geste que cet
      écran commande. Le fond jaune du châssis — un stock entier de plaques jaunes fait du
      signal un décor, et D70 ne lui laisse que deux emplois ; le seul jaune restant est la
      colonne « Boutique », qui est justement un code boutique. La devise répétée à chaque
      ligne — elle est titrée une fois, en tête de colonne (`formaterNombre`).
      **Deux points où la maquette n'a pas pu être suivie à la lettre, et pourquoi.**
      1. Le repli en cartes tombe à 1024 px et non à 768 : les maquettes escamotent la
         colonne des écrans dès 1024, la coquille livrée la garde jusqu'à 768, et le tableau
         a donc 296 px de moins que ce pour quoi il a été dessiné. Le seuil suit la place
         réelle. **Cet écart de coquille reste à trancher** : entre 768 et 1024, un tiers de
         l'écran part en navigation, ce qui est le défaut que `CAHIER-UI.md` §2 reproche à
         l'ancienne barre latérale. Ce n'est pas A4 : cela touche les vingt écrans.
      2. L'en-tête collé des maquettes est inerte : leur `.cadre` porte `overflow: hidden`,
         qui fait du cadre la zone de défilement de référence — une boîte qui ne défile
         jamais. Ici c'est **le tableau qui défile, pas la page** : la zone du tableau prend
         la hauteur restante et défile dans les deux sens, la barre de filtres reste posée
         au-dessus (c'est ça, des filtres persistants) et l'en-tête se colle à elle.
      **Trois défauts trouvés sur capture, pas devinés.** Le premier rendu laissait la page
      défiler et rognait le cadre en `overflow: clip` : à 1280 px la dernière colonne devenait
      **inatteignable**, la date d'entrée coupée en « 07/0 » — rogner et déborder ne se
      conjuguent pas, il fallait une vraie zone de défilement. À 390 px, les intitulés recopiés
      dans les cartes héritaient du gras et du Plex Mono de leur colonne : « Prix conseillé »
      sortait dans la police réservée à ce qui se dicte. Et l'en-tête était insécable, ce qui
      poussait la largeur pour rien ; il se replie désormais sur deux lignes.
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
donc antérieur aux patrons. **Il ne se reproduisait pas toujours** : la suite complète est
repassée à 82 sur 82 sur des émulateurs fraîchement démarrés, ce qui avait fait conclure à une
course — le client met à jour un document que la création n'a pas fini de poser, et selon la
latence du serveur cela passe ou non.

**À revoir : en A4 il s'est reproduit trois fois de suite, machine calme comprise.** Le test a
été rejoué sur le commit de référence, A4 mis de côté (`git stash`) et l'application
recompilée : même échec, même endroit — le bouton « Arrivé au magasin » n'apparaît jamais,
donc le dépôt n'a pas abouti côté serveur. Ce n'est donc ni A4 ni la refonte. Mais une course
qui perd trois fois sur trois n'en est plus tout à fait une : la spec qui reprendra ce défaut
devra vérifier l'ordre des écritures avant de conclure à la latence. Une course qui perd une écriture une fois sur
deux au comptoir est pire qu'une panne franche : elle ne se voit pas. Ce n'est ni A4 ni A7 : cela demande sa propre spec, côté
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
