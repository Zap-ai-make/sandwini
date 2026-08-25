# S3 — Boutiques et sélecteur de périmètre

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S2
```

---

## Objectif

Le responsable déclare ses boutiques et rattache chaque gérant à la sienne. À partir de là, toute
personne qui saisit quelque chose voit en permanence **dans quelle boutique elle écrit** : le gérant
dans la sienne, le responsable dans celle qu'il a choisie, ou dans l'ensemble de l'entreprise.

---

## Critères d'acceptation

- [x] Le responsable crée une boutique (nom, code de 3 lettres, adresse, téléphone) ; le code est validé et sert d'identifiant (D30)
- [x] Le responsable modifie une boutique et la ferme ; une boutique ne se supprime jamais — son code vit dans des numéros de reçus
- [x] La création et la modification d'une boutique fonctionnent hors ligne : écriture directe dans Firestore, comptée par le bandeau
- [x] Le responsable choisit son périmètre — une boutique ou toutes — depuis le bandeau, et le choix survit à un rechargement (D31)
- [x] Le gérant n'a pas de sélecteur : sa boutique est affichée comme un fait, pas comme un choix
- [x] Le responsable attribue une boutique à un gérant déjà créé, et le formulaire de création propose la liste au lieu d'un champ libre
- [x] Un gérant ne lit que sa propre boutique ; il ne peut ni en créer, ni en modifier, ni parcourir la liste — vérifié par les règles
- [x] L'indicateur réseau dit « hors ligne » quand Firestore n'atteint pas le serveur, même si le navigateur se croit connecté — avec une latence mesurée et consignée (D20 bis)
- [x] États couverts : aucune boutique, chargement, erreur de lecture, boutique fermée, gérant sans boutique, permission refusée

**Vérification :** 43 tests unitaires, 47 tests de règles, 24 tests bout en bout. Rendu regardé en
clair et en sombre, mobile et bureau (`captures/`).

---

## Hors périmètre

Pas de transfert de motos entre boutiques (S17). Pas de coordonnées d'entreprise ni de logo (S4).
Pas de filtrage de données opérationnelles : il n'y en a pas encore. Le périmètre est **publié** ici
pour que les specs suivantes s'y branchent, il ne filtre rien aujourd'hui.

---

## Notes techniques

**Le code est l'identifiant** (D30). `boutiques/{code}`, trois lettres majuscules. Firestore ne sait
pas imposer l'unicité d'un champ ; en faire la clé du document la donne gratuitement. Le code entre
de toute façon dans les numéros de reçus (D5), donc il ne peut pas changer après coup. Les règles
refusent aussi qu'une « création » recouvre une boutique existante, en exigeant que `createdAt`
vaille l'heure de la requête.

**Les boutiques s'écrivent depuis le navigateur, pas depuis une fonction.** Ce sont des données
ordinaires : aucun droit n'en dépend, et rien ne justifie qu'elles exigent du réseau quand la vente,
elle, n'en exige pas. Seul le rattachement d'un gérant passe par le serveur, parce qu'il déplace un
custom claim — et il révoque les jetons du gérant au passage (D32).

**Le périmètre est publié, pas appliqué.** `usePerimetre()` expose la boutique courante ; les
requêtes des specs suivantes s'y filtreront. Le seul consommateur d'aujourd'hui est le bandeau — où
la plaque devient le sélecteur lui-même, pour que le choix se fasse là où la réponse se lit.

**Ce que l'exécution a appris.** Deux défauts n'étaient visibles qu'en regardant le rendu réel : le
sélecteur apparaissait après coup, la plaque fixe se transformant en liste déroulante une seconde
après le chargement ; et le rattachement, déplié sur chaque ligne, transformait la liste des comptes
en mur de listes déroulantes. Les deux sont corrigés. Le premier a aussi révélé que le script de
captures photographiait des écrans en cours de chargement — il attend désormais les listes.

Un troisième est venu du harnais : le plafond de 30 secondes par test était plus court que la somme
des attentes que certains tests s'accordent déjà. Le test des saisies hors ligne tombait donc, sous
charge, sur sa propre arithmétique et non sur un défaut du produit. Le plafond est passé à
60 secondes, avec la raison écrite dans la configuration.

---

Spec terminée : critères cochés, code vérifié (tests + rendu), revue des trois contrats passée,
commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
