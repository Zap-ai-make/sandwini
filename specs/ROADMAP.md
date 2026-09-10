# ROADMAP — Source de vérité de la progression

Découpage du cahier des charges (`prompt.md`) en specs vérifiables, selon `WORKFLOW.md` §3.
Une spec = une capacité autonome et testable. Le détail de chaque spec MVP vit dans `specs/S<n>-<slug>.md`.

Les specs post-MVP sont listées ici avec leur périmètre et leurs dépendances ; leur fiche complète
est rédigée au moment où elles sont prises en charge (`WORKFLOW.md` §7), pour ne pas figer un détail
qui aura changé d'ici là.

---

## Ligne MVP

Le MVP est le moins qui délivre la valeur centrale : **enregistrer une vente de moto au comptoir sans
réseau, savoir ce qui reste dû, et savoir où en est chaque document du dossier.**

Tout ce qui sert le confort, le pilotage ou un second métier (pièces détachées) est post-MVP.

| ID  | Spec                                          | Dépend de        | Périmètre | Statut  |
|-----|-----------------------------------------------|------------------|-----------|---------|
| S1  | Socle technique et coquille applicative       | aucune           | MVP       | terminée |
| S2  | Authentification, rôles et utilisateurs       | S1               | MVP       | terminée |
| S3  | Boutiques et sélecteur de périmètre           | S2               | MVP       | terminée |
| S4  | Référentiels et paramètres entreprise         | S3               | MVP       | terminée |
| S5  | Stock motos — entrée et consultation          | S4               | MVP       | terminée |
| S6  | Clients — recherche et création               | S3               | MVP       | terminée |
| S7  | Numérotation hors-ligne des pièces comptables | S3               | MVP       | terminée |
| S8  | Vente de moto — enregistrement                | S5, S6, S7       | MVP       | terminée |
| S9  | Versements et suivi des paiements             | S8               | MVP       | terminée |
| S10 | Reçus imprimables hors-ligne                  | S8, S9           | MVP       | terminée |
| S3bis | Les trois espaces — métiers et supervision   | S3               | MVP       | terminée |
| S11 | Dossier documents — cycle de vie et suivi     | S4, S8           | MVP       | terminée |
| S12 | Règles Firestore — durcissement et tests      | S1 → S11         | MVP       | terminée |

**MVP gate** (`WORKFLOW.md` §6) après S12 : démonstration, checklist `SECURITY.md` §13, feu vert
avant toute spec post-MVP.

---

## Backlog post-MVP, ordonné par valeur

| ID  | Spec                                          | Dépend de   | Pourquoi ce rang |
|-----|-----------------------------------------------|-------------|------------------|
| S13 | Lien de suivi client — page `/suivi/[token]`  | S11         | Le différenciateur vis-à-vis du client ; inutile tant que les statuts documents ne vivent pas (S11). |
| S14 | Messages WhatsApp paramétrables               | S13         | Sans le lien de S13, il n'y a presque rien à envoyer. |
| S15 | Prestataires — token et page `/prestataire`   | S11         | Décharge le gérant de la relance ; le circuit fonctionne sans, à la main. |
| S16 | CMC — stock, attribution, remise              | S11         | Le document `cmc` suit déjà son cycle sans gestion du stock physique de cartes. |
| S17 | Transferts de motos entre boutiques           | S5          | Utile dès qu'il y a plusieurs boutiques actives. |
| S18 | Échanges / reprises                           | S8          | Cas de vente fréquent mais contournable (vente + entrée en stock séparées). |
| S19 | Envois de fichiers — photos et papiers        | S5          | Débloqué par D66 : un champ d'envoi peut exister s'il annonce qu'il demande du réseau. Reste une spec à part parce qu'une file d'attente locale, elle, est un vrai chantier (D14). |
| S20 | Pièces — catalogue, stock et mouvements       | S4          | Second métier entier ; n'empêche pas de vendre des motos. |
| S21 | Pièces — vente au comptoir et alertes rupture | S7, S10, S20| Suite immédiate de S20. |
| S23 | Inventaires motos et pièces + comparaison     | S5, S20     | Exercice périodique, pas quotidien. |
| S25 | Annulation et correction de vente, et d'un versement | S9    | Opération sensible, cf. `DECISIONS.md` D10 et D58. S9 y a renvoyé la correction d'un versement : même appareillage d'historique. |
| S26 | Motos de confrère                             | S8          | Cas de vente marginal (`prompt.md` §8). |
| S27 | Reconnexion immédiate au retour du réseau     | aucune      | La file d'écritures repart quand le SDK a fini son attente croissante — jusqu'à une minute après le retour du signal. D66 fait baisser son rang côté produit ; il reste haut côté vérification, où ce défaut rend la suite bout en bout bruitée (D50, D55). **Mesuré en S31** : 9 échecs sur émulateurs vieillis, 6 sur émulateurs neufs, 2 en rejouant ces six, 0 en rejouant ces deux. L'ensemble qui échoue change à chaque passe ; aucun test n'échoue deux fois de suite. **Remesuré en S24** : 83 passés, 4 échoués sur une suite complète de 29 min — les quatre en expiration *dans le décor*, aucun sur une assertion. Trois passent au rejeu sur émulateurs neufs ; le quatrième, qui avait échoué deux fois, passe en **7,1 s lancé seul** contre un budget de 180 s épuisé en suite chargée. Le rapport n'est pas marginal : ce n'est pas une assertion lente, c'est la file d'écritures qui étouffe sous la contention. Qui prendra S27 doit chercher là. |
| S32 | Recherche globale — motos, ventes, clients     | aucune      | La palette du bandeau ne cherche que des écrans ; les maquettes lui font chercher des choses. Demande un index consultable hors ligne, ce qui en fait une spec et non une ligne : relevé pendant S31, sans être codé. |
| S33 | Renommer le nom affiché sur les reçus          | aucune      | `a9:180-191` fait de « Votre compte » une carte « Mon nom affiché » : le nom qui s'imprime au bas des reçus remis. Le produit ne sait pas renommer un compte (D72) — c'est une écriture et une règle, pas un habillage. |
| S34 | Le numéro de version, visible au comptoir      | aucune      | Le produit n'expose aucune version (A1.3). Quand un gérant décrit un comportement au téléphone, rien ne dit ce qui tourne sur son appareil — et une PWA garde son ancienne version jusqu'à ce que le service worker passe la main. Petit, mais c'est ce qui rend un rapport de défaut exploitable. |
| S35 | Le nom du client dans le journal de caisse | S22 | La maquette `c2` montre une colonne « Qui » avec le nom du client ; un encaissement ne le contient pas. Deux voies : joindre ventes et clients à la lecture (deux écoutes de plus pour une colonne), ou l'écrire dans le libellé à l'encaissement, ce qui touche S8 et S9 et ne vaudra que pour les mouvements à venir. Rien d'urgent : le libellé porte déjà le numéro, qui est ce qu'on rapproche d'un papier. Trouvé par la suite bout en bout de S22 (D84). |

---

## Chantier de refonte d'interface

Cadré par `CAHIER-UI.md`, pas par `prompt.md` : ce n'est pas une fonctionnalité de plus, c'est la
forme qui rend les douze specs livrées évidentes. La phase 1 (maquettes statiques) a été validée
par le commanditaire ; la phase 2 s'exécute comme deux specs normales.

| ID  | Spec                                              | Dépend de | Périmètre | Statut  |
|-----|---------------------------------------------------|-----------|-----------|---------|
| S28 | Refonte de l'interface — jetons, coquille, patrons | S12       | post-MVP  | terminée |
| S29 | Refonte de l'interface — les écrans                | S28       | post-MVP  | terminée |
| S31 | Mise en conformité — marque, coquille, états       | S29       | post-MVP  | terminée |

La coupure entre les deux n'est pas administrative : à la fin de S28 l'application tourne dans la
nouvelle coquille avec ses écrans d'aujourd'hui. Le défaut n°1 du diagnostic — le rail vide et le
`max-w-3xl` — est corrigé et déployable **avant** qu'un seul écran métier soit réécrit. Si le
chantier devait s'arrêter là, le produit y aurait déjà gagné.

S31 s'ajoute après coup, et ce n'est pas une refonte de plus : S29 a confronté chaque écran à sa
maquette sur sa **zone de travail**, jamais sur la coquille qui l'entoure ni sur la marque qui
l'habille. Ce qui n'a pas été comparé ligne à ligne ne l'a pas été. L'audit
`AUDIT-CONFORMITE-MAQUETTES.md` mesure l'écart : 48 défauts, dont trois transverses aux neuf
écrans. S24 était la moitié qui coûte comme une fonctionnalité ; elle est livrée depuis.

S31 est fermée. Elle a repris la marque (le monogramme et ses deux dégradés, le jaune ramené à ses
deux emplois), la coquille (les groupes nommés de la colonne, les deux pieds, la bascule de thème),
le sur-titre des neuf écrans, les états, les deux formes d'A2 et d'A3, A9, A4 et le reçu. Trois
défauts qu'aucun diff ne montrait sont sortis sur capture : une colonne tronquée, une phrase cassée
en trois, et surtout un reçu qui s'imprimait blanc sur nuit depuis une machine réglée en sombre
(D77). A2.4 et A2.8 y sont entrées en commit détachable — aucune des deux ne demandait d'agrégat
neuf. Ce qui restait « manque de données » attendait S24, sans se déguiser en carte à zéro (D63). S24 l'a rempli.


## Post-MVP livré, hors refonte

| ID  | Spec                                          | Dépend de | Périmètre | Statut   |
|-----|-----------------------------------------------|-----------|-----------|----------|
| S24 | Supervision — les chiffres toutes boutiques   | S9, S11   | post-MVP  | terminée |
| S22 | Caisse — journal du jour et clôture           | S8, S9, S11 | post-MVP  | terminée |

S24 est fermée. Elle remplit ce que D63 réservait : la supervision avait sa
section depuis S3bis et sa forme depuis S31, il lui manquait ses nombres. Quatre
cartes, deux répartitions, douze mois au choix ; un mois vide s'écrit en une
phrase plutôt qu'en quatre zéros alignés.

**Six questions ont précédé la première ligne de code, parce qu'aucune n'était
technique.** Le commanditaire en a tranché trois — la marge entière au mois de
la vente, créances et dépôts séparés, l'encaissé brut. Les trois autres portent
sur la portée et sont **prises par défaut**, marquées comme telles dans la spec
et chacune réversible en un commit : douze mois offerts, aucun chiffre pour le
gérant, et une phrase pour un mois vide. Chaque arbitrage est figé par un test
qui le nomme, de sorte qu'on ne le change pas sans le voir.

**Le calcul se fait à la lecture, sur les collections déjà écoutées** : aucun
agrégat entretenu par déclencheur, donc rien qui puisse diverger de ce dont il
est tiré, et l'écran continue de fonctionner hors ligne (D61). Le seuil où ce
choix cesse d'être bon — environ 20 000 ventes — est écrit dans la spec pour
être connu d'avance plutôt qu'improvisé.

**Ce que la suite bout en bout a trouvé, et qu'aucune relecture n'aurait vu.**
La carte de marge restait à « — » après une vente. La marge était pourtant
dans la base. `getDoc` levait `unavailable` — le document n'était pas en cache
et la connexion était encombrée par la file d'écritures — et le code rangeait
cet échec avec « pas de marge », perdant le chiffre jusqu'au rechargement
suivant. C'est l'ordinaire du comptoir, pas un cas de bord. D82 en tire la
règle et le corollaire : un test qu'on rend patient sans l'avoir compris efface
ce qu'il venait de trouver.

**Reste au backlog** la variante de la question 5 : les mêmes chiffres bornés à
sa boutique pour le gérant, marge exclue. Elle n'a pas été demandée.


S22 est fermée. Le journal d'une journée — ce qui entre, ce qui sort, par quel
moyen — et la clôture qui compare les espèces attendues au comptage du soir.
Les mouvements existaient depuis S8 : cette spec les lit, ajoute la sortie
d'espèces et le document de clôture, et rien d'autre.

**Six questions posées avant la première ligne, six réponses rendues.** Fonds
reporté de la veille, dépenses enregistrées — c'est la réponse au point ouvert
n° 3 du cahier des charges, resté sans réponse depuis le début —, le gérant
clôture, une journée oubliée se ferme seule, un écart demande un motif au-delà
d'un seuil, et la caisse est toujours celle d'une boutique.

**La quatrième allait contre ma recommandation, et c'est elle qui a produit la
décision.** Une journée fermée seule n'a pas un écart nul : elle n'a pas
d'écart. D83 dit pourquoi, et deux règles Firestore le tiennent au lieu d'un
commentaire.

**Ce que la vérification a trouvé, et qu'aucune relecture n'aurait vu.** Le
journal affichait un identifiant Firestore à la place d'un numéro de pièce, et
répétait le numéro de vente dans la colonne du client. La capture d'écran ne
l'avait pas montré — le script de semis écrivait ce que la maquette montrait,
pas ce que le produit écrit. C'est D84, et c'est la leçon la plus coûteuse de ce
lot : confronter un écran à sa maquette ne remplace pas de le confronter à ses
données.

**Une question du commanditaire reste ouverte, et elle porte sur le fond** :
« je ne comprends même pas ce qu'est une clôture, il n'y a rien à clôturer ».
Si personne ne compte le tiroir le soir, la clôture est un écran que personne
n'ouvrira, et c'est le journal seul qui sert. Le retirer coûterait bien moins
que ne l'aurait coûté de l'ajouter après coup : le panneau se cache, le domaine
et les règles restent. La décision appartient au comptoir, pas au code.

---

---

## Défauts ouverts

Un défaut qui survit à la spec qui l'a produit devient une spec à lui : il a un symptôme daté, des
critères d'acceptation, et il se ferme comme les autres. Le laisser vivre en note de bas de rapport,
c'est le voir revenir sous un autre nom.

| ID  | Spec                                              | Touche | Périmètre | Statut  |
|-----|---------------------------------------------------|--------|-----------|---------|
| S30 | Le dépôt chez un prestataire ne se termine jamais | S11    | MVP       | terminée |

S30 est fermée : l'écran attendait l'accusé de réception du serveur avant de rendre la main, ce qui
hors ligne n'arrive jamais. Les règles Firestore n'y étaient pour rien — le diagnostic de départ les
accusait, et il était faux. La leçon est en D76.

---

## Ce que le MVP ne fait volontairement pas

Espace pièces détachées · inventaires · caisse et clôture · pages publiques
client et prestataire · WhatsApp · échanges et reprises · transferts inter-boutiques · stock de CMC ·
photos de motos · annulation de vente.

Chacun de ces manques est une entrée du backlog ci-dessus, pas un oubli.
