import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

type HkIconButtonVariant = 'ghost' | 'secondary';

const VARIANTS: Record<HkIconButtonVariant, string> = {
  ghost: 'text-foreground hover:bg-muted',
  secondary: 'bg-card text-foreground border border-border hover:bg-muted',
};

// Bouton carré, icône seule. aria-label obligatoire.
@Component({
  selector: 'hk-icon-button',
  imports: [HkIcon],
  template: `
    <button [class]="classes()" [attr.aria-label]="label()" [disabled]="disabled()">
      <hk-icon [name]="icon()" [size]="18" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkIconButton {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly variant = input<HkIconButtonVariant>('ghost');
  readonly disabled = input(false);

  protected readonly classes = computed(() =>
    [
      'inline-flex size-9 cursor-pointer items-center justify-center rounded-sm',
      'transition-colors duration-150',
      'focus-visible:ring-primary focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
      'disabled:cursor-not-allowed disabled:opacity-50',
      VARIANTS[this.variant()],
    ].join(' '),
  );
}
