import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

// Champ texte (sans <form>). Liaison via model(), slot icône et état error optionnels.
@Component({
  selector: 'hk-input',
  imports: [HkIcon],
  template: `
    <div
      class="border-border focus-within:border-primary focus-within:ring-primary/30 bg-card flex h-9 items-center gap-2 rounded-sm border px-3 focus-within:ring-2"
      [class.border-st-cancelled-fg]="error()"
    >
      @if (icon()) {
        <hk-icon [name]="icon()!" [size]="16" class="text-text-subtle" />
      }
      <input
        [attr.id]="inputId()"
        class="placeholder:text-text-subtle text-foreground w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        (input)="onInput($event)"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkInput {
  readonly value = model('');
  // Identifiant du champ, pour le relier a un <label for>.
  readonly inputId = input<string>();
  readonly placeholder = input('');
  readonly icon = input<string>();
  readonly disabled = input(false);
  readonly error = input(false);

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
