import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TableService } from './table.service';
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
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
});
