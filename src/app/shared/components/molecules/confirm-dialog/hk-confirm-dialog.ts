import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { HkButton } from '@shared/components/atoms/button/hk-button';

export interface ConfirmDialogContext {
  title: string;
  message: string;
  confirmLabel: string;
}

// Boite de confirmation d'une action irreversible (annuler une reservation...).
// Une seule question, deux boutons, le bouton dangereux nomme l'action.
@Component({
  selector: 'hk-confirm-dialog',
  imports: [HkButton],
  template: `
    <div class="flex flex-col gap-4" data-testid="confirm-dialog">
      <h2 class="text-text-strong text-lg font-semibold">{{ ctx.title }}</h2>
      <p class="text-text-subtle text-sm">{{ ctx.message }}</p>
      <div class="flex justify-end gap-2">
        <hk-button variant="secondary" data-testid="confirm-dialog-cancel" (click)="close(false)">
          Retour
        </hk-button>
        <hk-button variant="danger" data-testid="confirm-dialog-ok" (click)="close(true)">
          {{ ctx.confirmLabel }}
        </hk-button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkConfirmDialog {
  protected readonly ctx = injectBrnDialogContext<ConfirmDialogContext>();
  private readonly ref = inject<BrnDialogRef<boolean>>(BrnDialogRef);

  protected close(confirmed: boolean): void {
    this.ref.close(confirmed);
  }
}

// Ouvre la boite et repond vrai seulement si l'utilisateur a clique le bouton d'action.
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialogs = inject(HlmDialogService);

  ask(context: ConfirmDialogContext): Observable<boolean> {
    const ref = this.dialogs.open(HkConfirmDialog, { context, contentClass: 'max-w-md' });
    return (ref.closed$ as Observable<boolean | undefined>).pipe(map((r) => r === true));
  }
}
