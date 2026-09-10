"use client";

import { useEffect, useState } from "react";

export type MiseAJour = {
  /** Une version plus récente est installée et attend de pouvoir prendre la main. */
  enAttente: boolean;
};

/**
 * Sait si une version plus récente attend sur cet appareil (S34).
 *
 * **Pourquoi ce n'est pas une requête réseau.** Tout se lit dans le registre du
 * service worker, que le navigateur tient à jour tout seul : `registration
 * .waiting` non nul veut dire qu'un nouveau paquet est téléchargé, installé, et
 * n'attend plus qu'un rechargement. L'écran reste donc juste hors ligne — il
 * dira « une version attend » même sans réseau, ce qui est exact : elle a été
 * téléchargée avant la coupure.
 *
 * **Pourquoi on relève à deux endroits.** `registration.waiting` couvre le cas
 * où la version attendait déjà avant l'ouverture de l'écran ; l'événement
 * `updatefound` couvre celui où elle arrive pendant qu'on le regarde. N'écouter
 * que l'événement laisserait passer le cas le plus fréquent — un gérant qui
 * ouvre les réglages *parce qu'*on vient de lui demander sa version.
 *
 * **Pourquoi on redemande au retour sur l'onglet.** Le navigateur ne cherche
 * une nouvelle version qu'à une navigation ; or cette application n'en fait
 * plus une seule après son chargement, et un poste de comptoir reste ouvert la
 * journée entière. Sans ce coup d'œil au retour de l'onglet, l'appareil qui a
 * le plus besoin d'une mise à jour serait le dernier à la voir.
 */
export function useMiseAJour(): MiseAJour {
  const [attendant, setAttendant] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    /* Ni en développement (Serwist n'y produit rien), ni sur un navigateur sans
       service worker : il n'y a alors jamais de version en attente, et c'est la
       bonne réponse. */
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let vivant = true;
    let registre: ServiceWorkerRegistration | null = null;
    let installant: ServiceWorker | null = null;

    const relever = () => {
      if (vivant) setAttendant(registre?.waiting ?? null);
    };

    /* Une version qui s'installe pendant qu'on regarde : elle ne compte qu'une
       fois passée à « installed », pas dès le début du téléchargement. */
    const surInstallation = () => {
      installant?.removeEventListener("statechange", relever);
      installant = registre?.installing ?? null;
      installant?.addEventListener("statechange", relever);
    };

    /* Chercher une nouvelle version coûte une requête et échoue sans réseau —
       sans conséquence : l'état affiché reste celui du dernier relevé. */
    const chercher = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void registre?.update().catch(() => undefined);
      }
    };

    void navigator.serviceWorker.getRegistration().then((trouve) => {
      if (!vivant || !trouve) return;
      registre = trouve;
      relever();
      surInstallation();
      trouve.addEventListener("updatefound", surInstallation);
      document.addEventListener("visibilitychange", chercher);
    });

    return () => {
      vivant = false;
      installant?.removeEventListener("statechange", relever);
      registre?.removeEventListener("updatefound", surInstallation);
      document.removeEventListener("visibilitychange", chercher);
    };
  }, []);

  return { enAttente: attendant !== null };
}
