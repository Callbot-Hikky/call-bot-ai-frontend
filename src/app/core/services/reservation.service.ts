import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, Observable, of } from 'rxjs';
import { delay, map, tap } from 'rxjs/operators';

import { environment } from '@env/environment';
import { Reservation, ReservationStatus } from '@core/models/reservation.model';
import {
  ReservationDto,
  mapReservation,
  toRequest,
} from '@core/models/reservation-dto.model';
import { localDateKey } from '@core/utils/format';

// Service des réservations. Deux modes selon environment.useMock :
//  - mock : données de test (of(...).pipe(delay), aucun réseau) — pour la démo et les tests ;
//  - réel : appels HTTP au backend (GET ?expand=table,customer, PUT pour le statut).
// On ne change que l'intérieur du service : les écrans consomment toujours `reservations`.
@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/reservations`;

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

  getToday(date?: string): Observable<Reservation[]> {
    if (environment.useMock) {
      void date;
      return of(MOCK_RESERVATIONS).pipe(delay(500));
    }
    // Le back filtre par restaurant ; le filtre "du jour" est fait côté front (POC),
    // en jour LOCAL pour rester cohérent avec l'en-tête et les heures affichées.
    const target = date ?? localDateKey();
    const url = `${this.baseUrl}?expand=table,customer&restaurantId=${environment.restaurantId}`;
    return this.http.get<ReservationDto[]>(url).pipe(
      map((dtos) => dtos.filter((d) => localDateKey(new Date(d.startsAt)) === target)),
      tap((dtos) => this._raw.set(dtos)),
      map((dtos) => dtos.map(mapReservation)),
    );
  }

  confirm(id: string): Observable<Reservation> {
    return this.mutateStatus(id, 'confirmed');
  }

  cancel(id: string): Observable<Reservation> {
    return this.mutateStatus(id, 'cancelled');
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
    return this.http.put<ReservationDto>(`${this.baseUrl}/${id}`, toRequest(dto, status)).pipe(
      map(() => {
        const patched: ReservationDto = { ...dto, status };
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
