import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { delay, map, tap } from 'rxjs/operators';

import { environment } from '@env/environment';
import { FloorTable, TableDto, mapTable } from '@core/models/table.model';

// Donnees de creation d'une table (POST /api/tables). Le restaurantId est ajoute
// par le service (celui de l'environnement).
export interface CreateTableInput {
  name: string;
  capacity: number;
  zone?: string | null;
}

// Champs modifiables d'une table (PUT /api/tables/{id}, corps complet reconstruit).
export interface UpdateTableInput {
  name?: string;
  capacity?: number;
  zone?: string | null;
}

// Corps attendu par le back (RestaurantTableRequest).
interface TableRequestBody {
  restaurantId: string;
  name: string;
  capacity: number;
  zone?: string | null;
  isActive?: boolean;
}

// Service des tables physiques du restaurant. Deux modes selon environment.useMock,
// comme ReservationService :
//  - mock : CRUD simule en memoire (aucun reseau), coherent avec MOCK_RESERVATIONS ;
//  - reel : CRUD complet /api/tables (JWT via l'interceptor existant).
// Les tables n'ont pas de position cote back : le plan de salle la gere (geometrie
// localStorage keyee par id, cf. FloorPlanService) avec repli auto-grille.
@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tables`;

  private readonly _tables = signal<FloorTable[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  // Seules les tables ACTIVES sont exposees (une table desactivee cote back ne
  // doit pas apparaitre sur le plan) — correctif A3.
  readonly tables = computed(() => this._tables().filter((t) => t.isActive !== false));
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  // Etat mock mutable (CRUD simule) : copie pour ne jamais modifier la constante.
  private mockTables: FloorTable[] = MOCK_TABLES.map((t) => ({ ...t }));
  private mockSeq = 100;

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
      return of(this.mockTables.map((t) => ({ ...t }))).pipe(delay(400));
    }
    // L'alimentation du signal est la responsabilite de loadTables (comme
    // ReservationService.getToday) : getTables reste un simple flux de donnees.
    const url = `${this.baseUrl}?restaurantId=${environment.restaurantId}`;
    return this.http.get<TableDto[]>(url).pipe(map((dtos) => dtos.map(mapTable)));
  }

  // Cree une VRAIE table cote back (POST /api/tables) et l'ajoute au signal.
  // Utilise par l'editeur (presets / rangee / duplication) : la table posee sur le
  // plan a donc un id back reel, exploitable par les reservations.
  create(input: CreateTableInput): Observable<FloorTable> {
    if (environment.useMock) {
      const table: FloorTable = {
        id: `t-mock-${++this.mockSeq}`,
        name: input.name,
        capacity: input.capacity,
        zone: input.zone ?? null,
        isActive: true,
      };
      return of(table).pipe(
        delay(150),
        tap((t) => {
          this.mockTables = [...this.mockTables, { ...t }];
          this._tables.update((list) => [...list, t]);
        }),
      );
    }
    const body: TableRequestBody = {
      restaurantId: environment.restaurantId,
      name: input.name,
      capacity: input.capacity,
      zone: input.zone ?? null,
      isActive: true,
    };
    return this.http.post<TableDto>(this.baseUrl, body).pipe(
      map(mapTable),
      tap((table) => this._tables.update((list) => [...list, table])),
    );
  }

  // Met a jour une table (PUT /api/tables/{id}, corps complet reconstruit depuis
  // l'etat courant + patch). Renomme / change les couverts depuis l'editeur.
  update(id: string, patch: UpdateTableInput): Observable<FloorTable> {
    const current = this._tables().find((t) => t.id === id);
    if (!current) {
      return throwError(() => new Error(`table ${id} inconnue`));
    }
    const next: FloorTable = {
      ...current,
      name: patch.name ?? current.name,
      capacity: patch.capacity ?? current.capacity,
      zone: patch.zone !== undefined ? patch.zone : current.zone,
    };
    if (environment.useMock) {
      return of(next).pipe(
        delay(150),
        tap((t) => {
          this.mockTables = this.mockTables.map((m) => (m.id === id ? { ...t } : m));
          this._tables.update((list) => list.map((m) => (m.id === id ? t : m)));
        }),
      );
    }
    const body: TableRequestBody = {
      restaurantId: environment.restaurantId,
      name: next.name,
      capacity: next.capacity,
      zone: next.zone ?? null,
      isActive: next.isActive,
    };
    return this.http.put<TableDto>(`${this.baseUrl}/${id}`, body).pipe(
      map(mapTable),
      tap((table) => this._tables.update((list) => list.map((m) => (m.id === id ? table : m)))),
    );
  }

  // Supprime une table (DELETE /api/tables/{id}) et la retire du signal.
  // Le garde-fou metier (reservations du jour encore placees dessus) est applique
  // EN AMONT par l'editeur : ici on ne fait que le transport.
  remove(id: string): Observable<void> {
    if (environment.useMock) {
      return of(void 0).pipe(
        delay(150),
        tap(() => {
          this.mockTables = this.mockTables.filter((m) => m.id !== id);
          this._tables.update((list) => list.filter((m) => m.id !== id));
        }),
      );
    }
    return this.http
      .delete<void>(`${this.baseUrl}/${id}`)
      .pipe(tap(() => this._tables.update((list) => list.filter((m) => m.id !== id))));
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
