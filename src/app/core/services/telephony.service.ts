import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

import { environment } from '@env/environment';
import { DEFAULT_RING_SECONDS } from '@core/models/telephony.model';
import type { ForwardMode, ForwardingSetup } from '@core/models/telephony.model';

/**
 * Configuration du renvoi d'appel d'un restaurant.
 *
 * <p>L'endpoint backend n'existe pas encore : la table `phone_numbers` (DID →
 * restaurant) et `GET /api/telephony/forwarding` restent à écrire. En attendant,
 * un 404 n'est pas une erreur — on retombe sur le DID de développement défini dans
 * `environment.ts`, ce qui permet de construire et valider l'écran dès maintenant.
 *
 * <p>Quand l'endpoint arrivera, il n'y aura qu'à supprimer `fallback()`.
 */
@Injectable({ providedIn: 'root' })
export class TelephonyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/telephony`;

  getForwarding(restaurantId: string): Observable<ForwardingSetup | null> {
    return this.http
      .get<ForwardingSetup>(`${this.baseUrl}/forwarding`, { params: { restaurantId } })
      .pipe(catchError(() => of(this.fallback())));
  }

  updateForwarding(
    restaurantId: string,
    patch: { mode: ForwardMode; ringSeconds: number },
  ): Observable<ForwardingSetup | null> {
    return this.http
      .put<ForwardingSetup>(`${this.baseUrl}/forwarding`, patch, { params: { restaurantId } })
      .pipe(catchError(() => of({ ...this.fallback(), ...patch } as ForwardingSetup | null)));
  }

  /**
   * Repli de développement. Renvoie `null` quand aucun DID n'est configuré : l'écran
   * affiche alors « numéro en cours d'attribution », ce qui est la vérité — plutôt
   * qu'un numéro inventé que le restaurateur composerait pour rien.
   */
  private fallback(): ForwardingSetup | null {
    const did = environment.forwardingDid;
    if (!did) {
      return null;
    }

    return { did, mode: 'safety_net', ringSeconds: DEFAULT_RING_SECONDS, verifiedAt: null };
  }
}
