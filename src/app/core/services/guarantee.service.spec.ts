import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { GuaranteeService } from './guarantee.service';

describe('GuaranteeService', () => {
  let service: GuaranteeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GuaranteeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('updateSettings : PUT le mode et les montants du restaurant', async () => {
    const promise = firstValueFrom(
      service.updateSettings('r1', {
        mode: 'booking_fee',
        bookingFeeCentsPerGuest: 1500,
        noShowPenaltyCentsPerGuest: null,
        refundWindowHours: 48,
        modificationWindowHours: 3,
      }),
    );

    const req = http.expectOne((r) => r.url.endsWith('/restaurants/r1/guarantee-settings'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.bookingFeeCentsPerGuest).toBe(1500);
    // Les deux fenêtres voyagent ensemble mais restent indépendantes.
    expect(req.request.body.modificationWindowHours).toBe(3);
    req.flush({
      mode: 'booking_fee',
      bookingFeeCentsPerGuest: 1500,
      noShowPenaltyCentsPerGuest: null,
      refundWindowHours: 48,
      modificationWindowHours: 3,
    });

    expect((await promise).refundWindowHours).toBe(48);
    expect((await promise).modificationWindowHours).toBe(3);
  });

  it('startOnboarding : POST et renvoie le lien Stripe', async () => {
    const promise = firstValueFrom(service.startOnboarding('r1'));

    const req = http.expectOne((r) => r.url.endsWith('/restaurants/r1/payment-account/onboarding'));
    expect(req.request.method).toBe('POST');
    req.flush({ url: 'https://connect.stripe.com/setup/1' });

    expect((await promise).url).toBe('https://connect.stripe.com/setup/1');
  });

  it('getPayouts : GET le registre des reversements', async () => {
    const promise = firstValueFrom(service.getPayouts('r1'));

    const req = http.expectOne((r) => r.url.endsWith('/restaurants/r1/payouts'));
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'p1', amountCents: 8500, status: 'paid' }]);

    expect((await promise).length).toBe(1);
  });
});
