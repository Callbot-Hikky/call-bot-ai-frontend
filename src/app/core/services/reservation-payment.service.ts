import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import type {
  Cancellation,
  PaymentRedirect,
  PublicReservation,
  PublicTopUp,
} from '@core/models/guarantee.model';

/**
 * Les appels du convive, qui n'a pas de compte et n'en aura pas : il a réservé par
 * téléphone. Le jeton reçu par message est sa seule identification, d'où des routes
 * publiques et aucun en-tête d'authentification.
 */
@Injectable({ providedIn: 'root' })
export class ReservationPaymentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/public/reservations`;

  getByPaymentToken(token: string): Observable<PublicReservation> {
    return this.http.get<PublicReservation>(`${this.baseUrl}/paiement/${token}`);
  }

  // Ouvre la page Stripe hébergée et renvoie l'URL vers laquelle rediriger.
  startCheckout(token: string): Observable<PaymentRedirect> {
    return this.http.post<PaymentRedirect>(`${this.baseUrl}/paiement/${token}/checkout`, {});
  }

  // Complement de couverts : jeton distinct de celui du paiement initial, porte par
  // l'encaissement et non par la reservation.
  getByTopUpToken(token: string): Observable<PublicTopUp> {
    return this.http.get<PublicTopUp>(`${this.baseUrl}/complement/${token}`);
  }

  startTopUpCheckout(token: string): Observable<PaymentRedirect> {
    return this.http.post<PaymentRedirect>(`${this.baseUrl}/complement/${token}/checkout`, {});
  }

  getByCancellationToken(token: string): Observable<PublicReservation> {
    return this.http.get<PublicReservation>(`${this.baseUrl}/annulation/${token}`);
  }

  cancel(token: string): Observable<Cancellation> {
    return this.http.post<Cancellation>(`${this.baseUrl}/annulation/${token}`, {});
  }
}
