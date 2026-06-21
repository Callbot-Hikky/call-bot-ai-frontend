import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Spinner réservé aux actions ponctuelles (bouton en chargement), jamais pour une page.
@Component({
  selector: 'hk-spinner',
  template: `
    <span
      class="inline-block animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      [style.width.px]="size()"
      [style.height.px]="size()"
      role="status"
      aria-label="Chargement"
    ></span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkSpinner {
  readonly size = input(16);
}
