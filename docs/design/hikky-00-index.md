# Hikky — Design System & Front (série de specs)

Série de specifications pour construire le front Angular de **Hikky**, l'interface de
supervision du callbot IA pour restaurants. Chaque fichier est une étape autonome à donner à
Claude Code, dans l'ordre. Ils s'appuient tous sur `AGENTS.md` (conventions du projet).

## Comment s'en servir avec Claude Code
1. Place ces fichiers dans `docs/design/` à la racine du repo.
2. Pour chaque étape, donne à Claude Code :
   > Lis et implémente `docs/design/hikky-01-tokens.md` en respectant `AGENTS.md`.
   > Procède étape par étape, attends ma validation, et explique tes choix.
3. Ne passe à l'étape suivante qu'une fois la précédente validée et committée.
4. Commit conventionnel par étape (ex. `feat(design): tokens Hikky`, `feat(ui): atoms`).

## Ordre de construction (dépendances)
| # | Fichier | Dépend de |
|---|---------|-----------|
| 01 | `hikky-01-tokens.md` — couleurs OKLCH, typo, espacements, ombres, motion | — |
| 02 | `hikky-02-atoms.md` — Button, Badge, Input, Avatar, Card, Skeleton, Tooltip… | 01 |
| 03 | `hikky-03-molecules.md` — StatCard, FilterBar, NavItem, ProfileMenu, Row… | 02 |
| 04 | `hikky-04-shell-layout.md` — Sidebar repliable, Header, profil, grid responsive | 02, 03 |
| 05 | `hikky-05-organisms.md` — ReservationList, StatRow, DetailDrawer | 03 |
| 06 | `hikky-06-ecran-reservations-du-jour.md` — l'écran (US 6.2) + service mock | 04, 05 |
| 07 | `hikky-07-micro-interactions.md` — skeletons, hover, feedback, motion, ton | transversal |
| 08 | `hikky-08-responsive-accessibilite.md` — mobile, touch, a11y, reduced-motion | transversal |

> 07 et 08 sont des **passes transversales** : leurs standards s'appliquent à tous les
> composants. Idéalement, lis-les avant de commencer 02, et repasse dessus à la fin pour audit.

## Langage de design Hikky (résumé)
- **Philosophie** : « le maître d'hôtel ». L'interface est présente quand on a besoin d'elle,
  jamais dans les pattes. Calme au premier regard, profonde au clic (progressive disclosure).
- **Mode** : light. Fond blanc cassé légèrement chaud, cartes en blanc pur posées dessus
  (profondeur douce). Beaucoup d'air.
- **Couleur** : UNE seule couleur d'accent — un vert frais et confiant (pas néon), en OKLCH.
  Réservée aux actions importantes et aux éléments à mettre en avant. Le reste en neutres.
- **Statuts** : palette sémantique distincte de la couleur de marque (voir 01, section
  « piège du vert »). Badges = fond teinté pâle + texte saturé ; boutons = fond saturé plein.
  La différence de poids visuel sépare naturellement « action » et « information ».
- **Typo** : Geist Sans (UI) + Geist Mono (chiffres, heures, téléphones — alignement tabulaire).
- **Motion** : discret, rapide, au service de la compréhension. Jamais décoratif. Respecte
  `prefers-reduced-motion`.
- **Densité** : 5 à 9 éléments par vue, jamais 50. Prioriser sans pitié.

## Périmètre
- **Inclus** : design system, shell (sidebar/header/profil), bibliothèque de composants
  (Atomic Design), écran Réservations du jour (US 6.2).
- **Exclus** (tâches d'autres membres, mais l'archi les supporte) : écrans appels/analytics
  (Vitomir), plan de salle, et tout le back (moteur dispo US 2.3, alternatives US 2.4,
  dialogue vocal US 2.1) — consommés par ce front via API.

## À NE PAS faire (rappel transversal)
- Pas d'effets 3D, glassmorphism lourd, ombres théâtrales : « les utilisateurs veulent la
  vérité, pas du théâtre ». Charts plats et propres.
- Pas plus d'une couleur d'accent. Pas de vert ET jaune ET bleu partout.
- Pas de blanc pur clinique partout (fond = blanc cassé chaud).
- Pas de hover qui déplace la mise en page. Pas de spinner « Loading » (skeletons).
- Pas de messages cucul (« Yay ! ») : ton sobre et adulte (« Confirmé », « C'est fait »).
