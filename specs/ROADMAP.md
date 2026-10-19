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
| S13 | Lien de suivi client — page `/suivi/[token]`  | S11, S56    | Le différenciateur vis-à-vis du client. **S56 a construit toute la mécanique** : jeton de 32 octets émis par fonction, règle qui l'accepte sans laisser un navigateur l'écrire, fonction HTTP seule porte, page publique rendue côté serveur. Il reste à décider **ce qu'un client voit** — ce qui est une question de métier, pas d'architecture. |
| S14 | Messages WhatsApp paramétrables               | S13         | Sans le lien de S13, il n'y a presque rien à envoyer. |
| S15 | Prestataires — token et page `/prestataire`   | S11         | **Livrée le 16 octobre 2026 par S56**, sous le nom `/suivi/[jeton]`. Le token annoncé ici depuis le cahier des charges existe enfin, produit par une Cloud Function. |
| S16 | CMC — stock, attribution, remise              | S11         | Le document `cmc` suit déjà son cycle sans gestion du stock physique de cartes. |
| S17 | Transferts de motos entre boutiques           | S5          | **Livrée le 8 octobre 2026** — en un seul geste, Q7 renversée. Les pièces détachées restent à faire. |
| S18 | Échanges / reprises                           | S8          | Cas de vente fréquent mais contournable (vente + entrée en stock séparées). |
| S19 | Envois de fichiers — photos et papiers        | S5          | Débloqué par D66 : un champ d'envoi peut exister s'il annonce qu'il demande du réseau. Reste une spec à part parce qu'une file d'attente locale, elle, est un vrai chantier (D14). |
| S21 | Pièces — vente au comptoir et alertes rupture | S7, S10, S20| Suite immédiate de S20. **En cours** : le domaine, les règles, le dépôt, l'écran de vente et la carte d'alerte sont livrés ; le reçu et le bout en bout restent. Voir `specs/S21-vente-pieces.md`. |
| S23 | Inventaires motos et pièces + comparaison     | S5, S20     | Exercice périodique, pas quotidien. |
| S25 | Annulation et correction de vente, et d'un versement | S9    | Opération sensible, cf. `DECISIONS.md` D10 et D58. S9 y a renvoyé la correction d'un versement : même appareillage d'historique. |
| S26 | Motos de confrère                             | S8          | Cas de vente marginal (`prompt.md` §8). |
| S27 | Reconnexion immédiate au retour du réseau     | aucune      | La file d'écritures repart quand le SDK a fini son attente croissante — jusqu'à une minute après le retour du signal. D66 fait baisser son rang côté produit ; il reste haut côté vérification, où ce défaut rend la suite bout en bout bruitée (D50, D55). **Mesuré en S31** : 9 échecs sur émulateurs vieillis, 6 sur émulateurs neufs, 2 en rejouant ces six, 0 en rejouant ces deux. L'ensemble qui échoue change à chaque passe ; aucun test n'échoue deux fois de suite. **Remesuré en S24** : 83 passés, 4 échoués sur une suite complète de 29 min — les quatre en expiration *dans le décor*, aucun sur une assertion. Trois passent au rejeu sur émulateurs neufs ; le quatrième, qui avait échoué deux fois, passe en **7,1 s lancé seul** contre un budget de 180 s épuisé en suite chargée. Le rapport n'est pas marginal : ce n'est pas une assertion lente, c'est la file d'écritures qui étouffe sous la contention. Qui prendra S27 doit chercher là. |
| S32 | Recherche globale — motos, ventes, clients     | aucune      | La palette du bandeau ne cherche que des écrans ; les maquettes lui font chercher des choses. Demande un index consultable hors ligne, ce qui en fait une spec et non une ligne : relevé pendant S31, sans être codé. |
| S36 | Appliquer une version en attente sans fermer l'application | S34 | Le produit annonce la version prête, et dit d'aller la chercher en fermant puis rouvrant. Le bouton qui la prendrait sur place a été écrit et retiré : mesuré en S34, `skipWaiting` ne se résout jamais tant qu'un écran est ouvert — les écoutes Firestore gardent la version active occupée, et un rechargement complet n'y change rien. La piste non vérifiée est de fermer les écoutes (`disableNetwork`) avant d'envoyer le message. Petit confort : sans lui, la version arrive quand même à la réouverture. D85 porte les quatre mesures. |
| S33 | Renommer le nom affiché sur les reçus          | aucune      | `a9:180-191` fait de « Votre compte » une carte « Mon nom affiché » : le nom qui s'imprime au bas des reçus remis. Le produit ne sait pas renommer un compte (D72) — c'est une écriture et une règle, pas un habillage. |
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
| S22 | Caisse — le journal du jour                   | S8, S9, S11 | post-MVP  | terminée |
| S34 | Le numéro de version, visible au comptoir     | aucune    | post-MVP  | terminée |
| S39 | Déclarer moins pour saisir mieux               | S4, S5    | post-MVP  | terminée |
| S20 | Pièces — catalogue, stock et mouvements        | S4        | post-MVP  | terminée |

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

**La question de fond a été tranchée, et elle a retiré un tiers du lot.**
« Pas de fermeture ni d'ouverture » : personne ne compte le tiroir, et aucun
événement d'ouverture n'existera. Le panneau de clôture, le report du fonds et
la fermeture automatique des journées oubliées quittent l'écran ;
`ClotureCaisse.tsx` est supprimé. Le domaine, ses tests, le dépôt et les règles
Firestore n'ont pas bougé — les 388 tests d'unité passent sans qu'une ligne
change.

Ce que ça coûte est la mesure qui compte, et elle est en D87 : **un lot
construit domaine d'abord, règles ensuite, écran en dernier se laisse amputer
au dernier étage.** La question avait bien été posée avant la première ligne de
code ; elle n'a reçu sa réponse utile qu'une fois l'écran sous les yeux. Ce
n'est pas un échec de la méthode, c'est sa limite — et c'est la méthode qui a
rendu la mauvaise réponse bon marché.

---
S34 est fermée. Le produit sait dire ce qui tourne : « SDI · version 1 » en pied
de connexion comme le demande `a1:25`, et la version, la date de compilation et
l'empreinte courte dans « Cet appareil ». Les trois voyagent dans le paquet et
se lisent **réseau coupé** — c'est l'écran qu'on ouvre quand plus rien ne
marche, il ne peut rien aller chercher.

**Cinq questions ont précédé la première ligne de code, cinq réponses rendues**,
toutes conformes aux recommandations. Le premier numéro est 1 et non 20 : le
produit a connu une vingtaine de lots, mais aucun ne s'annonçait, et « aucun
numéro affiché » devient l'information exacte *plus ancien que la version 1*.

**La cinquième question touchait un comportement déjà en production**, et c'est
elle qui a produit la décision. Le service worker déclarait `skipWaiting: true` :
une version fraîchement déployée reprenait la main sur les onglets ouverts, et
le morceau de code suivant — une navigation, un panneau — était cherché dans un
cache où l'ancien fichier n'existait plus. L'échec tombait exactement sur le
geste, donc en pleine saisie. D85 en tire la règle : D76 dit qu'un geste au
comptoir n'attend jamais le serveur ; il n'est jamais rattrapé par lui non plus.

**Ce que la vérification a trouvé, et qu'aucune relecture n'aurait vu.** Le
bouton « Recharger maintenant » ne pouvait pas tenir sa promesse. Quatre mesures
l'établissent : le message arrive bien au worker en attente, mais `skipWaiting`
ne se résout jamais tant qu'un écran de l'application est ouvert — ses écoutes
Firestore gardent la version active occupée — et un rechargement complet n'y
change rien. Le même message depuis `/login`, sans session, active la nouvelle
version immédiatement. L'écran dit donc ce qui marche vraiment (fermer
l'application, la rouvrir) et il n'y a pas de bouton : un bouton qui ne fait
rien n'échoue pas bruyamment, il apprend à ne plus croire l'écran.

**Et le premier test de non-régression ne testait rien** : il cherchait la chaîne
`SKIP_WAITING` dans le worker servi, où elle est présente dans les deux
réglages. Il passait à l'endroit comme à l'envers. C'est en le vérifiant en sens
inverse (D79) qu'on s'en est aperçu — et c'est cette vérification qui a mis au
jour tout ce qui précède.

**Reste au backlog** le bouton de rechargement, avec sa mesure et sa piste
(fermer les écoutes Firestore avant d'envoyer le message, non vérifié).



---

## Défauts ouverts

Un défaut qui survit à la spec qui l'a produit devient une spec à lui : il a un symptôme daté, des
critères d'acceptation, et il se ferme comme les autres. Le laisser vivre en note de bas de rapport,
c'est le voir revenir sous un autre nom.

| ID  | Spec                                              | Touche | Périmètre | Statut  |
|-----|---------------------------------------------------|--------|-----------|---------|
| S30 | Le dépôt chez un prestataire ne se termine jamais | S11    | MVP       | terminée |
| S37 | Le reçu attend une phrase que D81 lui a retirée   | S10    | post-MVP  | terminée |

| S38 | La console signale un écart d'hydratation à chaque chargement | S28 | post-MVP | terminée |
| S40 | Le contrôle d'unicité répond avant de savoir | S5, S20, S39 | post-MVP | terminée |
| S27 | La suite bout en bout rend un verdict qu'on peut croire | aucune | post-MVP | terminée |
| S41 | Le second lecteur ne voit pas une sortie de caisse déjà publiée | S22, S27 | post-MVP | **ouverte** |
| S42 | L'arrivage : faire entrer un lot de motos d'un même fournisseur | S4, S5, S39, S40 | post-MVP | terminée |
| S43 | L'arrivage : l'espace de suivi d'un lot (bilan, CMC, inspection, actions) | S42, S11, S39 | post-MVP | terminée |
| S44 | La vente en modale, l'entrée moto, les réglages | S8, S6, S10, S39, S40, S42, S43 | post-MVP | terminée |
| S45 | L'erreur d'évaluation des règles est du bruit — piste écartée, preuve à l'appui | S39, S27 | post-MVP | écartée |
| S46 | Filtrer les ventes et les paiements par période | S8, S9, S44 | post-MVP | terminée |
| S47 | La carte de supervision montre les faits de son métier | S21, S24, S44 | post-MVP | terminée |
| S48 | Les paiements en une liste, la plaque quitte le dossier, le châssis se cherche | S8, S9, S11, S39 | post-MVP | terminée |
| S50 | L'historique d'un fournisseur, le bilan d'une période, l'export des motos cochées, la répartition par marque | S5, S42, S46 | post-MVP | terminée |
| S51 | La campagne de captures ne charge pas le périmètre sur les écrans de supervision | S24, S47 | post-MVP | **ouverte** |
| S52 | Modifier, couper et supprimer un compte de gérant | S2, S3 | post-MVP | terminée |
| S17 | Déplacer une moto d'une boutique à une autre, en l'historisant | S5, S3 | post-MVP | terminée |
| S53 | Les papiers d'une moto : un seul endroit par papier, et le paquet de cartes grises | S11, S30, S43, S44, S48 | post-MVP | terminée le 15 oct. |
| S54 | La supervision rend le travail aux espaces métier ; le prix d'achat se saisit sur la moto | S24, S39, S47 | post-MVP | terminée |
| S55 | L'inventaire du stock, la caisse analytique et ses postes de dépense | S22, S24, S43, S46 | post-MVP | terminée |
| S56 | Le portail du prestataire : un lien de suivi, et rien d'autre | S30, S53 | post-MVP | terminée le 16 oct., **déployée** sur `sandwini` (règles, index, fonctions) |
| S53bis | Une vente n'ouvre plus qu'un document, et c'est la carte grise | S53, S11 | post-MVP | terminée le 18 oct., **déployée** sur `sandwini` (règles) |

**S51, relevé le 8 octobre 2026.** Sur l'Inventaire (`/supervision/chiffres` alors,
`/motos/inventaire` depuis S55), `scripts/captures.mjs`
photographie un écran qui annonce « Responsable · 0 boutique » et reste indéfiniment en
« Lecture des ventes et des versements… ». Ce n'est pas l'écran : un script jetable qui ouvre
une session de la même façon, contre le même serveur et la même base, le rend complètement en
moins de trois secondes, périmètre et deux boutiques compris. L'émulateur porte bien les deux
boutiques actives et les deux ventes — vérifié par l'API REST au moment de la prise.

La différence tient donc au harnais, et elle reste à trouver : contexte navigateur recréé pour
chaque prise, application du thème avant la navigation, ou course entre la session et l'écoute du
périmètre. Les deux prises prévues pour le bilan de période ont été **retirées** plutôt que
laissées en place : une prise qui rend une image fausse est pire qu'une prise absente, puisque la
revue croit avoir regardé. Le bilan de S50 a donc été vérifié par un script jetable, et les deux
vues sont dans `captures/bilan-periode-*`.

**S53, relevée le 8 octobre 2026, à la demande du commanditaire.** « Actuellement tout est
ambigu, on comprend rien. » L'inventaire lui donne raison : **« carte grise » désigne sept choses
différentes** dans le produit, et rien ne les relie. *(Cinq au premier relevé du 8 octobre ; la
reprise du 9 en a trouvé deux de plus.)*

| Où | Ce que c'est | Posé par |
|----|--------------|----------|
| `motos/{id}.papiersFournis` | du texte libre, où l'on tape « Carte grise » à la main | S4 |
| `motos/{id}.cmcRecu` | une case : le CMC est-il en main ? | S43 |
| `motos/{id}.cmcChemin` | le scan du CMC, dans Storage | S11 |
| `ventesMotos/{id}/documents/{quittance,cmc,carte_grise}` | trois documents, cinq statuts, deux chemins | S11, S30 |
| `ventesMotos/{id}.carteGrise` | une case au comptoir : « part avec la moto » | S44 |
| `prestataires.types` | une liste de types de documents… à une seule valeur | S30, amputée en S48 |
| `.plaque-code`, `BandeauEtat` | la métaphore visuelle du produit — **pas une donnée** | S28 |

Le même mot nomme un **objet physique dans un tiroir**, une **étape administrative**, une **case
sur un reçu**, une **catégorie de fournisseur**, une **note du vendeur** et la **palette du
produit**. Deux d'entre eux — `cmcRecu` sur la moto et le document `cmc` sur la vente — suivent la
même carte à deux endroits sans jamais se parler. Et `lib/domain/moto.test.ts` fige le symptôme :
son exemple de texte libre est, littéralement, « Carte grise ».

S48 a retiré la plaque du dossier, mais à moitié : les règles Firestore l'acceptent encore,
`TYPES_DOCUMENTS` dans `lib/domain/prestataire.ts` est une énumération à une seule valeur, et
`CHEMIN_PRESTATAIRE` est écrit au pluriel pour un usage unique. Ce sont les restes d'une
amputation, pas un modèle.

**Ce que le commanditaire a déjà tranché**, et qui ne se redemande pas :

- Ce qui le gêne : **trop de saisies pour la même carte**, le logiciel **ne suit pas le vrai
  circuit**, et **trop d'écrans pour ça**.
- La remise à un prestataire (demande 6 du 8 octobre) se fait par **paquet rendu en une fois** :
  on tend dix cartes grises, on note la date et l'avance, il revient avec les dix. Ce n'est pas le
  dépôt dossier-par-dossier que le produit sait faire aujourd'hui.
- L'ordre : **les autres fonctionnalités d'abord**, puis une identification de bout en bout. Pas de
  suppression avant elle — l'étendue de ce qui tombe est précisément ce que la spec doit établir.

Rien n'a été retiré — mais **pas pour la raison que cette ligne donnait d'abord**. Elle disait
qu'une suppression toucherait « des données réelles sur `sandwini` » ; c'est faux, et l'erreur
était de nature à fausser l'arbitrage. `sandwini` est la **préversion**, et `DEPLOIEMENT.md` §4
dit ses données jetables et sans vrais clients. Aucune migration de données réelles n'est donc en
jeu : la seule précaution qui reste est que c'est le décor que le commanditaire ouvre depuis son
téléphone. Ce qui bloque est ailleurs, et ne bouge pas : la question « qu'est-ce qui reste »
n'est pas tranchée, et elle est le sujet de cette spec.

**Trois arbitrages de plus, le 9 octobre 2026**, et la spec est écrite :
`specs/S53-les-papiers-d-une-moto.md`.

- **La moto porte son CMC.** Le dossier le lit ; il ne reste qu'un geste au comptoir, la remise.
- **La case « Carte grise » du comptoir pilote le dossier.** Décochée, le document naît « Sans
  objet » — le reçu et le dossier cessent de se contredire.
- **Le paquet est un objet**, pas une sélection multiple : le retour des dix se fait en un geste.

L'inventaire a aussi corrigé son propre compte : le mot désigne **sept** choses et non cinq.
`motos.papiersFournis` — du texte libre où l'on tape « Carte grise » à la main — et la métaphore
visuelle `.plaque-code`, qui n'est pas une donnée mais explique pourquoi `grep plaque` rend une
centaine de fichiers. Toute suppression doit l'exclure, sinon on enlève le design.

S30 est fermée : l'écran attendait l'accusé de réception du serveur avant de rendre la main, ce qui
hors ligne n'arrive jamais. Les règles Firestore n'y étaient pour rien — le diagnostic de départ les
accusait, et il était faux. La leçon est en D76.

S37 est ouverte, et c'est S34 qui l'a trouvée en refusant de classer un échec
bout en bout comme du bruit. `e2e/recus.spec.ts:101` attend « La moto est remise
au client » sur le reçu. L'assertion y a été posée le 9 septembre (`7916082`) ;
le lendemain, `8fb2a7d` retirait `MENTION_RECU` du reçu sur demande du
commanditaire (D81). Le test échoue depuis, **sur `main`**, à chaque passe —
mesuré quatre fois, sur les deux branches, sur émulateurs neufs comme vieillis.

Ce n'est donc ni de la contention ni un défaut de produit : **le produit a
raison et le test est resté en arrière.** D81 affirmait que retirer la mention
« n'en casse aucun » ; cette phrase n'avait pas été vérifiée, et elle est
corrigée dans `DECISIONS.md`.

S37 est fermée sur arbitrage du commanditaire. L'assertion est retirée : la
conséquence du mode reste vérifiée là où le gérant la lit, sur la fiche de vente
(`paiements.spec.ts:106`) — ce que D81 affirmait sans l'avoir mesuré, et qui l'est
maintenant. `recus.spec.ts:70` passe en 6,8 s, contre un budget de 15 s qu'il
épuisait à chaque passe.

**Ce que le défaut coûtait tant qu'il vivait** : la suite bout en bout était
rouge en permanence, ce qui rend le prochain vrai défaut plus facile à ranger
avec le bruit — précisément le mécanisme qui l'avait caché deux jours.

S38 est fermée. Le script qui pose le thème avant la peinture — sans lui l'écran
s'ouvre en clair puis vire au sombre — modifie `<html>` avant que React hydrate,
et React signalait l'écart à chaque chargement depuis le 9 septembre.
`suppressHydrationWarning` sur cet élément le dit à React, et ne masque qu'un
niveau : tout écart à l'intérieur de l'application continue de se signaler.

Vérifié dans les deux sens (D79) : une erreur avant, zéro après, l'attribut
toujours posé. **Ce qui vaut d'être retenu n'est pas le remède mais le délai** —
deux jours pour un mot, parce que rien ne cassait. Pendant ce temps, toute autre
erreur arrivait dans une console qui en contenait déjà une. D88 en tire la
règle, et note que c'est la troisième fois dans la même session qu'un canal de
vérification avait cessé d'être lu.

S27 est fermée — deuxième étape du `CAHIER-DU-RESTE`, et son verdict n'est pas
celui qu'on attendait. Le nom du lot disait « reconnexion » ; la mesure dit
autre chose. Une passe complète sur émulateurs neufs a rendu huit échecs, et
**sept avaient deux causes, aucune dans le produit** : une écriture du décor
perdue au rechargement de page, et un second navigateur qui lit le serveur avant
que la file soit vide. Le produit confirme de façon optimiste — c'est sa promesse
au comptoir et elle est juste (D76) — mais `page.goto` et `browser.newContext()`
détruisent ce qui n'est pas encore parti.

Le remède tient en une ligne, écrite une fois dans `aide.ts` :
`attendreLaFileVide(page)`, **à la frontière** — avant de quitter la page qui
vient d'écrire, avant d'ouvrir un second navigateur, avant de couper le réseau.
Jamais document par document : attendre le serveur à chaque écriture fabrique la
contention qu'on mesurait ensuite. Une nuance a coûté une passe entière :
l'attente doit précéder la navigation, pas la suivre — placée après, elle
constate une file vide **parce que l'écriture n'y est plus**.

**Mesuré** : sur les quatre fichiers qui portaient les huit échecs, il en reste
un ; les tests corrigés ont perdu une minute chacun, n'expirant plus sur une
donnée absente. Chaque attente coûte environ trente secondes — elle paie
l'établissement de la connexion Firestore, pas la file. Mauvais échange à
l'unité, bon échange en tout.

**La borne du cahier est atteinte et assumée** : la suite ne redescend pas sous
quinze minutes. Cent tests qui font chacun six chargements de page complets n'y
tiennent pas, et les y faire tenir demanderait de semer le décor par l'Admin SDK
— ce qui perdrait la vérification du « vrai chemin d'un premier jour ». La parade
est donc outillée : `npm run test:e2e:propre` démarre son propre jeu
d'émulateurs et l'éteint après, et `e2e/README.md` porte le protocole de tri en
cinq étapes — dont celle que personne ne faisait, **aller voir si la donnée est
au serveur**, qui tranche entre « mal écrit », « perdu » et « pas lu » (D99).

**Trois choses trouvées en chemin.** Les émulateurs ne vieillissent pas avec le
temps mais avec les données, et le mécanisme est nommé (D98). Un test peut rester
suspendu **bien au-delà de son budget** quand l'émulateur Functions perd sa
socket — 45 minutes et 1 h 30 mesurées —, d'où un `globalTimeout` de deux heures.
Et la sortie d'espèces attendait l'accusé de réception du serveur, dernier geste
de comptoir à le faire, contre D76 : hors ligne, le bouton serait resté désactivé
indéfiniment. Corrigé, avec son test réseau coupé.

S41 est ouverte, et c'est S27 qui l'a trouvée en refusant de classer son dernier
échec avec le bruit. `caisse.spec.ts` « la sortie d'espèces » échoue toujours.
Le protocole a donné le diagnostic : le document **est au serveur**, exact dans
tous ses champs, et le gérant qui l'a saisi le voit. C'est le **responsable**,
rechargeant le journal de cette boutique juste après, qui ne le voit pas dans les
trente secondes qu'on lui laisse. Ni écriture perdue, ni défaut de droits : une
lecture qui n'arrive pas chez un second lecteur, pour un document déjà publié —
la famille de D82. À reprendre avec cette preuve en main.

S40 est fermée — première étape du `CAHIER-DU-RESTE`. Les six écrans que D95
annonçait posaient leur question de doublon à une liste encore vide pendant son
chargement ; le `?? []` répondait « rien de pris » à une question jamais posée.
Le plus grave d'entre eux laissait créer **deux motos au même numéro de
châssis** — ce qui se découvre à la préfecture, des semaines plus tard.

**Une septième occurrence a été trouvée en chemin**, et elle explique pourquoi
D95 en avait annoncé six : la recherche `grep "?? []"` ne pouvait pas la voir.
`FormulaireClient` demande « ce numéro est-il déjà pris ? » à une liste que
`useFichierClients` lui livre **déjà aplatie**. Un client créé pendant le
chargement du fichier duplique un numéro, et coupe en deux l'historique d'une
personne. Le motif se cherche par les **appels au contrôle**, pas par l'écriture
qui l'introduit (D96).

**Le correctif ne vit pas dans les écrans mais dans ce qui leur donne la liste.**
`ListeReferentiel` et `ChoixOuNouveau` acceptent désormais `null` ; `useCatalogue`
et `useFichierClients` exposent la liste sous deux formes — aplatie pour lire,
lue pour décider. Un nouvel écran ne peut plus rouvrir le défaut en une ligne de
JSX.

**Ce que la vérification a trouvé, et qui n'était pas le correctif.** Le test
hors ligne des motos s'est mis à échouer aussitôt après, sur une option de liste
manquante — toutes les apparences d'une régression du lot. Elle a été vérifiée
plutôt que crue : rejeu sur le code d'avant, bissection fichier par fichier, puis
une sonde qui a montré que **le serveur avait le document et que le cache du
navigateur ne l'avait pas**. Le décor coupait le réseau avant que ses propres
écritures soient parties ; le correctif n'avait fait que déplacer un clic de
quelques centaines de millisecondes, ce qui suffisait à faire basculer une course
déjà là. Le test attend maintenant « À jour » avant de débrancher, et passe en
**7,1 s** contre 90 s d'expiration. D97 en tire la règle.

S42 et S43 sont fermées ensemble — elles forment un seul commit (l'arrivage :
l'entrée par lot, puis l'espace qui la suit). Le concurrent (KYSG) fait entrer un
lot en deux formulaires ; **S42 le fait en un seul**, où l'on choisit ou crée le
fournisseur, puis, **par groupe de marque**, on fixe une fois ce qui est commun
(marque, modèle, prix) et on saisit les châssis à la chaîne — un même lot mêle
plusieurs marques. Là où KYSG tape le fournisseur en texte libre, on tient un vrai
fichier ; et **le coût reste cloisonné** (D2/S39) : la colonne prix n'existe que
pour le responsable, un lot « gérant » n'écrit aucun `prive/cout`, prouvé par un
test de règles, pas seulement masqué à l'écran.

**S43 suit ce que S42 fait entrer** : cinq cartes de tête lues du stock (reçues, en
stock, vendues, CMC manquants), une liste enrichie (ancienneté, barre d'écoulement,
complétude CMC), trois filtres, « Retrouver une moto » par suffixe de châssis,
l'inspection d'un lot avec la case « CMC reçu », la modification de l'entête, le
retrait **adapté au journal** (un lot vide s'efface, un lot plein s'annule et se
rétablit — rien ne s'efface en cascade), et l'export PDF par impression, hors ligne,
sans librairie. Rien n'est stocké : compteurs, écoulement et complétude se calculent
en lecture (D61). Deux booléens suffisent — `motos.cmcRecu`, `arrivages.annule` —
ajoutés aux validateurs de façon **rétro-compatible**, de sorte que les motos et lots
d'avant S43 restent modifiables.

**Ce que le rendu a trouvé, et qu'aucun test de domaine n'aurait vu** : deux
`<dialog>` natifs imbriqués (le modal fournisseur dans celui du lot) se chassaient,
et le lot partait **sans fournisseur** ; le modal fournisseur est devenu un calque
simple, et le centrage cassé par la Preflight de Tailwind a été refait à la main.

**Vérifié** : 533 tests d'unité, 20 tests de règles sur émulateur, et la suite bout
en bout arrivages **rejouée verte** sur émulateurs jetables (`npm run test:e2e:propre`)
— les quatre cas passent, deux ayant dû retenter une fois sous la contention S27, le
défaut que S27 a lui-même mesuré et outillé. Les règles sont déployées sur le projet
réel. Le rendu a été regardé en clair ; les captures sombres n'ont pas été régénérées
sous l'instabilité de l'émulateur, mais `captures/` est gitignore — c'est un œil, pas
une garantie, et la garantie est ailleurs.

S44 est terminée. Ce n'est pas une capacité de plus : c'est la même vente, le
même dossier, le même reçu — rendus plus rapides à faire et plus calmes à lire.
Le geste central du produit quittait le registre des ventes pour une page de
865 lignes ; il s'ouvre maintenant par-dessus lui, et la liste se met à jour
dessous au moment où la vente part.

**Le client se crée par défaut**, au lieu d'être d'abord cherché dans un fichier
où l'acheteur n'est en général pas. Les deux listes — motos et clients — ne
déroulent plus rien tant qu'on n'a pas tapé. Ce qui part avec la moto **se
coche** au lieu de s'écrire, et le mode de paiement tient en trois segments là
où trois pavés et un bandeau redisaient la même phrase ; la conséquence se lit
dans le récapitulatif, à l'instant où l'on valide.

**Deux changements de modèle, rétro-compatibles par deux montages différents**,
et la différence ne tient pas au goût : `venteValide` ne tourne qu'à la
création, donc les ventes d'avant ne sont jamais revalidées ; `clientValide`
tourne aussi à la modification, donc `prenom` et `nip` entrent dans le `hasOnly`
et pas dans le `hasAll` — les exiger rendrait tout le fichier clients
incorrigible du jour au lendemain. Aucune migration, et quatre tests de règles
le prouvent au lieu de l'affirmer. D101 porte la règle.

**Un patron de modale remplace quatre copies, et en répare deux défauts que
personne ne cherchait.** `InspecterLotModal` et `ModifierArrivageModal`
écoutaient Échap sur une boîte que rien ne focalisait : la touche n'arrivait à
personne. `FournisseurModal` et `ModifierArrivageModal` n'avaient ni hauteur
bornée ni défilement : à 390 px, clavier ouvert, le bouton qui enregistre
sortait de l'écran. Aucun test ne les voyait, parce qu'aucun test ne ferme une
modale au clavier ni ne mesure un cadre. `ArrivageModal` quitte `<dialog>` — le
produit tenait deux mécaniques pour un même objet, dont l'une n'existait que
pour survivre à l'autre (D100).

**Ce que la vérification a trouvé, et qu'aucune relecture n'aurait vu.**
`chercherClients` acceptait n'importe quelle sous-chaîne : « Awa » répondait
« S*awa*dogo ». Le défaut vivait depuis S6, invisible tant que le nom tenait en
un seul champ long ; un prénom est court, donc d'autant plus souvent contenu au
milieu d'un autre nom. C'est le changement de modèle qui l'a fait sortir, pas un
test écrit pour lui.

**Et la suite bout en bout a rendu trois verdicts qu'il aurait été facile de
ranger avec le bruit de S27.** Six échecs d'abord, tous sur le même message : le
bouton radio du segmenté est `sr-only`, et Playwright refuse de cliquer un carré
d'un pixel recouvert par le cadre. Le dépôt avait déjà tranché ce cas en S20 —
on clique l'étiquette dans le `radiogroup` —, et c'est sa convention qui a été
suivie plutôt qu'un contournement. Puis trois échecs, de trois causes
différentes : une liste de documents sans nom accessible, où « Carte grise »
figure désormais à deux titres ; une course que D97 avait déjà nommée ; et **un
`page.goto` posé hors ligne par ce lot**, qui rechargeait la page alors que des
écritures attendaient encore en file — la file ne se vidait plus jamais au
retour du réseau. Le lien profond a désormais son propre test, où rien n'attend.

**Ce que le rendu a trouvé** — la règle 5, et elle a encore payé trois fois. Les
dix-sept cases du NIP se groupaient par quatre, ce qui laisse `4·4·4·4·1` : une
case orpheline, qui se lit comme une faute de mise en page et non comme un
groupe. Un reliquat d'une seule case rejoint désormais le précédent. Le hub des
réglages, lui, posait son compteur en colonne fixe : à 390 px il ne restait que
cent cinquante pixels à la phrase, et « Déclarer un point de vente, son code et
ses coordonnées » sortait en quatre lignes de trois mots — défaut sans
importance tant que le hub s'affichait partout, devenu son seul rendu depuis que
S44 le retire du bureau. Troisième trouvaille, et c'est l'outil qui était en
faute : la spec de captures photographiait la modale en `fullPage`, ce qui étire
la page derrière un calque fixe et fabrique un vide sous la feuille. L'image
donnait à croire à un défaut qui n'existait pas.

**Ce que l'essai du commanditaire a trouvé, et que la suite ne pouvait pas
voir.** La modale gardait un bouton « Créer le client » : une validation de plus
au milieu d'un geste qui n'en demande qu'une, et la saisie se perdait dès qu'on
touchait au mode de paiement, parce qu'elle appartenait à un composant voisin
avec son propre état. Les champs du client (`ChampsClient`) sont désormais posés
seuls dans la modale, leur saisie vit dans son état, et « Enregistrer la vente »
crée la fiche en même temps que la vente — hors ligne compris. Effet de bord :
la modale ne contient plus **aucun** `<form>`, là où l'invariant tenait
jusqu'ici sur un équilibre.

**Aucun des quatorze tests de cet écran n'empruntait ce chemin** : tous
*choisissaient un client existant* dans la liste, et pas un n'en saisissait un
neuf — c'est-à-dire le cas le plus fréquent au comptoir. Une suite peut être
verte et ne rien dire du geste principal. Le défaut a été trouvé en cinq minutes
d'usage réel, et c'est la leçon la plus chère de S44.

**Deux fausses pistes écartées en mesurant.** Le calque semblait ne pas couvrir
la colonne de navigation : les pixels disent le contraire — le logo du rail
passe de `[95,64,45]` à `[61,44,43]` — et c'est le fond de la colonne qui ne
bouge pas, parce qu'un voile `nuit/45` posé sur du `nuit` rend du `nuit`. Le reçu
semblait taire les exclusions : il écrit « Casque : non inclus » en toutes
lettres, le commentaire du code ayant tranché avant nous que « le mot porte
l'information, le signe ne fait que la doubler ».

**Ce que la vérification n'a pas donné, et qu'il faut dire.** Les trois suites du
contrat sont vertes — 559 unitaires, 347 de règles, 27 de déclencheurs, ces
derniers exécutés seulement parce qu'un échec bout en bout sur la marge a révélé
qu'on les avait oubliés. Le bout en bout, lui, ne l'est pas : 106 sur 113 à la
passe complète, puis 11 puis 12 sur 13 pour `ventes.spec.ts` seul sur émulateurs
neufs. Chaque test du fichier a été vu passer, et **aucun échec n'a jamais porté
sur une valeur fausse** — pas une inclusion, pas un montant, pas un numéro, pas
un droit : toujours une donnée qui n'arrive pas, bandeau sur « Hors ligne ».
Deux courses de décor ont été corrigées au passage, dont une que le README
n'écrivait que dans un sens : fermer un contexte détruit ce qu'il n'a pas envoyé,
exactement comme en ouvrir un second ne montre que ce qui est parti. Le reste
appartient à S27, et S45 ci-dessous raconte la piste qui semblait l'expliquer et
ne l'expliquait pas.

S45 est **écartée**, et elle reste écrite parce qu'une piste explorée jusqu'au
bout vaut d'être connue : elle évite à la suivante de refaire le chemin.

Le symptôme est réel. `firestore-debug.log` porte, environ une fois par test
bout en bout, non pas un refus mais une *erreur d'évaluation* :

```
evaluation error at L268:24 for 'create' @ L268, false for 'create' @ L1390, …
```

La ligne 268 est la création d'un modèle. Dans `modeleValide`, un seul terme
semblait pouvoir lever au lieu de rendre `false` :
`exists(.../marques/$(donnees.marqueId))`. L'hypothèse tenait : un `marqueId`
**présent mais vide** y fabrique un segment de chemin nul, et c'est justement le
seul cas que les tests de règles ne couvrent pas — ils ont le `marqueId`
inexistant et le `marqueId` absent, pas la chaîne vide.

**Une sonde jetable l'a réfutée.** Deux écritures, l'une avec `marqueId: ''`,
l'autre avec `marqueId: 'marque-inexistante'` — le témoin déjà couvert par la
suite. *Les deux* produisent l'erreur. Ce n'est donc pas la chaîne vide : **tout
`exists()` qui ne trouve pas** la journalise, c'est-à-dire le chemin de refus
normal et voulu de cette règle. Le journal le dit lui-même en toutes lettres,
pour peu qu'on lise la ligne entière plutôt que son début : l'erreur
d'évaluation est suivie d'un `false` définitif. L'écriture est refusée
proprement, le client reçoit son `PERMISSION_DENIED`, et rien en aval ne casse.

*Conséquence sur l'autre enquête :* cette erreur n'explique **pas** les
`WebChannelConnection RPC 'Write' stream transport errored` ni les passages en
« Hors ligne » qui ont coûté sept échecs à la passe complète de S44. La cause de
l'instabilité bout en bout reste inconnue, et elle reste donc chez S27 — l'avoir
attribuée aux règles aurait fermé une enquête ouverte sur une fausse piste, ce
qui est pire que de la laisser ouverte.

*Ce qui reste vrai et mérite une ligne un jour :* l'émulateur journalise en
`WARNING`, avec pile d'exception Java, ce qui est un refus attendu. C'est du
bruit, et le bruit dans un journal coûte le jour où l'on y cherche un signal —
ce qui vient précisément d'arriver.

---

## Ce que le MVP ne fait volontairement pas

Espace pièces détachées · inventaires · caisse et clôture · pages publiques
client et prestataire · WhatsApp · échanges et reprises · transferts inter-boutiques · stock de CMC ·
photos de motos · annulation de vente.

Chacun de ces manques est une entrée du backlog ci-dessus, pas un oubli.
