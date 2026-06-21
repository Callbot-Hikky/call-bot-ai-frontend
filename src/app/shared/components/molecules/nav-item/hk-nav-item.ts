import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkTooltip } from '@shared/components/atoms/tooltip/hk-tooltip';

// Élément de navigation de la sidebar. Replié = icône seule + tooltip du libellé.
@Component({
  selector: 'hk-nav-item',
  imports: [HkIcon, HkTooltip],
  template: `
    <a
      class="relative flex h-10 items-center gap-3 rounded-sm px-3 text-sm font-medium transition-colors duration-150"
      [class]="active() ? 'bg-green-100 text-green-700' : 'text-foreground hover:bg-muted'"
      [class.justify-center]="collapsed()"
      [attr.aria-current]="active() ? 'page' : null"
      [hkTooltip]="collapsed() ? label() : ''"
      position="right"
    >
      @if (active()) {
        <span
          class="bg-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full"
        ></span>
      }
      <hk-icon [name]="icon()" [size]="18" />
      @if (!collapsed()) {
        <span>{{ label() }}</span>
      }
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkNavItem {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly active = input(false);
  readonly collapsed = input(false);
}
