# Hikky — 07 · Micro-interactions & polish (passe transversale)

**Objectif** : définir les standards des petits détails qui font basculer l'interface de
« template » à « vrai produit ». Ces règles s'appliquent à TOUS les composants. À lire avant de
coder les atoms (02), et à repasser en audit à la fin.

**Philosophie** : « le maître d'hôtel » — présent quand on a besoin de lui, jamais dans les
pattes. Subtil et utile, **jamais clinquant**. Les effets 3D / ombres théâtrales déforment la
perception : on veut la vérité, pas le théâtre.

---

## 1. Chargement — skeletons, jamais « Loading »
- Toute zone qui charge de la donnée (liste, KPI, drawer) affiche un **skeleton** à la forme du
  contenu final (`hk-skeleton`), pas un spinner. Métaphore resto à garder en tête : « patientez,
  on dresse l'assiette ».
- Spinner réservé aux **actions ponctuelles** (bouton en `loading`).
- Shimmer doux et lent ; **coupé** sous `prefers-reduced-motion`.

## 2. Hover — confiant mais retenu
- Lignes/cartes interactives : léger changement de fond (`--surface-2`) et/ou ombre
  (`--shadow-sm` → `--shadow-md`). **Jamais de déplacement de layout** au survol (pas d'élément
  qui « saute »). Transition `--dur-fast`, `--ease-out`.
- Boutons : assombrissement vers `--primary-hover`. Liens : soulignement/teinte douce.

## 3. Curseurs
- `pointer` sur tout cliquable (lignes, actions, items de nav). `not-allowed` sur disabled.
  `text` sur les champs. Un mauvais curseur trahit l'amateur — vérifier partout.

## 4. Feedback d'action — accusé de réception immédiat
- Chaque action (confirmer, annuler, envoyer) donne une réponse visible instantanée : micro
  scale (0.97→1) ou pulse via `--ease-spring` (rebond **très** subtil), changement d'état animé
  (ex. statut qui transite), et/ou `hk-toast` sobre.
- **Vert premium, pas néon** pour les validations. Pastilles douces, pas fluo.

## 5. Ton des messages — sobre et adulte
- Pas de « Yay ! », pas d'emoji infantile. Utiliser « Confirmé », « C'est fait »,
  « Réservation annulée », « Une erreur est survenue ». Concis, clair, professionnel.
  Les utilisateurs sont des restaurateurs.

## 6. Transitions & motion — au service de la compréhension
- Entrées : fondu + slide 8px (`--ease-out`, `--dur-base`). Sorties : fondu rapide.
- Drawer/dialog : slide + fondu + overlay. Sidebar : largeur fluide.
- Le mouvement **guide** (montre d'où vient/où va un élément), il ne décore pas. Cohérent
  partout (mêmes durées/easings via tokens).
- **`prefers-reduced-motion: reduce`** : supprimer transforms et slides, ne garder que
  l'opacité. Tester ce mode.

## 7. Profondeur — douce, par l'ombre et la teinte
- Hiérarchie par ombres légères en couches + fond blanc cassé vs cartes blanches. Pas de
  bordures partout : préférer ombre douce OU bordure fine, rarement les deux appuyées.

## 8. Détails post-POC (noter, ne pas faire maintenant)
- **Sparklines** dans les stat-cards (mini-courbes denses) plutôt que gros graphiques.
- **What-if** / interactivité de données (« et si je bloque ce créneau ? ») — le détail qui
  transforme un outil consulté en outil utilisé quotidiennement.
- Sons discrets optionnels (clic doux) — seulement si ça sert, jamais de musique de victoire.

---

## Tâche (audit transversal)
1. Pendant l'implémentation des atoms→écran : appliquer ces standards à chaque composant.
2. En fin de parcours, passer un **audit** : chaque zone de chargement = skeleton ? hover sans
   décalage ? curseurs ok ? feedback + toast sur chaque action ? ton sobre ? reduced-motion
   testé ? Corriger les écarts.

## Critères d'acceptation
- Aucun spinner pour charger une liste/page (skeletons partout).
- Aucun hover ne décale la mise en page.
- Chaque action a un feedback immédiat + message sobre.
- En `prefers-reduced-motion`, plus aucune animation de déplacement, seulement des fondus.

## À NE PAS faire
- Pas d'effets 3D/glassmorphism lourds, pas d'ombres théâtrales, pas de vert néon, pas de motion
  décoratif ou incohérent, pas de copie infantile.
