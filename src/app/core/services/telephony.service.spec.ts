import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '@env/environment';
import { TelephonyService } from './telephony.service';

describe('TelephonyService', () => {
  let service: TelephonyService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TelephonyService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getForwarding : GET /telephony/forwarding avec le restaurant', async () => {
    const promise = firstValueFrom(service.getForwarding('r1'));

    const req = http.expectOne((r) => r.url.endsWith('/telephony/forwarding'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('restaurantId')).toBe('r1');
    req.flush({ did: '+33974067183', mode: 'front_line', ringSeconds: 5, verifiedAt: null });

    expect(await promise).toEqual({
      did: '+33974067183',
      mode: 'front_line',
      ringSeconds: 5,
      verifiedAt: null,
    });
  });

  // L'endpoint n'existe pas encore côté backend : un 404 ne doit pas casser l'écran.
  it('getForwarding : retombe sur le DID de développement si le backend répond 404', async () => {
    const promise = firstValueFrom(service.getForwarding('r1'));

    http
      .expectOne((r) => r.url.endsWith('/telephony/forwarding'))
      .flush(null, { status: 404, statusText: 'Not Found' });

    const result = await promise;
    expect(result?.did ?? null).toBe(environment.forwardingDid || null);
  });

  it('updateForwarding : PUT avec le mode et le délai', async () => {
    const promise = firstValueFrom(
      service.updateForwarding('r1', { mode: 'safety_net', ringSeconds: 10 }),
    );

    const req = http.expectOne((r) => r.url.endsWith('/telephony/forwarding'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ mode: 'safety_net', ringSeconds: 10 });
    req.flush({ did: '+33974067183', mode: 'safety_net', ringSeconds: 10, verifiedAt: null });
    await promise;
  });
});
