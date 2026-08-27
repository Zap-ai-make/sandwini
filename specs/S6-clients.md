# S6 — Clients : recherche et création

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S3
```

---

## Objectif

Retrouver un client en tapant son numéro ou les premières lettres de son nom, et le créer quand il
est nouveau. Le fichier est commun à toutes les boutiques : un client connu à Pouytenga est retrouvé
à Koudougou sans ressaisie (D16).

---

## Critères d'acceptation

- [x] La recherche trouve un client par numéro de téléphone, écrit comme on veut : espaces, indicatif, ou les huit chiffres seuls
- [x] La recherche trouve un client par le début de son nom, sans tenir compte de la casse ni des accents
- [x] Un client se crée avec nom et téléphone ; l'adresse et une note sont facultatives
- [x] Un numéro déjà connu est refusé à la création, avec le client concerné nommé
- [x] Un client se corrige : on change son nom, son numéro, son adresse
- [x] Recherche et création fonctionnent hors ligne
- [x] Le gérant lit et crée des clients, comme le responsable — c'est la seule donnée partagée (D16)
- [x] Un anonyme n'accède à rien
- [x] États couverts : fichier vide, chargement, aucun résultat, numéro en double, numéro manquant, erreur de lecture

**Vérification :** 114 tests unitaires, 117 tests de règles, 46 tests bout en bout — dont un qui crée
un client réseau coupé et le retrouve dans la foulée. Rendu regardé en clair et en sombre, mobile et
bureau (`captures/`).

---

## Hors périmètre

Pas d'**historique d'achats** sur la fiche : il n'existe aucune vente avant S8.

Pas de **lien de suivi client** ni de **WhatsApp** (S13, S14).

Pas de suppression : un client est cité par des ventes.

Pas de **fusion de doublons**. Le contrôle à la saisie les empêche là où ils naissent ; deux appareils
hors ligne peuvent malgré tout créer la même personne deux fois, et cette réconciliation est un
travail à part entière.

---

## Notes techniques

**Le téléphone est la clé de recherche, pas la clé du document.** Un numéro se corrige — une faute de
frappe le lundi matin — et s'il était l'identifiant, la correction créerait un second client en
orphelinant son historique. Même raisonnement qu'en D36 pour les référentiels.

**Deux formes stockées à côté du texte saisi** : `telephoneNormalise` au format international, et
`nomNormalise` sans casse ni accents. C'est ce que le cahier des charges demande explicitement
(§5.3), et c'est ce qui fait qu'on retrouve un client au lieu de le recréer. Les règles les exigent
toutes les deux.

**Recherche en mémoire**, comme le stock : instantanée et fonctionnelle hors ligne. Le fichier d'une
maison de ce type se compte en centaines. Si un jour il se compte en dizaines de milliers, la parade
est déjà nommée dans D16 — recherche stricte par numéro complet, sans parcours de liste — et elle ne
change pas le modèle de données.

**Ce que S8 réutilisera** n'est pas un composant d'écran mais les deux pièces qui portent la logique :
`chercherClients` du domaine, et `creerClient` du dépôt — qui rend l'identifiant **avant** que
l'écriture n'aboutisse, ce qui est exactement ce qu'exige une création « à la volée » sans réseau.
Écrire aujourd'hui un sélecteur pour un écran qui n'existe pas aurait été deviner sa forme.

**L'écran `/clients` n'était pas dans l'arborescence du cahier** (D42) : il y est parce qu'une spec
doit être vérifiable seule, et parce qu'un numéro mal noté n'a pas à attendre une vente pour être
corrigé.

---

Spec terminée : critères cochés, code vérifié (tests + rendu), revue des trois contrats passée,
commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
