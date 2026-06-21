import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type HkButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type HkButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<HkButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-green-600 active:bg-green-700',
  secondary: 'bg-card text-foreground border border-border hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  danger: 'text-st-cancelled-fg border border-st-cancelled-fg hover:bg-st-cancelled-bg',
};

const SIZES: Record<HkButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

@Component({
  selector: 'hk-button',
  template: `
    <button [type]="type()" [disabled]="disabled()" [class]="classes()">
      <ng-content />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkButton {
  readonly variant = input<HkButtonVariant>('primary');
  readonly size = input<HkButtonSize>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);

  protected readonly classes = computed(() =>
    [
      'inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm font-medium',
      'transition-colors duration-150',
      'focus-visible:ring-primary focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
      'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
      VARIANTS[this.variant()],
      SIZES[this.size()],
    ].join(' '),
  );
}
