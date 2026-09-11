import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { ReservationSchedulePage } from './reservation-schedule';

registerLocaleData(localeFr);

const RID = 'c3fb8a95-c066-40b0-8d14-d20a32b501c5';
const SLOT = {
  startsAt: '2026-09-12T19:30:00+02:00',
  endsAt: '2026-09-12T21:00:00+02:00',
  tableId: 't-1',
  capacity: 4,
};

describe('ReservationSchedulePage', () => {
  let fixture: ComponentFixture<ReservationSchedulePage>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationSchedulePage],
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

  async function render(menuStatus = 200, days = [{ date: '2026-09-12', slots: [SLOT] }]) {
    fixture = TestBed.createComponent(ReservationSchedulePage);
    fixture.componentRef.setInput('id', RID);
    await fixture.whenStable();
    const menu = http.expectOne((r) => r.url.endsWith(`/public/restaurants/${RID}/menu`));
    if (menuStatus === 200) {
      menu.flush({ restaurantName: "La Table d'Ines", mode: 'pdf', manual: null, files: [] });
    } else {
      menu.flush('nope', { status: menuStatus, statusText: 'Not Found' });
    }
    http
      .expectOne(
        (r) => r.url.includes(`/public/restaurants/${RID}/slots`) && r.url.includes('partySize=2'),
      )
      .flush({ days });
    await fixture.whenStable();
  }

  it('affiche le nom du restaurant, le lien vers le menu et les creneaux pour 2 personnes', async () => {
    await render();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain("La Table d'Ines");
    expect(fixture.nativeElement.querySelector('[data-testid="link-menu"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('hk-reservation-slot-picker')).not.toBeNull();
  });

  it('un restaurant inconnu affiche un message clair', async () => {
    await render(404);
    expect(fixture.nativeElement.textContent).toContain('introuvable');
  });

  it('changer le nombre de personnes recharge les creneaux avec ce nombre', async () => {
    await render();
    fixture.componentInstance['partySize'].set(6);
    await fixture.whenStable();
    http
      .expectOne((r) => r.url.includes('/slots') && r.url.includes('partySize=6'))
      .flush({ days: [{ date: '2026-09-12', slots: [] }] });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="no-slots"]')).not.toBeNull();
  });

  it('confirmer sans prenom ni telephone valide bloque avant tout envoi', async () => {
    await render();
    fixture.componentInstance['onSlotPicked'](SLOT);
    fixture.componentInstance['phone'].set('abc');
    fixture.componentInstance['confirm']();
    await fixture.whenStable();
    const errors = fixture.componentInstance['fieldErrors']();
    expect(errors.firstName).toContain('prénom');
    expect(errors.phone).toContain('téléphone');
    http.expectNone((r) => r.method === 'POST');
  });

  it('confirmer envoie le creneau, les couverts et le client, puis va sur la page confirmee', async () => {
    await render();
    fixture.componentInstance['onSlotPicked'](SLOT);
    fixture.componentInstance['firstName'].set('  Nadia ');
    fixture.componentInstance['phone'].set('06 12 34 56 78');
    fixture.componentInstance['notes'].set('');
    fixture.componentInstance['confirm']();
    await fixture.whenStable();
    const req = http.expectOne((r) => r.method === 'POST');
    expect(req.request.body).toEqual({
      startsAt: SLOT.startsAt,
      partySize: 2,
      customer: { firstName: 'Nadia', phone: '06 12 34 56 78' },
      notes: undefined,
    });
    req.flush({
      id: 'r-1',
      restaurantId: RID,
      restaurantName: "La Table d'Ines",
      startsAt: SLOT.startsAt,
      endsAt: SLOT.endsAt,
      partySize: 2,
      status: 'pending',
      customerFirstName: 'Nadia',
    });
    await fixture.whenStable();
    expect(router.navigate).toHaveBeenCalledWith(['/client/reservations', 'r-1', 'confirmed']);
  });

  it('un creneau pris entre-temps (409) est explique en francais et la liste est rechargee', async () => {
    await render();
    fixture.componentInstance['onSlotPicked'](SLOT);
    fixture.componentInstance['firstName'].set('Nadia');
    fixture.componentInstance['phone'].set('0612345678');
    fixture.componentInstance['confirm']();
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ error: 'no_table' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(fixture.componentInstance['submitError']()).toContain("vient d'être pris");
    http.expectOne((r) => r.url.includes('/slots')).flush({ days: [] });
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
