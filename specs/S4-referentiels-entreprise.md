# S4 — Référentiels et paramètres entreprise

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S3
```

---

## Objectif

Le responsable saisit une fois le vocabulaire de la maison — marques, modèles, provenances, types de
frais, prestataires — et l'identité de l'entreprise. Les écrans de saisie des specs suivantes
choisissent alors dans des listes au lieu de laisser taper du texte libre, et les reçus portent le
nom, l'adresse et le logo de l'entreprise.

---

## Critères d'acceptation

- [x] Le responsable saisit les coordonnées de l'entreprise : nom, adresse, deux téléphones, numéro d'identification
- [x] Le responsable dépose un logo ; il s'affiche, se remplace et se retire
- [x] Le logo reste disponible **sans réseau** — il sera imprimé sur des reçus hors ligne (D35)
- [x] Le responsable gère les marques, et les modèles rattachés à une marque
- [x] Le responsable gère les provenances et les types de frais
- [x] Le responsable gère les prestataires : nom, téléphone, et les types de documents qu'ils traitent
- [x] Une entrée de référentiel se désactive, jamais ne se supprime : des motos et des dossiers la citeront
- [x] Toutes ces saisies fonctionnent hors ligne — écritures Firestore directes, y compris le logo
- [x] Un gérant lit les référentiels et l'entreprise, mais n'en modifie aucun — vérifié dans l'interface **et** par les règles
- [x] États couverts : vide, chargement, erreur de lecture, entrée désactivée, logo absent, logo illisible, permission refusée

**Vérification :** 65 tests unitaires, 77 tests de règles, 33 tests bout en bout. Rendu regardé en
clair et en sombre, mobile et bureau (`captures/`).

---

## Hors périmètre

Pas de **token prestataire** ni de page publique : c'est S15, et le circuit fonctionne sans, à la
main. Le champ n'existe pas au contrat des règles — un secret ne se fabrique pas dans un navigateur.

Pas de **catégories de pièces** (S20), pas de **messages WhatsApp** (S14).

Pas de **seuil d'inactivité des tranches** (D37) : il n'a d'effet qu'en S9, et un réglage qui ne
change rien est pire qu'un réglage absent.

Pas de suppression : on désactive.

---

## Notes techniques

**Le logo vit dans Firestore, pas dans Storage** (D35). Les reçus doivent s'imprimer sans réseau
(`prompt.md` §10) et Storage n'a pas de file d'attente hors ligne (D14). Réduit à 512 pixels et
encodé en `data:`, le logo voyage avec le cache Firestore. Taille bornée côté domaine **et** côté
règles, à 200 000 caractères.

**L'identifiant est tiré au sort, pas dérivé du nom** (D36) — l'inverse du code de boutique (D30),
et pour une raison précise : un nom de marque se corrige, un code de boutique non. L'unicité est
donc vérifiée à la saisie sur une forme réduite qui ignore la casse et les accents.

**Un modèle ne devient jamais orphelin.** Les règles vérifient l'existence de sa marque avec
`exists()` et interdisent d'en changer.

**Trois référentiels ont exactement la même forme** — provenances, types de frais, marques : un nom,
un état. Un seul composant les sert, et chaque page lui passe ses propres mots. En inventer trois
variantes aurait été de la décoration (`DESIGN.md` §7).

**Les référentiels sont communs à toutes les boutiques**, comme le fichier clients (D16) : une marque
n'appartient pas à un point de vente.

---

Spec terminée : critères cochés, code vérifié (tests + rendu), revue des trois contrats passée,
commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
