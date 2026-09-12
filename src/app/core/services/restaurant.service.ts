import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { RestaurantDto } from '@core/models/restaurant.model';
import { RestaurantContextDto } from '@core/models/restaurant-context-dto.model';

@Injectable({ providedIn: 'root' })
export class RestaurantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/restaurants`;

  private readonly _restaurant = signal<RestaurantDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  readonly restaurant = this._restaurant.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  create(payload: {
    organizationId: string;
    name: string;
    phoneNumber: string;
    address?: string;
    city?: string;
    postalCode?: string;
  }): Observable<RestaurantDto> {
    const body: Record<string, unknown> = {
      organizationId: payload.organizationId,
      name: payload.name,
      phoneNumber: payload.phoneNumber,
      timezone: 'Europe/Paris',
    };
    if (payload.address) body['address'] = payload.address;
    if (payload.city) body['city'] = payload.city;
    if (payload.postalCode) body['postalCode'] = payload.postalCode;
    return this.http.post<RestaurantDto>(this.baseUrl, body);
  }

  // Barre laterale et pages appellent ceci en meme temps : un seul GET par restaurant.
  private inFlightId: string | null = null;

  loadRestaurant(id: string): void {
    if (this._restaurant()?.id === id || this.inFlightId === id) {
      return;
    }
    this.inFlightId = id;
    this._loading.set(true);
    this._error.set(false);
    this.http.get<RestaurantDto>(`${this.baseUrl}/${id}`).subscribe({
      next: (restaurant) => {
        this.inFlightId = null;
        this._restaurant.set(restaurant);
        this._loading.set(false);
      },
      error: () => {
        this.inFlightId = null;
        this._error.set(true);
        this._loading.set(false);
      },
    });
  }

  patchAttributesRestaurant(
    id: string,
    attributes: RestaurantContextDto,
  ): Observable<RestaurantDto> {
    return this.http.patch<RestaurantDto>(`${this.baseUrl}/${id}/attributes`, attributes).pipe(
      tap((restaurant) => {
        this._restaurant.set(restaurant);
      }),
      catchError((err) => {
        return throwError(() => err);
      }),
    );
  }
}
