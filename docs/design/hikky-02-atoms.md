# Hikky — 02 · Atoms

**Objectif** : la couche la plus basse de l'Atomic Design — composants indivisibles,
standalone, signals, OnPush, stylés via tokens (01). Quand un équivalent Spartan existe,
partir de lui (helm) et l'habiller aux tokens Hikky plutôt que repartir de zéro.

**Dépendances** : 01 (tokens). Lire aussi 07 (micro-interactions) pour les états hover/focus
et 08 (a11y) avant d'implémenter.

> Emplacement : `src/app/shared/components/atoms/`. Un dossier par composant. Chaque composant
> a un `*.component.ts` standalone, des inputs typés (signals/`input()`), et des états gérés
> par classes utilitaires Tailwind reliées aux tokens.

---

## Liste des atoms

### 1. `hk-button`
- **Source** : Spartan button (helm) réhabillé.
- **Variants** (`variant`) : `primary` (vert plein, `--primary`/hover/active, texte blanc) ·
  `secondary` (fond `--surface`, bordure `--border`, texte `--text`) · `ghost` (transparent,
  hover `--surface-2`) · `danger` (texte/bordure `--st-cancelled-fg`, fond pâle au hover).
- **Tailles** (`size`) : `sm` (h 32px), `md` (h 38px, défaut), `lg` (h 44px).
- **États** : default, hover, active (micro scale 0.98), focus-visible (`--ring`), disabled
  (opacité 0.5, `cursor: not-allowed`), `loading` (spinner inline + label conservé, jamais le
  mot « Loading »).
- **Slots** : icône optionnelle avant/après (ng-icons). Rayon `--radius-sm`.
- **Curseur** : `pointer` (cf. 07).

### 2. `hk-icon-button`
- Bouton carré icône seule (h = w). Variants `ghost`/`secondary`. **Toujours** un `aria-label`.
- Tooltip optionnel au survol (cf. `hk-tooltip`). Sert dans la sidebar repliée, le header, les
  actions de ligne.

### 3. `hk-badge` (StatusPill)
- Affiche un **statut** : pastille + libellé. `status` ∈ pending|confirmed|seated|completed|
  cancelled|no_show. Couleurs via paires `--st-*-fg` / `--st-*-bg`. Rayon `--radius-full`,
  texte 12px/500, padding 2px 10px. Jamais la couleur seule : toujours le libellé.
- Variante neutre `hk-badge` générique (compteurs) : fond `--surface-2`, texte `--text-muted`.

### 4. `hk-input`
- Champ texte. Bordure `--border`, focus = bordure `--primary` + `--ring`. Hauteur alignée aux
  boutons. Placeholder `--text-subtle`. Slot icône (ex. loupe). États error (bordure
  `--st-cancelled-fg` + message), disabled. Label optionnel au-dessus (12px/500).

### 5. `hk-avatar`
- Rond (`--radius-full`). Image, ou initiales sur fond dérivé (faible chroma). Tailles sm/md/lg.
  Fallback initiales si pas d'image. Bordure 1px `--border`.

### 6. `hk-card`
- Conteneur de base : fond `--surface`, bordure `--border` (ou ombre `--shadow-sm`), rayon
  `--radius-md`, padding 24px. Slots header/contenu/footer. Variante `interactive` (hover =
  `--shadow-md`, sans déplacer le layout — cf. 07).

### 7. `hk-skeleton`
- Bloc de chargement (remplace tout spinner). Fond `--surface-2` avec shimmer doux
  (gradient animé lent). Props : `width`, `height`, `radius`, `variant` (text|circle|rect).
  Respecte `prefers-reduced-motion` (shimmer coupé → fond statique). Voir 07 pour l'usage.

### 8. `hk-tooltip`
- Source Spartan (hover-card/tooltip). Apparition après ~300ms, fondu + slide 4px. Fond
  `--text-strong`, texte clair, 12px. Z `tooltip`. Indispensable pour la sidebar repliée
  (afficher le libellé de l'icône).

### 9. `hk-icon`
- Wrapper ng-icons (set Lucide). Taille par défaut 18px, `currentColor`. Centralise l'import
  des icônes utilisées (dashboard, calendar, phone, users, settings, chevrons, search, bell,
  check, x, plus, more-horizontal, log-out).

### 10. `hk-spinner` (usage limité)
- Petit spinner **uniquement** pour l'état `loading` d'un bouton ou une action ponctuelle.
  Jamais pour charger une page/liste (→ skeleton).

---

## Tâche
1. Implémenter chaque atom dans son dossier, standalone + OnPush, inputs typés.
2. Réhabiller les composants Spartan correspondants (button, tooltip) aux tokens Hikky.
3. Centraliser les icônes Lucide dans `hk-icon`.
4. Étendre la page démo `/_tokens` (ou `/_atoms`) avec chaque atom dans tous ses états.

## Critères d'acceptation
- Tous les atoms n'utilisent que des tokens (aucune couleur/taille magique en dur).
- `hk-badge` rend les 6 statuts lisibles, chacun avec pastille **et** libellé.
- Focus visible au clavier sur button, icon-button, input (anneau `--ring`).
- `hk-skeleton` shimmer coupé en reduced-motion.

## À NE PAS faire
- Pas de `<form>` HTML natif (cf. AGENTS.md, gérer via events). Pas d'icon-button sans
  `aria-label`. Pas de spinner pour charger une liste.
