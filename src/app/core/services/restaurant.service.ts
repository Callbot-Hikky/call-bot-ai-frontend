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
  }): Observable<RestaurantDto> {
    return this.http.post<RestaurantDto>(this.baseUrl, payload);
  }

  loadRestaurant(id: string): void {
    this._loading.set(true);
    this._error.set(false);
    this.http.get<RestaurantDto>(`${this.baseUrl}/${id}`).subscribe({
      next: (restaurant) => {
        this._restaurant.set(restaurant);
        this._loading.set(false);
      },
      error: () => {
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
