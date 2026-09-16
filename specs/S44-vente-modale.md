# S44 — La vente en modale, l'entrée moto, les réglages

```
Statut     : en cours
Périmètre  : post-MVP
Dépend de  : S8, S6, S10, S39, S40, S42, S43
```

---

## Objectif

Le gérant enregistre une vente **sans quitter le registre des ventes** : « Nouvelle
vente » ouvre une modale par-dessus la liste, où le client se crée par défaut, la
moto se cherche au lieu de se dérouler, et ce qui est inclus se coche au lieu de
s'écrire. La liste gagne quatre chiffres de tête. En passant, deux irritants
voisins tombent : le champ *Modèle* de l'entrée en stock cesse de paraître
verrouillé, et les Réglages montrent l'identité au lieu d'un sommaire qui répète
la navigation.

Aucune capacité métier nouvelle. C'est la même vente, le même dossier, le même
reçu — rendus plus rapides à faire et plus calmes à lire.

---

## Critères d'acceptation

### La modale de vente

- [ ] « Nouvelle vente » ouvre une modale sur `/motos/ventes` ; la liste reste
      derrière et la fiche ouverte ne se ferme pas
- [ ] La modale s'ouvre aussi par `?nouvelle=1` (paramètre d'écran, pas de route
      dynamique — D39), et `/motos/ventes/nouvelle` y redirige
- [ ] Mobile (390 px) : feuille montée du bas, barre de validation collée en bas.
      Bureau : boîte centrée, saisie en une colonne, récapitulatif collé à droite
- [ ] Échap ferme, le clic au fond ferme, le focus est pris à l'ouverture, piégé
      dedans, et rendu au bouton déclencheur à la fermeture
- [ ] **Entrée n'enregistre jamais une vente**, quel que soit le champ
- [ ] Le contenu reste atteignable à 390 px clavier ouvert (`max-h` + défilement)

### Le client

- [ ] Créer un nouveau client est le geste **par défaut** : nom, prénom,
      téléphone, numéro de pièce d'identité ; le reste est replié
- [ ] Un champ « Utiliser un client existant » n'affiche **aucun résultat tant
      qu'on n'a pas tapé** ; les correspondances apparaissent à la frappe
- [ ] La recherche trouve sur le début de **chaque mot** du nom — « Ali » trouve
      « Zongo Ali », nom et prénom séparés compris
- [ ] Avant de créer, le rapprochement par téléphone **et par NIP** a lieu ; s'il
      trouve, l'écran **propose la fiche existante** au lieu de refuser (D95/D96)
- [ ] Le contrôle lit la liste **lue**, jamais la liste aplatie ; le bouton
      annonce la lecture en cours tant qu'elle n'est pas revenue

### Le numéro de pièce d'identité

- [ ] 17 chiffres, saisis dans **17 cases**, sur un seul champ réel : le collage
      d'un numéro entier fonctionne, le clavier numérique s'ouvre sur téléphone,
      et le lecteur d'écran annonce un champ nommé, pas dix-sept
- [ ] Espaces et tirets collés sont absorbés, pas refusés
- [ ] Facultatif : une vente ne s'arrête pas parce que le client a oublié sa carte
- [ ] Un NIP renseigné qui n'a pas 17 chiffres est refusé, au formulaire **et**
      dans les règles Firestore

### La moto, les inclusions, le paiement

- [ ] **Rien n'est listé** tant qu'aucune référence n'est saisie ; châssis, marque
      ou modèle font apparaître les résultats à la frappe
- [ ] Le choix reste un `radiogroup` : flèches du clavier, nom accessible, annonce
      « 2 sur 8 ». Pas de liste déroulante à recherche (D72)
- [ ] Ce qui est inclus se coche : **« Carte grise » et « Casque »**, cochées par
      défaut. Plus aucune zone de texte libre, et plus de « plaque » dans les
      inclusions
- [ ] Le mode de paiement est un segmenté exclusif et accessible ; les trois
      pavés `EFFET_MODE` et le bandeau `Info` ont disparu de l'écran
- [ ] La conséquence du mode se lit dans le **récapitulatif**, en une ligne — et
      le comportement ne bouge pas : comptant préremplit le montant entier,
      tranches retient la moto
- [ ] Le moyen de paiement est un segmenté, plus un `<select>`

### Les chiffres de tête des ventes

- [ ] Quatre cartes : **Ventes**, **Chiffre d'affaires**, **Encaissé**,
      **Reste à percevoir**
- [ ] Calculées **en lecture**, des documents déjà écoutés — aucun agrégat stocké,
      aucune écoute nouvelle (D61)
- [ ] **Aucune marge, pour personne** : un gérant ne peut pas en déduire un coût
      (D2)
- [ ] Un périmètre sans vente écrit une phrase vraie, pas quatre zéros (D63)

### L'entrée d'une moto

- [ ] Le champ *Modèle* se lit et se comporte comme *Marque* : ni grisé, ni
      verrouillé
- [ ] La dépendance marque → modèle tient : sans marque, la liste est vide et
      l'invite **dit pourquoi avant le geste**, et « + Ajouter un modèle… » reste
      masqué
- [ ] Choisir ou créer une marque enchaîne le focus sur le modèle
- [ ] Changer de marque vide toujours le modèle

### Les réglages

- [ ] Sur bureau (≥ 1024 px), le sommaire « Ce qui change » a disparu : la colonne
      de gauche le disait déjà
- [ ] En dessous de 1024 px il reste — la colonne n'y existe pas, et il est le
      seul chemin vers les six écrans d'administration
- [ ] L'identité de l'entreprise **et de la boutique du périmètre** se lisent
      directement, en tête
- [ ] « Cet appareil » et « Votre compte » sont intacts

### Transversal

- [ ] Les ventes et les clients d'avant S44 s'affichent et se modifient sans
      migration, fiche comme reçu imprimé
- [ ] Toute la séquence fonctionne **réseau coupé**, numéro compris (D66, D76)
- [ ] Les états sont couverts : vide, chargement, clairsemé, dense, erreur, refus
      de droits, désactivé, hors ligne — cf. `DESIGN.md` §10
- [ ] Les points de `SECURITY.md` applicables sont respectés ; chaque
      cloisonnement est prouvé par un test de règles, pas seulement masqué
- [ ] Rendu regardé en clair **et** en sombre, mobile **et** bureau ; le reçu
      regardé sous média `print` (D77)

---

## Hors périmètre

Aucune bibliothèque de composants (Radix, shadcn, Vaul) : D72 tient, un calque
maison couvre le besoin, et une dépendance de plus se paierait en CSP et en cache
PWA. Pas de liste déroulante à recherche pour la moto — le `radiogroup` reste,
pour la raison écrite en tête de l'écran de vente. `PaletteCommandes` garde son
`<dialog>` : rien ne s'y imbrique.

**`plaque` reste un document du dossier.** Le retirer des inclusions ne le retire
pas de `TYPES_DOCUMENT` : c'est lui qui suit le passage chez le prestataire et la
remise au client (S11). Le mot a deux sens, et un seul est concerné.

Pas de colonne de navigation sur mobile : ce serait la refonte de la coquille de
tous les espaces, pas celle de trois écrans. Le NIP ne s'imprime pas sur le reçu —
le reçu est une surface contractuelle (S10), une ligne d'identité s'y ajoute
sciemment. Le NIP n'est pas une contrainte d'unicité dure : il rapproche, il ne
refuse pas.

---

## Notes techniques

**Deux changements de modèle, chacun derrière son test rouge.**
`inclus`/`nonInclus` deviennent `carteGrise`/`casque` ; `Client` gagne `prenom` et
`nip`. Les deux sont rétro-compatibles, par deux montages différents :

- *La vente* — `venteValide` ne tourne qu'à la **création** (les mises à jour
  passent par `seulsChangent`), donc les ventes d'avant ne sont jamais
  revalidées. Le dépôt lit les booléens en `boolean | null` et garde les tableaux
  legacy ; `inclusionsDeVente(vente)` rend `null` pour une vente d'avant S44, et
  la fiche comme le reçu retombent alors sur les anciennes listes. Rien n'est
  réécrit, rien n'est perdu.
- *Le client* — `clientValide` tourne à la création **et** à la modification. Les
  deux champs entrent donc dans le `hasOnly` et **pas** dans le `hasAll` : une
  fiche d'avant S44, sans `prenom` ni `nip`, reste modifiable. Même montage que
  `motos.cmcRecu` en S43.

`nom` garde son sens et devient le nom de famille ; une fiche d'avant a tout dans
`nom` et `prenom: ""`, ce qui rend exactement la même chaîne. Aucune migration,
donc aucune fenêtre pendant laquelle deux formes coexistent mal.

**Le piège de la recherche.** `nomNormalise` sert à chercher « sur le début ».
Séparer « Zongo Ali » en deux champs ferait disparaître « Ali » d'une recherche
par préfixe. `chercherClients` doit donc chercher le début de **chaque mot** —
c'est le premier test à écrire, avant le champ.

**Le patron de modale est un calque, pas un `<dialog>`.** S42 a mesuré que deux
`<dialog>` imbriqués se referment l'un l'autre ; trois des quatre modales du
produit sont déjà des calques pour cette raison. On écrit une fois ce qui est
recopié quatre fois — et on répare deux défauts que la copie a propagés :
`InspecterLotModal` et `ModifierArrivageModal` branchent Échap sur leur boîte sans
jamais prendre le focus, donc la touche ne remonte à personne ; `FournisseurModal`
et `ModifierArrivageModal` sont `items-center` sans `max-h`, donc inatteignables
au téléphone clavier ouvert. Le patron reprend à sa charge les cinq garanties que
le natif donnait : focus pris, focus piégé, focus rendu, Échap, fond inerte.

**Les 17 cases sont un dessin, pas un mécanisme.** Un seul `<input>` réel, posé
par-dessus une rangée de cases `aria-hidden`. Dix-sept champs séparés auraient le
même rendu et perdraient le collage, le clavier numérique et le nom accessible —
c'est le raisonnement déjà écrit pour `Choix` : « une pile de `<button>` aurait
l'air pareille et ne dirait rien de tel ».

**Les quatre chiffres se somment de ce qui est déjà là.** `bilanVentes` est une
fonction pure sur les documents que l'écran écoute déjà, comme `bilanArrivages` en
S43. Aucune écoute de plus, donc rien à attendre du réseau ; aucun agrégat écrit,
donc rien qui puisse diverger (D61). Les quatre nombres se lisent sur
`prixConvenu`, `totalPaye` et `resteDu` — jamais sur `prive/marge`, que le gérant
ne lit pas (D2).

**Une route de moins, un paramètre de plus.** `/motos/ventes/nouvelle` reste une
page, réduite à une redirection, et **reste dans `ECRANS_HORS_LIGNE`** : un favori
doit s'ouvrir réseau coupé. Le paramètre `nouvelle` s'ajoute à la liste ignorée
par le cache de précharge dans `app/sw.ts` — l'oubli ne se voit qu'en coupure
(D39, D40).

**Le sommaire des Réglages n'est redondant que sur bureau.** Sous 1024 px la
colonne secondaire est masquée et aucun remplaçant n'existe : le hub y est le seul
chemin vers les six écrans d'administration, et la palette de commandes est un
bouton-loupe, pas une destination. Il disparaît donc là où il double, et reste là
où il porte.

---

Une fois la spec terminée : critères cochés, code vérifié (tests + rendu), revue
des trois contrats passée, commit effectué, statut mis à jour dans
`specs/ROADMAP.md`.
