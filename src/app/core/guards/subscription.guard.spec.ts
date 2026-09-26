import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';

import { subscriptionGuard } from './subscription.guard';
import { SessionService } from '@core/services/session.service';

describe('subscriptionGuard', () => {
  function setup(authenticated: boolean, needsSubscription: boolean) {
    const session = {
      isAuthenticated: signal(authenticated),
      needsSubscription: signal(needsSubscription),
    } as Partial<SessionService>;
    TestBed.configureTestingModule({
      providers: [{ provide: SessionService, useValue: session }],
    });
    return TestBed.inject(Router);
  }

  it('laisse passer un utilisateur abonné', () => {
    setup(true, false);
    const result = TestBed.runInInjectionContext(() => subscriptionGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('redirige vers /offre un utilisateur connecté sans abonnement actif', () => {
    const router = setup(true, true);
    const result = TestBed.runInInjectionContext(() => subscriptionGuard({} as never, {} as never));
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/offre').toString());
  });

  it('redirige vers /login un utilisateur anonyme', () => {
    const router = setup(false, true);
    const result = TestBed.runInInjectionContext(() => subscriptionGuard({} as never, {} as never));
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/login').toString());
  });
});
