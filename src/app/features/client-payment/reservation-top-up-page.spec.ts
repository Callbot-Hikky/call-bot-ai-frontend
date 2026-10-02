import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ReservationTopUpPage } from './reservation-top-up-page';
import type { PublicTopUp } from '@core/models/guarantee.model';

/**
 * Le complement : la tablee a grandi, le convive regle la difference. Son jeton est
 * distinct de celui du paiement initial, et il est a usage unique : passe le delai,
 * la page doit le dire au lieu d'offrir un bouton qui echouera.
 */
describe('ReservationTopUpPage', () => {
  let http: HttpTestingController;
  let location: { href: string };
  let realLocation: PropertyDescriptor | undefined;

  /** Table passee de 4 a 6 couverts, 30,00 EUR de complement. */
  const pending: PublicTopUp = {
    restaurantName: 'Chez Payant',
    startsAt: '2030-07-01T19:00:00Z',
    currentPartySize: 4,
    targetPartySize: 6,
    amountCents: 3000,
    currency: 'eur',
    status: 'pending',
    expiresAt: null,
  };

  beforeEach(async () => {
    realLocation = Object.getOwnPropertyDescriptor(window, 'location');
    location = { href: '' };
    Object.defineProperty(window, 'location', {
      value: location,
      writable: true,
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [ReservationTopUpPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    if (realLocation) Object.defineProperty(window, 'location', realLocation);
    http.verify();
  });

  async function open(topUp: Partial<PublicTopUp> = {}) {
    const fixture = TestBed.createComponent(ReservationTopUpPage);
    fixture.componentRef.setInput('token', 'top-1');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    http.expectOne((r) => r.url.endsWith('/complement/top-1')).flush({ ...pending, ...topUp });
    await fixture.whenStable();
    return fixture;
  }

  it('annonce le passage de l ancienne a la nouvelle tablee', async () => {
    const fixture = await open();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Chez Payant');
    expect(text).toContain('30,00');
    expect(fixture.componentInstance['extraGuests']()).toBe(2);
  });

  it('delai passe : le lien est mort, aucun bouton', async () => {
    const fixture = await open({ status: 'closed' });
    expect(fixture.componentInstance['linkDead']()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain("n'est plus valable");
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('jeton inconnu : lien mort aussi', async () => {
    const fixture = TestBed.createComponent(ReservationTopUpPage);
    fixture.componentRef.setInput('token', 'top-1');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/complement/top-1'))
      .flush('nope', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(fixture.componentInstance['linkDead']()).toBe(true);
  });

  it('reglement : redirige vers la page hebergee', async () => {
    const fixture = await open();
    (fixture.nativeElement.querySelector('button') as HTMLElement).click();
    await fixture.whenStable();

    const req = http.expectOne((r) => r.url.endsWith('/complement/top-1/checkout'));
    expect(req.request.method).toBe('POST');
    req.flush({ url: 'https://checkout.stripe.com/cs_top_1' });
    await fixture.whenStable();

    expect(location.href).toBe('https://checkout.stripe.com/cs_top_1');
  });

  it('adresse douteuse : aucune redirection', async () => {
    const fixture = await open();
    (fixture.nativeElement.querySelector('button') as HTMLElement).click();
    await fixture.whenStable();

    http.expectOne((r) => r.url.endsWith('/checkout')).flush({ url: 'http://pas-stripe.test/x' });
    await fixture.whenStable();

    expect(location.href).toBe('');
    expect(fixture.nativeElement.textContent).toContain("Impossible d'ouvrir le paiement");
  });

  it('deux clics n ouvrent qu un seul reglement', async () => {
    const fixture = await open();
    const button = fixture.nativeElement.querySelector('button') as HTMLElement;
    button.click();
    button.click();
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/checkout'))
      .flush({ url: 'https://checkout.stripe.com/c' });
    await fixture.whenStable();
  });
});
