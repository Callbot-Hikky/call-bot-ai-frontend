import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '@env/environment';
import { assertHttpsUrl } from '@core/utils/redirect';
import { CheckoutSession, CheckoutSummary, Offer } from '@core/models/offer.model';

@Injectable({ providedIn: 'root' })
export class OfferService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/offers`;

  getOffers(): Observable<Offer[]> {
    return this.http.get<Offer[]>(this.baseUrl);
  }

  // Ouvre une session Stripe Checkout côté back et renvoie l'URL de paiement.
  checkout(offerCode: string): Observable<CheckoutSession> {
    return this.http
      .post<CheckoutSession>(`${this.baseUrl}/${offerCode}/checkout`, {})
      .pipe(map((session) => ({ ...session, checkoutUrl: assertHttpsUrl(session.checkoutUrl) })));
  }

  // Récap d'une session (page de succès), via l'id renvoyé par Stripe dans l'URL.
  getCheckoutSummary(sessionId: string): Observable<CheckoutSummary> {
    return this.http.get<CheckoutSummary>(`${this.baseUrl}/checkout/${sessionId}`);
  }
}
