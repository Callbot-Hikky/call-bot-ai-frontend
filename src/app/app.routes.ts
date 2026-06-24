import { Routes } from '@angular/router';
import { AppShell } from './core/layout/app-shell';
import { TokensDemo } from './features/tokens-demo/tokens-demo';
import { DashboardPage } from './features/dashboard/dashboard';
import { ReservationsPage } from './features/reservations/reservations';
import { ComingSoonPage } from './features/coming-soon/coming-soon';

export const routes: Routes = [
  // Page de validation du design system (hors shell), temporaire.
  { path: '_tokens', component: TokensDemo },
  {
    path: '',
    component: AppShell,
    children: [
      { path: 'dashboard', component: DashboardPage, data: { title: 'Tableau de bord' } },
      { path: 'reservations', component: ReservationsPage, data: { title: 'Réservations' } },
      { path: 'appels', component: ComingSoonPage, data: { title: 'Appels', icon: 'lucidePhone' } },
      {
        path: 'parametres',
        component: ComingSoonPage,
        data: { title: 'Paramètres', icon: 'lucideSettings' },
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];
