import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkTooltip } from '@shared/components/atoms/tooltip/hk-tooltip';

// Élément de navigation. Actif via le routeur (route fournie) ou via l'input `active`
// (utile pour la démo). Replié = icône seule + tooltip du libellé.
@Component({
  selector: 'hk-nav-item',
  imports: [RouterLink, RouterLinkActive, HkIcon, HkTooltip],
  template: `
    <a
      [routerLink]="route()"
      routerLinkActive
      #rla="routerLinkActive"
      class="relative flex h-10 items-center gap-3 rounded-sm px-3 text-sm font-medium transition-colors duration-150"
      [class]="rla.isActive || active() ? 'hk-flame text-white' : 'text-foreground hover:bg-muted'"
      [class.justify-center]="collapsed()"
      [attr.aria-current]="rla.isActive || active() ? 'page' : null"
      [hkTooltip]="collapsed() ? label() : ''"
      position="right"
    >
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
  readonly route = input<string>();
  readonly active = input(false);
  readonly collapsed = input(false);
}
