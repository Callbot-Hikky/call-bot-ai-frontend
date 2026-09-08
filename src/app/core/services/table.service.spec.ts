import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TableService } from './table.service';
import { SessionService } from './session.service';
import { TableDto } from '@core/models/table.model';

// En test, environment.useMock vaut false : on teste le chemin HTTP reel (GET /tables).
function tableDto(id: string, name: string, capacity: number): TableDto {
  return { id, restaurantId: 'rest-1', name, capacity, zone: 'Salle', isActive: true };
}

describe('TableService', () => {
  let service: TableService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { restaurantId: signal('rest-1') } },
      ],
    });
    service = TestBed.inject(TableService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('charge les tables et mappe le DTO backend', () => {
    service.loadTables();
    expect(service.loading()).toBe(true);
    const req = httpMock.expectOne((r) => r.url.includes('/tables'));
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toContain('restaurantId=');
    req.flush([tableDto('t1', 'T1', 2), tableDto('t2', 'T2', 4)]);

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe(false);
    expect(service.tables().length).toBe(2);
    expect(service.tables()[0].name).toBe('T1');
    expect(service.tables()[0].isActive).toBe(true);
  });

  it('passe en erreur si le GET echoue', () => {
    service.loadTables();
    httpMock
      .expectOne((r) => r.url.includes('/tables'))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    expect(service.error()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('ne renvoie que les tables actives (isActive !== false) - A3', () => {
    service.loadTables();
    const req = httpMock.expectOne((r) => r.url.includes('/tables'));
    req.flush([
      tableDto('t1', 'T1', 2),
      { ...tableDto('t2', 'T2', 4), isActive: false },
      // isActive absent -> considere actif.
      { id: 't3', restaurantId: 'rest-1', name: 'T3', capacity: 4 },
    ]);
    expect(service.tables().map((t) => t.id)).toEqual(['t1', 't3']);
  });

  it('create : POST /tables avec restaurantId + name + capacity, puis ajoute au signal', () => {
    let created = '';
    service.create({ name: 'T11', capacity: 4 }).subscribe((t) => (created = t.id));

    const req = httpMock.expectOne((r) => r.url.endsWith('/tables'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      restaurantId: 'rest-1',
      name: 'T11',
      capacity: 4,
      zone: null,
      isActive: true,
    });
    req.flush(tableDto('t-new', 'T11', 4));

    expect(created).toBe('t-new');
    expect(service.tables().some((t) => t.id === 't-new')).toBe(true);
  });

  it('update : PUT /tables/{id} avec le corps complet reconstruit', () => {
    // Etat initial : une table chargee.
    service.loadTables();
    httpMock.expectOne((r) => r.url.includes('/tables')).flush([tableDto('t1', 'T1', 2)]);

    service.update('t1', { name: 'Terrasse 1', capacity: 6 }).subscribe();
    const req = httpMock.expectOne((r) => r.url.endsWith('/tables/t1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      restaurantId: 'rest-1',
      name: 'Terrasse 1',
      capacity: 6,
      zone: 'Salle',
      isActive: true,
    });
    req.flush(tableDto('t1', 'Terrasse 1', 6));

    const t1 = service.tables().find((t) => t.id === 't1');
    expect(t1?.name).toBe('Terrasse 1');
    expect(t1?.capacity).toBe(6);
  });

  it('remove : DELETE /tables/{id} puis retire du signal', () => {
    service.loadTables();
    httpMock
      .expectOne((r) => r.url.includes('/tables'))
      .flush([tableDto('t1', 'T1', 2), tableDto('t2', 'T2', 4)]);

    service.remove('t1').subscribe();
    const req = httpMock.expectOne((r) => r.url.endsWith('/tables/t1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(service.tables().map((t) => t.id)).toEqual(['t2']);
  });
});
