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
- [x] **A5 Nouvelle vente** — une colonne, groupes courts et titrés, `EFFET_MODE` annoncé
      avant la validation, barre d'action collée en bas. Le patron `Formulaire` naît ici,
      dans `components/patrons/`, avec ce qu'A9 reprendra : la colonne de 40 rem, l'aparté
      du récapitulatif qui reste sous les yeux, la barre collée, et `Groupe` — un
      `fieldset` titré, sans cadre, parce que cinq cadres feraient cinq écrans là où il
      n'y a qu'un formulaire.
      **La colonne entière est tenue**, pas seulement les champs : le bloc fait 40 rem de
      saisie plus 21,25 rem de récapitulatif, et la place à droite ne sert plus à étirer
      quoi que ce soit. Dans une colonne tenue, la borne de 32 rem posée sur `.saisie` en
      S28 n'a plus lieu d'être et se lève (`.colonne-formulaire`) ; elle reste pour les
      écrans qui n'ont pas encore la leur, et disparaîtra avec A9.
      **La densité bureau arrive avec, comme prévu** : la saisie passe de 48 à 38 px, et
      reprend 44 px sous 768 px — au doigt, 38 px passe sous la cible de `DESIGN.md` §11,
      exactement comme les filtres d'A4. Les boutons ne bougent pas : les 34 px des
      maquettes sont un dessin de bureau, et 44 px est un minimum tactile, pas un goût.
      Les sept paires `label`/`input` de l'écran passent au patron `Champ`, et leurs
      aides sont enfin reliées par `aria-describedby` — ce que la documentation du patron
      promettait sans qu'aucun appelant le fasse.
      **Trois écarts avec la maquette, et pourquoi.**
      1. La maquette replie le groupe résolu sur une fiche « Haojue HJ 125-11 · Changer ».
         Construit, puis retiré : la liste est un vrai groupe de boutons radio, et dans un
         groupe de boutons radio les flèches du clavier **déplacent et choisissent à la
         fois**. Une première flèche vers le bas détruisait donc le groupe sous les doigts
         de qui le parcourait, en emportant le focus (`DESIGN.md` §11) — et
         `e2e/ventes.spec.ts` l'a dit avant nous, `check()` ne trouvant plus l'élément
         qu'il venait de cocher. Ce dessin suppose une liste déroulante à recherche, que
         D72 laisse hors de S29 faute de composant accessible pour la porter.
      2. « Reste à percevoir » devient **« Reste dû »** : c'est le mot de la fiche de
         vente, du reçu et des paiements, et un même chiffre ne porte pas deux noms
         (`DESIGN.md` §12).
      3. Le châssis ne figure pas dans le récapitulatif. La moto retenue le porte déjà
         deux blocs plus haut, et un second numéro dans la même colonne se lit comme un
         autre numéro — or un seul compte ici, celui de la pièce.
      **Deux défauts trouvés sur capture, puis mesurés dans le navigateur.** La barre
      collée ne collait pas : elle restait à 64 px du bas, une ligne de saisie visible en
      dessous d'elle. Deux causes empilées, et les maquettes portent les deux sans qu'elles
      s'y voient. Un élément collant ne sort pas de son bloc conteneur, et le bloc
      conteneur d'un enfant de grille est sa **zone de grille** — une rangée à la hauteur
      exacte de la barre, donc sans un pixel de jeu : la barre est sortie de la grille. Et
      le rectangle qui retient un élément collant s'arrête à la **boîte de contenu** du
      défilement, pas à sa marge intérieure : le `pb-16` de `main` se reprend donc trois
      fois, en marge, en réserve et en `bottom` négatif. Second défaut : la barre masquait
      les deux derniers champs, qu'aucun défilement n'atteignait — d'où la réserve, posée
      sur la grille et non sur la colonne, sinon elle ouvre un trou de trois centimètres
      entre le dernier champ et le récapitulatif quand ils s'empilent à 390 px.
      **Une chose retirée** : le lien de retour « Ventes » en tête d'écran, mot pour mot
      celui de la colonne de gauche. « Annuler », dans la barre, dit la même sortie là où
      la main est déjà. Et la mention de la marge réservée au responsable (D2) descend du
      titre au prix, là où la question se pose.
- [x] **A6 Ventes** — tableau + `FicheVente` en panneau latéral, la liste reste visible.
      Le patron `PanneauLateral` naît ici, avec `AvecPanneau` (la disposition), `TitrePanneau`
      (le filet plutôt qu'un cadre : dans 420 px, six cadres emboîtés font une pile de
      boîtes) et `Faits` / `Fait` (l'identité, puis les faits, la forme des maquettes).
      **La souche arrive avec.** D70 avait rétrogradé la plaque en signal pur et promis une
      autre signature — le numéro de pièce dessiné comme le talon qu'on arrache du carnet.
      Elle n'existait que dans les maquettes ; elle est en tête du panneau, crantée par un
      masque CSS qui tient à l'impression et suit la couleur de la surface. Ni jaune ni
      plaque : le numéro complet n'est pas un code boutique, et seules les trois lettres de
      tête se détachent — en gris, pas en jaune, sans quoi ce serait un troisième emploi.
      **La fiche cesse d'être une page.** Elle portait un `h1` au nom du client ; l'écran
      n'en a plus qu'un, « Ventes », et le panneau est un `complementary` nommé
      « Vente <numéro> ». Quatre assertions bout en bout visaient ce titre de niveau 1 et
      visent désormais le repère — mises à jour dans le même commit (`CAHIER-UI.md` §12),
      comme deux libellés qui ont changé avec la fiche : « Remise au client : Oui, le … »,
      qui était une ligne de faits, s'écrit en toutes lettres au même endroit que la phrase
      disant l'inverse tant que la moto reste au magasin ; et le lien du reçu d'un versement
      s'appelle « Reçu <numéro> » et non plus « Reçu », parce qu'un nom accessible doit dire
      où il mène et qu'une suite de chiffres ne le dit pas.
      **Trois écarts avec la maquette, et le rendu réel les a dictés tous les trois.**
      1. Le seuil des deux colonnes se mesure sur la **zone de travail**, pas sur la
         fenêtre. La maquette bascule à 1152 px de fenêtre ; à 1280 px la coquille en prend
         296, il en reste 944 pour un panneau de 420 et un tableau de sept colonnes, et
         « Paiement » sortait à moitié du cadre — vu sur capture, puis mesuré. La même
         fenêtre, colonne repliée, laisse 1104 px et le couple respire. C'est donc une
         requête de conteneur : replier la colonne des écrans (Ctrl B) fait apparaître la
         fiche à côté de sa liste, ce qui est le geste qu'un repli doit récompenser.
      2. **Sous le seuil, le panneau remplace la liste au lieu de s'empiler dessous.** Les
         maquettes les empilent, ce qui tient avec leurs sept lignes ; avec deux cents
         ventes, ouvrir une fiche demanderait de faire défiler toute la liste pour
         l'atteindre (`DESIGN.md` §6). La liste est masquée, pas démontée : la recherche et
         les filtres sont un état, et on les retrouve en fermant le panneau.
      3. **C'est le corps du panneau qui défile**, comme le tableau d'à côté depuis A4. Le
         panneau simplement collant des maquettes suffit à leurs huit lignes de faits ; la
         vraie fiche porte le dossier, les versements, le formulaire d'encaissement et la
         marge, dépasse la hauteur de l'écran, et un panneau collant plus haut que la
         fenêtre ne colle plus — le pied d'actions partait avec le reste.
      **Ce que le tableau a gagné, et ce qu'il a rendu.** Six colonnes — pièce, client,
      moto, mode, reste dû, paiement — plus « Boutique » quand le périmètre est « toutes »,
      comme en A4. Le châssis y a figuré une capture durant, puis en est sorti : dix-sept
      caractères en Plex Mono insécables poussaient le tableau au-delà de la place que le
      panneau lui laisse. La recherche l'accepte toujours, et le panneau le montre. L'état
      du dossier quitte aussi la ligne pour le panneau (`resumerDossier`) : le tableau dit
      ce qui se compare d'une vente à l'autre, le panneau ce sur quoi on agit.
      Il reste, à 1440 px et pour le responsable seul — c'est lui qui a la colonne
      « Boutique » —, vingt-quatre pixels de débordement mesurés sur des noms de modèles
      de trente-trois caractères, que les émulateurs fabriquent et que le métier n'écrit
      pas (« Haojue HJ 125-11 » en fait seize). La zone défile, donc la colonne reste
      **atteignable** : c'est la leçon d'A4, et elle a tenu.
      **Ce qui a été retiré.** Les liens « Paiements » et « Reçus » en tête d'écran, mot
      pour mot ceux de la colonne de gauche — même raison qu'en A4. Et les trois cadres
      empilés de la fiche — l'argent, la moto, le client, quatre lignes chacun — qui sont
      une seule liste de faits : dans 420 px, trois cadres font une pile de boîtes.
      **`PanneauRecu` n'a pas été converti, et c'est un écart à la spec.** Deux raisons.
      Il n'y a **aucune maquette validée** de l'écran des reçus — le groupe A n'en contient
      pas, et `c4-recu.html` est un aperçu du papier, pas de l'écran : le convertir, c'est
      dessiner de mémoire, ce que ce chantier s'interdit. Et le reçu est un document de
      format A5, soit 560 px : le poser dans un panneau de 420 le comprimerait au lieu de
      le montrer. Le patron existe désormais et l'attend ; ce qui manque est une maquette à
      confronter, pas du code.
- [x] **A7 Dossiers en attente** — qui détient quel papier, et ce qui est en retard. Le
      relais des quatre documents avance sans recharger la page.
      **Une colonne par document.** L'écran empilait des cartes qui listaient, en petites
      lignes grises, les seuls documents encore en cours d'une vente. La question posée —
      qui détient quel papier — se compare d'un dossier à l'autre : elle se range en
      colonnes. Les quatre y sont désormais, réglés compris, parce que c'est en voyant les
      trois premiers remis qu'on comprend qu'il ne manque que le quatrième. La colonne
      « Chez qui, depuis » nomme le plus ancien dépôt — celui dont le délai s'allonge, pas
      celui qu'on vient de confier — et compte les jours de jour à jour, comme
      `estEnRetard` : un dépôt du matin se dit « aujourd'hui », pas « 0 jour ».
      **Le relais naît, et c'est le geste qui manquait.** Cliquer un document ouvre son
      parcours sous la file : les trois ou quatre étapes du déplacement physique du papier
      entre le magasin, le prestataire et le client, et le geste suivant. Il fallait
      auparavant ouvrir la vente pour faire avancer un document, c'est-à-dire quitter la
      file qu'on est en train de vider. C'est le seul endroit du produit où une suite
      numérotée est légitime (`DESIGN.md` §6) : l'ordre y porte une information vraie.
      **La machine à états n'existe plus qu'une fois.** `components/GestesDocument.tsx` est
      né de l'extraction : la fiche d'une vente et la file des dossiers proposent les mêmes
      gestes, tirés de `statutsSuivants`, et un chemin autorisé ici mais refusé là serait un
      défaut invisible jusqu'au jour où le serveur tranche (D65, D27). Le formulaire de
      dépôt y est passé au patron `Champ` au passage.
      **Trois écarts avec la maquette.**
      1. **Aucun bouton grisé.** La maquette grise « Remettre au client » et ajoute une
         phrase sous les boutons pour dire ce qu'il attend. Le relais le dit déjà, et
         mieux : l'étape « Revenu au magasin » est là, en gris, juste avant. Un bouton
         grisé invite à chercher ce qui le débloquerait ; une étape qui reste à franchir
         dit où le chercher. C'est aussi la règle que S11 s'était donnée.
      2. **Sous 1024 px, le relais remplace la file** au lieu de s'ajouter dessous — même
         raison qu'en A6 : avec quarante dossiers repliés en cartes, il faudrait dérouler
         tout l'écran pour atteindre le papier qu'on vient de choisir. La file est masquée,
         pas démontée : la recherche et le filtre sont un état, et on les retrouve en
         fermant. Sous 768 px, le relais lui-même se lit de haut en bas — quatre colonnes de
         90 px coupent « Chez le prestataire » en trois lignes.
      3. **Les listes déroulantes « Prestataire » et « Document » ont disparu**, remplacées
         par la recherche des maquettes (numéro, client, prestataire) et par les trois
         questions qu'on pose vraiment à une file : en retard, chez un prestataire, à
         remettre. La seconde liste n'avait plus lieu d'être — les quatre documents ont
         chacun leur colonne ; la première est dans la recherche, qui accepte le nom du
         prestataire recopié sur le document.
      **Quatre défauts trouvés sur capture, dont un vrai.** Cliquer une carte grise en
      marquait **quatre** — celles de toutes les lignes — et ouvrait le relais de la
      première venue : un document vit en `ventesMotos/{venteId}/documents/{type}`, son
      identifiant est donc « carte_grise », le même pour toutes les ventes du monde. La
      sélection porte désormais sur le couple vente + type. Les trois autres tenaient à la
      forme : le pavé du tableau s'étirait sur toute la hauteur réservée quand la file était
      courte, poussant le relais au ras du bas de l'écran (la grille est bornée en
      `max-height`, plus figée en `height`) ; à 1280 px, colonne dépliée, le numéro de pièce
      se cassait en trois lignes (il est insécable, et c'est la zone de défilement qui absorbe
      le débordement, comme en A4) ; et un dépôt du matin s'affichait « 0 jour », là où l'on
      dit « aujourd'hui ».
      **Deux choses ont été retirées.** Le comptage répétait « · N en retard » sous l'avis qui
      venait de le dire ; et « aucune date annoncée » s'écrivait sous l'étape de retour d'une
      quittance, qui ne passe chez personne et pour laquelle nul n'a jamais promis de date.
      Reste une redondance non traitée, parce qu'elle dépasse cet écran : la colonne
      « Boutique » répète les trois premières lettres du numéro de pièce, en A6 comme en A7,
      et c'est un pavé jaune de plus (D70). En A4 elle est nécessaire — une moto n'a pas de
      numéro de pièce. À trancher pour les trois écrans à la fois, pas dans un commit.
      **Le défaut du dépôt de dossier s'est reproduit, et il se nomme.** `e2e/dossier.spec.ts`
      « le cycle complet » échoue encore : après un dépôt, le formulaire reste ouvert et le
      gérant lit `PERMISSION_DENIED: false for 'create' @ L161, evaluation error at
      L835:24…`. Le cache local a écrit « Chez le prestataire » que le serveur refuse. C'est
      le défaut déjà relevé en S28, il appartient à `lib/repositories/dossier.ts` et demande
      sa propre spec — pas la refonte.
- [x] **A8 Paiements** — **deux sections séparées et nommées** : Dettes (crédit) et Tranches
      (moto retenue). Jamais mêlées dans un même tableau.
      **Elles sont désormais visibles en même temps, et c’est là tout le changement.** L’écran
      les rangeait derrière trois boutons dont un seul était pressé à la fois : on ne pouvait
      pas les confondre, mais on ne pouvait pas non plus voir la différence — et c’est la voir
      qui l’enseigne. Chaque section porte son titre, son total, et la phrase des maquettes qui
      dit où est la moto : partie avec le client, donc il doit cet argent ; ou retenue au
      magasin, donc le magasin détient l’argent et ce n’est pas une dette. Les deux tableaux
      n’ont pas le même vocabulaire non plus — « Déjà versé / Reste dû » d’un côté,
      « Détenu / Reste à percevoir » de l’autre —, et c’est voulu (§13).
      **La troisième liste a disparu.** « Tranches inactives » était un tri de la deuxième :
      l’information vit maintenant dans la colonne État de chaque ligne (« Aucun versement
      depuis 60 jours »), dans le filet rouge qui marque la ligne, et dans le comptage en tête
      de section. Une liste dont chaque élément se lit déjà dans une autre n’est pas une liste.
      Le patron `Tableau` gagne pour cela un crochet `enRetard` — la règle `.ligne-retard`
      posée en A7 n’en avait aucun et ne s’appliquait nulle part ; A7 l’utilise désormais aussi.
      **Deux écarts avec la maquette, tous deux dictés par le rendu.**
      1. **« Prix convenu » n’a pas de colonne.** Il vaut exactement « déjà versé + reste dû »,
         et sa colonne poussait « Action » entièrement hors du cadre à 1280 px, colonne des
         écrans dépliée — vu sur capture. Un geste qu’on ne voit pas est un geste qui n’existe
         pas. Il se lit sur la fiche, à un clic.
      2. **« Échu depuis 55 jours » n’existe pas.** La maquette le montre sur une dette ; le
         domaine n’a aucune date d’échéance pour un crédit, et le seuil d’inactivité réglable
         est explicitement celui des tranches (§6.3, §14). L’État d’une dette dit donc ce
         qu’on sait — impayée ou partiellement payée — et la colonne « Dernier versement »
         dit à quelle date le client a versé pour la dernière fois — c’est de là que se lit le
         silence, et les lignes sont triées de la plus ancienne vente à la plus récente.
      **La bande d’explication a dû changer de surface.** La maquette la pose sur `--fond`,
      qui est ici le sol de la page : elle y était littéralement invisible, en clair comme en
      sombre. Elle prend le papier et un filet, comme tout ce qui se détache du sol.
      Reste, à 1280 px et pour le responsable seul — c’est lui qui a la colonne « Boutique » —,
      une vingtaine de pixels de débordement sur le tableau des dettes, mesurés sur des noms de
      modèles de trente caractères que les émulateurs fabriquent et que le métier n’écrit pas.
      La zone défile : la colonne reste atteignable, comme en A4 et A6.
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

*A5 a levé la moitié de cette dette, et voici où passe la ligne.* **La hauteur est une
règle CSS unique, et elle est posée** : tous les formulaires du dépôt sont à 38 px depuis
A5, qu'ils emploient le patron ou non. Il ne reste donc plus deux passes à craindre — un
écran qui convertit ses paires plus tard ne repose rien. Chaque écran de S29 prend donc les
siennes dans son propre commit, comme A5 a pris les sept de la vente ; A9 balaie ce qui
n'appartient à aucun des neuf, c'est-à-dire les six écrans de réglages. Restent en dehors
des neuf, et donc sans commit qui les porte : `/motos/nouvelle` (douze paires) et
`/clients` (une). Ils ont la densité ; ils n'ont ni le patron ni la colonne.

**La colonne des écrans de formulaire reste à tenir.** En retirant `max-w-3xl`, S28 a rendu
la zone de travail à sa largeur — ce qu'il fallait pour les listes, et ce qui a étiré les
champs de saisie sur 950 px. Le patron `.saisie` les borne à 32 rem, ce qui répare le pire,
mais la carte qui les contient s'étend toujours sur toute la largeur : un titre « Ajouter un
prestataire » et son bouton flottent aux deux bouts d'une bande vide. A5 et A9 tiennent la
colonne entière, pas seulement les champs.

*A5 l'a tenue, et le patron `Formulaire` la porte pour A9.* La borne de 32 rem sur `.saisie`
survit exactement jusque-là : c'est elle qui empêche les écrans de réglages de s'étirer d'ici
leur tour, et la ligne qui la pose dit qu'A9 pourra la retirer.

**Le corps du produit est resté à 16 px, et ce n'est pas A5 qui peut en décider.** Les
maquettes posent un corps à 14 px — c'est l'autre moitié de la densité bureau, et le patron
`Page` de S28 annonce qu'elle « arrive avec S29 ». Elle n'est pas arrivée avec A5 : une
taille de corps se change dans `body`, donc sur les vingt écrans d'un coup, dans un commit
qui en nomme un seul. C'est le même genre de question que l'écart de coquille entre 768 et
1024 px relevé en A4, et elle se tranche au même endroit : avec le commanditaire, sur un
écran regardé, pas au détour d'un formulaire.

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
