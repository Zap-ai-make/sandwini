# AUDIT — Ce qui sépare chaque écran de sa maquette

> Livrable du §8 de `CAHIER-UI-ECARTS.md`. Il ne contient aucun code et n'en
> autorise aucun : c'est le point d'arrêt 1 de `WORKFLOW.md`.
>
> Relevé le 9 septembre 2026, maquette ouverte à côté du fichier du produit, et
> quatre rendus regardés sur capture (`captures/supervision-bureau-clair.png`,
> `captures/motos-bureau-clair.png`, `captures/supervision-bureau-sombre.png`,
> `captures/recu-papier.png`). Pas de mémoire.

## Comment lire le classement

- **défaut** — le produit s'écarte d'une maquette validée sans raison écrite. À corriger.
- **manque de données** — la maquette montre une donnée que le produit ne calcule pas encore. Renvoie à une spec.
- **écart assumé** — le produit diverge exprès, la raison est écrite quelque part (spec, décision, commentaire). À ne pas « corriger ».

---

## 0. Ce que l'audit a trouvé et que le §3 du cahier n'avait pas vu

Trois choses, transverses aux neuf écrans, qui ne figurent pas dans l'analyse
d'A2 et qui pèsent plus lourd que la plupart des lignes ci-dessous.

**1. Le bouton principal est jaune dans tout le produit ; il ne l'est nulle
part dans les maquettes.** `socle.css:548` pose `.btn-principal { background:
var(--encre) }` — de l'encre, pas de la plaque. Le produit a gardé
`.bouton-plaque` (`app/globals.css:961`), hérité d'avant la refonte, et
l'emploie **30 fois dans 19 fichiers**. Dans les maquettes, `--plaque`
n'habille que deux objets : le code boutique et l'avis hors ligne — exactement
les deux emplois que D70 lui laisse. C'est le même reproche que le
commanditaire a formulé sur le logo, à l'autre bout de la chaîne : *un signal
partout n'est plus qu'une couleur.* Visible sur
`captures/motos-bureau-clair.png` : un pavé jaune « Faire entrer une moto » en
haut à droite, et vingt pavés jaunes de code boutique dans le tableau juste
en dessous.

**2. Le sur-titre a été transformé en sous-titre sur les neuf écrans.** Les
neuf maquettes posent `<p class="sur-titre">Espace · Boutique</p>` **au-dessus**
du `h1`, en 11 px capitales interlettrées (`socle.css:476`).
`components/patrons/Page.tsx:47-62` n'a qu'un `sousTitre`, en 14 px sous le
titre. Ce n'est pas une nuance typographique : le sur-titre répond à *où
suis-je* avant qu'on lise le titre, et il porte l'espace en plus de la
boutique. Le produit, lui, met tantôt le périmètre (A4, A6, A8), tantôt la
phrase d'aide (A7, A9), jamais les deux — alors que quatre maquettes ont les
deux.

**3. L'erreur de lecture est une ligne rouge.** `b6-erreur.html:93-118` dessine
un bloc entier : titre, explication qui n'accuse pas une cause non vérifiée,
**bouton « Réessayer »**, une sortie, le code du refus horodaté, et un avis
« Ce qui reste possible ». `components/patrons/Etats.tsx:70-83` rend
`<p role="alert">{message}</p>`. C'est le seul état où le produit est
franchement en dessous de `DESIGN.md` §10 — « l'erreur explique ce qui s'est
passé et comment le corriger ».

---

## 1. La coquille — s'applique aux neuf écrans

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| C1 | Le monogramme sort à plat, sans ses deux dégradés | `b1:22-24` sert le fichier tel quel | `components/Monogramme.tsx:37-48` (`currentColor`) | **défaut** — déjà au §3.1 |
| C2 | Le filet de coquille n'existe pas sur l'écran de connexion | `a1-connexion.html:13` | rendu par `NavigationPrincipale.tsx:73`, donc dans `(app)` seulement | **défaut** |
| C3 | Le pied de rail n'existe pas : ni bascule de thème, ni déconnexion | `b1:27-31`, `b2:26-30` (`.rail-pied`) | `NavigationPrincipale.tsx:76-101` | **défaut** — §3.2 |
| C4 | Aucune bascule de thème dans tout le produit | `socle.css:171` `[data-theme="sombre"]`, `coquille.js:92-104` | `globals.css:190` : `prefers-color-scheme` seul | **défaut** — §3.2 |
| C5 | Le pied de colonne ne dit pas qui est connecté | `b1:58-61`, `b2:52-55` (`.colonne-pied`) | absent | **défaut** — §3.2 |
| C6 | Les entrées ne portent pas leur compte | `b1:47-48` (12, 7), `b2:40-41` (31, 18) | `lib/domain/espaces.ts:126-207` | **défaut** — les deux calculs existent (`dossiersEnAttente`, `tranchesEnCours`) |
| C7 | Supervision : deux entrées là où la maquette en pose quatre | `b2:36-42` | `espaces.ts:135-138` | **défaut** — §3.2 |
| C8 | Supervision : les boutiques ne sont pas dans la colonne | `b2:44-50` | absent | **défaut** — §3.2 |
| C9 | Accueil : la colonne ne porte ni « Ma caisse du jour », ni « À faire · 5 », ni « Versements attendus · 12 », ni « Mon nom affiché » | `a3:31-49` | `espaces.ts:139-142` (Ma journée, Clients) | **défaut** partiel — « Ma caisse du jour » et « Mon nom affiché » sont un *manque de données* (S22, D72) |
| C10 | Réglages : trois groupes nommés (« L'entreprise », « Le catalogue », « Cet appareil ») | `a9:33-56` | `espaces.ts:155-207` : tout sous « Administrer » sauf Synchronisation | **défaut** |
| C11 | Motos : « Stock motos » est rangé dans *Vendre*, et le troisième groupe s'appelle « Administrer » | `b1:31-45` (*Suivre*, et « Le fichier ») | `espaces.ts:143-152` | **défaut** mineur |
| C12 | Le produit impose trois noms de groupe globaux ; chaque maquette nomme les siens pour son espace | `INTENTIONS` vs `b1` / `a3` / `a9` | `espaces.ts:96-103` | **défaut structurel** — c'est ce qui produit C9, C10 et C11 |
| C13 | « Dossiers en attente » dans la colonne, « Dossiers » dans la maquette | `b1:48` | `espaces.ts:148` | **défaut** mineur |
| C14 | Le bouton de repli vit dans la colonne, pas dans le bandeau | `b1:64-68` (`.plier` dans `.banniere`) | `NavigationPrincipale.tsx:148, 258-276` | **écart assumé** — même geste, même `Ctrl B`, même `aria-controls` |
| C15 | La recherche globale ne cherche que des écrans | `b1:71-75` + `b2:189-200` (motos, ventes, clients) | `PaletteCommandes.tsx:22-27` | **manque de données** — demande un index consultable hors ligne, à ouvrir en spec |
| C16 | **Le geste principal est en plaque jaune** | `socle.css:548-551` : `.btn-principal` = `--encre` | `globals.css:961-967`, 30 appels dans 19 fichiers | **défaut** — contredit D70 |
| C17 | Les boutons font 48 px, les maquettes 34/36 px | `socle.css:539, 549` | `globals.css:952` (`height: 3rem`) | **écart assumé** — cible tactile `DESIGN.md` §11, tranché en S29/A5 |
| C18 | Le rail bas ne réserve pas la zone sûre du téléphone | `socle.css:1561` `env(safe-area-inset-bottom)` | `globals.css:435-443` : aucun `safe-area` dans le dépôt | **défaut** mineur — PWA installée |
| C19 | Le monogramme du rail n'est pas un lien | `b1:22` renvoie à la galerie | `NavigationPrincipale.tsx:110-121` | **écart assumé** — écrit : chaque rôle a son accueil, déjà dans le rail |

---

## 2. La tête d'écran — s'applique à A1…A9

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| T1 | Le sur-titre est devenu un sous-titre, et change de graisse, de taille et de casse | `a2:80`, `a3:83`, `a4:86`, `a5:86`, `a6:86`, `a7:86`, `a8:86`, `a9:85` ; `socle.css:476-480` | `components/patrons/Page.tsx:47-62` | **défaut** — systémique, neuf écrans |
| T2 | Le sur-titre dit *espace · boutique* ; le produit ne dit que la boutique | `a4:86` « Motos · Pouytenga » | `motos/page.tsx:179` | **défaut** |
| T3 | A2 et A3 datent leur sur-titre (mois, jour) | `a2:80`, `a3:83` | `supervision/page.tsx:39`, `dashboard/page.tsx:76` (la date y est, le mois non) | **défaut** mineur |
| T4 | Là où la maquette a *sur-titre + aide*, le produit doit choisir | `a2`, `a5`, `a7`, `a9` | `Page.tsx` n'a qu'une ligne | **défaut** — conséquence de T1 |

---

## 3. Écran par écran

### A1 — Connexion (`a1-connexion.html`)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A1.1 | Monogramme à plat | `a1:20` | `login/page.tsx:225` | **défaut** (= C1) |
| A1.2 | Pas de filet de coquille | `a1:13` | — | **défaut** (= C2) |
| A1.3 | Le pied de marque dit « SDI · version 12 » | `a1:25` | `login/page.tsx:232` : « SDI » | **manque de données** — le produit n'expose aucun numéro de version |
| A1.4 | Bouton « Se connecter » en plaque jaune | `a1:48` (`btn-principal`) | `login/page.tsx:200` | **défaut** (= C16) |
| — | Les trois refus nommés puis expliqués, avec leurs trois tons | `a1:32, 61, 86` | `login/page.tsx:36-70` | **conforme** |

### A2 — Supervision (`a2-supervision.html`) — déjà analysé au §3.3, complété

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A2.1 | Sur-titre « Toutes les boutiques · septembre 2026 » | `a2:80` | `supervision/page.tsx:39-47` | **défaut** (= T1) |
| A2.2 | Action « Voir les chiffres » en tête | `a2:86` → `c3-supervision-chiffres.html` | absent | **manque de données** — S24 |
| A2.3 | Cartes de boutique : Motos en stock, Ventes ce mois, Reste dû | `a2:90-116` | `supervision/page.tsx:120-150` (nom + métiers) | **manque de données** — S24 |
| A2.4 | Ligne d'alerte « 3 dossiers en retard » / « Aucun dossier en retard » par carte | `a2:97, 107, 117` | absent | **à arbitrer** — `dossiersEnAttente` existe déjà, ce n'est pas un agrégat neuf |
| A2.5 | « Ce qui demande une décision » est un tableau à six colonnes | `a2:126-158` | `CeQuiDemandeUneDecision.tsx:194-224` : une liste | **défaut** |
| A2.6 | Colonne « Depuis », en jours | `a2:134` | « annoncée pour le 12/07/26 » | **défaut** |
| A2.7 | Colonne « Boutique » dans ce tableau | `a2:131` | absente | **défaut** — la décision du 9 septembre ne visait qu'A6, A7 et A8 |
| A2.8 | Section « Les dernières ventes » | `a2:161-196` | absente | **à arbitrer** — les ventes existent, aucun agrégat n'est demandé |
| A2.9 | Carte « Toutes les boutiques » ajoutée par le produit | absente d'`a2` | `supervision/page.tsx:65-77` | **écart assumé** — la maquette choisit « toutes » par la plaque du bandeau |
| A2.10 | Bouton « Gérer les boutiques » et paragraphe sur S24 ajoutés | absents d'`a2` | `supervision/page.tsx:99-115` | **défaut** — deux éléments à retirer (`DESIGN.md` §14) |

### A3 — Accueil gérant (`a3-accueil-gerant.html`)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A3.1 | Sur-titre « Pouytenga · vendredi 5 septembre 2026 » | `a3:83` | `dashboard/page.tsx:76` | **défaut** (= T1) |
| A3.2 | **Le geste du jour est sur le nuit, pas sur la plaque** | `socle.css:839-845` : `.geste { background: var(--nuit) }` | `dashboard/page.tsx:105-108` : `bg-plaque` | **défaut** — c'est le plus grand aplat jaune du produit |
| A3.3 | L'icône du geste est dans une tuile de 44 px | `socle.css:847-849` | `dashboard/page.tsx:109` : icône nue | **défaut** mineur |
| A3.4 | « À faire aujourd'hui » : pastille d'état, phrase, bouton « Ouvrir » par ligne, et « 5 points » en tête | `a3:105-142` | `CeQuiDemandeUneDecision.tsx` — même forme qu'A2 | **défaut** — la maquette donne deux formes distinctes aux deux écrans |
| — | « Ce que j'ai fait aujourd'hui » et son pied | `a3:145-160` | `JourneeDuGerant.tsx:156` | **conforme** |

### A4 — Stock motos (`a4-stock-motos.html`)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A4.1 | Le champ de recherche s'appelle « Chercher dans le stock » | `a4:75` | `motos/page.tsx:301` : « Chercher un châssis » | **défaut** — nom accessible au contrat, `CAHIER-UI.md` §12 |
| A4.2 | Bouton « Faire entrer une moto » en plaque jaune | `a4:89` | `motos/page.tsx:182` | **défaut** (= C16) |
| A4.3 | En-tête « Numéro de châssis » | `a4:104` | « Châssis » | **défaut** mineur |
| A4.4 | En-tête « Prix conseillé » | `a4:109` | « Prix conseillé (FCFA) » | **écart assumé** — devise titrée une fois, S29/A4 |
| A4.5 | Filtre de marque en bouton `aria-expanded` | `a4:80` | `motos/page.tsx:229-250` : `select` | **écart assumé** — un `select` natif est accessible, et D72 refuse la bibliothèque |
| — | Tableau, en-têtes collés, comptage, repli en cartes à 768 px, colonne « Boutique » | `a4:100-…` | `motos/page.tsx`, `patrons/Tableau.tsx` | **conforme** |

### A5 — Nouvelle vente (`a5-nouvelle-vente.html`)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A5.1 | L'aide de tête « Le numéro de la pièce sera attribué à l'enregistrement, même sans réseau » a disparu | `a5:87` | `ventes/nouvelle/page.tsx:223` | **défaut** |
| A5.2 | Bouton « Enregistrer la vente » en plaque jaune | `a5:221` | `ventes/nouvelle/page.tsx:285` | **défaut** (= C16) |
| A5.3 | Le groupe résolu se replie sur une fiche « … · Changer » | `a5:38-45, 61-69` | non construit | **écart assumé** — S29/A5 : le `radiogroup` perdait le focus, et D72 laisse la liste à recherche hors périmètre |
| A5.4 | « Reste à percevoir » | `a5:222` | « Reste dû » | **écart assumé** — S29/A5, vocabulaire unique |
| — | Colonne de 40 rem, aparté du récapitulatif, barre collée, `EFFET_MODE` annoncé | `a5:90-230` | `patrons/Formulaire.tsx` | **conforme** |

### A6 — Ventes (`a6-ventes.html`)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A6.1 | Sur-titre | `a6:86` | `ventes/page.tsx:191` | **défaut** (= T1) |
| A6.2 | Boutons « Nouvelle vente » et « Enregistrer le versement » en plaque jaune | `a6:89, 230` | `ventes/page.tsx:194`, `FicheVente.tsx` | **défaut** (= C16) |
| A6.3 | Le panneau s'empile sous la liste sous le seuil | `a6` | il la remplace | **écart assumé** — D74 |
| A6.4 | Bascule à 1152 px de fenêtre | `a6` | requête de conteneur à 68 rem | **écart assumé** — D74 |
| A6.5 | `PanneauRecu` n'a pas été converti | aucune maquette validée | `components/PanneauRecu.tsx` | **écart assumé** — repoussé par le commanditaire, décision 4 de S29 |
| — | Souche, `Faits`, colonne « Boutique » retirée, tableau à six colonnes | `a6:182`, `a6:28-34` | `FicheVente.tsx:138`, `patrons/PanneauLateral.tsx` | **conforme** |

### A7 — Dossiers en attente (`a7-dossiers.html`)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A7.1 | Le sur-titre a été chassé par l'aide, qui occupe seule la ligne | `a7:86-88` | `dossiers/page.tsx:195-198` | **défaut** (= T4) |
| — | Une colonne par document, « Chez qui, depuis », relais, avis de retard, recherche, trois filtres | `a7:92-…` | `dossiers/page.tsx`, `RelaisDocument.tsx`, `GestesDocument.tsx` | **conforme** |

### A8 — Paiements (`a8-paiements.html`)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A8.1 | Sur-titre | `a8:86` | `paiements/page.tsx:229` | **défaut** (= T1) |
| A8.2 | Colonne « Prix convenu » | `a8:26` | retirée | **écart assumé** — S29/A8, elle chassait « Action » hors du cadre |
| A8.3 | « Échu depuis 55 jours » sur une dette | `a8` | absent | **manque de données** — le domaine n'a pas de date d'échéance pour un crédit |
| A8.4 | Bouton « Remettre la moto » en plaque jaune | `a8:187` | `paiements/page.tsx` | **défaut** (= C16) |
| — | Deux sections nommées, deux vocabulaires, deux totaux, bandes d'explication | `a8:10-…` | `paiements/page.tsx` | **conforme** |

### A9 — Réglages (`a9-reglages.html`)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| A9.1 | Sur-titre « Réglages · Sandwidi et frère » | `a9:85` | `parametres/page.tsx:143` | **défaut** (= T4) |
| A9.2 | Les titres de section sont des sur-titres (11 px capitales) | `a9:92, 116, 162, 180` | `parametres/page.tsx:148, 170, 193, 214` : `text-bloc font-bold` (18 px) | **défaut** — et `patrons/Page.tsx:80` a déjà le bon patron, `TitreSection`, inemployé ici |
| A9.3 | Le monogramme figure dans la carte d'identité | `a9:94` | `IdentiteEntreprise.tsx:22-40` | **défaut** mineur |
| A9.4 | « Votre compte » est une carte « Mon nom affiché » | `a9:180-191` | `parametres/page.tsx:195-240` : liste de faits + déconnexion | **manque de données** — D72 : le produit ne sait pas renommer un compte |
| A9.5 | Les pastilles « à confirmer » sur IFU et RCCM | `a9:100-102` | `entreprise.ts:64` : liste vide | **écart assumé** — les vrais numéros ont été obtenus |
| A9.6 | La carte « Identité de l'entreprise » sous la fiche d'identité | absente d'`a9` | `parametres/page.tsx:161-165` | **écart assumé** — S29/A9, elle porte le seul réglage qui change |
| — | Trois sections, cartes qui annoncent leur compte, « Cet appareil » et sa phrase | `a9:88-178` | `parametres/page.tsx`, `patrons/Hub.tsx` | **conforme** |

---

## 4. Les états (b3 → b7)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| B3.1 | Hors ligne : l'écran porte un avis « Hors ligne — vous pouvez continuer » qui compte les saisies en attente | `b3:91-99` | absent — le bandeau seul | **défaut** — `patrons/Etats.tsx:16-22` écrit le raisonnement inverse, il n'a pas été confronté à `b3` |
| B3.2 | Hors ligne : l'aparté liste les trois écritures en attente avec leur heure | `b3:141-153` | vit dans `/diagnostic`, pas dans l'écran | **défaut** |
| B3.3 | Hors ligne : la barre d'action dit « Enregistré sur cet ordinateur » | `b3:169` | absent | **défaut** mineur |
| — | Le seul geste qui exige le réseau le dit **avant** | `b3:158-166` | `PapiersMoto.tsx:122, 139` | **conforme** |
| B4.1 | **Le vide** : bloc centré, 64 px de respiration, icône de 40 px, dans le cadre | `b4:93-101` ; `socle.css:722-725` | `globals.css:494-498` `.encadre-vide` : pointillés, 16 px, aligné à gauche, sans icône | **défaut** |
| B4.2 | Le vide garde le cadre et sa tête | `b4:92` | `motos/page.tsx:193` remplace tout le cadre | **défaut** mineur |
| — | Les deux autres vides — aucune boutique, gérant sans attribution | `b4:107-124` | `Etats.tsx:195-231`, `InvitationBoutique.tsx` | **conforme** |
| B5.1 | Le cadre porte `aria-busy` pendant la lecture | `b5:41` | absent | **défaut** mineur |
| — | Squelettes à la taille du contenu à venir, en-têtes déjà posés | `b5:36-70` | `patrons/Tableau.tsx:111-118` | **conforme** |
| B6.1 | **L'erreur** : titre, explication, « Réessayer », une sortie, code du refus horodaté | `b6:93-108` | `Etats.tsx:70-83` : une ligne rouge | **défaut majeur** |
| B6.2 | Avis « Ce qui reste possible » sous l'erreur | `b6:110-118` | absent | **défaut** |
| B7.1 | Le refus offre deux sorties | `b7:90-96` | `Etats.tsx:172-179` : une seule | **défaut** |
| B7.2 | Le refus dit qui peut y remédier | `b7:98-101` | absent | **défaut** |
| — | Le refus nomme la situation, explique le cloisonnement en base | `b7:81-89` | `Etats.tsx:157-183` | **conforme** |

## 5. Le mobile (b8) et le sombre (b9)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| B8.1 | Le rail bas ne réserve pas la zone sûre | `socle.css:1561` | aucun `safe-area` dans le dépôt | **défaut** mineur (= C18) |
| — | Rail en bas, colonne effacée, bandeau collant, nom de boutique masqué, tableau replié en cartes | `socle.css:1550-1577` | `globals.css:418-443` | **conforme** |
| B9.1 | Aucun forçage explicite du thème | `socle.css:156, 171` (trois écritures : système, clair forcé, sombre forcé) | `globals.css:190` (une seule) | **défaut** (= C4) |
| — | La palette sombre, valeur par valeur ; la plaque qui ne bascule pas | `socle.css:155-183` | `globals.css:190-215` — vérifié sur `captures/supervision-bureau-sombre.png` | **conforme** |

## 6. Le reçu (c4)

| # | Écart | Maquette | Produit | Classement |
|---|---|---|---|---|
| C4.1 | Le numéro est dessiné en **souche**, pas en plaque jaune | `c4:32-35` | `Recu.tsx:85-88` — vu sur `captures/recu-papier.png` | **défaut** — D70 fait de la souche la signature ; la classe existe déjà (`globals.css:778`) |
| C4.2 | IFU et RCCM prennent leur ligne **en tête** du document | `c4:42-45` et son commentaire : obligatoires en tête d'un document commercial au Burkina Faso | `Recu.tsx:170-172` : en pied | **défaut** — portée légale |
| C4.3 | « Montant reçu » est une ligne mise en avant, à part | `c4:59-62` | `Recu.tsx:131-139` : une ligne de la liste des montants | **défaut** |
| C4.4 | Faits : Téléphone, Au titre de, Numéro de châssis, Moyen ont chacun leur ligne | `c4:47-57` (sept lignes) | `Recu.tsx:110-126` (trois lignes, sous-lignes serrées) | **défaut** mineur |
| C4.5 | La conséquence du mode est imprimée | `c4:70-73` | absente | **défaut** |
| C4.6 | Le pied dit « Le gérant » et porte son nom, en regard du trait du client | `c4:76-86` | `Recu.tsx:161-166` « Établi par », signatures `print:flex` seulement, « Le magasin » | **défaut** mineur |
| C4.7 | Ligne de bas de page `SDI · numéro · date heure` | `c4:88` | absente | **défaut** mineur |
| C4.8 | « Reste à percevoir » | `c4:67` | « Reste dû » | **écart assumé** — S29/A5, vocabulaire unique |
| — | Monogramme en tracé et non en `<img>` ; palette repassée en clair à l'impression | `c4:26` | `Recu.tsx`, `globals.css:225-…` | **conforme** — contrainte hors ligne de S10 |

---

## 7. Le compte

| Famille | Nombre |
|---|---|
| **défaut** | 48, dont 3 transverses aux neuf écrans (C16, T1, B6.1) |
| **manque de données** | 8 — S24 (4), S22 (1), D72 (2), index hors ligne (1) |
| **écart assumé** | 14, tous avec une raison écrite dans une spec, une décision ou un commentaire |
| **à arbitrer** | 2 — A2.4 et A2.8, où la donnée existe mais le §7 du cahier les range en S24 |

## 8. Ce que l'audit propose de ne pas toucher

Outre les trois points déjà nommés au §4 du cahier :

- Tout ce qui est classé **écart assumé** ci-dessus. Chacun a sa raison écrite ;
  les « corriger » reviendrait à défaire une décision prise en connaissance du
  rendu.
- Les trois dettes techniques du §9 du cahier — `.saisie` à 32 rem, la fragilité
  des règles Firestore, le joker `match /{referentiel}/{id}`.
- `PanneauRecu`, faute de maquette validée (décision 4 de S29).

## 9. Ce qui devient une entrée de backlog, pas du code

Repéré en chemin, hors périmètre de la mise en conformité :

- **La zone sûre du téléphone** (C18) : le rail bas passe sous l'indicateur
  d'accueil sur un iPhone. C'est un défaut de disposition, pas de conformité —
  mais il se corrige dans le même geste que la coquille.
- **La recherche globale ne cherche que des écrans** (C15). Demande un index
  consultable hors ligne : une spec à part entière.
- **Le numéro de version** (A1.3) : le produit n'en expose aucun. Utile pour
  savoir ce qui tourne au comptoir.
