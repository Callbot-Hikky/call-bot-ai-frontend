import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';

import { authGuard } from './auth.guard';
import { SessionService } from '@core/services/session.service';

describe('authGuard', () => {
  function setup(authenticated: boolean) {
    const session = { isAuthenticated: signal(authenticated) } as Partial<SessionService>;
    TestBed.configureTestingModule({
      providers: [{ provide: SessionService, useValue: session }],
    });
    return TestBed.inject(Router);
  }

  it('laisse passer un utilisateur connecté', () => {
    setup(true);
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('redirige vers /login un utilisateur anonyme', () => {
    const router = setup(false);
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/login').toString());
  });
});
