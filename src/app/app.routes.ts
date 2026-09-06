import { Routes } from '@angular/router';
import { AppShell } from './core/layout/app-shell';
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
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];
