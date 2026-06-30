import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';

import { environment } from '@env/environment';
import { FloorTable, TableDto, mapTable } from '@core/models/table.model';

// Service des tables physiques du restaurant. Deux modes selon environment.useMock,
// comme ReservationService :
//  - mock : liste de test coherente avec MOCK_RESERVATIONS (aucun reseau) ;
//  - reel : GET /api/tables?restaurantId=... (JWT via l'interceptor existant).
// Les tables n'ont pas de position cote back : le plan de salle la derive (auto-grille).
@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tables`;

  private readonly _tables = signal<FloorTable[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  readonly tables = this._tables.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  // Charge les tables du restaurant et alimente les signals.
  loadTables(): void {
    this._loading.set(true);
    this._error.set(false);
    this.getTables().subscribe({
      next: (list) => {
        this._tables.set(list);
        this._loading.set(false);
      },
      error: () => {
        this._error.set(true);
        this._loading.set(false);
      },
    });
  }

  getTables(): Observable<FloorTable[]> {
    if (environment.useMock) {
      return of(MOCK_TABLES).pipe(delay(400));
    }
    // L'alimentation du signal est la responsabilite de loadTables (comme
    // ReservationService.getToday) : getTables reste un simple flux de donnees.
    const url = `${this.baseUrl}?restaurantId=${environment.restaurantId}`;
    return this.http.get<TableDto[]>(url).pipe(map((dtos) => dtos.map(mapTable)));
  }
}

// Tables de test, alignees sur les ids references par MOCK_RESERVATIONS
// (t1, t2, t3, t4, t5, t6, t8, t9) + 2 tables libres (t7, t10) pour l'affectation.
const MOCK_TABLES: FloorTable[] = [
  { id: 't1', name: 'T1', capacity: 2, zone: 'Salle', isActive: true },
  { id: 't2', name: 'T2', capacity: 4, zone: 'Salle', isActive: true },
  { id: 't3', name: 'T3', capacity: 4, zone: 'Salle', isActive: true },
  { id: 't4', name: 'T4', capacity: 2, zone: 'Salle', isActive: true },
  { id: 't5', name: 'T5', capacity: 4, zone: 'Salle', isActive: true },
  { id: 't6', name: 'T6', capacity: 2, zone: 'Terrasse', isActive: true },
  { id: 't7', name: 'T7', capacity: 6, zone: 'Terrasse', isActive: true },
  { id: 't8', name: 'T8', capacity: 6, zone: 'Salle', isActive: true },
  { id: 't9', name: 'T9', capacity: 6, zone: 'Salle', isActive: true },
  { id: 't10', name: 'T10', capacity: 2, zone: 'Terrasse', isActive: true },
];
