import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

import { environment } from '@env/environment';
import { Reservation } from '@core/models/reservation.model';

// Tant que l'API n'est pas prête, on renvoie des données de test.
// Le type de retour est déjà celui de l'API finale : pour brancher le back,
// il suffira de remplacer le of(...) par l'appel http.get correspondant.
@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/reservations`;

  getReservations(): Observable<Reservation[]> {
    // return this.http.get<Reservation[]>(this.baseUrl);
    return of(MOCK_RESERVATIONS);
  }
}

const MOCK_RESERVATIONS: Reservation[] = [
  {
    id: 'r-001',
    customerName: 'Camille Durand',
    phone: '+33 6 12 34 56 78',
    partySize: 4,
    dateTime: '2026-06-21T20:00:00+02:00',
    status: 'confirmed',
    source: 'callbot',
  },
  {
    id: 'r-002',
    customerName: 'Yanis Bensaïd',
    phone: '+33 7 98 76 54 32',
    partySize: 2,
    dateTime: '2026-06-21T21:30:00+02:00',
    status: 'pending',
    source: 'manual',
  },
];
