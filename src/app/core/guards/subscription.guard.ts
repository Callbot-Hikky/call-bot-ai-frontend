import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SessionService } from '@core/services/session.service';

/**
 * Refuse l'onboarding et le tableau de bord tant que l'organisation n'a pas payé.
 *
 * Sans ce garde, un compte créé puis abandonné avant paiement pouvait revenir se
 * connecter et configurer un restaurant sans jamais passer par /offre : rien côté
 * front ne s'y opposait (le backend, lui, refuse désormais la création avec un 402,
 * voir RestaurantAccess#requireActiveSubscription). Ce guard évite d'y laisser
 * l'utilisateur découvrir l'échec après coup.
 */
export const subscriptionGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  if (!session.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  return session.needsSubscription() ? router.createUrlTree(['/offre']) : true;
};
