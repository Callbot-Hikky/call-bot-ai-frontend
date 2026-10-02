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

  // L'adresse recue deplace le navigateur du convive : une adresse non verifiee
  // serait une redirection ouverte. Seule une adresse absolue en https passe.
  it.each([
    ['javascript:alert(1)', 'un schema executable'],
    ['http://checkout.stripe.com/cs_1', 'du http en clair'],
    ['/paiement/local', 'une adresse relative'],
    ['', 'une adresse vide'],
  ])('startCheckout refuse %s (%s)', async (url) => {
    const promise = firstValueFrom(service.startCheckout('tok-1'));
    http.expectOne((r) => r.url.endsWith('/paiement/tok-1/checkout')).flush({ url });

    await expect(promise).rejects.toThrow('Adresse de paiement invalide.');
  });

  it('startTopUpCheckout applique la meme verification', async () => {
    const promise = firstValueFrom(service.startTopUpCheckout('top-1'));
    http
      .expectOne((r) => r.url.endsWith('/complement/top-1/checkout'))
      .flush({ url: 'javascript:alert(1)' });

    await expect(promise).rejects.toThrow('Adresse de paiement invalide.');
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

  // TICKET 12 : la modification a sa propre route et son propre jeton, distinct des
  // trois autres. Il est le seul a survivre a son usage.
  it('getByModificationToken : GET la route de modification, sans authentification', async () => {
    const promise = firstValueFrom(service.getByModificationToken('mod-1'));

    const req = http.expectOne((r) => r.url.endsWith('/public/reservations/modifier/mod-1'));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ restaurantName: 'Chez Payant', partySize: 4, open: true });

    expect((await promise).partySize).toBe(4);
  });

  it('getModificationSlots : porte la tablée envisagée, pour que la grille suive', async () => {
    const promise = firstValueFrom(service.getModificationSlots('mod-1', 6, '2030-07-01'));

    const req = http.expectOne((r) =>
      r.url.endsWith('/public/reservations/modifier/mod-1/creneaux'),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('partySize')).toBe('6');
    expect(req.request.params.get('fromDate')).toBe('2030-07-01');
    req.flush({ days: [{ date: '2030-07-01', slots: [] }] });

    expect((await promise).days.length).toBe(1);
  });

  it('getModificationSlots : omet la date quand le convive n’en a pas choisi', async () => {
    const promise = firstValueFrom(service.getModificationSlots('mod-1', 2));

    const req = http.expectOne((r) =>
      r.url.endsWith('/public/reservations/modifier/mod-1/creneaux'),
    );
    expect(req.request.params.has('fromDate')).toBe(false);
    req.flush({ days: [] });

    await promise;
  });

  it('modify : PUT ce qui change, et rien d’autre', async () => {
    // Ce qui est omis est laissé tel quel : le convive ne doit pas pouvoir effacer
    // une note ou une table en ne les mentionnant pas.
    const promise = firstValueFrom(service.modify('mod-1', { partySize: 2 }));

    const req = http.expectOne((r) => r.url.endsWith('/public/reservations/modifier/mod-1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ partySize: 2 });
    req.flush({ startsAt: '2030-07-01T19:00:00Z', partySize: 2, refundedAmountCents: 3000 });

    expect((await promise).refundedAmountCents).toBe(3000);
  });
});
