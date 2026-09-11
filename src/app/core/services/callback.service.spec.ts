import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CallbackService } from './callback.service';
import { CallbackRequest } from '@core/models/callback-request.model';

// En test, environment.useMock vaut false : le back n'expose pas encore les demandes de
// rappel, la liste est donc vide et le bloc n'apparait pas. Les donnees de demonstration
// ne servent qu'en mode mock.
describe('CallbackService', () => {
  let service: CallbackService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(CallbackService);
  });

  it('hors mode mock, ne charge aucune demande de demonstration', async () => {
    service.loadPending();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.loading()).toBe(false);
    expect(service.error()).toBe(false);
    expect(service.callbacks()).toEqual([]);
  });

  it('markHandled sur un id inconnu n emet rien et ne change rien', async () => {
    const emitted: unknown[] = [];
    await new Promise<void>((resolve) => {
      service.markHandled('inconnu').subscribe({ next: (v) => emitted.push(v), complete: resolve });
    });
    expect(emitted).toEqual([]);
    expect(service.callbacks()).toEqual([]);
  });

  it('restore reinsere une demande en attente, triee par date', async () => {
    const older: CallbackRequest = {
      id: 'a',
      customerName: 'Karim',
      phone: '+33600000001',
      reason: 'test',
      requestedAt: '2026-09-12T10:00:00Z',
      status: 'handled',
    } as CallbackRequest;
    const newer: CallbackRequest = { ...older, id: 'b', requestedAt: '2026-09-12T11:00:00Z' };
    service.restore(newer);
    service.restore(older);
    expect(service.callbacks().map((c) => c.id)).toEqual(['a', 'b']);
    expect(service.callbacks().every((c) => c.status === 'pending')).toBe(true);
    await firstValueFrom(service.markHandled('a'));
    expect(service.callbacks().map((c) => c.id)).toEqual(['b']);
  });
});
