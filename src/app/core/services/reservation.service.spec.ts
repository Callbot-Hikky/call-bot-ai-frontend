import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { SessionService } from './session.service';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ReservationService } from './reservation.service';
import { ReservationDto } from '@core/models/reservation-dto.model';
import { Reservation, newReservations } from '@core/models/reservation.model';
import { localDateKey, localIso } from '@core/utils/format';

// En test, environment.useMock vaut false (fileReplacement dev) : on teste le vrai
// chemin HTTP en simulant les réponses du backend avec HttpTestingController.
function dto(id: string, status: string, startsAt = '2026-06-24T12:00:00Z'): ReservationDto {
  return {
    id,
    restaurantId: 'rest-1',
    customerId: 'cust-1',
    tableId: 'tbl-1',
    callId: null,
    startsAt,
    endsAt: '2026-06-24T21:00:00Z',
    partySize: 2,
    status,
    source: 'callbot',
    notes: null,
    createdAt: '2026-06-24T10:00:00Z',
    updatedAt: '2026-06-24T10:00:00Z',
    cancelledAt: null,
    table: { id: 'tbl-1', name: 'T1', capacity: 4 },
    customer: {
      id: 'cust-1',
      phone: '+33 6 12 34 56 78',
      firstName: 'Camille',
      lastName: 'Durand',
    },
  };
}

describe('ReservationService', () => {
  let service: ReservationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { restaurantId: signal('rest-1') } },
      ],
    });
    service = TestBed.inject(ReservationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('reservation en ligne (endpoints publics)', () => {
    it('getPublicSlots interroge les creneaux du restaurant, sans session', async () => {
      const promise = firstValueFrom(service.getPublicSlots('rest-1', 4, '2026-09-12'));
      const req = httpMock.expectOne(
        '/api/public/restaurants/rest-1/slots?partySize=4&fromDate=2026-09-12',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ days: [] });
      expect((await promise).days).toEqual([]);
    });

    it('createPublic envoie seulement le debut, les couverts et le client : ni table ni fin', async () => {
      const promise = firstValueFrom(
        service.createPublic('rest-1', {
          startsAt: '2026-09-12T19:30:00+02:00',
          partySize: 2,
          customer: { firstName: 'Nadia', phone: '06 12 34 56 78' },
          notes: 'Terrasse',
        }),
      );
      const req = httpMock.expectOne('/api/public/restaurants/rest-1/reservations');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        startsAt: '2026-09-12T19:30:00+02:00',
        partySize: 2,
        customer: { firstName: 'Nadia', phone: '06 12 34 56 78' },
        notes: 'Terrasse',
      });
      req.flush({
        id: 'r-9',
        restaurantId: 'rest-1',
        restaurantName: 'Chez Test',
        startsAt: '2026-09-12T19:30:00+02:00',
        endsAt: '2026-09-12T21:00:00+02:00',
        partySize: 2,
        status: 'pending',
        customerFirstName: 'Nadia',
      });
      const created = await promise;
      expect(created.id).toBe('r-9');
      expect(created.dateTime).toBe('2026-09-12T19:30:00+02:00');
      expect(created.customerFirstName).toBe('Nadia');
    });

    it('getPublicReservation lit la vue publique et tolere un prenom absent', async () => {
      const promise = firstValueFrom(service.getPublicReservation('r-9'));
      httpMock.expectOne('/api/public/reservations/r-9').flush({
        id: 'r-9',
        restaurantId: 'rest-1',
        restaurantName: 'Chez Test',
        startsAt: '2026-09-12T19:30:00+02:00',
        endsAt: '2026-09-12T21:00:00+02:00',
        partySize: 2,
        status: 'pending',
        customerFirstName: null,
      });
      expect((await promise).customerFirstName).toBe('');
    });
  });

  it('setDay change le jour affiche et recharge ce jour-la', () => {
    service.setDay('2026-06-25');
    expect(service.day()).toBe('2026-06-25');
    const req = httpMock.expectOne((r) => r.url.includes('/reservations'));
    req.flush([dto('1', 'pending'), dto('2', 'confirmed', '2026-06-25T12:00:00Z')]);
    expect(service.reservations().map((r) => r.id)).toEqual(['2']);
    // Le meme jour redemande : rien ne part.
    service.setDay('2026-06-25');
    httpMock.expectNone((r) => r.url.includes('/reservations'));
  });

  it('une reponse arrivee apres un changement de jour est ignoree', () => {
    service.setDay('2026-06-24');
    const first = httpMock.expectOne((r) => r.url.includes('/reservations'));
    service.setDay('2026-06-25');
    const second = httpMock.expectOne((r) => r.url.includes('/reservations'));
    // La reponse du 25 arrive avant celle du 24 (reseau) : le 24 ne doit pas l'ecraser.
    second.flush([dto('b', 'confirmed', '2026-06-25T12:00:00Z')]);
    first.flush([dto('a', 'pending')]);
    expect(service.day()).toBe('2026-06-25');
    expect(service.reservations().map((r) => r.id)).toEqual(['b']);
    expect(service.loading()).toBe(false);
  });

  it('showToday revient sur le jour courant avec une seule requete', () => {
    service.setDay('2026-06-25');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([]);
    service.showToday();
    expect(service.day()).toBe(localDateKey());
    expect(service.isToday()).toBe(true);
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([]);
    httpMock.expectNone((r) => r.url.includes('/reservations'));
  });

  it('le polling annonce les arrivees du jour courant meme en consultant un autre jour', () => {
    vi.useFakeTimers();
    try {
      const today = localDateKey();
      const todayAt = (h: number) =>
        localIso(new Date(`${today}T${String(h).padStart(2, '0')}:00:00`));
      service.loadToday();
      httpMock
        .expectOne((r) => r.url.includes('/reservations'))
        .flush([dto('t1', 'pending', todayAt(19))]);
      service.setDay('2026-06-25');
      httpMock
        .expectOne((r) => r.url.includes('/reservations'))
        .flush([dto('t1', 'pending', todayAt(19)), dto('x', 'pending', '2026-06-25T12:00:00Z')]);
      expect(service.reservations().map((r) => r.id)).toEqual(['x']);

      const announced: string[] = [];
      service.startLivePolling({ onDestroy: () => undefined } as never, {
        onNew: (r) => announced.push(r.id),
      });
      vi.advanceTimersByTime(20_000);
      httpMock
        .expectOne((r) => r.url.includes('/reservations'))
        .flush([
          dto('t1', 'pending', todayAt(19)),
          dto('t2', 'pending', todayAt(20)),
          dto('x', 'pending', '2026-06-25T12:00:00Z'),
          dto('y', 'pending', '2026-06-25T13:00:00Z'),
        ]);
      // La liste affichee suit le 25 ; le toast ne parle que de ce soir.
      expect(service.reservations().map((r) => r.id)).toEqual(['x', 'y']);
      expect(announced).toEqual(['t2']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('createWalkIn est refuse hors du jour courant', async () => {
    service.setDay('2026-06-25');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([]);
    await expect(
      firstValueFrom(service.createWalkIn({ id: 'tbl-1', name: 'T1', capacity: 4 }, 2)),
    ).rejects.toThrow("plan d'aujourd'hui");
    httpMock.expectNone((r) => r.method === 'POST');
  });

  it('charge, filtre par jour et mappe le DTO backend', () => {
    service.loadToday('2026-06-24');
    expect(service.loading()).toBe(true);
    const req = httpMock.expectOne((r) => r.url.includes('/reservations'));
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toContain('expand=table,customer');
    // Le 2e DTO est un autre jour : il doit être filtré côté front.
    req.flush([dto('1', 'pending'), dto('2', 'confirmed', '2026-06-25T12:00:00Z')]);

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe(false);
    expect(service.reservations().length).toBe(1);
    const r = service.reservations()[0];
    expect(r.customerName).toBe('Camille Durand');
    expect(r.phone).toBe('+33 6 12 34 56 78');
    expect(r.dateTime).toBe('2026-06-24T12:00:00Z');
    expect(r.table?.name).toBe('T1');
  });

  it('confirm envoie un PUT complet et met le statut à confirmed', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'pending')]);

    const result = firstValueFrom(service.confirm('1'));
    const put = httpMock.expectOne((r) => r.method === 'PUT');
    expect(put.request.url).toContain('/reservations/1');
    expect((put.request.body as { status: string }).status).toBe('confirmed');
    put.flush(dto('1', 'confirmed'));

    await result;
    expect(service.reservations().find((r) => r.id === '1')?.status).toBe('confirmed');
  });

  // LOT B3 : refresh silencieux du polling live.
  it('refresh met a jour les reservations SANS toucher loading', () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'pending')]);
    expect(service.reservations().length).toBe(1);
    expect(service.loading()).toBe(false);

    service.refresh('2026-06-24').subscribe();
    // Pendant la requete de refresh, PAS de spinner.
    expect(service.loading()).toBe(false);
    httpMock
      .expectOne((r) => r.url.includes('/reservations'))
      .flush([dto('1', 'pending'), dto('2', 'confirmed')]);

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe(false);
    expect(service.reservations().length).toBe(2);
  });

  // TICKET 08 : le changement de couverts passe par la regle portee cote back.
  // Le front se contente d'envoyer la nouvelle valeur et d'appliquer la reponse.
  it('updatePartySize envoie un PUT portant les nouveaux couverts', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'confirmed')]);

    const result = firstValueFrom(service.updatePartySize('1', 6));
    const put = httpMock.expectOne((r) => r.method === 'PUT');
    expect(put.request.url).toContain('/reservations/1');
    expect((put.request.body as { partySize: number }).partySize).toBe(6);
    // Le reste du corps reste celui du DTO courant (mutation idempotente).
    expect((put.request.body as { status: string }).status).toBe('confirmed');
    put.flush({ ...dto('1', 'confirmed'), partySize: 6 });

    await result;
    expect(service.reservations().find((r) => r.id === '1')?.partySize).toBe(6);
  });

  // TICKET 09 : une hausse payante n'est pas appliquee, elle est facturee. Le back
  // repond 200 avec l'ANCIEN nombre de couverts et un complement en attente ;
  // recopier la valeur demandee afficherait une tablee qui n'a pas bouge.
  it('updatePartySize suit la reponse du back, pas la valeur demandee', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'confirmed')]);

    const result = firstValueFrom(service.updatePartySize('1', 6));
    httpMock
      .expectOne((r) => r.method === 'PUT')
      .flush({
        ...dto('1', 'confirmed'),
        partySize: 2,
        pendingTopUp: {
          targetPartySize: 6,
          amountCents: 4500,
          currency: 'eur',
          expiresAt: '2026-06-24T12:30:00Z',
        },
      });

    const updated = await result;
    expect(updated.partySize).toBe(2);
    expect(updated.pendingTopUp?.amountCents).toBe(4500);
    expect(service.reservations().find((r) => r.id === '1')?.partySize).toBe(2);
    expect(service.reservations().find((r) => r.id === '1')?.pendingTopUp?.targetPartySize).toBe(6);
  });

  it('updatePartySize refuse par le back laisse les couverts inchanges', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'confirmed')]);

    const result = firstValueFrom(service.updatePartySize('1', 6)).catch((e: unknown) => e);
    httpMock
      .expectOne((r) => r.method === 'PUT')
      .flush(
        { status: 409, error: 'top_up_pending', message: 'one already running' },
        { status: 409, statusText: 'Conflict' },
      );

    await result;
    expect(service.reservations().find((r) => r.id === '1')?.partySize).toBe(2);
  });

  it('cancel envoie un PUT et met le statut à cancelled', async () => {
    service.loadToday('2026-06-24');
    httpMock.expectOne((r) => r.url.includes('/reservations')).flush([dto('1', 'confirmed')]);

    const result = firstValueFrom(service.cancel('1'));
    const put = httpMock.expectOne((r) => r.method === 'PUT');
    expect((put.request.body as { status: string }).status).toBe('cancelled');
    put.flush(dto('1', 'cancelled'));

    await result;
    expect(service.reservations().find((r) => r.id === '1')?.status).toBe('cancelled');
  });

  // Reservation MANUELLE : deux appels enchaines (le back cree le client a part,
  // puis la resa le reference). C'est le point le plus fragile du parcours.
  describe('createManual', () => {
    const input = {
      firstName: 'Camille',
      phone: '+33 6 12 34 56 78',
      dateTime: new Date(2026, 5, 24, 20, 0, 0),
      partySize: 4,
      notes: 'Terrasse',
    };

    it('cree le client puis la reservation, sans table et pour 2 h', async () => {
      const result = firstValueFrom(service.createManual(input));

      const customer = httpMock.expectOne((r) => r.url.endsWith('/customers'));
      expect(customer.request.method).toBe('POST');
      expect(customer.request.body).toMatchObject({
        restaurantId: 'rest-1',
        phone: input.phone,
        firstName: 'Camille',
      });
      customer.flush({ id: 'cust-9' });

      const created = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/reservations'),
      );
      const body = created.request.body as Record<string, unknown>;
      expect(body).toMatchObject({
        customerId: 'cust-9',
        tableId: null,
        partySize: 4,
        status: 'confirmed',
        source: 'manual',
        notes: 'Terrasse',
      });
      // La table est choisie plus tard sur le plan : la resa nait non placee.
      expect(body['startsAt']).toBe(localIso(input.dateTime));
      expect(body['endsAt']).toBe(
        localIso(new Date(input.dateTime.getTime() + 2 * 60 * 60 * 1000)),
      );

      created.flush({ ...dto('r-9', 'confirmed'), id: 'r-9' });
      await result;
    });

    // Le POST client est un upsert cote backend : revalider apres un echec du
    // second appel reutilise la meme fiche au lieu d'etre refuse. C'est ce qui
    // rend l'absence de compensation acceptable.
    it('apres un echec de la reservation, revalider repart du meme client', async () => {
      const premier = firstValueFrom(service.createManual(input));
      httpMock.expectOne((r) => r.url.endsWith('/customers')).flush({ id: 'cust-9' });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.endsWith('/reservations'))
        .flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(premier).rejects.toBeDefined();

      // Seconde tentative : le backend renvoie la MEME fiche (upsert par telephone).
      const second = firstValueFrom(service.createManual(input));
      const client = httpMock.expectOne((r) => r.url.endsWith('/customers'));
      expect((client.request.body as { phone: string }).phone).toBe(input.phone);
      client.flush({ id: 'cust-9' });

      const creation = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/reservations'),
      );
      expect((creation.request.body as { customerId: string }).customerId).toBe('cust-9');
      creation.flush({ ...dto('r-9', 'confirmed'), id: 'r-9' });
      await second;
    });

    it('sans nom saisi, le client est cree sans prenom', () => {
      firstValueFrom(service.createManual({ ...input, firstName: '' }));
      const customer = httpMock.expectOne((r) => r.url.endsWith('/customers'));
      expect((customer.request.body as { firstName: string | null }).firstName).toBeNull();
      customer.flush({ id: 'cust-9' });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.endsWith('/reservations'))
        .flush(dto('r-9', 'confirmed'));
    });

    it('la reponse sans customer affiche quand meme le nom saisi', async () => {
      service.loadToday(localDateKey(input.dateTime));
      httpMock.expectOne((r) => r.method === 'GET').flush([]);

      const result = firstValueFrom(service.createManual(input));
      httpMock.expectOne((r) => r.url.endsWith('/customers')).flush({ id: 'cust-9' });
      // Le back ne renvoie pas le client (pas de ?expand) : le service greffe la saisie.
      const bare = { ...dto('r-9', 'confirmed'), id: 'r-9', customer: undefined };
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.endsWith('/reservations'))
        .flush({ ...bare, startsAt: localIso(input.dateTime) });

      expect((await result).customerName).toContain('Camille');
      expect(service.reservations().map((r) => r.id)).toContain('r-9');
    });

    it('creee pour un autre jour, elle n entre pas dans la liste affichee', async () => {
      service.loadToday('2026-06-24');
      httpMock.expectOne((r) => r.method === 'GET').flush([]);

      const autreJour = new Date(2026, 5, 28, 20, 0, 0);
      const result = firstValueFrom(service.createManual({ ...input, dateTime: autreJour }));
      httpMock.expectOne((r) => r.url.endsWith('/customers')).flush({ id: 'cust-9' });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.endsWith('/reservations'))
        .flush({ ...dto('r-9', 'confirmed'), id: 'r-9', startsAt: localIso(autreJour) });

      await result;
      expect(service.reservations().map((r) => r.id)).not.toContain('r-9');
    });
  });
});

// LOT B3 : diff par id apres refresh (detection des nouvelles reservations).
describe('newReservations', () => {
  function res(id: string): Reservation {
    return {
      id,
      customerName: `Client ${id}`,
      phone: '+33 6 00 00 00 00',
      dateTime: '2026-06-24T20:00:00+02:00',
      partySize: 2,
      status: 'pending',
      source: 'callbot',
    };
  }

  it('detecte les reservations apparues depuis le dernier fetch', () => {
    const before = new Set(['a', 'b']);
    const after = [res('a'), res('b'), res('c'), res('d')];
    expect(newReservations(before, after).map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('rien de nouveau -> liste vide (y compris si des resas ont disparu)', () => {
    const before = new Set(['a', 'b']);
    expect(newReservations(before, [res('a')])).toEqual([]);
  });

  it('premier fetch (avant vide) -> tout est nouveau', () => {
    expect(newReservations(new Set<string>(), [res('a')]).map((r) => r.id)).toEqual(['a']);
  });
});
