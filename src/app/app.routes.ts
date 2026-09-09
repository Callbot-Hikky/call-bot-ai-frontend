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

  // Parcours d'achat de l'offre (hors shell), reserve aux utilisateurs connectes.
  {
    path: 'offre',
    canActivate: [authGuard],
    loadComponent: () => import('@features/offer/offer-checkout').then((m) => m.OfferCheckout),
  },
  {
    path: 'offre/success',
    canActivate: [authGuard],
    loadComponent: () => import('@features/offer/offer-success').then((m) => m.OfferSuccess),
  },

  // Parcours du convive : il a réservé par téléphone, n'a pas de compte, et n'en aura
  // pas. Le jeton dans l'URL est sa seule identification — donc hors shell et hors garde.
  {
    path: 'client/reservations/payer/:token',
    loadComponent: () =>
      import('@features/client-payment/reservation-payment-page').then(
        (m) => m.ReservationPaymentPage,
      ),
  },
  {
    path: 'client/reservations/annuler/:token',
    loadComponent: () =>
      import('@features/client-payment/reservation-cancel-page').then(
        (m) => m.ReservationCancelPage,
      ),
  },
  {
    path: 'client/reservations/payee',
    data: { outcome: 'paid' },
    loadComponent: () =>
      import('@features/client-payment/payment-result-page').then((m) => m.PaymentResultPage),
  },
  {
    path: 'client/reservations/paiement-annule',
    data: { outcome: 'abandoned' },
    loadComponent: () =>
      import('@features/client-payment/payment-result-page').then((m) => m.PaymentResultPage),
  },

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
        path: 'parametres/paiements',
        data: { title: 'Paiements' },
        loadComponent: () =>
          import('@features/settings/payment-settings-page').then((m) => m.PaymentSettingsPage),
      },
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
