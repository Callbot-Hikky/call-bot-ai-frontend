# Hikky — 08 · Responsive & Accessibilité (passe transversale)

**Objectif** : garantir que le front est utilisable et élégant sur toutes les tailles d'écran
et accessible. Standards transversaux à appliquer dès le shell et chaque écran, puis à auditer.

**Dépendances** : transversal (lire avant 04, auditer à la fin).

---

## 1. Breakpoints
- `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 (Tailwind par défaut).
- **≥1024px (lg)** : layout 2 colonnes, sidebar fixe (étendue ou repliée).
- **768–1023px** : sidebar repliée par défaut (icônes) ou en drawer ; contenu pleine largeur.
- **<768px** : sidebar masquée → **drawer** via bouton menu du header ; header compact ;
  padding page 16px.

## 2. Patterns mobiles
- **Sidebar → drawer** overlay (slide gauche, fond assombri, fermeture clic extérieur / Echap).
  Option alternative : barre d'icônes basse (bottom nav) pour les sections principales — au
  choix, garder simple au POC (drawer suffit).
- **Listes → cartes empilées** : sous `md`, `hk-reservation-list` passe d'un tableau à une pile
  de cartes (1 colonne), chaque carte regroupant les infos d'une réservation (heure + nom en
  tête, badge, couverts/table, actions en bas). Lecture verticale confortable.
- **Drawer détail → bottom-sheet** pleine largeur (slide du bas) sous `md`.
- **Stat-row** : 4 → 2 → 1 colonne.
- **Filter-bar** : passe en colonne ; le segmented statut peut devenir un select.

## 3. Cibles tactiles & lisibilité
- Toutes les cibles tactiles **≥ 44×44px** (boutons, items de nav, actions de ligne).
- Pas de police minuscule (min 13px pour le texte courant, 12px réservé aux labels).
- Espacements suffisants entre cibles pour éviter les fautes de frappe au doigt.
- Fonctionne à **200 % de zoom** sans casse ni chevauchement.

## 4. Accessibilité (WCAG 2.2 comme plancher)
- **Sémantique** : `nav`/`main`/`header` corrects ; titres hiérarchisés (un seul h1 par écran) ;
  tableaux avec en-têtes (`th`/scope) ou structure de liste correcte.
- **Clavier** : tout est atteignable au clavier dans un ordre logique ; focus **visible**
  (anneau `--ring`) ; drawer/dialog/palette avec **focus trap** + Echap ; pas de piège clavier.
- **ARIA** : `aria-label` sur les icon-buttons ; `aria-current="page"` sur l'item de nav actif ;
  `role`/`aria-modal` sur drawer/dialog ; toasts en `aria-live="polite"`.
- **Couleur** : jamais l'information par la couleur seule — les statuts ont pastille **+
  libellé** ; contraste texte conforme (vérifier surtout texte sur fonds pâles de badges).
- **Mouvement** : respecter `prefers-reduced-motion` (cf. 07).
- **Spartan** est accessible par défaut (primitives ARIA) — **préserver** cet acquis, ne pas
  casser les rôles en réhabillant.

## 5. Outils de vérification
- Tester au clavier seul (Tab/Shift-Tab/Echap/Entrée).
- Tester un lecteur d'écran (VoiceOver / NVDA) sur la liste et le drawer.
- Vérifier les contrastes (badges, texte muted).
- Tester reduced-motion et 200 % zoom.
- Tester les breakpoints (≥1024, ~768, <640) — sidebar, liste→cartes, drawer→bottom-sheet.

---

## Tâche (audit transversal)
1. Implémenter le responsive du shell (drawer) dès 04, et des écrans au fil de l'eau.
2. Convertir `hk-reservation-list` en cartes empilées sous `md` ; drawer en bottom-sheet.
3. Passer un **audit a11y** final : sémantique, clavier, focus visible/trap, ARIA, contraste,
   reduced-motion, zoom 200 %. Corriger les écarts.

## Critères d'acceptation
- Sidebar en drawer sous `md`, fermeture clic extérieur / Echap.
- Liste lisible en cartes empilées sur mobile ; drawer en bottom-sheet sur mobile.
- Toutes cibles tactiles ≥ 44px ; pas de casse à 200 % de zoom.
- Navigation clavier complète, focus visible, focus trap sur les surfaces modales.
- Statuts compréhensibles sans la couleur (libellés présents), contrastes conformes.

## À NE PAS faire
- Pas d'info portée par la seule couleur. Pas de cible tactile < 44px. Pas de surface modale
  sans gestion clavier. Ne pas casser l'accessibilité native de Spartan en le restylant.
