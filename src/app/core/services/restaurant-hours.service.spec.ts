import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { RestaurantHoursService } from './restaurant-hours.service';

describe('RestaurantHoursService', () => {
  let service: RestaurantHoursService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RestaurantHoursService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('create : POST /restaurant-hours avec le créneau', async () => {
    const promise = firstValueFrom(
      service.create({
        restaurantId: 'r1',
        dayOfWeek: 0,
        service: 'general',
        opensAt: '12:00',
        closesAt: '22:00',
      }),
    );

    const req = http.expectOne((r) => r.url.endsWith('/restaurant-hours'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      restaurantId: 'r1',
      dayOfWeek: 0,
      service: 'general',
      opensAt: '12:00',
      closesAt: '22:00',
    });
    req.flush({});
    await promise;
  });
});
