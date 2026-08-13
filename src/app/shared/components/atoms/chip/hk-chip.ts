import { Component, input, output } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

@Component({
  selector: 'hk-chip',
  imports: [HkIcon],
  template: `
    <div class="bg-secondary inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
      {{ label() }}

      <button
        type="button"
        class="hover:text-destructive flex items-center justify-center"
        [attr.aria-label]="'Retirer ' + label()"
        (click)="delete.emit(label())"
      >
        <hk-icon name="lucideX" [size]="14" />
      </button>
    </div>
  `,
})
export class HkChip {
  label = input.required<string>();

  delete = output<string>();
}
