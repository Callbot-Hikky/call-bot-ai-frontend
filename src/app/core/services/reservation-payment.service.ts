import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import type {
  Cancellation,
  GuestModification,
  PaymentRedirect,
  PublicModification,
  PublicReservation,
  PublicTopUp,
  RescheduleSlots,
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

  // Modification par le convive : couverts et horaire. Seul jeton REUTILISABLE du
  // parcours — une tablee peut etre revue plusieurs fois, et le consommer au premier
  // passage obligerait a en renvoyer un a chaque modification.
  getByModificationToken(token: string): Observable<PublicModification> {
    return this.http.get<PublicModification>(`${this.baseUrl}/modifier/${token}`);
  }

  /**
   * Les créneaux libres, pour la tablée que le convive envisage.
   *
   * `partySize` est un aperçu et non un changement : une table pour huit n'est pas une
   * table pour deux, donc la grille doit se redessiner pendant qu'il hésite.
   */
  getModificationSlots(
    token: string,
    partySize: number,
    fromDate?: string,
  ): Observable<RescheduleSlots> {
    let params = new HttpParams().set('partySize', partySize);
    if (fromDate) {
      params = params.set('fromDate', fromDate);
    }

    return this.http.get<RescheduleSlots>(`${this.baseUrl}/modifier/${token}/creneaux`, { params });
  }

  modify(
    token: string,
    change: { partySize?: number; startsAt?: string },
  ): Observable<GuestModification> {
    return this.http.put<GuestModification>(`${this.baseUrl}/modifier/${token}`, change);
  }
}
