# S31 — Mise en conformité : la marque, la coquille et les états

```
Statut     : en cours
Périmètre  : post-MVP — mise en conformité, cf. CAHIER-UI-ECARTS.md
Dépend de  : S29
```

---

## Objectif

Le responsable ouvre l'application et y reconnaît les maquettes qu'il a
validées : son logo porte ses couleurs, le jaune ne désigne plus que ce qu'il
doit désigner, la colonne de gauche annonce ce qu'on trouvera derrière chaque
entrée, et le gérant qui travaille en plein jour sous tôle peut passer l'écran
en sombre sans toucher aux réglages de Windows.

Aucune donnée nouvelle n'est agrégée : ce chantier ne fait que rendre au
produit la forme déjà dessinée. Les chiffres de supervision restent S24.

---

## D'où vient cette spec

`CAHIER-UI-ECARTS.md` §8 demandait un audit des neuf écrans avant tout code.
Il est rendu dans `AUDIT-CONFORMITE-MAQUETTES.md` : 72 écarts, triés en
48 défauts, 8 manques de données et 14 écarts assumés. Le commanditaire a
validé le découpage en deux lots le 9 septembre 2026, et tranché deux
questions ouvertes (voir « Ce que le commanditaire a tranché », en fin de
spec). Cette spec est le lot 1.

---

## Critères d'acceptation

Un commit par sujet, la maquette ouverte à côté du rendu, tests relancés à
chaque fois.

- [ ] **La marque porte ses couleurs.** `Monogramme` rend les deux
      `linearGradient` de `design/marque/monogramme-se.svg` — or → rouge sur le
      SE, cyan → bleu sur la goutte — dans la coquille et sur l'écran de
      connexion, **et reste imprimable hors ligne sur le reçu, sans requête
      réseau** : le tracé demeure en ligne dans le document. Le filet de
      coquille existe aussi sur l'écran de connexion, qui n'a pas de rail pour
      le porter (C1, C2, A1.1, A1.2).
- [ ] **Le jaune ne dit plus que deux choses** (D70) : le code boutique et
      l'état hors ligne. Le geste principal reprend l'encre des maquettes
      (`socle.css:548`), le geste du jour de l'accueil reprend le nuit
      (`socle.css:839`), et aucune surface jaune ne subsiste ailleurs. Les
      30 appels de `.bouton-plaque` sont traités en une fois : une couleur de
      geste principal est une règle unique, pas un réglage par écran
      (C16, A1.4, A3.2, A4.2, A5.2, A6.2, A8.4).
- [ ] **La colonne des écrans porte les entrées de sa maquette**, pour les
      quatre espaces, avec les groupes que chaque maquette nomme — « Le
      commerce » et « Les boutiques » en supervision, « Vendre / Suivre / Le
      fichier » en motos, « Ma journée / Ce qui m'attend / Mon compte » en
      accueil, « L'entreprise / Le catalogue / Cet appareil » en réglages
      (C7, C9, C10, C11, C12, C13).
- [ ] **Les entrées annoncent leur compte** — « Paiements 31 », « Dossiers 18 »
      —, calculés depuis `dossiersEnAttente` et `tranchesEnCours`, qui
      existent et sont testés. Un compte à zéro ne s'affiche pas : c'est la
      règle de D63, et une pastille « 0 » ment autant qu'une carte à zéro (C6).
- [ ] **Le responsable navigue vers une boutique par la colonne** : les
      boutiques actives y figurent, avec leur code en pastille (C8).
- [ ] **Le pied de colonne dit qui est connecté** — nom, rôle et nombre de
      boutiques — et **le pied de rail permet de basculer le thème et de se
      déconnecter**. Les réglages gardent la fiche complète du compte : les
      deux endroits se complètent, ils ne se dupliquent pas (C3, C5).
- [ ] **La bascule de thème survit à un rechargement** et respecte
      `prefers-color-scheme` en l'absence de choix explicite. Les trois
      écritures de `socle.css:155-183` sont reprises : réglage système, clair
      forcé, sombre forcé (C4, B9.1).
- [ ] **Aucun contraste perdu.** La bascule est vérifiée sur les trois fonds du
      produit — papier blanc, coquille nuit, plaque jaune —, en clair comme en
      sombre, capture à l'appui.
- [ ] **La tête d'écran retrouve son sur-titre**, au-dessus du titre, en
      11 px capitales interlettrées, disant *espace · boutique*. Là où la
      maquette porte en plus une phrase d'aide, les deux coexistent. Neuf
      écrans (T1, T2, T3, T4, A5.1).
- [ ] **Les états sont couverts partout où la forme change** (`DESIGN.md` §10) :
      - l'erreur de lecture devient un bloc qui nomme, explique, propose de
        réessayer et offre une sortie (B6.1, B6.2) ;
      - le refus offre deux sorties et dit qui peut y remédier (B7.1, B7.2) ;
      - le vide se centre dans son cadre, avec son icône (B4.1, B4.2) ;
      - hors ligne, l'écran de saisie dit qu'on peut continuer et montre ce qui
        attend sur cet appareil (B3.1, B3.2, B3.3) ;
      - le chargement annonce `aria-busy` sur le cadre (B5.1).
- [ ] **A2, hors chiffres** : sur-titre daté, « Ce qui demande une décision »
      prend la forme de tableau de sa maquette — Pièce, Boutique, Client, Ce
      qui bloque, Depuis, Montant —, et les deux ajouts hors maquette sont
      retirés (A2.1, A2.5, A2.6, A2.7, A2.10).
- [ ] **A3** : « À faire aujourd'hui » prend la forme de sa propre maquette —
      pastille d'état, phrase, bouton « Ouvrir », comptage en tête — et cesse
      d'emprunter celle d'A2 (A3.3, A3.4).
- [ ] **A2, ce qui ne demande aucun agrégat neuf** : la ligne d'alerte des
      cartes de boutique et la section « Les dernières ventes » (A2.4, A2.8).
      Commit à part, en fin de lot, pour rester détachable.
- [ ] **A9** : les titres de section reprennent le sur-titre des maquettes, et
      le monogramme figure dans la carte d'identité (A9.2, A9.3).
- [ ] **A4** : le champ de recherche reprend son nom accessible « Chercher dans
      le stock », et l'en-tête « Numéro de châssis ». Le test bout en bout est
      mis à jour dans le même commit (`CAHIER-UI.md` §12) (A4.1, A4.3).
- [ ] **Le reçu** : le numéro est une souche et non une plaque, IFU et RCCM
      remontent en tête du document — ils y sont obligatoires au Burkina
      Faso —, « Montant reçu » se détache, la conséquence du mode s'imprime,
      et le pied nomme le gérant (C4.1 à C4.7).
- [ ] **Le rail bas réserve la zone sûre du téléphone** (C18, B8.1).
- [ ] `npm test` vert — 335 unitaires, 230 règles, 21 déclencheurs. Suite bout
      en bout au moins au niveau d'avant le chantier, sur émulateurs neufs.
      Captures **ouvertes et regardées** pour chaque écran touché, plus le reçu
      sous média `print`.
- [ ] `.env.local` retiré à la fin, serveur de développement redémarré.
- [ ] La checklist `DESIGN.md` §14 est passée écran par écran.
- [ ] `specs/ROADMAP.md` et `DECISIONS.md` sont à jour.

---

## Hors périmètre

- **Les chiffres de supervision — S24.** Les trois montants des cartes de
  boutique et l'écran `c3-supervision-chiffres`, avec le bouton « Voir les
  chiffres » qui y mène. Ils demandent des agrégats qui n'existent pas ; c'est
  le lot 2, à ouvrir comme une spec normale avec son propre point d'arrêt.
- **`PanneauRecu`** — aucune maquette validée, repoussé par le commanditaire
  (décision 4 de S29).
- **Les quatorze écarts assumés** de l'audit §8 : chacun a sa raison écrite, et
  les défaire reviendrait à annuler une décision prise sur un rendu regardé.
- **Les trois dettes techniques ouvertes** — la borne `max-width: 32rem` de
  `.saisie`, la fragilité des règles Firestore, le joker
  `match /{referentiel}/{id}`. Chacune a son entrée.
- **La recherche globale dans les motos, les ventes et les clients** (C15) :
  demande un index consultable hors ligne, c'est une spec à part.
- **Le numéro de version affiché sur l'écran de connexion** (A1.3) : entrée de
  backlog.
- **Toute correction fonctionnelle repérée en chemin** devient une entrée de
  backlog, pas du code immédiat.

---

## Notes techniques

**Les patrons existent ; cette spec les corrige, elle n'en invente pas.**
`patrons/Page.tsx`, `patrons/Etats.tsx`, `patrons/Tableau.tsx`,
`patrons/Hub.tsx`, `patrons/Avis.tsx` sont écrits et employés partout. Un
écart de tête d'écran se répare dans `Page.tsx`, pas dans neuf pages ; un
écart d'état dans `Etats.tsx`. C'est ce qui rend ce lot court malgré ses
48 défauts : trois d'entre eux sont transverses, et se corrigent une fois.

**Le monogramme et la contrainte hors ligne.** Le reçu s'imprime sans réseau,
et S10 a appris qu'un `<img>` pas encore chargé s'imprime blanc. Les dégradés
arrivent donc en `linearGradient` **dans le composant**, pas par un `<img
src>`. Deux pièges à tenir : les `id` de dégradé doivent être uniques par
instance — trois monogrammes sur un même document partageraient sinon la même
définition —, et le reçu doit continuer à sortir en monochrome sur le papier,
où un aplat de couleur vide une cartouche pour rien.

**Le jaune se retire par le socle, pas par les appelants.** `.bouton-plaque`
est employé 30 fois : renommer et recolorer la classe traite les 30 d'un
geste, là où passer par les appelants garantit d'en oublier un. Le nom
`bouton-plaque` ne survit pas au changement — une classe qui dit « plaque » et
rend de l'encre est un piège pour le prochain.

**La bascule de thème vit sur `<html>`, comme le repli de la navigation.**
Le mécanisme existe déjà (`app/layout.tsx`, script d'amorçage synchrone,
`useSyncExternalStore` dans `NavigationPrincipale`) et il a été écrit pour
exactement cette raison : ne pas laisser l'écran basculer sous les yeux après
la peinture. La bascule de thème le reprend plutôt que d'en inventer un
second.

**Les comptes de la colonne ne doivent pas coûter un abonnement de plus.**
`CeQuiDemandeUneDecision` écoute déjà ventes, dossiers et versements sur le
périmètre courant. La colonne a besoin des mêmes nombres : ils passent par un
point unique, sinon deux listes finiront par répondre deux choses — la leçon
de D73, point 2.

**Ce qui ne se casse pas.** Les noms accessibles interrogés par la suite bout
en bout sont un contrat (`CAHIER-UI.md` §12) : `banner`, `navigation` nommée
« Navigation principale », `status` unique, `combobox` « Boutique affichée »,
et les libellés de bouton et de champ. Changer un libellé reste permis — A4.1
le fait — mais le test se met à jour **dans le même commit**.

**Le bruit connu de la suite bout en bout.** Famille « propagation hors
ligne », entrée de backlog S27 : un test différent tombe à chaque tour. La
procédure qui tranche est au §6 du cahier — rejouer seul, rejouer sur
émulateurs neufs, au besoin mettre son travail de côté pour rejouer sur le
commit précédent. Sur émulateurs vieillis de plusieurs heures, le bruit
augmente nettement.

---

## Ce que le commanditaire a tranché

Trois questions lui ont été portées avec l'audit, le 9 septembre 2026.

**1. Le découpage en deux lots — validé.** La conformité seule d'un côté,
S24 de l'autre, sans les mêler dans un commit.

**2. A2.4 et A2.8 — laissés à l'appréciation de l'agent.** Décision prise, et
sa raison : **les deux entrent dans le lot 1**. Ni la ligne d'alerte des
cartes ni « Les dernières ventes » ne demandent un agrégat nouveau —
`dossiersEnAttente` et `ecouterVentes` existent, sont testés, et la seconde
n'est que le tableau d'A6 avec une colonne de moins et six lignes. Ce qui
reste en S24 est ce qui manque vraiment : les trois montants par carte —
motos en stock, ventes du mois, reste dû —, qui demandent d'agréger le stock
et les paiements de toutes les boutiques, et l'écran des chiffres. Les deux
prennent un commit à part, en fin de lot : si le commanditaire préfère les
voir arriver avec S24, ce commit se retire sans toucher au reste.

**3. L'identité et la déconnexion — aux deux endroits, proposition validée.**
La colonne dit qui est connecté en permanence, ce que trois boutiques et deux
rôles rendent utile ; les réglages gardent la fiche complète du compte. Ce
n'est pas un doublon : l'un répond à *qui suis-je en ce moment*, l'autre à
*que sait l'application de moi*.
