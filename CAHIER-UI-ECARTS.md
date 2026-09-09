# CAHIER-UI-ECARTS — Ce qui sépare encore le produit de ses maquettes

> Suite de `CAHIER-UI.md`, qui cadrait la refonte (S28, S29). Celui-ci ne cadre
> pas une refonte de plus : il cadre une **mise en conformité**. Les maquettes
> ont été validées par le commanditaire ; le produit livré s'en écarte sur des
> points qui ne sont ni des détails ni des choix assumés.

---

## 1. D'où vient ce cahier

Le 9 septembre 2026, le commanditaire a mis côte à côte l'écran de supervision
en ligne et sa maquette `maquettes/a2-supervision.html`. Son verdict : « c'est
très différent, même notre logo n'adopte pas les bonnes couleurs, l'UX
également ».

Il a raison, et l'écart est structurel. S29 a livré neuf écrans en se
confrontant aux maquettes écran par écran — mais la confrontation a porté sur
la **zone de travail**, pas sur la coquille qui l'entoure ni sur la marque qui
l'habille. Ce qui n'a jamais été comparé ligne à ligne ne l'a pas été.

---

## 2. À lire avant d'écrire une ligne

Dans cet ordre, sans en sauter :

1. `AGENTS.md`, puis `WORKFLOW.md`, `DESIGN.md`, `SECURITY.md`,
   `ARCHITECTURE.md`. Ce sont les contrats ; ce cahier ne prime sur aucun.
2. `CAHIER-UI.md` — le cadrage de la refonte, dont §2 (le reproche fait à
   l'ancienne barre latérale) et §8 (les patrons).
3. `specs/S28-refonte-jetons-coquille.md` et `specs/S29-refonte-ecrans.md`.
   La seconde se termine par « Ce que le commanditaire a tranché » : quatre
   décisions y sont déjà prises, ne les rouvrez pas.
4. `DECISIONS.md`, en particulier **D70** (la marque prend la coquille, le jaune
   redevient un signal), **D63** (le responsable atterrit sur la supervision),
   **D73** (composant ou classe CSS), **D74** (le seuil d'un panneau se mesure
   sur la zone de travail), **D76** (un geste n'attend jamais le serveur).
5. `specs/ROADMAP.md` — surtout la ligne **S24**, qui décide de la moitié de ce
   chantier (voir §7).

**Les maquettes validées sont dans `maquettes/`. Chaque écran s'y confronte
avant d'être commité, fichier ouvert à côté du rendu. Pas de mémoire.**

---

## 3. L'analyse — ce qui a été mesuré

Ce qui suit a été relevé sur le code et sur les fichiers de maquette, pas sur
une impression. L'écran A2 sert d'exemple travaillé ; les huit autres n'ont pas
encore été audités (voir §8).

### 3.1 La marque — le monogramme sort à plat

`design/marque/monogramme-se.svg` porte **deux dégradés** :

| Élément | Dégradé |
|---|---|
| Le SE | `#DFA01C → #DD7A28 → #D3592C → #C93C2E` (or → rouge) |
| La goutte | `#2E9BC4 → #1F52A8` (bleu) |

`components/Monogramme.tsx` n'en transcrit que **les tracés**, remplis en
`currentColor`. Le monogramme sort donc blanc à plat dans la coquille, encre à
plat sur le reçu. Les maquettes, elles, servent le fichier tel quel
(`<img src="../design/marque/monogramme-se.svg">`).

Le commentaire du composant assume ce choix — « sans qu'on ait à maintenir
trois fichiers pour trois fonds » — mais il contredit D70 : *la marque prend la
coquille*. Un monogramme sans ses couleurs, ce n'est plus la marque, c'est une
silhouette.

`maquettes/socle.css` est explicite sur la règle qui va avec : **le dégradé
reste enfermé dans le monogramme**, à une exception près, un filet de 2 px en
tête de coquille (`.coquille-filet`). Vérifier que ce filet existe côté produit
et qu'il porte bien les deux dégradés.

*Contrainte à ne pas perdre :* le reçu s'imprime hors ligne, et S10 a appris
qu'un `<img>` pas encore chargé s'imprime blanc. La solution doit garder le
tracé **en ligne dans le document**, avec ses `linearGradient` — pas devenir
une requête réseau.

### 3.2 La coquille — la colonne des écrans n'est pas celle des maquettes

Pour le responsable sur l'espace Supervision :

| | Maquette (`b2-rail-responsable.html`) | Produit (`lib/domain/espaces.ts`) |
|---|---|---|
| Groupe 1 | **Le commerce** : Vue d'ensemble, Ventes, Paiements · **31**, Dossiers · **18** | **Suivre** : Vue d'ensemble |
| Groupe 2 | **Les boutiques** : Pouytenga `PTG`, Koudougou `KDG`, Ouagadougou `OUA` | **Administrer** : Clients |
| Pied | Nom de l'utilisateur, rôle et nombre de boutiques · bascule de thème · Se déconnecter | *(rien)* |

Trois manques, de nature différente :

1. **Les entrées.** La colonne du produit propose deux liens là où la maquette
   en propose quatre. Ventes, Paiements et Dossiers existent pourtant comme
   écrans — ils ne sont simplement pas déclarés dans cet espace.
2. **Les comptes.** « Paiements 31 », « Dossiers 18 » : la colonne annonce ce
   qu'on trouvera derrière, comme le hub des réglages le fait déjà depuis A9.
   Le patron existe, il n'est pas branché ici.
3. **Les boutiques dans la colonne.** C'est un déplacement de responsabilité,
   pas un ajout : dans la maquette, **naviguer vers une boutique se fait par la
   colonne**, ce qui libère les cartes de l'écran pour porter des chiffres
   (§3.3). Le produit fait l'inverse — ses cartes servent à naviguer, et la
   colonne est vide.

**La bascule de thème n'existe nulle part dans le produit.** Vérifié :
`data-theme`, « Thème sombre », « Thème clair » ne sont dans aucun fichier. Le
produit suit `prefers-color-scheme` et rien d'autre. Les maquettes posent une
bascule explicite en pied de colonne. Un gérant qui travaille en plein jour
sous tôle n'a pas de réglage système à sa main.

**L'identité et la déconnexion** vivent dans les réglages côté produit, en pied
de colonne côté maquette. Trancher : les deux ne sont pas incompatibles, mais
la maquette dit qui est connecté **en permanence**, ce que trois boutiques et
deux rôles rendent utile.

### 3.3 L'écran A2 — trois blocs sur quatre diffèrent

| Bloc | Maquette | Produit |
|---|---|---|
| En-tête | Sur-titre `TOUTES LES BOUTIQUES · SEPTEMBRE 2026`, titre, sous-titre d'une ligne, action **« Voir les chiffres »** en haut à droite | Titre, paragraphe de trois lignes, aucune action |
| Les boutiques | Une carte par boutique portant **Motos en stock**, **Ventes ce mois**, **Reste dû**, et une ligne d'alerte « 3 dossiers en retard » / « Aucun dossier en retard » | Une carte par boutique portant **son nom et ses métiers**, sans un seul chiffre |
| Ce qui demande une décision | **Tableau** : Pièce, Boutique, Client, Ce qui bloque, Depuis, Montant | Section présente, forme du tableau à vérifier hors état vide |
| Les dernières ventes | **Tableau** : Pièce, Boutique, Client, Moto, Mode, Prix convenu, Paiement | **Absent** |

---

## 4. Ce qui n'est *pas* un défaut

À ne pas « corriger » :

- **L'état vide de « Ce qui demande une décision ».** La capture du
  commanditaire montre « Rien n'attend de décision ». C'est le bon
  comportement : sa préversion n'a aucun document en retard. Comparer les deux
  écrans sur ce bloc demande d'abord **des données qui traînent**.
- **La colonne « Boutique » absente des tableaux d'A6, A7 et A8.** Tranché le
  9 septembre, en faveur des maquettes. Le sur-titre du numéro de pièce la dit.
- **Le corps à 14 px et la bascule de coquille à 1024 px.** Tranchés le même
  jour, appliqués, déployés.

---

## 5. L'environnement — et ce qu'on ne casse pas

L'application vise le vrai projet Firebase **`sandwini`** (choix du
commanditaire). `.env.local` est **absent**, et c'est l'état correct : `.env`
suffit et pointe sur `sandwini`.

**Les tests bout en bout ne visent jamais le vrai projet** — ils créent et
effacent boutiques, motos et ventes. Avant `npm run test:e2e` :

```
cp .env.local.emulateurs .env.local
npm run emulators        # dans un terminal à part, attendre 8181/9399/9599
npm run build            # NEXT_PUBLIC_* est fige a la compilation
```

et **retirer `.env.local` à la fin**. Le garde-fou de `playwright.config.ts`
refuse de tourner hors émulateurs.

> **Piège coûteux, vécu le 9 septembre.** `next dev` fige les `NEXT_PUBLIC_*`
> **au démarrage**. Retirer `.env.local` ne suffit pas : un serveur déjà lancé
> continue de parler aux émulateurs, et l'écran de connexion refuse le compte
> réel sans dire pourquoi. **Retirer le fichier et redémarrer le serveur vont
> ensemble.**

> **Second piège.** Un banc d'essai `@firebase/rules-unit-testing` lancé contre
> l'émulateur partagé **écrase son jeu de règles** (`singleProjectMode` dans
> `firebase.json`). Les numéros de ligne des journaux glissent et la
> reproduction ne porte plus sur le produit. Ne jamais faire tourner un
> harnais de règles pendant qu'on observe l'application.

---

## 6. La méthode

Elle ne change pas de S29, et elle a fait ses preuves :

- **Un écran à la fois, un commit par écran.** Le message dit le pourquoi.
- **La maquette ouverte à côté du rendu**, pas de mémoire.
- **Terminé = vérifié** (règle 5 d'`AGENTS.md`) : code exécuté, tests lancés,
  **rendu regardé**. `npm test` (335 unitaires + 230 règles + 21 déclencheurs),
  `npm run test:e2e`, puis des captures qu'on **ouvre**. Les trois défauts d'A4
  et le numéro de pièce coupé en trois lignes ont été trouvés sur image, jamais
  dans le code.
- **Un échec bout en bout s'explique avant d'être écarté** (D50, D55). La suite
  porte un bruit connu, de la famille « propagation hors ligne », dont **S27**
  est l'entrée de backlog : un test différent tombe à chaque tour. La procédure
  qui tranche : rejouer seul, rejouer sur émulateurs neufs, et au besoin mettre
  son travail de côté pour rejouer sur le commit précédent. Sur émulateurs
  vieillis de plusieurs heures, le bruit augmente nettement.

---

## 7. La question qui appartient au commanditaire — à poser en premier

**Les chiffres des cartes de boutique sont la spec S24**, listée post-MVP dans
la feuille de route : « Supervision — les chiffres toutes boutiques… S3bis a
posé la section, il reste à la remplir — et il faut que les données à agréger
existent d'abord. »

Or la maquette A2 les montre, et le bouton « Voir les chiffres » mène à un
écran entier qui existe en maquette (`maquettes/c3-supervision-chiffres.html`).

Donc : **rendre A2 fidèle à sa maquette, c'est faire S24.** Ce n'est pas une
mise en conformité, c'est une fonctionnalité, et elle est chiffrée comme telle.

Le découpage à proposer, et à faire valider avant de construire :

- **Lot 1 — la conformité seule**, sans donnée nouvelle : le monogramme et ses
  dégradés, le filet de coquille, les entrées et les comptes de la colonne, les
  boutiques dans la colonne, le pied de colonne (identité, thème,
  déconnexion), le sur-titre et le sous-titre d'A2, la forme du tableau « Ce
  qui demande une décision ». Rien ici ne demande d'agrégat nouveau.
- **Lot 2 — S24**, les chiffres : cartes de boutique, « Les dernières ventes »,
  et l'écran des chiffres. À ouvrir comme une spec normale, avec son propre
  point d'arrêt.

Ne pas mêler les deux dans un commit.

---

## 8. La première tâche : l'audit, pas le code

L'analyse du §3 porte sur **un seul écran sur neuf**. Avant de construire,
refaire la même confrontation pour les huit autres, plus la coquille et les
états :

`a1-connexion` · `a3-accueil-gerant` · `a4-stock-motos` · `a5-nouvelle-vente` ·
`a6-ventes` · `a7-dossiers` · `a8-paiements` · `a9-reglages`, puis les états
`b3` à `b7`, le mobile `b8`, le sombre `b9` et le reçu `c4`.

**Sortie attendue :** un tableau, un écart par ligne, avec pour chacun
— la maquette et la ligne qui le montre, le fichier du produit concerné, et le
classement en *défaut* (à corriger), *manque de données* (renvoie à une spec du
backlog) ou *écart assumé* (avec sa raison écrite). Sans ce tri, on corrigera
des choses qui n'ont pas à l'être et on manquera les vraies.

Cet audit est un livrable en soi. Il se présente au commanditaire **avant** la
première ligne de code — point d'arrêt 1 de `WORKFLOW.md`.

---

## 9. Hors périmètre

- **Les écrans qui n'ont pas de maquette validée.** `PanneauRecu` en est :
  l'écran des reçus n'a jamais été maquetté, et le convertir serait dessiner de
  mémoire. Le commanditaire a dit « on en reviendra ».
- **Les espaces Pièces et Caisse** (`c1`, `c2`) : maquettés comme aperçus, ils
  le restent tant que S20 à S22 ne sont pas prises.
- **Les trois dettes techniques ouvertes**, qui ont chacune leur entrée et ne se
  glissent pas ici : la borne `max-width: 32rem` de `.saisie` (cinq écrans hors
  groupe A en dépendent : `/motos/nouvelle`, `/clients`, `FormulaireClient`,
  `ListeReferentiel`, la connexion) ; la fragilité des règles Firestore — lire
  une clé absente de `request.auth.token` **fait planter la règle au lieu de la
  faire refuser**, remède `request.auth.token.get('boutiqueId', '')` ; et le
  joker `match /{referentiel}/{id}` qui répond `false` sur toute collection
  racine et rend chaque refus illisible dans les journaux.
- **Toute correction fonctionnelle repérée en chemin** devient une entrée de
  backlog, pas du code immédiat.

---

## 10. Critères d'acceptation

- [ ] L'audit du §8 est rendu, trié en trois familles, et présenté avant tout
      code.
- [ ] Le monogramme porte ses deux dégradés dans la coquille **et** reste
      imprimable hors ligne sur le reçu, sans requête réseau.
- [ ] La colonne des écrans de chaque espace porte les entrées de sa maquette,
      leurs comptes, et — pour le responsable — la liste des boutiques.
- [ ] Le pied de colonne dit qui est connecté, permet de basculer le thème et
      de se déconnecter. La bascule survit à un rechargement et respecte
      `prefers-color-scheme` en l'absence de choix explicite.
- [ ] Les états sont couverts partout où la forme change : vide, chargement
      sans saut de mise en page, erreur, hors ligne, refus expliqué avec une
      sortie (`DESIGN.md` §10).
- [ ] Aucun contraste perdu : la bascule de thème se vérifie sur les trois fonds
      du produit — papier blanc, coquille nuit, plaque jaune.
- [ ] `npm test` vert, suite bout en bout au moins au niveau d'avant le
      chantier sur émulateurs neufs, et **captures ouvertes et regardées** pour
      chaque écran touché.
- [ ] `.env.local` retiré à la fin, serveur de développement redémarré.

---

## 11. Ce qu'il faut savoir de l'état du dépôt

- `main` contient S28, S29 et S30, et est **poussée** sur
  `github.com/Zap-ai-make/sandwini`. Neuf branches sont sur le distant, toutes
  fusionnées dans `main` — elles sont là pour l'historique.
- La préversion tourne sur `https://sandwini-vr9q.vercel.app`, projet Firebase
  `sandwini`, **sans donnée client réelle**. La poussée y déclenche un
  déploiement : ce qui est commité est en ligne.
- La dernière passe de la checklist de sortie (`SECURITY.md` §13) date du
  **4 septembre**, avant S28. La CSP et la feuille d'impression ont changé
  depuis ; elles sont à repasser.
- Quatre commits portent un `@` parasite en tête de sujet
  (`b901639`, `c8cecc3`, `c61f19b`, `83c7840`). Ils sont **publics** : on n'y
  touche plus.
