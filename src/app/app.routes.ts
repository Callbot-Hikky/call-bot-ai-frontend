import { Routes } from '@angular/router';
import { AppShell } from './core/layout/app-shell';
import { ClientShell } from '@core/layout/client-shell';
import { TokensDemo } from './features/tokens-demo/tokens-demo';
import { LoginPage } from './features/auth/login-page';
import { RegisterPage } from './features/auth/register-page';
import { OnboardingPage } from './features/auth/onboarding-page';
import { authGuard } from './core/guards/auth.guard';
import { subscriptionGuard } from './core/guards/subscription.guard';

export const routes: Routes = [
  // Page de validation du design system (hors shell), temporaire.
  { path: '_tokens', component: TokensDemo },

  { path: 'login', component: LoginPage, title: 'Connexion' },
  { path: 'register', component: RegisterPage, title: 'Créer un compte' },
  {
    path: 'onboarding',
    component: OnboardingPage,
    // L'abonnement se paie avant de configurer le restaurant : sans lui, retour a /offre.
    canActivate: [authGuard, subscriptionGuard],
    title: 'Configuration',
  },

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
    path: 'client/reservations/complement/:token',
    loadComponent: () =>
      import('@features/client-payment/reservation-top-up-page').then(
        (m) => m.ReservationTopUpPage,
      ),
  },
  {
    path: 'client/reservations/modifier/:token',
    loadComponent: () =>
      import('@features/client-payment/reservation-modify-page').then(
        (m) => m.ReservationModifyPage,
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
    path: 'client/reservations/complement-regle',
    data: { outcome: 'top-up-paid' },
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
    // Meme raison qu'a l'onboarding : sans abonnement actif, retour a /offre plutot
    // qu'un tableau de bord qui ne pourra rien creer.
    canActivate: [authGuard, subscriptionGuard],
    // Pages chargees a la demande : le bundle initial ne porte que la coquille et l'auth.
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
        title: 'Tableau de bord',
        data: { title: 'Tableau de bord' },
      },
      {
        path: 'reservations',
        loadComponent: () =>
          import('./features/reservations/reservations').then((m) => m.ReservationsPage),
        title: 'Réservations',
        data: { title: 'Réservations' },
      },
      {
        path: 'plan',
        loadComponent: () =>
          import('./features/floor-plan/floor-plan-page').then((m) => m.FloorPlanPage),
        title: 'Plan de salle',
        data: { title: 'Plan de salle' },
      },
      {
        path: 'appels',
        loadComponent: () =>
          import('./features/coming-soon/coming-soon').then((m) => m.ComingSoonPage),
        title: 'Appels',
        data: { title: 'Appels', icon: 'lucidePhone' },
      },
      {
        path: 'parametres',
        data: { title: 'Paramètres', icon: 'lucideSettings' },
        loadComponent: () =>
          import('@features/settings/payment-settings-page').then((m) => m.PaymentSettingsPage),
      },
      // Stripe renvoie le restaurateur sur cette URL a la fin de l'onboarding Connect :
      // elle doit continuer d'aboutir sur les reglages, servis par /parametres ci-dessus.
      { path: 'parametres/paiements', redirectTo: 'parametres' },
      {
        path: 'mon-restaurant',
        loadComponent: () =>
          import('./features/my-restaurant/my-restaurant').then((m) => m.MyRestaurantPage),
        title: 'Mon restaurant',
        data: { title: 'Mon restaurant' },
      },
      {
        path: 'menu',
        loadComponent: () => import('./features/menu/menu-page').then((m) => m.MenuPage),
        title: 'Carte et QR codes',
        data: { title: 'Carte et QR codes' },
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
