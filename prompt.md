# Système de gestion — Commerce de vente de motos

## 0. Instructions pour l'agent

- Lis ce document en entier avant d'écrire du code. Les sections 4 à 12 décrivent les règles métier ; elles priment sur toute intuition technique.
- Le vocabulaire métier (CMC, quittance, carte grise, plaque, reprise, tranche) est défini en section 13. Utilise ces termes tels quels dans le code (noms de collections, enums, labels UI).
- Toute l'interface est en **français**. La devise est le **FCFA** (entier, pas de décimales).
- Le mode hors-ligne est recherché, pas absolu : une saisie doit fonctionner sans réseau chaque fois que c'est possible (section 3.4). Là où la technique ne le permet pas — envoi de fichier, création de compte — l'écran l'annonce clairement plutôt que d'échouer sans explication (`DECISIONS.md` D66).
- En cas d'ambiguïté non tranchée ici, choisis la solution la plus simple qui respecte les règles métier, et consigne le choix dans un fichier `DECISIONS.md` à la racine du projet.
- Ordre de réalisation recommandé en section 15.

---

## 1. Vue d'ensemble

Le système comporte **trois espaces** dans une même application :

| Espace | Qui y travaille | Contenu |
|---|---|---|
| **Motos** | Gérant d'une boutique de motos | Motos neuves et d'occasion, ventes, dossiers documents, paiements, échanges/reprises, inventaire motos |
| **Pièces détachées** | Gérant d'une boutique de pièces | Références, entrées/sorties, vente au comptoir, quantités, alertes rupture, inventaire pièces |
| **Supervision** | Responsable, et lui seul | Toutes les boutiques réunies : ventes, encaissements, stock, alertes, dettes, tranches en cours |

L'entreprise possède **plusieurs boutiques**, et **c'est la boutique qui porte le métier** : certaines vendent des motos, une autre vend des pièces détachées, rien n'interdit qu'une boutique tienne les deux. Un gérant ne voit que le ou les espaces des métiers de sa boutique ; l'espace pièces n'existe pas pour le gérant d'une boutique de motos.

La supervision est une **section à part**, avec ses propres écrans, et non un tableau de bord posé dans l'application commune. Le gérant en ignore l'existence. (Cf. `DECISIONS.md` D62 et D63.)

Chaque donnée opérationnelle (moto, pièce, vente, encaissement) est rattachée à une boutique.

Deux accès externes sans compte, par lien :
- **Client** : suit l'avancement de ses documents (carte grise, plaque).
- **Prestataire** : met à jour l'avancement des documents qu'on lui a confiés.

---

## 2. Stack technique imposée

| Couche | Choix |
|---|---|
| Front | **Next.js** (App Router) + **React** + **Tailwind CSS** |
| PWA | `next-pwa` ou équivalent (service worker, manifest, installable sur Android/iOS) |
| Auth | **Firebase Authentication** (email/mot de passe pour responsable et gérants) |
| Base de données | **Cloud Firestore** avec persistance hors-ligne activée |
| Fichiers | **Firebase Storage** (photos motos, reçus PDF si générés) |
| Backend | **Cloud Functions for Firebase** (uniquement pour ce qui ne peut pas être fait côté client en sécurité : génération de tokens, agrégats, pages publiques client/prestataire) |
| Hébergement | Firebase Hosting ou Vercel (au choix, documenter dans `DECISIONS.md`) |

Contraintes :
- Pas de backend Node séparé. Tout passe par Firestore + Cloud Functions.
- Les pages publiques client/prestataire doivent être servies **côté serveur** (Route Handlers ou Cloud Functions) via Firebase Admin SDK, afin que les règles Firestore restent strictes pour les utilisateurs anonymes.

---

## 3. Architecture

### 3.1 Structure Next.js

```
/app
  /(auth)/login
  /(app)                     ← routes protégées (responsable, gérant)
    /dashboard               ← vue d'ensemble (responsable) ou vue boutique (gérant)
    /motos                   ← espace motos
      /stock
      /ventes
      /ventes/[id]
      /dossiers              ← suivi documents
      /paiements             ← dettes, tranches
      /echanges
      /inventaire
    /pieces                  ← espace pièces détachées
      /stock
      /ventes
      /mouvements
      /alertes
      /inventaire
    /caisse
    /parametres              ← référentiels, utilisateurs, boutiques
  /(public)
    /suivi/[token]           ← page client
    /prestataire/[token]     ← page prestataire
/lib
  /firebase                  ← init client + admin
  /domain                    ← types, enums, règles de calcul (pures, testées)
  /repositories              ← accès Firestore
/components
```

### 3.2 Multi-boutique

- Chaque boutique porte un champ `metiers` (`'motos'` et/ou `'pieces'`), qui décide des espaces ouverts à son gérant. Au moins un métier ; une boutique sans métier n'ouvrirait aucun écran.
- Chaque document opérationnel porte un champ `boutiqueId`.
- Le gérant est rattaché à une seule boutique (`boutiqueId` dans son profil). Ses requêtes sont toujours filtrées sur cette boutique.
- Le responsable peut sélectionner « Toutes les boutiques » ou une boutique précise (sélecteur global persisté en session).

### 3.3 Identifiants et numérotation hors-ligne

- Tous les IDs de documents sont générés côté client (`doc(collection).id` Firestore) pour fonctionner hors-ligne.
- Les numéros de reçus/factures doivent être uniques et lisibles même sans réseau : format `{CODE_BOUTIQUE}-{AAMM}-{compteur local}` avec réconciliation à la synchro (si collision détectée par une Cloud Function, un suffixe `-B` est ajouté et l'utilisateur est notifié). Documenter le mécanisme choisi.

### 3.4 Hors-ligne et synchronisation

> **Portée (D66).** Ce qui suit vaut partout où c'est techniquement possible. Deux opérations en sont exclues et le disent à l'écran : l'**envoi de fichier** (Firebase Storage n'a pas de file d'attente hors ligne) et la **création de compte** (elle pose un droit, que seul le serveur peut poser).

- Activer `persistentLocalCache` / `enableIndexedDbPersistence` de Firestore.
- Toutes les écritures passent par le SDK Firestore (file d'attente automatique). Aucune écriture critique via Cloud Function appelable depuis l'UI de saisie.
- Les agrégats (totaux caisse, dettes, tranches) sont **calculés côté client** à partir des documents chargés, et éventuellement mis en cache par Cloud Function pour le dashboard responsable. Le client ne doit jamais dépendre d'un agrégat serveur pour afficher un écran de saisie.
- Afficher un indicateur d'état réseau et le nombre d'écritures en attente de synchro.
- Conflits : dernière écriture gagnante par défaut, sauf pour le stock pièces où les mouvements sont **additifs** (on enregistre des mouvements, on ne modifie jamais directement une quantité).

### 3.5 Audit

Chaque document Firestore porte :
```
createdAt, createdBy (uid), createdByName
updatedAt, updatedBy (uid), updatedByName
```
Les modifications de statut de documents, de paiements et de stock sont en plus journalisées dans une sous-collection `historique` du document concerné.

---

## 4. Rôles et permissions

| Rôle | Authentification | Périmètre |
|---|---|---|
| `responsable` | Firebase Auth | Toutes les boutiques, toutes les données, paramètres, utilisateurs |
| `gerant` | Firebase Auth | Sa boutique uniquement. Peut vendre, encaisser, gérer stock, documents, inventaire de sa boutique |
| `prestataire` | Token dans l'URL, sans compte | Uniquement les dossiers documents qui lui sont confiés. Voit : nom client, moto (marque/modèle/châssis), type de document, statut. Ne voit **jamais** les prix, les paiements, ni les autres clients |
| `client` | Token dans l'URL, sans compte | Uniquement son propre dossier : statut carte grise, statut plaque, date de disponibilité |

Règles :
- Rôle stocké en custom claim Firebase Auth (`role`, `boutiqueId`) et dupliqué dans `users/{uid}`.
- Seul le responsable crée/désactive des gérants et des boutiques.
- Les tokens client/prestataire sont des chaînes aléatoires longues (≥ 32 caractères, `crypto.randomUUID()` ou mieux), stockées hashées côté serveur si possible, sinon en clair mais non énumérables.
- Token client : sans expiration tant que le dossier est ouvert ; désactivé automatiquement 30 jours après clôture du dossier.
- Token prestataire : un token par prestataire (pas par dossier), révocable par le responsable depuis les paramètres.

---

## 5. Modèle de données (Firestore)

Les types sont donnés en pseudo-TypeScript. `Ref<X>` = ID de document de la collection X.

### 5.1 Référentiels (modifiables par le responsable)

```ts
boutiques/{id}          { nom, code (3 lettres, ex: "PTG"), metiers: ('motos'|'pieces')[], adresse, telephone, actif }
users/{uid}             { nom, role: 'responsable'|'gerant', boutiqueId?, actif }
marques/{id}            { nom, actif }
modeles/{id}            { marqueId, nom, actif }
prestataires/{id}       { nom, telephone, typesDocuments: ('carte_grise'|'plaque')[], token, actif }
typesFrais/{id}         { nom, actif }        // ex: remise en état, transport, commission
provenances/{id}        { nom, actif }        // ex: import, confrère, reprise client
categoriesPieces/{id}   { nom, actif }
```

### 5.2 Motos

```ts
motos/{id} {
  boutiqueId
  etat: 'neuve' | 'occasion'
  marqueId, modeleId
  couleur?, annee?
  numeroChassis, numeroMoteur?
  prixAchat: number              // coût réel d'entrée
  prixVenteConseille?: number
  provenanceId
  fraisEntree: { typeFraisId, montant, note? }[]   // remise en état, transport…
  papiersFournis: string[]       // pour l'occasion : ce qui accompagne la moto
  photos: string[]               // URLs Storage
  statut: 'en_stock' | 'reservee' | 'vendue' | 'transferee'
  venteId?                       // si vendue ou réservée (tranches)
  dateEntree
  origineEchangeId?              // si issue d'une reprise
  ...audit
}

transfertsMotos/{id} {
  motoId, deBoutiqueId, versBoutiqueId, date, note?, ...audit
}
```

Règle : le coût total d'une moto = `prixAchat + Σ fraisEntree.montant`. C'est cette valeur qui sert au calcul de marge.

### 5.3 Clients

```ts
clients/{id} {
  nom, telephone (clé de recherche, format international normalisé), telephone2?
  adresse?, note?
  ...audit
}
```

Recherche : par `nom` (préfixe insensible à la casse, stocker `nomNormalise`) et par `telephone`.

### 5.4 Ventes de motos

```ts
ventesMotos/{id} {
  numero                         // ex: PTG-2608-0042
  boutiqueId
  motoId
  clientId
  date
  prixConvenu: number
  modePaiement: 'comptant' | 'credit' | 'tranches'
  inclus: string[]               // ce qui est inclus dans la vente (casque, plaque, carte grise…)
  nonInclus: string[]
  coutMotoSnapshot: number       // coût total moto figé à la vente (marge)
  motoConfrere?: { nomConfrere, coutReel }   // vente d'une moto prise chez un confrère

  // paiements (agrégats dénormalisés, recalculés à chaque encaissement)
  totalPaye: number
  resteDu: number
  statutPaiement: 'solde' | 'partiel' | 'impaye'
  dernierVersementAt?

  // livraison
  motoRemise: boolean            // false tant que tranches non soldées
  dateRemiseMoto?

  // suivi client
  tokenSuivi
  lienSuiviEnvoyeAt?

  // dossier documents
  statutDossier: 'ouvert' | 'clos'
  dateClotureDossier?

  ...audit
}
```

Sous-collection `ventesMotos/{id}/documents/{type}` — un document par type, créé automatiquement à la vente :

```ts
{
  type: 'quittance' | 'cmc' | 'carte_grise' | 'plaque'
  statut: 'a_faire' | 'chez_prestataire' | 'revenu_magasin' | 'remis_client' | 'non_applicable'
  prestataireId?                 // si chez_prestataire
  dateDepot?, avanceVersee?: number
  dateRetour?
  dateDisponibiliteEstimee?      // affichée au client
  dateRemise?, remisPar?
  cmcId?                         // pour type 'cmc'
  ...audit
}
```

Sous-collection `ventesMotos/{id}/versements/{id}` :

```ts
{
  numeroRecu, date, montant, moyenPaiement: 'especes'|'orange_money'|'moov_money'|'wave',
  reference?, encaissementId, ...audit
}
```

### 5.5 CMC (cartes d'immatriculation disponibles)

```ts
cmc/{id} {
  boutiqueId
  numero
  statut: 'disponible' | 'attribue' | 'remis'
  venteId?, dateAttribution?, dateRemise?
  ...audit
}
```

### 5.6 Échanges / reprises

```ts
echanges/{id} {
  boutiqueId, clientId, date
  venteId                        // vente de la moto neuve qui sort
  motoRepriseId                  // moto d'occasion créée en stock
  valeurReprise: number          // fixée librement par le responsable/gérant
  complementVerse: number        // = prixConvenu - valeurReprise (peut être payé selon modePaiement)
  ...audit
}
```

Règle : la moto reprise est créée dans `motos` avec `etat: 'occasion'`, `prixAchat = valeurReprise`, `provenanceId = "reprise client"`, `origineEchangeId`.

### 5.7 Pièces détachées

```ts
pieces/{id} {
  reference, designation, categorieId
  prixAchat, prixVente
  seuilAlerte: number
  actif
  ...audit
}

stockPieces/{boutiqueId}_{pieceId} {
  boutiqueId, pieceId, quantite: number      // maintenu par mouvements
}

mouvementsPieces/{id} {
  boutiqueId, pieceId
  type: 'entree' | 'sortie_vente' | 'sortie_autre' | 'transfert_sortie' | 'transfert_entree' | 'ajustement_inventaire'
  quantite: number (signé : + entrée, − sortie)
  ventePieceId?, inventaireId?, transfertId?
  note?
  ...audit
}

ventesPieces/{id} {
  numero, boutiqueId, date
  clientId?                      // optionnel au comptoir
  lignes: { pieceId, designation, quantite, prixUnitaire, total }[]
  total, moyenPaiement, encaissementId
  ...audit
}
```

Règle : `stockPieces.quantite` = Σ `mouvementsPieces.quantite`. Recalcul possible par Cloud Function. Une pièce est **en alerte** si `quantite <= seuilAlerte`.

### 5.8 Inventaire

```ts
inventaires/{id} {
  boutiqueId
  espace: 'motos' | 'pieces'
  periodeDebut, periodeFin          // période choisie librement
  statut: 'en_cours' | 'valide'
  lignes: {
    refId                            // motoId ou pieceId
    libelle
    quantiteAttendue                 // 1 pour une moto
    quantiteConstatee?: number
    ecart?: number                   // constatee − attendue, calculé
    pointe: boolean
  }[]
  totalEcarts
  valideAt?, validePar?
  ...audit
}
```

Règles :
- À la création, le système génère automatiquement les lignes attendues (motos `en_stock`/`reservee` de la boutique ; toutes les pièces avec quantité > 0 ou mouvement sur la période).
- Les écarts s'affichent en temps réel pendant le pointage.
- À la validation d'un inventaire pièces, proposer de créer des mouvements `ajustement_inventaire` pour aligner le stock.
- Les inventaires sont conservés ; un écran permet de comparer deux inventaires du même espace/boutique.

### 5.9 Caisse

```ts
encaissements/{id} {
  boutiqueId, date
  sens: 'entree' | 'sortie'
  montant
  moyenPaiement: 'especes' | 'orange_money' | 'moov_money' | 'wave'
  origine: 'vente_moto' | 'versement' | 'vente_piece' | 'depense' | 'avance_prestataire' | 'autre'
  origineRefId?                  // venteId, versementId, ventePieceId…
  libelle
  categorieTranches: boolean     // true si l'argent correspond à un engagement (tranches non livrées)
  ...audit
}
```

---

## 6. Règles métier — Ventes de motos

### 6.1 Enregistrement d'une vente

Saisie rapide en un seul écran : moto (recherche dans le stock de la boutique), client (recherche par téléphone/nom ou création à la volée), prix convenu, mode de paiement, inclus/non inclus.

À la validation, **en une seule transaction/batch Firestore** :
1. Création de `ventesMotos`.
2. Création des 4 documents `quittance`, `cmc`, `carte_grise`, `plaque` en statut `a_faire`.
3. Génération du `tokenSuivi`.
4. Mise à jour de la moto :
   - `comptant` ou `credit` → `statut: 'vendue'`, `motoRemise: true`.
   - `tranches` → `statut: 'reservee'`, `motoRemise: false`.
5. Si un montant est encaissé immédiatement → création d'un `versement` + `encaissement`.
6. Génération du reçu (voir section 10).

Après validation : bouton « Envoyer le lien de suivi par WhatsApp » (section 11).

### 6.2 Modes de paiement

| Mode | Moto remise | Comportement |
|---|---|---|
| **Comptant** | Immédiatement | Un seul versement = prix convenu. `statutPaiement: 'solde'`. |
| **Crédit** | Immédiatement | Versements successifs. Apparaît dans la liste des **dettes** tant que `resteDu > 0`. Affiche l'ancienneté (jours depuis la vente) et le dernier versement. |
| **Tranches** | À la fin | Versements successifs. La moto reste **réservée** en stock. À `resteDu == 0`, le gérant confirme la remise : moto → `vendue`, `motoRemise: true`. Les montants perçus sont comptabilisés comme **engagement** (`categorieTranches: true`) et non comme recette tant que la moto n'est pas remise. |

Règles communes :
- Chaque versement produit un reçu de versement et un encaissement.
- Un versement ne peut pas dépasser `resteDu`.
- Modification/annulation d'un versement : réservée au responsable, journalisée.

### 6.3 Listes de suivi paiements

- **Dettes** : toutes les ventes `credit` avec `resteDu > 0`, triées de la plus ancienne à la plus récente. En-tête : montant total dû.
- **Tranches en cours** : toutes les ventes `tranches` non remises. En-tête : total détenu pour le compte des clients + nombre de motos à livrer.
- **Tranches inactives** : ventes `tranches` sans versement depuis `N` jours (`N` paramétrable par le responsable, défaut 30). Signalées visuellement, aucune action automatique.

### 6.4 Recherche d'une vente

Champ unique en haut de l'espace motos : nom ou numéro de téléphone du client → liste des ventes avec moto, date, statut paiement, état des 4 documents.

---

## 7. Règles métier — Documents et dossiers

### 7.1 Cycle de vie d'un document

```
a_faire → chez_prestataire → revenu_magasin → remis_client
                ↑ (prestataireId, dateDepot, avanceVersee obligatoires)
```
`non_applicable` possible pour tout document non inclus dans la vente (ex: client fait sa carte grise lui-même).

- Passage à `chez_prestataire` : le gérant saisit prestataire, date de dépôt, avance versée (crée un encaissement `sortie` / `avance_prestataire`), et une date de disponibilité estimée.
- Passage à `revenu_magasin` : soit par le **prestataire** (via son lien), soit par le **gérant**. Le client est informé (bouton WhatsApp « Vos documents sont disponibles »).
- Passage à `remis_client` : par le gérant uniquement. Enregistre `dateRemise` et `remisPar`.
- Quand les 4 documents sont en `remis_client` ou `non_applicable` **et** `statutPaiement == 'solde'` **et** `motoRemise == true` → `statutDossier: 'clos'` automatiquement.

### 7.2 CMC

- Le gérant enregistre les CMC reçus au magasin (`statut: 'disponible'`).
- À l'attribution d'un CMC à une vente : `cmc.statut = 'attribue'`, `document(cmc).cmcId` renseigné, statut document → `revenu_magasin`.
- À la remise au client : `cmc.statut = 'remis'`.
- Indicateurs permanents : nombre de CMC disponibles, nombre attribués en attente de remise.

### 7.3 Liste des dossiers en attente

Tous les dossiers `ouvert`, triés du plus ancien au plus récent, avec pour chaque document en cours le nom du prestataire qui le détient. Filtres : boutique, prestataire, type de document, en retard (date estimée dépassée).

---

## 8. Règles métier — Stock motos

- Vue par boutique ou toutes boutiques (responsable). Filtres : neuve/occasion, marque, modèle, statut.
- **Transfert** : choix moto + boutique de destination → `transfertsMotos` créé, `moto.boutiqueId` mis à jour. La moto disparaît d'une boutique et apparaît dans l'autre.
- **Moto de confrère** : lors d'une vente, option « moto prise chez un confrère » → la moto n'est pas dans le stock ; on saisit nom du confrère et coût réel. La marge est calculée sur ce coût.
- **Entrée en stock** : formulaire avec provenance, prix d'achat, frais d'entrée, papiers fournis (occasion), photos.
- Marge d'une vente = `prixConvenu − coutMotoSnapshot`. Affichée au responsable uniquement.

---

## 9. Règles métier — Pièces détachées

- **Catalogue** : référence, désignation, catégorie, prix achat/vente, seuil d'alerte.
- **Stock** : quantité par boutique, dérivée des mouvements.
- **Entrée** : saisie d'un lot (pièce, quantité, prix d'achat éventuel).
- **Vente au comptoir** : panier multi-lignes, client facultatif, moyen de paiement, reçu. Génère un mouvement `sortie_vente` par ligne + un encaissement.
- **Sortie autre** : usage interne, casse, etc. avec note.
- **Transfert** entre boutiques : deux mouvements liés.
- **Alertes** : liste des pièces avec `quantite <= seuilAlerte`, par boutique.
- Bloquer une vente si la quantité en stock est insuffisante (avec possibilité de forcer par le responsable, journalisée).

---

## 10. Reçus et factures

Trois types : **reçu de vente** (moto ou pièces), **reçu de versement**, **facture**.

Contenu minimum : nom de l'entreprise, boutique, adresse, téléphone, numéro, date, client, détail (moto : marque/modèle/châssis ; pièces : lignes), montant, moyen de paiement, total payé / reste dû, nom de l'opérateur.

- Générés côté client (HTML → impression navigateur, et PDF via une librairie client type `jsPDF` ou `react-pdf` pour l'envoi).
- Doivent se générer **hors-ligne**.
- Envoi au client : partage du PDF via Web Share API si disponible, sinon lien WhatsApp avec texte récapitulatif (section 11).
- Chaque reçu est retrouvable depuis la vente concernée et depuis un écran « Reçus » filtrable par numéro/date/client.

Les coordonnées de l'entreprise (nom, logo, adresse, téléphones, éventuel numéro d'identification) sont paramétrables par le responsable.

---

## 11. Intégration WhatsApp

**Choix : liens `wa.me` pré-remplis, sans API WhatsApp Business.**

Le système ouvre `https://wa.me/{telephone}?text={message encodé}`. Le gérant n'a qu'à appuyer sur « Envoyer » dans WhatsApp.

Messages types (modifiables par le responsable dans les paramètres, avec variables `{nom}`, `{moto}`, `{lien}`, `{boutique}`) :

1. **Lien de suivi** (après la vente) :
   > Bonjour {nom}, merci pour votre achat de {moto} chez {boutique}. Suivez l'avancement de votre carte grise et de votre plaque ici : {lien}
2. **Documents disponibles** :
   > Bonjour {nom}, vos documents pour {moto} sont disponibles. Vous pouvez venir les récupérer à {boutique}.
3. **Reçu** : texte récapitulatif (numéro, montant, reste dû).
4. **Lien prestataire** (envoi initial de l'accès).

Le système enregistre la date du dernier envoi (`lienSuiviEnvoyeAt`) au clic sur le bouton, sans pouvoir garantir l'envoi effectif.

---

## 12. Pages publiques (sans compte)

### 12.1 Page client — `/suivi/[token]`

- Rendu côté serveur via Admin SDK. Si le token est inconnu ou désactivé → page « Lien invalide ».
- Affiche uniquement : prénom/nom du client, moto (marque, modèle), état de la **carte grise**, état de la **plaque**, date de disponibilité estimée, nom et téléphone de la boutique, bouton « Contacter la boutique sur WhatsApp ».
- Statuts traduits en langage client : « En préparation », « En cours de traitement », « Disponible en boutique », « Remis ».
- **Aucune** donnée financière, aucun nom de prestataire, aucune autre vente.
- Page légère, lisible sur un petit téléphone, en français.

### 12.2 Page prestataire — `/prestataire/[token]`

- Rendu côté serveur. Token unique par prestataire.
- Liste des documents (`carte_grise` / `plaque`) en statut `chez_prestataire` qui lui sont attribués, toutes boutiques confondues.
- Pour chaque : client, moto (marque/modèle/châssis), type de document, date de dépôt, date estimée.
- Une seule action possible : **« Document prêt »** → passe le document à `revenu_magasin` (via Route Handler / Cloud Function avec Admin SDK, qui vérifie le token et l'appartenance du dossier). Optionnel : mise à jour de la date estimée.
- Ne voit ni prix, ni paiements, ni dossiers d'autres prestataires.

---

## 13. Vocabulaire métier

| Terme | Définition |
|---|---|
| **Quittance** | Reçu officiel de paiement des droits, première étape administrative |
| **CMC** | Carte d'immatriculation provisoire/officielle remise au client. Le magasin en détient un stock physique |
| **Carte grise** | Certificat d'immatriculation définitif, traité par un prestataire externe |
| **Plaque** | Plaque d'immatriculation, fabriquée par un prestataire externe |
| **Prestataire** | Intervenant externe (non employé) chargé de la carte grise ou de la plaque |
| **Dossier** | Ensemble vente + paiements + 4 documents, ouvert à la vente, clos quand tout est remis et payé |
| **Reprise / Échange** | Le client donne son ancienne moto en partie de paiement d'une neuve |
| **Tranches** | Paiement échelonné **avant** livraison ; la moto reste au magasin |
| **Crédit** | Paiement échelonné **après** livraison ; la moto est déjà chez le client |
| **Confrère** | Autre revendeur chez qui l'entreprise peut prendre une moto pour un client |
| **Boutique** | Point de vente physique ; l'entreprise en possède plusieurs. Elle porte un ou deux **métiers** — motos, pièces — qui décident des espaces ouverts à son gérant |
| **Gérant** | Responsable d'une boutique |
| **Responsable** | Propriétaire/dirigeant, accès total |

---

## 14. Écrans — Résumé

### Responsable — Supervision (`/supervision`)
Section réservée au responsable, où il atterrit à la connexion. Il y choisit la boutique qu'il regarde, et y trouve les cartes toutes boutiques réunies : ventes du jour / du mois (par boutique), encaissements par moyen de paiement, motos en stock (neuves/occasion), pièces en alerte, CMC disponibles, dossiers en retard, total des dettes, total des tranches en cours + nb motos à livrer. Chaque carte est cliquable vers la liste détaillée. Utilisable sur mobile.

### Gérant — Accueil de sa boutique (`/dashboard`)
Même structure de chiffres, restreinte à sa boutique, sans marges ni comparatif inter-boutiques. Ne mène qu'aux espaces des métiers de sa boutique.

### Espace motos
Stock · Nouvelle vente · Ventes (liste + recherche) · Détail vente (paiements, documents, reçus, WhatsApp) · Dossiers en attente · Dettes · Tranches · Échanges · CMC · Inventaire.

### Espace pièces
Catalogue · Stock · Vente comptoir · Entrées/sorties · Alertes · Inventaire.

### Caisse
Journal des encaissements du jour (entrées/sorties par moyen de paiement), clôture de journée (total par moyen de paiement, comparaison avec le comptage physique saisi), historique par jour.

### Paramètres (responsable)
Entreprise (coordonnées, logo) · Boutiques · Utilisateurs · Marques/Modèles · Prestataires (+ token, lien, révocation) · Types de frais · Provenances · Catégories pièces · Messages WhatsApp · Seuil d'inactivité tranches.

---

## 15. Ordre de réalisation recommandé

1. **Socle** : projet Next.js + Tailwind + Firebase, PWA, auth, rôles, sélecteur boutique, métiers de boutique et les trois espaces, persistance hors-ligne, indicateur réseau.
2. **Référentiels** et paramètres.
3. **Stock motos** (entrée, liste, transfert, photos).
4. **Vente moto** (comptant/crédit/tranches) + clients + versements + encaissements + reçus.
5. **Documents** (4 types, statuts, CMC, dossiers en attente) + token client + page `/suivi`.
6. **WhatsApp** (liens pré-remplis, messages paramétrables).
7. **Prestataires** + page `/prestataire`.
8. **Échanges / reprises**.
9. **Pièces détachées** (catalogue, mouvements, vente comptoir, alertes).
10. **Inventaires** motos et pièces + comparaison.
11. **Caisse** et clôture de journée.
12. **Vue d'ensemble** responsable (agrégats, éventuellement Cloud Function de cache).
13. Règles de sécurité Firestore complètes + tests.

Chaque étape doit être testée hors-ligne avant de passer à la suivante.

---

## 16. Sécurité Firestore — Principes

- Utilisateur non authentifié : **aucun accès direct** à Firestore. Les pages publiques passent par Admin SDK côté serveur.
- `gerant` : lecture/écriture uniquement sur les documents dont `boutiqueId == request.auth.token.boutiqueId`. Lecture seule sur les référentiels et sur `motos` d'autres boutiques (pour les transferts entrants : à trancher, documenter).
- `responsable` : accès total.
- Champs d'audit (`createdBy`, `updatedBy`) validés contre `request.auth.uid`.
- Interdire la modification directe de `stockPieces.quantite` par les clients ; uniquement via mouvements (règle + Cloud Function de recalcul).
- Tokens jamais lisibles par un gérant d'une autre boutique.

---

## 17. Points ouverts (à confirmer avec le responsable, ne bloquent pas le démarrage)

1. Un CMC est-il attribué **avant** ou **après** le dépôt de la carte grise chez le prestataire ? (Impacte l'ordre des étapes dans le détail de vente ; l'implémentation actuelle permet les deux.)
2. Les gérants peuvent-ils créer des motos en stock ou uniquement le responsable ?
3. Faut-il une gestion des dépenses hors ventes (loyer, salaires) dans la caisse, ou seulement les flux liés à l'activité ? (Le modèle `encaissements` avec `origine: 'depense'` le permet déjà.)
4. Annulation d'une vente : autorisée ? Par qui ? (Proposition : responsable uniquement, moto revient en stock, versements marqués remboursés.)
5. Numéro d'identification fiscale ou mentions légales obligatoires sur les factures ?