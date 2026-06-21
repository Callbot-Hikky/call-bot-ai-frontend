import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HkAvatar } from '@shared/components/atoms/avatar/hk-avatar';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkTooltip } from '@shared/components/atoms/tooltip/hk-tooltip';

// Avatar + nom + restaurant, ouvre un menu Spartan. Replié = avatar seul + tooltip.
@Component({
  selector: 'hk-profile-menu',
  imports: [...HlmDropdownMenuImports, HkAvatar, HkIcon, HkTooltip],
  template: `
    <button
      type="button"
      class="hover:bg-muted flex w-full cursor-pointer items-center gap-3 rounded-sm p-2 transition-colors duration-150"
      [class.justify-center]="collapsed()"
      [hlmDropdownMenuTrigger]="menu"
      side="top"
      [hkTooltip]="collapsed() ? name() : ''"
      position="right"
    >
      <hk-avatar [name]="name()" size="sm" />
      @if (!collapsed()) {
        <span class="flex min-w-0 flex-1 flex-col text-left">
          <span class="text-foreground truncate text-sm font-medium">{{ name() }}</span>
          <span class="text-muted-foreground truncate text-xs">{{ restaurant() }}</span>
        </span>
        <hk-icon name="lucideChevronDown" [size]="16" class="text-text-subtle" />
      }
    </button>

    <ng-template #menu>
      <div hlmDropdownMenu>
        <button hlmDropdownMenuItem (click)="profile.emit()">
          <hk-icon name="lucideUsers" [size]="16" />
          Profil
        </button>
        <button hlmDropdownMenuItem (click)="settings.emit()">
          <hk-icon name="lucideSettings" [size]="16" />
          Paramètres
        </button>
        <hlm-dropdown-menu-separator />
        <button hlmDropdownMenuItem (click)="logout.emit()">
          <hk-icon name="lucideLogOut" [size]="16" />
          Déconnexion
        </button>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkProfileMenu {
  readonly name = input.required<string>();
  readonly restaurant = input('');
  readonly collapsed = input(false);
  readonly profile = output<void>();
  readonly settings = output<void>();
  readonly logout = output<void>();
}
