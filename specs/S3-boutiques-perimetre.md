# S3 — Boutiques et sélecteur de périmètre

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S2
```

---

## Objectif

Le responsable déclare ses boutiques et bascule à tout moment entre « toutes les boutiques » et l'une
d'elles ; le gérant, lui, travaille toujours dans la sienne sans avoir à y penser.

---

## Critères d'acceptation

- [ ] Le responsable crée, modifie et désactive une boutique : nom, code de trois lettres, adresse, téléphone
- [ ] Le code boutique est unique, en majuscules, exactement trois lettres — il sert de préfixe aux numéros de reçus (S7), une erreur ici se propage partout
- [ ] Un sélecteur de périmètre est visible en permanence pour le responsable, avec « Toutes les boutiques » et chaque boutique active
- [ ] Le choix persiste d'un écran à l'autre et d'une session à l'autre sur le même appareil
- [ ] Le gérant ne voit pas de sélecteur : son périmètre est sa boutique, affiché en clair pour qu'il sache où il écrit
- [ ] Toute lecture de données opérationnelles est filtrée sur le périmètre courant, sans exception
- [ ] Une boutique désactivée disparaît du sélecteur et des formulaires de saisie, mais son historique reste consultable
- [ ] Un gérant ne peut lire ni écrire les données d'une autre boutique, y compris par une requête directe (test de règles, D7)
- [ ] États couverts : aucune boutique déclarée, chargement, hors ligne

---

## Hors périmètre

Pas de transfert de données entre boutiques (S17). Pas de comparaison inter-boutiques chiffrée (S24).
Pas de changement de boutique pour un gérant en cours de session.

---

## Notes techniques

Le périmètre courant est un contexte React unique, alimenté par le rôle et le sélecteur, et consommé
par tous les dépôts de `lib/repositories`. Un seul endroit décide du filtre `boutiqueId` : si chaque
écran le refait à la main, un oubli devient une fuite de données.

Le sélecteur se souvient du choix en stockage local — pas en cookie de session, pour rester lisible
hors ligne.

Le référentiel `boutiques` est petit et lu partout : il est chargé une fois et servi depuis le cache
Firestore, disponible hors ligne y compris au premier écran après reconnexion.

Attention au cas « toutes les boutiques » : Firestore ne sait pas faire un `OR` sur un champ sans
index adapté. Pour le responsable, l'absence de filtre `boutiqueId` est la requête — les règles
l'autorisent parce qu'il a accès total, pas par accident.
