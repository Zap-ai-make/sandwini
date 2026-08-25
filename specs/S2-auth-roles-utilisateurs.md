# S2 — Authentification, rôles et utilisateurs

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S1
```

---

## Objectif

Le responsable et les gérants se connectent avec leur e-mail et leur mot de passe. Le responsable crée
et désactive les comptes de ses gérants et leur attribue une boutique. Chacun ne voit ensuite que ce
que son rôle autorise.

---

## Critères d'acceptation

- [x] Connexion par e-mail et mot de passe ; message d'erreur générique en cas d'échec, sans dire si l'e-mail existe — vérifié en comparant un mot de passe faux et une adresse inconnue
- [x] Une session ouverte survit à la fermeture du navigateur et au mode hors ligne — vérifié par un test qui recharge réseau coupé
- [x] Déconnexion explicite, qui vide le cache Firestore local de l'appareil
- [x] Le responsable crée un gérant ; le compte reçoit ses custom claims `role` et `boutiqueId`, et son miroir dans `users/{uid}`
- [x] Le responsable désactive un gérant : compte coupé et jetons révoqués, donc les sessions déjà ouvertes se ferment aussi
- [x] Un gérant ne peut ni créer, ni modifier, ni voir la liste des utilisateurs — vérifié dans l'interface **et** par les règles
- [x] Un utilisateur ne peut pas modifier son propre rôle ni son `boutiqueId`, ni par l'interface ni par une écriture directe (tests de règles)
- [x] Les routes de `(app)` sont inaccessibles sans session ; les écrans réservés au responsable sont refusés au gérant — **mais par les règles Firestore et les Cloud Functions, pas par une session serveur : cf. D27**
- [x] Limitation des tentatives de connexion — assurée par Firebase Auth, doublée d'une pause visible après cinq échecs (D26)
- [x] États couverts : chargement, identifiants refusés, compte désactivé, hors ligne au moment de la connexion, permission refusée

**Vérification :** 25 tests unitaires, 24 tests de règles, 16 tests bout en bout. Rendu regardé en
clair et en sombre, mobile et bureau (`captures/`).

---

## Hors périmètre

Pas de réinitialisation de mot de passe en autonomie (le responsable régénère), pas de MFA, pas
d'inscription publique. Pas de gestion fine de permissions au-delà des deux rôles.

---

## Notes techniques

**Le rôle vit dans le custom claim, jamais dans un document.** `users/{uid}` est un miroir lisible par
l'interface ; les règles Firestore lisent le claim. Aucune écriture cliente n'est autorisée sur cette
collection — pas même pour le responsable — parce qu'un rôle modifiable depuis un navigateur n'est pas
un rôle. Seules les Cloud Functions y touchent, via le SDK Admin qui ne passe pas par les règles.

**Les deux seules opérations serveur du MVP** sont ici : créer un gérant et activer/désactiver un
compte. Elles ne fonctionnent pas hors ligne, et c'est assumé — on ne crée pas un compte au milieu
d'une vente. Tout le reste continue d'écrire directement dans Firestore.

**Le premier responsable** ne peut pas être créé par l'application, puisque `creerGerant` en exige
déjà un. `npm run amorcer` casse la boucle sur les émulateurs, comme le ferait un administrateur en
production depuis la console.

**Trois écarts, tous consignés :**

- D27 — « côté serveur » signifie règles Firestore et vérification dans les Cloud Functions, pas
  session serveur : une session serveur imposerait un aller-retour réseau à chaque navigation et
  casserait le hors-ligne.
- D28 — un gérant peut exister sans boutique jusqu'à S3, plutôt que d'avancer un morceau de S3 ici.
- D29 — le SDK Admin se charge à l'appel et non à l'import : au niveau du module, il dépassait le
  délai de découverte de l'émulateur et les fonctions n'étaient pas servies du tout.

**Ce que l'exécution a appris.** Les trois défauts de cette spec — fonctions non servies, démarrage à
froid de 20 secondes, régions vivantes confondues dans les tests — n'étaient visibles qu'en lançant.
Aucun n'aurait été trouvé par relecture.

---

Spec terminée : critères cochés, code vérifié (tests + rendu), revue des trois contrats passée,
commit effectué, statut mis à jour dans `specs/ROADMAP.md`.
