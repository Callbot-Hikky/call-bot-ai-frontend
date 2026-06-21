# Hikky — Garde-fous d'exécution (compagnon)

À lire par Claude Code **avant** de commencer, et à garder ouvert pendant toute la série
`hikky-01` → `hikky-08`. Complète `AGENTS.md` et l'index.

---

## 0. Règle d'or — dans le doute, demander (ne JAMAIS décider seul)
Si quoi que ce soit est ambigu, manquant, ou risqué, **Claude Code s'arrête et pose la
question** au lieu de trancher de lui-même. Notamment :
- une version/commande qui ne se comporte pas comme prévu ;
- un choix d'archi non couvert par les specs (nommage, structure, lib tierce supplémentaire) ;
- un conflit entre deux instructions ;
- une valeur de design à inventer (couleur, espacement) non fournie dans `hikky-01` ;
- une dépendance à installer qui n'était pas listée.

Format attendu : « ⚠️ Point de décision : [le sujet]. Options : A… / B… Je ne tranche pas, dis-moi.
Je ne touche à rien tant que tu n'as pas répondu. »

**Mieux vaut une question de plus qu'une décision silencieuse à reprendre.** C'est un projet de
diplôme : la cohérence prime sur la vitesse.

---

## 1. Boucle de validation — à faire après CHAQUE étape (.md)
Avant de committer et de passer à l'étape suivante, vérifier ensemble :

**Toujours**
- [ ] Ça compile, `pnpm start` tourne, aucune erreur console.
- [ ] Aucune couleur/taille codée en dur : tout passe par les tokens (`hikky-01`).
- [ ] Standalone + OnPush + signals respectés (pas de NgModule, pas de `*ngIf`/`*ngFor`).
- [ ] Les **critères d'acceptation** du .px de l'étape sont tous remplis.
- [ ] Rien dans la section « À NE PAS faire » n'a été enfreint.
- [ ] Commit conventionnel propre.

**Contrôle visuel (à l'œil, par toi)**
- [ ] Le rendu correspond à l'intention Hikky (calme, aéré, vert premium pas néon, blanc cassé).
- [ ] Hover sans décalage de layout ; curseurs corrects ; focus visible au clavier.
- [ ] Chargement = skeleton (jamais spinner de page).

> Si un point échoue : on corrige avant d'avancer. On n'empile pas la dette sur une fondation
> bancale.

---

## 2. Points durs — où ça peut buter, et quoi faire

### A. Tailwind v4 + tokens OKLCH (`hikky-01`)
- Risque : config v4 traitée comme v3 ; `@theme` mal câblé ; couleurs OKLCH non prises.
- Garde-fou : suivre la **doc officielle Spartan/Tailwind v4** (PostCSS / `.postcssrc.json`),
  pas un tuto v3. Vérifier après init Spartan que `components.json` ET `.postcssrc.json`
  existent. Si une couleur OKLCH ne s'applique pas, vérifier qu'elle est bien déclarée en
  variable `:root` PUIS exposée dans `@theme`, et que la classe utilitaire pointe sur la
  variable. En cas de doute → **demander**, ne pas bricoler une config au hasard.
- Référence : starter `github.com/rolfscherer/spartywind`.

### B. Geist via fontsource
- Risque : police non chargée (chiffres pas en Geist Mono).
- Garde-fou : installer `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` (pnpm),
  importer dans les styles globaux, vérifier `tabular-nums` sur les chiffres. Si l'import ne
  marche pas → demander plutôt que passer en CDN sans validation.

### C. Sidebar repliée (`hikky-04`) — exigence centrale
- Risque : en mode replié, les libellés disparaissent mais les icônes aussi, ou l'item actif
  devient illisible, ou la transition saccade.
- Garde-fou : en replié, **icônes centrées toujours visibles + tooltip** ; état actif = barre
  verticale + fond vert pâle sur l'icône ; transition de largeur via tokens motion. État stocké
  en **signal** (`LayoutService`), **pas de localStorage**. Tester : déplier/replier, survol
  des icônes, item actif visible dans les deux modes.

### D. Drawer / dialog / palette — accessibilité (`hikky-05`, `hikky-04`)
- Risque : pas de focus trap, Echap inopérant, clic extérieur ne ferme pas, focus perdu.
- Garde-fou : utiliser les primitives **Spartan** (dialog/sheet) qui gèrent focus trap + Echap
  nativement — **ne pas réinventer**. Si une primitive Spartan adaptée n'existe pas pour un
  besoin, **demander** avant de coder un overlay maison.

### E. Command palette ⌘K (`hikky-04`)
- Risque : listener clavier global non nettoyé (fuite), ou conflit navigateur, ou souci en
  zoneless.
- Garde-fou : enregistrer le listener proprement et le **détruire** à la destruction du
  composant (`DestroyRef`/`takeUntilDestroyed`). Tester ⌘K (Mac) ET Ctrl+K, ouverture/Echap.

### F. Filtres en signals (`hikky-06`)
- Risque : liste filtrée non réactive (oubli de `computed`), ou recalcul incohérent en OnPush.
- Garde-fou : liste filtrée et KPI = **computed signals** dérivés du signal source + des signaux
  de filtre. Pas de mutation manuelle d'état hors du service. Tester : changer statut/recherche
  met à jour instantanément.

### G. prefers-reduced-motion (`hikky-07`)
- Risque : animations conservées en mode réduit.
- Garde-fou : sous `@media (prefers-reduced-motion: reduce)`, couper transforms/slides, ne
  garder que l'opacité. Tester en activant le réglage système.

---

## 3. Rappel de séquence
Lire `hikky-07` et `hikky-08` **avant** d'attaquer `hikky-02` (pour intégrer les standards dès
le départ), puis dérouler `01 → 02 → 03 → 04 → 05 → 06`, et repasser `07`/`08` en **audit final**.
Validation + commit entre chaque étape. **Au moindre doute : demander.**
