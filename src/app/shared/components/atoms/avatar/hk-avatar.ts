import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type HkAvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<HkAvatarSize, string> = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
};

// Avatar rond : image si fournie, sinon initiales sur fond neutre.
@Component({
  selector: 'hk-avatar',
  template: `
    @if (src()) {
      <img
        [src]="src()!"
        [alt]="name()"
        class="border-border rounded-full border object-cover"
        [class]="sizeClass()"
      />
    } @else {
      <span
        class="bg-muted text-text-muted border-border inline-flex items-center justify-center rounded-full border font-medium"
        [class]="sizeClass()"
      >
        {{ initials() }}
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkAvatar {
  readonly src = input<string>();
  readonly name = input('');
  readonly size = input<HkAvatarSize>('md');

  protected readonly sizeClass = computed(() => SIZES[this.size()]);
  protected readonly initials = computed(() =>
    this.name()
      .split(' ')
      .map((part) => part.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  );
}
