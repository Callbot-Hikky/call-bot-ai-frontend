import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ReservationPaymentPage } from './reservation-payment-page';
import type { PublicReservation } from '@core/models/guarantee.model';

/**
 * Le lien de reglement recu par message. Deux choses comptent ici : ne jamais
 * proposer un paiement qui echouera (lien mort), et ne jamais laisser croire a un
 * prelevement quand le mode no-show ne fait qu'enregistrer une carte.
 */
describe('ReservationPaymentPage', () => {
  let http: HttpTestingController;
  /** window.location est remplace : jsdom refuse une vraie navigation. */
  let location: { href: string };
  let realLocation: PropertyDescriptor | undefined;

  const awaiting: PublicReservation = {
    restaurantName: 'Chez Payant',
    startsAt: '2030-07-01T19:00:00Z',
    partySize: 4,
    guaranteeMode: 'booking_fee',
    guaranteeStatus: 'awaiting',
    status: 'confirmed',
    amountCents: 6000,
    currency: 'eur',
    refundWindowHours: 24,
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
      imports: [ReservationPaymentPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    if (realLocation) Object.defineProperty(window, 'location', realLocation);
    http.verify();
  });

  async function open(reservation: Partial<PublicReservation> = {}) {
    const fixture = TestBed.createComponent(ReservationPaymentPage);
    fixture.componentRef.setInput('token', 'pay-1');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    http.expectOne((r) => r.url.endsWith('/paiement/pay-1')).flush({ ...awaiting, ...reservation });
    await fixture.whenStable();
    return fixture;
  }

  it('affiche le restaurant et le montant a regler', async () => {
    const fixture = await open();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Chez Payant');
    expect(text).toContain('60,00');
  });

  it('montre la part par couvert, arrondie au centime', async () => {
    // 60,00 EUR pour 7 couverts : 857,14... centimes, arrondi a 857.
    const fixture = await open({ partySize: 7 });
    expect(fixture.componentInstance['perGuest']()).toContain('8,57');
  });

  // L'echeance vient du backend. Aucun delai n'est ecrit en dur dans la page :
  // si le backend change de politique, l'ecran suit au lieu de mentir.
  it('annonce l echeance reelle du lien quand elle tient encore', async () => {
    const dans30Min = new Date(Date.now() + 30 * 60_000).toISOString();
    const fixture = await open({ expiresAt: dans30Min });
    expect(fixture.nativeElement.textContent).toContain('Ce lien reste valable');
  });

  // Le backend bascule le lien en expire paresseusement : la page ne doit pas
  // affirmer une validite que l'horloge dement deja.
  it('echeance deja passee : la page ne promet plus rien', async () => {
    const ilYA5Min = new Date(Date.now() - 5 * 60_000).toISOString();
    const fixture = await open({ expiresAt: ilYA5Min });
    expect(fixture.nativeElement.textContent).not.toContain('Ce lien reste valable');
  });

  it('echeance sur un autre jour : pas d heure trompeuse sans sa date', async () => {
    const demain = new Date(Date.now() + 26 * 3_600_000).toISOString();
    const fixture = await open({ expiresAt: demain });
    expect(fixture.nativeElement.textContent).not.toContain('Ce lien reste valable');
  });

  it('sans echeance connue, la page n invente aucun delai', async () => {
    const fixture = await open({ expiresAt: null });
    const text: string = fixture.nativeElement.textContent;
    expect(text).not.toContain('Ce lien reste valable');
    expect(text).not.toContain('30 minutes');
  });

  it('jeton inconnu : lien mort, aucun bouton de paiement', async () => {
    const fixture = TestBed.createComponent(ReservationPaymentPage);
    fixture.componentRef.setInput('token', 'pay-1');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/paiement/pay-1'))
      .flush('nope', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("n'est plus valable");
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  // Un lien qui repond encore mais dont les frais sont deja regles ne doit pas
  // proposer un second paiement.
  it('reservation deja reglee : le lien est traite comme mort', async () => {
    const fixture = await open({ guaranteeStatus: 'secured' });
    expect(fixture.componentInstance['linkDead']()).toBe(true);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('mode no-show : la page enregistre une carte, elle ne fait pas payer', async () => {
    const fixture = await open({ guaranteeMode: 'no_show' });
    expect(fixture.componentInstance['isNoShow']()).toBe(true);
    // « À régler » ferait croire a un prelevement immediat, ce qui est faux.
    expect(fixture.nativeElement.textContent).not.toContain('À régler');
  });

  it('paiement : redirige le navigateur vers la page hebergee', async () => {
    const fixture = await open();
    (fixture.nativeElement.querySelector('button') as HTMLElement).click();
    await fixture.whenStable();

    const req = http.expectOne((r) => r.url.endsWith('/paiement/pay-1/checkout'));
    expect(req.request.method).toBe('POST');
    req.flush({ url: 'https://checkout.stripe.com/cs_test_1' });
    await fixture.whenStable();

    expect(location.href).toBe('https://checkout.stripe.com/cs_test_1');
  });

  // Le service refuse une adresse non https : la page doit le traiter comme un echec
  // et surtout ne pas deplacer le navigateur.
  it('adresse de paiement douteuse : aucune redirection, message affiche', async () => {
    const fixture = await open();
    (fixture.nativeElement.querySelector('button') as HTMLElement).click();
    await fixture.whenStable();

    http.expectOne((r) => r.url.endsWith('/checkout')).flush({ url: 'javascript:alert(1)' });
    await fixture.whenStable();

    expect(location.href).toBe('');
    expect(fixture.nativeElement.textContent).toContain("Impossible d'ouvrir le paiement");
  });

  it('deux clics n ouvrent qu un seul paiement', async () => {
    const fixture = await open();
    const button = fixture.nativeElement.querySelector('button') as HTMLElement;
    button.click();
    button.click();
    await fixture.whenStable();

    // expectOne echouerait si un second POST etait parti.
    http
      .expectOne((r) => r.url.endsWith('/checkout'))
      .flush({ url: 'https://checkout.stripe.com/c' });
    await fixture.whenStable();
  });

  it('ouverture impossible : message clair et bouton reactive', async () => {
    const fixture = await open();
    (fixture.nativeElement.querySelector('button') as HTMLElement).click();
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/checkout'))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('rappelez le restaurant');
    expect(fixture.componentInstance['redirecting']()).toBe(false);
  });
});
