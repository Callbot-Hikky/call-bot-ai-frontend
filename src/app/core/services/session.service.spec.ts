import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const tick = () => new Promise((r) => setTimeout(r, 0));

  function flushMe(organizationId: string | null) {
    const req = http.expectOne((r) => r.url.endsWith('/me'));
    if (organizationId === null) {
      req.flush('', { status: 401, statusText: 'Unauthorized' });
    } else {
      req.flush({ id: 'u1', email: 'a@b.co', organizationId, role: 'OWNER' });
    }
  }

  it('refresh authentifié : /me puis restaurants de l’org, sélectionne le premier', async () => {
    const promise = service.refresh();
    flushMe('org1');
    await tick();
    const req = http.expectOne(
      (r) => r.url.endsWith('/restaurants') && r.params.get('organizationId') === 'org1',
    );
    req.flush([
      { id: 'r1', name: 'Chez A' },
      { id: 'r2', name: 'Chez B' },
    ]);
    await promise;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.organizationId).toBe('org1');
    expect(service.restaurants().length).toBe(2);
    expect(service.restaurantId()).toBe('r1');
    expect(service.needsOnboarding()).toBe(false);
  });

  it('refresh 401 → anonyme, aucun restaurant', async () => {
    const promise = service.refresh();
    flushMe(null);
    await promise;

    expect(service.isAuthenticated()).toBe(false);
    expect(service.restaurantId()).toBeNull();
  });

  it('organisation sans restaurant → authentifié mais onboarding requis', async () => {
    const promise = service.refresh();
    flushMe('org1');
    await tick();
    http.expectOne((r) => r.url.endsWith('/restaurants')).flush([]);
    await promise;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.restaurantId()).toBeNull();
    expect(service.needsOnboarding()).toBe(true);
  });

  it('selectRestaurant change le restaurant courant', async () => {
    const promise = service.refresh();
    flushMe('org1');
    await tick();
    http
      .expectOne((r) => r.url.endsWith('/restaurants'))
      .flush([
        { id: 'r1', name: 'Chez A' },
        { id: 'r2', name: 'Chez B' },
      ]);
    await promise;

    service.selectRestaurant('r2');
    expect(service.restaurantId()).toBe('r2');
  });

  it('clear() revient à l’état anonyme (déconnexion)', () => {
    service.clear();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.restaurantId()).toBeNull();
  });
});
