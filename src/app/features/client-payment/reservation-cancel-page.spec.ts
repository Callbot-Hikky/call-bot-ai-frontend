import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ReservationCancelPage } from './reservation-cancel-page';
import type { PublicReservation } from '@core/models/guarantee.model';

/**
 * Ce que la page annonce AVANT le clic : le sort de l'argent. Personne ne doit
 * decouvrir qu'il perd ses frais une fois la table rendue. Le backend refait le
 * calcul, mais un affichage faux ici est une promesse non tenue.
 */
describe('ReservationCancelPage', () => {
  let http: HttpTestingController;

  /** Table de quatre, frais payes, remboursables jusqu'a 24 h avant le service. */
  const secured: PublicReservation = {
    restaurantName: 'Chez Payant',
    startsAt: '2030-07-01T19:00:00Z',
    partySize: 4,
    guaranteeMode: 'booking_fee',
    guaranteeStatus: 'secured',
    status: 'confirmed',
    amountCents: 6000,
    currency: 'eur',
    refundWindowHours: 24,
    expiresAt: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationCancelPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open(reservation: Partial<PublicReservation> = {}) {
    const fixture = TestBed.createComponent(ReservationCancelPage);
    fixture.componentRef.setInput('token', 'cancel-1');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/annulation/cancel-1'))
      .flush({ ...secured, ...reservation });
    await fixture.whenStable();
    return fixture;
  }

  /** Lien mort : l'API ne reconnait pas le jeton. */
  async function openDead() {
    const fixture = TestBed.createComponent(ReservationCancelPage);
    fixture.componentRef.setInput('token', 'cancel-1');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/annulation/cancel-1'))
      .flush('nope', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    return fixture;
  }

  it('affiche la reservation derriere le lien', async () => {
    const fixture = await open();
    expect(fixture.nativeElement.textContent).toContain('Chez Payant');
  });

  it('jeton inconnu : la page le dit et ne propose pas d annuler', async () => {
    const fixture = await openDead();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain("n'est plus valable");
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  // Le coeur sensible : c'est ce chiffre qui engage le restaurant vis-a-vis du convive.
  // Les dates sont posees PAR RAPPORT A MAINTENANT : la page lit l'horloge reelle, et
  // figer le temps bloquerait l'attente asynchrone d'Angular.
  describe('annonce du remboursement', () => {
    const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

    it('dans la fenetre : le remboursement est annonce', async () => {
      // Service dans 48 h, remboursable jusqu'a 24 h avant : on est encore dedans.
      const fixture = await open({ startsAt: inHours(48), refundWindowHours: 24 });
      expect(fixture.componentInstance['willBeRefunded']()).toBe(true);
    });

    it('hors fenetre : aucun remboursement annonce', async () => {
      // Service dans 2 h : la limite des 24 h avant est passee depuis longtemps.
      const fixture = await open({ startsAt: inHours(2), refundWindowHours: 24 });
      expect(fixture.componentInstance['willBeRefunded']()).toBe(false);
    });

    it('rien n a ete encaisse : aucun remboursement a annoncer', async () => {
      const fixture = await open({ startsAt: inHours(48), guaranteeStatus: 'awaiting' });
      expect(fixture.componentInstance['willBeRefunded']()).toBe(false);
    });

    it('sans fenetre definie, la limite est l heure du service', async () => {
      const avant = await open({ startsAt: inHours(2), refundWindowHours: null });
      expect(avant.componentInstance['willBeRefunded']()).toBe(true);
    });

    it('service deja passe : plus de remboursement', async () => {
      const fixture = await open({ startsAt: inHours(-2), refundWindowHours: null });
      expect(fixture.componentInstance['willBeRefunded']()).toBe(false);
    });
  });

  it('confirme l annulation et affiche le montant rembourse', async () => {
    const fixture = await open();
    (fixture.nativeElement.querySelector('button') as HTMLElement).click();
    await fixture.whenStable();

    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/annulation/cancel-1'),
    );
    req.flush({ cancelled: true, refunded: true, refundedAmountCents: 6000 });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('60,00');
  });

  it('deux clics n envoient qu une seule annulation', async () => {
    const fixture = await open();
    const button = fixture.nativeElement.querySelector('button') as HTMLElement;
    button.click();
    button.click();
    await fixture.whenStable();

    // Une seule requete en vol : expectOne echouerait s'il y en avait deux.
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ cancelled: true, refunded: false, refundedAmountCents: null });
    await fixture.whenStable();
  });

  it('annulation refusee : message clair, et on peut reessayer', async () => {
    const fixture = await open();
    (fixture.nativeElement.querySelector('button') as HTMLElement).click();
    await fixture.whenStable();

    http
      .expectOne((r) => r.method === 'POST')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Appelez le restaurant');
    expect(fixture.componentInstance['cancelling']()).toBe(false);
  });

  it('deja annulee : la page ne repropose pas l annulation', async () => {
    const fixture = await open({ status: 'cancelled' });
    expect(fixture.componentInstance['alreadyCancelled']()).toBe(true);
  });
});
