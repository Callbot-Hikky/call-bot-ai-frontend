# Hikky — 04 · Shell & Layout

**Objectif** : la coquille de l'app — **sidebar repliable (icônes toujours accessibles)**,
header, menu profil, zone de contenu, et comportement responsive. C'est le squelette dans
lequel tous les écrans s'affichent.

**Dépendances** : 02 (atoms : icon-button, tooltip, avatar), 03 (molecules : nav-item,
profile-menu). Emplacement : `src/app/core/layout/` (shell) + organismes sidebar/header.

---

## 1. Structure générale (desktop)
Grille à 2 colonnes : **sidebar** (largeur variable) + **zone principale** (header sticky +
`<router-outlet>` dans un conteneur scrollable). Fond global `--bg`. Zone principale : padding
32px, largeur max ~1440px centrée.

```
┌──────────┬─────────────────────────────────────────┐
│          │  HEADER (sticky)                         │
│ SIDEBAR  ├─────────────────────────────────────────┤
│          │                                          │
│ (nav)    │   <router-outlet> (contenu scrollable)   │
│          │                                          │
│ profil   │                                          │
└──────────┴─────────────────────────────────────────┘
```

## 2. Sidebar repliable — exigence centrale
- **Deux états** : étendue (**240px**, icône + libellé) et repliée (**64px**, **icônes seules,
  toujours visibles et cliquables**). Toggle via `hk-icon-button` (chevron) en haut de la
  sidebar. État mémorisé via un **`LayoutService`** (signal `sidebarCollapsed`) — **pas de
  localStorage** (cf. AGENTS.md) : garder en mémoire de session (signal), réinitialisé au
  reload. Transition de largeur fluide (`--dur-base`, `--ease-in-out`).
- **Repliée** : chaque `hk-nav-item` montre l'icône centrée + **tooltip** au survol avec le
  libellé. Le profil en bas devient l'avatar seul (dropdown au clic). L'état actif reste
  parfaitement lisible (barre verticale + fond vert pâle sur l'icône).
- **Sections de nav** (icônes Lucide) : Dashboard (`layout-dashboard`), Réservations
  (`calendar`), Appels (`phone`), Plan de salle (`grid-2x2`), Analytics (`bar-chart-3`),
  Paramètres (`settings`). Logo/nom « Hikky » en haut (réduit à l'icône quand replié).
- **Accessibilité** : `nav` avec `aria-label`, item actif `aria-current="page"`, navigation
  clavier complète, focus visible.

## 3. Header (sticky)
- Hauteur ~60px, fond `--surface` ou `--bg` avec fine bordure bas `--border`. Contenu :
  - **Gauche** : titre de page / fil d'ariane (dérivé de la route).
  - **Centre/droite** : **command palette** (bouton « Rechercher… ⌘K », ouvre une recherche
    Spartan command — détail mémorable, cf. 07) ; cloche de **notifications**
    (`hk-icon-button` + pastille de compteur) ; **menu profil** (`hk-profile-menu`).
  - Sur petits écrans : titre + bouton menu (ouvre la sidebar en drawer) + profil compact.

## 4. Menu profil
- Via `hk-profile-menu` (03) : Profil, Paramètres, (Thème — placeholder dark), Déconnexion.
  Affiche nom + nom du restaurant (multi-tenant : le resto actif). Dropdown Spartan, fondu +
  slide, z `dropdown`.

## 5. Command palette (⌘K / Ctrl+K)
- Raccourci clavier global ouvre une palette (Spartan command dialog) : navigation rapide vers
  les écrans, recherche d'une réservation par nom. C'est un signal « produit pro » fort et peu
  coûteux. Fondu + scale léger à l'ouverture. Fermeture Echap. (Contenu minimal au POC :
  liens d'écrans + placeholder recherche.)

## 6. Responsive (résumé — détail en 08)
- **≥1024px** : sidebar fixe (étendue/repliée au choix).
- **<1024px** : sidebar masquée, ouverte en **drawer** overlay via le bouton menu du header
  (fond assombri, slide depuis la gauche, fermeture au clic extérieur / Echap).
- **<640px** : header compact, contenu en pleine largeur, padding 16px.

---

## Tâche
1. Créer `LayoutService` (signals : `sidebarCollapsed`, `mobileDrawerOpen`, helpers toggle).
2. Construire l'organisme **Sidebar** (logo, liste de `hk-nav-item`, profil en bas, toggle,
   modes étendu/replié/drawer).
3. Construire l'organisme **Header** (titre, command palette, notifications, profil, bouton
   menu mobile).
4. Assembler le **Shell** (`AppShellComponent`) : grille sidebar + header + `<router-outlet>`,
   câbler le responsive et le drawer.
5. Câbler la command palette au raccourci ⌘K/Ctrl+K (listener global, nettoyé à la destruction).

## Critères d'acceptation
- La sidebar se replie/déplie ; **en replié, les icônes restent visibles et cliquables**, avec
  tooltips, et l'item actif reste lisible.
- Le toggle conserve l'état pendant la session (signal), sans localStorage.
- Sur mobile, la sidebar s'ouvre en drawer et se ferme au clic extérieur / Echap.
- ⌘K ouvre la palette ; Echap la ferme. Toute la nav est accessible au clavier.

## À NE PAS faire
- Pas de localStorage/sessionStorage. Pas de sidebar qui pousse brutalement le contenu sans
  transition. Pas d'item de nav sans icône (l'icône doit survivre au mode replié).
