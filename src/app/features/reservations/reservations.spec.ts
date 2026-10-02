import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { ReservationsPage } from './reservations';
import { SessionService } from '@core/services/session.service';
import { ToastService } from '@core/services/toast.service';
import type { NewReservationInput } from '@shared/components/organisms/new-reservation-dialog/hk-new-reservation-dialog';

/**
 * La page qui orchestre la PRISE MANUELLE : elle enchaine les deux appels du
 * service, puis propose le placement. Ce qui se joue ici et nulle part ailleurs :
 * l'anti double-envoi, le sort de la saisie quand la creation echoue, et le
 * passage de relais vers le plan de salle.
 */
describe('ReservationsPage (prise manuelle)', () => {
  let http: HttpTestingController;
  let toast: ToastService;

  const saisie: NewReservationInput = {
    firstName: 'Camille',
    phone: '+33 6 12 34 56 78',
    dateTime: new Date(2030, 6, 1, 20, 0, 0),
    partySize: 4,
    notes: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SessionService, useValue: { restaurantId: signal('rest-1') } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    vi.spyOn(toast, 'show');
  });

  afterEach(() => http.verify());

  /**
   * Monte la page et absorbe tout ce que le montage declenche (reservations du
   * jour, demandes de rappel), sans presumer de leur ordre ni de leur nombre :
   * ce spec porte sur la creation manuelle, pas sur le chargement initial.
   */
  async function open() {
    const fixture = TestBed.createComponent(ReservationsPage);
    fixture.autoDetectChanges();
    await fixture.whenStable();

    for (const req of http.match(() => true)) {
      req.flush([]);
    }
    await fixture.whenStable();
    return fixture;
  }

  /** Repond aux deux appels de la creation : le client, puis la reservation. */
  function answerCreation(startsAt = '2030-07-01T20:00:00+02:00') {
    http.expectOne((r) => r.url.endsWith('/customers')).flush({ id: 'cust-1' });
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/reservations'))
      .flush({
        id: 'r-1',
        restaurantId: 'rest-1',
        customerId: 'cust-1',
        tableId: null,
        callId: null,
        startsAt,
        endsAt: '2030-07-01T22:00:00+02:00',
        partySize: 4,
        status: 'confirmed',
        source: 'manual',
        notes: null,
        createdAt: startsAt,
        updatedAt: startsAt,
        cancelledAt: null,
        table: null,
        customer: { id: 'cust-1', firstName: 'Camille', lastName: null, phone: saisie.phone },
      });
  }

  it('cree la reservation, ferme le formulaire et propose de la placer', async () => {
    const fixture = await open();
    fixture.componentInstance['newResaState'].set('open');
    fixture.componentInstance['onCreateManual'](saisie);
    await fixture.whenStable();

    answerCreation();
    await fixture.whenStable();

    expect(fixture.componentInstance['creatingManual']()).toBe(false);
    expect(fixture.componentInstance['newResaState']()).toBe('closed');
    // Le toast porte une ACTION : c'est le passage de relais vers le plan.
    expect(toast.show).toHaveBeenCalledWith(
      expect.stringContaining('Camille'),
      'success',
      expect.objectContaining({ label: 'Placer sur le plan' }),
    );
  });

  it('l action du toast emmene sur le plan avec la reservation preselectionnee', async () => {
    const fixture = await open();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance['onCreateManual'](saisie);
    await fixture.whenStable();
    answerCreation();
    await fixture.whenStable();

    // On declenche l'action proposee dans le toast.
    const action = vi.mocked(toast.show).mock.calls[0][2] as { run: () => void };
    action.run();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/plan'], { queryParams: { placer: 'r-1' } });
    // Le plan s'ouvre sur le jour de la reservation : ce changement de jour
    // relance un chargement, qu'on absorbe pour finir sur un bilan propre.
    for (const req of http.match(() => true)) {
      req.flush([]);
    }
  });

  // Si la creation echoue, la saisie ne doit PAS disparaitre : le restaurateur a le
  // client au telephone, lui refaire taper le numero est inacceptable.
  it('echec de creation : le formulaire reste ouvert avec un message', async () => {
    const fixture = await open();
    // On part du parcours reel : le formulaire est ouvert quand on valide.
    fixture.componentInstance['newResaState'].set('open');
    fixture.componentInstance['onCreateManual'](saisie);
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/customers'))
      .flush({ error: 'duplicate_phone' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(fixture.componentInstance['creatingManual']()).toBe(false);
    expect(fixture.componentInstance['newResaState']()).not.toBe('closed');
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('un 409 du back devient un message comprehensible', async () => {
    const fixture = await open();
    fixture.componentInstance['onCreateManual'](saisie);
    await fixture.whenStable();

    http
      .expectOne((r) => r.url.endsWith('/customers'))
      .flush({ error: 'duplicate_phone' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('existe déjà'), 'error');
  });

  it('deux envois rapproches ne creent qu une reservation', async () => {
    const fixture = await open();
    fixture.componentInstance['onCreateManual'](saisie);
    fixture.componentInstance['onCreateManual'](saisie);
    await fixture.whenStable();

    // expectOne echouerait si la garde n'avait pas bloque le second envoi.
    answerCreation();
    await fixture.whenStable();
  });

  it('reservation prise pour un autre jour : annoncee avec sa date', async () => {
    const fixture = await open();
    fixture.componentInstance['onCreateManual'](saisie);
    await fixture.whenStable();

    answerCreation('2030-07-05T20:00:00+02:00');
    await fixture.whenStable();

    // Le jour affiche est aujourd'hui : le toast doit lever l'ambiguite.
    expect(toast.show).toHaveBeenCalledWith(
      expect.stringMatching(/\(.+\)/),
      'success',
      expect.anything(),
    );
  });
});
