# S59 — Carte grise et plaque

```
Statut     : à faire
Périmètre  : post-MVP
Dépend de  : S11 (dossier documents), S30 (dépôt prestataire), S53 (paquets), S56 (portail), S58 (espace prestataires)
```

---

## Objectif

La personne qui ne fait **que** les cartes grises obtient son propre espace de travail, choisi
comme une boutique sur la plaque jaune. Elle y voit les dossiers de **toutes** les boutiques et
rien d'autre, peut en ouvrir un pour une moto qui n'a pas été vendue ici, inscrire le numéro
d'immatriculation au retour, et noter **qui** est venu chercher le papier.

---

## Ce que dit le fichier du client

Trois captures de son classeur Excel, relevées le 21 octobre 2026. Une ligne = un dossier.

| Colonne | Contenu observé | Ce que ça devient |
|---|---|---|
| `client` | SOUMBOUGMA KARIM, SANA HAROUNA… | le nom du propriétaire |
| `MOTO` | SR-115, GEAR, AEROX, SR-110 | le modèle |
| `CHASIS` | 10RY243294, 70SJ022946… | le numéro de châssis |
| `Reci` | √ / OK | reçu remis — **hors périmètre**, déjà porté par la vente |
| `Credit` | vide sur les lignes vues | **hors périmètre**, la vente le porte |
| `RECEPTION` | 70518381, 7384759, 4026506 | le **téléphone** de celui qui vient chercher |
| `retrait` | 29/07/2026, 09/08/2026 | la **date de remise** |
| `Depot` | 18/08/2025, identique sur tout un bloc | le dépôt — c'est le **paquet** de S53 |
| `Immatriculation` | 7078 7DQ 04, 5011 1DQ 08 | le **numéro de plaque** obtenu |
| `TRANSITE` | BOHARY | le **prestataire** |

Trois enseignements, et ils commandent la suite.

**Le dépôt groupé existe déjà chez lui.** Une même date sur tout un bloc : c'est le geste que
S53 a modélisé en paquet. Rien à refaire de ce côté.

**Entre le dépôt et le retrait, il se passe presque un an** (18/08/2025 → 29/07/2026). Un dossier
n'est pas une file qu'on vide dans la semaine : la liste s'allonge, et « en retard » au sens de
S53 — la date annoncée dépassée — n'est pas le signal principal. L'écran doit rester lisible à
plusieurs centaines de lignes.

**`Immatriculation` est un résultat, pas une étape.** S48 avait retiré la plaque du dossier parce
qu'elle s'obtient avec la carte grise ; le fichier le confirme. Elle revient donc comme un champ
qu'on **inscrit au retour**, et non comme un second papier à poursuivre.

---

## Critères d'acceptation

### L'espace

- [ ] Un troisième métier existe, `cartes_grises`, libellé **« Carte grise et plaque »**, et se
      coche en déclarant une boutique comme les deux autres.
- [ ] Une boutique qui porte ce métier apparaît dans la plaque jaune et ouvre l'espace du même nom.
- [ ] L'espace porte deux écrans : les **dossiers** (en cours et historique) et les
      **prestataires**. Rien d'autre.
- [ ] Depuis une boutique motos, l'espace n'apparaît pas : les dossiers restent dans l'espace Motos
      pour ceux qui vendent.

### Ce que voit la personne des cartes grises

- [ ] Un gérant dont la boutique porte le métier `cartes_grises` lit les dossiers de **toutes** les
      boutiques, et peut les faire avancer.
- [ ] Il ne lit **ni** les ventes, **ni** le stock, **ni** les pièces d'aucune boutique. Prouvé
      par un test de règles.
- [ ] Il ne lit aucune caisse : l'espace n'en a pas. L'avance se note sur le dépôt, et l'espace
      en donne les totaux.
- [ ] Il ne voit ni prix d'achat ni marge : le mur de D2 ne bouge pas.
- [ ] Un gérant motos continue de ne voir que les dossiers de sa boutique.

### Le dossier

- [ ] Les dossiers vivent dans une collection à eux, `dossiersCarteGrise`, et non plus sous la vente.
- [ ] Un dossier né d'une vente porte le lien vers elle, son client et sa moto.
- [ ] Un dossier **extérieur** s'ouvre sans vente : on y tape un nom de propriétaire, un modèle et
      un châssis. Il appartient à la boutique des cartes grises.
- [ ] Au retour du prestataire, on inscrit le **numéro d'immatriculation**.
- [ ] Un dossier revenu se **remet** : on saisit le nom et le téléphone de celui qui vient le
      chercher, et la date. Les deux sont du texte libre — ce n'est pas toujours l'acheteur.
- [ ] La remise est la dernière étape : un dossier remis sort des dossiers en cours.

### Le dépôt

- [ ] Confier un paquet continue de marcher, depuis la fiche d'un prestataire comme depuis la liste.
- [ ] Le dépôt n'écrit **plus** de sortie de caisse, d'où qu'il parte (arbitrage ci-dessus).
- [ ] L'espace affiche le total des avances versées, par prestataire et sur une période.
- [ ] Un dossier extérieur se confie dans les mêmes paquets qu'un dossier de vente.
- [ ] Un dossier seul se confie sans passer par un paquet.

### La migration

- [ ] Chaque `ventesMotos/{id}/documents/carte_grise` existant donne un `dossiersCarteGrise/{id}`
      portant les mêmes faits, le nom du client et le libellé de la moto résolus.
- [ ] La migration est **idempotente** : la relancer ne crée pas de doublon et n'écrase pas un
      dossier déjà avancé.
- [ ] Elle **ne supprime rien**. Les documents d'origine restent en place, et leur retrait est une
      opération distincte, décidée après vérification.
- [ ] Elle se lance d'abord sur les émulateurs, et sur `sandwini` seulement sur accord explicite du
      commanditaire.

### États et sécurité

- [ ] Vide, chargement, erreur couverts sur chaque écran — `DESIGN.md` §10.
- [ ] Chaque cloisonnement est prouvé par un test de règles, sinon il n'existe pas.

---

## L'avance ne passe plus par la caisse — arbitrage du 21 octobre 2026

**Décision du commanditaire, rapportée du client : « pas de caisse pour carte grise, elle est
dissociée des autres caisses ; ici ce sera uniquement pour mettre les montants des avances, pas
d'entrée d'argent. Pas de liaison de comptabilité. »**

Ce que ça change, et il faut l'écrire parce que **cela renverse un critère de S53** : le dépôt
d'un paquet n'écrit plus de ligne de sortie dans le journal de caisse. L'avance vit sur le paquet
et sur le dossier, et l'espace en donne les totaux — par prestataire, et sur une période.

**La conséquence, dite une fois.** L'argent remis à un prestataire cesse d'apparaître dans le
journal de caisse de la boutique. Qui lit ce journal ne verra plus ces sorties : il faudra ouvrir
l'historique des départs pour les retrouver. C'est le choix du client, et il se tient — ce n'est
pas sa trésorerie de comptoir, c'est une avance sur un travail. Mais le journal cesse d'être le
seul endroit où l'argent qui sort est écrit, et c'est un fait à connaître avant de lire un écart.

**Et une seule règle, pas deux.** Le dépôt cesse d'écrire en caisse **partout**, pas seulement
depuis l'espace des cartes grises. Deux comportements selon l'écran d'où part le geste
produiraient deux vérités sur le même billet — exactement ce que le dépôt refuse ailleurs.

Les avances déjà écrites en caisse restent : on ne retouche pas un journal.

## Hors périmètre

- **Le reçu et le crédit** des colonnes `Reci` et `Credit` : ils appartiennent à la vente, qui les
  porte déjà. Les recopier sur le dossier ferait deux vérités.
- **La plaque comme second document à suivre.** Elle est un résultat inscrit au retour (S48, confirmé
  par le fichier).
- **Un troisième rôle.** Le produit en a deux, et c'est délibéré (`prompt.md` §4). La permission
  vient du **métier de la boutique** à laquelle le compte est rattaché, pas d'un rôle nouveau.
- **La suppression des anciens documents de dossier.** Opération distincte, après vérification.
- **Le portail prestataire** (S56) : il continue de lire ce qu'il lit. Son adaptation à la nouvelle
  collection est une tâche de ce lot, pas une refonte.

---

## Notes techniques

### Le métier plutôt qu'un rôle

`METIERS` passe à trois valeurs ; `firestore.rules` ouvre `metiers.hasOnly([...])` à la troisième.
C'est l'axe que l'application emploie déjà pour décider ce qu'un compte voit (D62) : s'y brancher
évite d'inventer une garde parallèle.

La permission se lit dans les règles à partir de la boutique du compte :

```
function traiteLesCartesGrises() {
  return estGerant()
      && boutiqueDuCompte() != ''
      && exists(/databases/$(database)/documents/boutiques/$(boutiqueDuCompte()))
      && get(/databases/$(database)/documents/boutiques/$(boutiqueDuCompte()))
           .data.metiers.hasAny(['cartes_grises']);
}
```

Même motif que `boutiqueExiste`, qui fait déjà ce `get`. Le surcoût est d'une lecture par requête,
et il n'y en a qu'une : l'espace ne porte qu'une collection.

**Attention — c'est le point le plus délicat du lot.** Cette fonction **élargit** une lecture à
toutes les boutiques. Elle ne doit apparaître que dans la règle de `dossiersCarteGrise`, jamais dans
un chemin récursif, et un test doit prouver qu'un gérant cartes grises se voit refuser les ventes,
le stock, la caisse et les pièces.

### La collection

```
dossiersCarteGrise/{id}
  boutiqueId        la boutique d'origine ; celle des cartes grises pour un dossier extérieur
  venteId           null pour un dossier extérieur
  origine           "vente" | "exterieur"
  clientNom         recopié de la vente, ou tapé
  motoLibelle       marque + modèle, recopié ou tapé
  numeroChassis
  statut            a_faire | chez_prestataire | revenu_magasin | remis | non_applicable
  prestataireId · prestataireNom · deposeLe · avance · disponibleLe
  immatriculation   écrit au retour
  revenuLe          écrit au passage à revenu_magasin
  remisLe · remisANom · remisATelephone
  + champs d'audit
```

`boutiqueId` reste porté par le document : c'est lui qui décide ce qu'un gérant motos voit, et une
requête ne sait filtrer que sur les champs du document.

**`revenuLe` est écrit cette fois-ci**, au lieu d'être relu dans le journal comme S58 l'a fait. La
raison : le journal servait à dater le passé ; ici le dossier est neuf, et un champ coûte moins
qu'une lecture de groupe à chaque affichage. Le journal des passages reste écrit, et reste la
preuve.

### La machine à états

`statut` gagne `remis`, qui suit `revenu_magasin` et est terminal. `dossierCloturable` suit : la
carte grise est close quand elle est **remise**, non plus quand elle revient. C'est un changement de
définition — il faut vérifier les écrans qui en dépendent (`PaquetsEnCours`, `etatPaquet`,
`historiqueDesDeparts`, le portail S56).

`etatPaquet` compte « dehors » sur `chez_prestataire` : inchangé. Un paquet reste soldé au **retour**
des cartes, pas à leur remise — le prestataire a fini son travail, la remise au client est une autre
histoire.

### La migration

Un script sous `scripts/`, lancé avec le SDK Admin, qui lit tous les
`ventesMotos/{id}/documents/carte_grise` par groupe de collections, résout le client et la moto, et
écrit `dossiersCarteGrise/{venteId}`.

- **Identifiant = `venteId`** : c'est ce qui rend la reprise idempotente sans table de
  correspondance.
- **`create` et non `set`** sur un dossier déjà présent : relancer ne doit pas écraser un dossier
  qu'on aurait fait avancer entre-temps.
- **Aucune suppression.** Les documents d'origine restent lisibles ; leur retrait se décide après.
- **Émulateurs d'abord**, puis `sandwini` sur accord explicite (règle 6).

### Ce qui se réutilise tel quel

`ConfierPaquetModal`, `ConfierDepuisPrestataire`, `confierPaquet`, `historiqueDesDeparts`,
`cartesAConfier`, `PaquetsEnCours`, l'écran des prestataires de S58. Ils travaillent tous sur des
cartes grises : seule leur source change de collection.

### Découpage proposé

1. **Le métier et l'espace** — `METIERS`, règles, navigation, renommage. Rien ne bouge en données.
   L'espace reste ouvert aux boutiques **motos** en plus de la nouvelle : fermer d'un coup ce que
   S58 vient d'ouvrir aux gérants serait une régression gratuite, et la refermer plus tard ne coûte
   qu'une ligne.
2. **La collection et la migration** — domaine, dépôt, script, tests de règles. Lancé sur émulateurs.
3. **Les écrans basculent** — dossiers, paquets, portail lisent la nouvelle collection.
4. **Le dossier extérieur, l'immatriculation, la remise** — les trois ajouts du client.

Chaque lot laisse l'application en état de marche. Le 3 est le seul qui demande que le 2 soit
passé en production.
