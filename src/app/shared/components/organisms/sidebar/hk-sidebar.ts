import { ChangeDetectionStrategy, Component, inject, computed, effect } from '@angular/core';
import { HkNavItem } from '@shared/components/molecules/nav-item/hk-nav-item';
import { HkProfileMenu } from '@shared/components/molecules/profile-menu/hk-profile-menu';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { SessionService } from '@core/services/session.service';
import { RestaurantService } from '@core/services/restaurant.service';
import { AuthService } from '@core/services/auth.service';
import { LayoutService } from '@core/services/layout.service';
import { NAV_ITEMS } from '@core/layout/nav-items';

// Sidebar du shell : logo, navigation, profil en bas, bouton replier/déplier.
@Component({
  selector: 'hk-sidebar',
  imports: [HkNavItem, HkProfileMenu, HkIconButton, HkIcon],
  template: `
    <aside
      class="bg-sidebar border-border flex h-full flex-col border-r transition-[width] duration-200"
      [class]="collapsed() ? 'w-16' : 'w-60'"
    >
      <div class="flex h-14 items-center gap-2 px-3" [class.justify-center]="collapsed()">
        @if (!collapsed()) {
          <span class="text-text-strong flex-1 text-lg font-semibold">Alloquence</span>
        }
        <hk-icon-button
          [icon]="collapsed() ? 'lucideChevronRight' : 'lucideChevronLeft'"
          label="Replier ou déplier la barre latérale"
          (click)="layout.toggleSidebar()"
        />
      </div>

      <nav class="flex flex-1 flex-col gap-1 p-2" aria-label="Navigation principale">
        @for (item of navItems; track item.route) {
          @if (item.children; as children) {
            <!-- GROUPE « en escalier » : le parent est un intitule (pas un lien),
                 les enfants naviguent, indentes sous un trait vertical. Replie :
                 le parent disparait, les enfants restent (icone + tooltip). -->
            @if (!collapsed()) {
              <span
                class="text-text-muted flex h-8 items-center gap-3 px-3 text-xs font-semibold tracking-wide uppercase"
              >
                <hk-icon [name]="item.icon" [size]="16" />
                {{ item.label }}
              </span>
            }
            <div
              class="flex flex-col gap-1"
              [class]="collapsed() ? '' : 'border-border ml-5 border-l pl-2'"
            >
              @for (child of children; track child.route) {
                <hk-nav-item
                  [icon]="child.icon"
                  [label]="child.label"
                  [route]="child.route"
                  [collapsed]="collapsed()"
                />
              }
            </div>
          } @else {
            <hk-nav-item
              [icon]="item.icon"
              [label]="item.label"
              [route]="item.route"
              [collapsed]="collapsed()"
            />
          }
        }
      </nav>

      <div class="border-border border-t p-2">
        <hk-profile-menu
          [name]="displayName()"
          [restaurant]="restaurantName()"
          [collapsed]="collapsed()"
          (logout)="onLogout()"
        />
      </div>
    </aside>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkSidebar {
  constructor() {
    effect(() => {
      const id = this.session.restaurantId();
      if (id && !this.restaurants.restaurant()) {
        this.restaurants.loadRestaurant(id);
      }
    });
  }

  protected readonly layout = inject(LayoutService);
  private readonly session = inject(SessionService);
  private readonly restaurants = inject(RestaurantService);
  // Le compte connecte n'a pas de nom : on montre l'adresse, et le restaurant de la session.
  protected readonly displayName = computed(() => this.session.user()?.email ?? '');
  protected readonly restaurantName = computed(() => this.restaurants.restaurant()?.name ?? '');
  protected readonly collapsed = this.layout.sidebarCollapsed;
  protected readonly navItems = NAV_ITEMS;
  private readonly auth = inject(AuthService);

  protected onLogout(): Promise<void> {
    return this.auth.signOut();
  }
}
