import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { CallbackRequest } from '@core/models/callback-request.model';

// Bloc « tâches urgentes » : demandes de rappel à traiter par le staff (US 1.7).
// Volontairement distinct de la liste des réservations et mis en avant en ambre.
@Component({
  selector: 'hk-callback-requests',
  imports: [HkIcon, HkButton, HkIconButton],
  template: `
    @if (requests().length > 0) {
      <section class="rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5">
        <div class="mb-3 flex items-center gap-2">
          <span
            class="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"
          >
            <hk-icon name="lucidePhoneCall" [size]="16" />
          </span>
          <h2 class="text-sm font-semibold text-amber-900">Demandes de rappel</h2>
          <span
            class="ml-auto rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 tabular-nums"
          >
            {{ requests().length }}
          </span>
        </div>

        <ul class="flex flex-col gap-2">
          @for (req of requests(); track req.id) {
            <li class="bg-card flex items-center gap-3 rounded-md border border-amber-200 p-3">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="text-foreground truncate text-sm font-medium">
                  {{ req.customerName }}
                </span>
                <span class="text-muted-foreground truncate text-xs">
                  {{ req.reason }} · demandé à {{ time(req.requestedAt) }}
                </span>
              </div>
              <a
                class="text-primary hidden font-mono text-sm tabular-nums sm:block"
                [href]="'tel:' + req.phone"
              >
                {{ req.phone }}
              </a>
              <hk-button size="sm" (click)="callBack.emit(req)">
                <hk-icon name="lucidePhone" [size]="14" />
                Rappeler
              </hk-button>
              <hk-icon-button
                icon="lucideCheck"
                label="Marquer la demande comme traitée"
                (click)="handled.emit(req)"
              />
            </li>
          }
        </ul>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkCallbackRequests {
  readonly requests = input<CallbackRequest[]>([]);

  readonly callBack = output<CallbackRequest>();
  readonly handled = output<CallbackRequest>();

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}
