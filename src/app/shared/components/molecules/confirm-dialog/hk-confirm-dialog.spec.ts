import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmService } from './hk-confirm-dialog';

describe('ConfirmService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  });

  it('repond vrai sur le bouton d action, faux sur Retour', async () => {
    const service = TestBed.inject(ConfirmService);
    const answer = firstValueFrom(
      service.ask({
        title: 'Annuler ?',
        message: 'Irréversible.',
        confirmLabel: 'Annuler la réservation',
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    const ok = document.querySelector<HTMLElement>('[data-testid="confirm-dialog-ok"] button');
    expect(document.body.textContent).toContain('Annuler ?');
    ok!.click();
    expect(await answer).toBe(true);

    const second = firstValueFrom(
      service.ask({ title: 'Encore ?', message: 'x', confirmLabel: 'Oui' }),
    );
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector<HTMLElement>('[data-testid="confirm-dialog-cancel"] button')!.click();
    expect(await second).toBe(false);
  });
});
