import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { ReservationPage } from './reservation';

registerLocaleData(localeFr);

const SLOT = {
  startsAt: '2026-09-13T19:30:00+02:00',
  endsAt: '2026-09-13T21:00:00+02:00',
  tableId: 't-1',
  capacity: 4,
};
const RESERVATION = {
  id: 'r-1',
  restaurantId: 'rest-1',
  restaurantName: "La Table d'Ines",
  startsAt: '2026-09-12T19:30:00+02:00',
  endsAt: '2026-09-12T21:00:00+02:00',
  partySize: 2,
  status: 'pending',
  customerFirstName: 'Nadia',
};

// La page de replanification est le point d'arrivee du lien recu par message : elle doit
// fonctionner sans aucune session, par les routes publiques.
describe('ReservationPage (replanification publique)', () => {
  let fixture: ComponentFixture<ReservationPage>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationPage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(ReservationPage);
    fixture.componentRef.setInput('id', 'r-1');
    await fixture.whenStable();
    http.expectOne('/api/public/reservations/r-1').flush(RESERVATION);
    await fixture.whenStable();
    http
      .expectOne((r) => r.url.startsWith('/api/public/reservations/r-1/slots'))
      .flush({ days: [{ date: '2026-09-13', slots: [SLOT] }] });
    await fixture.whenStable();
  }

  it('charge la reservation et ses creneaux par les routes publiques, avec le lien menu', async () => {
    await render();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain("La Table d'Ines");
    expect(text).toContain('Nadia');
    expect(
      fixture.nativeElement.querySelector('[data-testid="link-menu"]').getAttribute('href'),
    ).toBe('/client/restaurants/rest-1/menu?reservation=r-1');
    expect(fixture.componentInstance.partySize()).toBe(2);
  });

  it('un lien inconnu affiche « Réservation introuvable » sans charger les creneaux', async () => {
    fixture = TestBed.createComponent(ReservationPage);
    fixture.componentRef.setInput('id', 'r-x');
    await fixture.whenStable();
    http
      .expectOne('/api/public/reservations/r-x')
      .flush('nope', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Réservation introuvable');
    http.expectNone((r) => r.url.includes('/slots'));
  });

  it('une reservation annulee ne propose plus de creneaux mais un lien pour reserver a nouveau', async () => {
    fixture = TestBed.createComponent(ReservationPage);
    fixture.componentRef.setInput('id', 'r-1');
    await fixture.whenStable();
    http.expectOne('/api/public/reservations/r-1').flush({ ...RESERVATION, status: 'cancelled' });
    await fixture.whenStable();
    http.match((r) => r.url.includes('/slots')).forEach((req) => req.flush({ days: [] }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="cancelled-state"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('hk-reservation-slot-picker')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="link-book-again"]').getAttribute('href'),
    ).toBe('/client/restaurants/rest-1/schedule');
  });

  it('confirmer envoie le PUT public sans nom ni table, puis va sur la page confirmee', async () => {
    await render();
    fixture.componentInstance.onSlotPicked(SLOT);
    fixture.componentInstance.newNotes.set(' Poussette ');
    fixture.componentInstance.confirm();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.method === 'PUT');
    expect(req.request.url).toBe('/api/public/reservations/r-1');
    expect(req.request.body).toEqual({ startsAt: SLOT.startsAt, partySize: 2, notes: 'Poussette' });
    req.flush({ ...RESERVATION, startsAt: SLOT.startsAt });
    await fixture.whenStable();
    expect(router.navigate).toHaveBeenCalledWith(['/client/reservations', 'r-1', 'confirmed']);
  });

  it('une reponse de creneaux en retard ne remplace pas la plus recente', async () => {
    await render();
    fixture.componentInstance.partySize.set(3);
    await fixture.whenStable();
    fixture.componentInstance.partySize.set(4);
    await fixture.whenStable();
    const pending = http.match((r) => r.url.includes('/slots'));
    const forThree = pending.find((r) => r.request.url.includes('partySize=3'));
    const forFour = pending.find((r) => r.request.url.includes('partySize=4'));
    expect(forThree).toBeTruthy();
    expect(forFour).toBeTruthy();
    forFour!.flush({ days: [{ date: '2026-09-13', slots: [SLOT] }] });
    forThree!.flush({ days: [] });
    await fixture.whenStable();
    expect(fixture.componentInstance.days()).toEqual([{ date: '2026-09-13', slots: [SLOT] }]);
  });

  it('une panne du chargement des creneaux propose de reessayer, sans passer pour complet', async () => {
    await render();
    fixture.componentInstance.partySize.set(3);
    await fixture.whenStable();
    http
      .expectOne((r) => r.url.includes('partySize=3'))
      .flush('boom', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.componentInstance.slotsError()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Réessayer');
    fixture.componentInstance.reloadSlots();
    await fixture.whenStable();
    http.expectOne((r) => r.url.includes('partySize=3')).flush({ days: [] });
    await fixture.whenStable();
    expect(fixture.componentInstance.slotsError()).toBe(false);
  });

  it('un creneau pris entre-temps (409) est explique et les creneaux rechargés', async () => {
    await render();
    fixture.componentInstance.onSlotPicked(SLOT);
    fixture.componentInstance.confirm();
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'PUT')
      .flush({ error: 'no_table' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(fixture.componentInstance.submitError()).toContain("vient d'être pris");
    http.expectOne((r) => r.url.includes('/slots')).flush({ days: [] });
  });
});
