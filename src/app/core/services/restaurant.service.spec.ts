import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { RestaurantService } from './restaurant.service';

describe('RestaurantService', () => {
  let service: RestaurantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RestaurantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('create : POST /restaurants avec les coordonnées complètes', async () => {
    const promise = firstValueFrom(
      service.create({
        organizationId: 'org1',
        name: 'Le Bistrot',
        phoneNumber: '+33100000000',
        address: '1 rue de la Paix',
        city: 'Paris',
        postalCode: '75002',
      }),
    );

    const req = http.expectOne((r) => r.url.endsWith('/restaurants'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      organizationId: 'org1',
      name: 'Le Bistrot',
      phoneNumber: '+33100000000',
      address: '1 rue de la Paix',
      city: 'Paris',
      postalCode: '75002',
      timezone: 'Europe/Paris',
    });
    req.flush({ id: 'r1', organizationId: 'org1', name: 'Le Bistrot' });

    const created = await promise;
    expect(created.id).toBe('r1');
  });

  it('create : coordonnées optionnelles omises quand absentes', async () => {
    firstValueFrom(
      service.create({ organizationId: 'org1', name: 'X', phoneNumber: '+33100000000' }),
    );

    const req = http.expectOne((r) => r.url.endsWith('/restaurants'));
    expect(req.request.body).toEqual({
      organizationId: 'org1',
      name: 'X',
      phoneNumber: '+33100000000',
      timezone: 'Europe/Paris',
    });
    req.flush({ id: 'r1' });
  });
});
