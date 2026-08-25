# S4 — Référentiels et paramètres entreprise

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S3
```

---

## Objectif

Le responsable renseigne une fois pour toutes les listes dans lesquelles piocheront les formulaires —
marques, modèles, provenances, types de frais, prestataires — ainsi que l'identité de l'entreprise qui
apparaîtra sur les reçus.

---

## Critères d'acceptation

- [ ] Le responsable gère `marques`, `modeles` (rattachés à une marque), `provenances`, `typesFrais`, `prestataires` : création, renommage, désactivation
- [ ] Un élément se désactive, ne se supprime jamais : les documents qui le référencent restent lisibles
- [ ] Un élément désactivé n'apparaît plus dans les listes de saisie mais reste affiché correctement dans l'historique
- [ ] Les modèles proposés sont filtrés par la marque choisie
- [ ] Paramètres entreprise : nom, logo, adresse, téléphones, mentions légales libres (D11) — utilisés par les reçus (S10)
- [ ] Le logo est envoyé dans Storage avec vérification du type réel et d'une taille maximale (`SECURITY.md` §5)
- [ ] Un prestataire porte nom, téléphone et les types de documents qu'il traite ; son token vit dans une sous-collection privée illisible par un gérant (D6, test de règles)
- [ ] Le gérant lit tous ces référentiels et n'en modifie aucun
- [ ] Les référentiels sont disponibles hors ligne : un formulaire de vente ouvert sans réseau propose les mêmes listes
- [ ] États couverts : liste vide, chargement, échec d'enregistrement, hors ligne

---

## Hors périmètre

`categoriesPieces` (arrive avec S20). Messages WhatsApp paramétrables (S14). Seuil d'inactivité des
tranches paramétrable (S9 pose une valeur par défaut de 30 jours ; le rendre réglable est post-MVP).
La page publique du prestataire et la révocation de son token (S15).

---

## Notes techniques

Ces référentiels sont sept fois le même écran. Un composant de liste éditable générique se justifie
ici — c'est l'un des rares endroits où l'abstraction est moins chère que la répétition. Mais elle se
construit sur les cinq cas réels, pas « pour plus tard » (`ARCHITECTURE.md` §1).

Le paramétrage entreprise est un document unique ; il est lu par les reçus, donc il doit être en cache
hors ligne au moment où un reçu s'imprime. À charger au démarrage de la session, pas à la demande.

Le logo est le seul envoi de fichier du MVP. Il est administratif : le responsable le pose une fois,
en ligne. Aucun écran de saisie n'en dépend, ce qui évite le problème posé par D14.
