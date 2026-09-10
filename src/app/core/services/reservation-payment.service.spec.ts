import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { ReservationPaymentService } from './reservation-payment.service';

describe('ReservationPaymentService', () => {
  let service: ReservationPaymentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReservationPaymentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getByPaymentToken : GET la route publique, sans en-tête d’authentification', async () => {
    const promise = firstValueFrom(service.getByPaymentToken('tok-1'));

    const req = http.expectOne((r) => r.url.endsWith('/public/reservations/paiement/tok-1'));
    expect(req.request.method).toBe('GET');
    // Le convive n'a pas de compte : rien à envoyer d'autre que le jeton.
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ restaurantName: 'Chez Payant', amountCents: 9000 });

    expect((await promise).restaurantName).toBe('Chez Payant');
  });

  it('startCheckout : POST et renvoie l’URL Stripe', async () => {
    const promise = firstValueFrom(service.startCheckout('tok-1'));

    const req = http.expectOne((r) =>
      r.url.endsWith('/public/reservations/paiement/tok-1/checkout'),
    );
    expect(req.request.method).toBe('POST');
    req.flush({ url: 'https://checkout.stripe.com/cs_1' });

    expect((await promise).url).toBe('https://checkout.stripe.com/cs_1');
  });

  // TICKET 09 : le complement a sa propre route et son propre jeton. Le jeton du
  // paiement initial ne doit jamais mener au complement, ni l'inverse.
  it('getByTopUpToken : GET la route du complement, pas celle du paiement', async () => {
    const promise = firstValueFrom(service.getByTopUpToken('top-1'));

    const req = http.expectOne((r) => r.url.endsWith('/public/reservations/complement/top-1'));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({
      restaurantName: 'Chez Payant',
      currentPartySize: 2,
      targetPartySize: 5,
      amountCents: 4500,
      status: 'pending',
    });

    const topUp = await promise;
    expect(topUp.currentPartySize).toBe(2);
    expect(topUp.targetPartySize).toBe(5);
  });

  it('startTopUpCheckout : POST et renvoie l’URL Stripe du complement', async () => {
    const promise = firstValueFrom(service.startTopUpCheckout('top-1'));

    const req = http.expectOne((r) =>
      r.url.endsWith('/public/reservations/complement/top-1/checkout'),
    );
    expect(req.request.method).toBe('POST');
    req.flush({ url: 'https://checkout.stripe.com/cs_topup' });

    expect((await promise).url).toBe('https://checkout.stripe.com/cs_topup');
  });

  it('cancel : POST sur le jeton d’annulation, distinct du jeton de paiement', async () => {
    const promise = firstValueFrom(service.cancel('cancel-1'));

    const req = http.expectOne((r) => r.url.endsWith('/public/reservations/annulation/cancel-1'));
    expect(req.request.method).toBe('POST');
    req.flush({ cancelled: true, refunded: true, refundedAmountCents: 9000 });

    expect((await promise).refunded).toBe(true);
  });
});
