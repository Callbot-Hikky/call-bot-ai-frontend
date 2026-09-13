import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationService } from '@core/services/reservation.service';
import { SessionService } from '@core/services/session.service';
import { localDateKey } from '@core/utils/format';
import { bindDayToQuery } from './day-query';

@Component({ selector: 'app-host', template: '' })
class Host {
  constructor() {
    bindDayToQuery();
  }
}

const nextMonth = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return localDateKey(d);
})();

describe('bindDayToQuery', () => {
  const navigate = vi.fn().mockResolvedValue(true);
  const params = new Map<string, string>();
  const route = { snapshot: { queryParamMap: { get: (k: string) => params.get(k) ?? null } } };

  beforeEach(() => {
    navigate.mockClear();
    params.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: { restaurantId: () => 'rest-1' } },
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: { navigate } },
      ],
    });
  });

  it("lit le jour de l'URL au demarrage", async () => {
    params.set('jour', nextMonth);
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(TestBed.inject(ReservationService).day()).toBe(nextMonth);
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.includes('/reservations'))
      .flush([]);
  });

  it("ignore une valeur d'URL invalide ou hors bornes", async () => {
    params.set('jour', '0099-01-01');
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(TestBed.inject(ReservationService).day()).toBe(localDateKey());
  });

  it("ecrit le jour choisi dans l'URL, et le retire sur le jour courant", async () => {
    const fixture = TestBed.createComponent(Host);
    const service = TestBed.inject(ReservationService);
    await fixture.whenStable();
    expect(navigate).not.toHaveBeenCalled();
    service.setDay(nextMonth);
    await fixture.whenStable();
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { jour: nextMonth }, replaceUrl: true }),
    );
    params.set('jour', nextMonth);
    service.setDay(localDateKey());
    await fixture.whenStable();
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { jour: null } }),
    );
    TestBed.inject(HttpTestingController)
      .match(() => true)
      .forEach((r) => r.flush([]));
  });
});
