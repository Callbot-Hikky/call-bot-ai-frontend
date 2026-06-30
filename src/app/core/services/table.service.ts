import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, tap } from 'rxjs/operators';

import { environment } from '@env/environment';
import { RestaurantTable } from '@core/models/reservation.model';

// DTO renvoyé par GET /api/tables et /api/tables/available
export interface TableDto {
  id: string;
  restaurantId: string;
  name: string;
  capacity: number;
  zone: string | null;
  isActive: boolean;
}

// Service des tables. Sert d'abord la liste des tables disponibles pour un créneau,
// utilisée par le formulaire de création de réservation.
@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tables`;

  private readonly _available = signal<RestaurantTable[]>([]);
  private readonly _loading = signal(false);

  readonly available = this._available.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Charge les tables disponibles sur le créneau donné et alimente `available`.
  loadAvailable(startsAt: string, endsAt: string, partySize?: number): void {
    this._loading.set(true);
    this.getAvailable(startsAt, endsAt, partySize).subscribe({
      next: (list) => {
        this._available.set(list);
        this._loading.set(false);
      },
      error: () => {
        this._available.set([]);
        this._loading.set(false);
      },
    });
  }

  getAvailable(
    startsAt: string,
    endsAt: string,
    partySize?: number,
  ): Observable<RestaurantTable[]> {
    if (environment.useMock) {
      return of(MOCK_TABLES).pipe(
        delay(200),
        tap((list) => this._available.set(list)),
      );
    }
    let params = new HttpParams()
      .set('restaurantId', environment.restaurantId)
      .set('startsAt', startsAt)
      .set('endsAt', endsAt);
    if (partySize != null) {
      params = params.set('partySize', partySize);
    }
    return this.http
      .get<TableDto[]>(`${this.baseUrl}/available`, { params })
      .pipe(tap((dtos) => this._available.set(dtos.map(mapTable))));
  }

  // Vide la liste (à appeler quand le créneau devient invalide côté form).
  clear(): void {
    this._available.set([]);
  }
}

function mapTable(dto: TableDto): RestaurantTable {
  return { id: dto.id, name: dto.name, capacity: dto.capacity };
}

const MOCK_TABLES: RestaurantTable[] = [
  { id: 't1', name: 'T1', capacity: 2 },
  { id: 't2', name: 'T2', capacity: 4 },
  { id: 't3', name: 'T3', capacity: 4 },
  { id: 't5', name: 'T5', capacity: 6 },
];
