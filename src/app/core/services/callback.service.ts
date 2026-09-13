import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, Observable, of } from 'rxjs';
import { delay, tap } from 'rxjs/operators';

import { environment } from '@env/environment';
import { CallbackRequest } from '@core/models/callback-request.model';

// Tri chronologique des demandes (cohérent au chargement comme à la restauration).
const byRequestedAt = (a: CallbackRequest, b: CallbackRequest): number =>
  a.requestedAt.localeCompare(b.requestedAt);

// Service des demandes de rappel (US 1.7). Mêmes conventions que ReservationService :
// données de test avec la VRAIE signature HTTP (on remplace le of(...) par l'appel
// this.http correspondant pour brancher le back). État exposé en signals.
@Injectable({ providedIn: 'root' })
export class CallbackService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/callback-requests`;

  private readonly _callbacks = signal<CallbackRequest[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  readonly callbacks = this._callbacks.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  // Charge les demandes de rappel en attente et alimente les signals.
  loadPending(): void {
    this._loading.set(true);
    this._error.set(false);
    this.getPending().subscribe({
      next: (list) => {
        this._callbacks.set([...list].sort(byRequestedAt));
        this._loading.set(false);
      },
      error: () => {
        this._error.set(true);
        this._loading.set(false);
      },
    });
  }

  getPending(): Observable<CallbackRequest[]> {
    // Le back n'expose pas encore les demandes de rappel : hors mode mock, la liste est vide
    // et le bloc n'apparait pas. Implementation finale :
    // return this.http.get<CallbackRequest[]>(this.baseUrl, { params: { status: 'pending' } });
    if (!environment.useMock) {
      return of([]);
    }
    return of(MOCK_CALLBACKS.filter((c) => c.status === 'pending')).pipe(delay(500));
  }

  // Marque une demande comme traitée et la retire de la liste affichée.
  markHandled(id: string): Observable<CallbackRequest> {
    // Implémentation finale :
    // return this.http.patch<CallbackRequest>(`${this.baseUrl}/${id}`, { status: 'handled' })
    //   .pipe(tap((updated) => this.remove(updated.id)));
    const current = this._callbacks().find((c) => c.id === id);
    if (!current) {
      // Id inconnu (ne peut pas arriver depuis l'UI) : aucune émission, aucun effet.
      return EMPTY;
    }
    const updated: CallbackRequest = { ...current, status: 'handled' };
    return of(updated).pipe(
      delay(200),
      tap((res) => this.remove(res.id)),
    );
  }

  private remove(id: string): void {
    this._callbacks.update((list) => list.filter((c) => c.id !== id));
  }

  // Réinsère une demande retirée (annulation d'un « traité »), à sa place chronologique.
  restore(request: CallbackRequest): void {
    if (this._callbacks().some((c) => c.id === request.id)) {
      return;
    }
    const restored: CallbackRequest = { ...request, status: 'pending' };
    this._callbacks.update((list) => [...list, restored].sort(byRequestedAt));
  }
}

const MOCK_CALLBACKS: CallbackRequest[] = [
  {
    id: 'cb-01',
    customerName: 'Karim Haddad',
    phone: '+33 6 98 76 54 32',
    requestedAt: '2026-06-22T17:42:00+02:00',
    reason: "L'agent n'a pas pu confirmer une table pour 12 personnes",
    status: 'pending',
  },
  {
    id: 'cb-02',
    customerName: 'Sophie Bernard',
    phone: '+33 7 55 66 77 88',
    requestedAt: '2026-06-22T18:05:00+02:00',
    reason: 'Souhaite modifier une réservation existante',
    status: 'pending',
  },
  {
    id: 'cb-03',
    customerName: 'Marc Lefebvre',
    phone: '+33 6 11 22 33 44',
    requestedAt: '2026-06-22T18:20:00+02:00',
    reason: 'Demande de rappel pour un événement privé',
    status: 'pending',
  },
];
