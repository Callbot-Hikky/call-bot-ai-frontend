# Hikky — 03 · Molecules

**Objectif** : assembler les atoms (02) en composants réutilisables porteurs de sens.
Standalone, signals, OnPush, tokens (01).

**Dépendances** : 02 (atoms). Emplacement : `src/app/shared/components/molecules/`.

---

## Liste des molecules

### 1. `hk-stat-card` (KPI)
- Carte d'indicateur clé. Contenu : libellé (12px/500 uppercase, `--text-muted`), **grand
  chiffre** (display 36px, mono/tabular, `--text-strong`), variation optionnelle (↑/↓ + %, en
  vert/rouge sémantique), sparkline optionnelle (placeholder pour l'instant, vraie sparkline en
  post-POC — cf. 07). Icône discrète en coin. Fond `--surface`, ombre `--shadow-sm`, padding 24.
- Inputs : `label`, `value`, `delta?`, `deltaDirection?`, `icon?`. **Un seul chiffre fort par
  carte** (principe « single trusted number »).

### 2. `hk-filter-bar`
- Barre de filtres d'une liste. Composée de : un **segmented control** de statut (Tous / En
  attente / Confirmée / Installée / …) OU un select Spartan si trop d'options ; un `hk-input`
  de recherche (loupe) par nom/téléphone ; un sélecteur de date (aujourd'hui par défaut).
  Émet des events `statusChange`, `searchChange`, `dateChange` (pas de `<form>`).
- Le filtre actif est visuellement marqué (fond `--green-100`, texte `--green-700`).

### 3. `hk-nav-item`
- Élément de navigation de la sidebar. Icône (toujours visible) + libellé (masqué quand sidebar
  repliée). États : default, hover (`--surface-2`), **active** (fond `--green-100`, texte
  `--green-700`, barre verticale `--primary` 3px à gauche). Quand replié : icône centrée +
  `hk-tooltip` avec le libellé. Inputs : `icon`, `label`, `route`, `collapsed`.

### 4. `hk-profile-menu`
- Avatar (`hk-avatar`) + nom + nom du restaurant, cliquable → dropdown Spartan : item Profil,
  Paramètres, (Thème — placeholder pour dark futur), séparateur, Déconnexion (`log-out`, ton
  sobre). En bas de sidebar. Quand sidebar repliée : avatar seul + tooltip, dropdown s'ouvre au
  clic.

### 5. `hk-reservation-row`
- Une ligne de réservation dans la liste. Colonnes : heure (mono), nom client, téléphone (mono),
  couverts (mono + icône users), table, `hk-badge` statut, actions rapides (`hk-icon-button` :
  confirmer ✓, annuler ✗, appeler ☎ — avec tooltips). **Hover** : fond `--surface-2`, sans
  déplacer le layout (cf. 07). Clic sur la ligne (hors actions) → ouvre le détail (drawer, 05).
- Inputs : `reservation` (typé, cf. 06). Outputs : `confirm`, `cancel`, `call`, `open`.

### 6. `hk-empty-state`
- État vide élégant : icône douce, titre court, sous-texte, action optionnelle. Ton sobre
  (« Aucune réservation pour cette date » + bouton « Ajouter »). Pas de dessin enfantin.

### 7. `hk-section-header`
- En-tête de section : titre (h2) + sous-texte optionnel + slot actions à droite. Espacement
  cohérent (marge bas 16px).

### 8. `hk-toast` (feedback)
- Notification transitoire après action (Confirmé / Annulé / Erreur). Apparition fondu + slide,
  auto-dismiss ~3s, couleur sémantique discrète. Ton adulte (« Réservation confirmée »).
  Z `toast`. Service `ToastService` pour le déclencher depuis n'importe où.

---

## Tâche
1. Implémenter chaque molecule à partir des atoms, standalone + OnPush.
2. Brancher `hk-toast` à un `ToastService` (signal de file de toasts).
3. Étendre la page démo (`/_molecules`) avec chaque molecule dans ses états (incl. row au hover,
   filtre actif, stat-card avec et sans delta, empty-state).

## Critères d'acceptation
- `hk-reservation-row` : hover ne décale rien ; actions ont des tooltips ; clic hors actions
  émet `open`.
- `hk-stat-card` : un seul grand chiffre, tabular, delta coloré sémantiquement.
- `hk-filter-bar` émet bien les 3 events sans `<form>`.
- `hk-nav-item` en mode replié affiche l'icône + tooltip et garde l'état actif lisible.

## À NE PAS faire
- Pas de logique métier/HTTP ici (les molecules sont présentationnelles ; les données viennent
  des écrans/services). Pas de couleur de statut sans libellé.
