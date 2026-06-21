import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HkNavItem } from '@shared/components/molecules/nav-item/hk-nav-item';
import { HkProfileMenu } from '@shared/components/molecules/profile-menu/hk-profile-menu';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { LayoutService } from '@core/services/layout.service';
import { ToastService } from '@core/services/toast.service';
import { NAV_ITEMS } from '@core/layout/nav-items';

// Sidebar du shell : logo, navigation, profil en bas, bouton replier/déplier.
@Component({
  selector: 'hk-sidebar',
  imports: [HkNavItem, HkProfileMenu, HkIconButton],
  template: `
    <aside
      class="bg-sidebar border-border flex h-full flex-col border-r transition-[width] duration-200"
      [class]="collapsed() ? 'w-16' : 'w-60'"
    >
      <div class="flex h-14 items-center gap-2 px-3" [class.justify-center]="collapsed()">
        @if (!collapsed()) {
          <span class="text-text-strong flex-1 text-lg font-semibold">Hikky</span>
        }
        <hk-icon-button
          [icon]="collapsed() ? 'lucideChevronRight' : 'lucideChevronLeft'"
          label="Replier ou déplier la barre latérale"
          (click)="layout.toggleSidebar()"
        />
      </div>

      <nav class="flex flex-1 flex-col gap-1 p-2" aria-label="Navigation principale">
        @for (item of navItems; track item.route) {
          <hk-nav-item
            [icon]="item.icon"
            [label]="item.label"
            [route]="item.route"
            [collapsed]="collapsed()"
          />
        }
      </nav>

      <div class="border-border border-t p-2">
        <hk-profile-menu
          name="Marie Lefèvre"
          restaurant="Le Bistrot du Coin"
          [collapsed]="collapsed()"
          (logout)="onLogout()"
        />
      </div>
    </aside>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkSidebar {
  protected readonly layout = inject(LayoutService);
  protected readonly collapsed = this.layout.sidebarCollapsed;
  protected readonly navItems = NAV_ITEMS;
  private readonly toast = inject(ToastService);

  protected onLogout(): void {
    this.toast.show('Déconnexion (démo)', 'default');
  }
}
