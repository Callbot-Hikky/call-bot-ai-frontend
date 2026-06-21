import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkNavItem } from '@shared/components/molecules/nav-item/hk-nav-item';
import { HkProfileMenu } from '@shared/components/molecules/profile-menu/hk-profile-menu';
import { NAV_ITEMS } from '@core/layout/nav-items';

// Sidebar en drawer sur mobile, via la primitive Spartan sheet (overlay + Echap natifs).
@Component({
  selector: 'hk-mobile-nav',
  imports: [...HlmSheetImports, BrnSheetContent, HkIcon, HkNavItem, HkProfileMenu],
  template: `
    <hlm-sheet #sheet="hlmSheet">
      <button
        hlmSheetTrigger
        side="left"
        class="text-foreground hover:bg-muted inline-flex size-9 cursor-pointer items-center justify-center rounded-sm transition-colors"
        aria-label="Ouvrir le menu"
      >
        <hk-icon name="lucideMenu" [size]="18" />
      </button>

      <hlm-sheet-content *brnSheetContent class="w-64 p-0">
        <div class="flex h-full flex-col">
          <div class="flex h-14 items-center px-4">
            <span class="text-text-strong text-lg font-semibold">Hikky</span>
          </div>
          <nav class="flex flex-1 flex-col gap-1 p-2" aria-label="Navigation principale">
            @for (item of navItems; track item.route) {
              <hk-nav-item
                [icon]="item.icon"
                [label]="item.label"
                [route]="item.route"
                (click)="sheet.close()"
              />
            }
          </nav>
          <div class="border-border border-t p-2">
            <hk-profile-menu name="Marie Lefèvre" restaurant="Le Bistrot du Coin" />
          </div>
        </div>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkMobileNav {
  protected readonly navItems = NAV_ITEMS;
}
