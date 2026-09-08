import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';

export interface SessionUser {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}

export interface RestaurantSummary {
  id: string;
  name: string;
}

type Status = 'loading' | 'authenticated' | 'anonymous';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  private readonly _user = signal<SessionUser | null>(null);
  private readonly _restaurants = signal<RestaurantSummary[]>([]);
  private readonly _restaurantId = signal<string | null>(null);
  private readonly _status = signal<Status>('loading');

  readonly user = this._user.asReadonly();
  readonly restaurants = this._restaurants.asReadonly();
  readonly restaurantId = this._restaurantId.asReadonly();
  readonly status = this._status.asReadonly();

  readonly isAuthenticated = computed(() => this._status() === 'authenticated');
  readonly needsOnboarding = computed(
    () => this.isAuthenticated() && this._restaurantId() === null,
  );

  async refresh(): Promise<void> {
    try {
      const me = await firstValueFrom(this.http.get<SessionUser>(`${this.api}/me`));
      this._user.set(me);
      const restaurants =
        (await firstValueFrom(
          this.http.get<RestaurantSummary[]>(`${this.api}/restaurants`, {
            params: { organizationId: me.organizationId },
          }),
        )) ?? [];
      this._restaurants.set(restaurants);
      this._restaurantId.set(restaurants[0]?.id ?? null);
      this._status.set('authenticated');
    } catch {
      this.clear();
    }
  }

  selectRestaurant(id: string): void {
    if (this._restaurants().some((r) => r.id === id)) {
      this._restaurantId.set(id);
    }
  }

  clear(): void {
    this._user.set(null);
    this._restaurants.set([]);
    this._restaurantId.set(null);
    this._status.set('anonymous');
  }
}
