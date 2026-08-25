# S2 — Authentification, rôles et utilisateurs

```
Statut     : à faire
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

- [ ] Connexion par e-mail et mot de passe ; message d'erreur générique en cas d'échec, sans dire si l'e-mail existe (`SECURITY.md` §8)
- [ ] Une session ouverte survit à la fermeture du navigateur et au mode hors ligne : le gérant ne se reconnecte pas chaque matin, et surtout pas sans réseau
- [ ] Déconnexion explicite, qui vide le cache Firestore local de l'appareil
- [ ] Le responsable crée un gérant (nom, e-mail, boutique) ; le compte est créé avec ses custom claims `role` et `boutiqueId`, et son miroir dans `users/{uid}`
- [ ] Le responsable désactive un gérant : le compte ne peut plus se connecter et ses écritures sont refusées par les règles
- [ ] Un gérant ne peut ni créer, ni modifier, ni voir la liste des utilisateurs
- [ ] Un utilisateur ne peut pas modifier son propre rôle ni son `boutiqueId`, ni par l'interface ni par une écriture directe (test de règles)
- [ ] Les routes de `(app)` sont inaccessibles sans session ; les routes réservées au responsable sont refusées au gérant côté serveur, pas seulement masquées
- [ ] Rate-limiting sur la connexion (`SECURITY.md` §3)
- [ ] États couverts : chargement, identifiants refusés, compte désactivé, hors ligne au moment de la connexion

---

## Hors périmètre

Pas de réinitialisation de mot de passe en autonomie (le responsable régénère), pas de MFA, pas
d'inscription publique. Pas de gestion fine de permissions au-delà des deux rôles.

---

## Notes techniques

Les custom claims ne se posent que côté serveur : une Cloud Function appelable, réservée au
responsable, crée l'utilisateur, pose `role` et `boutiqueId`, puis écrit `users/{uid}`. C'est la seule
opération du MVP qui passe par une Cloud Function depuis l'interface — elle est admissible parce
qu'elle est administrative et non urgente, donc jamais bloquante hors ligne (`prompt.md` §3.4).

Piège à traiter : un claim modifié n'est pris en compte qu'après rafraîchissement du jeton. Prévoir un
`getIdToken(true)` après changement de rôle, et ne pas se fier au claim local pour autoriser — les
règles Firestore tranchent.

Le cache Firestore local contient les données d'une boutique : le vider à la déconnexion n'est pas du
zèle, c'est ce qui empêche un gérant de lire les données d'un autre sur un appareil partagé.

`lib/domain` reçoit les types `Role` et `Utilisateur` ; la vérification « ce rôle peut-il faire ceci »
est une fonction pure testée, réutilisée par l'interface et par les Route Handlers.
