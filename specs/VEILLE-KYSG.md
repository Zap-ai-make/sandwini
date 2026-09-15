# Veille concurrentielle — KYSG (logiciel actuel du client)

> **Nature de ce document.** Analyse du logiciel que le client (ETS SANDWIDI ET FRERES)
> utilise aujourd'hui, `https://kysg.161-97-88-72.sslip.io/`. Objectif : comprendre
> pourquoi « ça répond aux attentes » et en tirer ce qu'on doit rattraper ou faire mieux.
> Tout ici est **observé** (code client, API en lecture seule) — aucune donnée client
> nominative n'est reproduite. Accès obtenu avec les identifiants fournis par le client,
> **en lecture seule** (aucune écriture, aucune suppression).

---

## 1. Ce qu'est KYSG

**KYSG — Kraft Green Yield Solution.** SaaS multi-locataire, PHP/Apache derrière Caddy,
sessions PHP classiques. Deux produits vendus séparément :

| Produit | Prix | Périmètre annoncé |
|---|---|---|
| Gestion Motos | 15 000 F/mois | Ventes, stock, clients, crédits, factures, multi-agences |
| Gestion Plaques | 10 000 F/mois | Dossiers d'immatriculation, groupes de dépôt, notifications clients |
| Pack complet | 20 000 F/mois | Les deux |

Arguments commerciaux : app aux couleurs du client (thèmes), logo, **base isolée par
entreprise**, sauvegarde quotidienne, utilisateurs illimités.

**Deux niveaux d'authentification distincts :**
1. **Portail** (`connexion.php`) — le compte *entreprise* (espace, abonnement, équipe, thème, logo).
2. **App moto** (`api/auth.php`) — les comptes *employés* : `admin` (Administrateur) et
   `vendeur1`… gérés depuis « Mon équipe ». C'est un deuxième login, avec ses propres rôles.

Le client n'a que **Gestion Motos** actif (Plaques : essai expiré). Thème « Carbone Rouge ».

---

## 2. Volumes réels observés (production du client)

Un vrai commerce, pas une démo :

- **322 motos** au total — 165 en stock, 157 vendues
- **229 motos sans CMC** (document manquant) — c'est leur principal point de tension
- **158 ventes**, CA cumulé **167 295 000 F**, encaissé 162 825 000 F, **reste à percevoir 4 470 000 F**
- 2 ventes impayées, 9 partielles
- **21 arrivages**, **125 clients**
- Marges fines : ex. observé prix de vente 1 135 000 F pour un coût 1 125 000 F (≈ 10 000 F de marge)
- Top marques : SIRIUS 115 (61), GEAR 125 (24), AEROX 155 (12), FINN 115 (10)

Enseignement : **métier de volume à faible marge unitaire**. La rapidité de saisie et le
suivi des restes à percevoir comptent plus que la finesse comptable.

---

## 3. Modèle de données (schémas observés via l'API)

```
MOTO    : id, marque, numeroCadre, localite, prixAchat, groupeId,
          cmcStatut, statut, agence, dateCreation
VENTE   : id, motoId, acheteurNom, acheteurPrenom, acheteurTelephone,
          prixTotal, montantPaye, modePaiement, vendeur, agence, notes,
          localite, motoCouleur, dateVente, statut,
          motoMarque, motoNumeroCadre, motoPrixAchat, paiements[]
PAIEMENT: id, venteId, montant, modePaiement, date, notes
CLIENT  : id, nom, prenom, telephone, adresse, nbVentes, dateCreation
GROUPE  : id, nom, description, expediteur, dateArrivee, dateCreation   (= « arrivage »)
```

Points de conception :
- La **vente recopie un instantané de la moto** (marque, cadre, `motoPrixAchat`) —
  dénormalisation : la vente reste lisible même si la moto change ensuite.
- **Statut de vente = `impaye` | `partiel` | `paye`.** Le crédit est déduit de
  `prixTotal − montantPaye`, alimenté par les `paiements[]` (versements datés).
- Une moto porte son **coût** (`prixAchat`) et son **statut** (`en_stock` / `vendue`…).
- **Multi-agence** : `agence` sur moto et vente (siège / annexe), avec **transferts**
  (`motos.php?action=transferer` / `?action=transferts`).

---

## 4. Le geste de vente (leur cœur)

**Assistant en 4 étapes**, pensé pour le comptoir :

1. **Rechercher** la moto par numéro de cadre (parmi le stock)
2. **Sélectionner**
3. **Renseigner** l'acheteur : Nom\*, Prénom, Téléphone, Localité, Couleur, **Mode de
   paiement\*** (Espèces / Mobile Money / Virement / Chèque), **Prix de vente\***,
   **Montant versé maintenant**, Notes
4. **Confirmer**

Un **seul champ** — « Montant versé maintenant » — encode comptant vs crédit : s'il est
inférieur au prix, la vente naît « partiel »/« impayé » et la suite se règle en versements.
Il existe aussi une **vente groupée** (plusieurs motos, un même client, une opération).

C'est direct, peu de champs, et ça colle exactement à nos specs **S8 (vente moto)** et
**S9 (versements)** — mais réduit à sa version la plus simple (voir §6).

---

## 5. Ce qu'ils font bien (à s'inspirer)

1. **Suivi CMC trié par risque.** L'écran « Suivi CMC » (couverture documentaire du parc)
   ne liste pas bêtement : il **priorise par risque** — « vendue sans document » en tête
   (le client attend sa carte grise), puis « en stock > 2 mois », « > 1 mois ». File
   prioritaire, recherche par cadre/marque, compteur de couverture. Directement pertinent
   pour notre **S11 (dossier documents)** et nos dossiers plaque / carte grise.
2. **Arrivage = lot d'un expéditeur.** On crée le lot (nom, expéditeur, date), puis on
   **saisit les motos en masse** avec marque et prix communs, et on suit l'**écoulement**
   du lot. Modèle net pour notre **S5 (stock motos)** et **S30 (dépôt prestataire)**.
3. **Vente groupée** — plusieurs motos au même client en une passe. Petit geste, gros gain
   au comptoir. On ne l'a pas.
4. **Transferts inter-agences** de motos, tracés. Utile si le client a plusieurs points.
5. **Restes à percevoir mis en avant** : débiteurs classés par montant restant, accès
   direct « ventes impayées » depuis le tableau de bord. La créance est un premier plan,
   pas une info enfouie.
6. **Import clients en masse** (`clients.php?action=import`) — reprise de l'existant.
7. **Deux menus selon le rôle** (Responsable complet / Vendeur restreint) — même logique
   que notre gérant/responsable, mais assumée jusque dans deux jeux d'écrans distincts.

---

## 6. Où nous sommes plus forts (à défendre et valoriser)

1. **Hors-ligne.** KYSG est du PHP serveur classique → **aucune tolérance à la coupure
   réseau**. Notre résilience hors-ligne (D66) est un différenciateur réel : au comptoir,
   sur réseau instable, notre app continue de saisir là où la leur s'arrête. À ne pas
   diluer, mais à ne pas sur-architecturer non plus.
2. **Cloisonnement du coût et de la marge.** Chez KYSG, le **rôle vendeur voit le coût
   (`prixAchat`)** : il le saisit à la réception, la liste des motos l'affiche, et il sert
   même de **prix de vente par défaut**. Notre **D2** fait l'inverse — coût et marges hors
   de portée des gérants via sous-collections `prive/`, prouvé par des tests de règles.
   Si la confidentialité des marges est une exigence du client (elle l'est chez nous), **KYSG
   ne la tient pas** ; c'est un argument fort pour nous.
3. **Crédit vs tranches.** KYSG ne modélise que le **crédit** (moto livrée, le client doit :
   payé/partiel/impayé). Il n'a **pas** notre notion de **tranches** (moto retenue au
   magasin, le magasin détient l'argent — prompt.md §13). Notre modèle est plus fidèle au
   métier sur cet axe. À confirmer que le client utilise bien les deux notions.

---

## 7. Correspondance avec nos specs + pistes

| Domaine KYSG | Notre spec | Écart / piste |
|---|---|---|
| Vente 4 étapes, montant versé | S8, S9, **S21/S22** (en cours) | Aligné. S'inspirer de la sobriété (peu de champs) |
| Vente **groupée** | — | **Manque.** Candidate pour CAHIER-DU-RESTE |
| Arrivage = lot + saisie en masse | S5, S30 | Formaliser le lot (expéditeur, date, écoulement) |
| **Suivi CMC par risque** | S11 | S'inspirer du tri par risque (vendue sans doc → ancienneté) |
| Transferts inter-agences | S3 (boutiques) | Vérifier si le client en a besoin (multi-agence) |
| Restes à percevoir au 1er plan | S9, S24 | Débiteurs classés par montant, accès direct impayés |
| Import clients | S6 | Reprise de l'existant en masse |
| Coût visible au vendeur | **D2 (inverse)** | **Notre avantage** — cloisonnement prouvé |
| Crédit uniquement | crédit **+ tranches** | **Notre avantage** — modèle plus riche |

**Trois pistes prioritaires à discuter :**
1. Reprendre le **suivi CMC trié par risque** — peu coûteux, fort impact perçu (229 motos
   sans document chez ce client : c'est LE sujet).
2. Ajouter la **vente groupée** au geste de vente (S21/S22).
3. Garder nos deux différenciateurs — **hors-ligne** et **cloisonnement du coût** — comme
   arguments explicites face à KYSG.

---

## 8. Hygiène d'accès

- Accès effectué **en lecture seule** (GET), aucune écriture ni suppression sur le compte
  du client.
- Les identifiants (portail + app) ont transité par la conversation : **à faire changer
  par le client** une fois la veille terminée.
- L'app dispose d'une réinitialisation de mot de passe côté portail (« Mon équipe ») —
  **non utilisée** (opération sensible qui déconnecterait l'équipe).
