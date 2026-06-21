# Hikky — 01 · Design tokens

**Objectif** : poser le socle visuel (couleurs OKLCH, typographie, espacements, rayons,
ombres, motion) comme tokens, câblés dans Tailwind v4 + Spartan. Tout le reste en dépend.

**Dépendances** : aucune (première étape après le setup). Respecter `AGENTS.md`.

---

## 1. Principe
Tous les tokens sont définis en variables CSS (`:root`) puis exposés à Tailwind v4 via
`@theme`. Light mode maintenant, mais structurer pour qu'un dark mode futur ne soit qu'un
second bloc de variables (ne pas coder en dur les couleurs dans les composants — toujours via
token). Couleurs en **OKLCH** (vivacité homogène, dégradés sans bavure).

## 2. Couleurs de marque — vert frais, confiant, PAS néon
Échelle complète (à mettre en variables) :
```
--green-50:  oklch(0.97 0.02 158);
--green-100: oklch(0.94 0.04 158);
--green-200: oklch(0.88 0.07 158);
--green-300: oklch(0.81 0.10 158);
--green-400: oklch(0.75 0.13 158);
--green-500: oklch(0.69 0.15 158);   /* primary */
--green-600: oklch(0.62 0.14 159);   /* hover */
--green-700: oklch(0.53 0.12 160);   /* active / pressed */
--green-800: oklch(0.44 0.10 161);
--green-900: oklch(0.37 0.08 162);
```
- `--primary: var(--green-500)` ; `--primary-hover: var(--green-600)` ;
  `--primary-active: var(--green-700)` ; `--primary-fg: oklch(1 0 0)` (texte sur bouton vert).

## 3. Neutres — gris très légèrement chauds (hue ~95)
```
--bg:            oklch(0.99 0.004 95);   /* fond app, blanc cassé chaud */
--surface:       oklch(1 0 0);           /* carte, blanc pur posé sur le fond */
--surface-2:     oklch(0.975 0.004 95);  /* zone subtilement enfoncée */
--border:        oklch(0.92 0.005 95);
--border-strong: oklch(0.87 0.006 95);
--text:          oklch(0.27 0.010 95);   /* texte principal, noir chaud */
--text-strong:   oklch(0.20 0.010 95);   /* titres */
--text-muted:    oklch(0.55 0.010 95);   /* secondaire */
--text-subtle:   oklch(0.66 0.008 95);   /* méta, placeholders */
```

## 4. Statuts sémantiques — palette « donnée » (distincte de la marque)
> **Piège du vert (lire absolument)** : la couleur de marque sert aux ACTIONS (boutons pleins,
> saturés). Les statuts servent à l'INFORMATION (badges = fond pâle teinté + texte saturé).
> Même quand un statut est vert (« confirmé »), son badge pâle se distingue nettement du bouton
> vert plein. Ne jamais utiliser le vert plein `--primary` pour un badge de statut.

Chaque statut = paire (texte, fond de badge) :
```
--st-pending-fg:   oklch(0.55 0.12 70);   --st-pending-bg:   oklch(0.96 0.04 75);   /* ambre */
--st-confirmed-fg: oklch(0.50 0.13 158);  --st-confirmed-bg: oklch(0.95 0.04 158);  /* vert doux */
--st-seated-fg:    oklch(0.52 0.13 250);  --st-seated-bg:    oklch(0.95 0.03 250);  /* bleu */
--st-completed-fg: oklch(0.45 0.010 95);  --st-completed-bg: oklch(0.95 0.004 95);  /* neutre */
--st-cancelled-fg: oklch(0.55 0.16 25);   --st-cancelled-bg: oklch(0.96 0.03 25);   /* rouge doux */
--st-noshow-fg:    oklch(0.50 0.15 12);   --st-noshow-bg:    oklch(0.95 0.03 12);    /* rose profond */
```
Mapping métier : `pending`=En attente, `confirmed`=Confirmée, `seated`=Installée,
`completed`=Terminée, `cancelled`=Annulée, `no_show`=Non présentée.
**Ne jamais coder le sens uniquement par la couleur** : badge = pastille colorée **+ libellé**.

## 5. Typographie — Geist
- Charger **Geist Sans** (UI) et **Geist Mono** (chiffres, heures, téléphones, couverts, IDs)
  via `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` (pnpm), pas de CDN.
- `--font-sans: 'Geist Variable', system-ui, sans-serif;`
- `--font-mono: 'Geist Mono Variable', ui-monospace, monospace;`
- Toujours `font-variant-numeric: tabular-nums` sur les chiffres alignés (KPI, listes).

Échelle (taille / poids / tracking) :
```
display (KPI)   : 36px / 600 / -0.02em / mono ou sans tabular
h1 (titre page) : 24px / 600 / -0.01em
h2 (section)    : 18px / 600 / -0.005em
body            : 14px / 400            (défaut UI)
small (méta)    : 13px / 400 / muted
label (sur-titre): 12px / 500 / 0.04em / uppercase
mono-data       : 14px / 450 / mono / tabular  (heures, tél, couverts)
```

## 6. Espacements (base 4px)
`--space-1:4px … 2:8 · 3:12 · 4:16 · 5:20 · 6:24 · 8:32 · 10:40 · 12:48 · 16:64`.
Conventions : padding carte **24px**, gap entre sections **24–32px**, padding page **32px**
(desktop) / **16px** (mobile). Privilégier l'air : ne jamais tasser.

## 7. Rayons
`--radius-sm:8px` (boutons, inputs) · `--radius-md:12px` (cartes) · `--radius-lg:16px`
(drawer, modale, grandes cartes) · `--radius-full:9999px` (pills, avatars).

## 8. Ombres — très douces, en couches (jamais théâtrales)
```
--shadow-xs: 0 1px 2px oklch(0.27 0.01 95 / 0.05);
--shadow-sm: 0 1px 3px oklch(0.27 0.01 95 / 0.06), 0 1px 2px oklch(0.27 0.01 95 / 0.04);
--shadow-md: 0 4px 12px oklch(0.27 0.01 95 / 0.06), 0 2px 4px oklch(0.27 0.01 95 / 0.04);
--shadow-lg: 0 12px 32px oklch(0.27 0.01 95 / 0.10), 0 4px 8px oklch(0.27 0.01 95 / 0.05);
--ring:      0 0 0 3px oklch(0.69 0.15 158 / 0.25);   /* focus visible, couleur marque */
```

## 9. Motion (tokens)
```
--dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 240ms; --dur-slower: 320ms;
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);     /* entrées */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);       /* déplacements */
--ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);   /* feedback, rebond TRÈS subtil */
```
Principes : entrées = fondu + léger slide (8px) ; sorties = fondu rapide ; feedback = micro
scale (0.97→1) ou pulse. **Sous `prefers-reduced-motion: reduce`** : couper transforms et
slides, ne garder que l'opacité.

## 10. Z-index
`base:0 · dropdown:1000 · sticky-header:1010 · drawer:1020 · modal:1030 · popover:1040 ·
tooltip:1050 · toast:1060`.

---

## Tâche
1. Créer le fichier de styles global (ex. `src/styles.scss`) avec toutes ces variables dans
   `:root`, puis le bloc `@theme` Tailwind v4 qui les expose en utilitaires (`bg-bg`,
   `text-muted`, `text-primary`, `rounded-md`, `shadow-md`, etc.).
2. Vérifier que les `@layer` / `@import "tailwindcss/..."` requis par Spartan sont présents
   (cf. AGENTS.md) pour que ng-icons et les composants Spartan se stylent correctement.
3. Installer et charger Geist Sans + Geist Mono via fontsource (pnpm).
4. Créer une page de démo `/_tokens` (temporaire) qui affiche : la palette verte, les neutres,
   les 6 badges de statut, l'échelle typo, les ombres, et un bouton primaire — pour valider
   visuellement. On la supprimera après.

## Critères d'acceptation
- Aucune couleur codée en dur ailleurs que dans les tokens.
- Le bouton primaire (vert plein) et le badge « confirmé » (vert pâle) sont visuellement
  distincts côte à côte.
- Geist Sans et Geist Mono s'affichent ; les chiffres sont en tabular-nums.
- Le fond est blanc cassé chaud, pas blanc pur ; les cartes blanches s'en détachent.

## À NE PAS faire
- Pas de couleur en HSL/HEX en dur. Pas de seconde couleur d'accent. Pas d'ombres lourdes.
- Ne pas supprimer la structure « variables → @theme » (indispensable pour le dark futur).
