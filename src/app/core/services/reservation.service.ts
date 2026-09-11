import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, Observable, of } from 'rxjs';
import { delay, map, switchMap, tap } from 'rxjs/operators';

import { environment } from '@env/environment';
import { SessionService } from './session.service';
import {
  PublicReservation,
  PublicReservationInput,
  RescheduleSlotsResponse,
  Reservation,
  ReservationStatus,
  RestaurantTable,
  newReservations,
} from '@core/models/reservation.model';
import {
  BackCustomerFull,
  PublicReservationDto,
  ReservationDto,
  ReservationRequestDto,
  mapPublicReservation,
  mapReservation,
  toRequest,
} from '@core/models/reservation-dto.model';
import { localDateKey, localIso } from '@core/utils/format';

// Service des réservations. Deux modes selon environment.useMock :
//  - mock : données de test (of(...).pipe(delay), aucun réseau) - pour la démo et les tests ;
//  - réel : appels HTTP au backend (GET ?expand=table,customer, PUT pour le statut).
// On ne change que l'intérieur du service : les écrans consomment toujours `reservations`.
@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly baseUrl = `${environment.apiUrl}/reservations`;
  private readonly publicUrl = `${environment.apiUrl}/public`;

  private readonly _reservations = signal<Reservation[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);
  // DTO bruts du back (mode réel), nécessaires pour reconstruire le corps d'un PUT.
  private readonly _raw = signal<ReservationDto[]>([]);

  readonly reservations = this._reservations.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  // Charge les réservations du jour et alimente les signals.
  loadToday(date?: string): void {
    this._loading.set(true);
    this._error.set(false);
    this.getToday(date).subscribe({
      next: (list) => {
        this._reservations.set(list);
        this._loading.set(false);
      },
      error: () => {
        this._error.set(true);
        this._loading.set(false);
      },
    });
  }

  // Rafraichissement SILENCIEUX (polling live, LOT B3) : recharge les reservations
  // et met a jour le signal SANS toucher `loading` ni `error` - pas de spinner ni
  // de clignotement toutes les 20 s. L'appelant recoit la liste fraiche pour diff.
  // LIVE LEGER partage (liste ET plan) : polling silencieux toutes les 20 s,
  // actif page visible (et isActive() vraie - ex. hors mode edition). Le diff
  // par id declenche onNew pour chaque reservation ARRIVEE (toast, pulse...).
  // La logique vit ICI une seule fois ; chaque page ne fournit que son delta.
  startLivePolling(
    destroyRef: DestroyRef,
    options: { isActive?: () => boolean; onNew?: (created: Reservation) => void } = {},
  ): void {
    const POLL_INTERVAL_MS = 20_000;
    const tick = (): void => {
      if (document.visibilityState !== 'visible' || options.isActive?.() === false) {
        return;
      }
      this.refreshSilently(options.onNew);
    };
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    const onVisibility = (): void => tick();
    document.addEventListener('visibilitychange', onVisibility);
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  // Re-fetch SILENCIEUX (pas de spinner : refresh() ne touche pas `loading`),
  // puis diff par id -> callback pour chaque nouvelle reservation.
  private refreshSilently(onNew?: (created: Reservation) => void): void {
    if (this._loading()) {
      return; // chargement initial (ou reessai) en cours : inutile de doubler.
    }
    const beforeIds = new Set(this._reservations().map((r) => r.id));
    this.refresh().subscribe({
      next: (list) => {
        if (onNew) {
          for (const created of newReservations(beforeIds, list)) {
            onNew(created);
          }
        }
      },
      // Echec silencieux : le prochain tick retentera (pas de bandeau d'erreur).
      error: () => undefined,
    });
  }

  refresh(date?: string): Observable<Reservation[]> {
    // MOCK : l'etat courant fait foi (les creations locales - walk-in, resa
    // manuelle - ne doivent pas etre ecrasees par la liste de depart).
    if (environment.useMock) {
      return of(this._reservations()).pipe(delay(200));
    }
    return this.getToday(date).pipe(
      tap((list) => {
        // PAYLOAD IDENTIQUE -> on ne republie PAS le signal : toute la cascade
        // en aval (liste OnPush, canvas Konva, scene 3D) reste au repos. Cle de
        // comparaison = ce qui pilote reellement le rendu.
        const key = (r: Reservation): string =>
          `${r.id}|${r.status}|${r.table?.id ?? ''}|${r.dateTime}|${r.partySize}|${r.customerName}|${r.phone ?? ''}|${r.notes ?? ''}`;
        const current = this._reservations();
        const same =
          current.length === list.length && current.every((r, i) => key(r) === key(list[i]));
        if (!same) {
          this._reservations.set(list);
        }
      }),
    );
  }

  getToday(date?: string): Observable<Reservation[]> {
    if (environment.useMock) {
      void date;
      return of(MOCK_RESERVATIONS).pipe(delay(500));
    }
    // Le back filtre par restaurant ; le filtre "du jour" est fait côté front (POC),
    // en jour LOCAL pour rester cohérent avec l'en-tête et les heures affichées.
    const target = date ?? localDateKey();
    const url = `${this.baseUrl}?expand=table,customer&restaurantId=${this.session.restaurantId() ?? ''}`;
    return this.http.get<ReservationDto[]>(url).pipe(
      map((dtos) => dtos.filter((d) => localDateKey(new Date(d.startsAt)) === target)),
      tap((dtos) => this._raw.set(dtos)),
      map((dtos) => dtos.map(mapReservation)),
    );
  }

  confirm(id: string): Observable<Reservation> {
    return this.mutateStatus(id, 'confirmed');
  }

  // CLIENT ARRIVE : le client d'une reservation existante se presente -> la resa
  // passe `seated` (meme mecanisme que confirm/cancel/finish, style coherent).
  markArrived(id: string): Observable<Reservation> {
    return this.mutateStatus(id, 'seated');
  }

  cancel(id: string): Observable<Reservation> {
    return this.mutateStatus(id, 'cancelled');
  }

  // TERMINER LE SERVICE (poste de commandement) : les clients sont partis, la resa
  // passe `completed` -> la derivation rend la table Libre immediatement.
  finish(id: string): Observable<Reservation> {
    return this.mutateStatus(id, 'completed');
  }

  // WALK-IN : installe des clients SANS reservation sur une table libre.
  // Cree une reservation immediate `seated` / `manual` sans client (le back accepte
  // customerId null - fait verifie), fenetre de 2 h, en heure LOCALE avec fuseau.
  createWalkIn(table: RestaurantTable, partySize: number): Observable<Reservation> {
    const now = new Date();
    if (environment.useMock) {
      const created: Reservation = {
        id: `walkin-${Date.now()}`,
        customerName: 'Sans réservation',
        phone: '',
        dateTime: localIso(now),
        partySize,
        table,
        status: 'seated',
        source: 'manual',
      };
      return of(created).pipe(
        delay(200),
        tap((res) => this._reservations.update((list) => [...list, res])),
      );
    }
    const body: ReservationRequestDto = {
      restaurantId: this.session.restaurantId() ?? '',
      customerId: null,
      tableId: table.id,
      callId: null,
      startsAt: localIso(now),
      endsAt: localIso(new Date(now.getTime() + 2 * 60 * 60 * 1000)),
      partySize,
      status: 'seated',
      source: 'manual',
      notes: null,
    };
    return this.http.post<ReservationDto>(this.baseUrl, body).pipe(
      map((dto) => {
        // La reponse (sans ?expand) peut ne pas embarquer la table : on la greffe
        // pour que la derivation colore la table tout de suite (comme mutateTable).
        const patched: ReservationDto = {
          ...dto,
          table: dto.table ?? { id: table.id, name: table.name, capacity: table.capacity },
        };
        this._raw.update((list) => [...list, patched]);
        // Mapping standard (customer absent -> « Client ») : coherent partout.
        const created = mapReservation(patched);
        this._reservations.update((list) => [...list, created]);
        return created;
      }),
    );
  }

  // NOUVELLE RESERVATION MANUELLE (dialog « Nouvelle réservation ») : cree le
  // CLIENT d'abord (POST /customers - le back n'accepte pas de nom en ligne sur
  // la resa), puis la reservation non placee. Elle arrive dans « Réservations
  // non placées » : le plan (placement auto / fusion guidee) prend le relais.
  createManual(input: {
    firstName: string;
    phone: string;
    dateTime: Date;
    partySize: number;
    notes: string | null;
  }): Observable<Reservation> {
    if (environment.useMock) {
      const created: Reservation = {
        id: `manual-${Date.now()}`,
        customerName: input.firstName || 'Client',
        phone: input.phone,
        dateTime: localIso(input.dateTime),
        partySize: input.partySize,
        status: 'confirmed',
        source: 'manual',
        notes: input.notes ?? '',
      };
      return of(created).pipe(
        delay(200),
        tap((res) => this._reservations.update((list) => [...list, res])),
      );
    }
    return this.http
      .post<{ id: string }>(`${environment.apiUrl}/customers`, {
        restaurantId: this.session.restaurantId() ?? '',
        phone: input.phone,
        firstName: input.firstName || null,
        lastName: null,
        email: null,
        notes: null,
      })
      .pipe(
        switchMap((customer) => {
          const body: ReservationRequestDto = {
            restaurantId: this.session.restaurantId() ?? '',
            customerId: customer.id,
            tableId: null,
            callId: null,
            startsAt: localIso(input.dateTime),
            endsAt: localIso(new Date(input.dateTime.getTime() + 2 * 60 * 60 * 1000)),
            partySize: input.partySize,
            status: 'confirmed',
            source: 'manual',
            notes: input.notes,
          };
          return this.http.post<ReservationDto>(this.baseUrl, body);
        }),
        map((dto) => {
          // La reponse (sans ?expand) n'embarque pas le customer : on greffe le
          // nom/telephone saisis pour un affichage immediat correct.
          const patched: ReservationDto = {
            ...dto,
            customer: dto.customer ?? {
              id: dto.customerId ?? '',
              firstName: input.firstName || null,
              lastName: null,
              phone: input.phone,
            },
          };
          this._raw.update((list) => [...list, patched]);
          const created = mapReservation(patched);
          this._reservations.update((list) => [...list, created]);
          return created;
        }),
      );
  }

  // --- Reservation en ligne, sans session : le client vient du lien ou du QR du restaurateur.

  // Creneaux libres du restaurant sur 7 jours, pour `partySize` couverts.
  getPublicSlots(
    restaurantId: string,
    partySize: number,
    fromDate?: string,
  ): Observable<RescheduleSlotsResponse> {
    const params = [`partySize=${partySize}`];
    if (fromDate) params.push(`fromDate=${fromDate}`);
    return this.http.get<RescheduleSlotsResponse>(
      `${this.publicUrl}/restaurants/${restaurantId}/slots?${params.join('&')}`,
    );
  }

  // Le navigateur n'envoie ni table ni heure de fin : le back les deduit du creneau propose.
  createPublic(restaurantId: string, input: PublicReservationInput): Observable<PublicReservation> {
    return this.http
      .post<PublicReservationDto>(
        `${this.publicUrl}/restaurants/${restaurantId}/reservations`,
        input,
      )
      .pipe(map(mapPublicReservation));
  }

  getPublicReservation(id: string): Observable<PublicReservation> {
    return this.http
      .get<PublicReservationDto>(`${this.publicUrl}/reservations/${id}`)
      .pipe(map(mapPublicReservation));
  }

  getReservationById(id: string): Observable<Reservation> {
    const url = `${this.baseUrl}/${id}?expand=table,customer,restaurant`;
    return this.http.get<ReservationDto>(url).pipe(map(mapReservation));
  }

  // Créneaux libres sur 7 jours pour reprogrammer la réservation.
  // fromDate optionnel (YYYY-MM-DD) : défaut = aujourd'hui côté back.
  // partySize optionnel : surcharge la taille de la table sans écrire la resa
  //   (pour que le picker s'ajuste quand l'utilisateur bouge le compteur).
  getRescheduleSlots(
    id: string,
    fromDate?: string,
    partySize?: number,
  ): Observable<RescheduleSlotsResponse> {
    const params: string[] = [];
    if (fromDate) params.push(`fromDate=${fromDate}`);
    if (partySize != null) params.push(`partySize=${partySize}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<RescheduleSlotsResponse>(`${this.baseUrl}/${id}/reschedule-slots${query}`);
  }

  // Confirmation du client : nouveau créneau (+ éventuel ajustement partySize / notes).
  // On refetch le DTO pour reconstruire un corps PUT complet — la page cliente n'a pas
  // alimenté `_raw` (qui n'est peuplé que par la liste employée).
  reschedule(
    id: string,
    changes: {
      startsAt: string;
      endsAt: string;
      tableId: string;
      partySize?: number;
      notes?: string | null;
    },
  ): Observable<Reservation> {
    const url = `${this.baseUrl}/${id}?expand=table,customer,restaurant`;
    // notify=true : le back envoie les notifs Discord (client + resto) après le PUT.
    // Seul ce flow (reschedule client) déclenche des notifications ; le staff qui
    // bouge une table via /reservations/:id sans ce flag ne spammera pas le client.
    return this.http.get<ReservationDto>(url).pipe(
      switchMap((dto) =>
        this.http
          .put<ReservationDto>(
            `${this.baseUrl}/${id}?notify=true`,
            toRequest(dto, {
              startsAt: changes.startsAt,
              endsAt: changes.endsAt,
              tableId: changes.tableId,
              partySize: changes.partySize,
              notes: changes.notes,
            }),
          )
          .pipe(map(mapReservation)),
      ),
    );
  }

  // Mise à jour du client (nom corrigé par le client sur la sheet de confirmation).
  // Refetch d'abord pour ne pas écraser les champs qu'on ne modifie pas.
  updateCustomerName(
    customerId: string,
    firstName: string,
    lastName: string | null = null,
  ): Observable<void> {
    const url = `${environment.apiUrl}/customers/${customerId}`;
    return this.http.get<BackCustomerFull>(url).pipe(
      switchMap((current) =>
        this.http.put<unknown>(url, {
          restaurantId: current.restaurantId,
          phone: current.phone,
          firstName: firstName || null,
          lastName,
          email: current.email ?? null,
          notes: current.notes ?? null,
        }),
      ),
      map(() => undefined),
    );
  }

  private mutateStatus(id: string, status: ReservationStatus): Observable<Reservation> {
    if (environment.useMock) {
      const current = this._reservations().find((r) => r.id === id);
      const updated: Reservation = { ...(current as Reservation), status };
      return of(updated).pipe(
        delay(200),
        tap((res) => this.applyUpdate(res)),
      );
    }
    // Réel : le back n'a pas de PATCH statut, on envoie un PUT complet (ReservationRequest).
    const dto = this._raw().find((d) => d.id === id);
    if (!dto) {
      return EMPTY;
    }
    return this.http.put<ReservationDto>(`${this.baseUrl}/${id}`, toRequest(dto, { status })).pipe(
      map(() => {
        const patched: ReservationDto = { ...dto, status };
        this._raw.update((list) => list.map((d) => (d.id === id ? patched : d)));
        const updated = mapReservation(patched);
        this.applyUpdate(updated);
        return updated;
      }),
    );
  }

  // Affecte une table a une reservation (plan de salle). PUT avec tableId rempli
  // (corps complet reconstruit par toRequest). La table passe alors Reservee/Installee.
  // On passe l'objet table pour mettre a jour la reference embarquee sans dependre
  // d'un autre service (la reservation porte alors la bonne table pour la derivation).
  assign(reservationId: string, table: RestaurantTable): Observable<Reservation> {
    return this.mutateTable(reservationId, table);
  }

  // Desaffecte la table d'une reservation (tableId: null) : la table redevient Libre.
  unassign(reservationId: string): Observable<Reservation> {
    return this.mutateTable(reservationId, null);
  }

  private mutateTable(id: string, table: RestaurantTable | null): Observable<Reservation> {
    const tableId = table?.id ?? null;
    if (environment.useMock) {
      const current = this._reservations().find((r) => r.id === id);
      if (!current) {
        return EMPTY;
      }
      const updated: Reservation = { ...current, table: table ?? undefined };
      return of(updated).pipe(
        delay(200),
        tap((res) => this.applyUpdate(res)),
      );
    }
    const dto = this._raw().find((d) => d.id === id);
    if (!dto) {
      return EMPTY;
    }
    return this.http.put<ReservationDto>(`${this.baseUrl}/${id}`, toRequest(dto, { tableId })).pipe(
      map(() => {
        const backTable = table
          ? { id: table.id, name: table.name, capacity: table.capacity }
          : null;
        const patched: ReservationDto = { ...dto, tableId, table: backTable };
        this._raw.update((list) => list.map((d) => (d.id === id ? patched : d)));
        const updated = mapReservation(patched);
        this.applyUpdate(updated);
        return updated;
      }),
    );
  }

  private applyUpdate(updated: Reservation): void {
    this._reservations.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
  }
}

const MOCK_RESERVATIONS: Reservation[] = [
  {
    id: 'r-01',
    customerName: 'Camille Durand',
    phone: '+33 6 12 34 56 78',
    dateTime: '2026-06-22T18:30:00+02:00',
    partySize: 2,
    table: { id: 't1', name: 'T1', capacity: 2 },
    status: 'confirmed',
    source: 'callbot',
  },
  {
    id: 'r-02',
    customerName: 'Yanis Bensaïd',
    phone: '+33 7 98 76 54 32',
    dateTime: '2026-06-22T19:00:00+02:00',
    partySize: 4,
    table: { id: 't5', name: 'T5', capacity: 4 },
    status: 'pending',
    source: 'callbot',
  },
  {
    id: 'r-03',
    customerName: 'Sofia Lopez',
    phone: '+33 6 22 33 44 55',
    dateTime: '2026-06-22T19:00:00+02:00',
    partySize: 3,
    status: 'confirmed',
    source: 'manual',
  },
  {
    id: 'r-04',
    customerName: 'Thomas Mercier',
    phone: '+33 6 70 11 22 33',
    dateTime: '2026-06-22T19:30:00+02:00',
    partySize: 6,
    table: { id: 't8', name: 'T8', capacity: 6 },
    status: 'seated',
    source: 'manual',
  },
  {
    id: 'r-05',
    customerName: 'Inès Robert',
    phone: '+33 7 60 50 40 30',
    dateTime: '2026-06-22T19:30:00+02:00',
    partySize: 2,
    status: 'confirmed',
    source: 'callbot',
  },
  {
    id: 'r-06',
    customerName: 'Lucas Petit',
    phone: '+33 6 45 67 89 01',
    dateTime: '2026-06-22T20:00:00+02:00',
    partySize: 4,
    table: { id: 't3', name: 'T3', capacity: 4 },
    status: 'confirmed',
    source: 'callbot',
  },
  {
    id: 'r-07',
    customerName: 'Aya Traoré',
    phone: '+33 7 12 13 14 15',
    dateTime: '2026-06-22T20:00:00+02:00',
    partySize: 2,
    status: 'pending',
    source: 'manual',
  },
  {
    id: 'r-08',
    customerName: 'Hugo Garnier',
    phone: '+33 6 88 77 66 55',
    dateTime: '2026-06-22T20:30:00+02:00',
    partySize: 5,
    table: { id: 't9', name: 'T9', capacity: 6 },
    status: 'confirmed',
    source: 'callbot',
  },
  {
    id: 'r-09',
    customerName: 'Léa Fontaine',
    phone: '+33 6 33 22 11 00',
    dateTime: '2026-06-22T20:30:00+02:00',
    partySize: 2,
    status: 'cancelled',
    source: 'manual',
  },
  {
    id: 'r-10',
    customerName: 'Noah Lefebvre',
    phone: '+33 7 44 55 66 77',
    dateTime: '2026-06-22T21:00:00+02:00',
    partySize: 3,
    table: { id: 't2', name: 'T2', capacity: 4 },
    status: 'confirmed',
    source: 'callbot',
  },
  {
    id: 'r-11',
    customerName: 'Manon Girard',
    phone: '+33 6 99 88 77 66',
    dateTime: '2026-06-22T21:00:00+02:00',
    partySize: 4,
    status: 'pending',
    source: 'callbot',
  },
  {
    id: 'r-12',
    customerName: 'Adam Moreau',
    phone: '+33 7 01 02 03 04',
    dateTime: '2026-06-22T21:30:00+02:00',
    partySize: 2,
    table: { id: 't6', name: 'T6', capacity: 2 },
    status: 'no_show',
    source: 'manual',
  },
  {
    id: 'r-13',
    customerName: 'Chloé Roussel',
    phone: '+33 6 55 44 33 22',
    dateTime: '2026-06-22T21:30:00+02:00',
    partySize: 6,
    status: 'confirmed',
    source: 'callbot',
  },
  {
    id: 'r-14',
    customerName: 'Gabriel Faure',
    phone: '+33 7 23 45 67 89',
    dateTime: '2026-06-22T22:00:00+02:00',
    partySize: 2,
    table: { id: 't4', name: 'T4', capacity: 2 },
    status: 'confirmed',
    source: 'manual',
  },
  {
    id: 'r-15',
    customerName: 'Jade Dumont',
    phone: '+33 6 11 33 55 77',
    dateTime: '2026-06-22T22:00:00+02:00',
    partySize: 3,
    status: 'pending',
    source: 'callbot',
  },
];
