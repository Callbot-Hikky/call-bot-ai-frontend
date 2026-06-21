# Call Bot AI - Frontend

Interface de supervision pour un callbot IA destiné aux restaurants. Le restaurateur y
consulte les réservations prises automatiquement par l'agent vocal au téléphone.

Ce dépôt ne contient que le front (application Angular). L'API REST est développée à part
par l'équipe back. En attendant qu'elle soit prête, les services renvoient des données de
test qui respectent déjà le format de l'API finale, ce qui permettra de brancher le vrai
back en ne modifiant que l'intérieur des services.

## Stack

- Angular 21 (standalone, zoneless, signals)
- TypeScript strict
- SCSS et Tailwind CSS v4 (configuration via PostCSS)
- Spartan NG pour les composants UI
- ng-icons avec le set Lucide
- Vitest pour les tests
- ESLint et Prettier
- Husky et lint-staged pour les hooks de commit
- pnpm comme gestionnaire de paquets

## Prérequis

- Node.js 22 LTS (Node 20 minimum)
- pnpm 10 ou plus

## Commandes

```bash
pnpm install        # installer les dépendances
pnpm start          # serveur de dev sur http://localhost:4200
pnpm build          # build de production dans dist/
pnpm test           # tests unitaires (Vitest)
pnpm lint           # analyse ESLint
pnpm format         # formater le code avec Prettier
pnpm format:check   # vérifier le formatage sans modifier
```

## Organisation des dossiers

L'arborescence suit l'Atomic Design, sous `src/app/` :

```
src/
  app/
    core/          services, guards, interceptors, models
    shared/
      ui/          composants Spartan
      components/  atoms, molecules, organisms
      pipes/
      directives/
    features/      un dossier par écran
  environments/    environment.ts (prod) et environment.development.ts (dev)
  styles.scss      point d'entrée des styles
```

## Conventions

- Composants standalone uniquement, avec `ChangeDetectionStrategy.OnPush`
- État géré avec les signals (`signal`, `computed`, `effect`)
- Les appels réseau passent par un service, jamais directement dans un composant
- L'URL de l'API vient des fichiers d'environnement, jamais en dur
- Imports via les alias `@core`, `@shared`, `@features`, `@env`
- On évite `any`

## Brancher l'API

1. Mettre à jour `apiUrl` dans les fichiers d'environnement.
2. Dans le service concerné, remplacer la donnée de test (`of(...)`) par l'appel
   `this.http.get(...)`. Le type de retour ne change pas, donc les écrans non plus.
