import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import type {
  ConnectAccount,
  ConnectOnboarding,
  GuaranteeSettings,
  Payout,
} from '@core/models/guarantee.model';

/** Côté restaurateur : ce qu'il demande à ses convives, et où va l'argent encaissé. */
@Injectable({ providedIn: 'root' })
export class GuaranteeService {
  private readonly http = inject(HttpClient);

  getSettings(restaurantId: string): Observable<GuaranteeSettings> {
    return this.http.get<GuaranteeSettings>(
      `${environment.apiUrl}/restaurants/${restaurantId}/guarantee-settings`,
    );
  }

  updateSettings(restaurantId: string, settings: GuaranteeSettings): Observable<GuaranteeSettings> {
    return this.http.put<GuaranteeSettings>(
      `${environment.apiUrl}/restaurants/${restaurantId}/guarantee-settings`,
      settings,
    );
  }

  getConnectAccount(): Observable<ConnectAccount> {
    return this.http.get<ConnectAccount>(`${environment.apiUrl}/billing/connect`);
  }

  // Redemande son état à Stripe : le restaurateur qui revient de l'inscription voit
  // son compte débloqué sans attendre le webhook.
  refreshConnectAccount(): Observable<ConnectAccount> {
    return this.http.post<ConnectAccount>(`${environment.apiUrl}/billing/connect/refresh`, {});
  }

  // Les liens Stripe expirent en quelques minutes : jamais mis en cache.
  startOnboarding(): Observable<ConnectOnboarding> {
    return this.http.post<ConnectOnboarding>(
      `${environment.apiUrl}/billing/connect/onboarding`,
      {},
    );
  }

  getPayouts(): Observable<Payout[]> {
    return this.http.get<Payout[]>(`${environment.apiUrl}/payouts`);
  }
}
