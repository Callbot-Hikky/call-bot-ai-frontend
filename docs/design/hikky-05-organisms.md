# Hikky — 05 · Organisms (contenu)

**Objectif** : les blocs composés propres au métier, assemblés depuis les molecules (03).
Standalone, signals, OnPush. (Sidebar et Header sont traités en 04.)

**Dépendances** : 03 (molecules). Emplacement : `src/app/shared/components/organisms/`.

---

## 1. `hk-stat-row`
- Rangée responsive de `hk-stat-card` (KPI) en haut d'un écran. Grille auto-fit : 4 colonnes
  desktop → 2 → 1 (mobile). Gap 24px. Inputs : tableau de stats. Affiche un **skeleton** (rangée
  de cartes grisées) pendant le chargement (cf. 07).

## 2. `hk-reservation-list`
- Liste/table des réservations, style **Linear** : calme, dense mais aérée, en-têtes de
  colonnes discrets, lignes = `hk-reservation-row`. 
- En-tête de colonnes (sticky sous le header de page) : Heure · Client · Téléphone · Couverts ·
  Table · Statut · (actions). Tri optionnel sur Heure / Statut (post-POC OK).
- États :
  - **Chargement** → 6–8 `hk-skeleton` en forme de lignes (jamais de spinner).
  - **Vide** → `hk-empty-state`.
  - **Erreur** → message sobre + bouton « Réessayer ».
- Densité confortable, séparateurs très légers (`--border`), pas de zébrage agressif.
- Inputs : `reservations`, `loading`, `error`. Outputs : relaie `confirm/cancel/call/open` des
  rows.

## 3. `hk-reservation-detail-drawer`
- **Progressive disclosure** : le clic sur une ligne ouvre un drawer latéral (depuis la droite,
  slide + fondu, largeur ~420px, overlay assombri, fermeture Echap / clic extérieur). Z `drawer`.
- Contenu : nom client (titre), `hk-badge` statut, bloc infos (date/heure, couverts, table,
  téléphone en mono cliquable), notes éventuelles, historique d'appel lié (placeholder),
  **actions** (Confirmer / Annuler / Appeler / Modifier) en bas. Ton sobre.
- Sur mobile : le drawer passe en **bottom-sheet** pleine largeur (cf. 08).
- Inputs : `reservation`, `open`. Outputs : actions + `close`.

## 4. `hk-page-header` (organisme d'écran)
- En-tête d'écran standard réutilisable : `hk-section-header` (titre + sous-texte) + zone
  d'actions (ex. sélecteur de date, bouton « Nouvelle réservation »). Cohérent sur tous les
  écrans.

---

## Tâche
1. Implémenter chaque organisme à partir des molecules, standalone + OnPush.
2. Gérer les trois états (loading/empty/error) dans `hk-reservation-list` avec skeletons.
3. Animer l'ouverture/fermeture du drawer (tokens motion), gérer Echap + clic extérieur +
   piège de focus (focus trap) pour l'accessibilité.
4. Démo (`/_organisms`) : liste en états loading/vide/rempli, et drawer ouvert.

## Critères d'acceptation
- La liste affiche des skeletons en chargement, jamais un spinner.
- Le drawer s'ouvre au clic sur une ligne, se ferme à Echap / clic extérieur, et piège le focus.
- Tout est aligné aux tokens ; les chiffres (heure, couverts, tél) sont en mono tabular.

## À NE PAS faire
- Pas d'appel HTTP ici : les organismes reçoivent leurs données en input. Pas de drawer sans
  gestion clavier (Echap + focus trap).
