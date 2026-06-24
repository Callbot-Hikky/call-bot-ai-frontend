import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CallbackService } from './callback.service';

describe('CallbackService', () => {
  let service: CallbackService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(CallbackService);
  });

  it('charge les demandes de rappel en attente', async () => {
    expect(service.callbacks().length).toBe(0);
    service.loadPending();
    expect(service.loading()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(service.loading()).toBe(false);
    expect(service.callbacks().length).toBeGreaterThan(0);
    expect(service.callbacks().every((c) => c.status === 'pending')).toBe(true);
  });

  it('markHandled retire la demande traitée de la liste', async () => {
    service.loadPending();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const before = service.callbacks().length;
    const target = service.callbacks()[0];
    await firstValueFrom(service.markHandled(target.id));
    expect(service.callbacks().length).toBe(before - 1);
    expect(service.callbacks().find((c) => c.id === target.id)).toBeUndefined();
  });
});
