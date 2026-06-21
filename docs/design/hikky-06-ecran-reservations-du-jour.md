# Hikky — 06 · Écran « Réservations du jour » (US 6.2)

**Objectif** : assembler le premier écran réel — celui de ta tâche frontend US 6.2 — dans le
shell (04) avec les organismes (05). C'est l'écran qui sert de vitrine au jury.

**Dépendances** : 04 (shell), 05 (organisms), 01–03. Emplacement :
`src/app/features/reservations/`.

> Rappel périmètre : cet écran consomme des données qui viendront du back (moteur de
> disponibilité US 2.3, alternatives US 2.4, dialogue de collecte US 2.1 — **tâches back**).
> Tant que le back n'existe pas, on utilise un **service mock typé** (signature HTTP réelle).

---

## 1. Modèles (rappel, à créer dans `core/models` si pas déjà fait)
```ts
export type ReservationStatus =
  | 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export interface RestaurantTable { id: string; name: string; capacity: number; }

export interface Reservation {
  id: string;
  customerName: string;
  phone: string;            // affiché en mono
  dateTime: string;         // ISO
  partySize: number;        // couverts
  table?: RestaurantTable;
  status: ReservationStatus;
  notes?: string;
  source?: 'callbot' | 'manual';   // utile pour valoriser le bot
}
```

## 2. Service mock (`core/services/reservation.service.ts`)
- Expose les réservations via **signals**, avec une **vraie signature HTTP** pour brancher
  l'API plus tard sans toucher à l'écran :
  - `getToday(date): Observable<Reservation[]>` (mock : renvoie un jeu réaliste — noms FR,
    horaires du service du soir, statuts variés, quelques `source: 'callbot'`).
  - `confirm(id)`, `cancel(id)` : muteurs (mock : mettent à jour le signal local et renvoient
    un `Observable<Reservation>`).
- Garde un `loading` signal et un `error` signal pour piloter les états de la liste.
- Mock réaliste : ~12–18 réservations, plage 18:30–22:30, mélange de statuts, 2–6 couverts,
  tables variées, ~40 % `source: 'callbot'`.

## 3. Composant écran (`features/reservations/reservations-du-jour.component.ts`)
Layout, de haut en bas :
1. **`hk-page-header`** : titre « Réservations du jour », sous-texte (date lisible), actions =
   sélecteur de date (aujourd'hui par défaut) + bouton « Nouvelle réservation » (placeholder).
2. **`hk-stat-row`** (3–4 KPI, un seul chiffre fort chacun) :
   - Réservations du jour (nombre)
   - Couverts attendus (somme des `partySize`)
   - Captées par le bot (compte `source === 'callbot'`) — **met en valeur la raison d'être du
     produit**
   - Taux de confirmation (confirmées / total, en %)
3. **`hk-filter-bar`** : segmented statut + recherche nom/téléphone + date. Filtre la liste en
   temps réel (computed signals).
4. **`hk-reservation-list`** : liste filtrée, avec états loading (skeletons) / vide / erreur.
   Actions de ligne câblées au service (confirmer/annuler → toast de feedback). Clic sur ligne
   → ouvre le **drawer détail** (05).
5. **`hk-reservation-detail-drawer`** : piloté par un signal `selectedReservation`.

Logique : tout en **computed signals** (liste filtrée, KPI dérivés). OnPush. Aucune logique
HTTP dans le composant — tout passe par le service.

## 4. Détails « game-changer » à appliquer ici (cf. 07)
- **Skeleton** de la liste + des stat-cards au premier chargement (pas de spinner).
- **Hover** doux sur les lignes (fond `--surface-2`, pas de décalage).
- **Feedback** sur confirmer/annuler : micro-animation de la ligne (statut qui change avec une
  transition douce) + `hk-toast` sobre (« Réservation confirmée »).
- **Curseurs** corrects (pointer sur lignes/actions).
- **Ton** adulte partout (libellés, empty-state, toasts).
- Badge `callbot` discret sur les réservations prises par le bot (petit tag « Bot »), pour
  raconter visuellement la valeur du produit.

---

## Tâche
1. Créer les modèles (si absents) et le `ReservationService` mock (signals + signature HTTP).
2. Construire l'écran en assemblant page-header + stat-row + filter-bar + list + drawer.
3. Brancher filtres et KPI en computed signals ; câbler les actions au service + toasts.
4. Appliquer les détails game-changer (skeletons, hover, feedback, badge bot).
5. Déclarer la route `/reservations` (ou en page d'accueil) dans le shell.

## Critères d'acceptation
- L'écran s'ouvre sur des skeletons puis affiche les réservations mockées.
- Les 4 KPI sont justes et dérivés de la donnée (dont « captées par le bot »).
- Filtrer par statut / rechercher met à jour la liste instantanément.
- Confirmer/annuler change le statut avec une transition douce + toast sobre.
- Clic sur une ligne ouvre le drawer ; Echap le ferme.
- Quand le vrai back arrivera, seul l'intérieur du service changera (l'écran ne bouge pas).

## À NE PAS faire
- Pas d'appel HTTP dans le composant. Pas de spinner de page. Pas de message cucul. Ne pas
  coder en dur des couleurs de statut (utiliser `hk-badge`).
