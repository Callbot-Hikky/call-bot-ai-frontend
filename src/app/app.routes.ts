import { Routes } from '@angular/router';
import { AppShell } from './core/layout/app-shell';
import { ClientShell } from '@core/layout/client-shell';
import { TokensDemo } from './features/tokens-demo/tokens-demo';
import { DashboardPage } from './features/dashboard/dashboard';
import { ReservationsPage } from './features/reservations/reservations';
import { FloorPlanPage } from './features/floor-plan/floor-plan-page';
import { ComingSoonPage } from './features/coming-soon/coming-soon';
import { MyRestaurantPage } from './features/my-restaurant/my-restaurant';
import { LoginPage } from './features/auth/login-page';
import { RegisterPage } from './features/auth/register-page';
import { OnboardingPage } from './features/auth/onboarding-page';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Page de validation du design system (hors shell), temporaire.
  { path: '_tokens', component: TokensDemo },

  { path: 'login', component: LoginPage },
  { path: 'register', component: RegisterPage },
  { path: 'onboarding', component: OnboardingPage, canActivate: [authGuard] },

  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardPage, data: { title: 'Tableau de bord' } },
      { path: 'reservations', component: ReservationsPage, data: { title: 'Réservations' } },
      { path: 'plan', component: FloorPlanPage, data: { title: 'Plan de salle' } },
      { path: 'appels', component: ComingSoonPage, data: { title: 'Appels', icon: 'lucidePhone' } },
      {
        path: 'parametres',
        component: ComingSoonPage,
        data: { title: 'Paramètres', icon: 'lucideSettings' },
      },
      { path: 'mon-restaurant', component: MyRestaurantPage, data: { title: 'Mon restaurant' } },
      // Charge a la demande : garde le bundle initial sous le budget.
      {
        path: 'menu',
        loadComponent: () => import('./features/menu/menu-page').then((m) => m.MenuPage),
        data: { title: 'Menu et QR code' },
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: 'client',
    component: ClientShell,
    children: [
      // Pages publiques chargees a la demande : elles ne pesent pas sur le bundle initial.
      {
        path: 'reservations/:id/reschedule',
        loadComponent: () =>
          import('@features/reservations/reservation').then((m) => m.ReservationPage),
      },
      {
        path: 'reservations/:id/confirmed',
        loadComponent: () =>
          import('@features/reservations/reservation-confirmed').then(
            (m) => m.ReservationConfirmedPage,
          ),
      },
      {
        path: 'restaurants/:id/menu',
        loadComponent: () =>
          import('./features/restaurants/restaurant-menu').then((m) => m.RestaurantMenuPage),
      },
      {
        path: 'restaurants/:id/schedule',
        loadComponent: () =>
          import('@features/reservations/reservation-schedule').then(
            (m) => m.ReservationSchedulePage,
          ),
      },
    ],
  },
];
